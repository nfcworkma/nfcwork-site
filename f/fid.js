/* =========================================================
   NFCWORK — CARTE FIDÉLITÉ (pages publiques, sans application)
     /f/?p=<programme>            inscription du client (QR d'inscription, NFC…)
     /f/?c=<carte>                la carte du client (à ajouter à l'écran d'accueil) ; après une visite
                                  enregistrée par le commerçant, le client peut dire qui l'a servi (une fois)
     /f/?e=<employé>              QR d'un employé : il voit ses points du mois (lecture seule, aucun gain possible)
   Anti-triche : seuls le commerçant (son compte) ou une visite réelle donnent des points.
   Firestore (lecture/écriture par l'API REST, règles « Fidélité » dans firestore.rules) :
     fidProgrammes/{pid}  réglages du commerce (écrits par l'admin NFCWORK)
     fidCartes/{cid}      cartes clients
     fidEmployes/{eid}    employés, points par mois { m: { "202610": 12 } }
   ========================================================= */
(function () {
  "use strict";
  const P = "projects/nfcwork-espace/databases/(default)/documents";
  const API = "https://firestore.googleapis.com/v1/";
  const KEY = "AIzaSyDFJGerneuM-Og0Hs9IKIcFqVbLlS9Yqjc";   // clé web publique (la même que espace/config.js)
  const SITE = "https://nfcwork.ma";
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = new URLSearchParams(location.search);
  const clean = (v, n) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, n || 40);
  const pro = (() => { try { return localStorage.getItem("nfcwork-fid-pro") === "1" || localStorage.getItem("nfcwork-admin") === "1"; } catch (e) { return false; } })();
  const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  /* ---------- REST Firestore ---------- */
  const dec = v => {
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("nullValue" in v) return null;
    if ("mapValue" in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k in f) o[k] = dec(f[k]); return o; }
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
    return null;
  };
  const enc = v => typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
    : typeof v === "boolean" ? { booleanValue: v } : v && v.ts ? { timestampValue: v.ts } : { stringValue: String(v == null ? "" : v) };
  async function lire(chemin) {
    const r = await fetch(API + P + "/" + chemin + "?key=" + KEY, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("lecture " + r.status);
    const j = await r.json(), o = { id: chemin.split("/").pop() }; const f = j.fields || {};
    for (const k in f) o[k] = dec(f[k]);
    return o;
  }
  async function commit(writes) {
    const r = await fetch(API + P.replace(/\/documents$/, "/documents:commit") + "?key=" + KEY,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writes: Array.isArray(writes) ? writes : [writes] }) });
    if (!r.ok) { const t = await r.text().catch(() => ""); const e = new Error("écriture " + r.status); e.status = r.status; e.body = t; throw e; }
    return r.json();
  }
  const nomDoc = chemin => P + "/" + chemin;
  const rid = n => { const a = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; const c = crypto.getRandomValues(new Uint8Array(n)); for (const x of c) s += a[x % a.length]; return s; };
  const moisCle = d => String((d || new Date()).getUTCFullYear() * 100 + (d || new Date()).getUTCMonth() + 1);

  /* ---------- habillage ---------- */
  function theme(p) {
    const c = /^#[0-9a-f]{6}$/i.test(p.couleur || "") ? p.couleur : "#1e90ff";
    const n = parseInt(c.slice(1), 16), clair = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170;
    document.documentElement.style.setProperty("--accent", c);
    document.documentElement.style.setProperty("--on-accent", clair ? "#10131a" : "#fff");
    document.title = (p.nom || "Carte") + " · Fidélité";
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (m) m.content = p.nom || "Fidélité";
  }
  const logoSrc = p => /^data:image\//.test(p.logoData || "") ? p.logoData : /^https?:\/\//.test(p.logo || "") ? p.logo : "";
  const brand = p => `<div class="brand">${logoSrc(p) ? `<img class="lg" src="${esc(logoSrc(p))}" alt="">` : `<div class="ini">${esc((p.nom || "?").trim()[0].toUpperCase())}</div>`}
    <div><b>${esc(p.nom || "Commerce")}</b><small>Carte fidélité</small></div></div>`;
  const pied = `<div class="foot">Carte fidélité par <a href="${SITE}" target="_blank" rel="noopener"><b>NFCWORK</b></a></div>`;
  function etat(titre, texte, spin) { app.innerHTML = `<div class="state"><div>${spin ? '<div class="spin"></div>' : ""}${titre ? `<h1>${esc(titre)}</h1>` : ""}<div>${esc(texte || "")}</div></div></div>`; }
  const unite = p => p.unite || (p.type === "montant" ? "points" : p.type === "articles" ? "articles" : "visites");
  const regle = p => p.type === "montant" ? `${p.dhParPoint || 10} DH = 1 point · ${p.objectif} points = ${p.recompense}`
    : `${p.objectif} ${unite(p)} = ${p.recompense}`;
  const confirmeClient = p => p.employes && (p.modeEmploye === "confirme" || p.modeEmploye === "les2");
  const tsMs = v => v ? Date.parse(v) : 0;

  /* ---------- carte ---------- */
  let carte = null, prog = null, minuteur = null;
  function rendreCarte(msg, nouveau) {
    const p = prog, c = carte, obj = Math.max(1, p.objectif || 10), pts = c.points || 0, pret = pts >= obj;
    const tampons = p.type !== "montant" && obj <= 15;
    const reste = Math.max(0, obj - pts);
    app.innerHTML = `${brand(p)}
      ${msg ? `<div class="msg ${msg[0]}">${msg[1]}</div>` : ""}
      ${voteBloc()}
      ${pret ? `<div class="msg win">🎁 Bravo ! Votre récompense est prête : ${esc(p.recompense)}. Montrez cette carte à la caisse.</div>` : ""}
      <section class="card" aria-label="Carte fidélité">
        <div class="top"><div><div class="lbl">Membre</div><div class="who">${esc(c.nom)}</div></div><div class="lbl">${esc(p.nom)}</div></div>
        ${tampons ? `<div class="stamps">${Array.from({ length: obj }, (_, i) => `<div class="stamp${i < pts ? " on" : ""}${nouveau && i === pts - 1 ? " new" : ""}">${i < pts ? "★" : i === obj - 1 ? "🎁" : ""}</div>`).join("")}</div>`
          : `<div class="big">${pts} <small>/ ${obj} ${unite(p)}</small></div><div class="bar"><i style="width:${Math.min(100, pts / obj * 100)}%"></i></div>`}
        <div class="reward">🎁 <b>${esc(p.recompense)}</b> · ${pret ? "prête !" : `encore ${reste} ${unite(p)}`}${c.recompenses ? ` · déjà ${c.recompenses} gagnée${c.recompenses > 1 ? "s" : ""}` : ""}</div>
      </section>
      <div class="qrbox">${window.QRGEN.svg(SITE + "/f/?c=" + c.id, { marge: 1 })}<small>Montrez ce code à la caisse</small></div>
      <p class="tip">${esc(regle(p))}${p.guide ? "<br>" + p.guide.split(/\n+/).filter(Boolean).map(esc).join(" · ") : ""}</p>
      <p class="tip">📲 Gardez votre carte : <b>Partager</b> → <b>Sur l’écran d’accueil</b> (iPhone) ou <b>⋮</b> → <b>Ajouter à l’écran d’accueil</b> (Android).</p>
      ${pro ? `<div class="pro"><b>Espace commerçant</b><a class="btn primary" href="/espace/fidelite.html#c=${esc(c.id)}">Ouvrir cette carte (ajouter des points)</a></div>` : ""}
      ${pied}`;
  }
  // après une visite enregistrée par le commerçant : le client dit qui l'a servi (une seule fois)
  function voteBloc() {
    const c = carte;
    if (!confirmeClient(prog) || !c.voteDispo || tsMs(c.voteJusqua) < Date.now() || !Array.isArray(c.voteChoix) || !c.voteChoix.length) return "";
    return `<div class="paper" style="margin-bottom:14px"><h2 style="font-size:19px">Qui vous a servi ?</h2><p style="margin-bottom:12px">Un petit 👍 pour l’employé qui s’est occupé de vous.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${c.voteChoix.map(e => `<button class="btn" data-vote="${esc(e.id)}">👍 ${esc(e.nom)}</button>`).join("")}</div></div>`;
  }
  async function voter(eid) {
    const em = (carte.voteChoix || []).find(x => x.id === eid); if (!em) return;
    document.querySelectorAll("[data-vote]").forEach(b => (b.disabled = true));
    try {
      await commit([
        { update: { name: nomDoc("fidCartes/" + carte.id), fields: { voteDispo: enc(false), voteEmp: enc(eid) } }, updateMask: { fieldPaths: ["voteDispo", "voteEmp"] }, currentDocument: { exists: true } },
        { update: { name: nomDoc("fidEmployes/" + eid), fields: { lastCarte: enc(carte.id) } }, updateMask: { fieldPaths: ["lastCarte"] },
          updateTransforms: [{ fieldPath: "m.`" + moisCle() + "`", increment: { integerValue: "1" } }, { fieldPath: "lastAt", setToServerValue: "REQUEST_TIME" }], currentDocument: { exists: true } }]);
      carte.voteDispo = false; rendreCarte(["ok", `Merci ! +1 pour ${esc(em.nom)} 👍`]);
    } catch (e) {
      console.error(e); carte.voteDispo = false; rendreCarte(["info", "Merci ! Votre avis a déjà été pris en compte."]);
    }
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-vote]"); if (b && !b.disabled) voter(b.dataset.vote); });
  async function suivre() {
    clearInterval(minuteur);
    minuteur = setInterval(async () => {
      if (document.hidden) return;
      try {
        const n = await lire("fidCartes/" + carte.id); if (!n) return;
        const avant = carte.points || 0, voteAvant = carte.voteDispo; carte = n;
        if ((n.points || 0) > avant) rendreCarte(["ok", `✓ +${n.points - avant} ${n.points - avant > 1 ? unite(prog) : "point"} ajouté${n.points - avant > 1 ? "s" : ""}`], true);
        else if ((n.points || 0) < avant) rendreCarte(["ok", "🎁 Récompense utilisée. Merci et à bientôt !"]);
        else if (n.voteDispo !== voteAvant) rendreCarte();
      } catch (e) {}
    }, 8000);
  }
  async function ouvrirCarte(cid, msg, nouveau) {
    carte = await lire("fidCartes/" + cid);
    if (!carte) { etat("Carte introuvable", "Demandez une nouvelle carte au commerçant."); return; }
    prog = await lire("fidProgrammes/" + carte.pid);
    if (!prog) { etat("Programme introuvable", "Ce programme de fidélité n’existe plus."); return; }
    theme(prog); lsSet("nfcwork-fid-" + carte.pid, carte.id);
    if (!/[?&]c=/.test(location.search)) history.replaceState(null, "", "/f/?c=" + carte.id);
    rendreCarte(msg, nouveau); suivre();
  }

  /* ---------- inscription ---------- */
  async function inscription(pid) {
    prog = await lire("fidProgrammes/" + pid);
    if (!prog || prog.actif === false) { etat("Programme indisponible", "Ce programme de fidélité n’est pas actif pour l’instant."); return; }
    theme(prog);
    const deja = lsGet("nfcwork-fid-" + pid);
    if (deja) {
      const c = await lire("fidCartes/" + deja).catch(() => null);
      if (c) {
        await ouvrirCarte(deja); return;
      }
    }
    app.innerHTML = `${brand(prog)}
      <div class="paper"><h2>Votre carte fidélité</h2><p>${esc(regle(prog))}. C’est gratuit, sans application.</p>
      ${prog.guide ? `<ol style="color:var(--muted);margin:0 0 16px;padding-inline-start:20px;line-height:1.6">${prog.guide.split(/\n+/).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join("")}</ol>` : ""}
      <form id="jf"><label>Prénom<input id="jn" required maxlength="60" autocomplete="given-name"></label>
      <label>Téléphone<input id="jt" type="tel" inputmode="tel" required maxlength="30" autocomplete="tel" placeholder="06 12 34 56 78"></label>
      <p class="err" id="je"></p><button class="btn primary">Créer ma carte</button></form></div>
      <p class="tip">Vos informations servent seulement à votre carte chez ${esc(prog.nom)}.</p>${pied}`;
    document.getElementById("jf").onsubmit = async e => {
      e.preventDefault();
      const nom = document.getElementById("jn").value.trim(), tel = document.getElementById("jt").value.trim(), b = e.target.querySelector("button");
      if (!nom) return;
      if (tel.replace(/\D/g, "").length < 9) { document.getElementById("je").textContent = "Numéro de téléphone incomplet."; return; }
      b.disabled = true; b.textContent = "Création…";
      const cid = rid(20);
      try {
        await commit({ update: { name: nomDoc("fidCartes/" + cid), fields: {
            pid: enc(pid), ownerEmail: enc(prog.ownerEmail || ""), nom: enc(nom.slice(0, 60)), tel: enc(tel.slice(0, 30)),
            points: enc(0), total: enc(0), recompenses: enc(0), lastAt: enc({ ts: "1970-01-01T00:00:00Z" }) } },
          updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }], currentDocument: { exists: false } });
        lsSet("nfcwork-fid-" + pid, cid);
        await ouvrirCarte(cid, ["ok", "✓ Carte créée ! Montrez-la à la caisse à chaque visite."]);
      } catch (x) {
        console.error(x); b.disabled = false; b.textContent = "Créer ma carte";
        document.getElementById("je").textContent = "Impossible de créer la carte. Vérifiez la connexion et réessayez.";
      }
    };
  }

  /* ---------- employé : ses points du mois (lecture seule) ---------- */
  async function employe(eid) {
    const em = await lire("fidEmployes/" + eid);
    if (!em) { etat("Code inconnu", "Ce code employé n’existe pas."); return; }
    prog = await lire("fidProgrammes/" + em.pid);
    if (!prog) { etat("Programme introuvable", ""); return; }
    theme(prog);
    const d = new Date(), k = moisCle(d); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    const kp = moisCle(d), pts = (em.m || {})[k] || 0, prec = (em.m || {})[kp] || 0;
    const nom = kk => new Date(Date.UTC(+kk.slice(0, 4), +kk.slice(4) - 1, 1)).toLocaleDateString("fr-FR", { month: "long" });
    app.innerHTML = `${brand(prog)}
      <div class="paper emp"><div class="av">${esc((em.nom || "?").trim()[0].toUpperCase())}</div>
        <h2>${esc(em.nom)}</h2><p>${esc(prog.nom)}${prog.primeEmploye ? `<br>🏆 ${esc(prog.primeEmploye)}` : ""}</p>
        <div class="card" style="text-align:center"><div class="lbl">Mes points · ${esc(nom(k))}</div><div class="big" style="margin-top:8px">${pts}</div></div>
        <p class="tip">${prec ? `${esc(nom(kp))} : ${prec} points<br>` : ""}Un point par client servi, enregistré à la caisse ou confirmé par le client.</p></div>
      ${pro ? `<div class="pro"><b>Espace commerçant</b><a class="btn primary" href="/espace/fidelite.html#e=${esc(eid)}">Voir dans l’Espace</a></div>` : ""}
      ${pied}`;
  }

  /* ---------- aiguillage ---------- */
  const c = clean(qs.get("c")), p = clean(qs.get("p")), e = clean(qs.get("e"));
  (c ? ouvrirCarte(c) : p ? inscription(p) : e ? employe(e) : Promise.resolve(etat("Carte fidélité", "Scannez le QR de votre commerce pour obtenir votre carte.")))
    .catch(err => { console.error(err); etat("Connexion impossible", "Vérifiez votre connexion Internet et réessayez."); });
})();
