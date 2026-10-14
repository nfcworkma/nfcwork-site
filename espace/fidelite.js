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
  const MODES_E = { visite: ["À la caisse", "Le commerçant choisit qui a servi"], confirme: ["Le client", "Il confirme qui l’a servi"], les2: ["Les deux", "Caisse, sinon le client"] };
  // modèles prêts à l'emploi par métier (tout reste modifiable)
  const METIERS = {
    barber:   { ico: "✂️", nom: "Barber / Coiffure", type: "visites", objectif: 8, unite: "coupes", recompense: "La 9e coupe offerte", employes: true },
    cafe:     { ico: "☕", nom: "Café", type: "visites", objectif: 10, unite: "cafés", recompense: "1 café offert", employes: false },
    snack:    { ico: "🌯", nom: "Snack", type: "visites", objectif: 10, unite: "commandes", recompense: "1 sandwich offert", employes: false },
    resto:    { ico: "🍽️", nom: "Restaurant", type: "montant", objectif: 200, dhParPoint: 10, unite: "points", recompense: "-50 DH sur l’addition", employes: true },
    vetement: { ico: "👕", nom: "Vêtements", type: "articles", objectif: 10, unite: "articles", recompense: "-20 % sur le prochain achat", employes: true },
    location: { ico: "🏠", nom: "Location (maisons, voitures)", type: "visites", objectif: 5, unite: "locations", recompense: "La 6e location à -50 %", employes: false },
    lavage:   { ico: "🚗", nom: "Lavage auto", type: "visites", objectif: 5, unite: "lavages", recompense: "Le 6e lavage offert", employes: true },
    autre:    { ico: "✨", nom: "Autre", type: "visites", objectif: 10, unite: "visites", recompense: "", employes: false }
  };

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
    if (!admin && !progs.length) { app.innerHTML = `<div class="empty"><h3>Pas encore de programme fidélité</h3><p>Contactez NFCWORK pour activer la carte fidélité de votre commerce.</p><a class="btn primary" href="https://wa.me/212620666027" target="_blank" rel="noopener">WhatsApp NFCWORK</a></div>`; return; }
    try { localStorage.setItem("nfcwork-fid-pro", "1"); } catch (e) {}
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
      ${admin ? `<button class="btn primary" data-act="nouveau">＋ Nouveau programme</button>` : ""}</div>
      ${progs.length ? `<div class="mlist sec">${progs.map(p => `<div class="paper mcard">
        <div class="row between"><span class="n">${(METIERS[p.metier] || {}).ico || ""} ${esc(p.nom)}</span><span class="pill ${p.actif === false ? "off" : "pro"}">${p.actif === false ? "Désactivé" : esc(TYPES[p.type] ? TYPES[p.type][0] : "")}</span></div>
        <div class="l">${esc(p.objectif)} ${unite(p)} = ${esc(p.recompense)}${admin ? `<br>${esc(p.ownerEmail || "sans compte commerçant")}` : ""}</div>
        <div class="row"><a class="btn sm primary" href="#p=${esc(p.id)}">Ouvrir</a>${admin ? `<button class="btn sm" data-reglages="${esc(p.id)}">Réglages</button>` : ""}</div></div>`).join("")}</div>`
      : `<div class="empty paper sec"><h3>Aucun programme</h3><p>Créez le programme fidélité d’un commerce : type de points, récompense, employés.</p><button class="btn primary" data-act="nouveau">＋ Créer un programme</button></div>`}`;
  }

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
          <div class="seg3" id="metiers" style="grid-template-columns:repeat(4,1fr)">${Object.entries(METIERS).map(([k, m]) => `<button type="button" data-metier="${k}" aria-pressed="${p.metier === k}"><b style="font-size:22px">${m.ico}</b><small>${esc(m.nom.split(" (")[0])}</small></button>`).join("")}</div></div>
        <div class="eyebrow">2 · Le commerce</div>
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
        <label class="check"><input type="checkbox" id="p-emp" ${p.employes ? "checked" : ""}> Points des employés (classement du mois)</label>
        <details id="plus"><summary class="muted" style="cursor:pointer;padding:6px 0">Plus d’options</summary><div class="stack" style="margin-top:10px">
          <div><div class="eyebrow" style="margin-bottom:6px">Comment le client gagne ses points</div>${seg("type", TYPES, p.type)}</div>
          <label class="f" id="w-dh">DH pour 1 point<input id="p-dh" type="number" min="1" max="1000" value="${esc(p.dhParPoint)}" inputmode="numeric"></label>
          <div id="w-emp" class="stack"><div><div class="eyebrow" style="margin-bottom:6px">Qui donne le point à l’employé</div>${seg("modeEmploye", MODES_E, p.modeEmploye)}</div>
            <label class="f">Prime du mois (affichée aux employés)<input id="p-prime" maxlength="80" value="${esc(p.primeEmploye)}"></label></div>
          <label class="check"><input type="checkbox" id="p-actif" ${p.actif !== false ? "checked" : ""}> Programme actif</label>
        </div></details>
        <p class="err" id="perr"></p>
        <div class="row"><button class="btn primary" style="flex:1">Enregistrer</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
      </form>`);
    const val = { type: p.type, modeEmploye: p.modeEmploye }; let logoData = p.logoData || "", metier = p.metier;
    const maj = () => { $("#w-dh", d).hidden = val.type !== "montant"; $("#w-emp", d).hidden = !$("#p-emp", d).checked; };
    const choisirSeg = (nom, v) => { val[nom] = v; d.querySelectorAll(`[data-seg="${nom}"] [data-v]`).forEach(x => x.setAttribute("aria-pressed", x.dataset.v === v)); };
    d.addEventListener("click", e => {
      const m = e.target.closest("[data-metier]");
      if (m) {
        metier = m.dataset.metier; const t = METIERS[metier];
        d.querySelectorAll("[data-metier]").forEach(x => x.setAttribute("aria-pressed", x === m));
        $("#p-obj", d).value = t.objectif; $("#p-unite", d).value = t.unite; if (t.recompense || !ex) $("#p-rec", d).value = t.recompense;
        if (t.dhParPoint) $("#p-dh", d).value = t.dhParPoint; $("#p-emp", d).checked = t.employes; choisirSeg("type", t.type); maj();
        if (!$("#p-nom", d).value) $("#p-nom", d).focus();
        return;
      }
      const b = e.target.closest("[data-seg] [data-v]"); if (b) { choisirSeg(b.closest("[data-seg]").dataset.seg, b.dataset.v); maj(); }
    });
    $("#p-emp", d).onchange = maj; maj();
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
        recompense: $("#p-rec", d).value.trim(), modeClient: "commercant", employes: $("#p-emp", d).checked, modeEmploye: val.modeEmploye,
        primeEmploye: $("#p-prime", d).value.trim(), actif: $("#p-actif", d).checked, maj: NOW()
      };
      if (!data.ownerEmail) { $("#perr", d).textContent = "Indiquez l’e-mail du compte du commerçant."; return; }
      const b = e.target.querySelector("button.primary"); b.disabled = true;
      try {
        const id = pid || slugify(data.nom) + "-" + rid(4);
        if (!pid) data.createdAt = NOW();
        await db.doc("fidProgrammes/" + id).set(data, { merge: true });
        db.doc("fidSecrets/" + id).delete().catch(() => {});   // l'ancien QR « caisse » ne donne plus de points
        const local = { id, ...data, maj: Date.now() };
        const i = progs.findIndex(x => x.id === id); if (i >= 0) progs[i] = { ...progs[i], ...local }; else progs.push(local);
        d.remove(); toast("Programme enregistré ✓");
        if (P && P.id === id) { P = progs.find(x => x.id === id); renderDash(); } else renderListe();
      } catch (x) { erreur(x); b.disabled = false; }
    };
  }

  /* ================= Tableau de bord d'un commerce ================= */
  function ouvrirProgramme(pid) {
    unsub(); P = progs.find(x => x.id === pid); cartes = []; employes = []; secret = "";
    entete(P.nom, "Carte fidélité", admin || progs.length > 1 ? "#" : "./");
    const base = q => admin ? q : q.where("ownerEmail", "==", email);
    subs.push(base(db.collection("fidCartes").where("pid", "==", pid)).onSnapshot(s => { cartes = s.docs.map(d => ({ id: d.id, ...d.data() })); renderDash(); }, erreur));
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
      <p class="muted" style="text-align:center;margin:6px 0 0;font-size:13.5px" id="sm">Visez la carte du client ou le code d’un employé.</p>`);
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
    } catch (e) { console.warn(e); $("#sm", d).textContent = "Caméra indisponible. Vous pouvez aussi scanner la carte avec l’appareil photo du téléphone."; }
  }

  /* ================= Affiches à imprimer ================= */
  function affiches() {
    const lienCaisse = SITE + "/f/?p=" + P.id;
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
    if ((b = t("[data-vue]"))) { vue = b.dataset.vue; return void renderDash(); }
    if ((b = t("[data-plus]"))) { const d = fenetre(""); return void quiAServi(d, b.dataset.plus, 1); }
    if ((b = t("[data-carte]"))) return void carteVue(b.dataset.carte);
    if ((b = t("[data-empplus]"))) { b.disabled = true; return void empPlus(b.dataset.empplus); }
    if ((b = t("[data-emp]"))) return void empVue(b.dataset.emp);
    if ((b = t("[data-act]"))) {
      const a = b.dataset.act;
      if (a === "nouveau") reglages(null);
      if (a === "scan") scanner();
      if (a === "affiches") affiches();
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
