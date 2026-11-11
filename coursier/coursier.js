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
      '<div class="auth"><img class="ic" src="/assets/img/ncommandiw-logo.svg" alt="">' +
      '<h1>Espace livreur 🛵</h1>' +
      '<p class="sub">' + (up ? "Crée ton compte avec l'e-mail donné par Ncommandiw." : "Connecte-toi pour voir tes livraisons.") + '</p>' +
      '<div class="form">' +
      '<label class="f"><span>✉️</span><input id="e" type="email" inputmode="email" placeholder="E-mail" autocomplete="email"></label>' +
      '<label class="f"><span>🔒</span><input id="p" type="password" placeholder="Mot de passe" autocomplete="' + (up ? "new-password" : "current-password") + '"></label>' +
      '<p class="err" id="er" hidden></p>' +
      '<button class="btn primary" id="go">' + (up ? "Créer mon compte" : "Se connecter") + '</button>' +
      (up ? "" : '<button class="btn g" id="forgot" style="margin-top:6px">Mot de passe oublié ?</button>') +
      '<div style="font-size:13.5px;color:var(--muted);margin-top:8px">' + (up ? "Déjà un compte ? " : "Pas encore de compte ? ") + '<a class="tog" id="tog">' + (up ? "Se connecter" : "Créer un compte") + '</a></div>' +
      '</div></div>';
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
    if (!docs.length) {
      shell('<div class="empty"><div><div class="em">✅</div><h2>Aucune livraison en cours</h2><p>Tes nouvelles livraisons<br>apparaîtront ici.</p><button class="btn g" id="rr" style="max-width:220px;margin:14px auto 0">Actualiser</button></div></div>');
      const r = document.getElementById("rr"); if (r) r.onclick = charger; return;
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
    shell('<div class="sec">' + docs.length + ' livraison' + (docs.length > 1 ? "s" : "") + ' en cours <button class="refresh" id="rf">↻ Actualiser</button></div>' + cards);
    const rf = document.getElementById("rf"); if (rf) rf.onclick = charger;
  }

  if (auth) {
    auth.onAuthStateChanged(u => { if (!u) { ME = null; renderAuth(); return; } ME = { uid: u.uid, email: u.email || "" }; charger(); });
  } else {
    renderAuth();
  }
})();
