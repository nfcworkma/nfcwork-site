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
    liens: ["🔗", "Page liens", "Lien pour la bio Instagram, boutons"],
    rdv: ["📅", "Réservation", "Le client choisit service (ou table), jour et heure : tout arrive dans l’Espace du commerçant"]
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
    if (type === "rdv") Object.assign(p, { mode: "services", whatsapp: "", services: "Coupe homme · 50 DH · 30 min\nCoupe + barbe · 70 DH · 45 min", equipe: "", ressources: "", durees: "60,120", options: "", facturation: "heure", prixHeure: "", prixPartie: "", minPartie: 15, parties: "1,2,3,5,10", ouverture: "09:00", fermeture: "21:00", pas: 30, auto: false, ownerEmail: "", fidPid: "", message: "" });
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
  // services de réservation : texte « Nom · 80 DH · 45 min » (une ligne par service) <-> lignes d'édition
  const svDuree = t => { t = String(t || "").toLowerCase(); let m = t.match(/(\d+)\s*h\s*(\d+)?/); if (m) return +m[1] * 60 + (+m[2] || 0); m = t.match(/(\d+)\s*(min|mn|m)\b/); return m ? +m[1] : 0; };
  const svLire = () => String(P.services || "").split(/\n+/).map(x => x.trim()).filter(Boolean).map(l => { const p = l.split(/\s*[·|•]\s*|\s+-\s+/); const s = { nom: p[0], prix: "", duree: 30 }; for (const x of p.slice(1)) { if (/dh|mad|drh/i.test(x)) s.prix = x.replace(/\D/g, ""); else if (svDuree(x)) s.duree = svDuree(x); } return s; });
  const svEcrire = L => { P.services = L.filter(s => (s.nom || "").trim()).map(s => [s.nom.trim(), s.prix !== "" && s.prix != null ? s.prix + " DH" : "", (s.duree || 30) + " min"].filter(Boolean).join(" · ")).join("\n"); };
  const SV_MODELES = {
    femme: [["Brushing", 45], ["Coupe femme", 45], ["Coupe + brushing", 60], ["Couleur", 120], ["Mèches / balayage", 150], ["Lissage kératine", 180], ["Soin cheveux", 45], ["Manucure", 45], ["Pédicure", 60], ["Vernis semi-permanent", 60], ["Pose de gel / capsules", 90], ["Épilation sourcils", 15], ["Épilation visage", 20], ["Soin visage", 60], ["Maquillage", 60], ["Maquillage mariée", 120], ["Hammam", 60]],
    homme: [["Coupe homme", 30], ["Barbe", 20], ["Coupe + barbe", 45], ["Dégradé", 40], ["Coupe enfant", 20], ["Rasage traditionnel", 30], ["Soin visage homme", 30], ["Coloration barbe", 30], ["Lissage homme", 60]]
  };
  // modèles de métiers pour la réservation : un clic remplit la page (le commerçant met ses prix)
  const RDV_METIERS = [
    ["salon", "💇‍♀️ Salon de coiffure femme", { mode: "services", sv: "femme", ouverture: "10:00", fermeture: "20:00", pas: 30, message: "Prenez rendez-vous en ligne" }],
    ["barber", "💈 Barber / coiffeur homme", { mode: "services", sv: "homme", ouverture: "10:00", fermeture: "22:00", pas: 15, message: "Réservez votre coupe, sans attendre" }],
    ["ongles", "💅 Onglerie / nail bar", { mode: "services", sv: [["Manucure simple", 30], ["Vernis semi-permanent mains", 60], ["Vernis semi-permanent pieds", 60], ["Pose capsules + gel", 120], ["Remplissage gel", 90], ["Nail art (par ongle)", 15], ["Dépose", 30], ["Pédicure spa", 60]], ouverture: "10:00", fermeture: "20:00", pas: 30 }],
    ["spa", "🧖‍♀️ Spa / hammam / institut", { mode: "services", sv: [["Hammam traditionnel", 60], ["Hammam + gommage", 75], ["Massage relaxant 1h", 60], ["Massage aux pierres chaudes", 75], ["Soin visage", 60], ["Épilation jambes", 30], ["Épilation complète", 90], ["Forfait mariée", 180]], ouverture: "10:00", fermeture: "21:00", pas: 30 }],
    ["lavage", "🚗 Lavage auto", { mode: "services", sv: [["Lavage extérieur", 30], ["Lavage complet (int. + ext.)", 60], ["Lavage + aspirateur", 45], ["Nettoyage sièges", 120], ["Polish / lustrage", 120], ["Moto", 20]], ouverture: "08:00", fermeture: "20:00", pas: 30, message: "Réservez, votre voiture passe sans attendre" }],
    ["garage", "🔧 Garage / vidange / pneus", { mode: "services", sv: [["Vidange + filtres", 45], ["Diagnostic", 30], ["Plaquettes de frein", 60], ["Montage pneus", 45], ["Géométrie", 45], ["Climatisation (recharge)", 45]], ouverture: "08:30", fermeture: "19:00", pas: 30 }],
    ["medical", "🩺 Cabinet médical / dentiste / kiné", { mode: "services", sv: [["Consultation", 30], ["Contrôle", 20], ["Détartrage", 30], ["Séance de kiné", 45], ["Première visite", 45]], ouverture: "09:00", fermeture: "18:00", pas: 15, message: "Prenez rendez-vous au cabinet" }],
    ["veto", "🐾 Vétérinaire / toilettage", { mode: "services", sv: [["Consultation", 30], ["Vaccin", 20], ["Toilettage petit chien", 60], ["Toilettage grand chien", 90], ["Toilettage chat", 60], ["Coupe des griffes", 15]], ouverture: "09:00", fermeture: "19:00", pas: 30 }],
    ["coach", "🏋️ Coach sportif / salle de sport", { mode: "services", sv: [["Séance coaching 1h", 60], ["Séance découverte", 45], ["Cours collectif", 60], ["Bilan forme", 30]], ouverture: "07:00", fermeture: "22:00", pas: 60 }],
    ["tattoo", "🖋️ Tatouage / piercing", { mode: "services", sv: [["Petit tatouage", 60], ["Tatouage moyen", 120], ["Grand tatouage (séance)", 240], ["Piercing", 20], ["Consultation projet", 30]], ouverture: "11:00", fermeture: "20:00", pas: 30 }],
    ["photo", "📸 Photographe / studio", { mode: "services", sv: [["Séance photo studio", 60], ["Photos d’identité", 15], ["Shooting produit", 120], ["Séance famille", 90]], ouverture: "10:00", fermeture: "20:00", pas: 30 }],
    ["cours", "📚 Cours particuliers / soutien", { mode: "services", sv: [["Cours 1h", 60], ["Cours 2h", 120], ["Séance d’essai", 45]], ouverture: "14:00", fermeture: "21:00", pas: 60 }],
    ["autoecole", "🚙 Auto-école (heures de conduite)", { mode: "services", sv: [["Heure de conduite", 60], ["2 heures de conduite", 120], ["Examen blanc", 60]], ouverture: "08:00", fermeture: "19:00", pas: 60 }],
    ["billard", "🎱 Billard / snooker", { mode: "tables", res: "🎱 Pool 1\n🎱 Pool 2\n🎱 Pool 3\n🟢 Snooker", facturation: "deux", durees: "30,60,120", parties: "1,2,3,5,10", minPartie: 15, ouverture: "14:00", fermeture: "02:00", pas: 30 }],
    ["ps", "🎮 Salle PlayStation / gaming", { mode: "tables", res: "🎮 PS5 · 1\n🎮 PS5 · 2\n🎮 PS5 · 3\n🕹️ PC gaming 1\n🕹️ PC gaming 2", facturation: "deux", durees: "30,60,120,180", parties: "1,2,3,5", minPartie: 10, ouverture: "12:00", fermeture: "02:00", pas: 30 }],
    ["foot", "⚽ Terrain de foot (city / mini-foot)", { mode: "tables", res: "⚽ Terrain 1\n⚽ Terrain 2", options: "⚽ Location ballon · 10 DH\n👕 Chasubles · 20 DH\n💧 Pack d’eau · 30 DH", facturation: "heure", durees: "60,90,120", ouverture: "09:00", fermeture: "01:00", pas: 60, message: "Réservez votre terrain en 30 secondes" }],
    ["terrains", "🏟️ Complexe sportif (foot, basket, tennis…)", { mode: "tables", res: "⚽ Terrain foot\n🏀 Terrain basket\n🎾 Court de tennis\n🎾 Court de padel", options: "🎾 Location raquette · 20 DH\n🎾 Balles (tube) · 40 DH\n⚽ Location ballon · 10 DH\n👕 Chasubles · 20 DH", facturation: "heure", durees: "60,90,120", ouverture: "08:00", fermeture: "00:00", pas: 30 }],
    ["padel", "🎾 Padel / tennis", { mode: "tables", res: "🎾 Court 1\n🎾 Court 2", options: "🎾 Location raquette · 20 DH\n🎾 Balles (tube) · 40 DH", facturation: "heure", durees: "60,90,120", ouverture: "08:00", fermeture: "00:00", pas: 30 }],
    ["resto", "🍽️ Restaurant / café (tables)", { mode: "tables", res: "🍽️ Table 2 personnes\n🍽️ Table 4 personnes\n🍽️ Table 6 personnes\n🌿 Terrasse 4 personnes", facturation: "heure", durees: "120", ouverture: "12:00", fermeture: "23:30", pas: 30, message: "Réservez votre table" }],
    ["loisir", "🎳 Bowling / karting / escape game", { mode: "tables", res: "🎳 Piste 1\n🎳 Piste 2\n🔐 Escape room", facturation: "partie", parties: "1,2,3", minPartie: 60, ouverture: "14:00", fermeture: "00:00", pas: 30 }],
    ["salle", "🏢 Salle de réunion / coworking", { mode: "tables", res: "🏢 Salle de réunion\n💻 Bureau privé\n🪑 Poste coworking", facturation: "heure", durees: "60,120,240,480", ouverture: "08:00", fermeture: "20:00", pas: 60 }],
    ["studio", "🎙️ Studio d’enregistrement / podcast", { mode: "tables", res: "🎙️ Studio A\n🎧 Studio podcast", facturation: "heure", durees: "60,120,180,240", ouverture: "10:00", fermeture: "00:00", pas: 60 }],
    ["location", "🏍️ Location quad / jet-ski / vélo", { mode: "tables", res: "🏍️ Quad 1\n🏍️ Quad 2\n🌊 Jet-ski 1\n🚲 Vélo 1", facturation: "heure", durees: "30,60,120,240", ouverture: "09:00", fermeture: "19:00", pas: 30 }],
    ["fete", "🎉 Salle des fêtes / anniversaires", { mode: "tables", res: "🎉 Grande salle\n🎈 Espace anniversaire enfants", facturation: "heure", durees: "180,240,360", ouverture: "10:00", fermeture: "00:00", pas: 60 }]
  ];
  function appliquerMetier(cle) {
    const m = (RDV_METIERS.find(x => x[0] === cle) || [])[2]; if (!m) return;
    const plein = P.mode === "tables" ? (P.ressources || "").trim() : (P.services || "").trim();
    if (plein && !confirm("Remplacer la liste actuelle par ce modèle ?")) return false;
    Object.assign(P, { mode: m.mode, ouverture: m.ouverture, fermeture: m.fermeture, pas: m.pas, metier: cle });
    if (m.message && !P.message) P.message = m.message;
    P.options = m.options || "";
    if (m.mode === "tables") Object.assign(P, { ressources: m.res, facturation: m.facturation, durees: m.durees || P.durees || "60,120", parties: m.parties || P.parties || "1,2,3,5,10", minPartie: m.minPartie || P.minPartie || 15 });
    else { P.services = ""; svEcrire((typeof m.sv === "string" ? SV_MODELES[m.sv] : m.sv).map(([nom, duree]) => ({ nom, prix: "", duree }))); }
    return true;
  }
  const DUREES_SV = [10, 15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240];
  // tables / terrains : « ⚽ Terrain foot · 250 DH/h · 10 DH/partie » <-> lignes d'édition
  const rsLire = () => String(P.ressources || "").split(/\n+/).map(x => x.trim()).filter(Boolean).map(l => { const o = { nom: l, ph: "", pp: "" };
    l = l.replace(/[·|•-]?\s*(\d+)\s*dh\s*\/\s*(h|heure)\b/i, (m, n) => { o.ph = n; return ""; }).replace(/[·|•-]?\s*(\d+)\s*dh\s*\/\s*(p|partie)\w*/i, (m, n) => { o.pp = n; return ""; });
    o.nom = l.replace(/\s*[·|•-]\s*$/, "").trim() || o.nom; return o; });
  const rsEcrire = L => { P.ressources = L.filter(r => (r.nom || "").trim()).map(r => [r.nom.trim(), r.ph ? r.ph + " DH/h" : "", r.pp ? r.pp + " DH/partie" : ""].filter(Boolean).join(" · ")).join("\n"); };
  function ressourcesHtml() {
    const f = P.facturation || "heure", L = rsLire(), h = f !== "partie", pt = f !== "heure";
    // anciens prix généraux → recopiés sur les lignes sans prix
    if (L.length && ((h && +P.prixHeure) || (pt && +P.prixPartie)) && L.some(r => (h && !r.ph) || (pt && !r.pp))) { L.forEach(r => { if (h && !r.ph && +P.prixHeure) r.ph = String(P.prixHeure); if (pt && !r.pp && +P.prixPartie) r.pp = String(P.prixPartie); }); rsEcrire(L); }
    const cols = `1fr${h ? " 74px" : ""}${pt ? " 74px" : ""} 40px`;
    return `<div class="eyebrow">Tables, terrains ou postes, avec leur prix (le client voit le total)</div>
      <div class="rshead" style="grid-template-columns:${cols}"><span>Nom</span>${h ? "<span>DH / heure</span>" : ""}${pt ? "<span>DH / partie</span>" : ""}<span></span></div>
      <div class="stack" style="gap:8px">${L.map((r, i) => `<div class="svrow" style="grid-template-columns:${cols}"><input data-rs="${i}.nom" value="${esc(r.nom)}" placeholder="⚽ Terrain 1">${h ? `<input data-rs="${i}.ph" value="${esc(r.ph)}" placeholder="250" inputmode="numeric">` : ""}${pt ? `<input data-rs="${i}.pp" value="${esc(r.pp)}" placeholder="5" inputmode="numeric">` : ""}<button class="btn icon sm danger" data-act="rs-del" data-i="${i}">✕</button></div>`).join("")}
      <button class="btn sm" data-act="rs-add">＋ Ajouter une ligne</button></div>`;
  }
  // options en plus (location raquette, balles…) : « 🎾 Raquette · 20 DH »
  const opLire = () => String(P.options || "").split(/\n+/).map(x => x.trim()).filter(Boolean).map(l => { const m = l.match(/^(.*?)\s*[·|•-]\s*(\d+)\s*dh\s*$/i); return m ? { nom: m[1], prix: m[2] } : { nom: l, prix: "" }; });
  const opEcrire = L => { P.options = L.filter(o => (o.nom || "").trim()).map(o => o.nom.trim() + (o.prix !== "" ? " · " + o.prix + " DH" : "")).join("\n"); };
  function optionsHtml() {
    const L = opLire();
    return `<div class="eyebrow">Options en plus (facultatif : le client choisit la quantité)</div>
      <div class="stack" style="gap:8px">${L.map((o, i) => `<div class="svrow" style="grid-template-columns:1fr 74px 40px"><input data-op="${i}.nom" value="${esc(o.nom)}" placeholder="🎾 Location raquette"><input data-op="${i}.prix" value="${esc(o.prix)}" placeholder="20" inputmode="numeric"><button class="btn icon sm danger" data-act="op-del" data-i="${i}">✕</button></div>`).join("")}
      <button class="btn sm" data-act="op-add">＋ Ajouter une option</button></div>`;
  }
  // cartes fidélité existantes : la réservation donne +1 point quand le ticket est scanné à l'arrivée
  let FIDS = null;
  function fidSelect() {
    if (FIDS === null) { FIDS = []; db.collection("fidProgrammes").get().then(sn => { FIDS = sn.docs.map(d => ({ id: d.id, nom: d.data().nom || d.id, mail: d.data().ownerEmail || "" })).sort((a, b) => a.nom.localeCompare(b.nom)); if (P && P.type === "rdv") { const f = app.querySelector('[data-k="fidPid"]'); if (f) f.outerHTML = fidSelect().match(/<select[\s\S]*<\/select>/)[0]; } }).catch(() => {}); }
    const L = FIDS.slice(); if (P.fidPid && !L.some(x => x.id === P.fidPid)) L.unshift({ id: P.fidPid, nom: P.fidPid, mail: "" });
    return `<label class="f">🎁 Carte fidélité liée (+1 point quand le ticket est scanné à l’arrivée)<select data-k="fidPid"><option value="">Aucune</option>${L.map(x => `<option value="${esc(x.id)}" ${P.fidPid === x.id ? "selected" : ""}>${esc(x.nom)}${x.mail ? " · " + esc(x.mail) : ""}</option>`).join("")}</select></label>
      ${P.fidPid ? "" : `<button class="btn sm" data-act="fid-new">＋ Créer la carte fidélité de « ${esc(P.nom || "ce commerce")} »</button>`}`;
  }
  // logo de la page → logo de la carte fidélité (carré 256 px, fond blanc, comme dans Fidélité)
  async function logoCarte() {
    if (!P.photo) return "";
    const src = await img(P.photo); if (!src) return "";
    return new Promise(ok => {
      const im = new Image(); im.onload = () => {
        const n = 256, c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d");
        const k = Math.min(n / im.naturalWidth, n / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
        g.fillStyle = "#fff"; g.fillRect(0, 0, n, n); g.drawImage(im, (n - w) / 2, (n - h) / 2, w, h);
        let d = c.toDataURL("image/webp", 0.85); if (!d.startsWith("data:image/webp")) d = c.toDataURL("image/jpeg", 0.85); ok(d);
      }; im.onerror = () => ok(""); im.src = src;
    });
  }
  function servicesHtml() {
    const L = svLire();
    return `<div class="eyebrow">Soins / services (prix en DH, le client voit le total)</div>
      <div class="stack" style="gap:8px">${L.map((s, i) => `<div class="svrow"><input data-sv="${i}.nom" value="${esc(s.nom)}" placeholder="Nom du soin"><input data-sv="${i}.prix" value="${esc(s.prix)}" placeholder="Prix" inputmode="numeric"><select data-sv="${i}.duree">${[...new Set(DUREES_SV.concat([+s.duree || 30]))].sort((a, b) => a - b).map(m => `<option value="${m}" ${+s.duree === m ? "selected" : ""}>${m < 60 ? m + " min" : Math.floor(m / 60) + "h" + (m % 60 ? String(m % 60).padStart(2, "0") : "")}</option>`).join("")}</select><button class="btn icon sm danger" data-act="sv-del" data-i="${i}">✕</button></div>`).join("")}
      <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="sv-add">＋ Ajouter un soin</button><button class="btn sm ghost" data-act="sv-mod" data-m="femme">💅 Liste salon femme</button><button class="btn sm ghost" data-act="sv-mod" data-m="homme">💈 Liste barber</button></div></div>`;
  }
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
        <div class="notice" style="font-size:13px;display:grid;gap:8px">
          <b>🔎 Pas de lien ? Avec le Place ID, c’est automatique :</b>
          <span>1️⃣ Touchez <a href="https://developers.google.com/maps/documentation/places/web-service/place-id#find-id" target="_blank" rel="noopener"><b>Trouver le Place ID</b></a> → tapez le nom du commerce + la ville → choisissez-le → copiez le code qui commence par <b>ChIJ…</b></span>
          <span>2️⃣ Collez-le ici 👇 : le lien qui ouvre directement les ⭐ étoiles se crée tout seul.</span>
          <input data-placeid placeholder="ChIJ…" autocapitalize="off" spellcheck="false" style="width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:16px">
          <small class="muted">Ou : Google Business du commerce → <b>Demander des avis</b> → copier le lien (g.page/r/…/review).</small></div>
        ${champ("message", "Phrase sous le nom (facultatif)", 'maxlength="80" placeholder="Votre avis compte 🙏"')}${champ("instagram", "Instagram (facultatif)", 'autocapitalize="off"')}</section>`;
    if (P.type === "wifi") corps = `<section class="sec paper stack"><h3>📶 Wi-Fi</h3>${photoBloc}${champ("nom", "Nom affiché en haut", 'maxlength="60"')}
        ${champ("ssid", "Nom du réseau Wi-Fi (exactement)", 'maxlength="64" autocapitalize="off" spellcheck="false"')}${champ("motdepasse", "Mot de passe", 'maxlength="64" autocapitalize="off" spellcheck="false"')}
        <label class="f">Sécurité<select data-k="securite"><option value="WPA" ${P.securite === "WPA" ? "selected" : ""}>WPA / WPA2 (le plus courant)</option><option value="WEP" ${P.securite === "WEP" ? "selected" : ""}>WEP (ancien)</option><option value="nopass" ${P.securite === "nopass" ? "selected" : ""}>Ouvert (sans mot de passe)</option></select></label>
        <label class="check"><input type="checkbox" data-k="cache" ${P.cache ? "checked" : ""}> Réseau caché</label>${champ("message", "Phrase sous le nom (facultatif)", 'maxlength="80" placeholder="Wi-Fi offert 📶"')}</section>`;
    if (P.type === "rdv") { const tb = P.mode === "tables"; corps = `<section class="sec paper stack"><h3>📅 Réservation</h3>${photoBloc}${champ("nom", "Nom du commerce", 'maxlength="60"')}
        <label class="f">✨ Modèle de métier (remplit tout, vous mettez juste vos prix)<select data-metier><option value="">Choisir le métier…</option>${RDV_METIERS.map(([k, t]) => `<option value="${k}" ${P.metier === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="f">Type de réservation<select data-k="mode" data-rerender><option value="services" ${!tb ? "selected" : ""}>✂️ Rendez-vous (salon, garage, cabinet…)</option><option value="tables" ${tb ? "selected" : ""}>🎱 Tables, terrains, salles (billard, foot, padel…)</option></select></label>
        ${tb ? `<label class="f">Le client paie<select data-k="facturation" data-rerender>${[["heure", "⏱ À l’heure"], ["partie", "🎱 À la partie"], ["deux", "Les deux (le client choisit)"]].map(([v, t]) => `<option value="${v}" ${(P.facturation || "heure") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        ${ressourcesHtml()}
        ${(P.facturation || "heure") !== "partie" ? champ("durees", "Durées proposées (minutes)", 'maxlength="40" placeholder="30,60,120" inputmode="numeric"') : ""}
        ${(P.facturation || "heure") !== "heure" ? `<div class="grid2">${champ("minPartie", "Durée d’une partie (min)", 'inputmode="numeric" placeholder="15"')}${champ("parties", "Parties proposées", 'maxlength="40" placeholder="1,2,3,5,10" inputmode="numeric"')}</div>` : ""}`
        : `${servicesHtml()}
        ${zone("equipe", "Équipe (un prénom par ligne, facultatif)", 'rows="3" maxlength="300" placeholder="Sara&#10;Nadia"')}`}
        ${optionsHtml()}
        <div class="grid2">${champ("ouverture", "Ouverture", 'type="time"')}${champ("fermeture", "Fermeture", 'type="time"')}</div>
        <label class="f">Un créneau toutes les<select data-k="pas">${[15, 20, 30, 45, 60, 90, 120].map(m => `<option value="${m}" ${+P.pas === m ? "selected" : ""}>${m} min</option>`).join("")}</select></label>
        ${champ("ferme", "Jours fermés (facultatif)", 'maxlength="60" placeholder="dimanche"')}
        <label class="check"><input type="checkbox" data-k="auto" ${P.auto ? "checked" : ""}> Confirmer automatiquement (sinon le commerçant confirme dans son Espace)</label>
        ${champ("whatsapp", "WhatsApp du commerce (le client peut le prévenir)", 'type="tel" inputmode="tel" placeholder="06…"')}
        <div data-adm class="stack" style="gap:10px">${champ("ownerEmail", "E-mail du compte commerçant (il reçoit les réservations dans son Espace)", 'type="email" autocapitalize="off" placeholder="vide = les réservations arrivent dans votre Espace admin"')}
        ${fidSelect()}</div>
        ${champ("message", "Phrase sous le nom (facultatif)", 'maxlength="80" placeholder="Réservez en 30 secondes"')}${champ("instagram", "Instagram (facultatif)", 'autocapitalize="off"')}</section>`; }
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
      if (PROPRIO) { if (!saved) throw { code: "permission-denied" }; for (const k of ["slug", "type", "actif", "ownerEmail", "fidPid"]) if (k in avant) P[k] = avant[k]; else delete P[k]; }
      const json = JSON.stringify(P);
      const doc = { json, v: String(Date.now()), maj: NOW(), par: user.email };
      if (P.type === "rdv" && !String(P.ownerEmail || "").trim() && !PROPRIO) P.ownerEmail = ADMIN;   // sans commerçant : les réservations arrivent dans l'Espace admin
      if (P.type === "rdv" && P.ownerEmail) { P.ownerEmail = String(P.ownerEmail).trim().toLowerCase(); doc.ownerEmail = P.ownerEmail; doc.json = JSON.stringify(P); }
      await db.doc("settings/page-" + P.slug).set(doc);
      if (P.type === "rdv" && P.fidPid && P.photo && !PROPRIO) {   // carte fidélité liée sans logo → on lui donne le logo de la page
        db.doc("fidProgrammes/" + P.fidPid).get().then(async g => { if (g.exists && !g.data().logoData && !g.data().logo) { const l = await logoCarte(); if (l) await g.ref.update({ logoData: l }); } }).catch(() => {});
      }
      const info = { slug: P.slug, nom: P.nom, type: P.type, photo: P.photo || "", actif: P.actif !== false, maj: Date.now() };
      const x = liste.find(t => t.slug === P.slug); if (x) Object.assign(x, info); else liste.push(info);
      await ecrireListe();
      const now = new Set([P.photo, ...(P.galerie || [])].filter(Boolean));
      await Promise.all([avant.photo, ...(avant.galerie || [])].filter(id => id && !now.has(id)).map(id => db.doc("settings/mimg-" + id).delete().catch(() => {})));
      saved = doc.json; toast("✅ Enregistré ! La page est à jour.");
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
    if (t.hasAttribute("data-placeid") || (t.dataset.k === "lienGoogle" && /ChIJ[\w-]{10,}/.test(t.value) && !/placeid=/.test(t.value))) {
      const m = t.value.match(/ChIJ[\w-]{10,}/);
      if (m) { P.lienGoogle = "https://search.google.com/local/writereview?placeid=" + m[0]; const f = app.querySelector('[data-k="lienGoogle"]'); if (f) f.value = P.lienGoogle; toast("✅ Lien Google créé : il ouvre directement les étoiles."); majBarre(); }
      if (t.hasAttribute("data-placeid")) return;
    }
    if (t.dataset.k) { P[t.dataset.k] = t.type === "checkbox" ? t.checked : t.value; if (t.hasAttribute("data-rerender")) { renderEdit(); majBarre(); return; } if (t.dataset.k === "fidPid" && t.value && !String(P.ownerEmail || "").trim()) { const f = (FIDS || []).find(x => x.id === t.value); if (f && f.mail) { P.ownerEmail = f.mail; const o = app.querySelector('[data-k="ownerEmail"]'); if (o) o.value = f.mail; } } if (t.dataset.k === "nom") $("#topTitle").textContent = (TYPES[P.type] || [""])[0] + " " + t.value; }
    else if (t.dataset.h != null) { P.horaires = P.horaires || {}; P.horaires[t.dataset.h] = t.value; }
    else if (t.hasAttribute("data-metier")) { if (t.value && appliquerMetier(t.value)) { renderEdit(); toast("✅ Modèle appliqué : mettez vos prix, puis Enregistrer"); } else if (t.value) t.value = P.metier || ""; }
    else if (t.dataset.rs) { const [i, k] = t.dataset.rs.split("."), L = rsLire(); if (L[+i]) { L[+i][k] = k === "nom" ? t.value : t.value.replace(/\D/g, ""); rsEcrire(L); } }
    else if (t.dataset.op) { const [i, k] = t.dataset.op.split("."), L = opLire(); if (L[+i]) { L[+i][k] = k === "nom" ? t.value : t.value.replace(/\D/g, ""); opEcrire(L); } }
    else if (t.dataset.sv) { const [i, k] = t.dataset.sv.split("."), L = svLire(); if (L[+i]) { L[+i][k] = k === "prix" ? t.value.replace(/\D/g, "") : k === "duree" ? +t.value : t.value; svEcrire(L); } }
    else if (t.dataset.l) { const [i, k] = t.dataset.l.split("."); P.liens[+i][k] = t.value; }
    majBarre();
  });
  app.addEventListener("change", async e => {
    const t = e.target; if (!t.dataset.up || !t.files.length || !P) return;
    const fichiers = [...t.files]; t.value = "";
    // ⭕ logo : on le cadre dans le rond (même outil que les menus)
    let f0 = fichiers[0];
    if (t.dataset.up === "photo" && window.NFCW_RECADRER) {
      try { const r = await window.NFCW_RECADRER(f0, "logo"); if (!r) return; f0 = r.blob; }
      catch (x) { console.error(x); toast("Photo illisible : faites une capture d’écran du logo, puis réessayez.", true); return; }
    }
    const box = t.closest("section"); box.classList.add("busy");
    try {
      if (t.dataset.up === "photo") P.photo = await envoyerPhoto(f0, 700, 300000);
      else for (const f of fichiers.slice(0, 6 - (P.galerie || []).length)) { P.galerie = P.galerie || []; P.galerie.push(await envoyerPhoto(f, 1000, 380000)); }
      renderEdit(); toast("📷 Photo ajoutée — pensez à Enregistrer");
    } catch (x) { console.error(x); toast(/illisible|lourde/.test(x && x.message) ? "Photo illisible : faites une capture d’écran du logo, puis réessayez." : "Échec de l’envoi de la photo (" + ((x && (x.code || x.message)) || "erreur") + ").", true); box.classList.remove("busy"); }
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
    if (a === "fid-new") {
      if (!P.nom) { toast("Donnez d’abord un nom au commerce."); return; }
      const R = { barber: ["1 coupe offerte", 10, "visites"], salon: ["-30 % sur votre soin", 6, "visites"], ongles: ["-30 % sur votre soin", 6, "visites"], spa: ["1 hammam offert", 6, "visites"], lavage: ["1 lavage offert", 5, "lavages"],
        billard: ["1 partie offerte", 10, "parties"], ps: ["1 heure de jeu offerte", 10, "visites"], foot: ["1 heure de terrain offerte", 10, "matchs"], terrains: ["1 heure offerte", 10, "réservations"], padel: ["1 heure de padel offerte", 10, "matchs"] }[P.metier] || ["1 offert", 10, "visites"];
      const mail = String(P.ownerEmail || "").trim().toLowerCase() || ADMIN;
      let id = slugify(P.nom) || "carte"; for (let i = 2; ; i++) { const [x, y] = await Promise.all([db.doc("fidProgrammes/" + id).get(), db.doc("settings/fidlien-" + id).get()]); if (!x.exists && !y.exists) break; id = (slugify(P.nom) || "carte") + "-" + i; }
      b.disabled = true;
      try {
        await db.doc("fidProgrammes/" + id).set({ metier: ["salon", "barber", "ongles", "spa"].includes(P.metier) ? "salon" : P.metier || "autre", nom: P.nom, ownerEmail: mail, couleur: /^#[0-9a-f]{6}$/i.test(P.couleur || "") ? P.couleur : "#1e90ff",
          logoData: await logoCarte().catch(() => ""), logo: "", type: "visites", objectif: R[1], unite: R[2], dhParPoint: 10, recompense: R[0], modeClient: "commercant", delaiH: 3, employes: false, modeEmploye: "les2",
          primeEmploye: "Le meilleur du mois gagne 200 DH", actif: true, prix: 0, periode: "mois", guide: "", lienAvis: "", maj: NOW(), createdAt: NOW() });
        FIDS = (FIDS || []).concat({ id, nom: P.nom, mail }); P.fidPid = id; if (!String(P.ownerEmail || "").trim()) P.ownerEmail = mail;
        renderEdit(); majBarre(); toast(`🎁 Carte créée (${R[1]} ${R[2]} = ${R[0]}). Appuyez sur Enregistrer. Logo et récompense : dans Fidélité.`);
      } catch (x) { b.disabled = false; erreur(x); }
    }
    if (a === "rs-add") { const L = rsLire(); L.push({ nom: "Nouveau " + (L.length + 1), ph: "", pp: "" }); rsEcrire(L); renderEdit(); majBarre(); }
    if (a === "rs-del") { const L = rsLire(); L.splice(i, 1); rsEcrire(L); renderEdit(); majBarre(); }
    if (a === "op-add") { const L = opLire(); L.push({ nom: "Nouvelle option", prix: "" }); opEcrire(L); renderEdit(); majBarre(); }
    if (a === "op-del") { const L = opLire(); L.splice(i, 1); opEcrire(L); renderEdit(); majBarre(); }
    if (a === "sv-add") { const L = svLire(); L.push({ nom: "Nouveau soin", prix: "", duree: 30 }); svEcrire(L); renderEdit(); majBarre(); }
    if (a === "sv-del") { const L = svLire(); L.splice(i, 1); svEcrire(L); renderEdit(); majBarre(); }
    if (a === "sv-mod") { const L = svLire(), noms = new Set(L.map(s => s.nom.toLowerCase())); (SV_MODELES[b.dataset.m] || []).forEach(([n, d]) => { if (!noms.has(n.toLowerCase())) L.push({ nom: n, prix: "", duree: d }); }); svEcrire(L); renderEdit(); majBarre(); toast("Liste ajoutée : mettez vos prix, supprimez ce que vous ne faites pas ✕"); }
    if (a === "l-add") { P.liens = P.liens || []; P.liens.push({ titre: "", url: "" }); renderEdit(); }
    if (a === "l-del") { P.liens.splice(i, 1); renderEdit(); }
    if (a === "h-copie") { const v = (P.horaires || {})[1] || ""; if (!v) { toast("Remplissez d’abord lundi."); return; } [2, 3, 4, 5, 6].forEach(j => (P.horaires[j] = v)); renderEdit(); toast("Copié du mardi au samedi (dimanche : à vous de choisir)."); }
  });
  window.addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
})();
