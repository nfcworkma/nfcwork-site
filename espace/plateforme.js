(function () {
  "use strict";
  // Admin NFCWORK : contrôle des restaurants visibles sur la plateforme publique /commander.
  // Lit/écrit la liste globale settings/menus. Chaque entrée peut porter un flag `plateforme` (bool) ;
  // visible par défaut si actif et non archivé. L'ordre de la liste = l'ordre d'affichage public.
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
  const NOW = () => firebase.firestore.FieldValue.serverTimestamp();
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = { resto: "🍽", boutique: "🛍", salon: "💈", hotel: "🏨", location: "🚗" };

  let user = null, liste = [], det = {}, saving = false;

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
    try {
      const d = await db.doc("settings/menus").get();
      liste = d.exists ? JSON.parse(d.data().json || "[]") : [];
    } catch (e) { console.error(e); liste = []; toast("Lecture impossible.", true); }
    liste = liste.filter(m => m && m.slug && !m.corb && !m.arch);
    render();
    liste.forEach(async m => {
      try {
        const f = await db.doc("settings/menu-" + m.slug).get();
        if (!f.exists) return;
        const o = JSON.parse(f.data().json || "{}");
        det[m.slug] = { type: o.type || "resto", logo: o.logo || "", livraison: o.livraison || {}, nom: o.nom || m.nom };
        majLigne(m.slug);
        if (o.logo) chargerLogo(m.slug, o.logo);
      } catch (e) {}
    });
  }

  async function chargerLogo(slug, id) {
    let url = "";
    if (id.startsWith("u:")) url = "https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=120&q=70";
    else if (id.startsWith("/")) url = id;
    else if (!id.startsWith("o:")) {
      try { const f = await db.doc("settings/mimg-" + id).get(); const d = f.exists && f.data().data; if (d && String(d).startsWith("data:image/")) url = d; } catch (e) {}
    }
    if (!url) return;
    const el = app.querySelector('.pf-logo[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(slug) : slug) + '"]');
    if (el) { el.style.backgroundImage = "url(" + url + ")"; el.textContent = ""; }
  }

  const estVisible = m => m.plateforme !== false;

  function ligneHTML(m, i) {
    const d = det[m.slug] || {}, vis = estVisible(m);
    const em = TYPES[d.type] || "🍽";
    const liv = d.livraison && d.livraison.actif;
    return '<div class="pf-row' + (vis ? "" : " off") + '" data-row="' + esc(m.slug) + '">' +
      '<div class="pf-ord"><button data-up="' + i + '"' + (i === 0 ? " disabled" : "") + '>▲</button><button data-down="' + i + '"' + (i === liste.length - 1 ? " disabled" : "") + '>▼</button></div>' +
      '<div class="pf-logo" data-slug="' + esc(m.slug) + '">' + em + '</div>' +
      '<div class="pf-info"><div class="pf-nm">' + esc(d.nom || m.nom || m.slug) + '</div>' +
      '<div class="pf-meta"><span>' + esc(m.slug) + '</span>' + (liv ? '<span class="on">🛵 Livraison</span>' : '<span>🍽 Sur place</span>') + (vis ? '<span class="on">● Visible</span>' : '<span class="no">● Masqué</span>') + '</div></div>' +
      '<button class="sw" data-toggle="' + esc(m.slug) + '" aria-pressed="' + vis + '" title="Afficher sur la plateforme"></button>' +
      '<div class="pf-acts"><a href="menus.html#m=' + encodeURIComponent(m.slug) + '" title="Modifier">✏️<span class="lbl"> Modifier</span></a>' +
      '<a href="/menu/' + encodeURIComponent(m.slug) + '" target="_blank" rel="noopener" title="Voir">👁</a></div>' +
      '</div>';
  }

  function render() {
    if (!liste.length) {
      app.innerHTML = '<div class="empty paper"><h3>Aucun restaurant</h3><p>Créez un menu pour qu\'il apparaisse sur la plateforme.</p><a class="btn primary" href="menus.html">➕ Ajouter un restaurant</a></div>';
      return;
    }
    const nbVis = liste.filter(estVisible).length;
    app.innerHTML = '<div class="pf-head"><div><h2>Plateforme livraison</h2><div class="pf-count">' + nbVis + ' / ' + liste.length + ' visibles sur nfcwork.ma/commander</div></div>' +
      '<a class="btn primary" href="menus.html">➕ Ajouter un restaurant</a></div>' +
      '<div class="pf-list">' + liste.map(ligneHTML).join("") + '</div>' +
      '<div class="pf-foot"><a class="btn" href="/commander" target="_blank" rel="noopener">👁 Voir la plateforme publique</a></div>';
    brancher();
  }

  function majLigne(slug) {
    const row = app.querySelector('[data-row="' + (window.CSS && CSS.escape ? CSS.escape(slug) : slug) + '"]');
    if (!row) return;
    const i = liste.findIndex(m => m.slug === slug);
    if (i < 0) return;
    const tmp = document.createElement("div"); tmp.innerHTML = ligneHTML(liste[i], i);
    row.replaceWith(tmp.firstChild);
    brancher();
  }

  function brancher() {
    app.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggle(b.dataset.toggle));
    app.querySelectorAll("[data-up]").forEach(b => b.onclick = () => bouger(+b.dataset.up, -1));
    app.querySelectorAll("[data-down]").forEach(b => b.onclick = () => bouger(+b.dataset.down, 1));
  }

  async function sauver() {
    if (saving) return;
    saving = true;
    try { await db.doc("settings/menus").set({ json: JSON.stringify(liste), maj: NOW(), par: user.email }); }
    catch (e) { console.error(e); toast(e && e.code === "permission-denied" ? "Refusé : connectez-vous en admin." : "Échec de l'enregistrement.", true); }
    saving = false;
  }

  function toggle(slug) {
    const m = liste.find(x => x.slug === slug); if (!m) return;
    m.plateforme = m.plateforme === false ? true : false;
    majLigne(slug);
    // mettre à jour le compteur sans tout reconstruire
    const c = app.querySelector(".pf-count"); if (c) c.textContent = liste.filter(estVisible).length + " / " + liste.length + " visibles sur nfcwork.ma/commander";
    sauver();
    toast(m.plateforme === false ? "Masqué de la plateforme" : "Visible sur la plateforme");
  }

  function bouger(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= liste.length) return;
    const t = liste[i]; liste[i] = liste[j]; liste[j] = t;
    render();
    sauver();
  }
})();
