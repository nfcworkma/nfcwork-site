(function () {
  "use strict";
  // Admin NFCWORK — centre de contrôle de la plateforme : Restos (visibilité/ordre),
  // Livreurs (pool central settings/livreurs), Commandes (vue d'ensemble, lecture seule).
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
  const NOW = () => firebase.firestore.FieldValue.serverTimestamp();
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = { resto: "🍽", boutique: "🛍", salon: "💈", hotel: "🏨", location: "🚗" };
  const STAT = { nouvelle: ["🔔", "Nouvelle"], cuisine: ["👨‍🍳", "En cuisine"], prete: ["📦", "Prête"], enroute: ["🛵", "En route"], livree: ["✅", "Livrée"], payee: ["💰", "Payée"], annulee: ["✖", "Annulée"] };
  const fmt = n => (Math.round((+n || 0) * 100) / 100) + " DH";
  const rid = () => Math.random().toString(36).slice(2, 9);

  let user = null, liste = [], det = {}, livreurs = [], tab = "restos", saving = false;

  function toast(msg, bad) {
    const t = document.getElementById("toast"); if (!t) return;
    t.textContent = msg; t.hidden = false; t.className = bad ? "bad" : "ok";
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  auth.onAuthStateChanged(u => {
    user = u;
    if (!u) return login();
    if ((u.email || "").toLowerCase() !== ADMIN) return refuse();
    charger();
  });

  function refuse() {
    app.innerHTML = '<div class="empty paper"><h3>Accès réservé</h3><p>Connectez-vous avec le compte administrateur NFCWORK.</p><button class="btn" id="out">Changer de compte</button></div>';
    const o = document.getElementById("out"); if (o) o.onclick = () => auth.signOut();
  }
  function login() {
    app.innerHTML = '<div class="auth paper"><h2>Connexion</h2><p class="muted">Compte administrateur NFCWORK.</p>' +
      '<form id="lf" class="stack"><label class="f">E-mail<input id="le" type="email" autocomplete="email" required></label>' +
      '<label class="f">Mot de passe<input id="lp" type="password" autocomplete="current-password" required></label>' +
      '<p class="err" id="lerr"></p><button class="btn primary">Se connecter</button></form></div>';
    document.getElementById("lf").onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true;
      try { await auth.signInWithEmailAndPassword(document.getElementById("le").value.trim(), document.getElementById("lp").value); }
      catch (x) { document.getElementById("lerr").textContent = "E-mail ou mot de passe incorrect."; b.disabled = false; }
    };
  }

  async function charger() {
    app.innerHTML = '<div class="empty"><h3>Chargement…</h3></div>';
    await Promise.all([chargerMenus(), chargerLivreurs()]);
    shell();
  }
  async function chargerMenus() {
    try { const d = await db.doc("settings/menus").get(); liste = d.exists ? JSON.parse(d.data().json || "[]") : []; }
    catch (e) { liste = []; toast("Lecture des menus impossible.", true); }
    liste = liste.filter(m => m && m.slug && !m.corb && !m.arch);
  }
  async function chargerLivreurs() {
    try { const d = await db.doc("settings/livreurs").get(); livreurs = d.exists ? JSON.parse(d.data().json || "[]") : []; }
    catch (e) { livreurs = []; }
  }

  /* ===== coquille + onglets ===== */
  function shell() {
    const T = [["restos", "🍽 Restaurants"], ["livreurs", "🛵 Livreurs"], ["commandes", "🧾 Commandes"]];
    app.innerHTML = '<div class="pf-tabs">' + T.map(t => '<button data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>').join("") + '</div><div id="tabc"></div>';
    app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; app.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === tab)); renderTab(); });
    renderTab();
  }
  function renderTab() {
    const c = document.getElementById("tabc");
    if (tab === "restos") renderRestos(c);
    else if (tab === "livreurs") renderLivreurs(c);
    else renderCommandes(c);
  }

  /* ===== onglet RESTOS ===== */
  const estVisible = m => m.plateforme !== false;
  function ligneResto(m, i) {
    const d = det[m.slug] || {}, vis = estVisible(m), em = TYPES[d.type] || "🍽", liv = d.livraison && d.livraison.actif;
    return '<div class="pf-row' + (vis ? "" : " off") + '" data-row="' + esc(m.slug) + '">' +
      '<div class="pf-ord"><button data-up="' + i + '"' + (i === 0 ? " disabled" : "") + '>▲</button><button data-down="' + i + '"' + (i === liste.length - 1 ? " disabled" : "") + '>▼</button></div>' +
      '<div class="pf-logo" data-slug="' + esc(m.slug) + '">' + em + '</div>' +
      '<div class="pf-info"><div class="pf-nm">' + esc(d.nom || m.nom || m.slug) + '</div>' +
      '<div class="pf-meta"><span>' + esc(m.slug) + '</span>' + (liv ? '<span class="on">🛵 Livraison</span>' : '<span>🍽 Sur place</span>') + (vis ? '<span class="on">● Visible</span>' : '<span class="no">● Masqué</span>') + '</div></div>' +
      '<button class="sw" data-toggle="' + esc(m.slug) + '" aria-pressed="' + vis + '"></button>' +
      '<div class="pf-acts"><a href="menus.html#m=' + encodeURIComponent(m.slug) + '">✏️</a><a href="/menu/' + encodeURIComponent(m.slug) + '" target="_blank" rel="noopener">👁</a></div></div>';
  }
  function renderRestos(c) {
    if (!liste.length) { c.innerHTML = '<div class="empty paper"><h3>Aucun restaurant</h3><a class="btn primary" href="menus.html">➕ Ajouter</a></div>'; return; }
    const nbVis = liste.filter(estVisible).length;
    c.innerHTML = '<div class="pf-head"><div class="pf-count">' + nbVis + ' / ' + liste.length + ' visibles sur <b>/commander</b></div><a class="btn primary" href="menus.html">➕ Ajouter</a></div>' +
      '<div class="pf-list">' + liste.map(ligneResto).join("") + '</div>';
    c.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggleResto(b.dataset.toggle));
    c.querySelectorAll("[data-up]").forEach(b => b.onclick = () => bouger(+b.dataset.up, -1));
    c.querySelectorAll("[data-down]").forEach(b => b.onclick = () => bouger(+b.dataset.down, 1));
    liste.forEach(m => { const d = det[m.slug]; if (d && d.logo) poseLogo(m.slug, d.logo); else chargerDetail(m.slug); });
  }
  async function chargerDetail(slug) {
    try {
      const f = await db.doc("settings/menu-" + slug).get(); if (!f.exists) return;
      const o = JSON.parse(f.data().json || "{}");
      det[slug] = { type: o.type || "resto", logo: o.logo || "", livraison: o.livraison || {}, nom: o.nom || "" };
      if (tab === "restos") { const row = app.querySelector('[data-row="' + cssEsc(slug) + '"]'); if (row) { const i = liste.findIndex(m => m.slug === slug); const tmp = document.createElement("div"); tmp.innerHTML = ligneResto(liste[i], i); row.replaceWith(tmp.firstChild); renderRestos(document.getElementById("tabc")); } }
    } catch (e) {}
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s; }
  async function poseLogo(slug, id) {
    let url = "";
    if (id.startsWith("u:")) url = "https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=120&q=70";
    else if (id.startsWith("/")) url = id;
    else if (!id.startsWith("o:")) { try { const f = await db.doc("settings/mimg-" + id).get(); const dd = f.exists && f.data().data; if (dd && String(dd).startsWith("data:image/")) url = dd; } catch (e) {} }
    if (!url) return;
    const el = app.querySelector('.pf-logo[data-slug="' + cssEsc(slug) + '"]'); if (el) { el.style.backgroundImage = "url(" + url + ")"; el.textContent = ""; }
  }
  async function sauverMenus() {
    if (saving) return; saving = true;
    try { await db.doc("settings/menus").set({ json: JSON.stringify(liste), maj: NOW(), par: user.email }); }
    catch (e) { toast(e && e.code === "permission-denied" ? "Refusé : connectez-vous en admin." : "Échec de l'enregistrement.", true); }
    saving = false;
  }
  function toggleResto(slug) {
    const m = liste.find(x => x.slug === slug); if (!m) return;
    m.plateforme = m.plateforme === false ? true : false;
    renderRestos(document.getElementById("tabc")); sauverMenus();
    toast(m.plateforme === false ? "Masqué de la plateforme" : "Visible sur la plateforme");
  }
  function bouger(i, dir) { const j = i + dir; if (j < 0 || j >= liste.length) return; const t = liste[i]; liste[i] = liste[j]; liste[j] = t; renderRestos(document.getElementById("tabc")); sauverMenus(); }

  /* ===== onglet LIVREURS ===== */
  function renderLivreurs(c) {
    c.innerHTML = '<div class="pf-head"><div class="pf-count">' + livreurs.filter(l => l.actif !== false).length + ' livreur(s) actif(s) · utilisés par la caisse pour l\'assignation</div></div>' +
      '<form id="lvadd" class="pf-add"><input id="lv-n" placeholder="Nom du livreur" maxlength="40" autocomplete="off" required><input id="lv-t" type="tel" inputmode="tel" placeholder="Téléphone" maxlength="20" autocomplete="off"><button class="btn primary">➕ Ajouter</button></form>' +
      (livreurs.length ? '<div class="pf-list">' + livreurs.map(ligneLivreur).join("") + '</div>' : '<div class="empty paper" style="margin-top:12px"><p>Aucun livreur. Ajoutez votre pool ci-dessus : il apparaîtra dans la caisse au moment d\'assigner une livraison.</p></div>');
    c.querySelector("#lvadd").onsubmit = e => {
      e.preventDefault();
      const n = c.querySelector("#lv-n").value.trim(), t = c.querySelector("#lv-t").value.trim();
      if (!n) return;
      livreurs.unshift({ id: rid(), nom: n, tel: t, actif: true });
      sauverLivreurs(); renderLivreurs(c); toast("Livreur ajouté");
    };
    c.querySelectorAll("[data-lva]").forEach(b => b.onclick = () => { const l = livreurs.find(x => x.id === b.dataset.lva); if (l) { l.actif = l.actif === false ? true : false; sauverLivreurs(); renderLivreurs(c); } });
    c.querySelectorAll("[data-lvd]").forEach(b => b.onclick = () => { livreurs = livreurs.filter(x => x.id !== b.dataset.lvd); sauverLivreurs(); renderLivreurs(c); toast("Livreur supprimé"); });
  }
  function ligneLivreur(l) {
    const on = l.actif !== false;
    return '<div class="pf-row' + (on ? "" : " off") + '"><div class="pf-logo">🛵</div>' +
      '<div class="pf-info"><div class="pf-nm">' + esc(l.nom) + '</div><div class="pf-meta">' + (l.tel ? '<span>' + esc(l.tel) + '</span>' : '<span>—</span>') + (on ? '<span class="on">● Actif</span>' : '<span class="no">● Inactif</span>') + '</div></div>' +
      '<button class="sw" data-lva="' + l.id + '" aria-pressed="' + on + '"></button>' +
      '<div class="pf-acts"><button class="pf-del" data-lvd="' + l.id + '" title="Supprimer">🗑</button></div></div>';
  }
  async function sauverLivreurs() {
    try { await db.doc("settings/livreurs").set({ json: JSON.stringify(livreurs), maj: NOW(), par: user.email }); }
    catch (e) { toast(e && e.code === "permission-denied" ? "Refusé : admin requis." : "Échec de l'enregistrement.", true); }
  }

  /* ===== onglet COMMANDES (vue d'ensemble, lecture seule) ===== */
  async function renderCommandes(c) {
    c.innerHTML = '<div class="empty"><div class="spin2"></div>Chargement des commandes du jour…</div>';
    const debut = new Date(); debut.setHours(0, 0, 0, 0);
    const all = [];
    await Promise.all(liste.map(async m => {
      try {
        const s = await db.collection("commandes").doc(m.slug).collection("liste").where("cree", ">=", debut).orderBy("cree", "desc").limit(40).get();
        s.forEach(doc => { const o = doc.data(); all.push({ slug: m.slug, nom: (det[m.slug] || {}).nom || m.nom || m.slug, num: o.num, statut: o.statut, mode: o.mode, total: o.total, pay: o.pay, livreurNom: o.livreurNom, d: o.cree && o.cree.toDate ? o.cree.toDate() : new Date() }); });
      } catch (e) {}
    }));
    all.sort((a, b) => b.d - a.d);
    const act = all.filter(o => o.statut !== "payee" && o.statut !== "annulee" && o.statut !== "livree");
    const ca = all.filter(o => o.statut === "payee" || o.statut === "livree").reduce((a, o) => a + (+o.total || 0), 0);
    const h = d => (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    c.innerHTML = '<div class="pf-stats"><div class="st"><b>' + all.length + '</b><span>commandes aujourd\'hui</span></div><div class="st"><b>' + act.length + '</b><span>en cours</span></div><div class="st"><b>' + fmt(ca) + '</b><span>encaissé</span></div></div>' +
      (all.length ? '<div class="pf-list">' + all.map(o => {
        const st = STAT[o.statut] || ["•", o.statut || ""];
        return '<div class="pf-row"><div class="pf-logo" style="font-size:16px">' + st[0] + '</div>' +
          '<div class="pf-info"><div class="pf-nm">' + esc(o.nom) + ' · <span style="color:var(--muted,#8a93a6)">N° ' + esc(o.num || "") + '</span></div>' +
          '<div class="pf-meta"><span>' + esc(st[1]) + '</span>' + (o.mode === "livraison" ? '<span class="on">🛵 Livraison</span>' : '<span>🍽 ' + esc(o.mode || "") + '</span>') + (o.pay === "virement" ? '<span>🏦 Virement</span>' : "") + (o.livreurNom ? '<span>🛵 ' + esc(o.livreurNom) + '</span>' : "") + '<span>🕒 ' + h(o.d) + '</span></div></div>' +
          '<div style="font-weight:700;white-space:nowrap">' + fmt(o.total) + '</div></div>';
      }).join("") + '</div>' : '<div class="empty paper"><p>Aucune commande aujourd\'hui.</p></div>');
  }
})();
