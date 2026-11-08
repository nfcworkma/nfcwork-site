(function () {
  "use strict";
  // Marketplace public Ncommandiw : liste des menus actifs, recherche, villes, ouvert/fermé.
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/settings/";
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = { resto: ["🍽", "Restaurant · Café"], boutique: ["🛍", "Boutique"], salon: ["💈", "Salon · Beauté"], hotel: ["🏨", "Hôtel"], location: ["🚗", "Location"] };
  const VILLES = [
    { id: "kenitra", nom: "Kénitra", actif: true },
    { id: "rabat", nom: "Rabat", actif: false },
    { id: "tanger", nom: "Tanger", actif: false },
    { id: "casablanca", nom: "Casablanca", actif: false },
    { id: "marrakech", nom: "Marrakech", actif: false }
  ];
  const imgCache = {};
  let ALL = [];           // tous les restos chargés
  let VILLE = "kenitra";  // ville sélectionnée
  let Q = "";             // recherche

  // ---------- utils ----------
  async function lire(id) {
    try { const r = await fetch(DOC + id, { cache: "no-store" }); if (!r.ok) return null; return (await r.json()).fields || {}; }
    catch (e) { return null; }
  }
  function parse(f) { try { return JSON.parse((f && f.json && f.json.stringValue) || "{}"); } catch (e) { return {}; } }
  async function photo(id) {
    if (!id) return "";
    if (id.startsWith("u:")) return "https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=160&q=70";
    if (id.startsWith("/")) return id;
    if (id.startsWith("o:")) return "";
    if (imgCache[id]) return imgCache[id];
    const f = await lire("mimg-" + id);
    const d = f && f.data && f.data.stringValue;
    if (d && d.startsWith("data:image/")) { imgCache[id] = d; return d; }
    return "";
  }
  let toastT;
  function toast(msg) {
    const t = document.getElementById("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show"); clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }
  // Ouvert maintenant ? null = horaires non définis
  function ouvert(ouv, ferm) {
    if (!ouv || !ferm || !/^\d{1,2}:\d{2}$/.test(ouv) || !/^\d{1,2}:\d{2}$/.test(ferm)) return null;
    const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = ouv.split(":").map(Number), [fh, fm] = ferm.split(":").map(Number);
    const o = oh * 60 + om, f = fh * 60 + fm;
    if (f === o) return true;              // 24h/24
    if (f < o) return cur >= o || cur < f; // passe minuit (ex 18:00 → 02:00)
    return cur >= o && cur < f;
  }
  function hLisible(ferm) {
    if (!ferm) return "";
    const [fh, fm] = ferm.split(":").map(Number);
    return fm ? (fh + "h" + String(fm).padStart(2, "0")) : (fh + "h");
  }

  function etat(html) { app.innerHTML = html; }

  // ---------- chargement ----------
  async function charger() {
    const lf = await lire("menus");
    if (lf === null) { etat('<div class="empty"><div><div style="font-size:48px">📡</div><h2>Connexion impossible</h2><p>Vérifiez votre connexion et réessayez.</p></div></div>'); return; }
    let liste = [];
    try { liste = JSON.parse((lf.json && lf.json.stringValue) || "[]"); } catch (e) {}
    liste = liste.filter(m => m && m.slug && m.actif !== false && !m.arch && !m.corb && m.plateforme !== false);

    const restos = [];
    for (const e of liste) {
      const f = await lire("menu-" + e.slug);
      if (!f) continue;
      const m = parse(f);
      if (m.actif === false) continue;
      const inf = m.infos || {};
      restos.push({
        slug: e.slug, nom: m.nom || e.nom || e.slug, type: m.type || "resto",
        logo: m.logo || "", slogan: m.slogan || "", livraison: m.livraison || {},
        ville: (m.ville || inf.ville || "kenitra").toLowerCase(),
        ouv: inf.ouv || "", ferm: inf.ferm || ""
      });
    }
    ALL = restos;
    rendre();
  }

  // ---------- rendu ----------
  function villeNom(id) { const v = VILLES.find(x => x.id === id); return v ? v.nom : "Kénitra"; }

  function rendre() {
    const chips = VILLES.map(v =>
      '<button class="citychip' + (v.id === VILLE ? " on" : "") + (v.actif ? "" : " lock") + '" data-ville="' + v.id + '" data-actif="' + (v.actif ? 1 : 0) + '">' +
      (v.actif ? "" : "🔒 ") + esc(v.nom) + '</button>'
    ).join("");

    etat(
      '<div class="bar"><img src="/assets/img/ncommandiw-logo.svg" alt="" width="28" height="28" style="border-radius:8px">' +
      '<h1 class="wm">N<span class="ap">&rsquo;</span>commandiw</h1>' +
      '<button class="citybtn" id="citytop">📍 ' + esc(villeNom(VILLE)) + ' ▾</button></div>' +
      '<div class="hero"><h2>Qu’est-ce qu’on commande ?</h2>' +
      '<div class="searchbar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input id="q" type="search" autocomplete="off" placeholder="Rechercher un restaurant, un plat…" value="' + esc(Q) + '"></div></div>' +
      '<div class="cities">' + chips + '</div>' +
      '<div class="pad" id="results"></div>'
    );

    const qi = document.getElementById("q");
    if (qi) qi.addEventListener("input", () => { Q = qi.value.trim(); paint(); });
    document.querySelectorAll("[data-ville]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.actif === "0") { toast("Bientôt à " + b.textContent.replace("🔒", "").trim() + " 🔒"); return; }
      VILLE = b.dataset.ville; rendre();
    }));
    const ct = document.getElementById("citytop");
    if (ct) ct.addEventListener("click", () => { const el = document.querySelector(".cities"); if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    paint();
  }

  function paint() {
    const box = document.getElementById("results"); if (!box) return;
    const vActif = (VILLES.find(v => v.id === VILLE) || {}).actif;
    if (!vActif) {
      box.innerHTML = '<div class="lockbox"><div><div class="em">🔒</div><h2>Bientôt à ' + esc(villeNom(VILLE)) + '</h2><p>Ncommandiw arrive très vite dans votre ville.<br>Pour l’instant, c’est dispo à Kénitra.</p></div></div>' + pied();
      return;
    }
    const q = Q.toLowerCase();
    let list = ALL.filter(r => r.ville === VILLE);
    if (q) list = list.filter(r => (r.nom + " " + r.slogan + " " + (TYPES[r.type] ? TYPES[r.type][1] : "")).toLowerCase().includes(q));

    if (!ALL.filter(r => r.ville === VILLE).length) {
      box.innerHTML = '<div class="empty"><div><div style="font-size:48px">🍽</div><h2>Bientôt disponible</h2><p>Les restaurants partenaires arrivent très vite.</p></div></div>' + pied();
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="sec">' + esc(villeNom(VILLE)) + '</div><div class="empty" style="min-height:30vh"><div><div style="font-size:40px">🔎</div><h2>Aucun résultat</h2><p>Essayez un autre nom.</p></div></div>' + pied();
      return;
    }

    box.innerHTML = '<div class="sec">' + list.length + ' établissement' + (list.length > 1 ? "s" : "") + ' · ' + esc(villeNom(VILLE)) + '</div>' +
      list.map(carte).join("") + pied();

    // logos
    list.forEach(async r => {
      const el = box.querySelector('.logo[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(r.slug) : r.slug) + '"]');
      if (!el) return;
      const d = await photo(r.logo);
      if (d) { el.style.backgroundImage = "url(" + d + ")"; el.textContent = ""; el.classList.add("img"); }
    });
  }

  function carte(r) {
    const t = TYPES[r.type] || TYPES.resto, em = t[0], ty = t[1];
    const liv = r.livraison && r.livraison.actif;
    const op = ouvert(r.ouv, r.ferm);
    let tags = "";
    if (op === true) tags += '<span class="tag open">● Ouvert</span>';
    else if (op === false) tags += '<span class="tag closed">● Fermé</span>';
    if (op === true && r.ferm) tags += '<span class="tag hrs">🕒 jusqu’à ' + esc(hLisible(r.ferm)) + '</span>';
    tags += liv
      ? '<span class="tag liv">🛵 ' + (r.livraison.frais ? esc(String(r.livraison.frais)) + " DH" : "Livraison") + '</span>'
      : '<span class="tag hrs">🍽 Sur place</span>';
    return '<a class="rcard' + (op === false ? " off" : "") + '" href="/menu/' + encodeURIComponent(r.slug) + (liv ? "?livraison" : "") + '">' +
      '<span class="logo" data-slug="' + esc(r.slug) + '">' + em + '</span>' +
      '<span class="info"><span class="nm">' + esc(r.nom) + '</span>' +
      '<span class="ty">' + esc(r.slogan || ty) + '</span>' +
      '<span class="meta">' + tags + '</span></span>' +
      '<span class="chev">›</span></a>';
  }

  function pied() {
    return '<footer>Propulsé par <b style="color:var(--accent)">Ncommandiw</b> · une plateforme <a href="https://nfcwork.ma" target="_blank" rel="noopener">NFCWORK</a></footer>';
  }

  charger();
})();
