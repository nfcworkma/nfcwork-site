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

  let user = null, liste = [], det = {}, livreurs = [], charikat = [], tab = "restos", saving = false;

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
    await Promise.all([chargerMenus(), chargerLivreurs(), chargerCharikat()]);
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
    const T = [["restos", "🍽 Restos"], ["charikat", "🏢 Sociétés"], ["commandes", "🧾 Commandes"], ["messages", "💬 Messages"]];
    app.innerHTML = '<div class="pf-tabs">' + T.map(t => '<button data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>').join("") + '</div><div id="tabc"></div>';
    app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; app.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === tab)); renderTab(); });
    renderTab();
  }
  function renderTab() {
    const c = document.getElementById("tabc");
    if (tab === "restos") renderRestos(c);
    else if (tab === "charikat") renderCharikat(c);
    else if (tab === "messages") renderMsg(c);
    else renderCommandes(c);
  }

  /* ===== onglet MESSAGES (annonces aux clients) ===== */
  function renderMsg(c) {
    c.innerHTML = '<div class="paper" style="padding:16px">' +
      '<h3 style="margin:0 0 6px">💬 Message aux clients</h3>' +
      '<p class="muted" style="font-size:13px;margin:0 0 12px">Le message apparaît dans l\'app (onglet Messages) des clients connectés qui ont déjà commandé chez ce resto.</p>' +
      '<label class="f">Restaurant<select id="m-slug">' + liste.map(m => '<option value="' + esc(m.slug) + '">' + esc(m.nom || m.slug) + '</option>').join("") + '</select></label>' +
      '<label class="f" style="margin-top:10px">Message<textarea id="m-txt" rows="4" maxlength="300" placeholder="Ex : Promo du jour 🌮 -20% sur les tacos ce soir !"></textarea></label>' +
      '<button class="btn primary" id="m-send" style="margin-top:10px">Envoyer</button>' +
      '<div id="m-list" style="margin-top:16px"></div></div>';
    const sel = document.getElementById("m-slug");
    async function load() {
      const slug = sel.value, box = document.getElementById("m-list"); if (!slug) return;
      box.innerHTML = '<div class="muted" style="font-size:13px">Chargement…</div>';
      try {
        const snap = await db.collection("messages").doc(slug).collection("liste").orderBy("date", "desc").limit(10).get();
        if (snap.empty) { box.innerHTML = '<div class="muted" style="font-size:13px">Aucun message envoyé.</div>'; return; }
        box.innerHTML = '<div class="muted" style="font-size:12px;font-weight:700;margin-bottom:6px">Derniers messages</div>' +
          snap.docs.map(d => { const m = d.data() || {}; return '<div style="background:#fff;border:1px solid #eee;border-radius:10px;padding:10px 12px;margin-bottom:8px"><div style="font-size:14px">' + esc(m.texte || "") + '</div><button class="btn sm" data-del="' + d.id + '" style="margin-top:6px">Supprimer</button></div>'; }).join("");
        box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { try { await db.collection("messages").doc(slug).collection("liste").doc(b.dataset.del).delete(); } catch (e) {} load(); });
      } catch (e) { box.innerHTML = '<div class="muted" style="font-size:13px">—</div>'; }
    }
    sel.onchange = load; load();
    document.getElementById("m-send").onclick = async () => {
      const slug = sel.value, txt = (document.getElementById("m-txt").value || "").trim();
      if (!txt) return toast("Écris un message", true);
      const b = document.getElementById("m-send"); b.disabled = true;
      try { await db.collection("messages").doc(slug).collection("liste").add({ texte: txt, date: Date.now(), par: user.email || "" }); document.getElementById("m-txt").value = ""; toast("Message envoyé ✓"); load(); }
      catch (e) { toast("Échec : " + (e.message || e), true); }
      b.disabled = false;
    };
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

  /* ===== onglet SOCIÉTÉS DE LIVRAISON ===== */
  async function chargerCharikat() {
    try { const d = await db.doc("settings/charikat").get(); charikat = d.exists ? JSON.parse(d.data().json || "[]") : []; }
    catch (e) { charikat = []; }
  }
  async function sauverCharikat() {
    try { await db.doc("settings/charikat").set({ json: JSON.stringify(charikat.map(s => { const r = Object.assign({}, s); delete r._open; return r; })), maj: NOW(), par: user.email }); }
    catch (e) { toast(e && e.code === "permission-denied" ? "Refusé : admin requis." : "Échec de l'enregistrement.", true); }
  }
  function renderCharikat(c) {
    c.innerHTML = '<div class="pf-head"><div class="pf-count">' + charikat.filter(s => s.actif !== false).length + ' société(s) · chacune a ses livreurs et ses restaurants</div></div>' +
      '<form id="scadd" class="pf-add"><input id="sc-n" placeholder="Nom de la société de livraison" maxlength="40" autocomplete="off" required><select id="sc-p" class="pf-sel"><option value="25">25% livreur</option><option value="50" selected>50%</option><option value="75">75%</option></select><button class="btn primary">➕ Ajouter</button></form>' +
      (charikat.length ? charikat.map(carteCharika).join("") : '<div class="empty paper" style="margin-top:12px"><p>Aucune société. Ajoutez-en une, puis liez-lui des livreurs et des restaurants (le contrat).</p></div>');
    c.querySelector("#scadd").onsubmit = e => {
      e.preventDefault();
      const n = c.querySelector("#sc-n").value.trim(); if (!n) return;
      const p = c.querySelector("#sc-p").value;
      charikat.unshift({ id: rid(), nom: n, tel: "", part: p, actif: true, restos: [], livreurs: [] });
      sauverCharikat(); renderCharikat(c); toast("Société ajoutée");
    };
    brancherCharika(c);
  }
  function carteCharika(s) {
    const nl = (s.livreurs || []).filter(l => l.actif !== false).length, nr = (s.restos || []).length, on = s.actif !== false, open = s._open;
    let h = '<div class="sc-card' + (on ? "" : " off") + '"><div class="sc-top"><div class="pf-logo">🏢</div>' +
      '<div class="pf-info"><div class="pf-nm">' + esc(s.nom) + '</div><div class="pf-meta"><span>' + esc(s.part || "50") + '% livreur</span><span>🛵 ' + nl + '</span><span>🏪 ' + nr + '</span>' + (on ? '<span class="on">● Active</span>' : '<span class="no">● Inactive</span>') + '</div></div>' +
      '<button class="sw" data-sca="' + s.id + '" aria-pressed="' + on + '"></button>' +
      '<div class="pf-acts"><button class="pf-del" data-sctoggle="' + s.id + '">' + (open ? "▲" : "⚙️") + '</button><button class="pf-del" data-scd="' + s.id + '">🗑</button></div></div>';
    if (open) {
      h += '<div class="sc-body"><div class="sc-lbl">🛵 Livreurs de la société</div>' +
        '<form class="pf-add sc-lvadd" data-scid="' + s.id + '"><input class="sc-lvn" placeholder="Nom du livreur" maxlength="40" autocomplete="off" required><input class="sc-lvt" type="tel" inputmode="tel" placeholder="Téléphone" maxlength="20" autocomplete="off"><button class="btn primary">➕</button></form>' +
        ((s.livreurs || []).length ? '<div class="pf-list">' + s.livreurs.map(l => ligneLivreurSoc(s.id, l)).join("") + '</div>' : '<p class="sc-mut">Aucun livreur pour l\'instant.</p>') +
        '<div class="sc-lbl">🏪 Restaurants liés (contrat)</div>' +
        (liste.length ? '<div class="sc-restos">' + liste.map(m => { const lk = (s.restos || []).includes(m.slug); return '<label class="sc-chk"><input type="checkbox" data-scresto="' + s.id + '" value="' + esc(m.slug) + '"' + (lk ? " checked" : "") + '> ' + esc((det[m.slug] || {}).nom || m.nom || m.slug) + '</label>'; }).join("") + '</div>' : '<p class="sc-mut">Aucun restaurant.</p>') +
        '</div>';
    }
    return h + '</div>';
  }
  function ligneLivreurSoc(sid, l) {
    const on = l.actif !== false;
    return '<div class="pf-row' + (on ? "" : " off") + '"><div class="pf-logo">🛵</div><div class="pf-info"><div class="pf-nm">' + esc(l.nom) + '</div><div class="pf-meta">' + (l.tel ? '<span>' + esc(l.tel) + '</span>' : '<span>—</span>') + (on ? '<span class="on">● Actif</span>' : '<span class="no">● Inactif</span>') + '</div></div><button class="sw" data-sclva="' + sid + '|' + l.id + '" aria-pressed="' + on + '"></button><div class="pf-acts"><button class="pf-del" data-sclvd="' + sid + '|' + l.id + '">🗑</button></div></div>';
  }
  function brancherCharika(c) {
    c.querySelectorAll("[data-sca]").forEach(b => b.onclick = () => { const s = charikat.find(x => x.id === b.dataset.sca); if (s) { s.actif = s.actif === false ? true : false; sauverCharikat(); renderCharikat(c); } });
    c.querySelectorAll("[data-sctoggle]").forEach(b => b.onclick = () => { const s = charikat.find(x => x.id === b.dataset.sctoggle); if (s) { s._open = !s._open; renderCharikat(c); } });
    c.querySelectorAll("[data-scd]").forEach(b => b.onclick = () => { if (!confirm("Supprimer cette société ?")) return; charikat = charikat.filter(x => x.id !== b.dataset.scd); sauverCharikat(); renderCharikat(c); toast("Société supprimée"); });
    c.querySelectorAll(".sc-lvadd").forEach(f => f.onsubmit = e => { e.preventDefault(); const s = charikat.find(x => x.id === f.dataset.scid); if (!s) return; const n = f.querySelector(".sc-lvn").value.trim(); if (!n) return; const t = f.querySelector(".sc-lvt").value.trim(); s.livreurs = s.livreurs || []; s.livreurs.unshift({ id: rid(), nom: n, tel: t, actif: true }); sauverCharikat(); renderCharikat(c); });
    c.querySelectorAll("[data-sclva]").forEach(b => b.onclick = () => { const p = b.dataset.sclva.split("|"), s = charikat.find(x => x.id === p[0]), l = s && (s.livreurs || []).find(x => x.id === p[1]); if (l) { l.actif = l.actif === false ? true : false; sauverCharikat(); renderCharikat(c); } });
    c.querySelectorAll("[data-sclvd]").forEach(b => b.onclick = () => { const p = b.dataset.sclvd.split("|"), s = charikat.find(x => x.id === p[0]); if (s) { s.livreurs = (s.livreurs || []).filter(x => x.id !== p[1]); sauverCharikat(); renderCharikat(c); } });
    c.querySelectorAll("[data-scresto]").forEach(cb => cb.onchange = () => { const s = charikat.find(x => x.id === cb.dataset.scresto); if (!s) return; s.restos = s.restos || []; const sl = cb.value; if (cb.checked) { if (!s.restos.includes(sl)) s.restos.push(sl); } else { s.restos = s.restos.filter(x => x !== sl); } sauverCharikat(); const card = cb.closest(".sc-card"); const meta = card && card.querySelector(".pf-meta span:nth-child(3)"); if (meta) meta.textContent = "🏪 " + s.restos.length; });
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
