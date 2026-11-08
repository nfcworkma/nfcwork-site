(function () {
  "use strict";
  // Ncommandiw — application client (shell + onglets). Modèle : 0 commission, cash/virement, WhatsApp.
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/settings/";
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = { resto: ["🍽", "Restaurant · Café"], boutique: ["🛍", "Boutique"], salon: ["💈", "Salon · Beauté"], hotel: ["🏨", "Hôtel"], location: ["🚗", "Location"] };
  const VILLES = [
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
  const profil = () => LS.get("ncw-profil", { nom: "", tel: "", photo: "" });
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
      '<div class="pad" id="results"><div class="state"><div><div class="spin"></div></div></div></div>';

    const bt = document.getElementById("brandtap");
    if (bt) bt.addEventListener("click", () => location.reload());
    const qi = document.getElementById("q");
    if (qi) { qi.addEventListener("input", () => { Q = qi.value.trim(); paint(); }); if (focus) qi.focus(); }
    document.querySelectorAll("[data-ville]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.actif === "0") { toast("Bientôt à " + b.textContent.replace("🔒", "").trim() + " 🔒"); return; }
      VILLE = b.dataset.ville; const on = document.querySelector(".citychip.on"); if (on) on.classList.remove("on"); b.classList.add("on");
      const c = document.getElementById("citytop"); if (c) c.textContent = "📍 " + villeNom(VILLE) + " ▾"; paint();
    }));
    await charger(); paint();
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
    const liv = r.livraison && r.livraison.actif, op = ouvert(r.ouv, r.ferm);
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
  }

  // ---------- COMPTE ----------
  function subHead(titre) { return '<div class="sub-bar"><button class="back" data-back>‹</button><h1>' + esc(titre) + '</h1></div>'; }
  function renderCompte() {
    const p = profil();
    const ava = p.photo
      ? '<img src="' + esc(p.photo) + '" style="width:88px;height:88px;border-radius:50%;object-fit:cover;box-shadow:var(--shadow)">'
      : '<div style="width:88px;height:88px;border-radius:50%;background:var(--accent-soft);display:grid;place-items:center;font-weight:900;font-size:28px;color:var(--accent)">' + esc(initiales(p.nom)) + '</div>';
    app.innerHTML = subHead("Mon compte") +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px 0 4px">' + ava +
      '<div style="display:flex;gap:8px"><button class="obtn g" id="c-photo">📷 ' + (p.photo ? "Changer" : "Ajouter une photo") + '</button>' + (p.photo ? '<button class="obtn g" id="c-photo-x">Retirer</button>' : "") + '</div></div>' +
      '<div class="list" style="margin-top:8px">' +
      '<label class="lrow" style="cursor:default"><span class="ic">👤</span><input id="c-nom" placeholder="Ton nom" value="' + esc(p.nom) + '" style="flex:1;border:none;background:none;outline:none;font:inherit;font-weight:700;font-size:15px;color:var(--fg)"></label>' +
      '<label class="lrow" style="cursor:default"><span class="ic">📱</span><input id="c-tel" type="tel" inputmode="tel" placeholder="Ton téléphone" value="' + esc(p.tel) + '" style="flex:1;border:none;background:none;outline:none;font:inherit;font-weight:700;font-size:15px;color:var(--fg)"></label>' +
      '<button class="obtn p" id="c-save" style="width:100%;padding:13px;margin:6px 0 14px;font-size:15px">Enregistrer</button>' +
      '<a class="lrow danger" id="c-out"><span class="ic">↩</span><span class="lt">Se déconnecter</span></a>' +
      '</div><p style="font-size:12px;text-align:center;padding:0 24px;color:var(--muted)">Tes infos restent sur ton téléphone. Elles servent à pré-remplir tes commandes.</p>';
    bindBack();
    const save = (patch, msg, stay) => { const cur = profil(); LS.set("ncw-profil", Object.assign({ nom: document.getElementById("c-nom") ? document.getElementById("c-nom").value.trim() : cur.nom, tel: document.getElementById("c-tel") ? document.getElementById("c-tel").value.trim() : cur.tel, photo: cur.photo }, patch || {})); if (msg) toast(msg); if (stay) renderCompte(); else location.hash = "#profil"; };
    document.getElementById("c-photo").onclick = () => pickPhoto(d => save({ photo: d }, "Photo ajoutée ✓", true));
    const px = document.getElementById("c-photo-x"); if (px) px.onclick = () => save({ photo: "" }, "Photo retirée", true);
    document.getElementById("c-save").onclick = () => save({}, "Enregistré ✓", false);
    document.getElementById("c-out").onclick = () => { LS.set("ncw-profil", { nom: "", tel: "", photo: "" }); toast("Déconnecté"); location.hash = "#profil"; };
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

  // ---------- onboarding (1re visite : on fait un profil d'abord) ----------
  function needsOnboard() { return !LS.get("ncw-onboarded", false); }
  function renderOnboarding() {
    const p = profil();
    nav.hidden = true;
    app.innerHTML =
      '<div class="onb">' +
      '<img class="onb-ico" src="/assets/img/ncommandiw-logo.svg" alt="" width="80" height="80">' +
      '<h1>Bienvenue \u{1F44B}</h1>' +
      '<p class="sub">On fait connaissance ? Ça sert juste à pré-remplir tes commandes — rien ne quitte ton téléphone.</p>' +
      '<div class="onb-form">' +
      '<label class="obf"><span>\u{1F464}</span><input id="ob-nom" placeholder="Ton prénom" value="' + esc(p.nom) + '" autocomplete="given-name"></label>' +
      '<label class="obf"><span>\u{1F4F1}</span><input id="ob-tel" type="tel" inputmode="tel" placeholder="Téléphone (facultatif)" value="' + esc(p.tel) + '"></label>' +
      '<button class="obtn p" id="ob-go" style="width:100%;padding:14px;font-size:16px;margin-top:4px">Commencer \u{1F680}</button>' +
      '<button class="onb-skip" id="ob-skip">Plus tard</button>' +
      '</div></div>';
    const fin = (skip) => {
      if (!skip) { const nom = (document.getElementById("ob-nom").value || "").trim(), tel = (document.getElementById("ob-tel").value || "").trim(); LS.set("ncw-profil", { nom: nom, tel: tel, photo: profil().photo || "" }); }
      LS.set("ncw-onboarded", true); nav.hidden = false; location.hash = "#home"; route();
    };
    document.getElementById("ob-go").onclick = () => fin(false);
    document.getElementById("ob-skip").onclick = () => fin(true);
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

  window.addEventListener("hashchange", () => { if (!needsOnboard()) route(); });
  if (needsOnboard()) renderOnboarding(); else route();
  splash();
})();
