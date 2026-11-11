(function () {
  "use strict";
  // Espace commerçant — connexion (même compte que la Caisse) + tableau de bord du jour de son/ses commerce(s).
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? 0 : n; };
  const fmt = n => (Math.round(num(n) * 100) / 100).toLocaleString("fr-FR") + " DH";
  const tx = v => (v && typeof v === "object") ? (v.fr || v.ar || Object.values(v).find(x => typeof x === "string" && x) || "") : (v || "");
  const FB = window.firebase;
  if (FB && !FB.apps.length && window.FIREBASE_CONFIG) FB.initializeApp(window.FIREBASE_CONFIG);
  const auth = FB ? FB.auth() : null, db = FB ? FB.firestore() : null;
  let ME = null, MODE = "in", SHOPS = null;

  let tT; function toast(m) { const t = document.getElementById("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(tT); tT = setTimeout(() => t.classList.remove("show"), 2400); }
  function authMsg(e) { const c = (e && e.code) || ""; if (c.includes("email-already-in-use")) return "Cet e-mail a déjà un compte. Connecte-toi."; if (c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("invalid-login")) return "E-mail ou mot de passe incorrect."; if (c.includes("user-not-found")) return "Aucun compte avec cet e-mail."; if (c.includes("weak-password")) return "Mot de passe : 6 caractères minimum."; if (c.includes("invalid-email")) return "E-mail invalide."; if (c.includes("too-many-requests")) return "Trop d'essais, réessaie plus tard."; return "Une erreur est survenue. Réessaie."; }

  // journée de travail : depuis 5 h du matin (comme la Caisse)
  const debutJour = () => { const d = new Date(); if (d.getHours() < 5) d.setDate(d.getDate() - 1); d.setHours(5, 0, 0, 0); return d; };
  function ouvert(ouv, ferm) {
    if (!ouv || !ferm || !/^\d{1,2}:\d{2}$/.test(ouv) || !/^\d{1,2}:\d{2}$/.test(ferm)) return null;
    const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = ouv.split(":").map(Number), [fh, fm] = ferm.split(":").map(Number);
    const o = oh * 60 + om, f = fh * 60 + fm;
    if (f === o) return true; if (f < o) return cur >= o || cur < f; return cur >= o && cur < f;
  }
  const MODES = { place: ["🍽️", "Sur place"], emporter: ["🥡", "À emporter"], livraison: ["🛵", "Livraison"], chambre: ["🛏️", "Chambre"] };
  function statutBadge(s) {
    if (s === "payee") return '<span class="badge g">💰 Payée</span>';
    if (s === "livree") return '<span class="badge g">✅ Livrée</span>';
    if (s === "annulee") return '<span class="badge n">✖ Annulée</span>';
    if (s === "enroute") return '<span class="badge a">🛵 En route</span>';
    if (s === "prete") return '<span class="badge a">✅ Prête</span>';
    if (s === "cuisine") return '<span class="badge a">👨‍🍳 En cuisine</span>';
    return '<span class="badge a">🆕 Nouvelle</span>';
  }

  // ---------- connexion ----------
  function renderAuth() {
    const up = MODE === "up";
    app.innerHTML =
      '<div class="auth"><img class="ic" src="/assets/img/ncommandiw-logo.svg" alt="">' +
      '<h1>Espace commerçant 🧾</h1>' +
      '<p class="sub">' + (up ? "Crée ton accès avec l'e-mail de ton commerce." : "Connecte-toi pour suivre ton commerce.") + '</p>' +
      '<div class="form">' +
      '<label class="f"><span>✉️</span><input id="e" type="email" inputmode="email" placeholder="E-mail" autocomplete="email"></label>' +
      '<label class="f"><span>🔒</span><input id="p" type="password" placeholder="Mot de passe" autocomplete="' + (up ? "new-password" : "current-password") + '"></label>' +
      '<p class="err" id="er" hidden></p>' +
      '<button class="btn primary" id="go">' + (up ? "Créer mon accès" : "Se connecter") + '</button>' +
      (up ? "" : '<button class="btn g" id="forgot" style="margin-top:6px">Mot de passe oublié ?</button>') +
      '<div style="font-size:13.5px;color:var(--muted);margin-top:8px">' + (up ? "Déjà un accès ? " : "Pas encore d'accès ? ") + '<a class="tog" id="tog">' + (up ? "Se connecter" : "Créer mon accès") + '</a></div>' +
      '</div></div>';
    const err = m => { const e = document.getElementById("er"); if (e) { e.textContent = m; e.hidden = false; } };
    document.getElementById("tog").onclick = () => { MODE = up ? "in" : "up"; renderAuth(); };
    const fg = document.getElementById("forgot"); if (fg) fg.onclick = async () => { const m = (document.getElementById("e").value || "").trim(); if (!m) return err("Écris ton e-mail d'abord."); try { await auth.sendPasswordResetEmail(m, { url: location.origin + "/marchand/" }); toast("E-mail de réinitialisation envoyé 📧"); } catch (e) { err(authMsg(e)); } };
    document.getElementById("go").onclick = async () => {
      if (!auth) return err("Service indisponible.");
      const m = (document.getElementById("e").value || "").trim(), p = document.getElementById("p").value || "";
      const b = document.getElementById("go"); b.disabled = true;
      try { if (up) { if (p.length < 6) { b.disabled = false; return err("Mot de passe : 6 caractères minimum."); } await auth.createUserWithEmailAndPassword(m, p); } else { await auth.signInWithEmailAndPassword(m, p); } }
      catch (e) { b.disabled = false; err(authMsg(e)); }
    };
  }

  // ---------- trouver les commerces autorisés pour cet e-mail ----------
  async function trouverCommerces(email) {
    const map = {};
    const addSlug = async slug => {
      if (!slug || map[slug]) return;
      try { const m = await db.doc("settings/menu-" + slug).get(); const d = m.exists ? JSON.parse(m.data().json || "{}") : {}; const inf = d.infos || {}; map[slug] = { slug, nom: d.nom || slug, logo: d.logo || "", ouv: inf.ouv || "", ferm: inf.ferm || "" }; }
      catch (e) { map[slug] = { slug, nom: slug, logo: "", ouv: "", ferm: "" }; }
    };
    // 1) lien direct #m=<slug>
    const h = (location.hash.match(/m=([a-z0-9-]+)/) || [])[1];
    if (h) await addSlug(h);
    // 2) découverte par e-mail dans caisses.emails
    try {
      const snap = await db.collection("caisses").where("emails", "array-contains", email).get();
      for (const d of snap.docs) await addSlug(d.id);
    } catch (e) { /* règles / index : on garde au moins le lien direct */ }
    return Object.values(map);
  }

  // ---------- tableau de bord ----------
  function shell(shop, inner, extra) {
    const op = ouvert(shop.ouv, shop.ferm);
    const st = op === true ? '<span class="st o">● Ouvert</span>' : op === false ? '<span class="st f">● Fermé</span>' : "";
    const lg = shop.logo ? '<img class="lg" src="' + esc(shop.logo) + '" alt="">' : '<img class="lg" src="/assets/img/ncommandiw-logo.svg" alt="">';
    app.innerHTML =
      '<div class="bar">' + lg + '<div class="nm"><b>' + esc(shop.nom) + '</b><small>Espace commerçant</small></div>' + st +
      '<button class="out" id="out">Quitter</button></div>' +
      '<div class="pad" id="c">' + inner + '</div>' + (extra || "");
    const o = document.getElementById("out"); if (o) o.onclick = sortir;
  }
  function sortir() { if (SHOPS && SHOPS.length > 1) { history.replaceState(null, "", location.pathname); return choisir(); } auth.signOut(); }

  async function dashboard(shop) {
    shell(shop, '<div class="state"><div><div class="spin"></div></div></div>');
    let docs = [];
    try {
      const snap = await db.collection("commandes").doc(shop.slug).collection("liste").where("cree", ">=", debutJour()).orderBy("cree", "desc").limit(500).get();
      snap.forEach(d => { const o = d.data(); o.id = d.id; docs.push(o); });
    } catch (e) {
      shell(shop, '<div class="empty"><div><div class="em">⚠️</div><h2>Impossible de charger</h2><p>' + esc((e && e.message) || "Réessaie.") + '</p><button class="btn primary" id="rr" style="max-width:220px;margin:14px auto 0">Réessayer</button></div></div>');
      const r = document.getElementById("rr"); if (r) r.onclick = () => dashboard(shop); return;
    }
    const actives = docs.filter(o => o.statut !== "annulee");
    const finies = actives.filter(o => o.statut === "payee" || o.statut === "livree");
    const encours = actives.filter(o => o.statut !== "payee" && o.statut !== "livree");
    const ca = finies.reduce((s, o) => s + num(o.total), 0);
    const tiles =
      '<div class="tiles">' +
      '<div class="tile big"><div class="v">' + fmt(ca) + '</div><div class="k">💰 Chiffre d\'affaires<br>du jour (encaissé)</div></div>' +
      '<div class="tile"><div class="v">' + actives.length + '</div><div class="k">🧾 Commandes</div></div>' +
      '<div class="tile"><div class="v">' + encours.length + '</div><div class="k">⏳ En cours</div></div>' +
      '</div>';
    const liste = actives.length ? actives.map(o => {
      const md = MODES[o.mode] || ["🧾", ""];
      const sub = [md[1], o.mode === "place" || o.mode === "chambre" ? (o.table ? "Table " + esc(o.table) : "") : (o.nom ? esc(o.nom) : ""), "N° " + esc(o.num || "")].filter(Boolean).join(" · ");
      return '<div class="card"><span class="mi">' + md[0] + '</span><div class="mid"><b>' + fmt(o.total) + '</b><div class="sub">' + sub + '</div></div><div class="rt">' + statutBadge(o.statut) + '</div></div>';
    }).join("") : '<div class="empty" style="min-height:26vh"><div><div class="em">🌙</div><h2 style="font-size:17px">Aucune commande aujourd\'hui</h2><p>Les commandes du jour<br>s\'affichent ici.</p></div></div>';
    shell(shop,
      tiles + '<div class="sec">Commandes du jour <button class="refresh" id="rf">↻ Actualiser</button></div>' + liste,
      '<div class="cta"><a class="btn primary" href="/espace/pos.html#m=' + encodeURIComponent(shop.slug) + '">🧾 Ouvrir la caisse</a></div>');
    const rf = document.getElementById("rf"); if (rf) rf.onclick = () => dashboard(shop);
  }

  // ---------- choix du commerce (si plusieurs) ----------
  function choisir() {
    app.innerHTML = '<div class="bar"><img class="lg" src="/assets/img/ncommandiw-logo.svg" alt=""><div class="nm"><b>Mes commerces</b><small>Choisis un commerce</small></div><button class="out" id="out">Déconnexion</button></div>' +
      '<div class="pad">' + SHOPS.map(s => '<button class="pick" data-s="' + esc(s.slug) + '">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="">' : '<img src="/assets/img/ncommandiw-logo.svg" alt="">') + '<b>' + esc(s.nom) + '</b><span class="ar">›</span></button>').join("") + '</div>';
    document.getElementById("out").onclick = () => auth.signOut();
    app.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { const s = SHOPS.find(x => x.slug === b.dataset.s); location.hash = "m=" + s.slug; dashboard(s); });
  }

  async function demarrer() {
    app.innerHTML = '<div class="state"><div><div class="spin"></div>Chargement…</div></div>';
    SHOPS = await trouverCommerces(ME.email || "");
    if (!SHOPS.length) {
      app.innerHTML = '<div class="empty"><div><div class="em">🔒</div><h2>Accès pas encore prêt</h2><p>Le compte <b>' + esc(ME.email) + '</b> n\'est lié à aucun commerce. Demande à NFCWORK d\'ajouter ton e-mail à ton commerce.</p><button class="btn g" id="out" style="max-width:240px;margin:16px auto 0">Changer de compte</button></div></div>';
      const o = document.getElementById("out"); if (o) o.onclick = () => auth.signOut(); return;
    }
    const h = (location.hash.match(/m=([a-z0-9-]+)/) || [])[1];
    const direct = h && SHOPS.find(s => s.slug === h);
    if (direct) return dashboard(direct);
    if (SHOPS.length === 1) return dashboard(SHOPS[0]);
    choisir();
  }

  if (auth) {
    auth.onAuthStateChanged(u => { if (!u) { ME = null; SHOPS = null; renderAuth(); return; } ME = { uid: u.uid, email: u.email || "" }; demarrer(); });
  } else {
    renderAuth();
  }
})();
