(function () {
  "use strict";
  // Espace livreur — connexion + ses livraisons en cours (statut 'enroute' assignées à son e-mail).
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? 0 : n; };
  const fmt = n => (Math.round(num(n) * 100) / 100) + " DH";
  const FB = window.firebase;
  if (FB && !FB.apps.length && window.FIREBASE_CONFIG) FB.initializeApp(window.FIREBASE_CONFIG);
  const auth = FB ? FB.auth() : null, db = FB ? FB.firestore() : null;
  let ME = null, NOMS = null, MODE = "in";

  let tT; function toast(m) { const t = document.getElementById("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(tT); tT = setTimeout(() => t.classList.remove("show"), 2400); }
  function authMsg(e) { const c = (e && e.code) || ""; if (c.includes("email-already-in-use")) return "Cet e-mail a déjà un compte. Connecte-toi."; if (c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("invalid-login")) return "E-mail ou mot de passe incorrect."; if (c.includes("user-not-found")) return "Aucun compte avec cet e-mail."; if (c.includes("weak-password")) return "Mot de passe : 6 caractères minimum."; if (c.includes("invalid-email")) return "E-mail invalide."; if (c.includes("too-many-requests")) return "Trop d'essais, réessaie plus tard."; return "Une erreur est survenue. Réessaie."; }

  // ---------- connexion ----------
  function renderAuth() {
    const up = MODE === "up";
    app.innerHTML =
      '<div class="auth"><div class="ac"><img class="ic" src="/assets/img/ncommandiw-logo.svg" alt="">' +
      '<h1>Espace livreur 🛵</h1>' +
      '<p class="sub">' + (up ? "Crée ton compte avec l'e-mail donné par Ncommandiw." : "Connecte-toi pour voir tes livraisons.") + '</p>' +
      '<div class="form">' +
      '<label class="f"><span>✉️</span><input id="e" type="email" inputmode="email" placeholder="E-mail" autocomplete="email"></label>' +
      '<label class="f"><span>🔒</span><input id="p" type="password" placeholder="Mot de passe" autocomplete="' + (up ? "new-password" : "current-password") + '"></label>' +
      '<p class="err" id="er" hidden></p>' +
      '<button class="btn primary" id="go">' + (up ? "Créer mon compte" : "Se connecter") + '</button>' +
      (up ? "" : '<button class="btn g" id="forgot" style="margin-top:6px">Mot de passe oublié ?</button>') +
      '<div style="font-size:13.5px;color:var(--muted);margin-top:8px">' + (up ? "Déjà un compte ? " : "Pas encore de compte ? ") + '<a class="tog" id="tog">' + (up ? "Se connecter" : "Créer un compte") + '</a></div>' +
      '</div></div></div>';
    const err = m => { const e = document.getElementById("er"); if (e) { e.textContent = m; e.hidden = false; } };
    document.getElementById("tog").onclick = () => { MODE = up ? "in" : "up"; renderAuth(); };
    const fg = document.getElementById("forgot"); if (fg) fg.onclick = async () => { const m = (document.getElementById("e").value || "").trim(); if (!m) return err("Écris ton e-mail d'abord."); try { await auth.sendPasswordResetEmail(m, { url: location.origin + "/coursier/" }); toast("E-mail de réinitialisation envoyé 📧"); } catch (e) { err(authMsg(e)); } };
    document.getElementById("go").onclick = async () => {
      if (!auth) return err("Service indisponible.");
      const m = (document.getElementById("e").value || "").trim(), p = document.getElementById("p").value || "";
      const b = document.getElementById("go"); b.disabled = true;
      try { if (up) { if (p.length < 6) { b.disabled = false; return err("Mot de passe : 6 caractères minimum."); } await auth.createUserWithEmailAndPassword(m, p); } else { await auth.signInWithEmailAndPassword(m, p); } }
      catch (e) { b.disabled = false; err(authMsg(e)); }
    };
  }

  // ---------- noms des restos ----------
  async function nomsRestos() {
    if (NOMS) return NOMS; NOMS = {};
    try { const d = await db.doc("settings/menus").get(); if (d.exists) JSON.parse(d.data().json || "[]").forEach(m => { if (m && m.slug) NOMS[m.slug] = m.nom || m.slug; }); } catch (e) {}
    return NOMS;
  }

  // ---------- tableau de bord ----------
  function shell(inner) {
    app.innerHTML =
      '<div class="bar"><img src="/assets/img/ncommandiw-logo.svg" alt="" width="28" height="28"><h1>Mes livraisons</h1><button class="out" id="out">Déconnexion</button></div>' +
      '<div class="pad" id="c">' + inner + '</div>';
    const o = document.getElementById("out"); if (o) o.onclick = () => auth.signOut();
  }

  async function charger() {
    shell('<div class="state"><div><div class="spin"></div></div></div>');
    const noms = await nomsRestos();
    let docs = [];
    try {
      const snap = await db.collectionGroup("liste").where("livreurEmail", "==", (ME.email || "").toLowerCase()).where("statut", "==", "enroute").get();
      snap.forEach(d => docs.push(d));
    } catch (e) {
      shell('<div class="empty"><div><div class="em">⚠️</div><h2>Impossible de charger</h2><p>' + esc((e && e.message) || "Réessaie.") + '</p><button class="btn primary" id="rr" style="max-width:220px;margin:14px auto 0">Réessayer</button></div></div>');
      const r = document.getElementById("rr"); if (r) r.onclick = charger; return;
    }
    docs.sort((a, b) => { const ea = a.data().cree, eb = b.data().cree; const va = ea && ea.seconds ? ea.seconds : 0, vb = eb && eb.seconds ? eb.seconds : 0; return va - vb; });
    // stats des gains (livraisons terminées) — réutilise l'index livreurEmail+statut
    let stats = "";
    try {
      const sl = await db.collectionGroup("liste").where("livreurEmail", "==", (ME.email || "").toLowerCase()).where("statut", "==", "livree").limit(1000).get();
      const now = Date.now(), dj = (function () { const x = new Date(); x.setHours(0, 0, 0, 0); return x.getTime(); })();
      const sem = now - 7 * 864e5, moi = now - 30 * 864e5;
      const part = o => { const f = num(o.frais), p = num(o.part); return (f && p) ? Math.round(f * p / 100) : 0; };
      const tms = o => { const c = o.cree; return c && c.seconds ? c.seconds * 1000 : (c && c.toDate ? c.toDate().getTime() : 0); };
      let gj = 0, nj = 0, gs = 0, gm = 0;
      const remit = {}; // slug -> {n, cash, remit, nom} : cash du jour à reverser aux restos
      sl.forEach(d => {
        const o = d.data(), t = tms(o), g = part(o);
        if (t >= moi) gm += g; if (t >= sem) gs += g;
        if (t >= dj) {
          gj += g; nj++;
          if (o.pay !== "virement") {
            const slug = d.ref.parent.parent.id, tot = num(o.total), r = tot - g;
            if (!remit[slug]) remit[slug] = { n: 0, cash: 0, remit: 0, nom: noms[slug] || slug };
            remit[slug].n++; remit[slug].cash += tot; remit[slug].remit += r;
          }
        }
      });
      stats = '<div class="stats"><div class="stile big"><div><div class="v">' + fmt(gj) + '</div></div><div class="k">💰 Gains aujourd\'hui<br>' + nj + ' livraison' + (nj > 1 ? "s" : "") + '</div></div>' +
        '<div class="stile"><div class="v">' + fmt(gs) + '</div><div class="k">📅 Cette semaine</div></div>' +
        '<div class="stile"><div class="v">' + fmt(gm) + '</div><div class="k">🗓️ Ce mois-ci</div></div></div>';
      const rk = Object.keys(remit);
      if (rk.length) {
        let totCash = 0, totRemit = 0;
        const rows = rk.map(s => { const x = remit[s]; totCash += x.cash; totRemit += x.remit; return '<div class="l"><span>' + esc(x.nom) + ' (' + x.n + ')</span><span>' + fmt(x.remit) + '</span></div>'; }).join("");
        stats += '<div class="card" style="margin-top:12px"><div style="font-weight:800;margin-bottom:7px">🧾 Ma journée — à remettre aux restos (cash)</div>' + rows +
          '<div class="l b" style="margin-top:7px;border-top:1px solid var(--line);padding-top:7px"><span>Total à remettre</span><span>' + fmt(totRemit) + '</span></div>' +
          '<div class="l"><span>Cash encaissé</span><span>' + fmt(totCash) + '</span></div>' +
          '<div class="l"><span>Ma part gardée</span><span>' + fmt(totCash - totRemit) + '</span></div></div>';
      }
    } catch (e) {}
    if (!docs.length) {
      shell(stats + '<div class="sec">Livraisons en cours <button class="refresh" id="rf">↻</button></div><div class="empty" style="min-height:28vh"><div><div class="em">✅</div><h2>Aucune livraison en cours</h2><p>Tes nouvelles livraisons<br>apparaîtront ici.</p></div></div>');
      const rf = document.getElementById("rf"); if (rf) rf.onclick = charger; return;
    }
    const cards = docs.map(d => {
      const o = d.data(), slug = d.ref.parent.parent.id, resto = noms[slug] || slug;
      const frais = num(o.frais), part = num(o.part), pl = (part && frais) ? Math.round(frais * part / 100) : 0;
      const lien = "/livreur/?s=" + encodeURIComponent(slug) + "&o=" + encodeURIComponent(d.id) + (o.code ? "&c=" + encodeURIComponent(o.code) : "");
      const reg = (part && frais) ? '<div class="reg"><div style="font-weight:800;margin-bottom:3px">💰 Part livreur ' + part + '%</div><div class="l"><span>À encaisser</span><span>' + fmt(o.total) + '</span></div><div class="l"><span>Le resto reçoit</span><span>' + fmt(num(o.total) - pl) + '</span></div><div class="l b"><span>Ta part</span><span>' + fmt(pl) + '</span></div></div>' : "";
      return '<div class="card"><div class="top"><span class="resto">' + esc(resto) + '</span><span class="num">N° ' + esc(o.num || "") + '</span></div>' +
        '<div class="row"><span class="ic">👤</span><div><b>' + esc(o.nom || "") + '</b>' + (o.tel ? " · " + esc(o.tel) : "") + '</div></div>' +
        (o.adresse ? '<div class="row"><span class="ic">📍</span><div>' + esc(o.adresse) + '</div></div>' : "") +
        '<div class="pills"><span class="pill tot">' + fmt(o.total) + '</span><span class="pill pay">' + (o.pay === "virement" ? "🏦 Virement payé" : "💵 Cash") + '</span></div>' +
        reg +
        '<a class="btn primary" href="' + lien + '">📍 Ouvrir — GPS & confirmer</a></div>';
    }).join("");
    shell(stats + '<div class="sec">' + docs.length + ' livraison' + (docs.length > 1 ? "s" : "") + ' en cours <button class="refresh" id="rf">↻ Actualiser</button></div>' + cards);
    const rf = document.getElementById("rf"); if (rf) rf.onclick = charger;
  }

  // ---------- vérification du compte (KYC) ----------
  const LIV_DOCS = [
    { k: "cin_recto", emo: "🪪", t: "CIN — recto" },
    { k: "cin_verso", emo: "🪪", t: "CIN — verso" },
    { k: "permis", emo: "🚗", t: "Permis de conduire" },
    { k: "selfie", emo: "🤳", t: "Selfie", cam: true }
  ];
  const val = id => ((document.getElementById(id) || {}).value || "").trim();
  function tile(d) {
    if (d.cam) return '<button type="button" class="up" data-cam="' + d.k + '"><span class="emo">' + d.emo + '</span><span class="t">' + d.t + '<br><small style="opacity:.65">📸 en direct</small></span></button>';
    return '<label class="up"><span class="emo">' + d.emo + '</span><span class="t">' + d.t + '</span><input type="file" accept="image/*" data-f="' + d.k + '"></label>';
  }
  function markFull(up, src) {
    const old = up.querySelector("img.pv"); if (old) old.remove();
    const img = document.createElement("img"); img.className = "pv"; img.src = src; up.appendChild(img);
    if (!up.querySelector(".chk")) { const c = document.createElement("span"); c.className = "chk"; c.textContent = "✓"; up.appendChild(c); }
    up.classList.add("full");
  }
  function wireUploads(store) {
    app.querySelectorAll("input[data-f]").forEach(inp => {
      inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; store[inp.dataset.f] = f; markFull(inp.closest(".up"), URL.createObjectURL(f)); };
    });
    app.querySelectorAll("[data-cam]").forEach(btn => {
      const k = btn.dataset.cam;
      btn.onclick = () => {
        NCW.captureSelfie().then(durl => { store[k] = durl; markFull(btn, durl); }).catch(e => {
          if (e && e.message === "annulé") return;
          const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.capture = "user";
          inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; store[k] = f; markFull(btn, URL.createObjectURL(f)); };
          inp.click();
        });
      };
    });
  }
  function renderVerif(prev) {
    const refus = prev && prev.statut === "refuse";
    app.innerHTML =
      '<div class="vf"><div class="top"><img src="/assets/img/ncommandiw-logo.svg" alt=""><div><h1>Vérifie ton compte 🛵</h1></div></div>' +
      '<p class="sub">Pour livrer avec Ncommandiw, on vérifie ton identité. Tes documents restent confidentiels.</p>' +
      (refus ? '<div style="background:rgba(198,71,47,.1);border-radius:12px;padding:12px 14px;margin-bottom:12px"><b style="color:var(--red)">Dossier à refaire</b><div style="font-size:13px;margin-top:3px">' + esc(prev.motif || "Merci de renvoyer des documents lisibles.") + '</div></div>' : "") +
      '<div class="grp"><label>Nom complet</label><input class="in" id="v-nom" maxlength="60" value="' + esc((prev && prev.nom) || "") + '"></div>' +
      '<div class="row2"><div class="grp"><label>Téléphone</label><input class="in" id="v-tel" type="tel" inputmode="tel" maxlength="20" value="' + esc((prev && prev.tel) || "") + '"></div>' +
      '<div class="grp"><label>Ville</label><input class="in" id="v-ville" maxlength="40" value="' + esc((prev && prev.ville) || "") + '"></div></div>' +
      '<div class="grp"><label>N° de CIN</label><input class="in" id="v-cin" maxlength="20" value="' + esc((prev && prev.cin) || "") + '"></div>' +
      '<div class="row2"><div class="grp"><label>Véhicule</label><select class="in" id="v-veh"><option>Moto</option><option>Voiture</option><option>Vélo</option><option>À pied</option></select></div>' +
      '<div class="grp"><label>Matricule</label><input class="in" id="v-mat" maxlength="20" placeholder="—" value="' + esc((prev && prev.matricule) || "") + '"></div></div>' +
      '<div class="lbl">Documents (photos)</div><div class="ups">' + LIV_DOCS.map(tile).join("") + '</div>' +
      '<p class="err" id="ver" hidden></p>' +
      '<button class="btn primary submit" id="vgo">Envoyer pour validation</button>' +
      '<button class="btn g" id="vout" style="margin-top:8px">Se déconnecter</button></div>';
    if (prev && prev.vehicule) { const s = document.getElementById("v-veh"); if (s) s.value = prev.vehicule; }
    const store = {}; wireUploads(store);
    document.getElementById("vout").onclick = () => auth.signOut();
    const err = m => { const e = document.getElementById("ver"); e.textContent = m; e.hidden = false; };
    document.getElementById("vgo").onclick = async () => {
      const nom = val("v-nom"), tel = val("v-tel"), ville = val("v-ville"), cin = val("v-cin"), veh = val("v-veh"), mat = val("v-mat");
      if (!nom || !tel || !ville || !cin) return err("Remplis toutes les informations.");
      if ((veh === "Moto" || veh === "Voiture") && !mat) return err("Le matricule du véhicule est requis.");
      for (const d of LIV_DOCS) if (!store[d.k]) return err("Ajoute la photo : " + d.t + ".");
      const b = document.getElementById("vgo"); b.disabled = true;
      try {
        const docs = {}; let i = 0;
        for (const d of LIV_DOCS) { i++; b.textContent = "Envoi… (" + i + "/" + LIV_DOCS.length + ")"; docs[d.k] = (typeof store[d.k] === "string") ? store[d.k] : await NCW.toDataURL(store[d.k]); }
        b.textContent = "Enregistrement…";
        await db.doc("verifications/" + ME.uid).set({ role: "livreur", statut: "en_attente", email: ME.email, nom, tel, ville, cin, vehicule: veh, matricule: mat, docs, cree: new Date(), maj: new Date() });
        renderAttente();
      } catch (e) { b.disabled = false; b.textContent = "Envoyer pour validation"; err((e && e.message) || "Échec de l'envoi. Réessaie."); }
    };
  }
  function renderAttente() {
    app.innerHTML = '<div class="empty"><div><div class="em">⏳</div><h2>Compte en cours de validation</h2><p>On vérifie tes documents. Tu recevras l\'accès dès que ton compte est validé.</p><button class="btn primary" id="rr" style="max-width:240px;margin:16px auto 0">Actualiser</button><button class="btn g" id="out" style="max-width:240px;margin:8px auto 0">Se déconnecter</button></div></div>';
    document.getElementById("rr").onclick = router;
    document.getElementById("out").onclick = () => auth.signOut();
  }
  async function router() {
    app.innerHTML = '<div class="state"><div><div class="spin"></div></div></div>';
    let v = null;
    try { const d = await db.doc("verifications/" + ME.uid).get(); v = d.exists ? d.data() : null; } catch (e) {}
    if (!v || v.statut === "refuse") return renderVerif(v);
    if (v.statut === "en_attente") return renderAttente();
    charger();
  }

  if (auth) {
    auth.onAuthStateChanged(u => { if (!u) { ME = null; renderAuth(); return; } ME = { uid: u.uid, email: u.email || "" }; router(); });
  } else {
    renderAuth();
  }
})();
