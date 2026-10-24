/* =========================================================
   NFCWORK — MENUS TV (admin)
   On importe le PDF du menu (ou des photos) : chaque page devient une image,
   et un lien nfcwork.ma/tv/<nom> les fait défiler en boucle sur la TV, avec des transitions.
   Firestore, collection « settings » (lecture publique, écriture admin — règle déjà en place) :
     settings/tvs           → liste  { json: "[{slug, nom, n, maj, apercu}]" }
     settings/tv-<nom>      → un écran { json: "{v, slug, nom, pages:[ids], duree, effet, fond, actif}" }
     settings/mimg-<id>     → une page en image JPEG { data } (même format que les photos des menus)
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
  const SITE = "https://nfcwork.ma";
  const lienTV = s => SITE + "/tv/" + s;
  const EFFETS = { zoom: ["Zoom doux", "La page avance lentement"], fondu: ["Fondu", "Une page se fond dans l’autre"], glisse: ["Glissé", "La page arrive de côté"] };
  const FONDS = { flou: ["Fond flouté", "La page remplit l’écran"], noir: ["Fond noir", "Sobre"] };

  const rid = (n = 10) => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const slugify = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  let user = null, liste = [], E = null, saved = "", PROPRIO = null;
  const IMG = {};
  const dirty = () => E && JSON.stringify(E) !== saved;

  /* ---------- connexion ---------- */
  auth.onAuthStateChanged(async u => {
    user = u;
    if (!u) { renderLogin(); return; }
    if ((u.email || "").toLowerCase() !== ADMIN) {
      // ✏️ mode commerçant : seulement ses menus TV (cochés dans sa fiche client)
      const ok = window.NFCW_PROPRIO && await window.NFCW_PROPRIO(db, u, "tvs", "editTv");
      if (!ok) { (window.NFCW_REFUS || (a => a.innerHTML = "<div class='empty'><h3>Accès réservé</h3></div>"))(app); return; }
      PROPRIO = ok; await chargerListe();
      liste = liste.filter(x => ok.includes(x.slug));
      if (liste.length === 1 && !location.hash.startsWith("#e=")) history.replaceState(null, "", "#e=" + liste[0].slug);
      route(); return;
    }
    await chargerListe(); route();
  });
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
  function erreur(e) {
    console.error(e);
    toast(e && e.code === "permission-denied" ? (PROPRIO ? "Pas encore autorisé : demandez à NFCWORK d’activer la modification." : "Refusé par Firebase : connectez-vous avec l’e-mail admin.") : "Échec. Vérifiez la connexion et réessayez.", true);
  }

  /* ---------- données ---------- */
  async function chargerListe() {
    try { const d = await db.doc("settings/tvs").get(); liste = d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { liste = []; erreur(e); }
  }
  const ecrireListe = () => PROPRIO ? Promise.resolve() : db.doc("settings/tvs").set({ json: JSON.stringify(liste), maj: NOW(), par: user.email });
  async function img(id) {
    if (!id || IMG[id]) return IMG[id];
    try { const d = await db.doc("settings/mimg-" + id).get(); if (d.exists) IMG[id] = d.data().data; } catch (e) {}
    document.querySelectorAll(`img[data-img="${id}"]`).forEach(el => { if (IMG[id]) el.src = IMG[id]; });
    return IMG[id];
  }
  const imgTag = id => `<img data-img="${esc(id)}" ${IMG[id] ? `src="${IMG[id]}"` : ""} alt="">`;
  const remplir = () => document.querySelectorAll("img[data-img]").forEach(el => { if (!el.src) img(el.dataset.img); });

  /* ---------- navigation ---------- */
  function route() {
    const m = location.hash.match(/^#e=([a-z0-9-]+)/);
    if (PROPRIO && m && !PROPRIO.includes(m[1])) { location.hash = ""; return; }
    const mm = location.hash.match(/^#menu=([a-z0-9-]+)/);
    if (mm && !PROPRIO) { history.replaceState(null, "", "#"); renderListe(); depuisMenu(mm[1]); return; }
    if (location.hash === "#nouveau" && !PROPRIO) { history.replaceState(null, "", "#"); renderListe(); nouveau(); return; }
    if (m) ouvrir(m[1]); else renderListe();
  }
  window.addEventListener("hashchange", () => { if (dirty() && !(E && location.hash === "#e=" + E.slug) && !confirm("Modifications non enregistrées : quitter quand même ?")) return; route(); });

  function renderListe() {
    E = null; saved = "";
    $("#topTitle").textContent = "Menus TV"; $("#topSub").textContent = "Menu → écran TV"; $("#backBtn").href = "./";
    app.innerHTML = `<div class="row between"><div><h2>Menus TV</h2><div class="muted">Choisissez un de vos menus : les écrans TV se fabriquent tout seuls (catégorie par catégorie), avec un lien pour la TV et une vidéo pour clé USB.</div></div>
      <div class="row" style="gap:6px;flex-wrap:wrap" data-adm><button class="btn primary" data-act="depuis-menu">🍽 Depuis un menu</button><button class="btn" data-act="nouveau">📄 PDF / photos</button></div></div>
      ${liste.length ? `<div class="tvlist sec">${liste.map(t => `<a class="tvrow" href="#e=${esc(t.slug)}" style="text-decoration:none;color:inherit">
          <div class="mini">${t.apercu ? imgTag(t.apercu) : "📺"}</div>
          <div class="tx"><b>${esc(t.nom)}</b><div class="u">nfcwork.ma/tv/${esc(t.slug)} · ${t.n || 0} page${(t.n || 0) > 1 ? "s" : ""}</div></div>
          <span class="btn sm">Ouvrir</span></a>`).join("")}</div>`
      : `<div class="empty paper sec"><h3>Aucun menu TV</h3><p>Choisissez un menu déjà fait : tout se prépare en un clic.</p><button class="btn primary" data-act="depuis-menu" data-adm>🍽 Créer depuis un menu</button></div>`}`;
    remplir();
  }

  function nouveau() {
    const nom = prompt("Nom du commerce (il sert aussi pour le lien) :", "");
    if (!nom || !nom.trim()) return;
    let s = slugify(nom);
    if (!s) { toast("Nom invalide."); return; }
    if (liste.some(x => x.slug === s)) s = s + "-" + rid(3);
    E = { v: 1, slug: s, nom: nom.trim(), pages: [], duree: 8, effet: "zoom", fond: "flou", actif: true };
    saved = "";
    location.hash = "#e=" + s;
  }

  async function ouvrir(slug) {
    if (!E || E.slug !== slug) {
      app.innerHTML = `<div class="empty"><h3>Chargement…</h3></div>`;
      try {
        const d = await db.doc("settings/tv-" + slug).get();
        if (d.exists) { E = JSON.parse(d.data().json || "{}"); saved = JSON.stringify(E); }
        else { const t = liste.find(x => x.slug === slug); if (!t) { toast("Menu TV introuvable."); location.hash = ""; return; } E = { v: 1, slug, nom: t.nom, pages: [], duree: 8, effet: "zoom", fond: "flou", actif: true }; saved = ""; }
      } catch (e) { erreur(e); return; }
    }
    renderEdit();
  }

  function renderEdit() {
    $("#topTitle").textContent = E.nom; $("#topSub").textContent = "nfcwork.ma/tv/" + E.slug; $("#backBtn").href = "#";
    const lien = lienTV(E.slug);
    let qr = ""; try { qr = window.QRGEN.svg(lien, { marge: 1, couleur: "#05080f" }); } catch (e) {}
    app.innerHTML = `
    <section class="sec linkbox" style="margin-top:0">
      <div class="row between" style="align-items:flex-start;gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:200px"><div class="muted" style="color:#c5d4ee">Lien à ouvrir sur la TV</div><code>${esc(lien.replace(/^https?:\/\//, ""))}</code>
        <div class="row" style="margin-top:10px;gap:6px"><button class="btn sm primary" data-act="copier">Copier le lien</button><a class="btn sm" href="/tv/${esc(E.slug)}" target="_blank" rel="noopener">Voir sur cet écran</a><button class="btn sm" data-act="nfc">📲 Puce NFC</button>
        <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("Menu TV " + E.nom + " : " + lien + "\nOuvrez ce lien sur la TV (Chrome), puis touchez l’écran pour le plein écran.")}">WhatsApp</a></div>
        ${dirty() ? `<div style="color:#ffd27a;font-size:13px;margin-top:8px">⚠️ Enregistrez pour que la TV affiche les changements.</div>` : ""}</div>
        ${qr ? `<div class="qr">${qr}</div>` : ""}</div>
    </section>

    <section class="sec paper stack" style="border:1px solid var(--accent)"><h3>🎬 Vidéo pour clé USB (sans Internet)</h3>
      <p class="muted" style="margin:0;font-size:13.5px">Une vidéo MP4 qui tourne en boucle : copiez-la sur une clé USB, branchez-la sur la TV, et lancez-la avec l’option « Répéter ». Ne s’arrête jamais, même sans Wi-Fi.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><select id="vd-min" style="width:auto"><option value="0">1 tour (${Math.round(E.pages.length * E.duree)} s)</option><option value="10" selected>Environ 10 minutes</option><option value="30">Environ 30 minutes</option></select>
        <button class="btn primary" data-act="video" ${E.pages.length ? "" : "disabled"}>🎬 Télécharger la vidéo</button></div>
      <div class="prog" id="vd-prog" hidden><i></i></div><div class="muted" id="vd-tx" style="font-size:13px"></div>
    </section>
    ${E.menu ? `<section class="sec paper row between" style="gap:10px"><div style="flex:1;min-width:0"><b>🍽 Fait depuis le menu « ${esc(E.menuNom || E.menu)} »</b><div class="muted" style="font-size:13px">Vous avez changé un prix, une photo ou un produit ? Refaites les écrans en un clic.</div></div><button class="btn sm primary" data-act="maj-menu">🔄 Mettre à jour</button></section>` : ""}
    <section class="sec paper stack">
      <div class="row between"><h3>Pages du menu</h3><span class="muted" style="font-size:13px">${E.pages.length} page${E.pages.length > 1 ? "s" : ""}</span></div>
      <div class="drop" id="drop"><div id="dropTx">Importez le PDF du menu, ou des photos (JPG, PNG). Chaque page devient un écran.</div>
        <div class="prog" id="prog" hidden><i></i></div>
        <div class="row" style="justify-content:center;gap:8px"><label class="btn primary sm">📄 Importer un PDF<input type="file" accept="application/pdf,.pdf" hidden data-pdf></label><label class="btn sm">🖼 Ajouter des photos<input type="file" accept="image/*" multiple hidden data-photos></label></div></div>
      ${E.pages.length ? `<div class="pages">${E.pages.map((id, i) => `<div class="pg">${imgTag(id)}<span class="no">${i + 1}</span>
        <div class="acts"><button data-act="up" data-i="${i}" ${i ? "" : "disabled"} title="Avant">←</button><button data-act="down" data-i="${i}" ${i < E.pages.length - 1 ? "" : "disabled"} title="Après">→</button><button data-act="del" data-i="${i}" title="Supprimer">🗑</button></div></div>`).join("")}</div>` : ""}
    </section>

    <section class="sec paper stack"><h3>Défilement</h3>
      <label class="f">Durée de chaque page : <b id="dv">${E.duree} s</b><input type="range" min="4" max="30" step="1" value="${E.duree}" data-k="duree"></label>
      <div><div class="eyebrow" style="margin-bottom:6px">Transition</div><div class="seg">${Object.entries(EFFETS).map(([k, [n, s]]) => `<button type="button" data-effet="${k}" aria-pressed="${E.effet === k}"><b>${n}</b><small>${s}</small></button>`).join("")}</div></div>
      <div><div class="eyebrow" style="margin-bottom:6px">Fond autour de la page</div><div class="seg" style="grid-template-columns:1fr 1fr">${Object.entries(FONDS).map(([k, [n, s]]) => `<button type="button" data-fond="${k}" aria-pressed="${E.fond === k}"><b>${n}</b><small>${s}</small></button>`).join("")}</div></div>
      <label class="check"><input type="checkbox" data-k="actif" ${E.actif !== false ? "checked" : ""}> Écran en ligne</label>
    </section>

    <section class="sec paper row between" data-adm><div><b>Supprimer ce menu TV</b><div class="muted" style="font-size:13px">Le lien ne marchera plus.</div></div><button class="btn sm danger" data-act="supprimer">Supprimer</button></section>
    <div class="savebar"><div class="in"><span class="st" id="st"></span><button class="btn primary" data-act="enregistrer" id="saveBtn">Enregistrer</button></div></div>`;
    majBarre(); remplir();
  }
  function majBarre() {
    const st = $("#st"), b = $("#saveBtn"); if (!st) return;
    const d = dirty();
    st.textContent = d ? "Modifications non enregistrées" : "Tout est enregistré · en ligne";
    st.classList.toggle("dirty", d); b.disabled = !d;
  }

  /* ---------- PDF / photos → images JPEG (lues par toutes les TV) ---------- */
  function vers_jpeg(source, w, h) {
    // la page tient dans 1920 × 1920, en JPEG < 900 Ko (limite d'un document Firestore)
    const c = document.createElement("canvas"), g = c.getContext("2d");
    let k = Math.min(1, 1920 / Math.max(w, h));
    for (let q = 0.85, essai = 0; essai < 10; essai++) {
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingQuality = "high"; g.drawImage(source, 0, 0, c.width, c.height);
      const d = c.toDataURL("image/jpeg", q);
      if (d.length < 900000) return d;
      if (q > 0.6) q -= 0.08; else k *= 0.85;
    }
    throw new Error("trop lourde");
  }
  async function envoyer(data) {
    const id = rid();
    await db.doc("settings/mimg-" + id).set({ data, tv: E.slug, maj: NOW() });
    IMG[id] = data;
    return id;
  }
  let pdfjs = null;
  async function chargerPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import("./lib/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./lib/pdfjs/pdf.worker.min.mjs", location.href).href;
    return pdfjs;
  }
  function progres(n, total, texte) {
    const p = $("#prog"), t = $("#dropTx");
    if (p) { p.hidden = false; p.firstElementChild.style.width = Math.round(n / total * 100) + "%"; }
    if (t) t.textContent = texte;
  }
  async function importerPdf(fichier) {
    const drop = $("#drop"); drop.classList.add("busy");
    try {
      const lib = await chargerPdfjs();
      const doc = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
      const total = Math.min(doc.numPages, 40);
      for (let i = 1; i <= total; i++) {
        progres(i - 1, total, `Page ${i} / ${total} : préparation…`);
        const page = await doc.getPage(i);
        const v0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(4, 2200 / Math.max(v0.width, v0.height)) });
        const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        progres(i - 0.5, total, `Page ${i} / ${total} : envoi…`);
        E.pages.push(await envoyer(vers_jpeg(c, c.width, c.height)));
      }
      if (doc.numPages > 40) toast("Seules les 40 premières pages ont été importées.", true);
      toast(`${total} page${total > 1 ? "s" : ""} importée${total > 1 ? "s" : ""} — enregistrez pour mettre la TV à jour.`, true);
      renderEdit();
    } catch (e) { console.error(e); toast("PDF illisible ou trop lourd. Essayez un autre fichier, ou exportez les pages en photos.", true); renderEdit(); }
  }
  async function importerPhotos(fichiers) {
    const drop = $("#drop"); drop.classList.add("busy");
    try {
      let n = 0;
      for (const f of fichiers) {
        progres(n, fichiers.length, `Photo ${++n} / ${fichiers.length}…`);
        const url = URL.createObjectURL(f);
        try {
          const im = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
          E.pages.push(await envoyer(vers_jpeg(im, im.naturalWidth, im.naturalHeight)));
        } finally { URL.revokeObjectURL(url); }
      }
      renderEdit();
    } catch (e) { console.error(e); toast("Photo illisible : choisissez des JPG ou PNG.", true); renderEdit(); }
  }

  /* ---------- enregistrer / supprimer ---------- */
  async function enregistrer(b) {
    if (!dirty()) return;
    b.disabled = true; $("#st").textContent = "Enregistrement…";
    try {
      const avant = saved ? (JSON.parse(saved).pages || []) : [];
      if (PROPRIO) { if (!saved) throw { code: "permission-denied" }; const s0 = JSON.parse(saved); E.slug = s0.slug; }
      const json = JSON.stringify(E);
      await db.doc("settings/tv-" + E.slug).set({ json, v: String(Date.now()), maj: NOW(), par: user.email });
      const info = { slug: E.slug, nom: E.nom, n: E.pages.length, apercu: E.pages[0] || "", maj: Date.now() };
      const x = liste.find(t => t.slug === E.slug); if (x) Object.assign(x, info); else liste.push(info);
      await ecrireListe();
      // les pages retirées sont effacées
      await Promise.all(avant.filter(id => !E.pages.includes(id)).map(id => db.doc("settings/mimg-" + id).delete().catch(() => {})));
      saved = json; toast("Enregistré ✓ La TV se met à jour toute seule (quelques minutes).", true);
      renderEdit();
    } catch (e) { erreur(e); majBarre(); }
  }
  async function supprimer() {
    const r = prompt(`Pour supprimer « ${E.nom} », écrivez SUPPRIMER :`);
    if (!r || r.trim().toUpperCase() !== "SUPPRIMER") return;
    try {
      const ids = new Set([...(E.pages || []), ...(saved ? JSON.parse(saved).pages || [] : [])]);
      await Promise.all([...ids].map(id => db.doc("settings/mimg-" + id).delete().catch(() => {})));
      await db.doc("settings/tv-" + E.slug).delete();
      liste = liste.filter(t => t.slug !== E.slug); await ecrireListe();
      E = null; saved = ""; toast("Menu TV supprimé."); location.hash = "";
    } catch (e) { erreur(e); }
  }

  /* ---------- 🍽 depuis un menu de l'Espace : écrans fabriqués automatiquement ---------- */
  async function choisirMenu() {
    let menus = [];
    try { const d = await db.doc("settings/menus").get(); menus = d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { erreur(e); return; }
    menus = menus.filter(m => m.formule !== "standard").sort((a, b) => (b.maj || 0) - (a.maj || 0));
    const d = fenetre(`<div class="row between"><h2>🍽 Choisissez le menu</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="font-size:13px;margin:2px 0 10px">Les écrans TV sont fabriqués avec ses catégories, ses produits, ses photos, son logo et ses couleurs.</p>
      <div class="stack" style="gap:8px">${menus.map(m => `<button class="btn block" data-m="${esc(m.slug)}" style="justify-content:space-between;text-align:start;white-space:normal"><span><b>${esc(m.nom)}</b><br><small class="muted">nfcwork.ma/menu/${esc(m.slug)}</small></span><span>${liste.some(t => t.menu === m.slug || t.slug === m.slug) ? "📺" : "›"}</span></button>`).join("") || '<p class="muted">Aucun menu Pro ou Premium. Créez d’abord le menu dans « Menus ».</p>'}</div>`);
    d.addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b) { d.remove(); depuisMenu(b.dataset.m); } });
  }
  function fenetre(html) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box">${html}</div>`;
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-fermer]")) d.remove(); });
    document.body.appendChild(d); return d;
  }
  const IMGS = {};   // les écrans fabriqués, gardés pour la vidéo
  async function depuisMenu(slugMenu, maj) {
    if (!window.NFCW_TVGEN) { toast("Module TV indisponible.", true); return; }
    const d = fenetre(`<h2>📺 Préparation des écrans TV…</h2><p class="muted" id="g-t" style="margin:6px 0 8px">Lecture du menu…</p><div class="prog"><i id="g-b" style="width:3%"></i></div><p class="muted" style="font-size:12.5px;margin-top:10px">Restez sur cette page (moins d’une minute).</p>`);
    const pr = (x, t) => { const b = $("#g-b", d); if (b) b.style.width = Math.max(3, Math.round(x * 100)) + "%"; if (t) { const tt = $("#g-t", d); if (tt) tt.textContent = t; } };
    try {
      const doc = await db.doc("settings/menu-" + slugMenu).get();
      if (!doc.exists) throw new Error("menu introuvable");
      const M = JSON.parse(doc.data().json || "{}");
      const canv = await window.NFCW_TVGEN.ecrans(M, { resoudre: img, lien: SITE + "/menu/" + slugMenu, progres: (x, t) => pr(x * 0.6, t) });
      // l'écran TV : même lien que le menu si possible
      let t = liste.find(x => x.menu === slugMenu) || (E && E.menu === slugMenu ? E : null);
      let slug = t ? t.slug : slugMenu;
      if (!t && liste.some(x => x.slug === slug)) slug = slugMenu + "-tv";
      if (!E || E.slug !== slug) {
        const ex = await db.doc("settings/tv-" + slug).get();
        if (ex.exists) { E = JSON.parse(ex.data().json || "{}"); saved = JSON.stringify(E); }
        else { E = { v: 1, slug, nom: M.nom || slugMenu, pages: [], duree: 8, effet: "fondu", fond: "noir", actif: true }; saved = ""; }
      }
      E.menu = slugMenu; E.menuNom = M.nom || slugMenu; E.nom = M.nom || E.nom;
      const pages = [];
      for (let i = 0; i < canv.length; i++) { pr(0.6 + 0.4 * i / canv.length, `Envoi de l’écran ${i + 1} / ${canv.length}…`); pages.push(await envoyer(vers_jpeg(canv[i], canv[i].width, canv[i].height))); }
      E.pages = pages; IMGS[E.slug] = canv;
      d.remove();
      if (location.hash !== "#e=" + E.slug) location.hash = "#e=" + E.slug; else renderEdit();
      setTimeout(() => { const b = $("#saveBtn"); if (b && dirty()) enregistrer(b); }, 400);
      toast(`✅ ${canv.length} écrans TV prêts${maj ? " (mis à jour)" : ""}. Enregistrement…`, true);
    } catch (e) { console.error(e); d.remove(); toast("Impossible de préparer les écrans : vérifiez la connexion et réessayez.", true); }
  }
  async function faireVideo(b) {
    const min = +($("#vd-min") || {}).value || 0, bar = $("#vd-prog"), tx = $("#vd-tx");
    b.disabled = true; bar.hidden = false;
    const pr = (x, t) => { bar.firstElementChild.style.width = Math.round(x * 100) + "%"; if (t) tx.textContent = t; };
    try {
      let ims = IMGS[E.slug];
      if (!ims || ims.length !== E.pages.length) {
        ims = [];
        for (let i = 0; i < E.pages.length; i++) {
          pr(i / E.pages.length * 0.2, `Chargement de l’écran ${i + 1} / ${E.pages.length}…`);
          const src = await img(E.pages[i]); if (!src) continue;
          ims.push(await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; }));
        }
      }
      // les pages PDF / photos (pas en 16:9) sont posées sur un fond noir 1920 × 1080
      ims = ims.map(im => { const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height; if (w === 1920 && h === 1080) return im; const c = document.createElement("canvas"); c.width = 1920; c.height = 1080; const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 1920, 1080); const k = Math.min(1920 / w, 1080 / h); g.drawImage(im, (1920 - w * k) / 2, (1080 - h * k) / 2, w * k, h * k); return c; });
      const r = await window.NFCW_TVGEN.video(ims, { duree: E.duree, minutes: min, progres: x => pr(0.2 + x * 0.78, `Fabrication de la vidéo… ${Math.round(x * 100)} %`) });
      pr(1, "");
      const url = URL.createObjectURL(r.blob), a = document.createElement("a");
      a.href = url; a.download = `Menu-TV-${E.slug}.mp4`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      tx.innerHTML = `✅ Vidéo prête : <b>Menu-TV-${esc(E.slug)}.mp4</b> (${(r.blob.size / 1048576).toFixed(1)} Mo, ${Math.round(r.secondes / 60) || 1} min)${r.codec !== "avc" ? " ⚠️ Ce navigateur a fait une vidéo VP9 : refaites-la avec Chrome (ordinateur) ou Safari (iPhone) pour qu’elle marche sur toutes les TV." : ""}`;
    } catch (e) {
      console.error(e);
      tx.textContent = e && e.message === "webcodecs" ? "Ce navigateur ne sait pas fabriquer de vidéo. Ouvrez cette page avec Chrome (ordinateur / Android) ou Safari à jour (iPhone)." : "La vidéo n’a pas pu être fabriquée. Réessayez avec « 1 tour ».";
    }
    b.disabled = false;
  }

  /* ---------- événements ---------- */
  app.addEventListener("input", e => {
    if (!E) return;
    const k = e.target.dataset.k; if (!k) return;
    if (k === "duree") { E.duree = +e.target.value; const dv = $("#dv"); if (dv) dv.textContent = E.duree + " s"; }
    if (k === "actif") E.actif = e.target.checked;
    majBarre();
  });
  app.addEventListener("change", e => {
    const t = e.target;
    if (t.hasAttribute("data-pdf") && t.files[0]) importerPdf(t.files[0]);
    if (t.hasAttribute("data-photos") && t.files.length) importerPhotos([...t.files]);
  });
  document.addEventListener("click", async e => {
    const ef = e.target.closest("[data-effet]"); if (ef && E) { E.effet = ef.dataset.effet; renderEdit(); return; }
    const fo = e.target.closest("[data-fond]"); if (fo && E) { E.fond = fo.dataset.fond; renderEdit(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, i = +b.dataset.i;
    const bouge = d => { const j = i + d; if (j < 0 || j >= E.pages.length) return; [E.pages[i], E.pages[j]] = [E.pages[j], E.pages[i]]; renderEdit(); };
    if (a === "nouveau" && !PROPRIO) nouveau();
    if (a === "depuis-menu" && !PROPRIO) choisirMenu();
    if (a === "maj-menu" && E && E.menu) depuisMenu(E.menu, true);
    if (a === "video") faireVideo(b);
    if (a === "nfc") window.NFCW_ECRIRE(lienTV(E.slug), E.nom);
    if (a === "up") bouge(-1);
    if (a === "down") bouge(1);
    if (a === "del" && confirm("Supprimer la page " + (i + 1) + " ?")) { E.pages.splice(i, 1); renderEdit(); }
    if (a === "enregistrer") enregistrer(b);
    if (a === "supprimer" && !PROPRIO) supprimer();
    if (a === "copier") { const l = lienTV(E.slug); try { await navigator.clipboard.writeText(l); toast("Lien copié ✓"); } catch (x) { prompt("Copiez le lien :", l); } }
  });
  window.addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
})();
