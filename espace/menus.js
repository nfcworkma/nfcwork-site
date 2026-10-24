/* =========================================================
   NFCWORK — ÉDITEUR DES MENUS DIGITAUX (admin seulement)
   Enregistrement dans Firestore, collection « settings » (lecture publique,
   écriture admin — règle déjà en place) :
     settings/menus          → liste des menus  { json: "[{slug, nom, formule, actif, maj}]" }
     settings/menu-<slug>    → un menu          { json: "{...}", v, maj, par }
     settings/mimg-<id>      → une photo        { data: "data:image/...", menu }
   Page publique : nfcwork.ma/menu/<slug>  (menu/index.html + menu/menu.js)
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
  const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
  const NOW = () => firebase.firestore.FieldValue.serverTimestamp();

  const FORMULES = {
    standard: ["Standard", "Photos de la carte"],
    pro: ["Pro", "Menu designé"],
    premium: ["Premium", "Pro + langues + WhatsApp"]
  };
  // type de commerce : change les mots du menu et ce qu'on demande au client
  const TYPES_COM = { resto: ["🍽", "Restaurant · café", "Commande, livraison, réservation"], boutique: ["🛍", "Boutique", "Catalogue de produits"], salon: ["💈", "Salon · beauté", "Prise de rendez-vous"], hotel: ["🏨", "Hôtel", "Room service par chambre"], location: ["🚗", "Location de voitures", "Voitures, prix par jour, réservation"] };
  const JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const LANGS = { fr: "Français", ar: "العربية", en: "English" };
  const LCOURT = { fr: "FR", ar: "AR", en: "EN" };
  const THEMES = { nuit: ["Nuit", "#0d0f14", "#e0b15c"], creme: ["Crème", "#f6f0e6", "#b5552b"], cafe: ["Café", "#1d1410", "#d99a4e"], lagon: ["Lagon", "#f2f7f6", "#0f8a7e"] };
  const SITE = location.origin;
  const lienPublic = s => SITE + "/menu/" + s;

  let user = null;
  let liste = [];               // index des menus
  let M = null;                 // menu ouvert
  let saved = "";               // JSON du menu tel qu'enregistré
  let savedIds = new Set();     // photos utilisées par la version enregistrée
  const pending = new Set();    // photos envoyées mais pas encore enregistrées dans le menu
  const IMG = {};               // id → data URL (déjà chargées)

  const rid = (n = 10) => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const slugify = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const dirty = () => M && JSON.stringify(M) !== saved;
  const idsDe = m => [m.logo, m.couverture, ...(m.pages || []), ...(m.categories || []).flatMap(c => (c.items || []).map(i => i.photo))].filter(Boolean);
  const langsEdition = () => ["fr"];   // menus en français uniquement
  const enLigne = id => /^(u:|o:|\/|bq)/.test(id || "");   // photo de la banque ou du site : rien à stocker ni à effacer
  const T = (o, l) => (o && typeof o === "object" ? o[l] : l === (M.langues[0] || "fr") ? o : "") || "";

  /* ================= Connexion ================= */
  auth.onAuthStateChanged(u => {
    user = u;
    if (!u) { renderLogin(); return; }
    if ((u.email || "").toLowerCase() !== ADMIN) { modeProprio(u); return; }
    chargerListe().then(route);
  });

  /* ---------- ✏️ mode commerçant : il modifie seulement SES menus (accès donné dans sa fiche client) ---------- */
  let PROPRIO = false;
  async function modeProprio(u) {
    const refuse = () => { app.innerHTML = `<div class="empty"><h3>Accès réservé</h3><p>Demandez à NFCWORK d’activer la modification de votre menu.</p><a class="btn" href="./">Retour à mon espace</a></div>`; };
    try {
      if (!u.emailVerified) { refuse(); return; }
      const s = await db.collection("clients").where("email", "==", (u.email || "").toLowerCase()).get();
      const c = s.docs.length ? s.docs[0].data() : null, ac = c && c.acces;
      if (!ac || !ac.edit || !(ac.menus || []).length) { refuse(); return; }
      await chargerListe();
      const noms = Object.fromEntries(liste.map(x => [x.slug, x]));
      liste = ac.menus.map(sl => Object.assign({ slug: sl, nom: sl, formule: "premium" }, noms[sl] || {}));
      PROPRIO = true; document.body.classList.add("proprio");
      if (liste.length === 1 && !location.hash.startsWith("#m=")) location.hash = "#m=" + liste[0].slug;
      route();
    } catch (e) { console.error(e); refuse(); }
  }

  function renderLogin() {
    app.innerHTML = `<div class="auth paper"><h2>Connexion</h2><p class="muted">Connectez-vous avec le compte administrateur.</p>
      <form id="lf" class="stack"><label class="f">E-mail<input id="le" type="email" autocomplete="email" required></label>
      <label class="f">Mot de passe<input id="lp" type="password" autocomplete="current-password" required></label><p class="err" id="lerr"></p>
      <button class="btn primary">Se connecter</button></form></div>`;
    $("#lf").onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true;
      try { await auth.signInWithEmailAndPassword($("#le").value.trim(), $("#lp").value); }
      catch (x) { $("#lerr").textContent = "E-mail ou mot de passe incorrect."; b.disabled = false; }
    };
  }

  /* ================= Firestore ================= */
  async function chargerListe() {
    try {
      const d = await db.doc("settings/menus").get();
      liste = d.exists ? JSON.parse(d.data().json || "[]") : [];
    } catch (e) { console.error(e); liste = []; toast("Impossible de lire la liste des menus."); }
  }
  async function ecrireListe() {
    if (PROPRIO) return;   // la liste générale reste gérée par NFCWORK
    await db.doc("settings/menus").set({ json: JSON.stringify(liste), maj: NOW(), par: user.email });
  }
  function erreur(e) {
    console.error(e);
    if (e && e.code === "permission-denied") toast("Enregistrement refusé par Firebase : vérifiez que vous êtes connecté avec l’e-mail admin.", true);
    else toast("Échec de l’enregistrement. Vérifiez la connexion et réessayez.", true);
  }

  async function chargerImg(id) {
    if (!id || IMG[id]) return IMG[id];
    const direct = id.startsWith("u:") ? window.BANQUE_URL(id.slice(2), 400) : id.startsWith("o:") ? window.PHOTO_AUTO.url(id, 400) : id.startsWith("/") ? id : "";
    if (direct) IMG[id] = direct;
    else try {
      const d = await db.doc("settings/mimg-" + id).get();
      if (d.exists) IMG[id] = d.data().data;
    } catch (e) { console.error(e); }
    document.querySelectorAll(`img[data-img="${id}"]`).forEach(el => { if (IMG[id]) el.src = IMG[id]; });
    return IMG[id];
  }
  const imgTag = (id, cls, alt) => `<img class="${cls || ""}" data-img="${esc(id)}" ${IMG[id] ? `src="${IMG[id]}"` : ""} alt="${esc(alt || "")}">`;
  function chargerVisibles() { document.querySelectorAll("img[data-img]").forEach(el => { if (!el.src && el.dataset.img) chargerImg(el.dataset.img); }); }

  /* Photo → JPEG/WebP compressé, toujours < 1 Mo (limite d'un document Firestore) */
  const webpOk = (() => { try { return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp"); } catch (e) { return false; } })();
  function chargerImage(src) {
    return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("illisible")); i.src = src; });
  }
  function encoder(img, { max, cible, logo, rot }) {
    let w = img.naturalWidth, h = img.naturalHeight;
    if (rot % 180) [w, h] = [h, w];
    let k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas"), g = c.getContext("2d");
    const type = webpOk ? "image/webp" : "image/jpeg";
    for (let q = 0.86, essai = 0; essai < 10; essai++) {
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      g.save();
      if (!webpOk || !logo) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); }
      else g.clearRect(0, 0, c.width, c.height);
      g.translate(c.width / 2, c.height / 2); g.rotate((rot || 0) * Math.PI / 180);
      const dw = rot % 180 ? c.height : c.width, dh = rot % 180 ? c.width : c.height;
      g.imageSmoothingQuality = "high"; g.drawImage(img, -dw / 2, -dh / 2, dw, dh); g.restore();
      const d = c.toDataURL(type, q);
      if (d.length < cible) return d;
      if (q > 0.62) q -= 0.08; else k *= 0.85;
    }
    throw new Error("trop lourde");
  }
  async function compresser(fichier, opts) {
    const url = URL.createObjectURL(fichier);
    try { return encoder(await chargerImage(url), { rot: 0, ...opts }); }
    finally { URL.revokeObjectURL(url); }
  }
  const OPTS = {
    page: { max: 1800, cible: 950000 },
    photo: { max: 1000, cible: 380000 },
    cover: { max: 1600, cible: 520000 },
    logo: { max: 480, cible: 200000, logo: true }
  };
  async function envoyerPhoto(data) {
    const id = rid();
    await db.doc("settings/mimg-" + id).set({ data, menu: M.slug, maj: NOW() });
    IMG[id] = data; pending.add(id);
    return id;
  }
  // ✂️ recadrer le logo / la couverture (nouvelle photo, ou celle déjà en place)
  async function recadrer(cle, kind, fichier) {
    try {
      if (!fichier) { const id = M[cle], src = id.startsWith("u:") && window.BANQUE_URL ? window.BANQUE_URL(id.slice(2), 1600) : IMG[id] || await chargerImg(id); if (!src) { toast("Photo introuvable."); return; } fichier = await (await fetch(src)).blob(); }
      const logoSrc = M.logo ? (IMG[M.logo] || "") : "";
      const r = await window.NFCW_RECADRER(fichier, kind, { logo: kind === "cover" ? logoSrc : "", nom: M.nom || "" });
      if (!r) return;
      const box = document.querySelector(`.imgpick[data-pick="${cle}"]`);
      await occupe(box, async () => { M[cle] = await televerser(r.blob, kind); if (kind === "cover") M.couvPos = r.pos; renderEdit(); toast("✅ Photo prête — pensez à enregistrer"); });
    } catch (e) { console.error(e); toast("Photo illisible : essayez une autre photo.", true); }
  }
  async function televerser(fichier, kind) {
    return envoyerPhoto(await compresser(fichier, OPTS[kind]));
  }
  // garde le formulaire bloqué pendant l'envoi
  async function occupe(el, fn) {
    if (el) el.classList.add("busy");
    try { return await fn(); }
    catch (e) { if (e && /illisible|lourde/.test(e.message)) toast("Photo illisible : choisissez une photo JPG ou PNG.", true); else erreur(e); }
    finally { if (el) el.classList.remove("busy"); }
  }

  /* ================= Navigation ================= */
  function route() {
    if (!BQ.ok) chargerBanque();
    if (location.hash === "#banque" && !PROPRIO) { M = null; pageBanque(); return; }
    const m = location.hash.match(/^#m=([a-z0-9-]+)/);
    const n = location.hash.match(/^#nouveau=([A-Za-z0-9_-]+)/);
    if (m) ouvrir(m[1]);
    else if (n) {
      let pre = {};
      try { pre = JSON.parse(decodeURIComponent(escape(atob(n[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) {}
      history.replaceState(null, "", "#"); renderListe(); nouveauMenu(pre);
    } else renderListe();
  }
  window.addEventListener("hashchange", () => {
    if (M && dirty() && !location.hash.startsWith("#m=" + M.slug)) {
      if (!confirm("Des modifications ne sont pas enregistrées. Quitter quand même ?")) { history.replaceState(null, "", "#m=" + M.slug); return; }
      abandonner();
    }
    route();
  });
  window.addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
  function abandonner() {
    const orph = [...pending].filter(i => !savedIds.has(i) && !enLigne(i));
    orph.forEach(i => db.doc("settings/mimg-" + i).delete().catch(() => {}));
    pending.clear(); M = null; saved = "";
  }

  function entete(titre, sous, back, lien) {
    $("#topTitle").textContent = titre; $("#topSub").textContent = sous;
    $("#backBtn").href = back;
    const v = $("#viewBtn"); v.hidden = !lien; if (lien) v.href = lien;
  }

  /* ================= Liste ================= */
  function renderListe() {
    M = null;
    entete(PROPRIO ? "Mes menus" : "Menus digitaux", PROPRIO ? "Mon commerce" : "Espace gestion", "./", "");
    const l = [...liste].sort((a, b) => (b.maj || 0) - (a.maj || 0));
    app.innerHTML = `<div class="row between"><div><h2>Menus digitaux</h2><div class="muted">${l.length} menu${l.length > 1 ? "s" : ""} · Standard, Pro, Premium</div></div>
      <div class="row" style="gap:6px;flex-wrap:wrap" data-adm><a class="btn" href="#banque">🖼 Banque photos</a><button class="btn" data-act="fichier-in" title="Ouvrir un menu tout prêt (.json)">📥 Fichier</button><button class="btn primary" data-act="nouveau">＋ Nouveau menu</button></div></div>
      ${l.length ? `<div class="mlist sec">${l.map(m => `<div class="paper mcard">
        <div class="row between"><span class="n">${esc(m.nom)}</span><span class="row"><span class="pill ${esc(m.formule)}">${esc((FORMULES[m.formule] || [m.formule])[0])}</span>${m.actif === false ? '<span class="pill off">Désactivé</span>' : ""}</span></div>
        <div class="l">${esc(lienPublic(m.slug).replace(/^https?:\/\//, ""))}</div>
        <div class="row"><a class="btn sm primary" href="#m=${esc(m.slug)}">Modifier</a><a class="btn sm" href="${esc(lienPublic(m.slug))}" target="_blank" rel="noopener">Ouvrir</a><button class="btn sm ghost" data-act="copier" data-v="${esc(lienPublic(m.slug))}">Copier le lien</button></div>
      </div>`).join("")}</div>`
      : `<div class="empty paper sec"><h3>Aucun menu pour l’instant</h3><p>Créez le premier menu : choisissez la formule, puis ajoutez les photos ou les produits.</p><button class="btn primary" data-act="nouveau">＋ Créer un menu</button></div>`}`;
  }

  // pre : { nom, formule, tel, commande } quand on vient d'une commande (Espace → Commandes → « Créer le menu »)
  function nouveauMenu(pre) {
    pre = pre || {};
    const fp = String(pre.formule || "").toLowerCase();
    let formule = fp.includes("premium") ? "premium" : fp.includes("pro") ? "pro" : "standard";
    const d = fenetre(`<h2>Nouveau menu</h2><p class="muted">Le lien sera nfcwork.ma/menu/<b id="nm-prev">…</b></p>
      <form class="stack" id="nm">
        ${window.NFCW_SOURCES ? `<button type="button" class="btn" id="nm-src">📋 Remplir depuis un client existant (carte fidélité, avis…)</button>` : ""}
        <label class="f">Nom du commerce<input id="nm-nom" required maxlength="60" placeholder="Café Chocco Latte"></label>
        <div><div class="eyebrow" style="margin-bottom:6px">Choisissez le style du menu</div>${segVisuel(formule)}</div>
        <div class="paper" style="padding:12px 14px;border-radius:14px"><b>📷 Photo du menu papier</b> <span class="muted">(facultatif)</span>
          <div class="muted" style="font-size:13px;margin:2px 0 8px" id="nm-ph-aide">${formule === "standard" ? "Les photos s’affichent telles quelles dans le menu." : "Le menu est lu sur la photo : catégories, produits et prix se remplissent tout seuls."}</div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn sm primary">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" hidden data-nmph></label><label class="btn sm">🖼 Choisir des photos<input type="file" accept="image/*" multiple hidden data-nmph></label>
          <select id="nm-lg" style="width:auto;padding:6px 10px;font-size:14px"><option value="fra">Menu en français</option><option value="fra+ara">Français + عربي</option><option value="ara">عربي فقط</option></select></div>
          <div id="nm-ph-l" class="muted" style="font-size:13px;margin-top:6px"></div></div>
        <label class="f">Lien du menu<input id="nm-slug" required maxlength="40" pattern="[a-z0-9\\-]+" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <p class="err" id="nm-err"></p>
        <div class="row"><button class="btn primary" style="flex:1">Créer le menu</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
      </form>`);
    let auto = true;
    const nom = $("#nm-nom", d), sl = $("#nm-slug", d), prev = () => ($("#nm-prev", d).textContent = sl.value || "…");
    if (pre.nom) { nom.value = pre.nom; sl.value = (pre.demo ? "essai-" : "") + slugify(pre.nom); prev(); if (pre.demo) auto = false; }
    nom.oninput = () => { if (auto) sl.value = slugify(nom.value); prev(); };
    let SRC = null;
    const bs = $("#nm-src", d);
    if (bs) bs.onclick = async () => { const D = await window.NFCW_SOURCES.choisir(db, "🍽 Nouveau menu"); if (!D || D.vide) return; SRC = D; nom.value = D.nom; if (auto) sl.value = slugify(D.nom); prev(); bs.textContent = "✅ Rempli avec : " + D.trouve.join(", "); };
    sl.oninput = () => { auto = false; sl.value = sl.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); prev(); };
    d.addEventListener("click", e => { const b = e.target.closest("[data-formule]"); if (b) { formule = b.dataset.formule; d.querySelectorAll("[data-formule]").forEach(x => x.setAttribute("aria-pressed", x === b)); $("#nm-ph-aide", d).textContent = formule === "standard" ? "Les photos s’affichent telles quelles dans le menu." : "Le menu est lu sur la photo : catégories, produits et prix se remplissent tout seuls."; } });
    const echelle = () => d.querySelectorAll(".segv .mini").forEach(m => m.style.setProperty("--k", (m.clientWidth || 100) / 390));
    echelle(); setTimeout(echelle, 60); window.addEventListener("resize", echelle);
    let PH = [];
    d.addEventListener("change", e => { if (e.target.hasAttribute("data-nmph") && e.target.files.length) { PH = PH.concat([...e.target.files]); $("#nm-ph-l", d).textContent = "✅ " + PH.length + " photo(s) choisie(s)"; } });
    $("#nm", d).onsubmit = async e => {
      e.preventDefault();
      const s = slugify(sl.value), err = $("#nm-err", d);
      if (!s) { err.textContent = "Lien invalide."; return; }
      if (liste.some(m => m.slug === s)) { err.textContent = "Ce lien existe déjà : choisissez-en un autre."; return; }
      const btn = e.target.querySelector("button"); btn.disabled = true;
      try {
        const ex = await db.doc("settings/menu-" + s).get();
        if (ex.exists) { err.textContent = "Ce lien existe déjà : choisissez-en un autre."; btn.disabled = false; return; }
        const lang = "fr";
        const m = {
          v: 1, slug: s, nom: nom.value.trim(), formule, actif: true,
          langues: [lang], theme: "nuit", couleur: "", devise: "DH",
          logo: "", logoCarre: false, couverture: "", slogan: {},
          infos: { horaires: "", adresse: "", maps: "", tel: pre.tel || "", instagram: "", whatsapp: formule === "premium" ? pre.tel || "" : "" }, commandeRef: pre.commande || "",
          commande: true, pages: [],
          ...(pre.demo ? { demo7: true, expire: (() => { const d = new Date(); d.setDate(d.getDate() + 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() } : {}),
          categories: formule === "standard" ? [] : [{ id: rid(6), nom: { [lang]: lang === "ar" ? "المشروبات" : lang === "en" ? "Drinks" : "Boissons" }, items: [] }]
        };
        if (SRC) {
          const D = SRC, inf = m.infos;
          inf.tel = inf.tel || D.tel || ""; inf.whatsapp = inf.whatsapp || D.whatsapp || D.tel || ""; inf.instagram = D.instagram || ""; inf.adresse = D.adresse || ""; inf.maps = D.maps || ""; inf.horaires = D.horaires || "";
          if (D.couleur) m.couleur = D.couleur; if (D.slogan) m.slogan = { [lang]: D.slogan };
          if (D.logo && D.logo.length < 950000) { try { const id = rid(); await db.doc("settings/mimg-" + id).set({ data: D.logo, menu: s, maj: NOW() }); IMG[id] = D.logo; m.logo = id; } catch (x) {} }
        }
        await db.doc("settings/menu-" + s).set({ json: JSON.stringify(m), v: String(Date.now()), maj: NOW(), par: user.email });
        liste.push({ slug: s, nom: m.nom, formule, actif: true, maj: Date.now() });
        await ecrireListe();
        d.remove();
        location.hash = "m=" + s;
        if (PH.length) { const lg = $("#nm-lg", d).value; apresOuverture(s, () => formule === "standard" ? pagesDepuis(PH) : depuisPhoto(PH, lg)); }
        if (pre.demo) setTimeout(() => { toast("🎯 Démo créée (7 jours) : importez le menu depuis Glovo.", true); importer(); }, 900);
      } catch (x) { erreur(x); btn.disabled = false; }
    };
    nom.focus();
  }

  /* ================= Édition ================= */
  async function ouvrir(slug) {
    if (M && M.slug === slug) { renderEdit(); return; }
    app.innerHTML = '<div class="empty"><h3>Chargement du menu…</h3></div>';
    try {
      const d = await db.doc("settings/menu-" + slug).get();
      if (!d.exists) { app.innerHTML = `<div class="empty"><h3>Menu introuvable</h3><a class="btn" href="#">Retour aux menus</a></div>`; return; }
      M = JSON.parse(d.data().json || "{}");
      M.langues = ["fr"];
      M.infos = M.infos || {}; M.slogan = M.slogan || {}; M.pages = M.pages || []; M.categories = M.categories || [];
      saved = JSON.stringify(M); savedIds = new Set(idsDe(M)); pending.clear();
      renderEdit();
    } catch (e) { console.error(e); app.innerHTML = `<div class="empty"><h3>Impossible d’ouvrir ce menu</h3><a class="btn" href="#">Retour aux menus</a></div>`; }
  }

  const segVisuel = f => `<div class="seg segv">${Object.entries(FORMULES).map(([k, [n, sub]]) => `<button type="button" data-formule="${k}" aria-pressed="${f === k}"><span class="mini"><iframe src="../menu/?m=demo-${k}&cadre=1" loading="lazy" tabindex="-1" title="${n}"></iframe></span><b>${n}</b><small>${sub}</small><a href="../menu/?m=demo-${k}" target="_blank" rel="noopener" class="voir" onclick="event.stopPropagation()">Voir ↗</a></button>`).join("")}</div>`;
  // attend que le menu créé soit ouvert dans l'éditeur
  function apresOuverture(slug, fn) { let n = 0; const t = setInterval(() => { if (M && M.slug === slug && $("#st")) { clearInterval(t); setTimeout(fn, 300); } else if (++n > 60) clearInterval(t); }, 250); }
  // Standard : les photos deviennent les pages du menu
  async function pagesDepuis(fs) {
    const d = fenetre(`<h2>📷 Ajout des photos…</h2><p class="muted" id="pd-t">Envoi…</p>`);
    try { let n = 0; for (const f of fs) { $("#pd-t", d).textContent = `Envoi de la photo ${++n} / ${fs.length}…`; M.pages.push(await televerser(f, "page")); } d.remove(); renderEdit(); toast("Photos ajoutées ✓ Cliquez « Enregistrer ».", true); }
    catch (e) { d.remove(); renderEdit(); toast("Une photo n’a pas pu être envoyée.", true); }
  }
  // Pro / Premium : lire la photo du menu papier → catégories + produits
  async function depuisPhoto(fs, lg) {
    const P = window.NFCW_MENU_PHOTO;
    if (!P) { toast("Lecture de photo indisponible.", true); return; }
    const d = fenetre(`<div class="row between"><h2>📷 Menu depuis la photo</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <div id="mp-run"><p class="muted" id="mp-t" style="margin:6px 0 8px">Préparation…</p><div style="height:8px;border-radius:9px;background:var(--sunk,#eee);overflow:hidden"><i id="mp-b" style="display:block;height:100%;width:3%;background:var(--accent);transition:width .3s"></i></div>
        <p class="muted" style="font-size:12.5px;margin-top:10px">💡 Restez sur cette page. La lecture se fait dans votre téléphone (30 s à 1 min par photo).</p></div>
      <div id="mp-ok" hidden>
        <p class="muted" style="margin:4px 0 8px;font-size:13.5px">Vérifiez et corrigez le texte lu. Une ligne = un produit : <b>Nom = prix</b> (ajoutez <b>| description</b> si besoin). Une ligne qui commence par <b>#</b> = une catégorie. Les lignes avec <b>= ?</b> n’ont pas de prix lu : corrigez-les.</p>
        <textarea id="mp-x" rows="14" style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.5" spellcheck="false"></textarea>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="mp-ph" checked> Ajouter les photos des produits automatiquement</label>
        <label class="check"><input type="checkbox" id="mp-rep" checked> Remplacer les produits actuels</label>
        <p class="err" id="mp-err"></p>
        <button class="btn primary block" id="mp-go">Créer le menu</button></div>`);
    const bar = $("#mp-b", d), txt = $("#mp-t", d);
    let res;
    try { res = await P.lire(fs, lg || "fra", (t, p) => { txt.textContent = t; bar.style.width = Math.max(3, Math.round((p || 0) * 100)) + "%"; }); }
    catch (e) { console.error(e); txt.innerHTML = "❌ La photo n’a pas pu être lue. Vérifiez la connexion internet, puis réessayez avec une photo nette, bien à plat et bien éclairée."; bar.style.background = "var(--bad,#c33)"; return; }
    if (!document.body.contains(d)) return;
    $("#mp-run", d).hidden = true; $("#mp-ok", d).hidden = false;
    const x = $("#mp-x", d), go = $("#mp-go", d), compte = () => { const c = P.lireTexte(x.value), n = c.reduce((k, c) => k + c.items.length, 0); go.textContent = n ? `Créer le menu · ${c.length} catégorie(s), ${n} produit(s)` : "Aucun produit"; go.disabled = !n; return c; };
    x.value = res.texte || ""; if (!res.texte) $("#mp-err", d).textContent = "Aucun texte lu : écrivez le menu ici (Nom = prix) ou essayez une photo plus nette.";
    x.oninput = compte; compte();
    go.onclick = () => {
      const cats = compte(); if (!cats.length) return;
      const l0 = M.langues[0] || "fr";
      if ($("#mp-rep", d).checked) M.categories = [];
      for (const c of cats) {
        let cible = M.categories.find(y => (T(y.nom, l0) || "").trim().toLowerCase() === c.nom.trim().toLowerCase());
        if (!cible) { cible = { id: rid(6), nom: { [l0]: c.nom }, items: [] }; M.categories.push(cible); }
        for (const i of c.items) cible.items.push({ id: rid(6), nom: { [l0]: i.nom }, desc: { [l0]: i.desc || "" }, prix: i.prix, photo: "", dispo: true });
      }
      M.categories = M.categories.filter(c => (c.items || []).length);
      const ph = $("#mp-ph", d).checked;
      d.remove(); renderEdit();
      toast("Menu créé depuis la photo ✓ Vérifiez puis « Enregistrer ».", true);
      if (ph) { const b = document.querySelector('[data-act="photos-auto"]'); if (b) photosAuto(b); }
    };
  }
  // après l'enregistrement : tout ce qu'il faut pour aller chez le client
  function caisseFin(emails) {
    const lien = "https://nfcwork.ma/espace/pos.html#m=" + M.slug;
    const d = fenetre(`<h2>✅ Caisse prête · ${esc(M.nom || M.slug)}</h2>
      <ol style="margin:6px 0 12px;padding-inline-start:20px;line-height:1.7">
        <li><b>Téléchargez le dossier</b> et copiez-le sur la clé USB.</li>
        <li>PC Windows : double-clic sur <b>INSTALLER-WINDOWS.bat</b> (aucune question). Mac / Linux : voir LISEZ-MOI. Tablette ou caisse Android : le QR ci-dessous.</li>
        <li>Première ouverture : e-mail de la caisse${emails && emails.length ? ` (<b>${esc(emails[0])}</b>)` : ""} + mot de passe.</li></ol>
      <button class="btn primary block" id="cf-z">💾 Télécharger « Caisse-${esc(M.slug)}.zip »</button>
      <div class="paper" style="padding:12px;border-radius:12px;margin-top:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        ${window.QRGEN ? `<div style="width:120px;flex:none;background:#fff;border-radius:10px;padding:4px">${QRGEN.svg(lien, { marge: 2 })}</div>` : ""}
        <div style="flex:1;min-width:160px;font-size:13.5px"><b>📱 Tablette, caisse Android, iPad…</b><br>Scannez ce QR avec l’appareil, puis « Installer » / « Ajouter à l’écran d’accueil ».<div style="word-break:break-all;margin-top:6px" class="muted">${esc(lien)}</div><button class="btn sm" id="cf-c" style="margin-top:6px">Copier le lien</button></div></div>
      ${emails && emails.length ? "" : `<p class="err" style="margin-top:8px">⚠️ Ajoutez l’e-mail de la caisse (⚙️) sinon le client ne pourra pas se connecter.</p>`}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-fermer>Fermer</button></div>`);
    $("#cf-z", d).onclick = () => { if (window.NFCW_CAISSE_USB) NFCW_CAISSE_USB.telecharger({ nom: M.nom || M.slug, slug: M.slug }); };
    $("#cf-c", d).onclick = async () => { try { await navigator.clipboard.writeText(lien); toast("Lien copié"); } catch (e) {} };
  }
  // 🧾 caisses/<slug> : qui peut ouvrir la caisse, nombre de tables, employés et leur code PIN, texte du ticket
  async function caisseReglages(nouvelle) {
    let C = {};
    try { const d = await db.doc("caisses/" + M.slug).get(); if (d.exists) C = d.data(); } catch (e) {}
    const d = fenetre(`<div class="row between"><h2>⚙️ Caisse · ${esc(M.nom || M.slug)}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <form class="stack" id="cr">
        <label class="f">E-mails autorisés à ouvrir la caisse (un par ligne)<textarea id="cr-e" rows="3" placeholder="caisse.campnou@gmail.com">${esc((C.emails || []).join("\n"))}</textarea></label>
        <p class="muted" style="margin:-4px 0 0;font-size:12.5px">Le compte doit exister dans l’Espace (inscription avec ce même e-mail). Vous, l’admin, avez toujours accès.</p>
        <label class="f">Nombre de tables<input id="cr-t" type="number" min="1" max="80" value="${esc(C.tables || 12)}"></label>
        <label class="f">Employés et code PIN à 4 chiffres (un par ligne : Nom = PIN)<textarea id="cr-p" rows="4" placeholder="Aymen = 1234&#10;Sara = 5678">${esc((C.employes || []).map(e => e.nom + " = " + e.pin).join("\n"))}</textarea></label>
        <label class="check" style="align-items:flex-start"><input type="checkbox" id="cr-a" ${C.autonome ? "checked" : ""}> <span>🔓 <b>Le client gère lui-même</b> : avec le code patron, il change les serveurs, les codes PIN, le nombre de tables et l’adresse du ticket.<br><small class="muted">Décoché : tout passe par vous (modifications payantes). Pour les prix et produits, donnez-lui aussi l’accès « Menus » dans sa fiche client.</small></span></label>
        <label class="f">🔐 Code du patron pour voir l’historique (4 chiffres, facultatif)<input id="cr-x" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="${esc(C.pinPatron || "")}" placeholder="ex. 2580"></label>
        <p class="muted" style="margin:0;font-size:12.5px">🎨 La caisse prend le <b>logo du menu</b> et sa couleur (ou la couleur principale du menu). Vous pouvez forcer une autre couleur :</p>
        <div class="row" style="gap:8px;align-items:center"><input id="cr-c" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(C.couleur || "") ? C.couleur : (/^#[0-9a-f]{6}$/i.test(M.couleur || "") ? M.couleur : "#2f7bff"))}" style="width:60px;height:44px;padding:2px"><label class="check" style="margin:0"><input type="checkbox" id="cr-cc" ${C.couleur ? "checked" : ""}> Utiliser cette couleur pour la caisse</label></div>
        <label class="f">En-tête du ticket (adresse, téléphone)<textarea id="cr-h" rows="2" placeholder="Bd Mohammed V, Kénitra · 06 00 00 00 00">${esc((C.ticket || {}).entete || "")}</textarea></label>
        <label class="f">Bas du ticket<input id="cr-f" value="${esc((C.ticket || {}).pied || "Merci de votre visite !")}" maxlength="80"></label>
        <p class="err" id="cr-err"></p><button class="btn primary">Enregistrer</button></form>`);
    $("#cr", d).onsubmit = async e => {
      e.preventDefault();
      const emails = $("#cr-e", d).value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      const employes = $("#cr-p", d).value.split("\n").map(l => l.split("=")).filter(x => x.length === 2 && x[0].trim() && /^\d{4}$/.test(x[1].trim())).map(x => ({ nom: x[0].trim().slice(0, 30), pin: x[1].trim() }));
      if (new Set(employes.map(x => x.pin)).size !== employes.length) { $("#cr-err", d).textContent = "Deux employés ont le même PIN."; return; }
      try {
        const px = $("#cr-x", d).value.trim();
        if (px && !/^\d{4}$/.test(px)) { $("#cr-err", d).textContent = "Le code du patron doit avoir 4 chiffres."; return; }
        await db.doc("caisses/" + M.slug).set({ emails, pinPatron: px, autonome: $("#cr-a", d).checked, couleur: $("#cr-cc", d).checked ? $("#cr-c", d).value : "", tables: Math.max(1, Math.min(80, +$("#cr-t", d).value || 12)), employes, ticket: { entete: $("#cr-h", d).value.trim().slice(0, 200), pied: $("#cr-f", d).value.trim().slice(0, 80), largeur: (C.ticket || {}).largeur || 80 }, maj: NOW() });
        d.remove(); toast("✅ Caisse enregistrée");
        caisseFin(emails);
      } catch (x) { console.error(x); $("#cr-err", d).textContent = "Échec : les règles Firebase de la caisse sont-elles ajoutées ?"; }
    };
  }
  function choisirPhotoMenu() {
    const d = fenetre(`<h2>📷 Menu depuis une photo</h2><p class="muted">Prenez la carte bien à plat et bien éclairée. Plusieurs photos = plusieurs pages.</p>
      <label class="f">Langue du menu<select id="cp-lg"><option value="fra">Français</option><option value="fra+ara">Français + عربي</option><option value="ara">عربي فقط</option></select></label>
      <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap"><label class="btn primary">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" hidden data-cp></label><label class="btn">🖼 Choisir des photos<input type="file" accept="image/*" multiple hidden data-cp></label><button class="btn ghost" data-fermer>Annuler</button></div>`);
    d.addEventListener("change", e => { if (e.target.hasAttribute("data-cp") && e.target.files.length) { const fs = [...e.target.files], lg = $("#cp-lg", d).value; d.remove(); depuisPhoto(fs, lg); } });
  }
  const segFormule = f => `<div class="seg">${Object.entries(FORMULES).map(([k, [n, s]]) => `<button type="button" data-formule="${k}" aria-pressed="${f === k}"><b>${n}</b><small>${s}</small></button>`).join("")}</div>`;

  // champ texte multilingue : un input par langue éditée
  function champLangues(chemin, label, opts = {}) {
    const ls = langsEdition();
    const obj = getPath(M, chemin) || {};
    return ls.map(l => {
      const v = typeof obj === "string" ? (l === ls[0] ? obj : "") : obj[l] || "";
      const tag = opts.area ? `<textarea data-b="${chemin}.${l}" maxlength="${opts.max || 300}" ${l === "ar" ? 'dir="rtl"' : ""}>${esc(v)}</textarea>` : `<input data-b="${chemin}.${l}" value="${esc(v)}" maxlength="${opts.max || 120}" ${l === "ar" ? 'dir="rtl"' : ""}>`;
      return `<label class="f">${esc(label)}${ls.length > 1 ? ` (${LCOURT[l]})` : ""}${tag}</label>`;
    }).join("");
  }
  const champ = (chemin, label, attrs = "") => `<label class="f">${esc(label)}<input data-b="${chemin}" value="${esc(getPath(M, chemin) || "")}" ${attrs}></label>`;
  function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, p, v) {
    const ks = p.split("."); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== "object") a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  }

  function photoPick(cle, label, kind, aide) {
    const id = M[cle];
    return `<div class="imgpick" data-pick="${cle}">
      ${id ? imgTag(id, "prev" + (kind === "cover" ? " wide" : ""), label) : `<div class="prev${kind === "cover" ? " wide" : ""}"></div>`}
      <div class="stack" style="gap:6px"><b>${esc(label)}</b>${aide ? `<small class="muted">${esc(aide)}</small>` : ""}
        <div class="row"><label class="btn sm">${id ? "Changer" : "Ajouter"}<input type="file" accept="image/*" hidden data-up="${cle}" data-kind="${kind}"></label>${id && (kind === "logo" || kind === "cover") ? `<button class="btn sm" data-recadrer="${cle}" data-kind="${kind}">✂️ Recadrer</button>` : ""}${kind === "cover" ? `<button class="btn sm" data-act="banque-cover">Banque de photos</button>${M.formule === "premium" ? `<button class="btn sm primary" data-act="couv-design">🎨 3 designs</button>` : ""}` : ""}${id ? `<button class="btn sm ghost" data-act="retirer" data-cle="${cle}">Retirer</button>` : ""}</div></div></div>`;
  }

  function renderEdit() {
    entete(M.nom || "Menu", (FORMULES[M.formule] || [""])[0] + " · nfcwork.ma/menu/" + M.slug, "#", lienPublic(M.slug));
    const pro = M.formule !== "standard", prem = M.formule === "premium";
    const ls = langsEdition();
    app.innerHTML = `
    <section class="sec" data-adm style="margin-top:0"><div class="eyebrow" style="margin-bottom:8px">Formule</div>${segFormule(M.formule)}</section>
    ${pro ? `<section class="sec" data-adm style="margin-top:14px"><div class="eyebrow" style="margin-bottom:8px">Type de commerce</div><div class="seg s4">${Object.entries(TYPES_COM).map(([k, [ic, n, sd]]) => `<button type="button" data-act="type" data-v="${k}" aria-pressed="${(M.type || "resto") === k}"><b>${ic} ${n}</b><small>${sd}</small></button>`).join("")}</div></section>` : ""}

    <section class="sec paper stack">
      <div class="row between"><h3>Infos du commerce</h3><label class="check" data-adm><input type="checkbox" data-b="actif" ${M.actif !== false ? "checked" : ""}> Menu en ligne</label></div>
      ${champ("nom", "Nom du commerce", 'maxlength="60"')}
      <div class="row" style="gap:6px"><span class="muted" style="font-size:13.5px">Lien :</span><a href="${esc(lienPublic(M.slug))}" target="_blank" rel="noopener">${esc(lienPublic(M.slug).replace(/^https?:\/\//, ""))}</a><button class="btn sm ghost" data-act="copier" data-v="${esc(lienPublic(M.slug))}">Copier</button><button class="btn sm ghost" data-act="nfc">📲 Écrire sur la puce</button><button class="btn sm ghost" data-adm data-act="dupliquer">📄 Dupliquer</button><button class="btn sm ghost" data-act="historique">🕘 Historique</button><button class="btn sm ghost" data-adm data-act="fichier-out">💾 Fichier</button></div>
      ${photoPick("logo", "Logo", "logo", "Carré ou rond, fond uni de préférence.")}
      <label class="check"><input type="checkbox" data-b="logoCarre" ${M.logoCarre ? "checked" : ""}> Logo carré (au lieu de rond)</label>
      ${pro ? photoPick("couverture", "Photo de couverture", "cover", "Une belle photo de la salle ou d’un plat (format paysage).") : ""}
      ${champLangues("slogan", "Petite phrase sous le nom (facultatif)", { max: 140 })}
      <div class="grid2">
        ${champ("infos.horaires", "Horaires", 'maxlength="80" placeholder="8h – 23h, 7j/7"')}
        ${champ("infos.tel", "Téléphone", 'type="tel" inputmode="tel" maxlength="30"')}
        ${champ("infos.adresse", "Adresse", 'maxlength="120"')}
        ${champ("infos.maps", "Lien Google Maps (facultatif)", 'type="url" maxlength="300" autocapitalize="off"')}
        ${champ("infos.instagram", "Instagram", 'maxlength="60" placeholder="@moncafe" autocapitalize="off"')}
        ${pro ? champ("devise", "Devise des prix", 'maxlength="6" placeholder="DH"') : ""}
      </div>
    </section>

    ${prem ? `<section class="sec paper stack"><h3>Premium : commande WhatsApp</h3>
      <p class="muted" style="margin:0;font-size:13.5px">Le client choisit ses produits et envoie la commande sur ce numéro. Cochez « À ne pas manquer » sur vos meilleurs produits : ils s’affichent en grand en haut du menu.</p>
      ${champ("infos.whatsapp", "Numéro WhatsApp du commerce", 'type="tel" inputmode="tel" maxlength="30" placeholder="06 12 34 56 78"')}
      <label class="check"><input type="checkbox" data-b="commande" ${M.commande !== false ? "checked" : ""}> ${M.type === "salon" ? "Les clients choisissent leurs services, le jour et l’heure, et envoient la demande de rendez-vous sur WhatsApp" : "Les clients peuvent composer leur commande et l’envoyer sur WhatsApp"}</label>
      ${M.type === "location" || M.type === "salon" ? "" : `<label class="f">📥 Où arrivent les commandes ?<select data-b="reception">${[["wa", "Sur WhatsApp"], ["caisse", "Sur l’écran caisse (ordinateur / tablette de la caisse)"], ["les2", "Sur l’écran caisse + WhatsApp"]].map(([k, n]) => `<option value="${k}" ${(M.reception || "wa") === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      ${(M.reception || "wa") !== "wa" ? `<label class="check" data-adm><input type="checkbox" data-b="suivi" ${M.suivi ? "checked" : ""}> 🔔 Suivi de commande : le téléphone du client sonne quand la caisse met « Prête » <small class="muted">(option payante)</small></label>` : ""}
      ${(M.reception || "wa") !== "wa" ? `<div class="notice" style="font-size:13.5px;display:grid;gap:8px">🧾 <b>Caisse web</b> : ouvrez ce lien sur l’ordinateur ou la tablette de la caisse, connectez-vous une fois, et les commandes arrivent en direct avec la table, une sonnerie, le bon cuisine et le ticket.
        <a href="pos.html#m=${esc(M.slug)}" target="_blank" rel="noopener" style="font-weight:700;word-break:break-all">nfcwork.ma/espace/pos.html#m=${esc(M.slug)}</a>
        <div class="row" style="gap:6px;flex-wrap:wrap"><a class="btn sm primary" href="pos.html#m=${esc(M.slug)}" target="_blank" rel="noopener">Ouvrir la caisse</a><button class="btn sm" data-act="caisse-reglages" data-adm>⚙️ Tables, employés (PIN), accès</button><button class="btn sm" data-act="caisse-usb" data-adm>💾 Installation clé USB</button></div></div>` : `<button class="btn primary" data-act="caisse-creer" data-adm style="justify-self:start">🧾 Créer la caisse pour ce client</button>`}`}
      ${M.type === "location" ? `<div class="notice" style="font-size:13.5px">🚗 Mettez chaque voiture comme un produit : <b>nom</b> (Dacia Logan 2023), <b>prix par jour</b>, <b>photo</b>, et dans la description : Diesel · Manuelle · 5 places · Clim. Le client choisit les dates et envoie la réservation sur WhatsApp, avec le total.<br>💡 Sticker NFC caché dans la boîte à gants ou le coffre : le client touche ou scanne, et voit vos voitures et vos prix.</div>` : ""}
      ${M.type === "salon" || M.type === "boutique" || M.type === "location" ? "" : `<label class="check"><input type="checkbox" data-b="reservation.actif" ${(M.reservation || {}).actif ? "checked" : ""}> 📅 Bouton « Réserver une table » : jour, heure, nombre de personnes, envoyé sur WhatsApp</label>
      ${(M.reservation || {}).actif ? champ("reservation.note", "Message sous le formulaire (facultatif)", 'maxlength="140" placeholder="Réservation confirmée par WhatsApp. Groupes : appelez-nous."') : ""}`}
    </section>
    <section class="sec paper stack"><h3>🛵 Livraison</h3>
      <p class="muted" style="margin:0;font-size:13.5px">Le client choisit « Livraison », écrit son téléphone et son adresse ou envoie sa position : tout arrive sur votre WhatsApp. Sans commission, contrairement à Glovo.</p>
      <label class="check"><input type="checkbox" data-b="livraison.actif" ${(M.livraison || {}).actif ? "checked" : ""}> Proposer la livraison</label>
      ${(M.livraison || {}).actif ? `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px">
        <label class="f">Frais de livraison (DH)<input data-b="livraison.frais" value="${esc((M.livraison || {}).frais || "")}" inputmode="decimal" maxlength="8" placeholder="0 = gratuite"></label>
        <label class="f">Commande minimum (DH)<input data-b="livraison.min" value="${esc((M.livraison || {}).min || "")}" inputmode="decimal" maxlength="8" placeholder="facultatif"></label></div>
        ${champ("livraison.zone", "Zone de livraison (facultatif)", 'maxlength="60" placeholder="Kénitra centre, Mimosas…"')}
        <div class="paper" style="padding:12px 14px;border-radius:14px;min-width:0;overflow:hidden"><b>Lien pour Instagram, Facebook, WhatsApp</b><div class="muted" style="font-size:13px;margin:2px 0 8px">À mettre dans la bio : le menu s’ouvre directement en mode livraison.</div>
          <div style="display:flex;gap:6px;align-items:center;min-width:0"><code style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(lienPublic(M.slug).replace(/^https?:\/\//, ""))}?livraison</code><button class="btn sm" data-act="copier" data-v="${esc(lienPublic(M.slug))}?livraison">Copier</button></div></div>` : ""}
    </section>` : ""}

    ${pro ? `<section class="sec paper stack"><div class="row between"><h3>🔥 Promos et happy hour</h3><button class="btn sm" data-act="promo-add">＋ Promo</button></div>
      <p class="muted" style="margin:0;font-size:13.5px">Un bandeau en haut du menu (et sur l’écran TV), seulement aux jours et heures choisis. Sans heures : affiché toute la journée.</p>
      ${(M.promos || []).map((p, i) => `<div class="paper stack" style="padding:12px;border-radius:14px">
        <div class="row between"><label class="check" style="margin:0"><input type="checkbox" data-pr="${i}.actif" ${p.actif !== false ? "checked" : ""}> Active</label><button class="btn sm ghost danger" data-act="promo-del" data-i="${i}">Supprimer</button></div>
        <label class="f">Texte de la promo<input data-pr="${i}.texte" value="${esc(p.texte || "")}" maxlength="90" placeholder="Happy hour : -20 % sur tous les jus"></label>
        <div class="row" style="gap:6px;flex-wrap:wrap">${JOURS.map((j, k) => `<button type="button" class="chip" data-act="promo-jour" data-i="${i}" data-j="${k}" aria-pressed="${(p.jours || []).includes(k)}">${j}</button>`).join("")}<span class="muted" style="font-size:12.5px">${(p.jours || []).length ? "" : "tous les jours"}</span></div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px"><label class="f">De<input type="time" data-pr="${i}.de" value="${esc(p.de || "")}"></label><label class="f">À<input type="time" data-pr="${i}.a" value="${esc(p.a || "")}"></label></div>
      </div>`).join("") || `<div class="muted" style="font-size:13.5px">Aucune promo. Exemples : « Petit-déjeuner complet 25 DH » de 7h à 11h, « Happy hour -20 % » de 17h à 19h.</div>`}
    </section>
    <section class="sec paper stack"><h3>${M.type === "hotel" ? "🛏 QR des chambres" : "🪑 Stands de table numérotés"}</h3>
      <p class="muted" style="margin:0;font-size:13.5px">${M.type === "hotel" ? "Un QR par chambre : la commande arrive avec le numéro de la chambre." : "Un QR par table : « TABLE 01 », « TABLE 02 »… La commande arrive sur WhatsApp avec le numéro de la table, sans que le client l’écrive."}</p>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px"><label class="f">De<input type="number" id="tb-de" min="1" max="999" value="1" inputmode="numeric"></label><label class="f">Jusqu’à<input type="number" id="tb-a" min="1" max="999" value="${M.type === "hotel" ? 20 : 12}" inputmode="numeric"></label></div>
      <div class="row" style="gap:6px"><button class="btn sm primary" data-act="stands">🖨 Imprimer les stands (PDF)</button><button class="btn sm" data-act="copier" data-v="${esc(lienPublic(M.slug))}?table=1">Copier le lien de la table 1</button></div>
    </section>
    <section class="sec paper stack"><h3>📺 Menu sur écran TV</h3>
      <p class="muted" style="margin:0;font-size:13.5px">Ouvrez ce lien sur la TV du commerce (Smart TV, clé Android, ou ordinateur branché en HDMI) : les catégories défilent toutes seules, avec les photos, les prix, les promos et un QR code pour commander. Les changements du menu arrivent seuls.</p>
      <div style="display:flex;gap:6px;align-items:center;min-width:0"><code style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((SITE + "/menu/tv/?m=" + M.slug).replace(/^https?:\/\//, ""))}</code><button class="btn sm" data-act="copier" data-v="${esc(SITE + "/menu/tv/?m=" + M.slug)}">Copier</button><a class="btn sm" href="/menu/tv/?m=${esc(M.slug)}" target="_blank" rel="noopener">Ouvrir</a></div>
      <div class="muted" style="font-size:12.5px">Réglages dans le lien : <code>&n=6</code> produits par écran, <code>&s=15</code> secondes par écran.</div>
      <label class="f">🎬 Vidéo montée pour la TV (facultatif)<input data-b="tvVideo" value="${esc(M.tvVideo || "")}" maxlength="40" placeholder="ex. lartisan" autocapitalize="off" spellcheck="false"></label>
      <div class="muted" style="font-size:12.5px">Si une vidéo est rangée sur le site (dossier <code>tv/v/</code>), écrivez son nom : le lien TV la joue en boucle, sans son, même si Internet coupe.${/^[a-z0-9-]{2,40}$/.test(M.tvVideo || "") ? ` Lien direct : <a href="/tv/${esc(M.tvVideo)}" target="_blank" rel="noopener">nfcwork.ma/tv/${esc(M.tvVideo)}</a>` : ""}</div>
    </section>` : ""}

    ${pro ? `<section class="sec paper stack"><h3>Design</h3>
      <div class="themes">${Object.entries(THEMES).map(([k, [n, bg, ac]]) => `<button class="theme" data-theme="${k}" aria-pressed="${(M.theme || "nuit") === k}"><i style="background:linear-gradient(135deg,${bg} 60%,${ac} 60%)"></i>${n}</button>`).join("")}</div>
      <div class="row"><label class="f" style="flex:1">Couleur principale (prix, boutons)<input type="color" data-b="couleur" value="${esc(/^#[0-9a-f]{6}$/i.test(M.couleur || "") ? M.couleur : THEMES[M.theme || "nuit"][2])}" style="height:46px;padding:4px"></label>
      ${M.couleur ? `<button class="btn sm ghost" data-act="couleur0" style="align-self:flex-end">Couleur du thème</button>` : ""}</div>
    </section>` : ""}

    ${!pro ? `<section class="sec paper">
      <div class="row between" style="margin-bottom:6px"><h3>Photos de la carte</h3><span class="muted" style="font-size:13px">${M.pages.length} photo${M.pages.length > 1 ? "s" : ""}</span></div>
      <p class="muted" style="margin:0 0 12px;font-size:13.5px">Prenez chaque page de la carte bien à plat, recadrez-la sur le téléphone, puis ajoutez-la ici. Elles s’affichent dans cet ordre.</p>
      ${M.pages.length ? `<div class="thumbs">${M.pages.map((id, i) => `<div class="thumb">${imgTag(id, "", "Page " + (i + 1))}<span class="no">${i + 1}</span>
        <div class="acts"><button data-act="pg-up" data-i="${i}" title="Monter" ${i ? "" : "disabled"}>↑</button><button data-act="pg-down" data-i="${i}" title="Descendre" ${i < M.pages.length - 1 ? "" : "disabled"}>↓</button><button data-act="pg-rot" data-i="${i}" title="Tourner">⟳</button><button data-act="pg-del" data-i="${i}" title="Supprimer">🗑</button></div></div>`).join("")}</div>` : ""}
      <div class="drop" style="margin-top:12px" id="pg-drop"><div>Ajouter les photos de la carte</div>
        <div class="row" style="justify-content:center"><label class="btn primary sm">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" hidden data-pages></label><label class="btn sm">Choisir des photos<input type="file" accept="image/*" multiple hidden data-pages></label></div></div>
    </section>` : `<section class="sec">
      <div class="row between" style="margin-bottom:10px"><h3>${M.type === "location" ? "Voitures" : "Catégories & produits"}</h3><div class="row" style="gap:6px"><button class="btn sm primary" data-act="prix-rapides">💰 Prix</button><button class="btn sm" data-act="photo-menu">📷 Photo</button><button class="btn sm" data-act="importer">📥 Importer</button><button class="btn sm" data-act="cat-add">＋ Catégorie</button></div></div>
      ${M.categories.some(c => (c.items || []).some(i => !i.photo)) ? `<div class="paper row between" style="padding:12px 14px;border-radius:14px;margin-bottom:12px;gap:10px"><div style="flex:1;min-width:0"><b>✨ Photos automatiques</b><div class="muted" style="font-size:13px">${M.categories.reduce((n, c) => n + (c.items || []).filter(i => !i.photo).length, 0)} produit(s) sans photo : on cherche la bonne photo à partir du nom (Coca-Cola, Poms, café crème…).</div></div><button class="btn sm primary" data-act="photos-auto">Remplir</button></div>` : ""}
      ${M.categories.some(c => (c.items || []).length) && !M.categories.some(c => (c.items || []).some(i => !i.photo)) && M.type !== "location" ? `<div class="paper row between" style="padding:12px 14px;border-radius:14px;margin-bottom:12px;gap:10px"><div style="flex:1;min-width:0"><b>📸 Photos HD</b><div class="muted" style="font-size:13px">Des photos floues ou mal coupées ? On met une belle photo de la banque à chaque produit.</div></div><button class="btn sm" data-act="photos-hd">Tout en HD</button></div>` : ""}
      ${M.categories.map((c, ci) => `<div class="cat" data-cat="${esc(c.id)}">
        <div class="cat-h"><div class="names">${ls.map(l => `<input data-cb="nom.${l}" value="${esc(T(c.nom, l))}" placeholder="Nom de la catégorie${ls.length > 1 ? " (" + LCOURT[l] + ")" : ""}" maxlength="60" ${l === "ar" ? 'dir="rtl"' : ""}>`).join("")}</div>
          <div class="cat-tools"><button class="btn icon sm" data-act="cat-up" data-i="${ci}" ${ci ? "" : "disabled"} title="Monter">↑</button><button class="btn icon sm" data-act="cat-down" data-i="${ci}" ${ci < M.categories.length - 1 ? "" : "disabled"} title="Descendre">↓</button><button class="btn icon sm danger" data-act="cat-del" data-i="${ci}" title="Supprimer">🗑</button></div></div>
        <div class="items">${(c.items || []).map((it, ii) => `<div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="it${it.dispo === false ? " off" : ""}" data-act="it-edit" data-ci="${ci}" data-ii="${ii}">${it.photo ? imgTag(it.photo, "", "") : '<span class="noimg">🍽</span>'}
            <span class="tx"><b>${esc(T(it.nom, ls[0]) || "Sans nom")}</b><small>${esc(T(it.desc, ls[0]).slice(0, 60))}${it.dispo === false ? " · Épuisé" : ""}</small></span><span class="p">${it.prix ? esc(it.prix) + (M.type === "location" ? "/j" : "") : '<span class="muted" style="font-weight:500">💰 prix ?</span>'}</span><span class="edit-ic" aria-hidden="true">✏️</span></button>
          <div style="display:grid;gap:4px"><button class="btn icon sm" data-act="it-up" data-ci="${ci}" data-ii="${ii}" ${ii ? "" : "disabled"} title="Monter">↑</button><button class="btn icon sm" data-act="it-down" data-ci="${ci}" data-ii="${ii}" ${ii < c.items.length - 1 ? "" : "disabled"} title="Descendre">↓</button></div></div>`).join("")}</div>
        <button class="btn sm" style="margin-top:10px;width:100%" data-act="it-add" data-ci="${ci}">＋ Ajouter un produit</button>
      </div>`).join("") || `<div class="empty paper"><h3>Aucune catégorie</h3><p>Commencez par « Boissons », « Petit-déjeuner »…</p></div>`}
      <button class="btn" style="width:100%" data-act="cat-add">＋ Nouvelle catégorie</button>
    </section>`}

    <section class="sec paper row between" data-adm><div><b>Supprimer ce menu</b><div class="muted" style="font-size:13px">Le lien ne marchera plus. Action définitive.</div></div><button class="btn sm danger" data-act="supprimer">Supprimer</button></section>

    <div class="savebar"><div class="in"><span class="st" id="st"></span><button class="btn" data-act="apercu">Aperçu</button><button class="btn primary" data-act="enregistrer" id="saveBtn">Enregistrer</button></div></div>`;
    majBarre();
    chargerVisibles();
  }

  function majBarre() {
    const st = $("#st"), b = $("#saveBtn");
    if (!st || !M) return;
    const d = dirty();
    st.textContent = d ? "Modifications non enregistrées" : "Tout est enregistré · en ligne";
    st.classList.toggle("dirty", d);
    b.disabled = !d;
  }

  /* ---------- saisie ---------- */
  app.addEventListener("input", e => {
    if (!M) return;
    const t = e.target;
    if (t.dataset.b) {
      const v = t.type === "checkbox" ? t.checked : t.value;
      setPath(M, t.dataset.b, typeof v === "string" && t.type !== "color" ? v.replace(/^\s+/, "") : v);
      if (t.dataset.b === "nom") $("#topTitle").textContent = t.value || "Menu";
      if (t.dataset.b === "livraison.actif" || t.dataset.b === "reservation.actif" || t.dataset.b === "reception") { renderEdit(); return; }
    } else if (t.dataset.pr) {
      const [i, k] = t.dataset.pr.split("."), p = (M.promos || [])[+i];
      if (p) p[k] = t.type === "checkbox" ? t.checked : t.value;
    } else if (t.dataset.cb) {
      const c = M.categories.find(x => x.id === t.closest("[data-cat]").dataset.cat);
      if (c) { if (typeof c.nom !== "object" || !c.nom) c.nom = {}; c.nom[t.dataset.cb.split(".")[1]] = t.value; }
    }
    majBarre();
  });
  app.addEventListener("change", async e => {
    if (!M) return;
    const t = e.target;
    if (t.dataset.lang) {
      const k = t.dataset.lang;
      if (t.checked && !M.langues.includes(k)) M.langues.push(k);
      if (!t.checked) { if (M.langues.length === 1) { t.checked = true; toast("Gardez au moins une langue."); return; } M.langues = M.langues.filter(x => x !== k); }
      renderEdit(); return;
    }
    if (t.dataset.up && t.files[0]) {
      const cle = t.dataset.up, kind = t.dataset.kind;
      const f = t.files[0]; t.value = "";
      if ((kind === "logo" || kind === "cover") && window.NFCW_RECADRER) { await recadrer(cle, kind, f); return; }
      await occupe(t.closest(".imgpick"), async () => { M[cle] = await televerser(f, kind); renderEdit(); toast("Photo ajoutée — pensez à enregistrer"); });
      return;
    }
    if (t.hasAttribute("data-pages") && t.files.length) {
      const fs = [...t.files], drop = $("#pg-drop");
      await occupe(drop, async () => {
        let n = 0;
        for (const f of fs) { drop.firstElementChild.textContent = `Envoi de la photo ${++n} / ${fs.length}…`; M.pages.push(await televerser(f, "page")); }
        renderEdit(); toast(fs.length > 1 ? fs.length + " photos ajoutées — pensez à enregistrer" : "Photo ajoutée — pensez à enregistrer");
      });
    }
  });

  /* ---------- boutons ---------- */
  document.addEventListener("click", async e => {
    if (e.target.closest(".modal")) return;
    const rc = e.target.closest("[data-recadrer]");
    if (rc && M) { e.preventDefault(); recadrer(rc.dataset.recadrer, rc.dataset.kind); return; }
    const fo = e.target.closest("[data-formule]");
    if (fo && M && app.contains(fo)) { changerFormule(fo.dataset.formule); return; }
    const th = e.target.closest("[data-theme]");
    if (th && M) { M.theme = th.dataset.theme; M.couleur = ""; renderEdit(); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act, i = +b.dataset.i, ci = +b.dataset.ci, ii = +b.dataset.ii;
    const bouge = (arr, k, d) => { const j = k + d; if (j < 0 || j >= arr.length) return; [arr[k], arr[j]] = [arr[j], arr[k]]; renderEdit(); };
    switch (a) {
      case "nouveau": nouveauMenu(); break;
      case "fichier-in": fichierIn(); break;
      case "fichier-out": fichierOut(); break;
      case "copier": copier(b.dataset.v); break;
      case "enregistrer": enregistrer(b); break;
      case "apercu": apercu(); break;
      case "supprimer": supprimer(); break;
      case "retirer": M[b.dataset.cle] = ""; renderEdit(); break;
      case "couv-design": couvDesign(); break;
      case "banque-cover": banque("Salle", "", id => { M.couverture = id; M.couvPos = ""; renderEdit(); }); break;
      case "couleur0": M.couleur = ""; renderEdit(); break;
      case "pg-up": bouge(M.pages, i, -1); break;
      case "pg-down": bouge(M.pages, i, 1); break;
      case "pg-del": if (confirm("Supprimer la photo " + (i + 1) + " ?")) { M.pages.splice(i, 1); renderEdit(); } break;
      case "pg-rot": await occupe(b.closest(".thumb"), async () => {
        const src = IMG[M.pages[i]] || await chargerImg(M.pages[i]);
        M.pages[i] = await envoyerPhoto(encoder(await chargerImage(src), { ...OPTS.page, rot: 90 })); renderEdit();
      }); break;
      case "cat-add": {
        const l0 = M.langues[0] || "fr";
        M.categories.push({ id: rid(6), nom: { [l0]: "" }, items: [] }); renderEdit();
        const cs = document.querySelectorAll(".cat"), inp = cs.length && cs[cs.length - 1].querySelector("input");
        if (inp) { inp.focus(); inp.scrollIntoView({ block: "center" }); }
        break;
      }
      case "cat-up": bouge(M.categories, i, -1); break;
      case "cat-down": bouge(M.categories, i, 1); break;
      case "cat-del": {
        const c = M.categories[i];
        if (!(c.items || []).length || confirm(`Supprimer la catégorie « ${T(c.nom, M.langues[0]) || "sans nom"} » et ses ${c.items.length} produit(s) ?`)) { M.categories.splice(i, 1); renderEdit(); }
        break;
      }
      case "it-add": editerItem(ci, -1); break;
      case "type": M.type = b.dataset.v; renderEdit(); break;
      case "stands": imprimerStands(); break;
      case "nfc": window.NFCW_ECRIRE(lienPublic(M.slug), M.nom); break;
      case "dupliquer": dupliquerMenu(); break;
      case "historique": historique(); break;
      case "promo-add": M.promos = M.promos || []; M.promos.push({ id: rid(6), texte: "", jours: [], de: "", a: "", actif: true }); renderEdit(); break;
      case "promo-del": M.promos.splice(i, 1); renderEdit(); break;
      case "promo-jour": { const p = M.promos[i], j = +b.dataset.j; p.jours = p.jours || []; p.jours = p.jours.includes(j) ? p.jours.filter(x => x !== j) : [...p.jours, j].sort(); renderEdit(); break; }
      case "photos-auto": photosAuto(b); break;
      case "photos-hd": if (confirm("Remplacer les photos de TOUS les produits par des photos HD de la banque ?\nVous pourrez changer chaque photo ensuite.")) photosAuto(b, true); break;
      case "importer": importer(); break;
      case "caisse-reglages": caisseReglages(); break;
      case "caisse-usb": if (window.NFCW_CAISSE_USB) { NFCW_CAISSE_USB.telecharger({ nom: M.nom || M.slug, slug: M.slug }); toast("💾 Dossier « Caisse-" + M.slug + ".zip » téléchargé : copiez-le sur la clé USB"); } break;
      case "caisse-creer": {
        M.reception = (M.infos || {}).whatsapp ? "les2" : "caisse"; renderEdit();
        const sv = document.querySelector('[data-act="enregistrer"]'); if (sv && dirty()) await enregistrer(sv);
        caisseReglages(true); break;
      }
      case "photo-menu": choisirPhotoMenu(); break;
      case "it-edit": editerItem(ci, ii); break;
      case "prix-rapides": prixRapides(); break;
      case "it-up": bouge(M.categories[ci].items, ii, -1); break;
      case "it-down": bouge(M.categories[ci].items, ii, 1); break;
    }
  });

  /* ---------- dupliquer un menu (même produits et photos, nouveau nom) ---------- */
  /* ---------- 💾 / 📥 menu en fichier (.json avec ses photos) : sauvegarde, ou menu tout prêt préparé par NFCWORK ---------- */
  async function fichierOut() {
    if (dirty()) { toast("Enregistrez d’abord ce menu."); return; }
    const images = {};
    for (const id of idsDe(M).filter(x => !enLigne(x))) { const d = IMG[id] || await chargerImg(id); if (d) images[id] = d; }
    const blob = new Blob([JSON.stringify({ nfcworkMenu: 1, menu: M, images })], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "menu-" + M.slug + ".json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("💾 Fichier du menu téléchargé");
  }
  // 📦 modèles tout prêts, hébergés sur le site (un clic, pas de fichier à télécharger)
  const MODELES = [["cafe-camp-nou", "☕", "Café Camp Nou", "31 produits avec photos HD : ftour, crêpes, soupes, boissons, jus"], ["location-voitures", "🚗", "Location de voitures", "47 voitures avec photos, réservation date + heure"], ["thony", "🥪", "THONY Sandwich Express", "46 produits avec photos : thon, sandwichs, tacos, burgers, plats, boissons"], ["doner-turkish", "🥙", "Doner Turkish", "31 produits : doner, chawarma, durum, ciabatta, frites cheddar, boissons"]];
  function fichierIn() {
    const d = fenetre(`<h2>📥 Menu tout prêt</h2><p class="muted" style="margin-top:2px">Choisissez un modèle : il est copié avec toutes ses photos, puis vous changez le nom, les prix et le WhatsApp.</p>
      <div class="stack" style="gap:8px;margin-top:10px">${MODELES.map(([k, i, n, s]) => `<button class="btn block" data-mod="${k}" style="justify-content:flex-start;text-align:start;padding:14px;white-space:normal;min-width:0;max-width:100%"><span style="font-size:26px;flex:none">${i}</span><span style="min-width:0;flex:1;overflow-wrap:anywhere"><b>${n}</b><br><small class="muted">${s}</small></span></button>`).join("")}
        <button class="btn ghost block" data-mod="__fichier">📂 Ouvrir un fichier (.json)</button></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-fermer>Fermer</button></div>`);
    d.addEventListener("click", async e => {
      const b = e.target.closest("[data-mod]"); if (!b) return;
      const k = b.dataset.mod;
      if (k === "__fichier") {
        const inp = document.createElement("input"); inp.type = "file";
        inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; let P; try { P = JSON.parse(await f.text()); } catch (x) { toast("Fichier illisible."); return; } d.remove(); importerMenu(P); };
        inp.click(); return;
      }
      b.disabled = true; b.insertAdjacentHTML("beforeend", " <small>⏳</small>");
      try { const r = await fetch("modeles/" + k + ".json", { cache: "no-cache" }); if (!r.ok) throw new Error("http " + r.status); const P = await r.json(); d.remove(); importerMenu(P); }
      catch (x) { b.disabled = false; toast("Téléchargement impossible. Vérifiez la connexion."); }
    });
  }
  async function importerMenu(P) {
    {
      const c = P && P.menu; if (!c || !Array.isArray(c.categories)) { toast("Ce fichier n’est pas un menu NFCWORK."); return; }
      const nom = prompt("Nom du commerce :", c.nom || ""); if (!nom || !nom.trim()) return;
      let s = slugify(prompt("Lien : nfcwork.ma/menu/…", slugify(nom)) || nom); if (!s) return;
      let remplace = false;
      if (liste.some(x => x.slug === s)) {
        if (confirm("Le menu nfcwork.ma/menu/" + s + " existe déjà.\n\nOK = le REMPLACER par ce modèle\nAnnuler = créer un autre lien")) remplace = true;
        else { let i = 2; const s0 = s; while (liste.some(x => x.slug === s)) s = s0 + "-" + i++; if (!confirm("Créer nfcwork.ma/menu/" + s + " ?")) return; }
      }
      const wa = prompt("📞 Numéro WhatsApp qui reçoit les commandes / réservations :", (c.infos || {}).whatsapp || "");
      if (wa != null) { c.infos = c.infos || {}; c.infos.whatsapp = wa.trim(); c.infos.tel = wa.trim(); }
      const imgs = P.images || {}, ids = Object.keys(imgs).filter(id => /^data:image\//.test(imgs[id]));
      const d = fenetre(`<h2>📥 Import du menu</h2><p class="muted">Envoi des photos… <b>ne fermez pas la page</b> ⏳</p><div style="height:8px;border-radius:8px;background:var(--line);overflow:hidden"><i id="fp" style="display:block;height:100%;width:0;background:var(--accent);transition:width .2s"></i></div><p id="fpt" class="muted" style="margin-top:8px">0 / ${ids.length}</p>`);
      try {
        const map = {}; let n = 0;
        for (const id of ids) {
          const nid = rid(); await db.doc("settings/mimg-" + nid).set({ data: imgs[id], menu: s, maj: NOW() }); IMG[nid] = imgs[id]; map[id] = nid; n++;
          const b = d.querySelector("#fp"); if (b) b.style.width = Math.round(n / ids.length * 100) + "%"; const t = d.querySelector("#fpt"); if (t) t.textContent = n + " / " + ids.length;
        }
        const r = id => map[id] || id;
        c.slug = s; c.nom = nom.trim(); delete c.commandeRef;
        c.logo = r(c.logo || ""); c.couverture = r(c.couverture || ""); c.pages = (c.pages || []).map(r);
        c.categories.forEach(k => { k.id = k.id || rid(6); (k.items || []).forEach(it => { it.id = it.id || rid(6); if (it.photo) it.photo = r(it.photo); }); });
        await db.doc("settings/menu-" + s).set({ json: JSON.stringify(c), v: String(Date.now()), maj: NOW(), par: user.email });
        const info = { slug: s, nom: c.nom, formule: c.formule || "premium", actif: c.actif !== false, maj: Date.now() };
        const ex = liste.find(x => x.slug === s); if (ex) Object.assign(ex, info); else liste.push(info);
        await ecrireListe();
        try { localStorage.removeItem("nfcwork-menu-" + s); } catch (x) {}
        if (remplace && M && M.slug === s) M = null;
        d.remove(); toast("✅ Menu « " + c.nom + " » prêt avec " + n + " photos", true); location.hash = "#m=" + s;
      } catch (x) { d.remove(); erreur(x); }
    }
  }

  /* ---------- 💰 tous les prix sur une seule page ---------- */
  function prixRapides() {
    const ls = langsEdition(), loc = M.type === "location";
    const d = fenetre(`<h2>💰 ${loc ? "Prix par jour" : "Prix"}</h2><p class="muted" style="margin-top:2px">Tapez le prix de chaque ${loc ? "voiture (DH / jour)" : "produit"}, puis « Enregistrer ». Pour changer une photo : fermez, et touchez la ${loc ? "voiture" : "ligne"} ✏️.</p>
      <div class="stack" style="gap:6px;margin-top:10px;max-height:60vh;overflow:auto">${M.categories.map((c, ci) => `<div class="eyebrow" style="margin:10px 0 2px">${esc(T(c.nom, ls[0]))}</div>${(c.items || []).map((it, ii) => `<label class="row" style="gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:6px 10px">${it.photo ? imgTag(it.photo, "", "") : ""}<span style="flex:1;min-width:0;font-weight:600">${esc(T(it.nom, ls[0]))}</span><input data-pr="${ci}.${ii}" value="${esc(it.prix || "")}" inputmode="decimal" placeholder="0" style="width:90px;text-align:end;padding:9px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit;font-size:16px"><span class="muted">${loc ? "DH/j" : "DH"}</span></label>`).join("")}`).join("")}</div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn ghost" data-fermer>Annuler</button><button class="btn primary" id="pr-ok">💾 Enregistrer les prix</button></div>`, "big");
    d.querySelectorAll(".row img").forEach(im => { im.style.cssText = "width:56px;height:42px;object-fit:cover;border-radius:8px;flex:none"; });
    chargerVisibles();
    d.querySelector("#pr-ok").onclick = async () => {
      d.querySelectorAll("[data-pr]").forEach(inp => { const [ci, ii] = inp.dataset.pr.split(".").map(Number); const v = inp.value.trim().replace(/\s*(dh|mad)\s*$/i, ""); M.categories[ci].items[ii].prix = v; });
      d.remove(); renderEdit(); majBarre();
      const b = document.querySelector('[data-act="enregistrer"]'); if (b) await enregistrer(b);
    };
  }

  async function dupliquerMenu() {
    if (dirty()) { toast("Enregistrez d’abord ce menu."); return; }
    const nom = prompt("Nom du nouveau menu :", M.nom + " 2"); if (!nom || !nom.trim()) return;
    let s = slugify(nom); if (!s) return; let i = 2; const s0 = s; while (liste.some(x => x.slug === s)) s = s0 + "-" + i++;
    try {
      const c = JSON.parse(JSON.stringify(M)); c.slug = s; c.nom = nom.trim(); delete c.commandeRef;
      // les photos envoyées sont recopiées : supprimer un menu n'efface pas les photos de l'autre
      const map = {};
      for (const id of idsDe(c).filter(x => !enLigne(x))) { const d = IMG[id] || await chargerImg(id); if (d) { const n = rid(); await db.doc("settings/mimg-" + n).set({ data: d, menu: s, maj: NOW() }); IMG[n] = d; map[id] = n; } }
      const r = id => map[id] || id;
      c.logo = r(c.logo); c.couverture = r(c.couverture); c.pages = (c.pages || []).map(r); (c.categories || []).forEach(k => (k.items || []).forEach(it => { if (it.photo) it.photo = r(it.photo); }));
      const json = JSON.stringify(c);
      await db.doc("settings/menu-" + s).set({ json, v: String(Date.now()), maj: NOW(), par: user.email });
      liste.push({ slug: s, nom: c.nom, formule: c.formule, actif: true, maj: Date.now() }); await ecrireListe();
      toast("📄 Menu copié : « " + c.nom + " »", true); location.hash = "#m=" + s;
    } catch (x) { erreur(x); }
  }

  /* ---------- stands de table numérotés : page A4 prête à imprimer (6 par page) ---------- */
  function imprimerStands() {
    const de = Math.max(1, parseInt($("#tb-de").value, 10) || 1), a = Math.min(de + 199, Math.max(de, parseInt($("#tb-a").value, 10) || de));
    const hotel = M.type === "hotel", mot = hotel ? "CHAMBRE" : "TABLE";
    const pad = n => String(n).padStart(2, "0");
    const logo = M.logo ? IMG[M.logo] || "" : "";
    const coul = /^#[0-9a-f]{6}$/i.test(M.couleur || "") ? M.couleur : "#b5552b";
    const cartes = [];
    for (let n = de; n <= a; n++) {
      const lien = lienPublic(M.slug) + "?table=" + n;
      cartes.push(`<div class="st"><div class="h">${logo ? `<img src="${logo}" alt="">` : ""}<b>${esc(String(M.nom || "").toUpperCase())}</b></div>
        <small>${hotel ? "Room service · scannez ou touchez" : "Scannez ou touchez pour commander"}</small>
        <div class="q">${window.QRGEN.svg(lien, { ecl: "M", marge: 1, couleur: "#111111" })}</div>
        <div class="n" style="color:${coul}">${mot} ${pad(n)}</div><div class="w">📶 NFC · nfcwork.ma</div></div>`);
    }
    const w = window.open("", "_blank");
    if (!w) { toast("Autorisez les fenêtres (pop-up) pour imprimer.", true); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Stands ${esc(M.nom)}</title><style>
      @page{size:A4;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111}
      .g{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.st{border:1px dashed #bbb;border-radius:4mm;height:88mm;padding:5mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;break-inside:avoid}
      .h{display:flex;align-items:center;gap:3mm}.h img{height:12mm;max-width:24mm;object-fit:contain}.h b{font-size:15pt;letter-spacing:.5px}
      small{font-size:9pt;color:#555}.q{width:44mm;height:44mm}.q svg{width:100%;height:100%;display:block}.n{font-size:22pt;font-weight:800;letter-spacing:1px}.w{font-size:8pt;color:#777}
      .bar{position:sticky;top:0;background:#fff;padding:8px 0;text-align:center}.bar button{font-size:16px;padding:10px 18px;border-radius:10px;border:0;background:#1e90ff;color:#fff}
      @media print{.bar{display:none}}</style></head><body><div class="bar"><button onclick="print()">🖨 Imprimer / Enregistrer en PDF</button></div><div class="g">${cartes.join("")}</div></body></html>`);
    w.document.close();
  }

  function changerFormule(f) {
    if (f === M.formule) return;
    if (M.formule === "standard" && M.pages.length && !confirm("En Pro/Premium, le menu affiche des catégories et des produits (au lieu des photos de la carte). Les photos restent gardées si vous revenez en Standard. Continuer ?")) return;
    if (f !== "standard" && !M.categories.length) {
      const l0 = M.langues[0] || "fr";
      M.categories.push({ id: rid(6), nom: { [l0]: l0 === "ar" ? "المشروبات" : l0 === "en" ? "Drinks" : "Boissons" }, items: [] });
    }
    M.formule = f; renderEdit();
  }

  /* ---------- produit ---------- */
  function editerItem(ci, ii) {
    const c = M.categories[ci];
    const neuf = ii < 0;
    const it = neuf ? { id: rid(6), nom: {}, desc: {}, prix: "", photo: "", dispo: true } : JSON.parse(JSON.stringify(c.items[ii]));
    if (typeof it.nom !== "object" || !it.nom) it.nom = { [M.langues[0]]: it.nom || "" };
    if (typeof it.desc !== "object" || !it.desc) it.desc = { [M.langues[0]]: it.desc || "" };
    const ls = langsEdition();
    const d = fenetre(`<h2>${neuf ? "Nouveau produit" : "Modifier le produit"}</h2><p class="muted" style="margin-top:2px">${esc(T(c.nom, ls[0]))}</p>
      <form class="stack" id="itf">
        <div class="imgpick" id="it-pick">${it.photo ? imgTag(it.photo, "prev", "") : '<div class="prev"></div>'}
          <div class="row"><button type="button" class="btn sm primary" id="it-bank">Banque de photos</button><label class="btn sm">📷 Ma photo<input type="file" accept="image/*" hidden id="it-file"></label>${it.photo ? '<button type="button" class="btn sm ghost" id="it-noph">Retirer</button>' : ""}</div></div>
        ${ls.map(l => `<label class="f">Nom${ls.length > 1 ? " (" + LCOURT[l] + ")" : ""}<input data-l="${l}" data-k="nom" value="${esc(it.nom[l] || "")}" maxlength="80" ${l === "ar" ? 'dir="rtl"' : ""} ${l === ls[0] ? "required" : ""}></label>`).join("")}
        ${ls.map(l => `<label class="f">Description (facultatif)${ls.length > 1 ? " (" + LCOURT[l] + ")" : ""}<textarea data-l="${l}" data-k="desc" maxlength="240" ${l === "ar" ? 'dir="rtl"' : ""}>${esc(it.desc[l] || "")}</textarea></label>`).join("")}
        <label class="f">Prix (${esc(M.devise || "DH")})<input id="it-prix" value="${esc(it.prix || "")}" inputmode="decimal" maxlength="20" placeholder="25"></label>
        <label class="check"><input type="checkbox" id="it-dispo" ${it.dispo !== false ? "checked" : ""}> Disponible (décochez si épuisé)</label>
        ${M.formule === "premium" ? `<label class="check"><input type="checkbox" id="it-vedette" ${it.vedette ? "checked" : ""}> À ne pas manquer (affiché en grand en haut du menu)</label>` : ""}
        <div class="row"><button class="btn primary" style="flex:1">${neuf ? "Ajouter" : "Valider"}</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
        ${neuf ? "" : '<button type="button" class="btn danger sm" id="it-del">Supprimer ce produit</button>'}
      </form>`);
    const pick = $("#it-pick", d);
    let auto = false;
    const majPhoto = () => {
      pick.innerHTML = `${it.photo ? `<img class="prev" src="${IMG[it.photo] || (it.photo.startsWith("u:") ? window.BANQUE_URL(it.photo.slice(2), 400) : it.photo.startsWith("o:") ? window.PHOTO_AUTO.url(it.photo, 400) : "")}" alt="">` : '<div class="prev"></div>'}${auto ? '<small class="muted" style="flex-basis:100%">✨ Photo trouvée automatiquement — « Banque de photos » pour en choisir une autre.</small>' : ""}
        <div class="row"><button type="button" class="btn sm primary" id="it-bank">Banque de photos</button><label class="btn sm">📷 Ma photo<input type="file" accept="image/*" hidden id="it-file"></label>${it.photo ? '<button type="button" class="btn sm ghost" id="it-noph">Retirer</button>' : ""}</div>`;
    };
    pick.addEventListener("change", async e => {
      if (e.target.id !== "it-file" || !e.target.files[0]) return;
      await occupe(pick, async () => { it.photo = await televerser(e.target.files[0], "photo"); auto = false; majPhoto(); });
    });
    pick.addEventListener("click", e => {
      if (e.target.id === "it-noph") { it.photo = ""; auto = false; majPhoto(); }
      if (e.target.id === "it-bank") {
        const nomFr = (d.querySelector('[data-k="nom"]') || {}).value || "";
        banque("", nomFr, id => { it.photo = id; auto = false; majPhoto(); });
      }
    });
    if (it.photo) chargerImg(it.photo).then(() => { const im = pick.querySelector("img"); if (im) im.src = IMG[it.photo] || ""; });
    const del = $("#it-del", d);
    if (del) del.onclick = () => { if (confirm("Supprimer ce produit ?")) { c.items.splice(ii, 1); d.remove(); renderEdit(); } };
    $("#itf", d).onsubmit = e => {
      e.preventDefault();
      d.querySelectorAll("[data-l]").forEach(x => { it[x.dataset.k][x.dataset.l] = x.value.trim(); });
      it.prix = $("#it-prix", d).value.trim();
      it.dispo = $("#it-dispo", d).checked;
      const ve = $("#it-vedette", d); if (ve) it.vedette = ve.checked;
      if (neuf) c.items.push(it); else c.items[ii] = it;
      d.remove(); renderEdit();
      if (neuf) toast("Produit ajouté — pensez à enregistrer");
    };
    const first = d.querySelector('[data-k="nom"]'); if (first && neuf) first.focus();
    // photo trouvée toute seule dès que le nom est écrit (si le produit n'a pas encore de photo)
    if (first) first.addEventListener("change", async () => {
      if (it.photo && !auto) return;
      const v = first.value;
      const id = await window.PHOTO_AUTO.trouver(v, new Set(M.categories.flatMap(c => (c.items || []).map(i => i.photo)).filter(Boolean))).catch(() => "");
      if (id && first.value === v && (!it.photo || auto) && d.isConnected) { it.photo = id; auto = true; majPhoto(); }
    });
  }

  /* ---------- enregistrer ---------- */
  function nettoyer(m) {
    const clean = o => { if (o && typeof o === "object" && !Array.isArray(o)) for (const k of Object.keys(o)) { if (typeof o[k] === "string") o[k] = o[k].trim(); } return o; };
    clean(m); clean(m.infos); clean(m.slogan);
    m.nom = m.nom || "Menu";
    m.categories.forEach(c => { clean(c.nom); (c.items || []).forEach(i => { clean(i.nom); clean(i.desc); }); });
    return m;
  }
  async function enregistrer(b) {
    if (!M || !dirty()) return;
    b.disabled = true; $("#st").textContent = "Enregistrement…";
    try {
      nettoyer(M);
      if (PROPRIO) {
        try { const sv = JSON.parse((await db.doc("settings/menu-" + M.slug).get()).data().json || "{}"); ["formule", "type", "actif", "expire", "demo7", "slug", "commandeRef", "suivi", "reception"].forEach(k => { if (k in sv) M[k] = sv[k]; else delete M[k]; }); } catch (x) {}
      }
      const json = JSON.stringify(M);
      // 🕘 l'ancienne version part dans l'historique (ses photos sont gardées tant qu'elle y reste)
      let H = await lireHist(M.slug), garde = new Set(), jetees = [];
      if (saved && saved !== json) {
        H.unshift({ t: Date.now(), par: user.email, json: saved });
        while (H.length > HMAX || (H.length > 1 && JSON.stringify(H).length > 800000)) jetees.push(H.pop());
        try { await db.doc("settings/hist-" + M.slug).set({ json: JSON.stringify(H), maj: NOW() }); } catch (x) { console.warn("historique", x); }
      }
      H.forEach(v => { try { idsDe(JSON.parse(v.json)).forEach(i => garde.add(i)); } catch (x) {} });
      const dejetees = jetees.flatMap(v => { try { return idsDe(JSON.parse(v.json)); } catch (x) { return []; } });
      await db.doc("settings/menu-" + M.slug).set({ json, v: String(Date.now()), maj: NOW(), par: user.email });
      const e = liste.find(x => x.slug === M.slug);
      const info = { slug: M.slug, nom: M.nom, formule: M.formule, actif: M.actif !== false, maj: Date.now() };
      if (e) Object.assign(e, info); else liste.push(info);
      await ecrireListe();
      const now = new Set(idsDe(M));
      const orph = [...new Set([...savedIds, ...pending, ...dejetees])].filter(i => !now.has(i) && !garde.has(i) && !enLigne(i));
      await Promise.all(orph.map(i => db.doc("settings/mimg-" + i).delete().catch(() => {})));
      savedIds = now; pending.clear(); saved = json;
      try { localStorage.removeItem("nfcwork-menu-" + M.slug); } catch (x) {}
      toast("Enregistré ✓ Le menu est à jour en ligne.");
      entete(M.nom, (FORMULES[M.formule] || [""])[0] + " · nfcwork.ma/menu/" + M.slug, "#", lienPublic(M.slug));
    } catch (x) { erreur(x); }
    majBarre();
  }

  /* ---------- 🕘 historique : les 15 dernières versions, restaurables ---------- */
  const HMAX = 15;
  async function lireHist(slug) {
    try { const d = await db.doc("settings/hist-" + slug).get(); return d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { return []; }
  }
  async function historique() {
    const H = await lireHist(M.slug);
    const resume = j => { try { const m = JSON.parse(j); const c = (m.categories || []).length, n = (m.categories || []).reduce((s, k) => s + (k.items || []).length, 0); return `${c} catégorie${c > 1 ? "s" : ""} · ${n} produit${n > 1 ? "s" : ""}`; } catch (e) { return ""; } };
    const quand = t => new Date(t).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const d = fenetre(`<h2>🕘 Historique</h2><p class="muted" style="margin-top:2px">Chaque « Enregistrer » garde l’ancienne version (les ${HMAX} dernières). Vous avez effacé quelque chose par erreur ? Revenez en arrière.</p>
      <div class="stack" style="gap:8px;margin-top:10px">
        <div class="row between" style="padding:10px 12px;border:1px solid var(--accent);border-radius:12px"><div><b>✅ Version en ligne</b><div class="muted" style="font-size:13px">${resume(saved)}</div></div></div>
        ${H.length ? H.map((v, i) => `<div class="row between" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px;gap:8px"><div style="min-width:0"><b>${esc(quand(v.t))}</b><div class="muted" style="font-size:13px">${resume(v.json)}</div></div><button class="btn sm" data-hr="${i}">↩️ Revenir</button></div>`).join("")
          : `<p class="muted">Pas encore d’anciennes versions : elles apparaîtront après le prochain « Enregistrer ».</p>`}
      </div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-fermer>Fermer</button></div>`);
    d.addEventListener("click", e => {
      const b = e.target.closest("[data-hr]"); if (!b) return;
      const v = H[+b.dataset.hr]; if (!v) return;
      if (!confirm("Revenir à la version du " + quand(v.t) + " ?\n\nVous la verrez d’abord ici : rien ne change en ligne tant que vous n’appuyez pas sur « Enregistrer ».")) return;
      try {
        const slug = M.slug, m = JSON.parse(v.json);
        m.slug = slug; m.langues = ["fr"]; m.infos = m.infos || {}; m.slogan = m.slogan || {}; m.pages = m.pages || []; m.categories = m.categories || [];
        M = m; d.remove(); renderEdit(); majBarre();
        toast("↩️ Ancienne version chargée. Vérifiez puis appuyez sur « Enregistrer ».", true);
      } catch (x) { toast("Version illisible."); }
    });
  }

  async function supprimer() {
    const r = prompt(`Pour supprimer définitivement « ${M.nom} », écrivez SUPPRIMER :`);
    if (!r || r.trim().toUpperCase() !== "SUPPRIMER") return;
    try {
      const hist = (await lireHist(M.slug)).flatMap(v => { try { return idsDe(JSON.parse(v.json)); } catch (x) { return []; } });
      const ids = new Set([...idsDe(M), ...savedIds, ...pending, ...hist].filter(i => !enLigne(i)));
      await Promise.all([...ids].map(i => db.doc("settings/mimg-" + i).delete().catch(() => {})));
      await db.doc("settings/hist-" + M.slug).delete().catch(() => {});
      await db.doc("settings/menu-" + M.slug).delete();
      liste = liste.filter(x => x.slug !== M.slug);
      await ecrireListe();
      pending.clear(); M = null; saved = "";
      toast("Menu supprimé.");
      location.hash = "";
      renderListe();
    } catch (x) { erreur(x); }
  }

  /* ---------- aperçu (sans enregistrer) ---------- */
  function apercu() {
    const d = fenetre(`<div class="bar"><b style="flex:1">Aperçu${dirty() ? " (non enregistré)" : ""}</b><button class="btn sm ghost" data-fermer>Fermer</button></div><iframe title="Aperçu du menu" src="/menu/?apercu=1&m=${encodeURIComponent(M.slug)}"></iframe>`, "big");
    const f = $("iframe", d);
    const envoyer = async () => {
      await Promise.all(idsDe(M).map(chargerImg));
      const images = {}; idsDe(M).forEach(i => { if (IMG[i]) images[i] = IMG[i]; });
      f.contentWindow.postMessage({ type: "nfcwork-menu-apercu", menu: JSON.parse(JSON.stringify(M)), images }, location.origin);
    };
    const onMsg = e => { if (e.source === f.contentWindow && e.data && e.data.type === "nfcwork-menu-pret") envoyer(); };
    window.addEventListener("message", onMsg);
    d.addEventListener("fermee", () => window.removeEventListener("message", onMsg));
  }

  /* ---------- importer un menu (lien Glovo / Jumia / site, texte copié ou code) ---------- */
  function importer() {
    const IM = window.IMPORT_MENU;
    const d = fenetre(`<div class="row between"><h2>Importer un menu</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="margin:4px 0 12px;font-size:13.5px">Collez le <b>lien</b> du resto sur Glovo, Jumia ou son site — ou tout le <b>texte</b> de la page copié — ou le <b>nom du menu préparé</b> pour vous (ex. lartisan). Les catégories, produits, descriptions et prix se remplissent tout seuls.</p>
      <form class="stack" id="imf">
        <label class="f">Lien, texte ou code<textarea id="im-t" rows="5" placeholder="https://glovoapp.com/fr/ma/kenitra/stores/…" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></label>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <label class="f" style="flex:1;min-width:150px">Baisser les prix de (%)<input id="im-pct" type="number" inputmode="decimal" min="0" max="60" step="0.1" value="0" placeholder="0"></label>
          <label class="f" style="flex:1;min-width:150px">Arrondi<select id="im-pas"><option value="1">Au dirham (25)</option><option value="0.5">Au demi (24,5)</option><option value="0">Sans arrondi</option></select></label></div>
        <label class="check"><input type="checkbox" id="im-ph" checked> Ajouter les photos automatiquement</label>
        <label class="check"><input type="checkbox" id="im-rep"> Remplacer les catégories actuelles (sinon : ajoutées à la suite)</label>
        <p class="err" id="im-err"></p>
        <div id="im-prev"></div>
        <button class="btn primary" id="im-go">Lire le menu</button>
      </form>`);
    let lu = null;
    const err = $("#im-err", d), prev = $("#im-prev", d), go = $("#im-go", d);
    const montrer = cats => {
      lu = cats;
      const n = cats.reduce((k, c) => k + c.items.length, 0);
      const pct = -Math.abs(+$("#im-pct", d).value || 0), pas = +$("#im-pas", d).value;
      prev.innerHTML = `<div class="paper" style="padding:12px 14px;border-radius:14px"><b>${cats.length} catégorie(s) · ${n} produit(s) trouvés</b>
        ${cats.map(c => `<div style="margin-top:10px"><b>${esc(c.nom)}</b> <span class="muted">(${c.items.length})</span><div class="muted" style="font-size:13px">${c.items.slice(0, 6).map(i => `${esc(i.nom)} — ${esc(IM.arrondir(i.prix, pct, pas))} ${esc(M.devise || "DH")}`).join("<br>")}${c.items.length > 6 ? "<br>…" : ""}</div></div>`).join("")}</div>`;
      go.textContent = `Importer ${n} produit(s)`;
    };
    d.addEventListener("change", e => { if (lu && (e.target.id === "im-pct" || e.target.id === "im-pas")) montrer(lu); });
    $("#im-pct", d).addEventListener("input", () => { if (lu) montrer(lu); });
    $("#im-t", d).addEventListener("input", () => { lu = null; prev.innerHTML = ""; err.textContent = ""; go.textContent = "Lire le menu"; });
    $("#imf", d).onsubmit = async e => {
      e.preventDefault(); err.textContent = "";
      let t = $("#im-t", d).value.trim();
      // texte de partage (« Hey! Check out this store: https://… ») → on garde juste le lien
      const lien = t.match(/https?:\/\/\S+/i);
      if (lien && t.length < 300) t = lien[0];
      if (/go\.link|glovo\.page\.link|onelink|adj\.st/i.test(t)) {
        err.innerHTML = "Ce lien vient du <b>partage de l’application</b> Glovo : il ouvre l’appli et ne contient pas le menu.<br>• Envoyez ce lien à l’assistant NFCWORK : il vous prépare le menu (vous tapez ensuite juste son nom ici).<br>• Ou cherchez le resto sur <b>glovoapp.com</b> dans le navigateur et collez le lien de la page.";
        return;
      }
      if (!lu) {
        if (!t) { err.textContent = "Collez un lien, un texte ou un code."; return; }
        go.disabled = true;
        let cats;
        if (/^https?:\/\/\S+$/i.test(t)) {
          go.textContent = "Lecture de la page… (jusqu’à 1 minute)";
          cats = await IM.lirePage(t);
          if (!cats) {
            go.disabled = false; go.textContent = "Lire le menu";
            err.innerHTML = "La page n’a pas pu être lue automatiquement.<br>• Sur ordinateur : ouvrez le lien, sélectionnez tout (Ctrl+A / ⌘A), copiez et collez le texte ici.<br>• Ou envoyez le lien à l’assistant NFCWORK : il vous prépare un code à coller ici.";
            return;
          }
        } else if (/^[a-z0-9-]{3,40}$/i.test(t)) {
          go.textContent = "Lecture…";
          cats = (await IM.lirePrepare(t.toLowerCase())) || [];
          if (!cats.length) { go.disabled = false; go.textContent = "Lire le menu"; err.textContent = `Aucun menu préparé ne s’appelle « ${t} ».`; return; }
        } else cats = IM.lire(t);
        go.disabled = false;
        if (!cats.length) { go.textContent = "Lire le menu"; err.textContent = "Aucun produit avec un prix n’a été trouvé dans ce texte."; return; }
        montrer(cats); return;
      }
      // importer
      const l0 = M.langues[0] || "fr", pct = -Math.abs(+$("#im-pct", d).value || 0), pas = +$("#im-pas", d).value;
      if ($("#im-rep", d).checked) {
        const n = M.categories.reduce((k, c) => k + (c.items || []).length, 0);
        if (n && !confirm(`Remplacer les ${n} produit(s) actuels par le menu importé ?`)) return;
        M.categories = [];
      }
      for (const c of lu) {
        let cible = M.categories.find(x => (T(x.nom, l0) || "").trim().toLowerCase() === c.nom.trim().toLowerCase());
        if (!cible) { cible = { id: rid(6), nom: { [l0]: c.nom }, items: [] }; M.categories.push(cible); }
        for (const i of c.items) cible.items.push(Object.assign({ id: rid(6), nom: { [l0]: i.nom }, desc: { [l0]: i.desc || "" }, prix: IM.arrondir(i.prix, pct, pas), photo: i.photo || "", dispo: true }, i.vedette && M.formule === "premium" ? { vedette: true } : {}));
      }
      M.categories = M.categories.filter(c => (c.items || []).length);   // les catégories vides (ex. « Boissons » créée au départ) disparaissent
      const meta = lu.meta || {};
      if (meta.slogan && !T(M.slogan, l0)) M.slogan = Object.assign({}, typeof M.slogan === "object" ? M.slogan : {}, { [l0]: meta.slogan });
      if (meta.theme) M.theme = meta.theme;
      if (meta.couleur) M.couleur = meta.couleur;
      if (meta.couverture && !M.couverture) M.couverture = meta.couverture;
      if (meta.logo && !M.logo) M.logo = meta.logo;
      const ph = $("#im-ph", d).checked;
      d.remove(); renderEdit();
      toast("Menu importé ✓ Vérifiez puis « Enregistrer ».");
      if (ph) { const b = document.querySelector('[data-act="photos-auto"]'); if (b) photosAuto(b); }
    };
  }

  /* ---------- photos automatiques pour tous les produits sans photo ---------- */
  // tout = true : remplace aussi les photos déjà mises (photos HD de la banque pour tout le menu)
  async function photosAuto(b, tout) {
    const l0 = M.langues[0] || "fr";
    const todo = M.categories.flatMap(c => (c.items || []).filter(i => (tout || !i.photo) && T(i.nom, l0).trim()).map(i => [i, c]));
    if (!todo.length) { toast("Donnez d’abord un nom aux produits."); return; }
    b.disabled = true;
    let ok = 0;
    const deja = new Set(tout ? [] : M.categories.flatMap(c => (c.items || []).map(i => i.photo)).filter(Boolean));
    for (let k = 0; k < todo.length; k++) {
      b.textContent = `${k + 1} / ${todo.length}…`;
      const [it, c] = todo[k];
      const id = await window.PHOTO_AUTO.trouverTout(T(it.nom, l0), T(c.nom, l0), T(it.desc, l0), deja).catch(() => "");
      if (id) { it.photo = id; deja.add(id); ok++; }
    }
    // Premium : une belle photo de couverture si le menu n'en a pas
    if (M.formule === "premium" && !M.couverture) { M.couverture = window.PHOTO_AUTO.couverture(M.categories.map(c => T(c.nom, l0))); M.couvPos = ""; }
    renderEdit();
    toast(ok ? `✨ ${ok} photo(s) HD ajoutée(s) ✓ Vérifiez-les, puis « Enregistrer ».` + (ok < todo.length ? ` ${todo.length - ok} sans photo trouvée : ajoutez-la à la main.` : "") : "Aucune photo sûre trouvée. Choisissez-les dans la banque de photos.", true);
  }

  /* ---------- banque de photos ---------- */
  const sansAccent = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function banque(cat, recherche, choisir) {
    const B = window.BANQUE || [];
    const cats = [...new Set(B.map(x => x[2]))];
    let filtre = cat, q = recherche;
    const d = fenetre(`<div class="row between"><h2>Banque de photos</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="margin:4px 0 12px;font-size:13px">Photos professionnelles libres de droits. Touchez une photo pour la choisir.</p>
      <label class="f"><input id="bq-q" placeholder="Rechercher : café crème, omelette, avocat…" value="${esc(q)}" autocomplete="off"></label>
      <div class="row" id="bq-cats" style="margin:10px 0;gap:6px"></div><div class="thumbs" id="bq-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))"></div>
      <div id="bq-off"></div>`);
    $("#bq-grid", d).insertAdjacentElement("beforebegin", $("#bq-off", d));
    let tOff = 0, locaux = 1;
    const offTitre = '<h3 style="margin:18px 0 4px">Produits de marque</h3><p class="muted" style="margin:0 0 10px;font-size:12.5px">Photos des vrais produits (Open Food Facts, base libre).</p>';
    const dessinerOff = () => {
      clearTimeout(tOff);
      const box = $("#bq-off", d), qq = q.trim();
      const mq0 = window.PHOTO_AUTO.marque(qq);
      box.style.order = mq0 ? "-1" : "";
      if (qq.length < 3 || (!mq0 && locaux)) { box.innerHTML = ""; return; }
      box.innerHTML = offTitre + '<p class="muted" style="font-size:13px">Recherche…</p>';
      tOff = setTimeout(async () => {
        const mq = window.PHOTO_AUTO.marque(qq);
        const l = await window.PHOTO_AUTO.chercherOFF(mq && sansAccent(qq).length <= mq.length + 2 ? mq : qq).catch(() => []);
        if (q.trim() !== qq || !d.isConnected) return;
        box.innerHTML = l.length ? offTitre + `<div class="thumbs" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${l.map(x => `<button class="thumb" data-bq-o="${esc(x.id)}" style="cursor:pointer;padding:0;text-align:start;background:#fff"><img src="${window.PHOTO_AUTO.url(x.id, 400)}" alt="${esc(x.nom)}" loading="lazy" style="aspect-ratio:1;object-fit:contain;background:#fff" onerror="this.closest('.thumb').remove()"><span style="display:block;padding:6px 8px;font-size:12.5px;color:#222">${esc(x.nom)}</span></button>`).join("")}</div>` : "";
      }, 500);
    };
    const dessiner = () => {
      $("#bq-cats", d).innerHTML = [["", "Tout"], ...cats.map(c => [c, c])].map(([k, n]) => `<button class="btn sm${filtre === k ? " primary" : ""}" data-bqc="${esc(k)}">${esc(n)}</button>`).join("");
      const mots = sansAccent(q).split(/\s+/).filter(w => w.length > 1);
      let l = B.filter(x => !filtre || x[2] === filtre);
      if (mots.length) {
        const sc = x => mots.filter(w => sansAccent(x[1] + " " + x[3]).includes(w)).length;
        const t = l.map(x => [x, sc(x)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([x]) => x);
        l = t;
      }
      locaux = l.length; setTimeout(chargerVisibles);
      $("#bq-grid", d).innerHTML = l.map(x => `<button class="thumb" data-bq="${esc(x[0])}" style="cursor:pointer;padding:0;text-align:start"><img ${bqImg(x[0], 300)} alt="${esc(x[1])}" loading="lazy" style="aspect-ratio:1" onerror="this.closest('.thumb').remove()"><span style="display:block;padding:6px 8px;font-size:12.5px">${esc(x[1])}</span></button>`).join("") || `<p class="muted" style="grid-column:1/-1;font-size:13px">Pas de photo pour « ${esc(q)} » dans la banque.</p>`;
    };
    dessiner(); dessinerOff(); chargerVisibles();
    $("#bq-q", d).addEventListener("input", e => { q = e.target.value; dessiner(); dessinerOff(); });
    d.addEventListener("click", e => {
      const c = e.target.closest("[data-bqc]"); if (c) { filtre = c.dataset.bqc; dessiner(); return; }
      const p = e.target.closest("[data-bq]"); if (p) { choisir(window.PHOTO_AUTO.pid(p.dataset.bq)); d.remove(); }
      const o = e.target.closest("[data-bq-o]"); if (o) { choisir(o.dataset.bqO); d.remove(); }
    });
  }

  /* ---------- 🖼 banque de photos perso (ajouter / retirer depuis le téléphone) ----------
     settings/banque-perso : { json: { ajouts: [[id, nom, catégorie, mots]], caches: [id…] } }
     une photo ajoutée est gardée dans settings/mimg-bq… (jamais effacée par un menu) */
  const BQ = { ok: false, base: null, ajouts: [], caches: [] };
  const bqImg = (id, w) => /^bq/.test(id) ? `data-img="${esc(id)}" ${IMG[id] ? `src="${IMG[id]}"` : ""}` : `src="${window.BANQUE_URL(id, w)}"`;
  function appliquerBanque() {
    if (!BQ.base) BQ.base = (window.BANQUE || []).slice();
    const c = new Set(BQ.caches);
    window.BANQUE = BQ.ajouts.concat(BQ.base).filter(x => !c.has(x[0]));
  }
  async function chargerBanque() {
    BQ.ok = true;
    try { const d = await db.doc("settings/banque-perso").get(); if (d.exists) { const j = JSON.parse(d.data().json || "{}"); BQ.ajouts = j.ajouts || []; BQ.caches = j.caches || []; } }
    catch (e) { BQ.ok = false; return; }
    appliquerBanque();
    if (location.hash === "#banque") pageBanque();
  }
  async function ecrireBanque() {
    await db.doc("settings/banque-perso").set({ json: JSON.stringify({ ajouts: BQ.ajouts, caches: BQ.caches }), maj: NOW(), par: user.email });
    appliquerBanque();
  }
  let bqFiltre = "", bqQ = "", bqVoirCaches = false;
  function pageBanque() {
    entete("Banque de photos", "Espace gestion", "#", "");
    if (!BQ.base) appliquerBanque();
    const tout = BQ.ajouts.concat(BQ.base), c = new Set(BQ.caches);
    const cats = [...new Set(tout.map(x => x[2]))];
    const mots = sansAccent(bqQ).split(/\s+/).filter(w => w.length > 1);
    let l = tout.filter(x => (bqVoirCaches ? c.has(x[0]) : !c.has(x[0])) && (!bqFiltre || x[2] === bqFiltre));
    if (mots.length) l = l.filter(x => mots.every(w => sansAccent(x[1] + " " + x[2] + " " + x[3]).includes(w)));
    app.innerHTML = `<div class="row between" style="gap:10px;flex-wrap:wrap"><div><h2>🖼 Banque de photos</h2><div class="muted">${tout.length - c.size} photos · ${BQ.ajouts.length} ajoutée(s) par vous</div></div>
      <div class="row" style="gap:6px;flex-wrap:wrap"><label class="btn primary">📷 Ajouter des photos<input type="file" accept="image/*" multiple hidden id="bq-add"></label><a class="btn ghost" href="#">← Menus</a></div></div>
      <p class="muted" style="font-size:13.5px;margin:8px 0 12px">Ces photos servent pour « Photos automatiques », « Tout en HD », la couverture et le bouton « Banque de photos » de chaque menu. Touchez une photo pour la renommer, changer sa catégorie ou la retirer.</p>
      <label class="f"><input id="bqp-q" placeholder="Rechercher : café, omelette, jus…" value="${esc(bqQ)}" autocomplete="off"></label>
      <div class="row" style="margin:10px 0;gap:6px;flex-wrap:wrap">${[["", "Tout"], ...cats.map(k => [k, k])].map(([k, n]) => `<button class="btn sm${bqFiltre === k ? " primary" : ""}" data-bqpc="${esc(k)}">${esc(n)}</button>`).join("")}
        <button class="btn sm${bqVoirCaches ? " primary" : " ghost"}" data-bqpv>🗑 Retirées (${c.size})</button></div>
      <div class="thumbs" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${l.map(x => `<button class="thumb" data-bqp="${esc(x[0])}" style="cursor:pointer;padding:0;text-align:start;position:relative"><img ${bqImg(x[0], 300)} alt="${esc(x[1])}" loading="lazy" style="aspect-ratio:1">${/^bq/.test(x[0]) ? '<span class="pill" style="position:absolute;top:6px;left:6px;font-size:11px">Ajoutée</span>' : ""}<span style="display:block;padding:6px 8px;font-size:12.5px">${esc(x[1])}<br><small class="muted">${esc(x[2])}</small></span></button>`).join("") || `<p class="muted" style="grid-column:1/-1">Aucune photo.</p>`}</div>`;
    chargerVisibles();
    const q = $("#bqp-q"); q.oninput = () => { bqQ = q.value; const pos = q.selectionStart; pageBanque(); const n = $("#bqp-q"); n.focus(); n.setSelectionRange(pos, pos); };
    $("#bq-add").onchange = e => { const fs = [...e.target.files]; if (fs.length) bqAjouter(fs, cats); };
  }
  document.addEventListener("click", e => {
    if (location.hash !== "#banque" || e.target.closest(".modal")) return;
    const c = e.target.closest("[data-bqpc]"); if (c) { bqFiltre = c.dataset.bqpc; pageBanque(); return; }
    if (e.target.closest("[data-bqpv]")) { bqVoirCaches = !bqVoirCaches; pageBanque(); return; }
    const p = e.target.closest("[data-bqp]"); if (p) bqFiche(p.dataset.bqp);
  });
  const bqCatsHtml = (cats, v) => `<input list="bq-catl" value="${esc(v || "")}" placeholder="Catégorie (ex. Boissons chaudes)" maxlength="40"><datalist id="bq-catl">${cats.map(k => `<option value="${esc(k)}">`).join("")}</datalist>`;
  function bqAjouter(fs, cats) {
    const d = fenetre(`<h2>📷 Ajouter ${fs.length} photo(s)</h2><p class="muted" style="font-size:13px;margin:2px 0 10px">Donnez un nom clair (il sert à trouver la photo automatiquement : « Jus d’orange », « Omelette fromage »…).</p>
      <label class="f">Catégorie pour toutes${bqCatsHtml(cats, bqFiltre)}</label>
      <div class="stack" id="bqa-l" style="gap:8px;margin-top:10px">${fs.map((f, k) => `<div class="row" style="gap:10px;flex-wrap:nowrap"><img id="bqa-i${k}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;flex:none;background:var(--sunk,#eee)"><input id="bqa-n${k}" style="flex:1;min-width:0" maxlength="60" value="${esc(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/^(img|image|photo|whatsapp image).*$/i, ""))}" placeholder="Nom de la photo"></div>`).join("")}</div>
      <p class="err" id="bqa-e"></p><div class="row" style="margin-top:10px"><button class="btn primary" style="flex:1" id="bqa-go">Ajouter à la banque</button><button class="btn ghost" data-fermer>Annuler</button></div>`);
    fs.forEach((f, k) => { const u = URL.createObjectURL(f); $("#bqa-i" + k, d).src = u; });
    $("#bqa-go", d).onclick = async () => {
      const cat = $("input[list]", d).value.trim() || "Mes photos", go = $("#bqa-go", d);
      if (fs.some((f, k) => !$("#bqa-n" + k, d).value.trim())) { $("#bqa-e", d).textContent = "Donnez un nom à chaque photo."; return; }
      go.disabled = true;
      try {
        for (let k = 0; k < fs.length; k++) {
          go.textContent = `Envoi ${k + 1} / ${fs.length}…`;
          const data = await compresser(fs[k], OPTS.photo), id = "bq" + rid(), nom = $("#bqa-n" + k, d).value.trim();
          await db.doc("settings/mimg-" + id).set({ data, menu: "banque", maj: NOW() });
          IMG[id] = data; BQ.ajouts.unshift([id, nom, cat, sansAccent(nom + " " + cat)]);
        }
        await ecrireBanque(); d.remove(); pageBanque(); toast(`✅ ${fs.length} photo(s) ajoutée(s) à la banque`, true);
      } catch (e) { go.disabled = false; go.textContent = "Ajouter à la banque"; erreur(e); }
    };
  }
  function bqFiche(id) {
    const x = BQ.ajouts.find(y => y[0] === id) || BQ.base.find(y => y[0] === id); if (!x) return;
    const perso = /^bq/.test(id), cache = BQ.caches.includes(id), cats = [...new Set(BQ.ajouts.concat(BQ.base).map(y => y[2]))];
    const d = fenetre(`<img ${bqImg(id, 800)} style="width:100%;max-height:50vh;object-fit:cover;border-radius:14px;background:var(--sunk,#eee)">
      ${perso ? `<label class="f" style="margin-top:10px">Nom<input id="bqf-n" maxlength="60" value="${esc(x[1])}"></label><label class="f">Catégorie${bqCatsHtml(cats, x[2])}</label>` : `<h3 style="margin:12px 0 2px">${esc(x[1])}</h3><p class="muted" style="margin:0">${esc(x[2])}</p>`}
      <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">${perso ? `<button class="btn primary" id="bqf-ok">💾 Enregistrer</button>` : ""}
        ${cache ? `<button class="btn primary" id="bqf-rest">↩️ Remettre dans la banque</button>` : `<button class="btn danger" id="bqf-del">🗑 Retirer de la banque</button>`}<button class="btn ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="font-size:12.5px;margin-top:8px">Retirer une photo ne l’enlève pas des menus qui l’utilisent déjà.</p>`);
    if (perso) chargerImg(id);
    const fin = async msg => { try { await ecrireBanque(); d.remove(); pageBanque(); toast(msg); } catch (e) { erreur(e); } };
    const ok = $("#bqf-ok", d); if (ok) ok.onclick = () => { x[1] = $("#bqf-n", d).value.trim() || x[1]; x[2] = $("input[list]", d).value.trim() || x[2]; x[3] = sansAccent(x[1] + " " + x[2]); fin("Photo modifiée ✓"); };
    const del = $("#bqf-del", d); if (del) del.onclick = () => { BQ.caches.push(id); fin("Photo retirée ✓"); };
    const rs = $("#bqf-rest", d); if (rs) rs.onclick = () => { BQ.caches = BQ.caches.filter(y => y !== id); fin("Photo remise ✓"); };
  }

  /* ---------- 🎨 Premium : 3 designs de couverture (photo + style + nom + logo + couleurs du menu) ---------- */
  const STYLES = [["", "Plein écran"], ["cadre", "Cadre"], ["bandeau", "Bandeau"]];
  function couvDesign() {
    const l0 = M.langues[0] || "fr";
    const photos = window.PHOTO_AUTO.couvertures(M.categories.map(c => T(c.nom, l0)));
    if (M.couverture && !photos.includes(M.couverture)) photos.unshift(M.couverture);
    let tour = 0;
    const d = fenetre(`<div class="row between"><h2>🎨 Choisissez la couverture</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="font-size:13px;margin:2px 0 10px">Avec le nom, le logo et les couleurs de votre menu. Touchez celle que vous voulez.</p>
      <div id="cd-l" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory"></div>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn" id="cd-autre" style="flex:1">🔄 3 autres propositions</button></div>`, "big");
    const dessiner = () => {
      const props = STYLES.map(([st, n], k) => ({ st, n, ph: photos[(tour * 3 + k) % photos.length] }));
      $("#cd-l", d).innerHTML = props.map((p, k) => `<div style="flex:none;width:236px;scroll-snap-align:start;text-align:center"><div style="width:236px;height:340px;overflow:hidden;border-radius:16px;border:1px solid var(--line,#ddd);position:relative"><iframe data-k="${k}" title="${esc(p.n)}" src="/menu/?apercu=1&cadre=1&m=${encodeURIComponent(M.slug)}" style="width:390px;height:563px;border:0;transform:scale(.605);transform-origin:0 0;pointer-events:none" tabindex="-1"></iframe></div>
        <b style="display:block;margin:8px 0 6px">${k + 1}. ${esc(p.n)}</b><button class="btn primary sm block" data-cd="${k}">Choisir celle-ci</button></div>`).join("");
      d._props = props;
    };
    const onMsg = async e => {
      const f = [...d.querySelectorAll("iframe[data-k]")].find(x => x.contentWindow === e.source);
      if (!f || !e.data || e.data.type !== "nfcwork-menu-pret") return;
      const p = d._props[+f.dataset.k], m = JSON.parse(JSON.stringify(M));
      m.couverture = p.ph; m.couvPos = ""; m.heroStyle = p.st;
      const ids = [m.logo, m.couverture].filter(Boolean); await Promise.all(ids.map(chargerImg));
      const images = {}; ids.forEach(i => { if (IMG[i]) images[i] = IMG[i]; });
      f.contentWindow.postMessage({ type: "nfcwork-menu-apercu", menu: m, images }, location.origin);
    };
    window.addEventListener("message", onMsg);
    d.addEventListener("fermee", () => window.removeEventListener("message", onMsg));
    d.addEventListener("click", e => {
      if (e.target.id === "cd-autre") { tour++; dessiner(); return; }
      const b = e.target.closest("[data-cd]"); if (!b) return;
      const p = d._props[+b.dataset.cd]; M.couverture = p.ph; M.couvPos = ""; M.heroStyle = p.st;
      d.remove(); window.removeEventListener("message", onMsg); renderEdit(); toast("Couverture choisie ✓ Cliquez « Enregistrer ».", true);
    });
    dessiner();
  }

  /* ---------- outils ---------- */
  function fenetre(html, cls) {
    const d = document.createElement("div");
    d.className = "modal";
    d.innerHTML = `<div class="box ${cls || ""}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d);
    const fermer = () => { d.remove(); d.dispatchEvent(new Event("fermee")); };
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-fermer]")) fermer(); });
    return d;
  }
  async function copier(t) {
    try { await navigator.clipboard.writeText(t); toast("Lien copié"); }
    catch (e) { prompt("Copiez le lien :", t); }
  }
})();
