/* =========================================================
   NFCWORK — FIDÉLITÉ (Espace)
   Admin NFCWORK : crée et règle le programme de chaque commerce (type de points, récompense,
                   qui scanne, employés, prime du mois).
   Commerçant (son compte de l'Espace, e-mail = ownerEmail du programme) : scanne les cartes,
                   ajoute des points, offre les récompenses, gère ses employés, imprime ses affiches.
   Données : fidProgrammes, fidSecrets, fidCartes, fidEmployes (voir f/fid.js et firestore.rules).
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const app = $("#app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function toast(m, long) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), long ? 5200 : 2600); }

  if (!window.FIREBASE_CONFIG) { app.innerHTML = '<div class="empty"><h3>Configuration manquante</h3></div>'; return; }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  const FV = firebase.firestore.FieldValue, inc = n => FV.increment(n), NOW = () => FV.serverTimestamp();
  const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
  const SITE = "https://nfcwork.ma";
  const TYPES = { visites: ["Visites", "1 point par visite"], articles: ["Articles", "1 point par article acheté"], montant: ["Montant", "Points selon le montant en DH"] };
  // points des employés, toujours liés à une vraie visite enregistrée par le commerçant
  const MODES_C = { commercant: ["Le commerçant scanne", "Il scanne la carte du client"], caisse: ["Téléphone caisse", "Le client scanne un QR qui change toutes les 30 s"] };
  const MODES_E = { visite: ["À la caisse", "Le commerçant choisit qui a servi"], confirme: ["Le client", "Il confirme qui l’a servi"], les2: ["Les deux", "Caisse, sinon le client"] };
  // modèles prêts à l'emploi par métier (tout reste modifiable)
  // modèles par défaut ; la liste modifiée par l'admin (Métiers & prix) est gardée dans settings/fidMetiers
  // modèles par métier · idees : [objectif, unité, récompense, type?, DH pour 1 point?]
  const METIERS_BASE = {
    barber:    { ico: "✂️", nom: "Barber / Coiffure homme", type: "visites", objectif: 8, unite: "coupes", recompense: "La 9e coupe offerte", employes: true,
      idees: [[8, "coupes", "La 9e coupe offerte"], [5, "coupes", "1 barbe offerte"], [10, "coupes", "1 soin du visage offert"], [6, "coupes", "-50 % sur la 7e coupe"]] },
    beaute:    { ico: "💅", nom: "Salon de beauté / Coiffure femme", type: "visites", objectif: 6, unite: "visites", recompense: "1 brushing offert", employes: true,
      idees: [[6, "visites", "1 brushing offert"], [5, "manucures", "La 6e manucure offerte"], [8, "visites", "1 soin capillaire offert"], [10, "visites", "-30 % sur une coloration"]] },
    cafe:      { ico: "☕", nom: "Café", type: "visites", objectif: 10, unite: "cafés", recompense: "1 café offert", employes: false,
      idees: [[10, "cafés", "1 café offert"], [8, "boissons", "1 boisson au choix offerte"], [12, "cafés", "1 petit-déjeuner offert"], [5, "visites", "1 viennoiserie offerte"]] },
    snack:     { ico: "🌯", nom: "Snack / Fast-food", type: "visites", objectif: 10, unite: "commandes", recompense: "1 sandwich offert", employes: false,
      idees: [[10, "commandes", "1 sandwich offert"], [8, "commandes", "1 menu offert"], [5, "commandes", "1 boisson offerte"], [6, "tacos", "Le 7e tacos offert"]] },
    resto:     { ico: "🍽️", nom: "Restaurant", type: "montant", objectif: 200, dhParPoint: 10, unite: "points", recompense: "-50 DH sur l’addition", employes: true,
      idees: [[200, "points", "-50 DH sur l’addition", "montant", 10], [10, "repas", "1 dessert offert"], [300, "points", "1 plat offert", "montant", 10], [5, "visites", "1 boisson offerte"]] },
    pizzeria:  { ico: "🍕", nom: "Pizzeria", type: "visites", objectif: 8, unite: "pizzas", recompense: "La 9e pizza offerte", employes: false,
      idees: [[8, "pizzas", "La 9e pizza offerte"], [5, "commandes", "1 boisson 1 L offerte"], [10, "commandes", "1 pizza familiale offerte"]] },
    patisserie:{ ico: "🥐", nom: "Boulangerie / Pâtisserie", type: "montant", objectif: 100, dhParPoint: 10, unite: "points", recompense: "1 gâteau offert", employes: false,
      idees: [[100, "points", "1 gâteau offert", "montant", 10], [10, "visites", "1 viennoiserie offerte"], [200, "points", "-20 % sur une commande de fête", "montant", 10]] },
    glacier:   { ico: "🍦", nom: "Glacier / Crêperie / Jus", type: "visites", objectif: 8, unite: "commandes", recompense: "1 glace offerte", employes: false,
      idees: [[8, "glaces", "1 glace offerte"], [10, "jus", "1 jus offert"], [6, "crêpes", "La 7e crêpe offerte"]] },
    vetement:  { ico: "👕", nom: "Vêtements / Chaussures", type: "articles", objectif: 10, unite: "articles", recompense: "-20 % sur le prochain achat", employes: true,
      idees: [[10, "articles", "-20 % sur le prochain achat"], [500, "points", "Bon d’achat de 50 DH", "montant", 10], [5, "achats", "1 accessoire offert"]] },
    pressing:  { ico: "🧺", nom: "Pressing / Laverie", type: "articles", objectif: 20, unite: "pièces", recompense: "5 pièces nettoyées gratuitement", employes: false,
      idees: [[20, "pièces", "5 pièces nettoyées gratuitement"], [10, "visites", "1 couette nettoyée offerte"], [15, "pièces", "1 costume nettoyé offert"]] },
    hammam:    { ico: "🧖", nom: "Hammam / Spa", type: "visites", objectif: 6, unite: "séances", recompense: "La 7e séance offerte", employes: true,
      idees: [[6, "séances", "La 7e séance offerte"], [5, "séances", "1 gommage offert"], [10, "séances", "1 massage offert"]] },
    sport:     { ico: "🏋️", nom: "Salle de sport", type: "visites", objectif: 3, unite: "mois", recompense: "Le 4e mois à -50 %", employes: false,
      idees: [[3, "mois", "Le 4e mois à -50 %"], [6, "mois", "1 mois offert"], [12, "mois", "1 tenue de sport offerte"]] },
    pharmacie: { ico: "💊", nom: "Parapharmacie", type: "montant", objectif: 300, dhParPoint: 10, unite: "points", recompense: "Bon d’achat de 30 DH", employes: false,
      idees: [[300, "points", "Bon d’achat de 30 DH", "montant", 10], [500, "points", "1 produit de soin offert", "montant", 10]] },
    epicerie:  { ico: "🛒", nom: "Épicerie / Supérette", type: "montant", objectif: 500, dhParPoint: 10, unite: "points", recompense: "Bon d’achat de 25 DH", employes: false,
      idees: [[500, "points", "Bon d’achat de 25 DH", "montant", 10], [1000, "points", "Bon d’achat de 60 DH", "montant", 10], [10, "visites", "1 article surprise offert"]] },
    telephone: { ico: "📱", nom: "Téléphonie / Réparation", type: "visites", objectif: 5, unite: "achats", recompense: "1 protection d’écran offerte", employes: false,
      idees: [[5, "achats", "1 protection d’écran offerte"], [3, "réparations", "-30 % sur la 4e réparation"], [500, "points", "1 câble ou chargeur offert", "montant", 10]] },
    gaming:    { ico: "🎮", nom: "Salle de jeux / Gaming", type: "visites", objectif: 10, unite: "heures", recompense: "2 heures offertes", employes: false,
      idees: [[10, "heures", "2 heures offertes"], [8, "visites", "1 boisson offerte"], [20, "heures", "1 tournoi gratuit"]] },
    location:  { ico: "🏠", nom: "Location (maisons, voitures)", type: "visites", objectif: 5, unite: "locations", recompense: "La 6e location à -50 %", employes: false,
      idees: [[5, "locations", "La 6e location à -50 %"], [3, "locations", "1 jour offert"], [10, "nuits", "1 nuit offerte"]] },
    lavage:    { ico: "🚗", nom: "Lavage auto", type: "visites", objectif: 5, unite: "lavages", recompense: "Le 6e lavage offert", employes: true,
      idees: [[5, "lavages", "Le 6e lavage offert"], [8, "lavages", "1 lavage intérieur complet offert"], [10, "lavages", "1 polissage offert"]] },
    garage:    { ico: "🔧", nom: "Garage / Vidange", type: "visites", objectif: 4, unite: "vidanges", recompense: "La 5e vidange à -50 %", employes: false,
      idees: [[4, "vidanges", "La 5e vidange à -50 %"], [3, "visites", "1 contrôle offert"], [5, "visites", "1 lavage offert"]] },
    autre:     { ico: "✨", nom: "Autre", type: "visites", objectif: 10, unite: "visites", recompense: "", employes: false,
      idees: [[10, "visites", "1 cadeau surprise"], [5, "visites", "-10 % sur la prochaine visite"], [200, "points", "Bon d’achat de 20 DH", "montant", 10]] }
  };
  // idées valables pour tous les commerces
  const IDEES_TOUS = [[10, "visites", "Cadeau surprise"], [5, "commandes", "Livraison gratuite"], [8, "visites", "-15 % sur la prochaine visite"], [12, "visites", "1 produit au choix offert"]];
  const ideesTxt = l => (l || []).map(([o, u, r, t, dh]) => (t === "montant" ? `${dh || 10} DH = 1 pt, ${o} pts` : `${o} ${u}`) + " = " + r).join("\n");
  const lireIdees = txt => String(txt || "").split(/\n+/).map(l => {
    const m = l.match(/^\s*(\d+)\s*DH\s*=\s*1\s*pts?\s*,\s*(\d+)\s*pts?\s*=\s*(.+)$/i); if (m) return [+m[2], "points", m[3].trim(), "montant", +m[1]];
    const v = l.match(/^\s*(\d+)\s+([^=]+?)\s*=\s*(.+)$/); return v ? [+v[1], v[2].trim(), v[3].trim()] : null;
  }).filter(Boolean).slice(0, 12);
  const PERIODES = { mois: "/ mois", an: "/ an", once: "une fois" };
  let METIERS = JSON.parse(JSON.stringify(METIERS_BASE));
  async function chargerMetiers() {
    try {
      const d = await db.doc("settings/fidMetiers").get();
      if (d.exists) {
        const m = JSON.parse(d.data().json || "{}"), retires = m._retires || [];
        if (Object.keys(m).length) {
          METIERS = m;
          // nouveaux modèles NFCWORK ajoutés depuis : on les montre aussi (sauf ceux supprimés exprès)
          for (const [k, v] of Object.entries(METIERS_BASE)) if (!METIERS[k] && !retires.includes(k)) METIERS[k] = JSON.parse(JSON.stringify(v));
          for (const [k, v] of Object.entries(METIERS)) if (k[0] !== "_" && !v.idees && METIERS_BASE[k]) v.idees = METIERS_BASE[k].idees;
        }
      }
    } catch (e) {}
  }
  const prixTxt = m => m && m.prix ? `${m.prix} DH ${PERIODES[m.periode] || ""}`.trim() : "";

  let user = null, email = "", admin = false, progs = [], P = null, cartes = [], employes = [], secret = "", vue = "clients", recherche = "", subs = [];
  const unsub = () => { subs.forEach(f => f()); subs = []; };
  const moisCle = (d, decal) => { d = new Date(d || Date.now()); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + (decal || 0)); return String(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1); };
  const nomMois = k => new Date(Date.UTC(+k.slice(0, 4), +k.slice(4) - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const unite = p => p.unite || (p.type === "montant" ? "pts" : p.type === "articles" ? "articles" : "visites");
  const modeEmp = p => MODES_E[p.modeEmploye] ? p.modeEmploye : "visite";
  const logoSrc = p => /^data:image\//.test(p.logoData || "") ? p.logoData : /^https?:\/\//.test(p.logo || "") ? p.logo : "";
  const rid = n => { const a = "abcdefghijkmnopqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const slugify = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "commerce";
  const waNum = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 9 ? d : ""; };
  function erreur(e) {
    console.error(e);
    toast(e && e.code === "permission-denied" ? "Action refusée : vérifiez que les règles Fidélité sont publiées dans Firebase et que vous êtes le bon compte." : "Échec. Vérifiez la connexion et réessayez.", true);
  }

  /* ================= Connexion ================= */
  auth.onAuthStateChanged(async u => {
    user = u; unsub();
    if (!u) { renderLogin(); return; }
    email = (u.email || "").toLowerCase(); admin = email === ADMIN;
    if (!admin && !u.emailVerified) { app.innerHTML = `<div class="empty"><h3>Vérifiez votre e-mail</h3><p>Ouvrez le lien reçu par e-mail, puis revenez ici.</p><a class="btn" href="./">Espace client</a></div>`; return; }
    try {
      const q = admin ? db.collection("fidProgrammes") : db.collection("fidProgrammes").where("ownerEmail", "==", email);
      progs = (await q.get()).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
    } catch (e) { erreur(e); progs = []; }
    await chargerMetiers();
    if (!admin && !progs.length) { app.innerHTML = `<div class="empty"><h3>Pas encore de programme fidélité</h3><p>Contactez NFCWORK pour activer la carte fidélité de votre commerce.</p><a class="btn primary" href="https://wa.me/212620666027" target="_blank" rel="noopener">WhatsApp NFCWORK</a></div>`; return; }
    try { localStorage.setItem("nfcwork-fid-pro", "1"); localStorage.setItem("nfcwork-patron", "1"); } catch (e) {}
    route();
  });
  function renderLogin() {
    app.innerHTML = `<div class="auth paper"><h2>Connexion</h2><p class="muted">Connectez-vous avec le compte de votre commerce.</p>
      <form id="lf" class="stack"><label class="f">E-mail<input id="le" type="email" autocomplete="email" required></label>
      <label class="f">Mot de passe<input id="lp" type="password" autocomplete="current-password" required></label><p class="err" id="lerr"></p>
      <button class="btn primary">Se connecter</button></form>
      <p class="muted" style="font-size:13px;margin-top:12px">Pas encore de compte ? <a href="./">Créez-le dans l’Espace client</a>.</p></div>`;
    $("#lf").onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true;
      try { await auth.signInWithEmailAndPassword($("#le").value.trim(), $("#lp").value); }
      catch (x) { $("#lerr").textContent = "E-mail ou mot de passe incorrect."; b.disabled = false; }
    };
  }

  /* ================= Navigation ================= */
  async function route() {
    const h = location.hash, m = (k) => (h.match(new RegExp("^#" + k + "=([A-Za-z0-9_-]+)")) || [])[1];
    const c = m("c"), e = m("e"), p = m("p");
    if (c) { history.replaceState(null, "", "#"); await ouvrirParCarte(c); return; }
    if (e) { history.replaceState(null, "", "#"); await ouvrirParEmploye(e); return; }
    if (h === "#nouveau" && admin) { history.replaceState(null, "", "#"); renderListe(); reglages(null); return; }
    if (p && progs.some(x => x.id === p)) { ouvrirProgramme(p); return; }
    if (!admin && progs.length === 1) { ouvrirProgramme(progs[0].id); return; }
    renderListe();
  }
  window.addEventListener("hashchange", route);
  function entete(t, s, back) { $("#topTitle").textContent = t; $("#topSub").textContent = s; $("#backBtn").href = back; }

  /* ================= Liste (admin, ou commerçant à plusieurs commerces) ================= */
  function renderListe() {
    unsub(); P = null;
    entete("Fidélité", admin ? "Programmes de vos clients" : "Vos commerces", "./");
    app.innerHTML = `<div class="row between"><div><h2>Cartes fidélité</h2><div class="muted">Points, récompenses et classement des employés.</div></div>
      ${admin ? `<div class="row"><button class="btn" data-act="metiers">✏️ Métiers & prix</button><button class="btn primary" data-act="nouveau">＋ Nouveau programme</button></div>` : ""}</div>
      ${admin && new Date().getDate() <= 5 && progs.length ? `<div class="notice" style="margin-top:10px">📊 Début du mois : envoyez le rapport à chaque commerçant (Ouvrir → 📊 Rapport du mois). Ils voient ce que la carte leur rapporte, et ils renouvellent.</div>` : ""}
      ${progs.length ? `<div class="mlist sec">${progs.map(p => `<div class="paper mcard">
        <div class="row between"><span class="n">${(METIERS[p.metier] || {}).ico || ""} ${esc(p.nom)}</span><span class="pill ${p.actif === false ? "off" : "pro"}">${p.actif === false ? "Désactivé" : p.essai && p.expire ? (jourLocal() > p.expire ? "Essai terminé" : "🎁 Essai → " + esc(p.expire.slice(8, 10) + "/" + p.expire.slice(5, 7))) : esc(TYPES[p.type] ? TYPES[p.type][0] : "")}</span></div>
        <div class="l">${esc(p.objectif)} ${unite(p)} = ${esc(p.recompense)}${admin ? `<br>${esc(p.ownerEmail || "sans compte commerçant")}${p.prix ? ` · ${esc(p.prix)} DH ${PERIODES[p.periode] || ""}` : ""}` : ""}</div>
        <div class="row"><a class="btn sm primary" href="#p=${esc(p.id)}">Ouvrir</a><button class="btn sm" data-lienqr="${esc(p.id)}">🔗 Lien & QR</button>${p.modeClient === "caisse" ? `<a class="btn sm" href="caisse.html#p=${esc(p.id)}">📱 Écran caisse</a>` : ""}${admin ? `<button class="btn sm" data-reglages="${esc(p.id)}">Réglages</button>` : ""}</div></div>`).join("")}</div>`
      : `<div class="empty paper sec"><h3>Aucun programme</h3><p>Créez le programme fidélité d’un commerce : type de points, récompense, employés.</p><button class="btn primary" data-act="nouveau">＋ Créer un programme</button></div>`}`;
  }

  /* dates locales AAAA-MM-JJ */
  const jourIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const jourLocal = () => jourIso(new Date());
  const jourPlus = (n, base) => { const d = base ? new Date(base + "T12:00:00") : new Date(); d.setDate(d.getDate() + n); return jourIso(d); };

  /* ================= Réglages d'un programme (admin) : 3 étapes ================= */
  // logo importé depuis le téléphone → carré 256 px, et couleur principale du logo
  function lireLogo(fichier) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(fichier), img = new Image();
      img.onload = () => {
        const n = 256, c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d");
        const k = Math.min(n / img.naturalWidth, n / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
        g.fillStyle = "#fff"; g.fillRect(0, 0, n, n); g.drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
        // couleur dominante : pixels assez saturés, ni blancs ni noirs
        const px = g.getImageData(0, 0, n, n).data; let r = 0, gg = 0, b = 0, t = 0;
        for (let q = 0; q < px.length; q += 16) {
          const R = px[q], G = px[q + 1], B = px[q + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          if (mx < 40 || mn > 215 || mx - mn < 40) continue;
          const wgt = mx - mn; r += R * wgt; gg += G * wgt; b += B * wgt; t += wgt;
        }
        const hex = t ? "#" + [r, gg, b].map(v => Math.round(v / t).toString(16).padStart(2, "0")).join("") : "";
        let data = c.toDataURL("image/webp", 0.85); if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", 0.85);
        URL.revokeObjectURL(url); ok({ data, couleur: hex });
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("illisible")); };
      img.src = url;
    });
  }
  async function reglages(pid) {
    const ex = pid ? progs.find(x => x.id === pid) : null;
    const p = Object.assign({ metier: "", nom: "", ownerEmail: "", logoData: "", couleur: "#1e90ff", type: "visites", objectif: 10, unite: "visites", recompense: "", dhParPoint: 10,
      employes: false, modeEmploye: "les2", primeEmploye: "Le meilleur du mois gagne 200 DH", actif: true }, ex || {});
    if (!MODES_E[p.modeEmploye]) p.modeEmploye = "les2";
    let emails = [];
    try { emails = (await db.collection("clients").get()).docs.map(d => d.data()).filter(c => c.email).map(c => [c.email, c.name || ""]); } catch (e) {}
    const seg = (nom, opts, val) => `<div class="seg3" data-seg="${nom}">${Object.entries(opts).map(([k, [a, b]]) => `<button type="button" data-v="${k}" aria-pressed="${val === k}"><b>${a}</b>${b ? `<small class="muted">${b}</small>` : ""}</button>`).join("")}</div>`;
    const d = fenetre(`<div class="row between"><h2>${ex ? "Réglages" : "Nouveau programme"}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <form class="stack" id="pf" style="margin-top:10px">
        <div><div class="eyebrow" style="margin-bottom:6px">1 · Le métier</div>
          <div class="seg3" id="metiers" style="grid-template-columns:repeat(4,1fr)">${Object.entries(METIERS).filter(([k]) => k[0] !== "_").map(([k, m]) => `<button type="button" data-metier="${k}" aria-pressed="${p.metier === k}"><b style="font-size:22px">${m.ico}</b><small>${esc(m.nom.split(" (")[0])}</small>${m.prix ? `<small class="muted">${esc(prixTxt(m))}</small>` : ""}</button>`).join("")}</div></div>
        <div class="eyebrow">2 · Le commerce</div>
        ${!ex && window.NFCW_SOURCES ? `<button type="button" class="btn" id="p-src">📋 Remplir depuis un client existant (menu, avis, carte…)</button>` : ""}
        <label class="f">Nom du commerce<input id="p-nom" required maxlength="60" value="${esc(p.nom)}" placeholder="Barber Atlas"></label>
        <label class="f">E-mail du compte commerçant (il scannera les cartes)<input id="p-mail" type="email" list="mails" value="${esc(p.ownerEmail)}" placeholder="client@gmail.com" autocapitalize="off">
          <datalist id="mails">${emails.map(([m, n]) => `<option value="${esc(m)}">${esc(n)}</option>`).join("")}</datalist></label>
        <div class="imgpick" id="p-logo-box"><span id="p-logo-prev">${logoSrc(p) ? `<img class="prev" src="${esc(logoSrc(p))}" alt="">` : '<div class="prev"></div>'}</span>
          <div class="stack" style="gap:6px"><b>Logo</b><small class="muted">Depuis le téléphone ou l’ordinateur. La carte prend sa couleur.</small>
          <div class="row"><label class="btn sm primary">📷 Importer le logo<input type="file" accept="image/*" hidden id="p-logo"></label><input id="p-coul" type="color" value="${esc(p.couleur)}" title="Couleur de la carte" style="width:46px;height:38px;padding:2px;border-radius:10px;border:1px solid var(--line);background:var(--bg)"></div></div></div>
        <div class="eyebrow">3 · La récompense</div>
        <div class="grid2"><label class="f">Objectif<input id="p-obj" type="number" min="1" max="1000" value="${esc(p.objectif)}" inputmode="numeric"></label>
          <label class="f">Unité (coupes, cafés…)<input id="p-unite" maxlength="20" value="${esc(p.unite)}"></label></div>
        <label class="f">Récompense<input id="p-rec" required maxlength="80" value="${esc(p.recompense)}" placeholder="1 café offert · -20 % · 1 coupe gratuite"></label>
        <div><div class="muted" style="font-size:13px;margin-bottom:6px">💡 Idées : touchez pour remplir</div><div class="idees" id="p-idees"></div></div>
        <div class="eyebrow">4 · Qui donne les points au client</div>
        ${seg("modeClient", MODES_C, MODES_C[p.modeClient] ? p.modeClient : "commercant")}
        <label class="f" id="w-delai">Un point maximum toutes les (heures)<input id="p-delai" type="number" min="1" max="72" inputmode="numeric" value="${esc(p.delaiH || 3)}"></label>
        <label class="check"><input type="checkbox" id="p-emp" ${p.employes ? "checked" : ""}> Points des employés (classement du mois)</label>
        <details id="plus"><summary class="muted" style="cursor:pointer;padding:6px 0">Plus d’options</summary><div class="stack" style="margin-top:10px">
          <div><div class="eyebrow" style="margin-bottom:6px">Comment le client gagne ses points</div>${seg("type", TYPES, p.type)}</div>
          <label class="f" id="w-dh">DH pour 1 point<input id="p-dh" type="number" min="1" max="1000" value="${esc(p.dhParPoint)}" inputmode="numeric"></label>
          <div id="w-emp" class="stack"><div><div class="eyebrow" style="margin-bottom:6px">Qui donne le point à l’employé</div>${seg("modeEmploye", MODES_E, p.modeEmploye)}</div>
            <label class="f">Prime du mois (affichée aux employés)<input id="p-prime" maxlength="80" value="${esc(p.primeEmploye)}"></label></div>
          <div class="grid2"><label class="f">Prix de l’abonnement (DH)<input id="p-prix" type="number" min="0" inputmode="numeric" value="${esc(p.prix || "")}"></label>
            <label class="f">Période<select id="p-per">${Object.entries(PERIODES).map(([k, v]) => `<option value="${k}" ${(p.periode || "an") === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
          <label class="f">⭐ Lien avis Google du commerce (le client qui laisse un avis gagne +1 point)<input id="p-avis" type="url" maxlength="300" value="${esc(p.lienAvis || "")}" placeholder="https://g.page/r/…/review" autocapitalize="off"></label>
          <label class="f">Comment ça marche (affiché au client, une étape par ligne)<textarea id="p-guide" maxlength="400" rows="3">${esc(p.guide || "")}</textarea></label>
          <label class="check"><input type="checkbox" id="p-actif" ${p.actif !== false ? "checked" : ""}> Programme actif</label>
        </div></details>
        <div class="paper" style="padding:12px 14px;border-radius:14px;border:1px dashed var(--accent)">
          <label class="check" style="margin:0"><input type="checkbox" id="p-essai" ${(!ex || p.essai) ? "checked" : ""}> 🎁 <b>Essai gratuit</b> : la carte se coupe toute seule à la fin</label>
          <div class="row" style="gap:8px;margin-top:8px;align-items:center" id="w-essai"><span class="muted" style="font-size:13px">Jusqu’au</span><input id="p-essai-fin" type="date" value="${esc(p.essai && p.expire ? p.expire : jourPlus(7))}" style="width:auto">
            <button type="button" class="btn sm" data-essai="7">7 j</button><button type="button" class="btn sm" data-essai="14">14 j</button></div>
          <small class="muted" style="display:block;margin-top:6px">2 jours avant la fin, le commerçant voit un avertissement (jamais ses clients). Quand il paie : décochez.</small></div>
        <p class="err" id="perr"></p>
        <div class="row"><button class="btn primary" style="flex:1">Enregistrer</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
      </form>`);
    const majEssai = () => { $("#w-essai", d).hidden = !$("#p-essai", d).checked; };
    $("#p-essai", d).onchange = majEssai; majEssai();
    d.addEventListener("click", e => { const b = e.target.closest("[data-essai]"); if (b) $("#p-essai-fin", d).value = jourPlus(+b.dataset.essai); });
    const val = { type: p.type, modeEmploye: p.modeEmploye, modeClient: MODES_C[p.modeClient] ? p.modeClient : "commercant" }; let logoData = p.logoData || "", metier = p.metier;
    const maj = () => { $("#w-dh", d).hidden = val.type !== "montant"; $("#w-emp", d).hidden = !$("#p-emp", d).checked; $("#w-delai", d).hidden = val.modeClient !== "caisse"; };
    const dessinerIdees = () => {
      const l = [...((METIERS[metier] || {}).idees || []), ...IDEES_TOUS];
      $("#p-idees", d).innerHTML = l.map((x, i) => `<button type="button" data-idee="${i}">${esc(x[3] === "montant" ? `${x[4] || 10} DH = 1 pt · ${x[0]} pts` : `${x[0]} ${x[1]}`)} → ${esc(x[2])}</button>`).join("");
      $("#p-idees", d)._l = l;
    };
    const choisirSeg = (nom, v) => { val[nom] = v; d.querySelectorAll(`[data-seg="${nom}"] [data-v]`).forEach(x => x.setAttribute("aria-pressed", x.dataset.v === v)); };
    d.addEventListener("click", e => {
      const ide = e.target.closest("[data-idee]");
      if (ide) {
        const [o, u, r, t, dh] = $("#p-idees", d)._l[+ide.dataset.idee];
        $("#p-obj", d).value = o; $("#p-unite", d).value = u; $("#p-rec", d).value = r;
        choisirSeg("type", t === "montant" ? "montant" : /article|pièce/i.test(u) ? "articles" : "visites"); if (dh) $("#p-dh", d).value = dh; maj();
        d.querySelectorAll("[data-idee]").forEach(x => x.setAttribute("aria-pressed", x === ide));
        return;
      }
      const m = e.target.closest("[data-metier]");
      if (m) {
        metier = m.dataset.metier; const t = METIERS[metier];
        d.querySelectorAll("[data-metier]").forEach(x => x.setAttribute("aria-pressed", x === m));
        $("#p-obj", d).value = t.objectif; $("#p-unite", d).value = t.unite; if (t.recompense || !ex) $("#p-rec", d).value = t.recompense;
        if (t.dhParPoint) $("#p-dh", d).value = t.dhParPoint; $("#p-emp", d).checked = !!t.employes; choisirSeg("type", t.type); maj();
        $("#p-prix", d).value = t.prix || ""; $("#p-per", d).value = t.periode || "an"; $("#p-guide", d).value = t.guide || "";
        dessinerIdees();
        if (!$("#p-nom", d).value) $("#p-nom", d).focus();
        return;
      }
      const b = e.target.closest("[data-seg] [data-v]"); if (b) { choisirSeg(b.closest("[data-seg]").dataset.seg, b.dataset.v); maj(); }
    });
    $("#p-emp", d).onchange = maj; maj(); dessinerIdees();
    const src = $("#p-src", d);
    if (src) src.onclick = async () => {
      const D = await window.NFCW_SOURCES.choisir(db, "🎁 Nouvelle carte fidélité"); if (!D || D.vide) return;
      $("#p-nom", d).value = D.nom; if (D.ownerEmail || D.email) $("#p-mail", d).value = (D.ownerEmail || D.email).toLowerCase();
      if (D.logo) { try { const b = await (await fetch(D.logo)).blob(), r = await lireLogo(new File([b], "logo", { type: b.type || "image/png" })); logoData = r.data; $("#p-logo-prev", d).innerHTML = `<img class="prev" src="${r.data}" alt="">`; if (r.couleur) $("#p-coul", d).value = r.couleur; } catch (x) {} }
      if (D.couleur) $("#p-coul", d).value = D.couleur;
      src.textContent = "✅ Rempli avec : " + D.trouve.join(", ");
    };
    $("#p-logo", d).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const r = await lireLogo(f); logoData = r.data; $("#p-logo-prev", d).innerHTML = `<img class="prev" src="${r.data}" alt="">`; if (r.couleur) $("#p-coul", d).value = r.couleur; }
      catch (x) { $("#perr", d).textContent = "Image illisible : choisissez une photo JPG ou PNG."; }
    };
    $("#pf", d).onsubmit = async e => {
      e.preventDefault();
      const num = (id, mn, mx, def) => Math.max(mn, Math.min(mx, parseInt($(id, d).value, 10) || def));
      const data = {
        metier: metier || "autre", nom: $("#p-nom", d).value.trim(), ownerEmail: $("#p-mail", d).value.trim().toLowerCase(), couleur: $("#p-coul", d).value,
        logoData, logo: "", type: val.type, objectif: num("#p-obj", 1, 1000, 10), unite: $("#p-unite", d).value.trim() || "visites", dhParPoint: num("#p-dh", 1, 1000, 10),
        recompense: $("#p-rec", d).value.trim(), modeClient: val.modeClient, delaiH: num("#p-delai", 1, 72, 3), employes: $("#p-emp", d).checked, modeEmploye: val.modeEmploye,
        primeEmploye: $("#p-prime", d).value.trim(), actif: $("#p-actif", d).checked, maj: NOW(),
        prix: parseInt($("#p-prix", d).value, 10) || 0, periode: $("#p-per", d).value, guide: $("#p-guide", d).value.trim().slice(0, 400),
        lienAvis: /^https:\/\//.test($("#p-avis", d).value.trim()) ? $("#p-avis", d).value.trim() : ""
      };
      if (!data.ownerEmail) { $("#perr", d).textContent = "Indiquez l’e-mail du compte du commerçant."; return; }
      if ($("#p-essai", d).checked) {
        const fin = $("#p-essai-fin", d).value || jourPlus(7);
        Object.assign(data, { essai: true, expire: fin, preavis: jourPlus(-2, fin) });
      } else if (p.essai) Object.assign(data, { essai: false, expire: "", preavis: "" });   // il a payé : plus de coupure
      const b = e.target.querySelector("button.primary"); b.disabled = true;
      try {
        const id = pid || await idLibre(data.nom);
        if (!pid) data.createdAt = NOW();
        await db.doc("fidProgrammes/" + id).set(data, { merge: true });
        if (ex && String(ex.ownerEmail || "").toLowerCase() !== data.ownerEmail) {   // nouvel e-mail : ses cartes clients et employés suivent
          for (const col of ["fidCartes", "fidEmployes"]) { try { const s = await db.collection(col).where("pid", "==", id).get(); for (const x of s.docs) await x.ref.update({ ownerEmail: data.ownerEmail }); } catch (e) { console.warn(col, e); } }
        }
        // téléphone caisse : un secret qui sert à fabriquer le QR qui change toutes les 30 s (le client ne le voit jamais)
        if (data.modeClient === "caisse") { const s = await db.doc("fidSecrets/" + id).get().catch(() => null); if (!(s && s.exists && s.data().caisse)) await db.doc("fidSecrets/" + id).set({ caisse: rid(16) + rid(16) }); }
        else db.doc("fidSecrets/" + id).delete().catch(() => {});
        const local = { id, ...data, maj: Date.now() };
        const i = progs.findIndex(x => x.id === id); if (i >= 0) progs[i] = { ...progs[i], ...local }; else progs.push(local);
        d.remove(); toast("Programme enregistré ✓");
        if (P && P.id === id) { P = progs.find(x => x.id === id); renderDash(); } else renderListe();
        if (!pid) lienQR(progs.find(x => x.id === id), true);
      } catch (x) { erreur(x); b.disabled = false; }
    };
  }

  /* ================= Métiers & prix (mode modification, admin) ================= */
  function metiersVue() {
    const d = fenetre(`<div class="row between"><h2>Métiers & prix</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="margin:4px 0 12px">Vos modèles : ils pré-remplissent chaque nouveau programme. Touchez un métier pour le modifier.</p>
      <div class="flist" id="mlist"></div>
      <button class="btn primary" style="width:100%;margin-top:12px" data-madd>＋ Ajouter un métier</button>
      <button class="btn sm ghost" style="width:100%;margin-top:6px" data-mreset>Revenir aux modèles NFCWORK</button>`);
    const dessiner = () => {
      $("#mlist", d).innerHTML = Object.entries(METIERS).filter(([k]) => k[0] !== "_").map(([k, m]) => `<div class="frow" data-medit="${esc(k)}" style="cursor:pointer"><span class="av" style="font-size:20px">${esc(m.ico || "✨")}</span>
        <div class="tx"><b>${esc(m.nom)}</b><small>${esc(m.type === "montant" ? `${m.dhParPoint || 10} DH = 1 pt · ${m.objectif} pts` : `${m.objectif} ${m.unite || "visites"}`)} = ${esc(m.recompense || "—")}</small></div>
        <span class="pts">${esc(prixTxt(m) || "—")}</span></div>`).join("");
    };
    dessiner();
    const sauver = async () => { await db.doc("settings/fidMetiers").set({ json: JSON.stringify(METIERS), maj: NOW(), par: email }); dessiner(); toast("Métiers enregistrés ✓"); };
    let reset = false;
    d.addEventListener("click", async e => {
      const ed = e.target.closest("[data-medit]"); if (ed) { metierForm(ed.dataset.medit, sauver); return; }
      if (e.target.closest("[data-madd]")) { metierForm(null, sauver); return; }
      const r = e.target.closest("[data-mreset]");
      if (r) { if (!reset) { reset = true; r.textContent = "Confirmer : remettre les modèles de départ"; return; } METIERS = JSON.parse(JSON.stringify(METIERS_BASE)); delete METIERS._retires; try { await sauver(); } catch (x) { erreur(x); } reset = false; r.textContent = "Revenir aux modèles NFCWORK"; }
    });
  }
  function metierForm(cle, sauver) {
    const m = Object.assign({ ico: "✨", nom: "", type: "visites", objectif: 10, unite: "visites", dhParPoint: 10, recompense: "", employes: false, prix: "", periode: "an", guide: "" }, cle ? METIERS[cle] : {});
    const ICOS = ["✂️", "☕", "🌯", "🍽️", "👕", "🏠", "🚗", "💅", "🧖", "🏋️", "🥐", "🍕", "🍦", "🧺", "💊", "📱", "🎮", "🛒", "🚕", "✨"];
    const d = fenetre(`<div class="row between"><h2>${cle ? "Modifier le métier" : "Nouveau métier"}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <form class="stack" id="mf" style="margin-top:10px">
        <div><div class="eyebrow" style="margin-bottom:6px">Icône</div><div class="row" style="gap:6px" id="icos">${ICOS.map(i => `<button type="button" class="btn sm" data-ico="${i}" aria-pressed="${m.ico === i}" style="font-size:20px;min-width:44px${m.ico === i ? ";border-color:var(--accent);background:var(--accent-soft)" : ""}">${i}</button>`).join("")}</div></div>
        <label class="f">Nom du métier<input id="m-nom" required maxlength="40" value="${esc(m.nom)}" placeholder="Salon de beauté, Hammam, Pressing…"></label>
        <div class="grid2"><label class="f">Prix (DH)<input id="m-prix" type="number" min="0" inputmode="numeric" value="${esc(m.prix)}" placeholder="199"></label>
          <label class="f">Période<select id="m-per">${Object.entries(PERIODES).map(([k, v]) => `<option value="${k}" ${m.periode === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
        <div><div class="eyebrow" style="margin-bottom:6px">Le client gagne des points par…</div>
          <div class="seg3" id="m-type">${Object.entries(TYPES).map(([k, [a, b]]) => `<button type="button" data-v="${k}" aria-pressed="${m.type === k}"><b>${a}</b><small class="muted">${b}</small></button>`).join("")}</div></div>
        <div class="grid2"><label class="f">Objectif<input id="m-obj" type="number" min="1" max="1000" value="${esc(m.objectif)}" inputmode="numeric"></label>
          <label class="f" id="m-uw">Unité<input id="m-unite" maxlength="20" value="${esc(m.unite)}" placeholder="séances, lavages…"></label></div>
        <label class="f" id="m-dhw">DH pour 1 point<input id="m-dh" type="number" min="1" max="1000" value="${esc(m.dhParPoint)}" inputmode="numeric"></label>
        <label class="f">Récompense<input id="m-rec" maxlength="80" value="${esc(m.recompense)}" placeholder="La 6e séance offerte"></label>
        <label class="f">Comment ça marche (affiché au client, une étape par ligne)<textarea id="m-guide" maxlength="400" rows="3" placeholder="Montrez votre carte à chaque visite&#10;Après 5 séances, la 6e est offerte">${esc(m.guide)}</textarea></label>
        <label class="f">💡 Idées de récompenses (une par ligne : « 10 cafés = 1 café offert » ou « 10 DH = 1 pt, 200 pts = -50 DH »)<textarea id="m-idees" rows="4" maxlength="800">${esc(ideesTxt(m.idees))}</textarea></label>
        <label class="check"><input type="checkbox" id="m-emp" ${m.employes ? "checked" : ""}> Points des employés activés par défaut</label>
        <p class="err" id="merr"></p>
        <div class="row"><button class="btn primary" style="flex:1">Enregistrer</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
        ${cle ? `<button type="button" class="btn sm danger" id="m-del">Supprimer ce métier</button>` : ""}
      </form>`);
    let type = m.type, ico = m.ico;
    const maj = () => { $("#m-dhw", d).hidden = type !== "montant"; };
    maj();
    d.addEventListener("click", e => {
      const i = e.target.closest("[data-ico]");
      if (i) { ico = i.dataset.ico; d.querySelectorAll("[data-ico]").forEach(x => { const on = x === i; x.setAttribute("aria-pressed", on); x.style.borderColor = on ? "var(--accent)" : ""; x.style.background = on ? "var(--accent-soft)" : ""; }); return; }
      const t = e.target.closest("#m-type [data-v]");
      if (t) { type = t.dataset.v; d.querySelectorAll("#m-type [data-v]").forEach(x => x.setAttribute("aria-pressed", x === t)); if (type === "montant" && !cle) $("#m-unite", d).value = "points"; maj(); }
    });
    const del = $("#m-del", d); let conf = false;
    if (del) del.onclick = async () => { if (!conf) { conf = true; del.textContent = "Confirmer la suppression"; return; } const old = METIERS[cle]; delete METIERS[cle]; if (METIERS_BASE[cle]) METIERS._retires = [...new Set([...(METIERS._retires || []), cle])]; try { await sauver(); d.remove(); } catch (x) { METIERS[cle] = old; erreur(x); } };
    $("#mf", d).onsubmit = async e => {
      e.preventDefault();
      const nom = $("#m-nom", d).value.trim(); if (!nom) return;
      const num = (id, mn, mx, def) => Math.max(mn, Math.min(mx, parseInt($(id, d).value, 10) || def));
      const k = cle || (slugify(nom).replace(/-/g, "").slice(0, 16) || "metier") + rid(3);
      const ancien = METIERS[k];
      METIERS[k] = { ico, nom, type, objectif: num("#m-obj", 1, 1000, 10), unite: $("#m-unite", d).value.trim() || (type === "montant" ? "points" : "visites"),
        dhParPoint: num("#m-dh", 1, 1000, 10), recompense: $("#m-rec", d).value.trim(), employes: $("#m-emp", d).checked,
        prix: parseInt($("#m-prix", d).value, 10) || 0, periode: $("#m-per", d).value, guide: $("#m-guide", d).value.trim().slice(0, 400), idees: lireIdees($("#m-idees", d).value) };
      const b = e.target.querySelector("button.primary"); b.disabled = true;
      try { await sauver(); d.remove(); }
      catch (x) { if (ancien) METIERS[k] = ancien; else delete METIERS[k]; erreur(x); b.disabled = false; }
    };
  }

  /* ================= Tableau de bord d'un commerce ================= */
  const WALLET = String(window.NFCW_WALLET || "").replace(/\/+$/, "");
  const walletSync = cid => fetch(WALLET + "/google/sync?c=" + encodeURIComponent(cid), { mode: "no-cors" }).catch(() => {});
  // 📣 message à tous les clients qui ont la carte dans Google Wallet (notification sur leur téléphone)
  function walletMessage() {
    const d = fenetre(`<h2>📣 Message aux clients</h2>
      <p class="muted" style="margin:2px 0 12px;font-size:13.5px">Il arrive en <b>notification</b> sur le téléphone de tous les clients qui ont ajouté la carte dans <b>Google Wallet</b>. Max. 3 messages par jour.</p>
      <label class="f">Titre<input id="wm-t" maxlength="60" placeholder="🎉 Offre du week-end"></label>
      <label class="f">🎟️ Offre valable jusqu’au <span class="muted">(facultatif, sinon 7 jours)</span><input id="wm-fin" type="date"></label>
      <label class="f">Message<textarea id="wm-x" rows="4" maxlength="400" placeholder="Ce samedi : 2 points pour chaque café ! À bientôt chez ${esc(P.nom)}"></textarea></label>
      <p class="err" id="wm-e"></p>
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn primary" id="wm-go" style="flex:1">Envoyer à tous</button><button class="btn ghost" data-fermer>Annuler</button></div>`);
    $("#wm-go", d).onclick = async () => {
      const t = $("#wm-t", d).value.trim(), x = $("#wm-x", d).value.trim(), e = $("#wm-e", d), b = $("#wm-go", d);
      if (!t || !x) { e.textContent = "Écrivez un titre et un message."; return; }
      b.disabled = true; b.textContent = "Envoi…"; e.textContent = "";
      try {
        const tok = await firebase.auth().currentUser.getIdToken();
        const r = await fetch(WALLET + "/google/message", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify({ pid: P.id, titre: t, texte: x, fin: $("#wm-fin", d).value || "" }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.erreur || "erreur " + r.status);
        d.remove(); toast("✅ Message envoyé à tous les clients Google Wallet", true);
      } catch (x2) { b.disabled = false; b.textContent = "Envoyer à tous"; e.textContent = "❌ " + (x2.message || "Échec, réessayez."); }
    };
  }
  // 🎯 relances : clients absents depuis 30 jours, anniversaires du jour
  const dtv = v => !v ? null : v.toDate ? v.toDate() : v.seconds ? new Date(v.seconds * 1000) : new Date(v);
  const absents = () => cartes.filter(c => (c.total || 0) > 0 && (() => { const d = dtv(c.lastAt); return d && !isNaN(d) && Date.now() - d > 30 * 864e5; })());
  const annivs = () => { const d = new Date(), k = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); return cartes.filter(c => c.anniv === k); };
  function relance(type) {
    const L = type === "anniv" ? annivs() : absents();
    if (!L.length) { toast(type === "anniv" ? "Aucun anniversaire aujourd’hui." : "Aucun client absent depuis 30 jours."); return; }
    const t0 = type === "anniv" ? `🎂 Joyeux anniversaire !` : `On ne vous a pas vu depuis un moment 👋`;
    const x0 = type === "anniv" ? `Toute l’équipe ${P.nom} vous souhaite un joyeux anniversaire ! Passez cette semaine : un petit cadeau vous attend 🎁` : `${P.nom} vous offre +1 point si vous passez cette semaine. À très vite !`;
    const d = fenetre(`<h2>${type === "anniv" ? "🎂 Anniversaires du jour" : "😴 Clients absents"} (${L.length})</h2>
      <p class="muted" style="margin:2px 0 10px;font-size:13.5px">${esc(L.slice(0, 8).map(c => c.nom).join(", "))}${L.length > 8 ? "…" : ""}<br>Ils reçoivent une <b>notification</b> s’ils ont la carte dans Google Wallet.</p>
      <label class="f">Titre<input id="rl-t" maxlength="60" value="${esc(t0)}"></label>
      <label class="f">Message<textarea id="rl-x" rows="4" maxlength="400">${esc(x0)}</textarea></label>
      <p class="err" id="rl-e"></p>
      <div class="row" style="gap:8px"><button class="btn primary" id="rl-go" style="flex:1">Envoyer</button><button class="btn ghost" data-fermer>Annuler</button></div>`);
    $("#rl-go", d).onclick = async () => {
      const b = $("#rl-go", d); b.disabled = true; b.textContent = "Envoi…";
      try {
        const tok = await firebase.auth().currentUser.getIdToken();
        const r = await fetch(WALLET + "/google/notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify({ pid: P.id, cartes: L.map(c => c.id), titre: $("#rl-t", d).value.trim(), texte: $("#rl-x", d).value.trim() }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.erreur || "erreur " + r.status);
        d.remove(); toast(`✅ Envoyé à ${j.envoyes} client(s)${j.sansWallet ? ` · ${j.sansWallet} sans Google Wallet` : ""}`, true);
      } catch (x) { b.disabled = false; b.textContent = "Envoyer"; $("#rl-e", d).textContent = "❌ " + (x.message || "Échec, réessayez."); }
    };
  }
  function ouvrirProgramme(pid) {
    unsub(); P = progs.find(x => x.id === pid); cartes = []; employes = []; secret = "";
    if (!admin && P && P.expire && window.NFCW_PREAVIS) NFCW_PREAVIS(P.preavis, P.expire, true);
    entete(P.nom, "Carte fidélité", admin || progs.length > 1 ? "#" : "./");
    const base = q => admin ? q : q.where("ownerEmail", "==", email);
    let premier = true;
    subs.push(base(db.collection("fidCartes").where("pid", "==", pid)).onSnapshot(s => {
      // 📲 Google Wallet : dès que les points d'une carte changent, la carte du téléphone se met à jour
      if (!premier && WALLET && s.docChanges) s.docChanges().forEach(ch => { if (ch.type === "modified" && !ch.doc.metadata.hasPendingWrites) walletSync(ch.doc.id); });
      premier = false;
      cartes = s.docs.map(d => ({ id: d.id, ...d.data() })); renderDash();
    }, erreur));
    subs.push(base(db.collection("fidEmployes").where("pid", "==", pid)).onSnapshot(s => { employes = s.docs.map(d => ({ id: d.id, ...d.data() })); renderDash(); }, e => console.warn(e)));
    renderDash();
  }
  function renderDash() {
    if (!P) return;
    const obj = P.objectif || 10, prets = cartes.filter(c => (c.points || 0) >= obj).length, offerts = cartes.reduce((a, c) => a + (c.recompenses || 0), 0);
    const k = moisCle(), kp = moisCle(null, -1);
    const q = recherche.toLowerCase().replace(/\s/g, "");
    const liste = cartes.filter(c => !q || (c.nom || "").toLowerCase().replace(/\s/g, "").includes(q) || (c.tel || "").replace(/\s/g, "").includes(q))
      .sort((a, b) => (b.points || 0) >= obj && (a.points || 0) < obj ? 1 : (a.points || 0) >= obj && (b.points || 0) < obj ? -1 : (a.nom || "").localeCompare(b.nom || ""));
    const classes = [...employes].filter(e => e.actif !== false).sort((a, b) => ((b.m || {})[k] || 0) - ((a.m || {})[k] || 0));
    const prec = [...employes].sort((a, b) => ((b.m || {})[kp] || 0) - ((a.m || {})[kp] || 0))[0];
    const actif = document.activeElement && document.activeElement.id === "rech" ? document.activeElement.selectionStart : null;
    app.innerHTML = `<div class="row between"><div><h2>${esc(P.nom)}</h2><div class="muted">${esc(obj)} ${unite(P)} = ${esc(P.recompense)}${P.type === "montant" ? ` · ${esc(P.dhParPoint)} DH = 1 pt` : ""}</div></div>
        ${admin ? `<button class="btn sm" data-reglages="${esc(P.id)}">Réglages</button>` : ""}</div>
      ${P.actif === false ? `<div class="notice" style="margin-top:10px">Programme désactivé : les clients ne peuvent pas créer de carte.</div>` : ""}
      <div class="big2"><button class="btn primary" data-act="scan">📷 Scanner</button><button class="btn" data-act="affiches">🖨 Affiches & QR</button></div>
      ${P.modeClient === "caisse" ? `<a class="btn block" href="caisse.html#p=${esc(P.id)}" style="margin-top:8px">📱 Écran caisse : le client scanne le QR qui change</a>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:-4px 0 14px"><button class="btn sm" data-act="lienqr">🔗 Lien & QR code de la carte</button><button class="btn sm" data-act="rapport">📊 Rapport du mois</button>${WALLET ? `<button class="btn sm" data-act="wallet-msg" style="grid-column:1/-1">📣 Message aux clients (notification Wallet)</button>` : ""}</div>
      ${WALLET && (absents().length || annivs().length) ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px">${annivs().length ? `<button class="btn sm" data-act="rl-anniv">🎂 ${annivs().length} anniversaire(s)</button>` : ""}${absents().length ? `<button class="btn sm" data-act="rl-abs">😴 ${absents().length} client(s) absent(s)</button>` : ""}</div>` : ""}
      <div class="stats"><div><b>${cartes.length}</b><span>Clients</span></div><div><b>${prets}</b><span>Récompenses prêtes</span></div><div><b>${offerts}</b><span>Offertes</span></div></div>
      ${P.employes ? `<div class="tabs2"><button data-vue="clients" aria-pressed="${vue === "clients"}">Clients</button><button data-vue="employes" aria-pressed="${vue === "employes"}">Employés</button></div>` : ""}
      ${vue === "employes" && P.employes ? `
        ${prec && ((prec.m || {})[kp] || 0) > 0 ? `<div class="winner">🏆 Gagnant de ${nomMois(kp)} : ${esc(prec.nom)} (${(prec.m || {})[kp]} pts)${P.primeEmploye ? `<br><small>${esc(P.primeEmploye)}</small>` : ""}</div>` : ""}
        <div class="row between" style="margin-bottom:8px"><b>Classement · ${nomMois(k)}</b><button class="btn sm" data-act="emp-add">＋ Employé</button></div>
        <div class="flist">${classes.map((e, i) => `<div class="frow${i === 0 && ((e.m || {})[k] || 0) > 0 ? " first" : ""}"><span class="rank">${i === 0 && ((e.m || {})[k] || 0) > 0 ? "🏆" : i + 1}</span>
          <div class="tx" data-emp="${esc(e.id)}"><b>${esc(e.nom)}</b><small>${(e.m || {})[kp] ? `${nomMois(kp)} : ${(e.m || {})[kp]} pts` : "Touchez pour le QR"}</small></div>
          <span class="pts">${(e.m || {})[k] || 0} pts</span><button class="btn sm primary plus" data-empplus="${esc(e.id)}">+1</button></div>`).join("")
          || `<div class="empty"><p>Ajoutez vos employés : chacun aura son code QR.</p></div>`}</div>`
      : `<label class="f" style="margin-bottom:10px"><input id="rech" placeholder="Rechercher : prénom ou téléphone…" value="${esc(recherche)}" autocomplete="off"></label>
        <div class="flist">${liste.map(c => { const pr = (c.points || 0) >= obj; return `<div class="frow${pr ? " ready" : ""}"><span class="av">${esc((c.nom || "?")[0].toUpperCase())}</span>
          <div class="tx" data-carte="${esc(c.id)}"><b>${esc(c.nom)}</b><small>${esc(c.tel || "")}${pr ? " · 🎁 récompense prête" : ""}</small></div>
          <span class="pts">${c.points || 0}/${obj}</span>${P.type === "visites" ? `<button class="btn sm primary plus" data-plus="${esc(c.id)}">+1</button>` : `<button class="btn sm primary plus" data-carte="${esc(c.id)}">＋</button>`}</div>`; }).join("")
          || `<div class="empty"><p>${cartes.length ? "Aucun client ne correspond." : "Pas encore de clients. Imprimez l’affiche : les clients scannent et créent leur carte."}</p></div>`}</div>`}`;
    const r = $("#rech"); if (r) { r.oninput = e => { recherche = e.target.value; renderDash(); }; if (actif != null) { r.focus(); r.setSelectionRange(actif, actif); } }
  }

  /* ================= Carte d'un client ================= */
  // eid : employé choisi à la caisse ; "" = le client confirmera ; null = personne
  async function ajouter(cid, n, eid) {
    const actifs = employes.filter(e => e.actif !== false), m = modeEmp(P);
    const voteDispo = !!(P.employes && actifs.length && !eid && eid !== null && m !== "visite");
    const b = db.batch(), ref = db.doc("fidCartes/" + cid);
    b.update(ref, { points: inc(n), total: inc(n), lastAt: NOW(), voteDispo, voteEmp: eid || "",
      voteJusqua: firebase.firestore.Timestamp.fromMillis(Date.now() + 3 * 3600e3), voteChoix: voteDispo ? actifs.map(e => ({ id: e.id, nom: e.nom })) : [] });
    if (eid) b.update(db.doc("fidEmployes/" + eid), new firebase.firestore.FieldPath("m", moisCle()), inc(1), "lastAt", NOW());
    try {
      await b.commit();
      const e = eid && employes.find(x => x.id === eid);
      toast(`+${n} ${n > 1 ? unite(P) : "point"}${e ? " · +1 pour " + e.nom : voteDispo ? " · le client choisira l’employé" : ""} ✓`);
      return true;
    } catch (x) { erreur(x); return false; }
  }
  // après le montant / les articles : qui a servi ? (si les employés sont activés)
  function quiAServi(d, cid, n) {
    const actifs = employes.filter(e => e.actif !== false), m = modeEmp(P);
    if (!P.employes || !actifs.length || m === "confirme") return ajouter(cid, n, m === "confirme" ? "" : null).then(ok => { if (ok) d.remove(); });
    const box = d.querySelector(".box");
    box.innerHTML = `<h2>Qui a servi ?</h2><p class="muted">L’employé choisi gagne 1 point.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">${actifs.map(e => `<button class="btn addbtn" data-qui="${esc(e.id)}">${esc(e.nom)}</button>`).join("")}</div>
      <button class="btn ghost" style="width:100%;margin-top:8px" data-qui="${m === "les2" ? "" : "-"}">${m === "les2" ? "Le client choisira" : "Personne / passer"}</button>`;
    box.onclick = async e => {
      const q = e.target.closest("[data-qui]"); if (!q) return;
      box.querySelectorAll("button").forEach(x => (x.disabled = true));
      const v = q.dataset.qui;
      if (await ajouter(cid, n, v === "-" ? null : v)) d.remove(); else box.querySelectorAll("button").forEach(x => (x.disabled = false));
    };
  }
  function carteVue(cid) {
    const c = cartes.find(x => x.id === cid); if (!c) { toast("Carte introuvable dans ce commerce."); return; }
    const obj = P.objectif || 10, pts = c.points || 0, pr = pts >= obj, lien = SITE + "/f/?c=" + c.id, wa = waNum(c.tel);
    const d = fenetre(`<div class="row between"><h2>${esc(c.nom)}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <div class="muted">${esc(c.tel || "")}${c.recompenses ? ` · ${c.recompenses} récompense${c.recompenses > 1 ? "s" : ""} déjà offerte${c.recompenses > 1 ? "s" : ""}` : ""}</div>
      <div class="cardview" style="--accent:${esc(P.couleur || "#1e90ff")}"><div class="n">${esc(P.nom)}</div><div class="p">${pts} <small>/ ${obj} ${unite(P)}</small></div><div class="bar"><i style="width:${Math.min(100, pts / obj * 100)}%"></i></div></div>
      ${pr ? `<button class="btn primary addbtn" style="width:100%;background:var(--warn);border-color:var(--warn);color:#2a1300" id="cv-rec">🎁 Offrir : ${esc(P.recompense)}</button>` : ""}
      <div class="stack" style="margin-top:12px">
        ${P.type === "visites" ? `<button class="btn primary addbtn" id="cv-add">+1 ${esc(unite(P).replace(/s$/, ""))}</button>`
          : P.type === "articles" ? `<div class="stepper"><button type="button" data-st="-1">−</button><input id="cv-n" type="number" min="1" max="99" value="1" inputmode="numeric"><button type="button" data-st="1">+</button></div><button class="btn primary addbtn" id="cv-add">Ajouter les articles</button>`
          : `<label class="f">Montant de l’achat (DH)<input id="cv-dh" type="number" min="1" inputmode="decimal" placeholder="120" style="font-size:22px;text-align:center"></label><div class="muted" id="cv-calc" style="text-align:center">= 0 point</div><button class="btn primary addbtn" id="cv-add">Ajouter les points</button>`}
        ${P.lienAvis && !c.avisOk ? `<button class="btn" id="cv-avis" style="width:100%">⭐ Il a laissé un avis Google : +1 point</button>` : c.avisOk ? `<div class="muted" style="text-align:center;font-size:13px">⭐ Avis Google déjà récompensé</div>` : ""}
        <div class="row">${wa ? `<a class="btn sm" style="flex:1" href="https://wa.me/${wa}?text=${encodeURIComponent("Votre carte fidélité " + P.nom + " : " + lien)}" target="_blank" rel="noopener">Envoyer sa carte (WhatsApp)</a>` : ""}<button class="btn sm ghost" id="cv-moins">Retirer 1</button></div>
        <button class="btn sm danger" id="cv-del">Supprimer cette carte</button>
      </div>`);
    const nb = () => Math.max(1, Math.min(99, parseInt(($("#cv-n", d) || {}).value, 10) || 1));
    d.addEventListener("click", e => { const s = e.target.closest("[data-st]"); if (s) $("#cv-n", d).value = Math.max(1, Math.min(99, nb() + +s.dataset.st)); });
    const dh = $("#cv-dh", d), pts2 = () => Math.floor((parseFloat((dh || {}).value) || 0) / (P.dhParPoint || 10));
    if (dh) { dh.oninput = () => { $("#cv-calc", d).textContent = "= " + pts2() + " point" + (pts2() > 1 ? "s" : ""); }; setTimeout(() => dh.focus(), 100); }
    $("#cv-add", d).onclick = () => {
      const n = P.type === "visites" ? 1 : P.type === "articles" ? nb() : pts2();
      if (n < 1) { toast("Montant trop petit pour 1 point."); return; }
      quiAServi(d, c.id, n);
    };
    const av = $("#cv-avis", d);
    if (av) av.onclick = async () => {
      av.disabled = true;
      try { await db.doc("fidCartes/" + c.id).update({ points: inc(1), total: inc(1), lastAt: NOW(), avisOk: true, avisAt: NOW() }); }
      catch (e) { try { await db.doc("fidCartes/" + c.id).update({ points: inc(1), total: inc(1), lastAt: NOW() }); } catch (x) { erreur(x); av.disabled = false; return; } }
      toast("⭐ +1 point pour l’avis Google"); d.remove();
    };
    const rec = $("#cv-rec", d);
    if (rec) rec.onclick = async () => { rec.disabled = true; try { await db.doc("fidCartes/" + c.id).update({ points: inc(-obj), recompenses: inc(1), lastAt: NOW() }); toast("🎁 Récompense offerte"); d.remove(); } catch (e) { erreur(e); rec.disabled = false; } };
    $("#cv-moins", d).onclick = async () => { if (pts < 1) return; try { await db.doc("fidCartes/" + c.id).update({ points: inc(-1), total: inc(-1) }); toast("1 point retiré"); d.remove(); } catch (e) { erreur(e); } };
    const del = $("#cv-del", d); let conf = false;
    del.onclick = async () => { if (!conf) { conf = true; del.textContent = "Confirmer la suppression"; return; } try { await db.doc("fidCartes/" + c.id).delete(); toast("Carte supprimée"); d.remove(); } catch (e) { erreur(e); } };
  }
  async function ouvrirParCarte(cid) {
    let c = null; try { const s = await db.doc("fidCartes/" + cid).get(); c = s.exists ? { id: s.id, ...s.data() } : null; } catch (e) {}
    if (!c || !progs.some(x => x.id === c.pid)) { renderListe(); toast("Cette carte n’appartient pas à vos commerces.", true); return; }
    if (!P || P.id !== c.pid) ouvrirProgramme(c.pid);
    if (!cartes.some(x => x.id === cid)) cartes.push(c);
    carteVue(cid);
  }

  /* ================= Employés ================= */
  async function empPlus(eid) {
    try { await db.doc("fidEmployes/" + eid).update(new firebase.firestore.FieldPath("m", moisCle()), inc(1), "lastAt", NOW()); const e = employes.find(x => x.id === eid); toast("+1 pour " + (e ? e.nom : "l’employé") + " ✓"); }
    catch (e) { erreur(e); }
  }
  function empAjout() {
    const d = fenetre(`<h2>Nouvel employé</h2><form class="stack" id="ef"><label class="f">Prénom<input id="en" required maxlength="40" placeholder="Karim"></label>
      <div class="row"><button class="btn primary" style="flex:1">Ajouter</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div></form>`);
    $("#en", d).focus();
    $("#ef", d).onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true;
      try { await db.collection("fidEmployes").doc(rid(14)).set({ pid: P.id, ownerEmail: P.ownerEmail || email, nom: $("#en", d).value.trim(), m: {}, actif: true, lastAt: new Date(0), createdAt: NOW() }); d.remove(); toast("Employé ajouté ✓"); }
      catch (x) { erreur(x); b.disabled = false; }
    };
  }
  function empVue(eid) {
    const e = employes.find(x => x.id === eid); if (!e) return;
    const k = moisCle(), lien = SITE + "/f/?e=" + e.id;
    const d = fenetre(`<div class="row between"><h2>${esc(e.nom)}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <div style="background:#fff;border-radius:16px;padding:14px;margin:10px 0;text-align:center;color:#05080f">${window.QRGEN.svg(lien, { marge: 1 })}<small>Son QR : il voit ses points du mois</small></div>
      <div class="muted" style="text-align:center;margin-bottom:12px">${nomMois(k)} : <b>${(e.m || {})[k] || 0}</b> points</div>
      <div class="stack"><button class="btn" id="ev-plus">Correction : +1 point</button>
      <button class="btn" id="ev-print">🖨 Imprimer son QR</button><button class="btn sm danger" id="ev-del">Retirer cet employé</button></div>`);
    $("#ev-plus", d).onclick = async () => { await empPlus(e.id); d.remove(); };
    $("#ev-print", d).onclick = () => imprimerEmployes([e]);
    let conf = false; const del = $("#ev-del", d);
    del.onclick = async () => { if (!conf) { conf = true; del.textContent = "Confirmer : retirer " + e.nom; return; } try { await db.doc("fidEmployes/" + e.id).delete(); d.remove(); toast("Employé retiré"); } catch (x) { erreur(x); } };
  }
  async function ouvrirParEmploye(eid) {
    let e = null; try { const s = await db.doc("fidEmployes/" + eid).get(); e = s.exists ? { id: s.id, ...s.data() } : null; } catch (x) {}
    if (!e || !progs.some(x => x.id === e.pid)) { renderListe(); toast("Cet employé n’appartient pas à vos commerces.", true); return; }
    if (!P || P.id !== e.pid) ouvrirProgramme(e.pid);
    vue = "employes"; if (!employes.some(x => x.id === eid)) employes.push(e);
    renderDash(); empVue(eid);
  }

  /* ================= Scanner (carte client ou code employé) ================= */
  let jsqr = null;
  const chargerJsQR = () => jsqr || (jsqr = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "../assets/js/jsQR.js"; s.onload = ok; s.onerror = () => { jsqr = null; ko(); }; document.head.appendChild(s); }));
  async function scanner() {
    let flux = null, fini = false;
    const d = fenetre(`<div class="row between"><h2>Scanner</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <div class="scan"><video id="cam" playsinline muted></video></div>
      <p class="muted" style="text-align:center;margin:6px 0 0;font-size:13.5px" id="sm">Visez la carte du client ou le code d’un employé.</p>
      <label class="btn block" style="margin-top:10px">📸 Prendre le QR en photo<input type="file" accept="image/*" capture="environment" hidden id="scan-photo"></label>`);
    // secours : une photo du QR (marche partout, même quand la caméra en direct est bloquée)
    $("#scan-photo", d).onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      $("#sm", d).textContent = "Lecture de la photo…";
      try {
        await chargerJsQR();
        const url = URL.createObjectURL(f), img = new Image();
        await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
        const k = Math.min(1, 1200 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const g = cv.getContext("2d"); g.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        const r = jsQR(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: "attemptBoth" });
        if (!(r && r.data && trouve(r.data))) $("#sm", d).textContent = "QR non trouvé : reprenez la photo plus près, bien nette.";
      } catch (x) { $("#sm", d).textContent = "Photo illisible, réessayez."; }
      e.target.value = "";
    };
    const stop = () => { fini = true; if (flux) flux.getTracks().forEach(t => t.stop()); };
    d.addEventListener("fermee", stop);
    const trouve = txt => {
      const c = (txt.match(/[?&]c=([A-Za-z0-9_-]+)/) || [])[1], e = (txt.match(/[?&]e=([A-Za-z0-9_-]+)/) || [])[1];
      if (!c && !e) { $("#sm", d).textContent = "Ce QR n’est pas une carte fidélité NFCWORK."; return false; }
      stop(); d.remove();
      if (c) { if (cartes.some(x => x.id === c)) carteVue(c); else ouvrirParCarte(c); }
      else ouvrirParEmploye(e);
      return true;
    };
    try {
      await chargerJsQR();
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      const v = $("#cam", d); v.srcObject = flux; await v.play();
      const cv = document.createElement("canvas"), g = cv.getContext("2d", { willReadFrequently: true });
      const tour = () => {
        if (fini) return;
        if (v.videoWidth) {
          const k = Math.min(1, 640 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k;
          g.drawImage(v, 0, 0, cv.width, cv.height);
          const r = jsQR(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: "dontInvert" });
          if (r && r.data && trouve(r.data)) return;
        }
        requestAnimationFrame(tour);
      };
      tour();
    } catch (e) {
      console.warn(e);
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      $("#sm", d).innerHTML = e && e.name === "NotAllowedError"
        ? (ios ? "Caméra refusée. Touchez <b>📸 Prendre le QR en photo</b>, ou autorisez la caméra : <b>Réglages → Safari → Caméra → Autoriser</b>, puis rouvrez cette page dans <b>Safari</b>."
               : "Caméra refusée. Touchez <b>📸 Prendre le QR en photo</b>, ou autorisez la caméra (🔒 à côté de l’adresse → Caméra → Autoriser).")
        : "Caméra en direct indisponible ici. Touchez <b>📸 Prendre le QR en photo</b> : ça marche aussi.";
    }
  }

  /* ================= Affiches à imprimer ================= */
  // lien d'inscription + QR code d'un programme (copier, WhatsApp, télécharger en image)
  /* ================= Rapport du mois (à envoyer au commerçant sur WhatsApp) ================= */
  function rapport() {
    const dt = v => !v ? null : v.toDate ? v.toDate() : v.seconds ? new Date(v.seconds * 1000) : new Date(v);
    const k = moisCle(), deb = new Date(); deb.setDate(1); deb.setHours(0, 0, 0, 0);
    const ceMois = v => { const d = dt(v); return d && !isNaN(d) && d >= deb; };
    const nomMois = deb.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const nouveaux = cartes.filter(c => ceMois(c.createdAt)).length;
    const venus = cartes.filter(c => ceMois(c.lastAt)).length;
    const offertes = cartes.reduce((a, c) => a + (c.recompenses || 0), 0);
    const pretes = cartes.filter(c => (c.points || 0) >= Math.max(1, P.objectif || 10)).length;
    const top = [...employes].filter(e => ((e.m || {})[k] || 0) > 0).sort((a, b) => (b.m[k] || 0) - (a.m[k] || 0))[0];
    const fidele = [...cartes].sort((a, b) => (b.total || 0) - (a.total || 0))[0];
    const avisMois = cartes.filter(c => ceMois(c.avisAt)).length;
    const txt = [`📊 Rapport fidélité · ${P.nom} · ${nomMois}`, "",
      `👥 Clients inscrits : ${cartes.length}${nouveaux ? ` (dont ${nouveaux} nouveaux ce mois)` : ""}`,
      `🔄 Clients revenus ce mois : ${venus}`,
      `🎁 Récompenses offertes depuis le début : ${offertes}`,
      avisMois ? `⭐ Avis Google récompensés ce mois : ${avisMois}` : "",
      pretes ? `⏳ Récompenses prêtes à offrir : ${pretes}` : "",
      fidele && fidele.total ? `⭐ Client le plus fidèle : ${fidele.nom || "—"} (${fidele.total} ${unite(P)})` : "",
      top ? `🏆 Employé du mois : ${top.nom} (${top.m[k]} points)` : "",
      "", "Merci pour votre confiance · NFCWORK"].filter((l, i, a) => l || (a[i - 1] && a[i - 1] !== "")).join("\n");
    const d = fenetre(`<div class="row between"><h2>📊 Rapport du mois</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="margin:4px 0 10px">Envoyez-le au commerçant chaque mois : il voit ce que la carte fidélité lui rapporte.</p>
      <textarea id="rp-t" rows="11" style="width:100%;font:inherit;font-size:14px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg)">${esc(txt)}</textarea>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn sm primary" id="rp-wa">Envoyer sur WhatsApp</button><button class="btn sm" id="rp-copier">Copier</button></div>`);
    let telPatron = "";
    db.collection("clients").where("email", "==", String(P.ownerEmail || "").toLowerCase()).get().then(s => { const c = s.docs[0] && s.docs[0].data(); telPatron = waNum(c && (c.whatsapp || c.tel || c.phone)); if (telPatron) $("#rp-wa", d).textContent = "Envoyer au commerçant (WhatsApp)"; }).catch(() => {});
    $("#rp-wa", d).onclick = () => window.open("https://wa.me/" + telPatron + "?text=" + encodeURIComponent($("#rp-t", d).value), "_blank");
    $("#rp-copier", d).onclick = async () => { try { await navigator.clipboard.writeText($("#rp-t", d).value); toast("Rapport copié"); } catch (e) { prompt("Copiez :", $("#rp-t", d).value); } };
  }

  // lien propre : nfcwork.ma/f/<nom> (les anciens programmes « nom-x7k2 » reçoivent un alias settings/fidlien-<nom>)
  async function lienCourt(prog) {
    if (prog.court) return SITE + "/f/" + prog.court;
    const base = prog.id.replace(/-[a-z0-9]{4}$/, "");
    if (base === prog.id || !base) return SITE + "/f/" + prog.id;
    try {
      const a = await db.doc("settings/fidlien-" + base).get(), pr = await db.doc("fidProgrammes/" + base).get();
      if (!pr.exists && (!a.exists || a.data().pid === prog.id)) {
        if (!a.exists) await db.doc("settings/fidlien-" + base).set({ pid: prog.id, maj: NOW() });
        await db.doc("fidProgrammes/" + prog.id).update({ court: base }); prog.court = base;
        return SITE + "/f/" + base;
      }
    } catch (e) { console.warn("lien court", e); }
    return SITE + "/f/" + prog.id;
  }
  async function idLibre(nom) {
    const b = slugify(nom) || "carte"; let id = b, i = 2;
    for (;;) { const [x, y] = await Promise.all([db.doc("fidProgrammes/" + id).get(), db.doc("settings/fidlien-" + id).get()]); if (!x.exists && !y.exists) return id; id = b + "-" + i++; }
  }
  async function lienQR(prog, neuf) {
    const lien = await lienCourt(prog);
    const d = fenetre(`<div class="row between"><h2>${neuf ? "✅ Carte fidélité créée" : "Lien et QR de la carte"}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="margin:4px 0 12px">Imprimez ce QR ou envoyez le lien : vos clients créent leur carte en 10 secondes.</p>
      <div class="qrbox"><div class="q">${window.QRGEN.svg(lien, { marge: 1, couleur: "#05080f" })}</div>
        <div style="flex:1;min-width:160px"><b>${esc(prog.nom)}</b><div class="u" style="margin:4px 0 10px">${esc(lien)}</div>
          <div class="stack" style="gap:6px"><button class="btn sm primary" id="lq-copier">Copier le lien</button>
            <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("Votre carte fidélité " + prog.nom + " : " + lien)}">Partager sur WhatsApp</a>
            <button class="btn sm" id="lq-png">Télécharger le QR</button><button class="btn sm" id="lq-nfc">📲 Écrire sur la puce</button></div></div></div>
      <div class="row" style="margin-top:12px"><a class="btn sm ghost" href="${esc(lien)}" target="_blank" rel="noopener">Voir la page client</a>${neuf ? `<a class="btn sm" href="#p=${esc(prog.id)}" data-fermer>Ouvrir le tableau de bord</a>` : ""}</div>`);
    $("#lq-nfc", d).onclick = () => window.NFCW_ECRIRE ? window.NFCW_ECRIRE(lien, prog.nom) : toast("NFC indisponible");
    $("#lq-copier", d).onclick = async () => { try { await navigator.clipboard.writeText(lien); toast("Lien copié"); } catch (e) { prompt("Copiez le lien :", lien); } };
    $("#lq-png", d).onclick = () => {
      let svg = window.QRGEN.svg(lien, { marge: 2, couleur: "#05080f" });
      if (!/xmlns=/.test(svg)) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      svg = svg.replace("<svg", '<svg width="1000" height="1000"');
      const img = new Image();
      img.onload = () => {
        const W = 1000, c = document.createElement("canvas"); c.width = W; c.height = W + 140;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, W, W);
        g.fillStyle = "#05080f"; g.font = "700 52px system-ui, sans-serif"; g.textAlign = "center"; g.fillText(String(prog.nom || ""), W / 2, W + 60);
        g.font = "400 34px system-ui, sans-serif"; g.fillStyle = "#5b6b85"; g.fillText("Carte fidélité · scannez pour créer votre carte", W / 2, W + 112);
        const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "QR-fidelite-" + prog.id + ".png"; document.body.appendChild(a); a.click(); a.remove();
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    };
  }
  async function affiches() {
    const lienCaisse = await lienCourt(P);
    const d = fenetre(`<div class="row between"><h2>Affiches & QR</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted">QR d’inscription : le client crée sa carte en 10 secondes. Ensuite, c’est vous qui scannez sa carte à chaque achat (impossible de tricher).</p>
      <div style="background:#fff;border-radius:16px;padding:14px;margin:10px auto;max-width:260px">${window.QRGEN.svg(lienCaisse, { marge: 1 })}</div>
      <div class="stack"><button class="btn primary" id="a1">🖨 Affiche A4 pour la caisse</button><button class="btn" id="a2">🖨 12 stickers (tables, comptoir)</button>
      ${P.employes && employes.length ? `<button class="btn" id="a3">🖨 QR des employés (${employes.length})</button>` : ""}
      <p class="muted" style="font-size:12.5px;margin:0">Sur Mac : Imprimer → « Enregistrer au format PDF » pour l’imprimeur. Le même lien peut aussi être programmé dans une plaque NFC.</p></div>`);
    const rule = P.type === "montant" ? `${P.objectif} points = ${P.recompense}` : `${P.objectif} ${unite(P)} = ${P.recompense}`;
    $("#a1", d).onclick = () => {
      $("#planche").innerHTML = `<div class="page">${logoSrc(P) ? `<img src="${esc(logoSrc(P))}" alt="" style="height:30mm;border-radius:6mm">` : `<img src="../assets/img/logo-nfcwork.png" alt="">`}<div class="t">Carte fidélité</div><div class="shop">${esc(P.nom)}</div>
        <div class="rule">🎁 ${esc(rule)}</div>${window.QRGEN.svg(lienCaisse, { marge: 1, couleur: "#05080f" })}
        <div class="steps">1. Scannez · 2. Entrez votre prénom · 3. Montrez votre carte à chaque visite</div></div>`;
      window.print();
    };
    $("#a2", d).onclick = () => {
      $("#planche").innerHTML = `<div class="grid12">${Array.from({ length: 12 }, () => `<div class="stk">${window.QRGEN.svg(lienCaisse, { marge: 1, couleur: "#05080f" })}<b>${esc(P.nom)}</b><small>Carte fidélité · ${esc(rule)}</small></div>`).join("")}</div>`;
      window.print();
    };
    const a3 = $("#a3", d); if (a3) a3.onclick = () => imprimerEmployes(employes);
  }
  function imprimerEmployes(liste) {
    const pages = []; for (let i = 0; i < liste.length; i += 12) pages.push(liste.slice(i, i + 12));
    $("#planche").innerHTML = pages.map(pg => `<div class="grid12">${pg.map(e => `<div class="stk">${window.QRGEN.svg(SITE + "/f/?e=" + e.id, { marge: 1, couleur: "#05080f" })}<b>${esc(e.nom)}</b><small>${esc(P.nom)} · mes points</small></div>`).join("")}</div>`).join("");
    window.print();
  }

  /* ================= Clics ================= */
  document.addEventListener("click", e => {
    if (e.target.closest(".modal")) return;
    const t = (sel) => e.target.closest(sel);
    let b;
    if ((b = t("[data-reglages]"))) return void reglages(b.dataset.reglages);
    if ((b = t("[data-lienqr]"))) return void lienQR(progs.find(x => x.id === b.dataset.lienqr), false);
    if ((b = t("[data-vue]"))) { vue = b.dataset.vue; return void renderDash(); }
    if ((b = t("[data-plus]"))) { const d = fenetre(""); return void quiAServi(d, b.dataset.plus, 1); }
    if ((b = t("[data-carte]"))) return void carteVue(b.dataset.carte);
    if ((b = t("[data-empplus]"))) { b.disabled = true; return void empPlus(b.dataset.empplus); }
    if ((b = t("[data-emp]"))) return void empVue(b.dataset.emp);
    if ((b = t("[data-act]"))) {
      const a = b.dataset.act;
      if (a === "nouveau") reglages(null);
      if (a === "metiers") metiersVue();
      if (a === "scan") scanner();
      if (a === "affiches") affiches();
      if (a === "lienqr") lienQR(P, false);
      if (a === "rapport") rapport();
      if (a === "wallet-msg" && WALLET) walletMessage();
      if (a === "rl-anniv" && WALLET) relance("anniv");
      if (a === "rl-abs" && WALLET) relance("abs");
      if (a === "emp-add") empAjout();
    }
  });
  function fenetre(html) {
    const d = document.createElement("div");
    d.className = "modal";
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d);
    const fermer = () => { d.remove(); d.dispatchEvent(new Event("fermee")); };
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-fermer]")) fermer(); });
    return d;
  }
})();
