(function () {
  "use strict";
  // Ncommandiw — application client (shell + onglets). Modèle : 0 commission, cash/virement, WhatsApp.
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/settings/";
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = { resto: ["🍽", "Restaurant · Café"], boutique: ["🛍", "Boutique"], salon: ["💈", "Salon · Beauté"], hotel: ["🏨", "Hôtel"], location: ["🚗", "Location"] };
  let VILLES = [
    { id: "kenitra", nom: "Kénitra", actif: true }, { id: "rabat", nom: "Rabat", actif: false },
    { id: "tanger", nom: "Tanger", actif: false }, { id: "casablanca", nom: "Casablanca", actif: false },
    { id: "marrakech", nom: "Marrakech", actif: false }
  ];
  const imgCache = {};
  const tx = v => (v && typeof v === "object") ? (v.fr || v.ar || Object.values(v).find(x => typeof x === "string" && x) || "") : (v || "");
  let ALL = null, VILLE = "kenitra", Q = "";

  // ---------- storage ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  // ---------- compte (Firebase Auth) ----------
  const FB = window.firebase;
  if (FB && !FB.apps.length && window.FIREBASE_CONFIG) FB.initializeApp(window.FIREBASE_CONFIG);
  const auth = FB ? FB.auth() : null;
  const fdb = FB ? FB.firestore() : null;
  let ME = null; // { uid, email, nom, tel, photo }
  const profil = () => ME || { nom: "", tel: "", photo: "", email: "" };
  async function saveClient(patch) {
    if (!ME) return; Object.assign(ME, patch);
    if (fdb && ME.uid) { try { await fdb.collection("clients").doc(ME.uid).set(patch, { merge: true }); } catch (e) {} }
  }
  // choisir + réduire une photo (data-URI, max 256px) stockée en local
  function pickPhoto(cb) {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.onchange = () => { const f = i.files && i.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { const img = new Image(); img.onload = () => { const s = 256, k = Math.min(1, s / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); try { cb(c.toDataURL("image/jpeg", 0.82)); } catch (e) { toast("Photo trop lourde"); } }; img.src = r.result; };
      r.readAsDataURL(f); };
    i.click();
  }
  const orders = () => LS.get("ncw-orders", []);

  // ---------- theme ----------
  function applyTheme() {
    const t = LS.get("ncw-theme", "");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  applyTheme();

  // ---------- firestore ----------
  async function lire(id) { try { const r = await fetch(DOC + id, { cache: "no-store" }); if (!r.ok) return null; return (await r.json()).fields || {}; } catch (e) { return null; } }
  function parse(f) { try { return JSON.parse((f && f.json && f.json.stringValue) || "{}"); } catch (e) { return {}; } }
  // réglages de plateforme (villes + couleur) pilotés par l'admin
  let pfLoaded = false, PF_SERVICES = {}, PF_ANNONCE = null, PF_PROMOS = [];
  function applyAccent(hex) { if (/^#[0-9a-fA-F]{6}$/.test(hex)) document.documentElement.style.setProperty("--accent", hex); }
  async function applyPlateforme() {
    if (pfLoaded) return; pfLoaded = true;
    try {
      const pf = parse(await lire("plateforme"));
      if (pf.villes && pf.villes.length) VILLES = pf.villes.map(v => ({ id: v.id, nom: v.nom, actif: !!v.actif }));
      if (pf.accent) applyAccent(pf.accent);
      PF_SERVICES = pf.services || {};
      PF_ANNONCE = (pf.annonce && pf.annonce.actif && pf.annonce.texte) ? pf.annonce : null;
      PF_PROMOS = Array.isArray(pf.promos) ? pf.promos : [];
    } catch (e) {}
  }
  // ---------- géolocalisation (demandée une fois à l'ouverture, partagée avec la page menu) ----------
  let geoAsked = false;
  function askGeo() {
    if (geoAsked) return; geoAsked = true;
    try {
      const cur = LS.get("ncw-geo", null);
      if (cur && cur.gps && (Date.now() - (cur.ts || 0) < 864e5)) return; // position fraîche (<24h) : on ne redemande pas
      if (!navigator.geolocation) return;
      const go = () => navigator.geolocation.getCurrentPosition(
        p => { LS.set("ncw-geo", { gps: p.coords.latitude.toFixed(6) + "," + p.coords.longitude.toFixed(6), ts: Date.now() }); },
        () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 });
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "geolocation" }).then(s => { if (s.state !== "denied") go(); }).catch(go);
      } else go();
    } catch (e) {}
  }
  function maintenanceEcran() {
    nav.hidden = true;
    app.innerHTML = '<div class="empty" style="min-height:85vh"><div><img src="/assets/img/ncommandiw-logo.svg" alt="" style="width:76px;height:76px;border-radius:19px;margin:0 auto 14px;display:block"><div class="em" style="font-size:44px">🚧</div><h2>Bientôt de retour</h2><p>Ncommandiw est en maintenance.<br>Reviens dans quelques instants.</p></div></div>';
  }
  async function photo(id) {
    if (!id) return "";
    if (id.startsWith("u:")) return "https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=160&q=70";
    if (id.startsWith("/")) return id;
    if (id.startsWith("o:")) return "";
    if (imgCache[id]) return imgCache[id];
    const f = await lire("mimg-" + id); const d = f && f.data && f.data.stringValue;
    if (d && d.startsWith("data:image/")) { imgCache[id] = d; return d; } return "";
  }

  // ---------- utils ----------
  let toastT;
  function toast(m) { const t = document.getElementById("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200); }
  const fmt = (n, d) => (Math.round((+n || 0) * 100) / 100) + " " + (d || "DH");
  function ouvert(ouv, ferm) {
    if (!ouv || !ferm || !/^\d{1,2}:\d{2}$/.test(ouv) || !/^\d{1,2}:\d{2}$/.test(ferm)) return null;
    const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = ouv.split(":").map(Number), [fh, fm] = ferm.split(":").map(Number);
    const o = oh * 60 + om, f = fh * 60 + fm;
    if (f === o) return true; if (f < o) return cur >= o || cur < f; return cur >= o && cur < f;
  }
  const hL = f => { if (!f) return ""; const [h, m] = f.split(":").map(Number); return m ? h + "h" + String(m).padStart(2, "0") : h + "h"; };
  const villeNom = id => (VILLES.find(v => v.id === id) || {}).nom || "Kénitra";

  // ---------- chargement restos ----------
  async function charger() {
    if (ALL) return;
    const lf = await lire("menus");
    let liste = [];
    try { liste = JSON.parse((lf && lf.json && lf.json.stringValue) || "[]"); } catch (e) {}
    liste = liste.filter(m => m && m.slug && m.actif !== false && !m.arch && !m.corb && m.plateforme !== false);
    const restos = [];
    for (const e of liste) {
      const f = await lire("menu-" + e.slug); if (!f) continue; const m = parse(f);
      if (m.actif === false) continue; const inf = m.infos || {};
      restos.push({ slug: e.slug, nom: m.nom || e.nom || e.slug, type: m.type || "resto", logo: m.logo || "", slogan: tx(m.slogan), livraison: m.livraison || {}, ville: (m.ville || inf.ville || "kenitra").toLowerCase(), ouv: inf.ouv || "", ferm: inf.ferm || "" });
    }
    ALL = restos;
  }

  // ---------- bottom nav ----------
  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    recherche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    commandes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    profil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'
  };
  const NAV = [["home", "Accueil"], ["recherche", "Recherche"], ["commandes", "Commandes"], ["profil", "Profil"]];
  function renderNav(active) {
    nav.hidden = false;
    nav.innerHTML = NAV.map(([id, lab]) => '<a href="#' + id + '" class="' + (id === active ? "on" : "") + '">' + ICONS[id] + '<span>' + lab + '</span></a>').join("");
  }

  // ---------- routeur ----------
  const TABS = ["home", "recherche", "commandes", "profil"];
  function route() {
    const h = (location.hash || "#home").slice(1);
    const r = h.split("?")[0] || "home";
    if (TABS.includes(r)) { renderNav(r); }
    if (r === "home" || r === "recherche") renderHome(r === "recherche");
    else if (r === "commandes") { renderNav("commandes"); renderOrders(); }
    else if (r === "profil") { renderNav("profil"); renderProfile(); }
    else if (r === "compte") { renderNav("profil"); renderCompte(); }
    else if (r === "reglages") { renderNav("profil"); renderReglages(); }
    else if (r === "messages") { renderNav("profil"); renderMessages(); }
    else { location.hash = "#home"; return; }
    window.scrollTo(0, 0);
  }

  // ---------- ACCUEIL / RECHERCHE ----------
  async function renderHome(focus) {
    app.innerHTML =
      '<div class="bar"><span id="brandtap" style="display:flex;align-items:center;gap:10px;cursor:pointer" title="Actualiser"><img src="/assets/img/ncommandiw-logo.svg" alt="" width="28" height="28" style="border-radius:8px">' +
      '<h1 class="wm">N<span class="ap">&rsquo;</span>commandiw</h1></span>' +
      '<button class="citybtn" id="citytop">📍 ' + esc(villeNom(VILLE)) + ' ▾</button></div>' +
      '<div class="hero">' + (focus ? "" : '<h2>Qu’est-ce qu’on commande ?</h2>') +
      '<div class="searchbar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input id="q" type="search" autocomplete="off" placeholder="Rechercher un restaurant, un plat…" value="' + esc(Q) + '"></div></div>' +
      '<div class="cities">' + VILLES.map(v => '<button class="citychip' + (v.id === VILLE ? " on" : "") + (v.actif ? "" : " lock") + '" data-ville="' + v.id + '" data-actif="' + (v.actif ? 1 : 0) + '">' + (v.actif ? "" : "🔒 ") + esc(v.nom) + '</button>').join("") + '</div>' +
      '<div class="csheet">' +
      (focus ? "" : '<div id="promos" class="promos-slot"></div>') +
      '<div class="pad" id="results"><div class="state"><div><div class="spin"></div></div></div></div>' +
      '</div>';

    const bt = document.getElementById("brandtap");
    if (bt) bt.addEventListener("click", () => location.reload());
    const qi = document.getElementById("q");
    if (qi) { qi.addEventListener("input", () => { Q = qi.value.trim(); paint(); }); if (focus) qi.focus(); }
    const ct = document.getElementById("citytop");
    if (ct) ct.addEventListener("click", villePicker);
    document.querySelectorAll("[data-ville]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.actif === "0") { toast("Bientôt à " + b.textContent.replace("🔒", "").trim() + " 🔒"); return; }
      VILLE = b.dataset.ville; const on = document.querySelector(".citychip.on"); if (on) on.classList.remove("on"); b.classList.add("on");
      const c = document.getElementById("citytop"); if (c) c.textContent = "📍 " + villeNom(VILLE) + " ▾"; paint(); paintPromos();
    }));
    await charger(); paint(); if (!focus) paintPromos(); askGeo();
  }

  // ---------- carrousel promos (haut de l'accueil) ----------
  let promoTimer = null;
  function paintPromos() {
    const box = document.getElementById("promos"); if (!box) return;
    if (promoTimer) { clearInterval(promoTimer); promoTimer = null; }
    if (!ALL || !PF_PROMOS.length) { box.innerHTML = ""; return; }
    const today = new Date().toISOString().slice(0, 10);
    const list = PF_PROMOS.map(p => {
      const sh = ALL.find(r => r.slug === p.slug);
      if (!sh || p.actif === false) return null;
      if (p.fin && p.fin < today) return null;
      if (sh.ville !== VILLE) return null;
      return { p: p, sh: sh };
    }).filter(Boolean);
    if (!list.length) { box.innerHTML = ""; return; }
    const card = o => {
      const p = o.p, sh = o.sh;
      const av = parseFloat(String(p.av).replace(",", ".")), ap = parseFloat(String(p.ap).replace(",", "."));
      const disc = (av && ap && av > ap) ? Math.round((1 - ap / av) * 100) : 0;
      const price = (av && ap) ? '<span class="pz"><s>' + esc(p.av) + ' DH</s> <b>' + esc(p.ap) + ' DH</b></span>' : (ap ? '<span class="pz"><b>' + esc(p.ap) + ' DH</b></span>' : '');
      return '<a class="promo-card" href="/menu/' + encodeURIComponent(sh.slug) + '">' +
        '<span class="promo-logo" data-slug="' + esc(sh.slug) + '">🍽</span>' +
        '<span class="promo-body"><span class="promo-shop">' + esc(sh.nom) + '</span>' +
        '<span class="promo-title">' + esc(p.titre || "Promo") + '</span>' + price + '</span>' +
        (disc ? '<span class="promo-badge">-' + disc + '%</span>' : '<span class="promo-badge hot">🔥</span>') + '</a>';
    };
    box.innerHTML = '<div class="sec hot">🔥 Promos de la semaine</div>' +
      '<div class="promo-track" id="ptrack">' + list.map(card).join("") + '</div>' +
      (list.length > 1 ? '<div class="promo-dots">' + list.map((_, i) => '<span' + (i === 0 ? ' class="on"' : '') + '></span>').join("") + '</div>' : '');
    list.forEach(async o => { const el = box.querySelector('.promo-logo[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(o.sh.slug) : o.sh.slug) + '"]'); if (!el || !o.sh.logo) return; const d = await photo(o.sh.logo); if (d) { el.style.backgroundImage = "url(" + d + ")"; el.textContent = ""; el.classList.add("img"); } });
    if (list.length > 1) {
      const track = document.getElementById("ptrack"), dots = box.querySelectorAll(".promo-dots span");
      let idx = 0;
      const go = i => { const cards = track.children; if (!cards.length) return; idx = (i + cards.length) % cards.length; const c = cards[idx]; track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: "smooth" }); dots.forEach((d, j) => d.classList.toggle("on", j === idx)); };
      promoTimer = setInterval(() => { if (!document.getElementById("ptrack")) { clearInterval(promoTimer); promoTimer = null; return; } go(idx + 1); }, 3500);
      track.addEventListener("scroll", () => { const cards = [].slice.call(track.children), mid = track.scrollLeft + track.offsetWidth / 2; let best = 0, bd = 1e9; cards.forEach((c, j) => { const cc = c.offsetLeft - track.offsetLeft + c.offsetWidth / 2, dd = Math.abs(cc - mid); if (dd < bd) { bd = dd; best = j; } }); idx = best; dots.forEach((d, j) => d.classList.toggle("on", j === best)); }, { passive: true });
    }
  }

  function villePicker() {
    const bg = document.createElement("div"); bg.className = "sheet-bg";
    bg.innerHTML = '<div class="sheet"><h3>Choisis ta ville</h3><div class="shs">Ncommandiw arrive dans tout le Maroc \u{1F1F2}\u{1F1E6}</div>' +
      VILLES.map(v => '<div class="vrow' + (v.id === VILLE ? " on" : "") + '" data-v="' + v.id + '" data-a="' + (v.actif ? 1 : 0) + '">' + (v.actif ? "📍" : "🔒") + " " + esc(v.nom) + (v.actif ? "" : '<span class="lock">Bientôt</span>') + '</div>').join("") + '</div>';
    document.body.appendChild(bg);
    const sh = bg.querySelector(".sheet");
    requestAnimationFrame(() => { bg.classList.add("show"); sh.classList.add("show"); });
    const close = () => { bg.classList.remove("show"); sh.classList.remove("show"); setTimeout(() => bg.remove(), 260); };
    bg.addEventListener("click", e => { if (e.target === bg) close(); });
    bg.querySelectorAll("[data-v]").forEach(r => r.onclick = () => {
      if (r.dataset.a === "0") { toast("Bientôt à " + villeNom(r.dataset.v) + " 🔒"); return; }
      VILLE = r.dataset.v; close(); renderHome(false);
    });
  }

  function paint() {
    const box = document.getElementById("results"); if (!box) return;
    if (!ALL) return;
    const vActif = (VILLES.find(v => v.id === VILLE) || {}).actif;
    if (!vActif) { box.innerHTML = '<div class="lockbox"><div><div class="em">🔒</div><h2>Bientôt à ' + esc(villeNom(VILLE)) + '</h2><p>Ncommandiw arrive très vite.<br>Pour l’instant, c’est à Kénitra.</p></div></div>'; return; }
    const q = Q.toLowerCase();
    const inVille = ALL.filter(r => r.ville === VILLE);
    let list = inVille;
    if (q) list = list.filter(r => (r.nom + " " + r.slogan + " " + (TYPES[r.type] ? TYPES[r.type][1] : "")).toLowerCase().includes(q));
    if (!inVille.length) { box.innerHTML = '<div class="empty"><div><div class="em">🍽</div><h2>Bientôt disponible</h2><p>Les restaurants partenaires arrivent très vite.</p></div></div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="sec">' + esc(villeNom(VILLE)) + '</div><div class="empty" style="min-height:26vh"><div><div class="em" style="font-size:40px">🔎</div><h2>Aucun résultat</h2></div></div>'; return; }
    box.innerHTML = '<div class="sec">' + list.length + ' établissement' + (list.length > 1 ? "s" : "") + ' · ' + esc(villeNom(VILLE)) + '</div>' + list.map(carte).join("") + pied();
    list.forEach(async r => { const el = box.querySelector('.logo[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(r.slug) : r.slug) + '"]'); if (!el) return; const d = await photo(r.logo); if (d) { el.style.backgroundImage = "url(" + d + ")"; el.textContent = ""; el.classList.add("img"); } });
  }
  function carte(r) {
    const t = TYPES[r.type] || TYPES.resto, em = t[0], ty = t[1];
    const liv = r.livraison && r.livraison.actif && PF_SERVICES.livraison !== false, op = ouvert(r.ouv, r.ferm);
    let tags = "";
    if (op === true) tags += '<span class="tag open">● Ouvert</span>';
    else if (op === false) tags += '<span class="tag closed">● Fermé</span>';
    if (op === true && r.ferm) tags += '<span class="tag hrs">🕒 jusqu’à ' + esc(hL(r.ferm)) + '</span>';
    tags += liv ? '<span class="tag liv">🛵 ' + (r.livraison.frais ? esc(String(r.livraison.frais)) + " DH" : "Livraison") + '</span>' : '<span class="tag hrs">🍽 Sur place</span>';
    return '<a class="rcard' + (op === false ? " off" : "") + '" href="/menu/' + encodeURIComponent(r.slug) + (liv ? "?livraison" : "") + '">' +
      '<span class="logo" data-slug="' + esc(r.slug) + '">' + em + '</span>' +
      '<span class="info"><span class="nm">' + esc(r.nom) + '</span><span class="ty">' + esc(r.slogan || ty) + '</span><span class="meta">' + tags + '</span></span><span class="chev">›</span></a>';
  }
  const pied = () => '<footer>Propulsé par <b>Ncommandiw</b> · une plateforme <a href="https://nfcwork.ma" target="_blank" rel="noopener">NFCWORK</a></footer>';

  // ---------- COMMANDES ----------
  function renderOrders() {
    const os = orders();
    let body;
    if (!os.length) {
      body = '<div class="empty"><div><div class="em">🧾</div><h2>Aucune commande</h2><p>Tes commandes passées sur Ncommandiw<br>apparaîtront ici.</p><a class="obtn p" href="#home" style="margin-top:14px;padding:10px 20px">Découvrir les restos</a></div></div>';
    } else {
      body = '<div class="pad">' + os.map(o => {
        const items = (o.items || []).map(i => (i.q ? i.q + "× " : "") + i.nom).join(", ");
        const suivi = o.id ? '/suivi/?s=' + encodeURIComponent(o.slug) + '&o=' + encodeURIComponent(o.id) : "";
        return '<div class="ocard"><span class="th" data-slug="' + esc(o.slug) + '">🍽</span><div class="oi">' +
          '<div class="on"><span>' + esc(o.nom) + '</span><span>' + fmt(o.total, o.devise) + '</span></div>' +
          '<div class="oit">' + esc(items || "Commande") + '</div>' +
          '<div class="ob">' + (o.date ? '<span class="ost">' + esc(dateLisible(o.date)) + '</span>' : "") +
          '<a class="obtn p" href="/menu/' + encodeURIComponent(o.slug) + '">Recommander</a>' +
          (suivi ? '<a class="obtn g" href="' + suivi + '">Suivre</a>' : "") + '</div></div></div>';
      }).join("") + pied() + '</div>';
    }
    app.innerHTML = '<div class="bar"><h1 class="wm">Commandes</h1></div>' + body;
    orders().forEach(async o => { const el = app.querySelector('.th[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(o.slug) : o.slug) + '"]'); if (!el || !o.logo) return; const d = await photo(o.logo); if (d) { el.style.backgroundImage = "url(" + d + ")"; el.textContent = ""; } });
  }
  function dateLisible(ts) { try { const d = new Date(ts); return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); } catch (e) { return ""; } }

  // ---------- PROFIL ----------
  function initiales(n) { n = (n || "").trim(); if (!n) return "👤"; return n.split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
  function renderProfile() {
    const p = profil();
    const rows = [
      ["📬", "Messages", "#messages", '<span id="msg-badge"></span>'],
      ["🧾", "Historique des commandes", "#commandes", ""],
      ["👤", "Mon compte", "#compte", ""],
      ["🎁", "Carte de fidélité", "@fidelite", "Bientôt"],
      ["📣", "Partager & gagner", "@partage", ""],
      ["⚙️", "Réglages", "#reglages", ""],
      ["❓", "Aide", "@aide", ""]
    ];
    app.innerHTML =
      '<div class="phead">' + (p.photo ? '<img class="av" src="' + esc(p.photo) + '" alt="" style="object-fit:cover">' : '<div class="av">' + esc(initiales(p.nom)) + '</div>') + '<div><div class="pn">' + esc(p.nom || "Invité") + '</div><div class="ps">' + (p.tel ? esc(p.tel) : "Ajoute tes infos pour suivre tes commandes") + '</div></div></div>' +
      '<div class="list" style="margin-top:14px">' + rows.map(([ic, lt, href, lv]) =>
        '<a class="lrow" data-go="' + href + '"><span class="ic">' + ic + '</span><span class="lt">' + lt + '</span>' + (lv ? '<span class="lv">' + lv + '</span>' : "") + '<span class="chev">›</span></a>'
      ).join("") + '</div>' + pied();
    app.querySelectorAll("[data-go]").forEach(a => a.addEventListener("click", () => {
      const g = a.dataset.go;
      if (g === "@fidelite") return toast("Carte de fidélité — bientôt 🎁");
      if (g === "@aide") return toast("Aide — contacte-nous sur WhatsApp");
      if (g === "@partage") { if (navigator.share) navigator.share({ title: "Ncommandiw", text: "Commande direct, 0 commission 🛵", url: location.origin }).catch(() => {}); else toast("Partage ce lien : " + location.origin); return; }
      location.hash = g;
    }));
    msgUnread().then(n => { const b = document.getElementById("msg-badge"); if (b && n > 0) { b.textContent = n; b.className = "badge"; } }).catch(() => {});
  }

  // ---------- COMPTE ----------
  function subHead(titre) { return '<div class="sub-bar"><button class="back" data-back>‹</button><h1>' + esc(titre) + '</h1></div>'; }
  function renderCompte() {
    const p = profil();
    const verif = !!(auth && auth.currentUser && auth.currentUser.emailVerified);
    const ava = p.photo
      ? '<img src="' + esc(p.photo) + '" style="width:88px;height:88px;border-radius:50%;object-fit:cover;box-shadow:var(--shadow)">'
      : '<div style="width:88px;height:88px;border-radius:50%;background:var(--accent-soft);display:grid;place-items:center;font-weight:900;font-size:28px;color:var(--accent)">' + esc(initiales(p.nom)) + '</div>';
    app.innerHTML = subHead("Mon compte") +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px 0 4px">' + ava +
      '<div style="display:flex;gap:8px"><button class="obtn g" id="c-photo">📷 ' + (p.photo ? "Changer" : "Ajouter une photo") + '</button>' + (p.photo ? '<button class="obtn g" id="c-photo-x">Retirer</button>' : "") + '</div></div>' +
      '<div class="list" style="margin-top:8px">' +
      '<label class="lrow" style="cursor:default"><span class="ic">👤</span><input id="c-nom" placeholder="Ton nom" value="' + esc(p.nom) + '" style="flex:1;border:none;background:none;outline:none;font:inherit;font-weight:700;font-size:15px;color:var(--fg)"></label>' +
      '<label class="lrow" style="cursor:default"><span class="ic">📱</span><input id="c-tel" type="tel" inputmode="tel" placeholder="Ton téléphone" value="' + esc(p.tel) + '" style="flex:1;border:none;background:none;outline:none;font:inherit;font-weight:700;font-size:15px;color:var(--fg)"></label>' +
      '<div class="lrow" style="cursor:default"><span class="ic">✉️</span><span class="lt" style="font-weight:600;color:var(--muted)">' + esc(p.email || "") + '</span>' + (verif ? '<span class="lv" style="color:var(--ok)">✓ vérifié</span>' : '<a id="c-verif" style="color:var(--accent);font-weight:700;cursor:pointer">Vérifier</a>') + '</div>' +
      (verif ? "" : '<p style="font-size:12px;color:var(--muted);margin:2px 2px 6px">Confirme ton e-mail pour sécuriser ton compte et pouvoir réinitialiser ton mot de passe.</p>') +
      '<button class="obtn p" id="c-save" style="width:100%;padding:13px;margin:6px 0 14px;font-size:15px">Enregistrer</button>' +
      '<a class="lrow danger" id="c-out"><span class="ic">↩</span><span class="lt">Se déconnecter</span></a>' +
      '</div>';
    bindBack();
    const vb = document.getElementById("c-verif");
    if (vb) vb.onclick = async () => { try { await auth.currentUser.sendEmailVerification({ url: location.origin + "/app/" }); toast("E-mail de vérification envoyé 📧"); } catch (e) { toast("Réessaie dans un moment"); } };
    const save = async (patch, msg, stay) => {
      const base = { nom: document.getElementById("c-nom") ? document.getElementById("c-nom").value.trim() : p.nom, tel: document.getElementById("c-tel") ? document.getElementById("c-tel").value.trim() : p.tel };
      await saveClient(Object.assign(base, patch || {}));
      if (msg) toast(msg); if (stay) renderCompte(); else location.hash = "#profil";
    };
    document.getElementById("c-photo").onclick = () => pickPhoto(d => save({ photo: d }, "Photo ajoutée ✓", true));
    const px = document.getElementById("c-photo-x"); if (px) px.onclick = () => save({ photo: "" }, "Photo retirée", true);
    document.getElementById("c-save").onclick = () => save({}, "Enregistré ✓", false);
    document.getElementById("c-out").onclick = () => { if (auth) auth.signOut(); toast("Déconnecté"); };
  }

  // ---------- MESSAGES (annonces des restos) ----------
  function slugsNoms() {
    const map = {}; orders().forEach(o => { if (o.slug && !map[o.slug]) map[o.slug] = o.nom || o.slug; }); return map;
  }
  async function chargerMessages() {
    if (!fdb) return [];
    try { await charger(); } catch (e) {}
    const map = {};
    (ALL || []).forEach(r => { if (r.slug) map[r.slug] = r.nom || r.slug; });
    const o2 = slugsNoms(); Object.keys(o2).forEach(s => { if (!map[s]) map[s] = o2[s]; });
    const slugs = Object.keys(map), out = [];
    await Promise.all(slugs.map(async s => {
      try {
        const snap = await fdb.collection("messages").doc(s).collection("liste").orderBy("date", "desc").limit(20).get();
        snap.forEach(d => { const m = d.data() || {}; out.push({ slug: s, nom: map[s], texte: m.texte || "", date: m.date || 0 }); });
      } catch (e) {}
    }));
    out.sort((a, b) => (b.date || 0) - (a.date || 0));
    if (PF_ANNONCE) out.unshift({ slug: "__ncw", nom: "Ncommandiw 🔔", texte: PF_ANNONCE.texte, date: PF_ANNONCE.date || Date.now() });
    return out;
  }
  async function msgUnread() {
    const seen = LS.get("ncw-msg-seen", 0);
    const all = await chargerMessages();
    return all.filter(m => (m.date || 0) > seen).length;
  }
  async function renderMessages() {
    app.innerHTML = subHead("Messages") + '<div class="pad" id="msgs"><div class="state"><div><div class="spin"></div></div></div></div>';
    bindBack();
    const box = document.getElementById("msgs");
    const all = await chargerMessages();
    LS.set("ncw-msg-seen", Date.now());
    const badge = document.getElementById("msg-badge"); if (badge) badge.remove();
    if (!all.length) { box.innerHTML = '<div class="empty"><div><div class="em">📬</div><h2>Aucun message</h2><p>Les restos chez qui tu commandes<br>t’écriront ici (promos, infos…).</p></div></div>'; return; }
    box.innerHTML = all.map(m =>
      '<div class="ocard" style="display:block"><div class="on" style="font-size:14px"><span>' + esc(m.nom) + '</span><span class="ost">' + esc(dateLisible(m.date)) + '</span></div>' +
      '<div style="font-size:14.5px;margin-top:6px;line-height:1.5">' + esc(m.texte) + '</div></div>'
    ).join("") + pied();
  }

  // ---------- REGLAGES ----------
  function renderReglages() {
    const th = LS.get("ncw-theme", "");
    app.innerHTML = subHead("Réglages") +
      '<div class="group-t">Apparence</div><div class="seg" id="seg-th">' +
      [["", "Auto"], ["light", "Clair"], ["dark", "Sombre"]].map(([v, n]) => '<button data-th="' + v + '" class="' + (th === v ? "on" : "") + '">' + n + '</button>').join("") + '</div>' +
      '<div class="group-t">Langue</div><div class="list"><a class="lrow"><span class="ic">🇫🇷</span><span class="lt">Français</span><span class="lv">Arabe bientôt</span></a></div>' +
      '<div class="group-t">À propos</div><div class="list"><a class="lrow"><span class="ic">ℹ️</span><span class="lt">Ncommandiw</span><span class="lv">v1 · by NFCWORK</span></a></div>';
    bindBack();
    document.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { LS.set("ncw-theme", b.dataset.th); applyTheme(); renderReglages(); });
  }

  function bindBack() { const b = app.querySelector("[data-back]"); if (b) b.onclick = () => { location.hash = "#profil"; }; }

  // ---------- connexion / inscription (Firebase Auth) ----------
  let AUTHMODE = "up"; // 'up' = créer un compte, 'in' = se connecter
  function authMsg(e) {
    const c = (e && e.code) || "";
    if (c.includes("email-already-in-use")) return "Cet e-mail a déjà un compte. Connecte-toi.";
    if (c.includes("invalid-email")) return "E-mail invalide.";
    if (c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("invalid-login")) return "E-mail ou mot de passe incorrect.";
    if (c.includes("user-not-found")) return "Aucun compte avec cet e-mail.";
    if (c.includes("weak-password")) return "Mot de passe trop faible (6 caractères min).";
    if (c.includes("too-many-requests")) return "Trop d'essais, réessaie plus tard.";
    if (c.includes("network")) return "Problème de connexion.";
    return "Une erreur est survenue. Réessaie.";
  }
  function renderAuth() {
    nav.hidden = true;
    const up = AUTHMODE === "up";
    app.innerHTML =
      '<div class="onb"><div class="onb-card">' +
      '<img class="onb-ico" src="/assets/img/ncommandiw-logo.svg" alt="" width="80" height="80">' +
      '<h1>' + (up ? "Bienvenue \u{1F44B}" : "Content de te revoir") + '</h1>' +
      '<p class="sub">' + (up ? "Crée ton compte Ncommandiw en 1 minute." : "Connecte-toi pour commander.") + '</p>' +
      '<div class="onb-form">' +
      (up ? '<label class="obf"><span>\u{1F464}</span><input id="au-nom" placeholder="Ton prénom" autocomplete="name"></label>' : "") +
      '<label class="obf"><span>✉️</span><input id="au-mail" type="email" inputmode="email" placeholder="E-mail" autocomplete="email"></label>' +
      (up ? '<label class="obf"><span>\u{1F4F1}</span><input id="au-tel" type="tel" inputmode="tel" placeholder="Téléphone" autocomplete="tel"></label>' : "") +
      '<label class="obf"><span>\u{1F512}</span><input id="au-pass" type="password" placeholder="Mot de passe" autocomplete="' + (up ? "new-password" : "current-password") + '"></label>' +
      '<p class="au-err" id="au-err" hidden></p>' +
      '<button class="obtn p" id="au-go" style="width:100%;padding:14px;font-size:16px;margin-top:2px">' + (up ? "Créer mon compte \u{1F680}" : "Se connecter") + '</button>' +
      (up ? "" : '<button class="onb-skip" id="au-forgot">Mot de passe oublié ?</button>') +
      '<div style="text-align:center;font-size:13.5px;color:var(--muted);margin-top:8px">' + (up ? "Déjà un compte ? " : "Pas encore de compte ? ") + '<a id="au-tog" style="color:var(--accent);font-weight:700;cursor:pointer">' + (up ? "Se connecter" : "Créer un compte") + '</a></div>' +
      '</div></div></div>';
    const err = m => { const e = document.getElementById("au-err"); if (e) { e.textContent = m; e.hidden = false; } };
    document.getElementById("au-tog").onclick = () => { AUTHMODE = up ? "in" : "up"; renderAuth(); };
    const fg = document.getElementById("au-forgot");
    if (fg) fg.onclick = async () => { const m = (document.getElementById("au-mail").value || "").trim(); if (!m) return err("Écris ton e-mail d'abord."); try { await auth.sendPasswordResetEmail(m, { url: location.origin + "/app/" }); toast("E-mail de réinitialisation envoyé 📧"); } catch (e) { err(authMsg(e)); } };
    document.getElementById("au-go").onclick = async () => {
      if (!auth) return err("Service indisponible, réessaie.");
      const mail = (document.getElementById("au-mail").value || "").trim(), pass = document.getElementById("au-pass").value || "";
      const b = document.getElementById("au-go"); b.disabled = true;
      try {
        if (up) {
          const nom = (document.getElementById("au-nom").value || "").trim(), tel = (document.getElementById("au-tel").value || "").trim();
          if (!nom) { b.disabled = false; return err("Ton prénom ?"); }
          if (pass.length < 6) { b.disabled = false; return err("Mot de passe : 6 caractères minimum."); }
          const cred = await auth.createUserWithEmailAndPassword(mail, pass);
          if (fdb) await fdb.collection("clients").doc(cred.user.uid).set({ nom: nom, tel: tel, email: mail, photo: "", cree: Date.now() });
          try { if (cred.user && cred.user.sendEmailVerification) await cred.user.sendEmailVerification({ url: location.origin + "/app/" }); } catch (e) {}
          toast("Compte créé 📧 Vérifie ton e-mail");
        } else {
          await auth.signInWithEmailAndPassword(mail, pass);
        }
        // onAuthStateChanged prend le relais
      } catch (e) { b.disabled = false; err(authMsg(e)); }
    };
  }

  // ---------- splash (logo + nom qui s'écrit) ----------
  function splash() {
    const sp = document.getElementById("splash"), el = document.getElementById("sp-type");
    if (!sp || !el) return;
    const S = "N'commandiw"; let i = 0;
    const tick = () => {
      i++;
      el.innerHTML = esc(S.slice(0, i)).replace("'", '<span class="ap">’</span>');
      if (i < S.length) setTimeout(tick, 95);
      else setTimeout(() => { sp.classList.add("hide"); setTimeout(() => { if (sp.parentNode) sp.remove(); }, 480); }, 620);
    };
    setTimeout(tick, 180);
  }

  window.addEventListener("hashchange", () => { if (ME) route(); });
  splash();

  if (auth) {
    auth.onAuthStateChanged(async u => {
      await applyPlateforme();
      if (PF_SERVICES.maintenance) return maintenanceEcran();
      if (!u) { ME = null; nav.hidden = true; renderAuth(); return; }
      ME = { uid: u.uid, email: u.email || "", nom: "", tel: "", photo: "" };
      if (fdb) { try { const d = await fdb.collection("clients").doc(u.uid).get(); if (d.exists) ME = Object.assign(ME, d.data()); } catch (e) {} }
      nav.hidden = false;
      if (!location.hash || location.hash === "#") location.hash = "#home";
      route();
    });
  } else {
    // Firebase indisponible : écran de connexion informatif
    renderAuth();
  }
})();
