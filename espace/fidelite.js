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
  const MODES_C = { commercant: ["Commerçant", "Il scanne la carte"], client: ["Client", "Il scanne la caisse"], deux: ["Les deux", "Au choix"] };
  const MODES_E = { patron: ["Patron", "Il scanne le code"], client: ["Client", "Il donne +1"], deux: ["Les deux", "Au choix"] };

  let user = null, email = "", admin = false, progs = [], P = null, cartes = [], employes = [], secret = "", vue = "clients", recherche = "", subs = [];
  const unsub = () => { subs.forEach(f => f()); subs = []; };
  const moisCle = (d, decal) => { d = new Date(d || Date.now()); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + (decal || 0)); return String(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1); };
  const nomMois = k => new Date(Date.UTC(+k.slice(0, 4), +k.slice(4) - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const unite = p => p.type === "montant" ? "pts" : p.type === "articles" ? "articles" : "visites";
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
        <div class="row between"><span class="n">${esc(p.nom)}</span><span class="pill ${p.actif === false ? "off" : "pro"}">${p.actif === false ? "Désactivé" : esc(TYPES[p.type] ? TYPES[p.type][0] : "")}</span></div>
        <div class="l">${esc(p.objectif)} ${unite(p)} = ${esc(p.recompense)}${admin ? `<br>${esc(p.ownerEmail || "sans compte commerçant")}` : ""}</div>
        <div class="row"><a class="btn sm primary" href="#p=${esc(p.id)}">Ouvrir</a>${admin ? `<button class="btn sm" data-reglages="${esc(p.id)}">Réglages</button>` : ""}</div></div>`).join("")}</div>`
      : `<div class="empty paper sec"><h3>Aucun programme</h3><p>Créez le programme fidélité d’un commerce : type de points, récompense, employés.</p><button class="btn primary" data-act="nouveau">＋ Créer un programme</button></div>`}`;
  }

  /* ================= Réglages d'un programme (admin) ================= */
  async function reglages(pid) {
    const ex = pid ? progs.find(x => x.id === pid) : null;
    const p = Object.assign({ nom: "", ownerEmail: "", logo: "", couleur: "#1e90ff", type: "visites", objectif: 10, recompense: "", dhParPoint: 10,
      modeClient: "commercant", delaiH: 4, employes: false, modeEmploye: "patron", primeEmploye: "Le meilleur du mois gagne 200 DH", delaiVoteMin: 30, actif: true }, ex || {});
    let emails = [];
    try { emails = (await db.collection("clients").get()).docs.map(d => d.data()).filter(c => c.email).map(c => [c.email, c.name || ""]); } catch (e) {}
    const seg = (nom, opts, val) => `<div class="seg3" data-seg="${nom}">${Object.entries(opts).map(([k, [a, b]]) => `<button type="button" data-v="${k}" aria-pressed="${val === k}"><b>${a}</b>${b ? `<small class="muted">${b}</small>` : ""}</button>`).join("")}</div>`;
    const d = fenetre(`<div class="row between"><h2>${ex ? "Réglages" : "Nouveau programme"}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <form class="stack" id="pf" style="margin-top:10px">
        <label class="f">Nom du commerce<input id="p-nom" required maxlength="60" value="${esc(p.nom)}" placeholder="Barber Atlas"></label>
        <label class="f">E-mail du compte commerçant (il scannera les cartes)<input id="p-mail" type="email" list="mails" value="${esc(p.ownerEmail)}" placeholder="client@gmail.com" autocapitalize="off">
          <datalist id="mails">${emails.map(([m, n]) => `<option value="${esc(m)}">${esc(n)}</option>`).join("")}</datalist></label>
        <div class="grid2"><label class="f">Couleur de la carte<input id="p-coul" type="color" value="${esc(p.couleur)}" style="height:46px;padding:4px"></label>
          <label class="f">Logo (lien d’image, facultatif)<input id="p-logo" type="url" value="${esc(p.logo)}" placeholder="https://…" autocapitalize="off"></label></div>
        <div><div class="eyebrow" style="margin-bottom:6px">Comment le client gagne ses points</div>${seg("type", TYPES, p.type)}</div>
        <div class="grid2"><label class="f" id="w-obj">Objectif (points pour la récompense)<input id="p-obj" type="number" min="1" max="1000" value="${esc(p.objectif)}" inputmode="numeric"></label>
          <label class="f" id="w-dh">DH pour 1 point<input id="p-dh" type="number" min="1" max="1000" value="${esc(p.dhParPoint)}" inputmode="numeric"></label></div>
        <label class="f">Récompense<input id="p-rec" required maxlength="80" value="${esc(p.recompense)}" placeholder="1 café offert · -20% · 1 coupe gratuite"></label>
        <div><div class="eyebrow" style="margin-bottom:6px">Qui ajoute les points du client</div>${seg("modeClient", MODES_C, p.modeClient)}</div>
        <label class="f" id="w-delai">Délai entre deux scans du client à la caisse (heures)<input id="p-delai" type="number" min="1" max="72" value="${esc(p.delaiH)}" inputmode="numeric"></label>
        <label class="check"><input type="checkbox" id="p-emp" ${p.employes ? "checked" : ""}> Points des employés (classement du mois)</label>
        <div id="w-emp" class="stack">
          <div><div class="eyebrow" style="margin-bottom:6px">Qui donne les points aux employés</div>${seg("modeEmploye", MODES_E, p.modeEmploye)}</div>
          <label class="f">Prime du mois (affichée aux employés)<input id="p-prime" maxlength="80" value="${esc(p.primeEmploye)}"></label>
          <label class="f" id="w-vote">Délai entre deux avis clients pour un employé (minutes)<input id="p-vote" type="number" min="1" max="1440" value="${esc(p.delaiVoteMin)}" inputmode="numeric"></label>
        </div>
        <label class="check"><input type="checkbox" id="p-actif" ${p.actif !== false ? "checked" : ""}> Programme actif</label>
        <p class="err" id="perr"></p>
        <div class="row"><button class="btn primary" style="flex:1">Enregistrer</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
        ${ex ? `<button type="button" class="btn sm" id="p-jeton">Changer le QR de la caisse (l’ancien ne marchera plus)</button>` : ""}
      </form>`);
    const val = {}; d.querySelectorAll("[data-seg]").forEach(s => { val[s.dataset.seg] = p[s.dataset.seg]; });
    const maj = () => {
      $("#w-dh", d).hidden = val.type !== "montant";
      $("#w-delai", d).hidden = val.modeClient === "commercant";
      $("#w-emp", d).hidden = !$("#p-emp", d).checked;
      $("#w-vote", d).hidden = val.modeEmploye === "patron";
    };
    d.addEventListener("click", e => { const b = e.target.closest("[data-seg] [data-v]"); if (!b) return; const s = b.closest("[data-seg]"); val[s.dataset.seg] = b.dataset.v; s.querySelectorAll("[data-v]").forEach(x => x.setAttribute("aria-pressed", x === b)); maj(); });
    $("#p-emp", d).onchange = maj; maj();
    const jb = $("#p-jeton", d);
    if (jb) jb.onclick = async () => { jb.disabled = true; try { await db.doc("fidSecrets/" + pid).set({ jeton: rid(16) }); toast("Nouveau QR caisse créé : réimprimez l’affiche."); } catch (e) { erreur(e); } jb.disabled = false; };
    $("#pf", d).onsubmit = async e => {
      e.preventDefault();
      const num = (id, mn, mx, def) => Math.max(mn, Math.min(mx, parseInt($(id, d).value, 10) || def));
      const data = {
        nom: $("#p-nom", d).value.trim(), ownerEmail: $("#p-mail", d).value.trim().toLowerCase(), couleur: $("#p-coul", d).value,
        logo: $("#p-logo", d).value.trim(), type: val.type, objectif: num("#p-obj", 1, 1000, 10), dhParPoint: num("#p-dh", 1, 1000, 10),
        recompense: $("#p-rec", d).value.trim(), modeClient: val.modeClient, delaiH: num("#p-delai", 1, 72, 4),
        employes: $("#p-emp", d).checked, modeEmploye: val.modeEmploye, primeEmploye: $("#p-prime", d).value.trim(), delaiVoteMin: num("#p-vote", 1, 1440, 30),
        actif: $("#p-actif", d).checked, maj: NOW()
      };
      if (data.logo && !/^https?:\/\//.test(data.logo)) { $("#perr", d).textContent = "Le logo doit être un lien qui commence par https://"; return; }
      const b = e.target.querySelector("button.primary"); b.disabled = true;
      try {
        const id = pid || slugify(data.nom) + "-" + rid(4);
        if (!pid) data.createdAt = NOW();
        await db.doc("fidProgrammes/" + id).set(data, { merge: true });
        if (!pid) await db.doc("fidSecrets/" + id).set({ jeton: rid(16) });
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
    db.doc("fidSecrets/" + pid).get().then(s => { secret = s.exists ? s.data().jeton || "" : ""; }).catch(() => {});
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
  async function ajouter(cid, n, label) {
    try { await db.doc("fidCartes/" + cid).update({ points: inc(n), total: inc(n), lastAt: NOW() }); toast(label || `+${n} ajouté${n > 1 ? "s" : ""} ✓`); return true; }
    catch (e) { erreur(e); return false; }
  }
  function carteVue(cid) {
    const c = cartes.find(x => x.id === cid); if (!c) { toast("Carte introuvable dans ce commerce."); return; }
    const obj = P.objectif || 10, pts = c.points || 0, pr = pts >= obj, lien = SITE + "/f/?c=" + c.id, wa = waNum(c.tel);
    const d = fenetre(`<div class="row between"><h2>${esc(c.nom)}</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <div class="muted">${esc(c.tel || "")}${c.recompenses ? ` · ${c.recompenses} récompense${c.recompenses > 1 ? "s" : ""} déjà offerte${c.recompenses > 1 ? "s" : ""}` : ""}</div>
      <div class="cardview" style="--accent:${esc(P.couleur || "#1e90ff")}"><div class="n">${esc(P.nom)}</div><div class="p">${pts} <small>/ ${obj} ${unite(P)}</small></div><div class="bar"><i style="width:${Math.min(100, pts / obj * 100)}%"></i></div></div>
      ${pr ? `<button class="btn primary addbtn" style="width:100%;background:var(--warn);border-color:var(--warn);color:#2a1300" id="cv-rec">🎁 Offrir : ${esc(P.recompense)}</button>` : ""}
      <div class="stack" style="margin-top:12px">
        ${P.type === "visites" ? `<button class="btn primary addbtn" id="cv-add">+1 visite</button>`
          : P.type === "articles" ? `<div class="stepper"><button type="button" data-st="-1">−</button><input id="cv-n" type="number" min="1" max="99" value="1" inputmode="numeric"><button type="button" data-st="1">+</button></div><button class="btn primary addbtn" id="cv-add">Ajouter les articles</button>`
          : `<label class="f">Montant de l’achat (DH)<input id="cv-dh" type="number" min="1" inputmode="decimal" placeholder="120" style="font-size:22px;text-align:center"></label><div class="muted" id="cv-calc" style="text-align:center">= 0 point</div><button class="btn primary addbtn" id="cv-add">Ajouter les points</button>`}
        <div class="row">${wa ? `<a class="btn sm" style="flex:1" href="https://wa.me/${wa}?text=${encodeURIComponent("Votre carte fidélité " + P.nom + " : " + lien)}" target="_blank" rel="noopener">Envoyer sa carte (WhatsApp)</a>` : ""}<button class="btn sm ghost" id="cv-moins">Retirer 1</button></div>
        <button class="btn sm danger" id="cv-del">Supprimer cette carte</button>
      </div>`);
    const nb = () => Math.max(1, Math.min(99, parseInt(($("#cv-n", d) || {}).value, 10) || 1));
    d.addEventListener("click", e => { const s = e.target.closest("[data-st]"); if (s) $("#cv-n", d).value = Math.max(1, Math.min(99, nb() + +s.dataset.st)); });
    const dh = $("#cv-dh", d), pts2 = () => Math.floor((parseFloat((dh || {}).value) || 0) / (P.dhParPoint || 10));
    if (dh) { dh.oninput = () => { $("#cv-calc", d).textContent = "= " + pts2() + " point" + (pts2() > 1 ? "s" : ""); }; setTimeout(() => dh.focus(), 100); }
    $("#cv-add", d).onclick = async () => {
      const n = P.type === "visites" ? 1 : P.type === "articles" ? nb() : pts2();
      if (n < 1) { toast("Montant trop petit pour 1 point."); return; }
      if (await ajouter(c.id, n)) d.remove();
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
      <div style="background:#fff;border-radius:16px;padding:14px;margin:10px 0;text-align:center;color:#05080f">${window.QRGEN.svg(lien, { marge: 1 })}<small>${P.modeEmploye === "patron" ? "Code de l’employé (vous le scannez)" : "Les clients scannent ce code après le service"}</small></div>
      <div class="muted" style="text-align:center;margin-bottom:12px">${nomMois(k)} : <b>${(e.m || {})[k] || 0}</b> points</div>
      <div class="stack"><button class="btn primary addbtn" id="ev-plus">+1 point</button>
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
    const d = fenetre(`<h2>${esc(e.nom)}</h2><p class="muted">Ajouter un point pour ce service ?</p><div class="stack"><button class="btn primary addbtn" id="oe-plus">+1 pour ${esc(e.nom)}</button><button class="btn ghost" data-fermer>Annuler</button></div>`);
    $("#oe-plus", d).onclick = async () => { await empPlus(e.id); d.remove(); };
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
    const lienCaisse = SITE + "/f/?p=" + P.id + (P.modeClient !== "commercant" && secret ? "&j=" + secret : "");
    const d = fenetre(`<div class="row between"><h2>Affiches & QR</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted">Le QR ${P.modeClient === "commercant" ? "d’inscription : les clients créent leur carte, vous scannez leur carte à chaque achat." : "de la caisse : les clients créent leur carte et gagnent 1 point à chaque scan (" + (P.delaiH || 4) + " h minimum entre deux)."}</p>
      <div style="background:#fff;border-radius:16px;padding:14px;margin:10px auto;max-width:260px">${window.QRGEN.svg(lienCaisse, { marge: 1 })}</div>
      <div class="stack"><button class="btn primary" id="a1">🖨 Affiche A4 pour la caisse</button><button class="btn" id="a2">🖨 12 stickers (tables, comptoir)</button>
      ${P.employes && employes.length ? `<button class="btn" id="a3">🖨 QR des employés (${employes.length})</button>` : ""}
      <p class="muted" style="font-size:12.5px;margin:0">Sur Mac : Imprimer → « Enregistrer au format PDF » pour l’imprimeur. Le même lien peut aussi être programmé dans une plaque NFC.</p></div>`);
    const rule = P.type === "montant" ? `${P.objectif} points = ${P.recompense}` : `${P.objectif} ${unite(P)} = ${P.recompense}`;
    $("#a1", d).onclick = () => {
      $("#planche").innerHTML = `<div class="page"><img src="../assets/img/logo-nfcwork.png" alt=""><div class="t">Carte fidélité</div><div class="shop">${esc(P.nom)}</div>
        <div class="rule">🎁 ${esc(rule)}</div>${window.QRGEN.svg(lienCaisse, { marge: 1, couleur: "#05080f" })}
        <div class="steps">1. Scannez · 2. Entrez votre prénom · 3. Cumulez vos points${P.modeClient !== "commercant" ? " à chaque visite" : ""}</div></div>`;
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
    $("#planche").innerHTML = pages.map(pg => `<div class="grid12">${pg.map(e => `<div class="stk">${window.QRGEN.svg(SITE + "/f/?e=" + e.id, { marge: 1, couleur: "#05080f" })}<b>${esc(e.nom)}</b><small>${P.modeEmploye === "patron" ? esc(P.nom) : "Bien servi(e) ? Scannez-moi"}</small></div>`).join("")}</div>`).join("");
    window.print();
  }

  /* ================= Clics ================= */
  document.addEventListener("click", e => {
    if (e.target.closest(".modal")) return;
    const t = (sel) => e.target.closest(sel);
    let b;
    if ((b = t("[data-reglages]"))) return void reglages(b.dataset.reglages);
    if ((b = t("[data-vue]"))) { vue = b.dataset.vue; return void renderDash(); }
    if ((b = t("[data-plus]"))) { b.disabled = true; return void ajouter(b.dataset.plus, 1, "+1 visite ✓"); }
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
