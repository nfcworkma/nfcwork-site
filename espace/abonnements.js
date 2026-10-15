/* =========================================================
   NFCWORK — ABONNEMENTS DES CLIENTS (admin seulement)
   Collection Firestore « abonnements » (lecture/écriture admin) :
     { client, tel, service: "menu"|"fid"|"autre", cible, libelle, prix, echeance: "AAAA-MM-JJ",
       auto, grace, actif, paiements: [{ date, mois, montant, mode }], createdAt }
   Le service lié reçoit :
     menu  → settings/menu-<slug>.json  { actif, expire }
     fid   → fidProgrammes/<pid>         { actif, expire }
   « expire » = échéance + jours de grâce : passé cette date, la page publique se coupe toute seule.
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

  const SERVICES = { menu: "Menu digital", fid: "Carte fidélité", profil: "Carte NFC · Avis Google · Wi-Fi", autre: "Autre (suivi des paiements)" };
  // lien d'une page client (nfcworkma.github.io/profils/<page>/) → nom de la page
  const pageDe = v => { const t = String(v || "").trim(); const m = t.match(/profils\/([^\/?#\s]+)/i); return (m ? m[1] : t.replace(/^https?:\/\/[^\/]+\//, "").replace(/\/.*$/, "")).toLowerCase().replace(/[^a-z0-9._-]/g, ""); };
  let user = null, abos = [], menus = [], progs = [], filtre = "tous";

  /* ---------- dates (jour local, format AAAA-MM-JJ) ---------- */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const auj = () => iso(new Date());
  const versDate = s => { const [y, m, j] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, j || 1); };
  const plusJours = (s, n) => { const d = versDate(s); d.setDate(d.getDate() + n); return iso(d); };
  const plusMois = (s, n) => { const d = versDate(s), j = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(j, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
  const ecart = s => Math.round((versDate(s) - versDate(auj())) / 864e5);   // jours avant l'échéance (négatif = en retard)
  const fr = s => s ? versDate(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const expireDe = a => (a.auto !== false ? plusJours(a.echeance, +a.grace || 0) : "");

  // état affiché
  function etat(a) {
    if (a.actif === false) return { k: "off", t: "Désactivé", c: "bad" };
    const j = ecart(a.echeance);
    if (j < 0 && a.auto !== false && j < -(+a.grace || 0)) return { k: "retard", t: `Coupé auto · ${-j} j de retard`, c: "bad" };
    if (j < 0) return { k: "retard", t: `En retard de ${-j} j`, c: "bad" };
    if (j <= 7) return { k: "bientot", t: j === 0 ? "À payer aujourd’hui" : `À payer dans ${j} j`, c: "warn" };
    return { k: "ok", t: "À jour", c: "ok" };
  }

  /* ---------- connexion ---------- */
  auth.onAuthStateChanged(async u => {
    user = u;
    if (!u) { renderLogin(); return; }
    if ((u.email || "").toLowerCase() !== ADMIN) { app.innerHTML = `<div class="empty"><h3>Accès réservé</h3><p>Cette page est réservée à l’administrateur NFCWORK.</p><a class="btn" href="./">Retour à l’Espace</a></div>`; return; }
    await charger(); rendre();
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

  async function charger() {
    try { const s = await db.collection("abonnements").get(); abos = s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
    catch (e) {
      console.error(e); abos = null;
      if (e && e.code === "permission-denied") { app.innerHTML = regleManquante(); return; }
    }
    try { const d = await db.doc("settings/menus").get(); menus = d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { menus = []; }
    try { const s = await db.collection("fidProgrammes").get(); progs = s.docs.map(d => Object.assign({ id: d.id }, d.data())); } catch (e) { progs = []; }
  }
  function regleManquante() {
    return `<div class="paper stack"><h3>Une petite règle Firebase à ajouter</h3>
      <p class="muted">Pour que les abonnements restent privés (visibles seulement par vous), ajoutez ce bloc dans Firebase → Firestore Database → Règles, juste avant « // Tout le reste est fermé », puis « Publier ».</p>
      <pre style="white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:12px;border:1px solid var(--line);font-size:13px">    match /abonnements/{id} {
      allow read, write: if isAdmin();
    }</pre></div>`;
  }

  /* ---------- liste ---------- */
  function rendre() {
    if (abos === null) return;
    const E = abos.map(a => [a, etat(a)]);
    const n = k => E.filter(([, e]) => e.k === k).length;
    const aEncaisser = E.filter(([, e]) => e.k !== "ok" && e.k !== "off").reduce((s, [a]) => s + (+a.prix || 0), 0);
    const parMois = abos.filter(a => a.actif !== false).reduce((s, a) => s + (+a.prix || 0), 0);
    const ordre = { retard: 0, bientot: 1, ok: 2, off: 3 };
    const vis = E.filter(([, e]) => filtre === "tous" || e.k === filtre).sort((x, y) => ordre[x[1].k] - ordre[y[1].k] || String(x[0].echeance).localeCompare(String(y[0].echeance)));
    app.innerHTML = `
      <div class="paper row between" style="gap:10px"><div><div class="muted" style="font-size:13px">Revenu mensuel actif</div><b style="font-family:var(--display);font-size:24px">${parMois.toLocaleString("fr-FR")} DH</b></div>
        <div style="text-align:end"><div class="muted" style="font-size:13px">À encaisser</div><b style="font-family:var(--display);font-size:24px;color:${aEncaisser ? "var(--warn)" : "var(--ok)"}">${aEncaisser.toLocaleString("fr-FR")} DH</b></div></div>
      <div class="stats">
        ${[["tous", "Tous", abos.length], ["retard", "En retard", n("retard")], ["bientot", "Bientôt", n("bientot")], ["off", "Désactivés", n("off")]].map(([k, t, v]) => `<button data-f="${k}" aria-pressed="${filtre === k}"><b>${v}</b><span>${t}</span></button>`).join("")}
      </div>
      <div class="alist">${vis.map(([a, e]) => ligne(a, e)).join("") || `<div class="empty paper"><h3>${abos.length ? "Rien ici" : "Aucun abonnement"}</h3><p>${abos.length ? "Aucun abonnement dans ce filtre." : "Ajoutez vos clients avec « ＋ Nouveau » : menu digital, carte fidélité, site…"}</p></div>`}</div>`;
  }
  function ligne(a, e) {
    const derniers = (a.paiements || []).slice(-3).reverse();
    return `<div class="arow ${e.k}" data-id="${esc(a.id)}">
      <div class="h"><div style="min-width:0"><b>${esc(a.client)}</b><div class="s">${esc(SERVICES[a.service] || "")}${a.libelle ? " · " + esc(a.libelle) : ""}</div></div><span class="pill ${e.c}">${esc(e.t)}</span></div>
      <div class="e"><strong>${(+a.prix || 0).toLocaleString("fr-FR")} DH</strong><span class="muted">/ mois</span><span class="muted">· échéance <b style="color:var(--fg)">${esc(fr(a.echeance))}</b></span></div>
      ${a.service === "profil" && a.cible ? `<div class="s" style="margin:-4px 0 6px">Page : ${esc(a.cible)}</div>` : ""}
      ${a.auto !== false && a.service !== "autre" ? `<div class="s" style="margin:-4px 0 10px">Coupure automatique ${+a.grace || 0} jour(s) après l’échéance si non payé</div>` : ""}
      <div class="acts">
        <button class="btn sm primary" data-act="payer">✅ Paiement reçu</button>
        ${a.actif === false ? `<button class="btn sm" data-act="activer">▶ Activer</button>` : `<button class="btn sm" data-act="desactiver">⏸ Désactiver</button>`}
        ${a.tel ? `<button class="btn sm" data-act="rappel">💬 Rappel</button>` : ""}
        <button class="btn sm ghost" data-act="modifier">Modifier</button>
      </div>
      ${derniers.length ? `<div class="hist">${derniers.map(p => `<span>✓ ${esc(fr(p.date))} · ${p.mois} mois · ${(+p.montant || 0).toLocaleString("fr-FR")} DH${p.mode ? " · " + esc(p.mode) : ""}</span>`).join("")}</div>` : ""}
    </div>`;
  }

  app.addEventListener("click", e => {
    const f = e.target.closest("[data-f]"); if (f) { filtre = f.dataset.f; rendre(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = abos.find(x => x.id === b.closest("[data-id]").dataset.id); if (!a) return;
    ({ payer: () => payer(a), activer: () => basculer(a, true), desactiver: () => basculer(a, false), rappel: () => rappel(a), modifier: () => formulaire(a) })[b.dataset.act]();
  });
  $("#nouveau").onclick = () => abos !== null && formulaire(null);

  /* ---------- service lié : actif + date de coupure ---------- */
  async function appliquer(a) {
    const vals = { actif: a.actif !== false, expire: expireDe(a) };
    if (a.service === "menu" && a.cible) {
      const ref = db.doc("settings/menu-" + a.cible), d = await ref.get();
      if (!d.exists) throw new Error("menu introuvable");
      const m = JSON.parse(d.data().json || "{}");
      m.actif = vals.actif; if (vals.expire) m.expire = vals.expire; else delete m.expire;
      await ref.set(Object.assign({}, d.data(), { json: JSON.stringify(m), v: String(Date.now()), maj: NOW(), par: user.email }));
      const i = menus.find(x => x.slug === a.cible);
      if (i) { i.actif = vals.actif; await db.doc("settings/menus").set({ json: JSON.stringify(menus), maj: NOW(), par: user.email }); }
    } else if (a.service === "fid" && a.cible) {
      await db.doc("fidProgrammes/" + a.cible).update({ actif: vals.actif, expire: vals.expire || "" });
    } else if (a.service === "profil" && a.cible) {
      // pages des cartes NFC, avis Google, Wi-Fi : liste publique des coupures (aucun nom ni prix dedans)
      const ref = db.doc("settings/coupures"), d = await ref.get();
      const c = d.exists ? JSON.parse(d.data().json || "{}") : {};
      c[a.cible] = vals.expire ? { actif: vals.actif, expire: vals.expire } : { actif: vals.actif };
      await ref.set({ json: JSON.stringify(c), maj: NOW() });
    }
  }
  async function enregistrer(a, msg) {
    const { id, ...data } = a;
    try {
      if (id) await db.doc("abonnements/" + id).set(data);
      else { const r = db.collection("abonnements").doc(); await r.set(Object.assign(data, { createdAt: NOW() })); a.id = r.id; abos.push(a); }
      await appliquer(a);
      toast(msg || "Enregistré ✓");
    } catch (e) {
      console.error(e);
      toast(e && e.code === "permission-denied" ? "Refusé par Firebase : ajoutez la règle « abonnements » (voir l’aide)." : e && e.message === "menu introuvable" ? "Abonnement enregistré, mais le menu lié est introuvable." : "Échec de l’enregistrement.", true);
    }
    rendre();
  }

  /* ---------- paiement ---------- */
  function payer(a) {
    let mois = 1;
    const d = fenetre(`<h2>Paiement reçu</h2><p class="muted" style="margin-top:2px">${esc(a.client)} · ${esc(SERVICES[a.service])}</p>
      <div class="stack" style="margin-top:12px">
        <div><div class="muted" style="font-size:13.5px;margin-bottom:6px">Nombre de mois payés</div>
          <div class="seg4">${[1, 3, 6, 12].map(m => `<button type="button" data-m="${m}" aria-pressed="${m === 1}">${m} mois</button>`).join("")}</div></div>
        <label class="f">Montant reçu (DH)<input id="p-mt" inputmode="decimal" value="${+a.prix || 0}"></label>
        <label class="f">Mode<select id="p-mode"><option>Espèces</option><option>Virement</option><option>CashPlus / Wafacash</option><option>Autre</option></select></label>
        <p class="muted" id="p-ech" style="font-size:14px"></p>
        <div class="row"><button class="btn primary" style="flex:1" id="p-ok">Valider le paiement</button><button class="btn ghost" data-fermer>Annuler</button></div>
      </div>`);
    // si très en retard, on repart d'aujourd'hui ; sinon on prolonge l'échéance (le cycle reste le même)
    const base = () => (ecart(a.echeance) < -31 ? auj() : a.echeance);
    const maj = () => { $("#p-ech", d).innerHTML = `Nouvelle échéance : <b style="color:var(--fg)">${esc(fr(plusMois(base(), mois)))}</b>`; };
    d.addEventListener("click", e => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      mois = +b.dataset.m; d.querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-pressed", x === b));
      $("#p-mt", d).value = (+a.prix || 0) * (mois === 12 ? 10 : mois); maj();
    });
    maj();
    $("#p-ok", d).onclick = async () => {
      a.paiements = (a.paiements || []).concat([{ date: auj(), mois, montant: +String($("#p-mt", d).value).replace(",", ".") || 0, mode: $("#p-mode", d).value }]);
      a.echeance = plusMois(base(), mois);
      a.actif = true;
      d.remove();
      await enregistrer(a, `Paiement enregistré ✓ Prochaine échéance : ${fr(a.echeance)}`);
    };
  }
  async function basculer(a, on) {
    if (!on && !confirm(`Désactiver « ${a.client} » ? ${a.service === "menu" ? "Le menu ne sera plus visible." : a.service === "fid" ? "La carte fidélité sera suspendue." : a.service === "profil" ? "La page (carte NFC, avis, Wi-Fi) affichera « Service momentanément indisponible »." : ""}`)) return;
    a.actif = on;
    if (on && a.auto !== false && ecart(a.echeance) < -(+a.grace || 0)) toast("Attention : l’échéance est dépassée, la coupure automatique reste active. Enregistrez un paiement pour réactiver.", true);
    await enregistrer(a, on ? "Activé ✓" : "Désactivé ⏸");
  }
  function rappel(a) {
    let t = String(a.tel || "").replace(/\D/g, ""); if (t.startsWith("00")) t = t.slice(2); if (t.startsWith("0")) t = "212" + t.slice(1);
    const j = ecart(a.echeance);
    const txt = `Bonjour ${a.client},\n\nVotre abonnement NFCWORK (${SERVICES[a.service]}${a.libelle ? " · " + a.libelle : ""}) ${j < 0 ? `est arrivé à échéance le ${fr(a.echeance)}` : `arrive à échéance le ${fr(a.echeance)}`} : ${(+a.prix || 0)} DH / mois.\n\nMerci de régler pour garder votre service actif.\n\nNFCWORK · nfcwork.ma`;
    window.open(`https://wa.me/${t}?text=${encodeURIComponent(txt)}`, "_blank");
  }

  /* ---------- créer / modifier ---------- */
  function formulaire(a) {
    const neuf = !a;
    a = a ? Object.assign({}, a) : { client: "", tel: "", service: "menu", cible: "", libelle: "", prix: 149, echeance: plusMois(auj(), 1), auto: true, grace: 5, actif: true, paiements: [] };
    const options = () => a.service === "menu" ? menus.map(m => [m.slug, `${m.nom} (${m.slug})`]) : a.service === "fid" ? progs.map(p => [p.id, p.nom || p.id]) : [];
    const d = fenetre(`<h2>${neuf ? "Nouvel abonnement" : "Modifier l’abonnement"}</h2>
      <form class="stack" id="af" style="margin-top:12px">
        <label class="f">Client (nom du commerce)<input id="a-client" required maxlength="60" value="${esc(a.client)}" placeholder="Lartisan"></label>
        <label class="f">Téléphone WhatsApp du client<input id="a-tel" type="tel" inputmode="tel" maxlength="20" value="${esc(a.tel)}" placeholder="06 12 34 56 78"></label>
        <label class="f">Service<select id="a-svc">${Object.entries(SERVICES).map(([k, v]) => `<option value="${k}" ${a.service === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <div id="a-cible-box"></div>
        <label class="f">Détail (facultatif)<input id="a-lib" maxlength="60" value="${esc(a.libelle)}" placeholder="Menu + Fidélité, site vitrine…"></label>
        <div class="grid2"><label class="f">Prix par mois (DH)<input id="a-prix" inputmode="decimal" value="${esc(a.prix)}"></label>
          <label class="f">Prochaine échéance<input id="a-ech" type="date" value="${esc(a.echeance)}" required></label></div>
        <div id="a-auto-box"><label class="check"><input type="checkbox" id="a-auto" ${a.auto !== false ? "checked" : ""}> Couper automatiquement si non payé</label>
          <label class="f" style="margin-top:8px">Jours de grâce après l’échéance<input id="a-grace" inputmode="numeric" value="${esc(a.grace)}"></label></div>
        <div class="row"><button class="btn primary" style="flex:1">${neuf ? "Ajouter" : "Enregistrer"}</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div>
        ${neuf ? "" : '<button type="button" class="btn danger sm" id="a-del">Supprimer cet abonnement</button>'}
      </form>`);
    const majCible = () => {
      a.service = $("#a-svc", d).value;
      const op = options();
      $("#a-cible-box", d).innerHTML = a.service === "autre" ? `<p class="muted" style="font-size:13px">Suivi des paiements uniquement : rien n’est coupé automatiquement.</p>`
        : a.service === "profil" ? `<label class="f">Lien de la page du client<input id="a-cible" value="${esc(a.cible ? "https://nfcworkma.github.io/profils/" + a.cible + "/" : "")}" placeholder="https://nfcworkma.github.io/profils/avis-la-fabrique/" autocapitalize="off" autocorrect="off" spellcheck="false"></label><p class="muted" style="font-size:12.5px;margin-top:-4px">Collez le lien de la carte NFC, de la page avis Google ou Wi-Fi.</p>`
        : `<label class="f">${a.service === "menu" ? "Menu concerné" : "Programme fidélité concerné"}<select id="a-cible"><option value="">— Choisir —</option>${op.map(([v, t]) => `<option value="${esc(v)}" ${a.cible === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
      $("#a-auto-box", d).hidden = a.service === "autre";
    };
    $("#a-svc", d).onchange = () => { a.cible = ""; majCible(); };
    majCible();
    const del = $("#a-del", d);
    if (del) del.onclick = async () => {
      if (!confirm(`Supprimer l’abonnement de « ${a.client} » ? (le service lié n’est pas modifié)`)) return;
      try { await db.doc("abonnements/" + a.id).delete(); abos = abos.filter(x => x.id !== a.id); d.remove(); rendre(); toast("Supprimé."); } catch (e) { toast("Échec de la suppression.", true); }
    };
    $("#af", d).onsubmit = async e => {
      e.preventDefault();
      a.client = $("#a-client", d).value.trim();
      a.tel = $("#a-tel", d).value.trim();
      a.cible = a.service === "autre" ? "" : a.service === "profil" ? pageDe(($("#a-cible", d) || {}).value) : (($("#a-cible", d) || {}).value || "");
      if (a.service !== "autre" && !a.cible) { toast(a.service === "profil" ? "Collez le lien de la page du client." : "Choisissez le menu ou le programme concerné."); return; }
      a.libelle = $("#a-lib", d).value.trim();
      a.prix = +String($("#a-prix", d).value).replace(",", ".") || 0;
      a.echeance = $("#a-ech", d).value || auj();
      a.auto = a.service !== "autre" && $("#a-auto", d).checked;
      a.grace = Math.max(0, Math.min(60, parseInt($("#a-grace", d).value, 10) || 0));
      d.remove();
      if (!neuf) { const i = abos.findIndex(x => x.id === a.id); if (i >= 0) abos[i] = a; }
      await enregistrer(a, neuf ? "Abonnement ajouté ✓" : "Enregistré ✓");
    };
  }

  function fenetre(html) {
    const d = document.createElement("div");
    d.className = "modal";
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d);
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-fermer]")) d.remove(); });
    return d;
  }
})();
