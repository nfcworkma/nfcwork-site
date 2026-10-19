/* =========================================================
   NFCWORK — CARTES DIGITALES, AVIS GOOGLE, WI-FI, PAGES LIENS (admin)
   Tout se fait ici, au téléphone ou au PC, sans l'outil du Mac.
   Lien public : nfcwork.ma/p/<nom>  (p/index.html)
   Firestore, collection « settings » (lecture publique, écriture admin — règle déjà en place) :
     settings/pages        → liste  { json: "[{slug, nom, type, photo, actif, maj}]" }
     settings/page-<nom>   → une page { json: "{type, slug, nom, …}" }
     settings/mimg-<id>    → une photo { data } (même format que les menus)
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
  const lien = s => SITE + "/p/" + s;

  const TYPES = {
    profil: ["👤", "Carte digitale", "Carte de visite NFC : appel, WhatsApp, réseaux"],
    avis: ["⭐", "Avis Google", "Plaque qui ouvre la page d’avis Google"],
    wifi: ["📶", "Wi-Fi", "Plaque : réseau, mot de passe, QR"],
    liens: ["🔗", "Page liens", "Lien pour la bio Instagram, boutons"]
  };
  const THEMES = { nuit: ["🌙 Nuit", "#05080f", "#E8EEFA"], blanc: ["☀️ Blanc", "#f6f7f9", "#14171c"], creme: ["🍦 Crème", "#f7f5f0", "#1d1b18"], noir: ["⚫ Noir", "#000", "#f5f5f5"] };
  const JOURS = [[1, "Lundi"], [2, "Mardi"], [3, "Mercredi"], [4, "Jeudi"], [5, "Vendredi"], [6, "Samedi"], [0, "Dimanche"]];
  const rid = (n = 10) => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const slugify = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  let user = null, liste = [], P = null, saved = "", filtre = "tous", recherche = "";
  const IMG = {};
  const dirty = () => P && JSON.stringify(P) !== saved;

  /* ---------- connexion ---------- */
  auth.onAuthStateChanged(async u => {
    user = u;
    if (!u) { renderLogin(); return; }
    if ((u.email || "").toLowerCase() !== ADMIN) {
      // ✏️ mode commerçant : seulement ses pages (cochées dans sa fiche client)
      const ok = window.NFCW_PROPRIO && await window.NFCW_PROPRIO(db, u, "pages", "editPages");
      if (!ok) { (window.NFCW_REFUS || (a => a.innerHTML = "<div class='empty'><h3>Accès réservé</h3></div>"))(app); return; }
      PROPRIO = ok; await chargerListe();
      liste = liste.filter(x => ok.includes(x.slug));
      if (liste.length === 1 && !location.hash.startsWith("#e=")) history.replaceState(null, "", "#e=" + liste[0].slug);
      route(); return;
    }
    await chargerListe(); route();
  });
  let PROPRIO = null;
  function renderLogin() {
    app.innerHTML = `<div class="auth paper"><h2>Connexion</h2><p class="muted">Connectez-vous avec le compte administrateur.</p>
      <form id="lf" class="stack"><label class="f">E-mail<input id="le" type="email" autocomplete="email" required></label>
      <label class="f">Mot de passe<input id="lp" type="password" autocomplete="current-password" required></label><p class="err" id="lerr"></p>
      <button class="btn primary">Se connecter</button></form></div>`;
    $("#lf").onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true; try { await auth.signInWithEmailAndPassword($("#le").value.trim(), $("#lp").value); } catch (x) { $("#lerr").textContent = "E-mail ou mot de passe incorrect."; b.disabled = false; } };
  }
  function erreur(e) { console.error(e); toast(e && e.code === "permission-denied" ? (PROPRIO ? "Pas encore autorisé : demandez à NFCWORK d’activer la modification." : "Refusé par Firebase : connectez-vous avec l’e-mail admin.") : "Échec. Vérifiez la connexion et réessayez.", true); }

  /* ---------- données ---------- */
  async function chargerListe() { try { const d = await db.doc("settings/pages").get(); liste = d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { liste = []; erreur(e); } }
  const ecrireListe = () => PROPRIO ? Promise.resolve() : db.doc("settings/pages").set({ json: JSON.stringify(liste), maj: NOW(), par: user.email });
  async function img(id) {
    if (!id || IMG[id]) return IMG[id];
    try { const d = await db.doc("settings/mimg-" + id).get(); if (d.exists) IMG[id] = d.data().data; } catch (e) {}
    document.querySelectorAll(`img[data-img="${id}"]`).forEach(el => { if (IMG[id]) el.src = IMG[id]; });
    return IMG[id];
  }
  const imgTag = id => `<img data-img="${esc(id)}" ${IMG[id] ? `src="${IMG[id]}"` : ""} alt="">`;
  const remplir = () => document.querySelectorAll("img[data-img]").forEach(el => { if (!el.src) img(el.dataset.img); });
  function jpeg(fichier, max, cible) {
    return new Promise((ok, ko) => {
      const u = URL.createObjectURL(fichier), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u);
        let k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement("canvas"), g = c.getContext("2d");
        for (let q = 0.86, i = 0; i < 10; i++) {
          c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
          g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          const d = c.toDataURL("image/jpeg", q); if (d.length < cible) return ok(d);
          if (q > 0.6) q -= 0.08; else k *= 0.85;
        }
        ko(new Error("trop lourde"));
      };
      im.onerror = () => { URL.revokeObjectURL(u); ko(new Error("illisible")); };
      im.src = u;
    });
  }
  async function envoyerPhoto(f, max, cible) {
    const data = await jpeg(f, max || 700, cible || 300000), id = rid();
    await db.doc("settings/mimg-" + id).set({ data, page: P.slug, maj: NOW() });
    IMG[id] = data; return id;
  }

  /* ---------- navigation ---------- */
  function route() {
    const h = location.hash, e = h.match(/^#e=([a-z0-9-]+)/), n = h.match(/^#new=([a-z]+)/);
    if (PROPRIO && e && !PROPRIO.includes(e[1])) { location.hash = ""; return; }
    if (e) ouvrir(e[1]); else if (n && TYPES[n[1]] && !PROPRIO) nouveau(n[1]); else renderListe();
  }
  window.addEventListener("hashchange", () => { if (dirty() && !(P && location.hash === "#e=" + P.slug) && !confirm("Modifications non enregistrées : quitter quand même ?")) return; route(); });

  function renderListe() {
    P = null; saved = "";
    $("#topTitle").textContent = PROPRIO ? "Mes pages" : "Cartes, avis, Wi-Fi"; $("#topSub").textContent = PROPRIO ? "Mon commerce" : "Créer sans Mac"; $("#backBtn").href = "./";
    const q = recherche.toLowerCase();
    const l = liste.filter(x => (filtre === "tous" || x.type === filtre) && (!q || (x.nom + " " + x.slug).toLowerCase().includes(q))).sort((a, b) => (b.maj || 0) - (a.maj || 0));
    app.innerHTML = `<div data-adm><h2 style="margin-bottom:10px">＋ Créer</h2>
      <div class="types">${Object.entries(TYPES).map(([k, [ic, n, s]]) => `<button data-new="${k}"><span>${ic}</span><b>${n}</b><small>${s}</small></button>`).join("")}</div></div>
      <div class="row between" style="margin-top:24px"><h2>📋 Mes pages (${liste.length})</h2></div>
      <input id="rech" placeholder="🔎 Chercher un nom…" value="${esc(recherche)}" style="width:100%;margin-top:10px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:16px">
      <div class="chipsf">${[["tous", "Tout"], ...Object.entries(TYPES).map(([k, v]) => [k, v[0] + " " + v[1]])].map(([k, n]) => `<button class="chip" data-f="${k}" aria-pressed="${filtre === k}">${n}</button>`).join("")}</div>
      ${l.length ? `<div class="plist">${l.map(x => `<a class="prow" href="#e=${esc(x.slug)}"><span class="ph">${x.photo ? imgTag(x.photo) : (TYPES[x.type] || ["📄"])[0]}</span>
        <span class="tx"><b>${esc(x.nom)}</b><div class="u">${(TYPES[x.type] || ["", ""])[1]} · nfcwork.ma/p/${esc(x.slug)}</div></span>${x.actif === false ? '<span class="pill" style="color:var(--warn)">⏸ Pause</span>' : ""}</a>`).join("")}</div>`
      : `<div class="empty paper"><h3>Rien pour l’instant</h3><p>Touchez un bouton en haut pour créer votre première page.</p></div>`}
      <p data-adm class="muted" style="font-size:12.5px;margin-top:16px">ℹ️ Les anciennes pages faites avec l’outil du Mac (nfcworkma.github.io/profils/…) continuent de marcher.</p>`;
    remplir();
    const r = $("#rech"); r.oninput = () => { recherche = r.value; const pos = r.selectionStart; renderListe(); const n = $("#rech"); n.focus(); n.setSelectionRange(pos, pos); };
  }

  function base(type, nom) {
    const s0 = slugify(nom) || type; let s = s0, i = 2;
    while (liste.some(x => x.slug === s)) s = s0 + "-" + i++;
    const p = { v: 1, type, slug: s, nom: nom.trim(), theme: type === "profil" || type === "liens" ? "nuit" : "blanc", couleur: "#2F7BFF", langue: "fr", actif: true, photo: "" };
    if (type === "profil") Object.assign(p, { fonction: "", entreprise: "", metiers: "", bio: "", tel: "", whatsapp: "", email: "", instagram: "", facebook: "", tiktok: "", linkedin: "", youtube: "", snapchat: "", site: "", adresse: "", maps: "", horaires: {}, liens: [], galerie: [] });
    if (type === "avis") Object.assign(p, { lienGoogle: "", message: "", instagram: "" });
    if (type === "wifi") Object.assign(p, { ssid: "", motdepasse: "", securite: "WPA", cache: false, message: "" });
    if (type === "liens") Object.assign(p, { slogan: "", whatsapp: "", localisation: "", liens: [{ titre: "Instagram", url: "" }] });
    return p;
  }
  async function nouveau(type) {
    const q = { profil: "Nom de la personne (ex. Dr Saib Aziz) :", avis: "Nom du commerce :", wifi: "Nom du commerce (affiché en haut) :", liens: "Nom du commerce ou de la personne :" }[type];
    // 📋 client existant : tout ce qu'on connaît déjà est rempli
    let D = null;
    if (window.NFCW_SOURCES && !PROPRIO) {
      D = await window.NFCW_SOURCES.choisir(db, `${(TYPES[type] || ["", ""])[0]} Nouveau : ${(TYPES[type] || ["", "page"])[1]}`);
      if (!D) { if (location.hash.startsWith("#new")) history.replaceState(null, "", "#"); renderListe(); return; }
      if (D.vide) D = null;
    }
    const nom = prompt(q, D ? D.nom : "");
    if (!nom || !nom.trim()) { if (location.hash.startsWith("#new")) location.hash = ""; return; }
    P = base(type, nom); saved = "";
    history.replaceState(null, "", "#e=" + P.slug);
    if (D) await preRemplir(D);
    renderEdit();
    if (D) toast("✨ Rempli avec : " + D.trouve.join(", ") + ". Complétez ce qui manque puis Enregistrer.", true);
  }
  async function preRemplir(D) {
    const lien = l => ({ titre: l.titre, url: l.url });
    const insta = D.instagram ? { titre: "📸 Instagram", url: /^https?:/.test(D.instagram) ? D.instagram : "https://instagram.com/" + D.instagram.replace(/^@/, "") } : null;
    if (D.couleur) P.couleur = D.couleur;
    if (P.type === "profil") {
      ["tel", "whatsapp", "email", "instagram", "facebook", "tiktok", "adresse", "maps"].forEach(k => { if (D[k]) P[k] = D[k]; });
      if (Object.keys(D.horairesJ || {}).length) P.horaires = Object.assign({}, D.horairesJ);
      if (D.slogan) P.bio = D.slogan;
      P.liens = D.liens.filter(l => l.k !== "profil").map(lien);
    }
    if (P.type === "avis") { if (D.instagram) P.instagram = D.instagram; if (D.lienGoogle) P.lienGoogle = D.lienGoogle; }
    if (P.type === "liens") {
      if (D.slogan) P.slogan = D.slogan; if (D.whatsapp) P.whatsapp = D.whatsapp;
      P.localisation = D.adresse || D.maps || "";
      P.liens = [...D.liens.map(lien), ...(insta ? [insta] : [])];
      if (!P.liens.length) P.liens = [{ titre: "Instagram", url: "" }];
    }
    if (D.logo && D.logo.length < 950000) {
      try { const id = rid(); await db.doc("settings/mimg-" + id).set({ data: D.logo, page: P.slug, maj: NOW() }); IMG[id] = D.logo; P.photo = id; if (P.type === "profil" || P.type === "liens") P.photoContain = true; } catch (e) { console.warn(e); }
    }
  }
  async function ouvrir(slug) {
    if (!P || P.slug !== slug) {
      app.innerHTML = `<div class="empty"><h3>Chargement…</h3></div>`;
      try { const d = await db.doc("settings/page-" + slug).get(); if (!d.exists) { toast("Page introuvable."); location.hash = ""; return; } P = JSON.parse(d.data().json || "{}"); saved = JSON.stringify(P); }
      catch (e) { erreur(e); return; }
    }
    renderEdit();
  }

  /* ---------- formulaire ---------- */
  const champ = (k, label, attrs) => `<label class="f">${label}<input data-k="${k}" value="${esc(P[k] == null ? "" : P[k])}" ${attrs || ""}></label>`;
  const zone = (k, label, attrs) => `<label class="f">${label}<textarea data-k="${k}" ${attrs || ""}>${esc(P[k] || "")}</textarea></label>`;
  function liensHtml() {
    return `<div class="stack" style="gap:8px">${(P.liens || []).map((l, i) => `<div class="lrow"><input data-l="${i}.titre" value="${esc(l.titre)}" placeholder="Titre (Boutique)"><input data-l="${i}.url" value="${esc(l.url)}" placeholder="https://…" inputmode="url" autocapitalize="off"><button class="btn icon sm danger" data-act="l-del" data-i="${i}">✕</button></div>`).join("")}
      <button class="btn sm" data-act="l-add">＋ Ajouter un bouton</button></div>`;
  }
  function renderEdit() {
    const [ic, tn] = TYPES[P.type] || ["📄", "Page"];
    $("#topTitle").textContent = ic + " " + P.nom; $("#topSub").textContent = "nfcwork.ma/p/" + P.slug; $("#backBtn").href = "#";
    const L = lien(P.slug);
    let qr = ""; try { qr = window.QRGEN.svg(L, { marge: 1, couleur: "#05080f" }); } catch (e) {}
    const photoBloc = `<div class="photo"><div class="pv">${P.photo ? imgTag(P.photo) : ic}</div><div class="stack" style="gap:6px"><label class="btn sm primary">📷 ${P.type === "profil" ? "Photo ou logo" : "Logo"}<input type="file" accept="image/*" hidden data-up="photo"></label>${P.photo ? `<button class="btn sm ghost" data-act="photo-del">Retirer</button>` : ""}</div></div>
      ${P.type === "profil" || P.type === "liens" ? `<label class="check"><input type="checkbox" data-k="photoContain" ${P.photoContain ? "checked" : ""}> C’est un logo (l’afficher en entier, sans le couper)</label>` : ""}`;
    let corps = "";
    if (P.type === "profil") corps = `
      <section class="sec paper stack"><h3>👤 Identité</h3>${photoBloc}
        ${champ("nom", "Nom", 'maxlength="60"')}${champ("fonction", "Fonction / métier (sous le nom)", 'maxlength="80" placeholder="Cabinet vétérinaire"')}${champ("entreprise", "Entreprise (facultatif)", 'maxlength="60"')}
        ${zone("metiers", "Petites étiquettes (une par ligne, facultatif)", 'rows="2" maxlength="300" placeholder="Chirurgie\nVaccins"')}${zone("bio", "Petite présentation (facultatif)", 'rows="2" maxlength="300"')}</section>
      <section class="sec paper stack"><h3>📞 Contact</h3><div class="grid2">${champ("tel", "Téléphone", 'type="tel" inputmode="tel" maxlength="30" placeholder="06 12 34 56 78"')}${champ("whatsapp", "WhatsApp (si différent)", 'type="tel" inputmode="tel" maxlength="30"')}</div>
        ${champ("email", "E-mail", 'type="email" inputmode="email" maxlength="80" autocapitalize="off"')}${champ("adresse", "Adresse", 'maxlength="160"')}${champ("maps", "Lien Google Maps (facultatif)", 'inputmode="url" maxlength="400" autocapitalize="off"')}</section>
      <section class="sec paper stack"><div class="row between"><h3>🕒 Horaires</h3><button class="btn sm ghost" data-act="h-copie">Copier lundi partout</button></div>
        <p class="muted" style="margin:0;font-size:13px">Ex. « 09:00-14:00 · 16:00-19:00 ». Laissez vide = fermé. Vide partout = pas d’horaires affichés.</p>
        <div class="hgrid">${JOURS.map(([j, n]) => `<span>${n}</span><input data-h="${j}" value="${esc((P.horaires || {})[j] || "")}" placeholder="09:00-19:00">`).join("")}</div></section>
      <section class="sec paper stack"><h3>📱 Réseaux et site</h3><div class="grid2">${champ("instagram", "Instagram", 'autocapitalize="off" placeholder="@nom"')}${champ("facebook", "Facebook", 'autocapitalize="off"')}${champ("tiktok", "TikTok", 'autocapitalize="off"')}${champ("linkedin", "LinkedIn", 'autocapitalize="off"')}${champ("youtube", "YouTube", 'autocapitalize="off"')}${champ("snapchat", "Snapchat", 'autocapitalize="off"')}</div>
        ${champ("site", "Site web", 'inputmode="url" autocapitalize="off"')}<div class="eyebrow">Autres boutons</div>${liensHtml()}</section>
      <section class="sec paper stack"><h3>🖼 Galerie (facultatif)</h3><div class="gal">${(P.galerie || []).map((id, i) => `<div>${imgTag(id)}<button data-act="g-del" data-i="${i}">✕</button></div>`).join("")}</div>
        ${(P.galerie || []).length < 6 ? `<label class="btn sm">＋ Ajouter des photos<input type="file" accept="image/*" multiple hidden data-up="galerie"></label>` : ""}</section>`;
    if (P.type === "avis") corps = `<section class="sec paper stack"><h3>⭐ Avis Google</h3>${photoBloc}${champ("nom", "Nom du commerce", 'maxlength="60"')}
        ${champ("lienGoogle", "Lien Google pour laisser un avis", 'inputmode="url" maxlength="400" autocapitalize="off" placeholder="https://g.page/r/…/review"')}
        <div class="notice" style="font-size:13px">💡 Pour trouver le lien : Google Maps → la fiche du commerce → <b>Avis</b> → <b>Partager le lien d’avis</b> (ou « Demander des avis » dans Google Business).</div>
        ${champ("message", "Phrase sous le nom (facultatif)", 'maxlength="80" placeholder="Votre avis compte 🙏"')}${champ("instagram", "Instagram (facultatif)", 'autocapitalize="off"')}</section>`;
    if (P.type === "wifi") corps = `<section class="sec paper stack"><h3>📶 Wi-Fi</h3>${photoBloc}${champ("nom", "Nom affiché en haut", 'maxlength="60"')}
        ${champ("ssid", "Nom du réseau Wi-Fi (exactement)", 'maxlength="64" autocapitalize="off" spellcheck="false"')}${champ("motdepasse", "Mot de passe", 'maxlength="64" autocapitalize="off" spellcheck="false"')}
        <label class="f">Sécurité<select data-k="securite"><option value="WPA" ${P.securite === "WPA" ? "selected" : ""}>WPA / WPA2 (le plus courant)</option><option value="WEP" ${P.securite === "WEP" ? "selected" : ""}>WEP (ancien)</option><option value="nopass" ${P.securite === "nopass" ? "selected" : ""}>Ouvert (sans mot de passe)</option></select></label>
        <label class="check"><input type="checkbox" data-k="cache" ${P.cache ? "checked" : ""}> Réseau caché</label>${champ("message", "Phrase sous le nom (facultatif)", 'maxlength="80" placeholder="Wi-Fi offert 📶"')}</section>`;
    if (P.type === "liens") corps = `<section class="sec paper stack"><h3>🔗 Page liens</h3>${photoBloc}${champ("nom", "Nom", 'maxlength="60"')}${champ("slogan", "Petite phrase (facultatif)", 'maxlength="100"')}
        ${champ("whatsapp", "WhatsApp (bouton en haut)", 'type="tel" inputmode="tel"')}<div class="eyebrow">Boutons</div>${liensHtml()}${champ("localisation", "Localisation (adresse ou lien Maps)", 'maxlength="300"')}</section>`;
    app.innerHTML = `
    <section class="sec linkbox" style="margin-top:0"><div class="row between" style="align-items:flex-start;gap:12px;flex-wrap:nowrap"><div style="flex:1;min-width:0"><div style="color:#c5d4ee;font-size:13px">${ic} ${tn} · lien à mettre dans la puce</div><code>${esc(L.replace(/^https?:\/\//, ""))}</code></div>${qr ? `<div class="qr">${qr}</div>` : ""}</div>
      ${!saved ? `<div style="color:#ffd27a;font-size:13px">⚠️ Pas encore enregistrée : touchez « Enregistrer » en bas.</div>` : dirty() ? `<div style="color:#ffd27a;font-size:13px">⚠️ Modifications pas encore enregistrées.</div>` : ""}
      <div class="acts"><button class="btn sm primary" data-act="copier">📋 Copier le lien</button><button class="btn sm" data-act="nfc" data-adm>📲 Écrire sur la puce</button><a class="btn sm" href="/p/${esc(P.slug)}" target="_blank" rel="noopener">👀 Voir</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(P.nom + " : " + L)}">💬 WhatsApp</a><button class="btn sm" data-act="qrpng">⬇️ QR en image</button><button class="btn sm" data-act="dupliquer" data-adm>📄 Dupliquer</button></div></section>
    ${corps}
    <section class="sec paper stack"><h3>🎨 Style</h3><div class="themes2">${Object.entries(THEMES).map(([k, [n, bg, fg]]) => `<button data-theme="${k}" aria-pressed="${P.theme === k}" style="background:${bg};color:${fg}">${n}</button>`).join("")}</div>
      <label class="f">Couleur principale<input type="color" data-k="couleur" value="${esc(/^#[0-9a-f]{6}$/i.test(P.couleur || "") ? P.couleur : "#2F7BFF")}" style="height:46px;padding:4px"></label>
      <div class="seg" style="grid-template-columns:1fr 1fr"><button type="button" data-lang="fr" aria-pressed="${P.langue !== "ar"}"><b>🇫🇷 Français</b></button><button type="button" data-lang="ar" aria-pressed="${P.langue === "ar"}"><b>🇲🇦 العربية</b></button></div>
      <label class="check" data-adm><input type="checkbox" data-k="actif" ${P.actif !== false ? "checked" : ""}> ✅ Page en ligne (décochez pour la mettre en pause)</label></section>
    <section class="sec paper row between" data-adm><div><b>🗑 Supprimer</b><div class="muted" style="font-size:13px">Le lien ne marchera plus.</div></div><button class="btn sm danger" data-act="supprimer">Supprimer</button></section>
    <div class="savebar"><div class="in"><span class="st" id="st"></span><button class="btn" data-act="apercu">👀 Aperçu</button><button class="btn primary" data-act="enregistrer" id="saveBtn">💾 Enregistrer</button></div></div>`;
    majBarre(); remplir();
  }
  function majBarre() { const st = $("#st"), b = $("#saveBtn"); if (!st) return; const d = dirty(); st.textContent = d ? "Pas encore enregistré" : "✅ Enregistré · en ligne"; st.classList.toggle("dirty", d); b.disabled = !d; }

  /* ---------- enregistrer ---------- */
  function nettoyer() { for (const k of Object.keys(P)) if (typeof P[k] === "string") P[k] = P[k].trim(); if (P.liens) P.liens = P.liens.filter(l => (l.titre || "").trim() || (l.url || "").trim()); }
  async function enregistrer(b) {
    if (!dirty()) return;
    if (!P.nom) { toast("Donnez un nom."); return; }
    b.disabled = true; $("#st").textContent = "Enregistrement…";
    try {
      const avant = saved ? JSON.parse(saved) : {};
      nettoyer();
      if (PROPRIO) { if (!saved) throw { code: "permission-denied" }; for (const k of ["slug", "type", "actif"]) if (k in avant) P[k] = avant[k]; else delete P[k]; }
      const json = JSON.stringify(P);
      await db.doc("settings/page-" + P.slug).set({ json, v: String(Date.now()), maj: NOW(), par: user.email });
      const info = { slug: P.slug, nom: P.nom, type: P.type, photo: P.photo || "", actif: P.actif !== false, maj: Date.now() };
      const x = liste.find(t => t.slug === P.slug); if (x) Object.assign(x, info); else liste.push(info);
      await ecrireListe();
      const now = new Set([P.photo, ...(P.galerie || [])].filter(Boolean));
      await Promise.all([avant.photo, ...(avant.galerie || [])].filter(id => id && !now.has(id)).map(id => db.doc("settings/mimg-" + id).delete().catch(() => {})));
      saved = json; toast("✅ Enregistré ! La page est à jour.");
      renderEdit();
    } catch (e) { erreur(e); majBarre(); }
  }
  async function supprimer() {
    const r = prompt(`Pour supprimer « ${P.nom} », écrivez SUPPRIMER :`);
    if (!r || r.trim().toUpperCase() !== "SUPPRIMER") return;
    try {
      const ids = [P.photo, ...(P.galerie || [])].filter(Boolean);
      await Promise.all(ids.map(id => db.doc("settings/mimg-" + id).delete().catch(() => {})));
      await db.doc("settings/page-" + P.slug).delete();
      liste = liste.filter(t => t.slug !== P.slug); await ecrireListe();
      P = null; saved = ""; toast("🗑 Supprimée."); location.hash = "";
    } catch (e) { erreur(e); }
  }
  function dupliquer() {
    if (dirty() && !confirm("Les modifications non enregistrées seront aussi copiées. Continuer ?")) return;
    const nom = prompt("Nom de la nouvelle page :", P.nom + " 2"); if (!nom || !nom.trim()) return;
    const c = JSON.parse(JSON.stringify(P)), b = base(P.type, nom);
    c.slug = b.slug; c.nom = nom.trim(); c.photo = ""; c.galerie = [];
    P = c; saved = ""; history.replaceState(null, "", "#e=" + P.slug); renderEdit();
    toast("📄 Copie prête : changez ce qu’il faut, puis Enregistrer.", true);
  }
  function apercu() {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box" style="max-width:460px"><div class="row between" style="margin-bottom:8px"><b>👀 Aperçu${dirty() ? " (pas encore enregistré)" : ""}</b><button class="btn sm ghost" data-fermer>Fermer</button></div><iframe class="apercu" src="/p/?apercu=1&s=${encodeURIComponent(P.slug)}"></iframe></div>`;
    document.body.appendChild(d);
    const f = $("iframe", d);
    const onMsg = async e => {
      if (e.source !== f.contentWindow || !e.data || e.data.type !== "nfcwork-page-pret") return;
      const ids = [P.photo, ...(P.galerie || [])].filter(Boolean); await Promise.all(ids.map(img));
      const images = {}; ids.forEach(i => { if (IMG[i]) images[i] = IMG[i]; });
      f.contentWindow.postMessage({ type: "nfcwork-page-apercu", page: JSON.parse(JSON.stringify(P)), images }, location.origin);
    };
    window.addEventListener("message", onMsg);
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-fermer]")) { d.remove(); window.removeEventListener("message", onMsg); } });
  }
  function qrPng() {
    const L = lien(P.slug), svg = window.QRGEN.svg(L, { marge: 2, couleur: "#000000" }).replace("<svg", '<svg width="1000" height="1000"' + (/xmlns=/.test(window.QRGEN.svg("a")) ? "" : ' xmlns="http://www.w3.org/2000/svg"'));
    const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 1000; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 1000); g.drawImage(im, 0, 0, 1000, 1000); const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "QR-" + P.slug + ".png"; a.click(); };
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- événements ---------- */
  app.addEventListener("input", e => {
    if (!P) return;
    const t = e.target;
    if (t.dataset.k) { P[t.dataset.k] = t.type === "checkbox" ? t.checked : t.value; if (t.dataset.k === "nom") $("#topTitle").textContent = (TYPES[P.type] || [""])[0] + " " + t.value; }
    else if (t.dataset.h != null) { P.horaires = P.horaires || {}; P.horaires[t.dataset.h] = t.value; }
    else if (t.dataset.l) { const [i, k] = t.dataset.l.split("."); P.liens[+i][k] = t.value; }
    majBarre();
  });
  app.addEventListener("change", async e => {
    const t = e.target; if (!t.dataset.up || !t.files.length || !P) return;
    const box = t.closest("section"); box.classList.add("busy");
    try {
      if (t.dataset.up === "photo") P.photo = await envoyerPhoto(t.files[0], 700, 300000);
      else for (const f of [...t.files].slice(0, 6 - (P.galerie || []).length)) { P.galerie = P.galerie || []; P.galerie.push(await envoyerPhoto(f, 1000, 380000)); }
      renderEdit(); toast("📷 Photo ajoutée — pensez à Enregistrer");
    } catch (x) { toast(/illisible|lourde/.test(x.message) ? "Photo illisible : choisissez un JPG ou PNG." : "Échec de l’envoi de la photo.", true); box.classList.remove("busy"); }
  });
  document.addEventListener("click", async e => {
    if (e.target.closest(".modal")) return;
    const nw = e.target.closest("[data-new]"); if (nw) { nouveau(nw.dataset.new); return; }
    const f = e.target.closest("[data-f]"); if (f) { filtre = f.dataset.f; renderListe(); return; }
    const th = e.target.closest("[data-theme]"); if (th && P) { P.theme = th.dataset.theme; renderEdit(); return; }
    const lg = e.target.closest("[data-lang]"); if (lg && P) { P.langue = lg.dataset.lang; renderEdit(); return; }
    const b = e.target.closest("[data-act]"); if (!b || !P) return;
    const a = b.dataset.act, i = +b.dataset.i;
    if (a === "copier") { try { await navigator.clipboard.writeText(lien(P.slug)); toast("📋 Lien copié"); } catch (x) { prompt("Copiez :", lien(P.slug)); } }
    if (a === "nfc") { if (!saved) toast("Enregistrez d’abord la page, puis écrivez la puce.", true); window.NFCW_ECRIRE(lien(P.slug), P.nom); }
    if (a === "qrpng") qrPng();
    if (a === "dupliquer" && !PROPRIO) dupliquer();
    if (a === "apercu") apercu();
    if (a === "enregistrer") enregistrer(b);
    if (a === "supprimer" && !PROPRIO) supprimer();
    if (a === "photo-del") { P.photo = ""; renderEdit(); }
    if (a === "g-del") { P.galerie.splice(i, 1); renderEdit(); }
    if (a === "l-add") { P.liens = P.liens || []; P.liens.push({ titre: "", url: "" }); renderEdit(); }
    if (a === "l-del") { P.liens.splice(i, 1); renderEdit(); }
    if (a === "h-copie") { const v = (P.horaires || {})[1] || ""; if (!v) { toast("Remplissez d’abord lundi."); return; } [2, 3, 4, 5, 6].forEach(j => (P.horaires[j] = v)); renderEdit(); toast("Copié du mardi au samedi (dimanche : à vous de choisir)."); }
  });
  window.addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
})();
