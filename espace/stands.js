/* =========================================================
   NFCWORK — STANDS QR (admin seulement)
   Chaque stand imprimé porte un QR fixe : nfcwork.ma/q/<CODE>.
   Le lien vers lequel il envoie se change ici, sans jamais réimprimer.
   Firestore, collection « settings » (lecture publique, écriture admin — règle déjà en place) :
     settings/stands      → liste  { json: "[{c, nom, url, type, maj}]" }
     settings/qr-<CODE>   → un stand lié  { url, nom, type, maj }  (lu par q/index.html)
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
  const lienQR = c => SITE + "/q/" + c;
  // tous les produits NFC, pas seulement les menus : cartes digitales, avis Google, Wi-Fi, menus, pages liens
  const TYPES = { profil: "Carte digitale", avis: "Avis Google", menu: "Menu digital", wifi: "Wi-Fi", liens: "Page liens", lien: "Autre lien" };

  let user = null, liste = [], menus = [], creations = [], filtre = "tous", recherche = "";
  const svgQR = (c, couleur) => window.QRGEN.svg(lienQR(c), { ecl: "M", marge: 2, couleur });

  /* ---------- connexion ---------- */
  auth.onAuthStateChanged(async u => {
    user = u;
    if (!u) { renderLogin(); return; }
    if ((u.email || "").toLowerCase() !== ADMIN) {
      app.innerHTML = `<div class="empty"><h3>Accès réservé</h3><p>Cette page est réservée à l’administrateur NFCWORK.</p><a class="btn" href="./">Retour à l’Espace</a></div>`;
      return;
    }
    try { localStorage.setItem("nfcwork-admin", "1"); } catch (e) {}
    await charger(); route();
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

  /* ---------- données ---------- */
  async function charger() {
    try { const d = await db.doc("settings/stands").get(); liste = d.exists ? JSON.parse(d.data().json || "[]") : []; }
    catch (e) { console.error(e); liste = []; toast("Impossible de lire la liste des stands."); }
    try { const d = await db.doc("settings/menus").get(); menus = d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { menus = []; }
    // produits déjà créés avec l'outil (cartes, avis, Wi-Fi, menus, pages liens) : on les propose directement
    try { const q = await db.collection("creations").get(); creations = q.docs.map(x => ({ id: x.id, ...x.data() })).filter(c => c.lien && c.statut !== "desactivee"); } catch (e) { creations = []; }
  }
  const sauverListe = () => db.doc("settings/stands").set({ json: JSON.stringify(liste), maj: NOW(), par: user.email });
  function erreur(e) {
    console.error(e);
    toast(e && e.code === "permission-denied" ? "Enregistrement refusé : connectez-vous avec l’e-mail admin." : "Échec de l’enregistrement. Vérifiez la connexion.", true);
  }
  const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // sans 0/O, 1/I/L
  function nouveauCode() {
    for (;;) { let s = ""; for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; if (!liste.some(x => x.c === s)) return s; }
  }
  const codeDe = txt => {
    const t = String(txt || "").trim(), m = t.match(/\/q\/([A-Za-z0-9]+)/) || t.match(/[?&]c=([A-Za-z0-9]+)/);
    return (m ? m[1] : t).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  };

  /* ---------- navigation ---------- */
  function route() {
    const l = location.hash.match(/^#lier=([A-Za-z0-9]+)/);
    renderListe();
    if (l) { history.replaceState(null, "", "#"); lier(codeDe(l[1])); }
  }
  window.addEventListener("hashchange", route);

  /* ---------- liste ---------- */
  function renderListe() {
    const nLie = liste.filter(x => x.url).length, nLibre = liste.length - nLie;
    const q = recherche.toLowerCase();
    const l = liste.filter(x => (filtre === "tous" || (filtre === "libres" ? !x.url : !!x.url))
      && (!q || [x.c, x.nom, x.url].join(" ").toLowerCase().includes(q))).sort((a, b) => (b.maj || 0) - (a.maj || 0));
    app.innerHTML = `<div class="row between"><div><h2>Stands QR</h2><div class="muted">Imprimez des QR fixes (stands, cartes digitales…), liez-les plus tard : carte, avis Google, menu, Wi-Fi…</div></div></div>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-act="scan" style="flex:1">📷 Scanner un stand</button><button class="btn" data-act="generer" style="flex:1">＋ Générer des QR</button></div>
      <div class="stats"><div><b class="num">${liste.length}</b><span>Stands</span></div><div><b class="num">${nLie}</b><span>Liés</span></div><div><b class="num">${nLibre}</b><span>Libres</span></div></div>
      ${liste.length ? `<label class="f" style="margin-bottom:10px"><input id="rech" placeholder="Rechercher : code, client, lien…" value="${esc(recherche)}" autocomplete="off"></label>
      <div class="chips">${[["tous", "Tous"], ["libres", "Libres"], ["lies", "Liés"]].map(([k, n]) => `<button data-filtre="${k}" aria-pressed="${filtre === k}">${n}</button>`).join("")}
        ${nLibre ? `<button data-act="imprimer-libres" style="margin-inline-start:auto">🖨 Imprimer les libres (${nLibre})</button>` : ""}</div>
      <div class="slist">${l.map(x => `<div class="srow"><div class="qr">${svgQR(x.c)}</div>
        <div class="tx"><div class="row" style="gap:8px"><span class="c">${esc(x.c)}</span><span class="pill ${x.url ? "lie" : "libre"}">${x.url ? esc(TYPES[x.type] || "Lié") : "Libre"}</span></div>
        <div class="u">${x.url ? esc((x.nom ? x.nom + " · " : "") + x.url.replace(/^https?:\/\//, "")) : "Pas encore lié"}</div></div>
        <button class="btn sm${x.url ? "" : " primary"}" data-lier="${esc(x.c)}">${x.url ? "Modifier" : "Lier"}</button></div>`).join("") || `<div class="empty"><p>Aucun stand ici.</p></div>`}</div>`
      : `<div class="empty paper sec"><h3>Aucun stand pour l’instant</h3><p>Générez vos premiers QR, imprimez-les sur vos stands, puis liez chaque stand quand vous le vendez.</p></div>`}`;
    const r = $("#rech"); if (r) r.oninput = e => { recherche = e.target.value; const pos = e.target.selectionStart; renderListe(); const n = $("#rech"); n.focus(); n.setSelectionRange(pos, pos); };
  }

  document.addEventListener("click", e => {
    if (e.target.closest(".modal")) return;
    const f = e.target.closest("[data-filtre]"); if (f) { filtre = f.dataset.filtre; renderListe(); return; }
    const l = e.target.closest("[data-lier]"); if (l) { lier(l.dataset.lier); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "generer") generer();
    if (b.dataset.act === "scan") scanner();
    if (b.dataset.act === "imprimer-libres") imprimer(liste.filter(x => !x.url).map(x => x.c));
  });

  /* ---------- générer + imprimer ---------- */
  function generer() {
    const d = fenetre(`<h2>Générer des QR</h2><p class="muted">Chaque QR envoie vers nfcwork.ma/q/CODE. Vous choisirez où il mène plus tard.</p>
      <form class="stack" id="gf"><label class="f">Combien de stands ?<input id="gn" type="number" min="1" max="120" value="12" inputmode="numeric"></label>
      <p class="muted" style="margin:0;font-size:13px">12 QR = une feuille A4 (3 × 4 stickers de 6,5 cm).</p>
      <div class="row"><button class="btn primary" style="flex:1">Générer et imprimer</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div></form>`);
    $("#gf", d).onsubmit = async e => {
      e.preventDefault();
      const n = Math.max(1, Math.min(120, parseInt($("#gn", d).value, 10) || 0)), b = e.target.querySelector("button"); b.disabled = true;
      const t = Date.now(), nouveaux = Array.from({ length: n }, (_, i) => ({ c: nouveauCode(), nom: "", url: "", type: "", maj: t - i }));
      liste.push(...nouveaux);
      try { await sauverListe(); d.remove(); renderListe(); toast(n + " QR générés"); imprimer(nouveaux.map(x => x.c)); }
      catch (x) { liste = liste.filter(y => !nouveaux.includes(y)); erreur(x); b.disabled = false; }
    };
  }
  function imprimer(codes) {
    if (!codes.length) return;
    const feuilles = [];
    for (let i = 0; i < codes.length; i += 12) feuilles.push(codes.slice(i, i + 12));
    $("#planche").innerHTML = feuilles.map(f => `<div class="feuille">${f.map(c => `<div class="sticker"><img src="../assets/img/logo-nfcwork.png" alt="NFCWORK">${svgQR(c, "#05080f")}<b>Scannez-moi</b><small>${esc(c)}</small></div>`).join("")}</div>`).join("");
    const d = fenetre(`<h2>Prêt à imprimer</h2><p class="muted">${codes.length} QR sur ${feuilles.length} feuille${feuilles.length > 1 ? "s" : ""} A4. Sur Mac : Imprimer → « Enregistrer au format PDF » pour l’envoyer à l’imprimeur.</p>
      <div class="thumbs" style="grid-template-columns:repeat(auto-fill,minmax(90px,1fr));margin:12px 0">${codes.slice(0, 12).map(c => `<div style="background:#fff;border-radius:10px;padding:6px;text-align:center;color:#05080f">${svgQR(c)}<small style="font-weight:700;letter-spacing:.1em">${esc(c)}</small></div>`).join("")}</div>
      <div class="row"><button class="btn primary" style="flex:1" id="pr">🖨 Imprimer</button><button class="btn ghost" data-fermer>Fermer</button></div>`);
    $("#pr", d).onclick = () => window.print();
  }

  /* ---------- lier un stand ---------- */
  function lier(code) {
    if (!code) return;
    let x = liste.find(s => s.c === code);
    const inconnu = !x;
    if (!x) x = { c: code, nom: "", url: "", type: "", maj: Date.now() };
    let type = x.type && TYPES[x.type] ? x.type : "profil";
    const d = fenetre(`<div class="row between"><h2>Stand ${esc(code)}</h2><span class="pill ${x.url ? "lie" : "libre"}">${x.url ? "Lié" : "Libre"}</span></div>
      ${inconnu ? `<div class="notice" style="margin:8px 0">Ce code n’est pas dans votre liste : il y sera ajouté.</div>` : ""}
      <form class="stack" id="lf2" style="margin-top:10px">
        <label class="f">Nom du client (pour vous retrouver)<input id="ln" value="${esc(x.nom)}" maxlength="80" placeholder="Café Atlas"></label>
        <div><div class="eyebrow" style="margin-bottom:6px">Ce stand ouvre…</div>
          <div class="kind">${Object.entries(TYPES).map(([k, n]) => `<button type="button" data-type="${k}" aria-pressed="${type === k}"><b>${n}</b></button>`).join("")}</div></div>
        <div id="cible"></div>
        <p class="err" id="lerr2"></p>
        <div class="row"><button class="btn primary" style="flex:1">Enregistrer</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
        ${x.url ? `<button type="button" class="btn danger sm" id="delier">Délier ce stand</button>` : ""}
      </form>`);
    const cible = () => {
      // choix possibles : menus de l'éditeur (type menu) + produits créés avec l'outil, du même type
      const opts = (type === "menu" ? menus.map(mn => ({ url: SITE + "/menu/" + mn.slug, nom: mn.nom + " · menu " + mn.formule })) : [])
        .concat(creations.filter(c => c.type === type).map(c => ({ url: c.lien, nom: c.titre || c.slug })));
      const actuel = opts.some(o => o.url === x.url) ? x.url : "";
      $("#cible", d).innerHTML = (opts.length && type !== "lien" ? `<label class="f">Choisir dans vos créations<select id="lsel"><option value="">— Coller un lien à la place —</option>${opts.map(o => `<option value="${esc(o.url)}" ${o.url === actuel ? "selected" : ""}>${esc(o.nom)}</option>`).join("")}</select></label>` : "")
        + `<label class="f" id="luw" ${actuel ? "hidden" : ""}>${{ profil: "Lien de la carte digitale", avis: "Lien Google Maps / avis du commerce", menu: "Lien du menu", wifi: "Lien de la page Wi-Fi", liens: "Lien de la page", lien: "Lien" }[type]}<input id="lu" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(actuel ? "" : x.url)}" placeholder="https://…"></label>`;
      const sel = $("#lsel", d); if (sel) sel.onchange = () => { $("#luw", d).hidden = !!sel.value; };
    };
    cible();
    d.addEventListener("click", e => { const b = e.target.closest("[data-type]"); if (b) { type = b.dataset.type; d.querySelectorAll("[data-type]").forEach(y => y.setAttribute("aria-pressed", y === b)); cible(); } });
    const del = $("#delier", d);
    if (del) del.onclick = async () => {
      del.disabled = true;
      try { await db.doc("settings/qr-" + code).delete(); Object.assign(x, { url: "", type: "", maj: Date.now() }); await sauverListe(); d.remove(); renderListe(); toast("Stand " + code + " délié"); }
      catch (e) { erreur(e); del.disabled = false; }
    };
    $("#lf2", d).onsubmit = async e => {
      e.preventDefault();
      let url = "";
      const sel = $("#lsel", d);
      if (sel && sel.value) url = sel.value;
      else {
        url = ($("#lu", d).value || "").trim();
        if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
        if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) { $("#lerr2", d).textContent = "Collez un lien complet (https://…)."; return; }
      }
      const nom = $("#ln", d).value.trim(), b = e.target.querySelector("button.primary"); b.disabled = true;
      try {
        await db.doc("settings/qr-" + code).set({ url, nom, type, maj: NOW() });
        Object.assign(x, { url, nom, type, maj: Date.now() });
        if (inconnu) liste.push(x);
        await sauverListe();
        d.remove(); renderListe(); toast("Stand " + code + " lié ✓");
      } catch (er) { erreur(er); b.disabled = false; }
    };
  }

  /* ---------- scanner un stand (caméra + jsQR) ---------- */
  let jsqr = null;
  const chargerJsQR = () => jsqr || (jsqr = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "../assets/js/jsQR.js"; s.onload = ok; s.onerror = () => { jsqr = null; ko(); }; document.head.appendChild(s); }));
  async function scanner() {
    let flux = null, fini = false;
    const d = fenetre(`<div class="row between"><h2>Scanner un stand</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <div class="scan"><video id="cam" playsinline muted></video></div>
      <p class="muted" style="text-align:center;margin:6px 0 12px;font-size:13.5px" id="sm">Visez le QR du stand.</p>
      <form id="mf" class="row"><input id="mc" placeholder="…ou tapez le code (ex. A7K2Q)" autocapitalize="characters" style="flex:1;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);font-size:16px"><button class="btn">OK</button></form>`);
    const stop = () => { fini = true; if (flux) flux.getTracks().forEach(t => t.stop()); };
    d.addEventListener("fermee", stop);
    const trouve = c => { if (!c || fini) return; stop(); d.remove(); lier(c); };
    $("#mf", d).onsubmit = e => { e.preventDefault(); trouve(codeDe($("#mc", d).value)); };
    try {
      await chargerJsQR();
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      const v = $("#cam", d); v.srcObject = flux; await v.play();
      const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
      const tour = () => {
        if (fini) return;
        if (v.videoWidth) {
          const k = Math.min(1, 640 / v.videoWidth); c.width = v.videoWidth * k; c.height = v.videoHeight * k;
          g.drawImage(v, 0, 0, c.width, c.height);
          const r = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
          if (r && r.data) { const code = codeDe(r.data); if (/\/q\/|[?&]c=/.test(r.data) && code) { trouve(code); return; } $("#sm", d).textContent = "Ce QR n’est pas un stand NFCWORK."; }
        }
        requestAnimationFrame(tour);
      };
      tour();
    } catch (e) {
      console.warn(e);
      $("#sm", d).textContent = "Caméra indisponible : tapez le code, ou scannez le stand avec l’appareil photo du téléphone.";
    }
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
})();
