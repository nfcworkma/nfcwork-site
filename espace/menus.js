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
  const langsEdition = () => M.formule === "premium" ? M.langues : [M.langues[0] || "fr"];
  const T = (o, l) => (o && typeof o === "object" ? o[l] : l === (M.langues[0] || "fr") ? o : "") || "";

  /* ================= Connexion ================= */
  auth.onAuthStateChanged(u => {
    user = u;
    if (!u) { renderLogin(); return; }
    if ((u.email || "").toLowerCase() !== ADMIN) {
      app.innerHTML = `<div class="empty"><h3>Accès réservé</h3><p>Cette page est réservée à l’administrateur NFCWORK.</p><a class="btn" href="./">Retour à l’Espace</a></div>`;
      return;
    }
    chargerListe().then(route);
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

  /* ================= Firestore ================= */
  async function chargerListe() {
    try {
      const d = await db.doc("settings/menus").get();
      liste = d.exists ? JSON.parse(d.data().json || "[]") : [];
    } catch (e) { console.error(e); liste = []; toast("Impossible de lire la liste des menus."); }
  }
  async function ecrireListe() {
    await db.doc("settings/menus").set({ json: JSON.stringify(liste), maj: NOW(), par: user.email });
  }
  function erreur(e) {
    console.error(e);
    if (e && e.code === "permission-denied") toast("Enregistrement refusé par Firebase : vérifiez que vous êtes connecté avec l’e-mail admin.", true);
    else toast("Échec de l’enregistrement. Vérifiez la connexion et réessayez.", true);
  }

  async function chargerImg(id) {
    if (!id || IMG[id]) return IMG[id];
    try {
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
    const m = location.hash.match(/^#m=([a-z0-9-]+)/);
    if (m) ouvrir(m[1]); else renderListe();
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
    const orph = [...pending].filter(i => !savedIds.has(i));
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
    entete("Menus digitaux", "Espace gestion", "./", "");
    const l = [...liste].sort((a, b) => (b.maj || 0) - (a.maj || 0));
    app.innerHTML = `<div class="row between"><div><h2>Menus digitaux</h2><div class="muted">${l.length} menu${l.length > 1 ? "s" : ""} · Standard, Pro, Premium</div></div>
      <button class="btn primary" data-act="nouveau">＋ Nouveau menu</button></div>
      ${l.length ? `<div class="mlist sec">${l.map(m => `<div class="paper mcard">
        <div class="row between"><span class="n">${esc(m.nom)}</span><span class="row"><span class="pill ${esc(m.formule)}">${esc((FORMULES[m.formule] || [m.formule])[0])}</span>${m.actif === false ? '<span class="pill off">Désactivé</span>' : ""}</span></div>
        <div class="l">${esc(lienPublic(m.slug).replace(/^https?:\/\//, ""))}</div>
        <div class="row"><a class="btn sm primary" href="#m=${esc(m.slug)}">Modifier</a><a class="btn sm" href="${esc(lienPublic(m.slug))}" target="_blank" rel="noopener">Ouvrir</a><button class="btn sm ghost" data-act="copier" data-v="${esc(lienPublic(m.slug))}">Copier le lien</button></div>
      </div>`).join("")}</div>`
      : `<div class="empty paper sec"><h3>Aucun menu pour l’instant</h3><p>Créez le premier menu : choisissez la formule, puis ajoutez les photos ou les produits.</p><button class="btn primary" data-act="nouveau">＋ Créer un menu</button></div>`}`;
  }

  function nouveauMenu() {
    let formule = "standard";
    const d = fenetre(`<h2>Nouveau menu</h2><p class="muted">Le lien sera nfcwork.ma/menu/<b id="nm-prev">…</b></p>
      <form class="stack" id="nm">
        <label class="f">Nom du commerce<input id="nm-nom" required maxlength="60" placeholder="Café Chocco Latte"></label>
        <div><div class="eyebrow" style="margin-bottom:6px">Formule</div>${segFormule(formule)}</div>
        <label class="f">Lien du menu<input id="nm-slug" required maxlength="40" pattern="[a-z0-9-]+" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <label class="f">Langue principale<select id="nm-lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <p class="err" id="nm-err"></p>
        <div class="row"><button class="btn primary" style="flex:1">Créer le menu</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
      </form>`);
    let auto = true;
    const nom = $("#nm-nom", d), sl = $("#nm-slug", d), prev = () => ($("#nm-prev", d).textContent = sl.value || "…");
    nom.oninput = () => { if (auto) sl.value = slugify(nom.value); prev(); };
    sl.oninput = () => { auto = false; sl.value = sl.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); prev(); };
    d.addEventListener("click", e => { const b = e.target.closest("[data-formule]"); if (b) { formule = b.dataset.formule; d.querySelectorAll("[data-formule]").forEach(x => x.setAttribute("aria-pressed", x === b)); } });
    $("#nm", d).onsubmit = async e => {
      e.preventDefault();
      const s = slugify(sl.value), err = $("#nm-err", d);
      if (!s) { err.textContent = "Lien invalide."; return; }
      if (liste.some(m => m.slug === s)) { err.textContent = "Ce lien existe déjà : choisissez-en un autre."; return; }
      const btn = e.target.querySelector("button"); btn.disabled = true;
      try {
        const ex = await db.doc("settings/menu-" + s).get();
        if (ex.exists) { err.textContent = "Ce lien existe déjà : choisissez-en un autre."; btn.disabled = false; return; }
        const lang = $("#nm-lang", d).value;
        const m = {
          v: 1, slug: s, nom: nom.value.trim(), formule, actif: true,
          langues: [lang], theme: "nuit", couleur: "", devise: "DH",
          logo: "", logoCarre: false, couverture: "", slogan: {},
          infos: { horaires: "", adresse: "", maps: "", tel: "", instagram: "", whatsapp: "" },
          commande: true, pages: [],
          categories: formule === "standard" ? [] : [{ id: rid(6), nom: { [lang]: lang === "ar" ? "المشروبات" : lang === "en" ? "Drinks" : "Boissons" }, items: [] }]
        };
        await db.doc("settings/menu-" + s).set({ json: JSON.stringify(m), v: String(Date.now()), maj: NOW(), par: user.email });
        liste.push({ slug: s, nom: m.nom, formule, actif: true, maj: Date.now() });
        await ecrireListe();
        d.remove();
        location.hash = "m=" + s;
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
      M.langues = M.langues && M.langues.length ? M.langues : ["fr"];
      M.infos = M.infos || {}; M.slogan = M.slogan || {}; M.pages = M.pages || []; M.categories = M.categories || [];
      saved = JSON.stringify(M); savedIds = new Set(idsDe(M)); pending.clear();
      renderEdit();
    } catch (e) { console.error(e); app.innerHTML = `<div class="empty"><h3>Impossible d’ouvrir ce menu</h3><a class="btn" href="#">Retour aux menus</a></div>`; }
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
        <div class="row"><label class="btn sm">${id ? "Changer" : "Ajouter"}<input type="file" accept="image/*" hidden data-up="${cle}" data-kind="${kind}"></label>${id ? `<button class="btn sm ghost" data-act="retirer" data-cle="${cle}">Retirer</button>` : ""}</div></div></div>`;
  }

  function renderEdit() {
    entete(M.nom || "Menu", (FORMULES[M.formule] || [""])[0] + " · nfcwork.ma/menu/" + M.slug, "#", lienPublic(M.slug));
    const pro = M.formule !== "standard", prem = M.formule === "premium";
    const ls = langsEdition();
    app.innerHTML = `
    <section class="sec" style="margin-top:0"><div class="eyebrow" style="margin-bottom:8px">Formule</div>${segFormule(M.formule)}</section>

    <section class="sec paper stack">
      <div class="row between"><h3>Infos du commerce</h3><label class="check"><input type="checkbox" data-b="actif" ${M.actif !== false ? "checked" : ""}> Menu en ligne</label></div>
      ${champ("nom", "Nom du commerce", 'maxlength="60"')}
      <div class="row" style="gap:6px"><span class="muted" style="font-size:13.5px">Lien :</span><a href="${esc(lienPublic(M.slug))}" target="_blank" rel="noopener">${esc(lienPublic(M.slug).replace(/^https?:\/\//, ""))}</a><button class="btn sm ghost" data-act="copier" data-v="${esc(lienPublic(M.slug))}">Copier</button></div>
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

    ${prem ? `<section class="sec paper stack"><h3>Premium : langues & WhatsApp</h3>
      <div><div class="eyebrow" style="margin-bottom:6px">Langues du menu (le client choisit en haut de la page)</div>
        <div class="row">${Object.entries(LANGS).map(([k, v]) => `<label class="check" style="margin-inline-end:14px"><input type="checkbox" data-lang="${k}" ${M.langues.includes(k) ? "checked" : ""}> ${v}</label>`).join("")}</div></div>
      <label class="f">Langue principale (affichée en premier)<select data-act-change="principale">${M.langues.map(k => `<option value="${k}" ${k === M.langues[0] ? "selected" : ""}>${LANGS[k]}</option>`).join("")}</select></label>
      ${champ("infos.whatsapp", "Numéro WhatsApp du commerce", 'type="tel" inputmode="tel" maxlength="30" placeholder="06 12 34 56 78"')}
      <label class="check"><input type="checkbox" data-b="commande" ${M.commande !== false ? "checked" : ""}> Les clients peuvent composer leur commande et l’envoyer sur WhatsApp</label>
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
      <div class="row between" style="margin-bottom:10px"><h3>Catégories & produits</h3><button class="btn sm" data-act="cat-add">＋ Catégorie</button></div>
      ${M.categories.map((c, ci) => `<div class="cat" data-cat="${esc(c.id)}">
        <div class="cat-h"><div class="names">${ls.map(l => `<input data-cb="nom.${l}" value="${esc(T(c.nom, l))}" placeholder="Nom de la catégorie${ls.length > 1 ? " (" + LCOURT[l] + ")" : ""}" maxlength="60" ${l === "ar" ? 'dir="rtl"' : ""}>`).join("")}</div>
          <div class="cat-tools"><button class="btn icon sm" data-act="cat-up" data-i="${ci}" ${ci ? "" : "disabled"} title="Monter">↑</button><button class="btn icon sm" data-act="cat-down" data-i="${ci}" ${ci < M.categories.length - 1 ? "" : "disabled"} title="Descendre">↓</button><button class="btn icon sm danger" data-act="cat-del" data-i="${ci}" title="Supprimer">🗑</button></div></div>
        <div class="items">${(c.items || []).map((it, ii) => `<div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="it${it.dispo === false ? " off" : ""}" data-act="it-edit" data-ci="${ci}" data-ii="${ii}">${it.photo ? imgTag(it.photo, "", "") : '<span class="noimg">🍽</span>'}
            <span class="tx"><b>${esc(T(it.nom, ls[0]) || "Sans nom")}</b><small>${esc(T(it.desc, ls[0]).slice(0, 60))}${it.dispo === false ? " · Épuisé" : ""}</small></span><span class="p">${esc(it.prix || "")}</span></button>
          <div style="display:grid;gap:4px"><button class="btn icon sm" data-act="it-up" data-ci="${ci}" data-ii="${ii}" ${ii ? "" : "disabled"} title="Monter">↑</button><button class="btn icon sm" data-act="it-down" data-ci="${ci}" data-ii="${ii}" ${ii < c.items.length - 1 ? "" : "disabled"} title="Descendre">↓</button></div></div>`).join("")}</div>
        <button class="btn sm" style="margin-top:10px;width:100%" data-act="it-add" data-ci="${ci}">＋ Ajouter un produit</button>
      </div>`).join("") || `<div class="empty paper"><h3>Aucune catégorie</h3><p>Commencez par « Boissons », « Petit-déjeuner »…</p></div>`}
      <button class="btn" style="width:100%" data-act="cat-add">＋ Nouvelle catégorie</button>
    </section>`}

    <section class="sec paper row between"><div><b>Supprimer ce menu</b><div class="muted" style="font-size:13px">Le lien ne marchera plus. Action définitive.</div></div><button class="btn sm danger" data-act="supprimer">Supprimer</button></section>

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
    if (t.dataset.actChange === "principale") { M.langues = [t.value, ...M.langues.filter(x => x !== t.value)]; renderEdit(); return; }
    if (t.dataset.up && t.files[0]) {
      const cle = t.dataset.up, kind = t.dataset.kind;
      await occupe(t.closest(".imgpick"), async () => { M[cle] = await televerser(t.files[0], kind); renderEdit(); toast("Photo ajoutée — pensez à enregistrer"); });
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
      case "copier": copier(b.dataset.v); break;
      case "enregistrer": enregistrer(b); break;
      case "apercu": apercu(); break;
      case "supprimer": supprimer(); break;
      case "retirer": M[b.dataset.cle] = ""; renderEdit(); break;
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
      case "it-edit": editerItem(ci, ii); break;
      case "it-up": bouge(M.categories[ci].items, ii, -1); break;
      case "it-down": bouge(M.categories[ci].items, ii, 1); break;
    }
  });

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
          <div class="row"><label class="btn sm">📷 ${it.photo ? "Changer la photo" : "Ajouter une photo"}<input type="file" accept="image/*" hidden id="it-file"></label>${it.photo ? '<button type="button" class="btn sm ghost" id="it-noph">Retirer</button>' : ""}</div></div>
        ${ls.map(l => `<label class="f">Nom${ls.length > 1 ? " (" + LCOURT[l] + ")" : ""}<input data-l="${l}" data-k="nom" value="${esc(it.nom[l] || "")}" maxlength="80" ${l === "ar" ? 'dir="rtl"' : ""} ${l === ls[0] ? "required" : ""}></label>`).join("")}
        ${ls.map(l => `<label class="f">Description (facultatif)${ls.length > 1 ? " (" + LCOURT[l] + ")" : ""}<textarea data-l="${l}" data-k="desc" maxlength="240" ${l === "ar" ? 'dir="rtl"' : ""}>${esc(it.desc[l] || "")}</textarea></label>`).join("")}
        <label class="f">Prix (${esc(M.devise || "DH")})<input id="it-prix" value="${esc(it.prix || "")}" inputmode="decimal" maxlength="20" placeholder="25"></label>
        <label class="check"><input type="checkbox" id="it-dispo" ${it.dispo !== false ? "checked" : ""}> Disponible (décochez si épuisé)</label>
        <div class="row"><button class="btn primary" style="flex:1">${neuf ? "Ajouter" : "Valider"}</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
        ${neuf ? "" : '<button type="button" class="btn danger sm" id="it-del">Supprimer ce produit</button>'}
      </form>`);
    const pick = $("#it-pick", d);
    const majPhoto = () => {
      pick.innerHTML = `${it.photo ? `<img class="prev" src="${IMG[it.photo] || ""}" alt="">` : '<div class="prev"></div>'}
        <div class="row"><label class="btn sm">📷 ${it.photo ? "Changer la photo" : "Ajouter une photo"}<input type="file" accept="image/*" hidden id="it-file"></label>${it.photo ? '<button type="button" class="btn sm ghost" id="it-noph">Retirer</button>' : ""}</div>`;
    };
    pick.addEventListener("change", async e => {
      if (e.target.id !== "it-file" || !e.target.files[0]) return;
      await occupe(pick, async () => { it.photo = await televerser(e.target.files[0], "photo"); majPhoto(); });
    });
    pick.addEventListener("click", e => { if (e.target.id === "it-noph") { it.photo = ""; majPhoto(); } });
    if (it.photo) chargerImg(it.photo).then(() => { const im = pick.querySelector("img"); if (im) im.src = IMG[it.photo] || ""; });
    const del = $("#it-del", d);
    if (del) del.onclick = () => { if (confirm("Supprimer ce produit ?")) { c.items.splice(ii, 1); d.remove(); renderEdit(); } };
    $("#itf", d).onsubmit = e => {
      e.preventDefault();
      d.querySelectorAll("[data-l]").forEach(x => { it[x.dataset.k][x.dataset.l] = x.value.trim(); });
      it.prix = $("#it-prix", d).value.trim();
      it.dispo = $("#it-dispo", d).checked;
      if (neuf) c.items.push(it); else c.items[ii] = it;
      d.remove(); renderEdit();
      if (neuf) toast("Produit ajouté — pensez à enregistrer");
    };
    const first = d.querySelector('[data-k="nom"]'); if (first && neuf) first.focus();
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
      const json = JSON.stringify(M);
      await db.doc("settings/menu-" + M.slug).set({ json, v: String(Date.now()), maj: NOW(), par: user.email });
      const e = liste.find(x => x.slug === M.slug);
      const info = { slug: M.slug, nom: M.nom, formule: M.formule, actif: M.actif !== false, maj: Date.now() };
      if (e) Object.assign(e, info); else liste.push(info);
      await ecrireListe();
      const now = new Set(idsDe(M));
      const orph = [...new Set([...savedIds, ...pending])].filter(i => !now.has(i));
      await Promise.all(orph.map(i => db.doc("settings/mimg-" + i).delete().catch(() => {})));
      savedIds = now; pending.clear(); saved = json;
      try { localStorage.removeItem("nfcwork-menu-" + M.slug); } catch (x) {}
      toast("Enregistré ✓ Le menu est à jour en ligne.");
      entete(M.nom, (FORMULES[M.formule] || [""])[0] + " · nfcwork.ma/menu/" + M.slug, "#", lienPublic(M.slug));
    } catch (x) { erreur(x); }
    majBarre();
  }

  async function supprimer() {
    const r = prompt(`Pour supprimer définitivement « ${M.nom} », écrivez SUPPRIMER :`);
    if (!r || r.trim().toUpperCase() !== "SUPPRIMER") return;
    try {
      const ids = new Set([...idsDe(M), ...savedIds, ...pending]);
      await Promise.all([...ids].map(i => db.doc("settings/mimg-" + i).delete().catch(() => {})));
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
