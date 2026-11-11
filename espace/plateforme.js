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

  let user = null, liste = [], det = {}, livreurs = [], charikat = [], tab = "accueil", saving = false;

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
    const T = [["accueil", "📊 Tableau de bord"], ["restos", "🍽 Restos"], ["promos", "🔥 Promos"], ["charikat", "🏢 Sociétés"], ["comptes", "👥 Comptes"], ["commandes", "🧾 Commandes"], ["messages", "💬 Messages"], ["validations", "✅ Validations"], ["reglages", "⚙️ Réglages"]];
    app.innerHTML = '<div class="pf-tabs">' + T.map(t => '<button data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>').join("") + '</div><div id="tabc"></div>';
    app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; app.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === tab)); renderTab(); });
    renderTab();
  }
  function renderTab() {
    const c = document.getElementById("tabc");
    if (tab === "accueil") renderAccueil(c);
    else if (tab === "restos") renderRestos(c);
    else if (tab === "promos") renderPromos(c);
    else if (tab === "charikat") renderCharikat(c);
    else if (tab === "comptes") renderComptes(c);
    else if (tab === "messages") renderMsg(c);
    else if (tab === "validations") renderValidations(c);
    else if (tab === "reglages") renderReglagesAdmin(c);
    else renderCommandes(c);
  }

  /* ===== helpers partagés ===== */
  const numP = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? 0 : n; };
  const fmtP = n => Math.round(numP(n)).toLocaleString("fr-FR") + " DH";
  const debutJour = () => { const d = new Date(); if (d.getHours() < 5) d.setDate(d.getDate() - 1); d.setHours(5, 0, 0, 0); return d; };

  /* ===== onglet TABLEAU DE BORD ===== */
  async function renderAccueil(c) {
    c.innerHTML = '<div class="dash-wrap"><div class="muted" style="font-size:13px;padding:14px">Chargement des statistiques…</div></div>';
    const dj = debutJour();
    let cmd = 0, ca = 0, liv = 0, enc = 0;
    const perShop = [];
    await Promise.all(liste.map(async m => {
      let c0 = 0, ca0 = 0;
      try {
        const s = await db.collection("commandes").doc(m.slug).collection("liste").where("cree", ">=", dj).get();
        s.forEach(d => { const o = d.data(); if (o.statut === "annulee") return; cmd++; c0++; if (o.statut === "payee" || o.statut === "livree") { ca += numP(o.total); ca0 += numP(o.total); } else enc++; if (o.mode === "livraison") liv++; });
      } catch (e) {}
      perShop.push({ nom: m.nom || m.slug, ca: ca0, cmd: c0 });
    }));
    const actifs = perShop.filter(s => s.cmd > 0).sort((a, b) => b.ca - a.ca);
    const mx = Math.max(1, ...actifs.map(s => s.ca));
    const chart = actifs.length ? '<div class="dash-h">CA par commerce (aujourd\'hui)</div><div class="bars">' + actifs.map(s =>
      '<div class="bar-row"><div class="bar-lab">' + esc(s.nom) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + Math.round(s.ca / mx * 100) + '%"></div></div><div class="bar-val">' + fmtP(s.ca) + '</div></div>').join("") + '</div>' : "";
    let nClients = 0; try { const s = await db.collection("clients").limit(2000).get(); nClients = s.size; } catch (e) {}
    let nPend = 0; try { const s = await db.collection("verifications").where("statut", "==", "en_attente").get(); nPend = s.size; } catch (e) {}
    const kpi = (v, k, cls) => '<div class="kpi ' + (cls || "") + '"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
    c.innerHTML =
      '<div class="dash-wrap">' +
      '<div class="dash-h">Aujourd\'hui</div>' +
      '<div class="kpis">' +
      kpi(fmtP(ca), "💰 Chiffre d\'affaires", "big") +
      kpi(cmd, "🧾 Commandes") +
      kpi(enc, "⏳ En cours") +
      kpi(liv, "🛵 Livraisons") +
      '</div>' +
      chart +
      '<div class="dash-h">La plateforme</div>' +
      '<div class="kpis">' +
      kpi(liste.length, "🍽 Commerces") +
      kpi(nClients, "👤 Clients inscrits") +
      kpi(nPend, "📋 Dossiers à valider", nPend ? "warn" : "") +
      kpi(charikat.length, "🏢 Sociétés livraison") +
      '</div>' +
      '<button class="btn" id="dash-ref" style="margin-top:4px">↻ Actualiser</button>' +
      '</div>';
    const r = document.getElementById("dash-ref"); if (r) r.onclick = () => renderAccueil(c);
  }

  /* ===== onglet COMPTES (clients / livreurs / commerçants) ===== */
  let cfilter = "clients";
  async function renderComptes(c) {
    const segs = [["clients", "👤 Clients"], ["livreur", "🛵 Livreurs"], ["marchand", "🧾 Commerçants"]];
    const seg = '<div class="vseg">' + segs.map(s => '<button data-cf="' + s[0] + '" class="' + (cfilter === s[0] ? "on" : "") + '">' + s[1] + '</button>').join("") + '</div>';
    c.innerHTML = seg + '<div id="cbox"><div class="muted" style="font-size:13px;padding:14px">Chargement…</div></div>';
    c.querySelectorAll("[data-cf]").forEach(b => b.onclick = () => { cfilter = b.dataset.cf; renderComptes(c); });
    const box = document.getElementById("cbox");
    let rows = [];
    try {
      if (cfilter === "clients") {
        const s = await db.collection("clients").limit(2000).get();
        const fil = {}; s.forEach(d => { const p = (d.data() || {}).parrainPar; if (p) fil[p] = (fil[p] || 0) + 1; });
        s.forEach(d => { const o = d.data() || {}; rows.push({ id: d.id, col: "clients", nom: o.nom || "—", tel: o.tel || "", email: o.email || "", em: "👤", fil: fil[d.id] || 0, par: !!o.parrainPar }); });
      } else {
        const s = await db.collection("verifications").where("role", "==", cfilter).where("statut", "==", "valide").get();
        s.forEach(d => { const o = d.data() || {}; rows.push({ id: d.id, col: "verifications", nom: (cfilter === "livreur" ? o.nom : o.commerce) || "—", tel: o.tel || "", email: o.email || "", em: cfilter === "livreur" ? "🛵" : "🧾" }); });
      }
    } catch (e) { box.innerHTML = '<div class="paper" style="padding:16px"><b style="color:#C6472F">Erreur</b><p class="muted" style="font-size:13px">' + esc((e && e.message) || "") + '</p></div>'; return; }
    rows.sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
    if (!rows.length) { box.innerHTML = '<div class="paper" style="padding:22px;text-align:center"><div style="font-size:40px">👥</div><h3 style="margin:8px 0 2px">Aucun compte</h3><p class="muted" style="font-size:13px;margin:0">' + (cfilter === "clients" ? "Les clients inscrits apparaîtront ici." : "Validez des comptes depuis l'onglet Validations.") + '</p></div>'; return; }
    box.innerHTML = '<div class="muted" style="font-size:12px;font-weight:700;margin:0 2px 8px">' + rows.length + ' compte' + (rows.length > 1 ? "s" : "") + '</div><div class="pf-list">' +
      rows.map(r => '<div class="pf-row"><div class="pf-logo">' + r.em + '</div><div class="pf-info"><div class="pf-nm">' + esc(r.nom) + '</div><div class="pf-meta">' + (r.tel ? '<span>' + esc(r.tel) + '</span>' : '') + (r.email ? '<span>' + esc(r.email) + '</span>' : '') + (r.fil ? '<span class="on">🎁 ' + r.fil + ' parrainé' + (r.fil > 1 ? "s" : "") + '</span>' : '') + (r.par ? '<span>👥 parrainé</span>' : '') + '</div></div><button class="pf-del" data-del="' + esc(r.col) + '/' + esc(r.id) + '">🗑</button></div>').join("") + '</div>';
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!window.confirm("Supprimer définitivement ce compte ?")) return;
      try { await db.doc(b.dataset.del).delete(); toast("Supprimé"); renderComptes(c); } catch (e) { toast("Erreur : " + (e.message || e), true); }
    });
  }

  /* ===== onglet RÉGLAGES (villes + couleur d'accent de la plateforme) ===== */
  const VILLES_DEF = [{ id: "kenitra", nom: "Kénitra", actif: true }, { id: "rabat", nom: "Rabat", actif: false }, { id: "tanger", nom: "Tanger", actif: false }, { id: "casablanca", nom: "Casablanca", actif: false }, { id: "marrakech", nom: "Marrakech", actif: false }];
  let PF = null;
  async function chargerPF() {
    if (PF) return PF;
    try { const d = await db.doc("settings/plateforme").get(); PF = d.exists ? JSON.parse(d.data().json || "{}") : {}; } catch (e) { PF = {}; }
    if (!PF.villes || !PF.villes.length) PF.villes = JSON.parse(JSON.stringify(VILLES_DEF));
    if (!PF.accent) PF.accent = "#E07B0A";
    if (!PF.services) PF.services = { commandes: true, livraison: true, maintenance: false };
    if (!PF.annonce) PF.annonce = { texte: "", date: 0, actif: false };
    if (!Array.isArray(PF.promos)) PF.promos = [];
    if (!Array.isArray(PF.blocklist)) PF.blocklist = [];
    if (!PF.support) PF.support = { wa: "" };
    return PF;
  }
  const normTel = t => String(t == null ? "" : t).replace(/\D/g, "").replace(/^212/, "").replace(/^0/, "");
  async function savePF(btn) {
    if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = "Enregistrement…"; }
    try { await db.doc("settings/plateforme").set({ json: JSON.stringify({ villes: PF.villes, accent: PF.accent, services: PF.services, annonce: PF.annonce, promos: PF.promos, blocklist: PF.blocklist, support: PF.support }) }, { merge: true }); toast("Enregistré ✓"); }
    catch (e) { toast("Erreur : " + (e.message || e), true); }
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t || "Enregistrer"; }
  }
  async function renderReglagesAdmin(c) {
    await chargerPF();
    const villes = PF.villes.map((v, i) =>
      '<div class="pf-row"><div class="pf-info"><div class="pf-nm">' + esc(v.nom) + '</div><div class="pf-meta"><span>' + esc(v.id) + '</span>' + (v.actif ? '<span class="on">● Active</span>' : '<span class="no">🔒 Bientôt</span>') + '</div></div>' +
      '<button class="sw" data-ville="' + i + '" aria-pressed="' + (!!v.actif) + '"></button>' +
      '<button class="pf-del" data-vdel="' + i + '">✕</button></div>').join("");
    c.innerHTML =
      '<div class="paper" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 4px">🎨 Couleur de la plateforme</h3>' +
      '<p class="muted" style="font-size:13px;margin:0 0 12px">La couleur principale des apps (client, livreur, commerçant).</p>' +
      '<div style="display:flex;align-items:center;gap:12px"><input type="color" id="pf-accent" value="' + esc(PF.accent) + '" style="width:54px;height:40px;border:none;background:none;border-radius:10px">' +
      '<input class="pf-sel" id="pf-accent-h" value="' + esc(PF.accent) + '" style="flex:1;max-width:140px" maxlength="7">' +
      '<span class="pf-swatch" id="pf-sw" style="background:' + esc(PF.accent) + '"></span></div></div>' +
      '<div class="paper" style="padding:16px"><h3 style="margin:0 0 4px">🏙️ Villes</h3>' +
      '<p class="muted" style="font-size:13px;margin:0 0 12px">Active une ville pour l\'ouvrir aux clients.</p>' +
      '<div class="pf-list">' + villes + '</div>' +
      '<div class="pf-add" style="margin-top:12px"><input id="pf-vnom" placeholder="Nom de la ville"><button class="btn" id="pf-vadd">➕ Ajouter</button></div></div>' +
      '<div class="paper" style="padding:16px;margin-top:14px"><h3 style="margin:0 0 4px">🎛️ Services</h3><p class="muted" style="font-size:13px;margin:0 0 10px">Active ou coupe des services sur toute la plateforme.</p>' +
      '<div class="pf-row"><div class="pf-info"><div class="pf-nm">🧾 Commandes activées</div></div><button class="sw" data-svc="commandes" aria-pressed="' + (!!PF.services.commandes) + '"></button></div>' +
      '<div class="pf-row"><div class="pf-info"><div class="pf-nm">🛵 Livraison activée</div></div><button class="sw" data-svc="livraison" aria-pressed="' + (!!PF.services.livraison) + '"></button></div>' +
      '<div class="pf-row"><div class="pf-info"><div class="pf-nm">🚧 Mode maintenance</div><div class="pf-meta"><span>Ferme temporairement l\'app client</span></div></div><button class="sw" data-svc="maintenance" aria-pressed="' + (!!PF.services.maintenance) + '"></button></div></div>' +
      '<div class="paper" style="padding:16px;margin-top:14px"><h3 style="margin:0 0 4px">🔔 Annonce à tous les clients</h3><p class="muted" style="font-size:13px;margin:0 0 10px">Apparaît en haut des Messages de tous les clients.</p>' +
      '<textarea class="pf-sel" id="pf-ann" rows="3" maxlength="200" style="width:100%;resize:vertical" placeholder="Ex : 🎉 Ncommandiw arrive bientôt à Rabat !">' + esc(PF.annonce.texte || "") + '</textarea>' +
      '<div class="pf-row" style="margin-top:8px"><div class="pf-info"><div class="pf-nm">Afficher l\'annonce</div></div><button class="sw" data-ann aria-pressed="' + (!!PF.annonce.actif) + '"></button></div></div>' +
      '<div class="paper" style="padding:16px;margin-top:14px"><h3 style="margin:0 0 4px">📞 Numéro de support (WhatsApp)</h3><p class="muted" style="font-size:13px;margin:0 0 10px">Le numéro que les clients contactent depuis « Aide » et « Signaler un problème » dans l\'app.</p>' +
      '<input class="pf-sel" id="pf-sup" inputmode="tel" value="' + esc((PF.support && PF.support.wa) || "") + '" placeholder="Ex : 0612345678" style="width:100%"></div>' +
      '<div class="paper" style="padding:16px;margin-top:14px"><h3 style="margin:0 0 4px">🚫 Numéros bloqués</h3><p class="muted" style="font-size:13px;margin:0 0 10px">Un numéro bloqué ne peut plus passer de commande en livraison (commandes mzawra / clients à problème).</p>' +
      (PF.blocklist.length ? '<div class="pf-list">' + PF.blocklist.map((t, i) => '<div class="pf-row"><div class="pf-logo">🚫</div><div class="pf-info"><div class="pf-nm">' + esc(t) + '</div></div><button class="pf-del" data-bdel="' + i + '">✕</button></div>').join("") + '</div>' : '<p class="muted" style="font-size:13px;margin:0 0 8px">Aucun numéro bloqué.</p>') +
      '<div class="pf-add" style="margin-top:10px"><input id="pf-bnum" inputmode="tel" placeholder="Numéro à bloquer (ex : 0612345678)"><button class="btn" id="pf-badd">🚫 Bloquer</button></div></div>' +
      '<button class="btn primary" id="pf-save" style="margin-top:16px;width:100%">💾 Enregistrer les réglages</button>';
    const ac = document.getElementById("pf-accent"), ah = document.getElementById("pf-accent-h"), sw = document.getElementById("pf-sw");
    ac.oninput = () => { PF.accent = ac.value; ah.value = ac.value; sw.style.background = ac.value; };
    ah.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(ah.value)) { PF.accent = ah.value; ac.value = ah.value; sw.style.background = ah.value; } };
    c.querySelectorAll("[data-ville]").forEach(b => b.onclick = () => { const i = +b.dataset.ville; PF.villes[i].actif = !PF.villes[i].actif; renderReglagesAdmin(c); });
    c.querySelectorAll("[data-vdel]").forEach(b => b.onclick = () => { PF.villes.splice(+b.dataset.vdel, 1); renderReglagesAdmin(c); });
    document.getElementById("pf-vadd").onclick = () => {
      const nom = (document.getElementById("pf-vnom").value || "").trim(); if (!nom) return;
      const id = nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      PF.villes.push({ id: id || ("ville" + PF.villes.length), nom: nom, actif: false }); renderReglagesAdmin(c);
    };
    c.querySelectorAll("[data-svc]").forEach(b => b.onclick = () => { const k = b.dataset.svc; PF.services[k] = !PF.services[k]; b.setAttribute("aria-pressed", PF.services[k]); });
    const annTog = c.querySelector("[data-ann]"); if (annTog) annTog.onclick = () => { PF.annonce.actif = !PF.annonce.actif; annTog.setAttribute("aria-pressed", PF.annonce.actif); };
    const badd = document.getElementById("pf-badd");
    if (badd) badd.onclick = async () => {
      const raw = (document.getElementById("pf-bnum").value || "").trim();
      const n = normTel(raw);
      if (n.length < 9) return toast("Numéro invalide", true);
      if (PF.blocklist.some(x => normTel(x) === n)) return toast("Déjà bloqué", true);
      PF.blocklist.unshift(raw); await savePF(); renderReglagesAdmin(c);
    };
    c.querySelectorAll("[data-bdel]").forEach(b => b.onclick = async () => { PF.blocklist.splice(+b.dataset.bdel, 1); await savePF(); renderReglagesAdmin(c); });
    document.getElementById("pf-save").onclick = async () => {
      const txt = (document.getElementById("pf-ann").value || "").trim();
      if (txt !== PF.annonce.texte) PF.annonce.date = Date.now();
      PF.annonce.texte = txt;
      PF.support = { wa: (document.getElementById("pf-sup").value || "").trim() };
      await savePF(document.getElementById("pf-save"));
    };
  }

  /* ===== onglet PROMOS (carrousel payant de l'accueil client) ===== */
  async function renderPromos(c) {
    await chargerPF();
    const shops = liste.filter(m => m && m.slug);
    const nomDe = slug => { const m = shops.find(x => x.slug === slug); return (m && m.nom) || slug; };
    const today = new Date().toISOString().slice(0, 10);
    const rows = PF.promos.map((p, i) => {
      const exp = p.fin && p.fin < today;
      const badges = [];
      badges.push(p.actif === false ? '<span class="no">⏸ En pause</span>' : (exp ? '<span class="no">⌛ Expirée</span>' : '<span class="on">● En ligne</span>'));
      badges.push(p.paye ? '<span class="on">💰 Payé' + (p.montant ? ' ' + esc(String(p.montant)) + ' DH' : '') + '</span>' : '<span class="no">⚠ Non payé</span>');
      if (p.fin) badges.push('<span>⌛ ' + esc(p.fin) + '</span>');
      const prix = (p.av && p.ap) ? esc(p.av) + ' → ' + esc(p.ap) + ' DH' : (p.ap ? esc(p.ap) + ' DH' : '');
      return '<div class="pf-row"><div class="pf-logo">🔥</div><div class="pf-info"><div class="pf-nm">' + esc(nomDe(p.slug)) + (prix ? ' · <span class="muted" style="font-weight:600">' + prix + '</span>' : '') + '</div>' +
        (p.titre ? '<div style="font-size:13px;margin:1px 0 3px">' + esc(p.titre) + '</div>' : '') +
        '<div class="pf-meta">' + badges.join('') + '</div></div>' +
        '<button class="sw" data-ptog="' + i + '" aria-pressed="' + (p.actif !== false) + '"></button>' +
        '<button class="pf-del" data-pdel="' + i + '">🗑</button></div>';
    }).join('');
    const opts = '<option value="">— Choisir un commerce —</option>' + shops.map(m => '<option value="' + esc(m.slug) + '">' + esc(m.nom || m.slug) + '</option>').join('');
    c.innerHTML =
      '<div class="paper" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 4px">🔥 Promos de la semaine</h3>' +
      '<p class="muted" style="font-size:13px;margin:0">Affichées dans le carrousel en haut de l\'app client. Un commerce paie pour y apparaître — marque « Payé » quand il a réglé.</p></div>' +
      '<div class="paper" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 10px;font-size:15px">➕ Nouvelle promo</h3>' +
      '<select class="pf-sel" id="pr-shop" style="width:100%;margin-bottom:8px">' + opts + '</select>' +
      '<input class="pf-sel" id="pr-titre" placeholder="Titre (ex : -30% sur les pizzas 🍕)" maxlength="60" style="width:100%;margin-bottom:8px">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px"><input class="pf-sel" id="pr-av" inputmode="decimal" placeholder="Prix avant (DH)"><input class="pf-sel" id="pr-ap" inputmode="decimal" placeholder="Prix après (DH)"></div>' +
      '<label class="muted" style="font-size:12.5px;display:block;margin:0 0 4px">Fin de la promo (facultatif)</label><input class="pf-sel" id="pr-fin" type="date" min="' + today + '" style="width:100%;margin-bottom:8px">' +
      '<div class="pf-row" style="padding:8px 0"><div class="pf-info"><div class="pf-nm" style="font-size:14px">💰 Le commerce a payé</div></div><button class="sw" id="pr-paye" aria-pressed="false"></button></div>' +
      '<input class="pf-sel" id="pr-montant" inputmode="decimal" placeholder="Montant payé (DH, facultatif)" style="width:100%;margin-bottom:10px">' +
      '<button class="btn primary" id="pr-add" style="width:100%">➕ Ajouter la promo</button></div>' +
      '<div class="paper" style="padding:16px"><h3 style="margin:0 0 10px;font-size:15px">Promos (' + PF.promos.length + ')</h3>' +
      (PF.promos.length ? '<div class="pf-list">' + rows + '</div>' : '<p class="muted" style="font-size:13px;margin:0">Aucune promo pour le moment.</p>') + '</div>';
    let paye = false;
    const pb = document.getElementById("pr-paye"); pb.onclick = () => { paye = !paye; pb.setAttribute("aria-pressed", paye); };
    document.getElementById("pr-add").onclick = async () => {
      const slug = document.getElementById("pr-shop").value;
      const titre = (document.getElementById("pr-titre").value || "").trim();
      if (!slug) return toast("Choisis un commerce", true);
      if (!titre) return toast("Écris un titre", true);
      PF.promos.unshift({ slug: slug, titre: titre, av: (document.getElementById("pr-av").value || "").trim(), ap: (document.getElementById("pr-ap").value || "").trim(), fin: document.getElementById("pr-fin").value || "", actif: true, paye: paye, montant: (document.getElementById("pr-montant").value || "").trim() });
      await savePF(); renderPromos(c);
    };
    c.querySelectorAll("[data-ptog]").forEach(b => b.onclick = async () => { const i = +b.dataset.ptog; PF.promos[i].actif = !(PF.promos[i].actif !== false); await savePF(); renderPromos(c); });
    c.querySelectorAll("[data-pdel]").forEach(b => b.onclick = async () => { if (!window.confirm("Supprimer cette promo ?")) return; PF.promos.splice(+b.dataset.pdel, 1); await savePF(); renderPromos(c); });
  }

  /* ===== onglet VALIDATIONS (dossiers livreurs / commerçants + archive des documents) ===== */
  let vfilter = "en_attente";
  async function renderValidations(c) {
    const segs = [["en_attente", "⏳ En attente"], ["valide", "✅ Validés"], ["refuse", "✖ Refusés"]];
    const seg = '<div class="vseg">' + segs.map(s => '<button data-vf="' + s[0] + '" class="' + (vfilter === s[0] ? "on" : "") + '">' + s[1] + '</button>').join("") + '</div>';
    c.innerHTML = seg + '<div id="vbox"><div class="muted" style="font-size:13px;padding:14px">Chargement…</div></div>';
    c.querySelectorAll("[data-vf]").forEach(b => b.onclick = () => { vfilter = b.dataset.vf; renderValidations(c); });
    const box = document.getElementById("vbox");
    let docs = [];
    try {
      const snap = await db.collection("verifications").where("statut", "==", vfilter).get();
      snap.forEach(d => { const o = d.data(); o.id = d.id; docs.push(o); });
    } catch (e) {
      box.innerHTML = '<div class="paper" style="padding:16px"><b style="color:#C6472F">Erreur</b><p class="muted" style="font-size:13px">' + esc((e && e.message) || "") + '</p></div>'; return;
    }
    docs.sort((a, b) => { const va = a.cree && a.cree.seconds ? a.cree.seconds : 0, vb = b.cree && b.cree.seconds ? b.cree.seconds : 0; return vfilter === "en_attente" ? va - vb : vb - va; });
    if (!docs.length) {
      const msg = vfilter === "en_attente" ? "Aucune demande en attente" : vfilter === "valide" ? "Aucun compte validé" : "Aucun dossier refusé";
      box.innerHTML = '<div class="paper" style="padding:22px;text-align:center"><div style="font-size:40px">🗂️</div><h3 style="margin:8px 0 2px">' + msg + '</h3><p class="muted" style="font-size:13px;margin:0">Les dossiers apparaîtront ici.</p></div>'; return;
    }
    box.innerHTML = docs.map(o => {
      const liv = o.role === "livreur";
      const titre = liv ? esc(o.nom || "Livreur") : esc(o.commerce || "Commerce");
      const badge = liv ? '🛵 Livreur' : '🧾 Commerçant';
      const info = liv
        ? [["Tél", o.tel], ["Ville", o.ville], ["CIN", o.cin], ["Véhicule", (o.vehicule || "") + (o.matricule ? " · " + o.matricule : "")], ["E-mail", o.email]]
        : [["Tél", o.tel], ["Ville", o.ville], ["Adresse", o.adresse], ["RC / ICE / IF", o.rc], ["E-mail", o.email]];
      const rows = info.filter(r => r[1]).map(r => '<div class="vl"><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>').join("");
      const docsImg = Object.keys(o.docs || {}).map(k => '<a href="' + esc(o.docs[k]) + '" target="_blank" rel="noopener" class="vdoc"><img src="' + esc(o.docs[k]) + '" alt=""><span>' + esc(k.replace(/_/g, " ")) + '</span></a>').join("");
      let acts;
      if (o.statut === "valide") acts = '<span class="vstate ok">✅ Validé</span><button class="btn" data-no="' + esc(o.id) + '">✖ Refuser</button>';
      else if (o.statut === "refuse") acts = '<span class="vstate no">✖ Refusé' + (o.motif ? ' · ' + esc(o.motif) : '') + '</span><button class="btn primary" data-ok="' + esc(o.id) + '">✅ Valider</button>';
      else acts = '<button class="btn primary" data-ok="' + esc(o.id) + '">✅ Valider</button><button class="btn" data-no="' + esc(o.id) + '">✖ Refuser</button>';
      return '<div class="paper vcard" data-id="' + esc(o.id) + '" style="padding:15px;margin-bottom:12px">' +
        '<div class="vhead"><b>' + titre + '</b><span class="vbadge">' + badge + '</span></div>' +
        '<div class="vgrid">' + rows + '</div>' +
        '<div class="vdocs">' + docsImg + '</div>' +
        '<div class="vacts">' + acts + '<button class="pf-del" data-vdel="' + esc(o.id) + '">🗑</button></div></div>';
    }).join("");
    box.querySelectorAll("[data-vdel]").forEach(b => b.onclick = async () => {
      if (!window.confirm("Supprimer définitivement ce dossier et ses documents ?")) return;
      try { await db.doc("verifications/" + b.dataset.vdel).delete(); toast("Dossier supprimé"); renderValidations(c); } catch (e) { toast("Erreur : " + (e.message || e), true); }
    });
    box.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = "…";
      try { await db.doc("verifications/" + b.dataset.ok).update({ statut: "valide", maj: new Date() }); toast("Compte validé ✅"); renderValidations(c); }
      catch (e) { b.disabled = false; b.textContent = "✅ Valider"; toast("Erreur : " + (e.message || e), true); }
    });
    box.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => {
      const motif = window.prompt("Motif du refus (visible par la personne) :", "Documents illisibles, merci de renvoyer.");
      if (motif === null) return;
      b.disabled = true; b.textContent = "…";
      try { await db.doc("verifications/" + b.dataset.no).update({ statut: "refuse", motif: motif, maj: new Date() }); toast("Dossier refusé"); renderValidations(c); }
      catch (e) { b.disabled = false; b.textContent = "✖ Refuser"; toast("Erreur : " + (e.message || e), true); }
    });
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
      '<div class="pf-acts"><button class="hract" data-hr="' + esc(m.slug) + '" title="Horaires">🕒</button><a href="menus.html#m=' + encodeURIComponent(m.slug) + '">✏️</a><a href="/menu/' + encodeURIComponent(m.slug) + '" target="_blank" rel="noopener">👁</a></div></div>';
  }
  async function dialogHoraires(slug) {
    let m = {};
    try { const d = await db.doc("settings/menu-" + slug).get(); m = d.exists ? JSON.parse(d.data().json || "{}") : {}; } catch (e) { toast("Lecture impossible", true); return; }
    m.infos = m.infos || {};
    const ov = document.createElement("div"); ov.className = "pf-modal";
    ov.innerHTML = '<div class="pf-dialog"><h3 style="margin:0 0 10px">🕒 Horaires · ' + esc(m.nom || slug) + '</h3>' +
      '<label class="f">Ouvre à<input type="time" id="h-ouv" value="' + esc(m.infos.ouv || "") + '"></label>' +
      '<label class="f" style="margin-top:8px">Ferme à<input type="time" id="h-ferm" value="' + esc(m.infos.ferm || "") + '"></label>' +
      '<p class="muted" style="font-size:12px;margin:8px 0 0">Une fois renseignés, le badge <b>● Ouvert / ● Fermé</b> apparaît sur le site. Laisse vide pour le masquer.</p>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="h-cancel" style="flex:1">Annuler</button><button class="btn primary" id="h-save" style="flex:1">Enregistrer</button></div></div>';
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector("#h-cancel").onclick = () => ov.remove();
    ov.querySelector("#h-save").onclick = async () => {
      m.infos.ouv = document.getElementById("h-ouv").value || ""; m.infos.ferm = document.getElementById("h-ferm").value || "";
      const b = document.getElementById("h-save"); b.disabled = true; b.textContent = "…";
      try { await db.doc("settings/menu-" + slug).set({ json: JSON.stringify(m), v: String(Date.now()), maj: new Date() }, { merge: true }); toast("Horaires enregistrés ✓"); ov.remove(); }
      catch (e) { b.disabled = false; b.textContent = "Enregistrer"; toast("Erreur : " + (e.message || e), true); }
    };
  }
  function renderRestos(c) {
    if (!liste.length) { c.innerHTML = '<div class="empty paper"><h3>Aucun restaurant</h3><a class="btn primary" href="menus.html">➕ Ajouter</a></div>'; return; }
    const nbVis = liste.filter(estVisible).length;
    c.innerHTML = '<div class="pf-head"><div class="pf-count">' + nbVis + ' / ' + liste.length + ' visibles sur <b>/commander</b></div><a class="btn primary" href="menus.html">➕ Ajouter</a></div>' +
      '<div class="pf-list">' + liste.map(ligneResto).join("") + '</div>';
    c.querySelectorAll("[data-hr]").forEach(b => b.onclick = () => dialogHoraires(b.dataset.hr));
    c.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => toggleResto(b.dataset.toggle));
    c.querySelectorAll("[data-up]").forEach(b => b.onclick = () => bouger(+b.dataset.up, -1));
    c.querySelectorAll("[data-down]").forEach(b => b.onclick = () => bouger(+b.dataset.down, 1));
    liste.forEach(m => { const d = det[m.slug]; if (d) { if (d.logo) poseLogo(m.slug, d.logo); } else chargerDetail(m.slug); });
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
        '<form class="pf-add sc-lvadd" data-scid="' + s.id + '"><input class="sc-lvn" placeholder="Nom du livreur" maxlength="40" autocomplete="off" required><input class="sc-lvt" type="tel" inputmode="tel" placeholder="Téléphone" maxlength="20" autocomplete="off"><input class="sc-lve" type="email" placeholder="E-mail (espace livreur)" maxlength="60" autocomplete="off"><button class="btn primary">➕</button></form>' +
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
    c.querySelectorAll(".sc-lvadd").forEach(f => f.onsubmit = e => { e.preventDefault(); const s = charikat.find(x => x.id === f.dataset.scid); if (!s) return; const n = f.querySelector(".sc-lvn").value.trim(); if (!n) return; const t = f.querySelector(".sc-lvt").value.trim(); const em = (f.querySelector(".sc-lve").value || "").trim().toLowerCase(); s.livreurs = s.livreurs || []; s.livreurs.unshift({ id: rid(), nom: n, tel: t, email: em, actif: true }); sauverCharikat(); renderCharikat(c); });
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
