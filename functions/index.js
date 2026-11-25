/* =========================================================
   NFC WORK — Apple Wallet, phase 2 (Firebase Functions, Node 22)
   Le Worker Cloudflare fabrique la carte (.pkpass). Ici :
   1) le « web service » Apple : les iPhones s'enregistrent pour recevoir les mises à jour d'une carte
   2) l'envoi des mises à jour (APNs, HTTP/2 + certificat Pass Type ID) :
      - quand les points d'une carte changent       → l'iPhone recharge la carte (« Vous avez 8 visites »)
      - quand le commerçant envoie un message        → toutes les cartes Apple du programme le reçoivent
   Secrets (firebase functions:secrets:set …) : APPLE_CERT, APPLE_KEY (PEM), APPLE_AUTH (même valeur que le Worker)
   Paramètres : APPLE_PASS_TYPE, WORKER (fichier .env de ce dossier)
   ========================================================= */
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentCreated, onDocumentWrittenWithAuthContext } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const http2 = require("node:http2");
const crypto = require("node:crypto");

admin.initializeApp();
const db = admin.firestore();
const APPLE_CERT = defineSecret("APPLE_CERT"), APPLE_KEY = defineSecret("APPLE_KEY"), APPLE_AUTH = defineSecret("APPLE_AUTH");
const PASS_TYPE = defineString("APPLE_PASS_TYPE", { default: "pass.ma.nfcwork.fidelite" });
const WORKER = defineString("WORKER", { default: "https://nfcwork-wallet.nfcworkmacontact.workers.dev" });
const ADMIN = "nfcworkmacontact@gmail.com";
const REGION = "europe-west1";

// jeton propre à chaque carte (le Worker calcule le même avec le même secret)
const jeton = serie => crypto.createHmac("sha256", APPLE_AUTH.value()).update(serie).digest("hex").slice(0, 40);
const egal = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const regId = (dev, serie) => crypto.createHash("sha1").update(dev + "|" + serie).digest("hex");
const nettoyer = s => String(s || "").replace(/[^\w.-]/g, "").slice(0, 120);
// site + app Kiffy (iOS : capacitor://localhost, Android : https://localhost)
const ORIGINES = ["https://nfcwork.ma", "capacitor://localhost", "https://localhost"];
const origine = req => ORIGINES.includes(req.get("Origin")) ? req.get("Origin") : ORIGINES[0];

/* ---------- 1) web service Apple ---------- */
exports.apple = onRequest({ region: REGION, secrets: [APPLE_CERT, APPLE_KEY, APPLE_AUTH], cors: false, maxInstances: 5 }, async (req, res) => {
  try {
    const p = req.path.replace(/\/+$/, "").split("/").filter(Boolean);   // ex. v1/devices/<dev>/registrations/<type>/<serie>
    if (p[0] === "notifier" && req.method === "OPTIONS") p[0] = "annonce";   // même réponse CORS
    if (p[0] === "notifier" && req.method === "POST") return notifier(req, res);
    if (p[0] === "annonce" && req.method === "OPTIONS") return res.set({ "Vary": "Origin", "Access-Control-Allow-Origin": origine(req), "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" }).status(204).end();
    if (p[0] === "annonce" && req.method === "POST") return annonce(req, res);
    if (p[0] !== "v1") return res.status(404).end();
    if (p[1] === "log" && req.method === "POST") { console.log("apple log", JSON.stringify(req.body || {}).slice(0, 2000)); return res.status(200).end(); }
    const autorise = serie => egal(String(req.get("Authorization") || ""), "ApplePass " + jeton(serie));

    // enregistrer / désenregistrer un iPhone pour une carte
    if (p[1] === "devices" && p[3] === "registrations" && p.length === 6) {
      const dev = nettoyer(p[2]), type = p[4], serie = nettoyer(p[5]);
      if (type !== PASS_TYPE.value()) return res.status(404).end();
      if (!autorise(serie)) return res.status(401).end();
      const ref = db.doc("appleRegs/" + regId(dev, serie));
      if (req.method === "POST") {
        const pushToken = nettoyer((req.body || {}).pushToken);
        if (!pushToken) return res.status(400).end();
        const ex = await ref.get();
        await ref.set({ dev, serie, cid: serie.replace(/^c-/, ""), pushToken, maj: Date.now() }, { merge: true });
        return res.status(ex.exists ? 200 : 201).end();
      }
      if (req.method === "DELETE") { await ref.delete(); return res.status(200).end(); }
      return res.status(405).end();
    }
    // quelles cartes de cet iPhone ont changé ?
    if (p[1] === "devices" && p[3] === "registrations" && p.length === 5 && req.method === "GET") {
      const dev = nettoyer(p[2]); if (p[4] !== PASS_TYPE.value()) return res.status(404).end();
      const depuis = parseInt(req.query.passesUpdatedSince, 10) || 0;
      const s = await db.collection("appleRegs").where("dev", "==", dev).get();
      const series = s.docs.map(d => d.data()).filter(r => (r.maj || 0) > depuis).map(r => r.serie);
      if (!series.length) return res.status(204).end();
      return res.status(200).json({ serialNumbers: [...new Set(series)], lastUpdated: String(Date.now()) });
    }
    // la dernière version d'une carte (fabriquée par le Worker)
    if (p[1] === "passes" && p.length === 4 && req.method === "GET") {
      const serie = nettoyer(p[3]); if (p[2] !== PASS_TYPE.value()) return res.status(404).end();
      if (!autorise(serie)) return res.status(401).end();
      const r = await fetch(WORKER.value() + "/apple/pass?c=" + encodeURIComponent(serie.replace(/^c-/, "")));
      if (!r.ok) return res.status(r.status === 400 ? 404 : 500).end();
      res.set("Content-Type", "application/vnd.apple.pkpass").set("Last-Modified", new Date().toUTCString()).set("Cache-Control", "no-store");
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    }
    return res.status(404).end();
  } catch (e) { console.error(e); res.status(500).end(); }
});

/* ---------- 2) envoyer « cette carte a changé » aux iPhones (APNs) ---------- */
function apns(tokens) {
  return new Promise(ok => {
    if (!tokens.length) return ok([]);
    const s = http2.connect("https://api.push.apple.com", { cert: APPLE_CERT.value(), key: APPLE_KEY.value() });
    const res = []; let reste = tokens.length;
    const fin = () => { if (--reste === 0) { s.close(); ok(res); } };
    s.on("error", e => { console.error("apns", e.message); tokens.forEach(t => res.push({ t, st: 0 })); s.destroy(); ok(res); });
    for (const t of tokens) {
      const r = s.request({ ":method": "POST", ":path": "/3/device/" + t, "apns-topic": PASS_TYPE.value(), "apns-push-type": "background", "apns-priority": "5", "content-type": "application/json" });
      let st = 0; r.on("response", h => { st = h[":status"]; }); r.on("data", () => {});
      r.on("end", () => { res.push({ t, st }); fin(); }); r.on("error", () => { res.push({ t, st: 0 }); fin(); });
      r.end("{}");
    }
  });
}
async function pousser(regs) {
  if (!regs.length) return 0;
  const now = Date.now(), b = db.batch();
  regs.forEach(d => b.update(d.ref, { maj: now }));
  await b.commit();                                    // d'abord « a changé », ensuite le signal
  const r = await apns([...new Set(regs.map(d => d.data().pushToken))]);
  const morts = new Set(r.filter(x => x.st === 410 || x.st === 400).map(x => x.t));   // carte supprimée de l'iPhone
  for (const d of regs) if (morts.has(d.data().pushToken)) await d.ref.delete().catch(() => {});
  return r.filter(x => x.st === 200).length;
}

// points, nom, récompense… d'une carte changent → mise à jour sur l'iPhone
exports.appleCarte = onDocumentWritten({ document: "fidCartes/{cid}", region: REGION, secrets: [APPLE_CERT, APPLE_KEY] }, async ev => {
  const a = ev.data.before.exists ? ev.data.before.data() : null, n = ev.data.after.exists ? ev.data.after.data() : null;
  if (!a || !n) return;
  const cle = x => JSON.stringify([x.points || 0, x.nom || "", x.recompenses || 0, x.msgWallet || null]);
  if (cle(a) === cle(n)) return;
  const s = await db.collection("appleRegs").where("cid", "==", ev.params.cid).get();
  await pousser(s.docs);
});

// le programme change (nom, couleur, logo, objectif, message…) → toutes ses cartes Apple
exports.appleProgramme = onDocumentWritten({ document: "fidProgrammes/{pid}", region: REGION, secrets: [APPLE_CERT, APPLE_KEY] }, async ev => {
  const a = ev.data.before.exists ? ev.data.before.data() : null, n = ev.data.after.exists ? ev.data.after.data() : null;
  if (!a || !n) return;
  const cle = x => JSON.stringify([x.nom, x.couleur, x.objectif, x.unite, x.recompense, x.logoPng, x.lieux, x.lieuTexte, x.annonce, x.actif, x.fondMetier || ""]);
  if (cle(a) === cle(n)) return;
  const cartes = await db.collection("fidCartes").where("pid", "==", ev.params.pid).select().get();
  const ids = cartes.docs.map(d => d.id), regs = [];
  for (let i = 0; i < ids.length; i += 30) {
    const s = await db.collection("appleRegs").where("cid", "in", ids.slice(i, i + 30)).get();
    regs.push(...s.docs);
  }
  console.log("programme", ev.params.pid, "→", await pousser(regs), "iPhone(s)");
});

// admin : forcer la mise à jour des cartes Apple Wallet déjà installées (nouvelles icônes, nouveau design…)
// → écrire kiffyAdmin/walletRafraichir { pid?: commerce, cid?: une carte, t } ; sans pid ni cid : toutes les cartes
exports.walletRafraichir = onDocumentWritten({ document: "kiffyAdmin/walletRafraichir", region: REGION, secrets: [APPLE_CERT, APPLE_KEY] }, async ev => {
  const d = ev.data.after.exists ? ev.data.after.data() : null; if (!d) return;
  let regs = [];
  if (d.cid) regs = (await db.collection("appleRegs").where("cid", "==", nettoyer(d.cid)).get()).docs;
  else if (d.pid) {
    const ids = (await db.collection("fidCartes").where("pid", "==", nettoyer(d.pid)).select().get()).docs.map(x => x.id);
    for (let i = 0; i < ids.length; i += 30) regs.push(...(await db.collection("appleRegs").where("cid", "in", ids.slice(i, i + 30)).get()).docs);
  } else regs = (await db.collection("appleRegs").get()).docs;
  const n = await pousser(regs);
  console.log("walletRafraichir", d.pid || d.cid || "tout", regs.length, "→", n);
  await journal({ role: "admin", qui: ADMIN, action: "wallet", pid: d.pid || "", detail: `Cartes Apple Wallet mises à jour (${d.cid ? "une carte" : d.pid ? "un commerce" : "toutes"}) : ${regs.length} enregistrement(s), ${n} iPhone(s) prévenu(s)` });
});

/* ---------- 3) message du commerçant (« Aujourd'hui -20 % ») ---------- */
// vérifie que la personne connectée est le commerçant de ce programme (ou l'admin)
async function patron(req, res, pid) {
  res.set({ "Vary": "Origin", "Access-Control-Allow-Origin": origine(req) });
  const tok = String(req.get("Authorization") || "").replace(/^Bearer\s+/, "");
  let u; try { u = await admin.auth().verifyIdToken(tok); } catch (e) { res.status(401).json({ ok: false, erreur: "connexion" }); return null; }
  const ref = db.doc("fidProgrammes/" + nettoyer(pid)), p = await ref.get();
  if (!p.exists) { res.status(404).json({ ok: false }); return null; }
  const mail = String(u.email || "").toLowerCase();
  if (mail !== ADMIN && !(u.email_verified && mail === String(p.data().ownerEmail || "").toLowerCase())) { res.status(403).json({ ok: false }); return null; }
  return { ref, p: p.data(), mail, role: mail === ADMIN ? "admin" : "gerant" };
}
const texteMsg = (titre, texte) => [titre, texte].map(x => String(x || "").trim()).filter(Boolean).join(" — ").slice(0, 160);
// la date devant le message : il change toujours, donc l'iPhone notifie toujours
const datee = t => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Africa/Casablanca" }) + " · " + t;

async function annonce(req, res) {
  const { pid, titre, texte } = req.body || {};
  const x = await patron(req, res, pid); if (!x) return;
  const ref = x.ref;
  const t = texteMsg(titre, texte);
  if (!t) return res.status(400).json({ ok: false });
  await ref.update({ annonce: { texte: datee(t), date: Date.now() } });   // → appleProgramme envoie à tous les iPhones
  await journal({ role: x.role, qui: x.mail, action: "message", pid: ref.id, commerce: x.p.nom, detail: "À tous les clients : " + t });
  return res.json({ ok: true });
}

/* ---------- 4) message à quelques clients (relance des absents, anniversaire…) ---------- */
async function notifier(req, res) {
  const { pid, cartes, titre, texte } = req.body || {};
  const x = await patron(req, res, pid); if (!x) return;
  const t = texteMsg(titre, texte); if (!t) return res.status(400).json({ ok: false });
  const ids = [...new Set((Array.isArray(cartes) ? cartes : []).map(nettoyer).filter(Boolean))].slice(0, 200);
  let iphones = 0;
  for (const cid of ids) {
    const c = await db.doc("fidCartes/" + cid).get();
    if (!c.exists || c.data().pid !== x.ref.id) continue;                  // seulement les cartes de CE commerce
    const regs = await db.collection("appleRegs").where("cid", "==", cid).limit(1).get();
    if (regs.empty) continue;                                              // pas dans Apple Wallet : rien à faire
    await c.ref.update({ msgWallet: { texte: datee(t), date: Date.now() } });   // → appleCarte met à jour l'iPhone
    iphones++;
  }
  await journal({ role: x.role, qui: x.mail, action: "message", pid: x.ref.id, commerce: x.p.nom, detail: `À ${ids.length} client(s) : ${t}` });
  return res.json({ ok: true, iphones });
}

/* ---------- 5) 🎂 anniversaires automatiques, chaque matin ---------- */
// 🎂 message d'anniversaire : celui écrit par le commerçant ({prenom}, {cadeau}, {commerce}), sinon le texte par défaut
function texteAnniv(p, c) {
  const cadeau = String(p.cadeauAnniv || "").trim(), prenom = String(c.nom || "").trim().split(/\s+/)[0] || "";
  const modele = String(p.annivMessage || "").trim() || `${p.nom || "Nous"} vous souhaite un très joyeux anniversaire{ prenom} ! ` + (cadeau ? "Votre cadeau : {cadeau} — passez cette semaine 🎁" : "Passez cette semaine, une surprise vous attend 🎁");
  return modele.replace(/\{ prenom\}/g, prenom ? " " + prenom : "").replace(/\{prenom\}/gi, prenom).replace(/\{cadeau\}/gi, cadeau || "une surprise").replace(/\{commerce\}/gi, p.nom || "");
}

exports.appleAnniversaires = onSchedule({ schedule: "0 9 * * *", timeZone: "Africa/Casablanca", region: REGION }, async () => {
  const j = new Date().toLocaleDateString("fr-CA", { timeZone: "Africa/Casablanca" }).slice(5);   // « MM-JJ »
  const cartes = await db.collection("fidCartes").where("anniv", "==", j).get();
  const progs = {}; let n = 0;
  for (const c of cartes.docs) {
    const regs = await db.collection("appleRegs").where("cid", "==", c.id).limit(1).get();
    if (regs.empty) continue;
    const pid = c.data().pid;
    if (!(pid in progs)) { const p = await db.doc("fidProgrammes/" + nettoyer(pid)).get(); progs[pid] = p.exists ? p.data() : null; }
    const p = progs[pid];
    if (!p || p.actif === false || p.annivAuto === false) continue;
    const t = "🎂 " + texteAnniv(p, c.data());
    await c.ref.update({ msgWallet: { texte: datee(t).slice(0, 320), date: Date.now() } });
    n++;
  }
  console.log("anniversaires Apple :", n);
});

/* ---------- 6) 📱 Kiffy (app du commerçant, /kiffy/) ---------- */
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
// La personne connectée doit être le gérant du commerce (e-mail vérifié = ownerEmail) ou l'admin NFC WORK.
async function kiffyCommerce(auth, pid) {
  if (!auth || !auth.token) throw new HttpsError("unauthenticated", "Connectez-vous d’abord.");
  const mail = String(auth.token.email || "").toLowerCase(), verifie = auth.token.email_verified === true;
  const ref = db.doc("fidProgrammes/" + nettoyer(pid)), snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Commerce introuvable.");
  const p = snap.data(), estAdmin = verifie && mail === ADMIN;
  if (!estAdmin && !(verifie && mail === String(p.ownerEmail || "").toLowerCase())) throw new HttpsError("permission-denied", "Ce compte n’est pas celui du commerce.");
  return { ref, p, estAdmin };
}
// 📒 journal d'activité (lu par l'admin seulement) : qui a fait quoi, quand
async function journal(e) {
  try {
    await db.collection("kiffyJournal").add({ t: Timestamp.now(), role: e.role || "systeme", qui: String(e.qui || "").slice(0, 80), action: String(e.action || "").slice(0, 40),
      pid: String(e.pid || "").slice(0, 80), commerce: String(e.commerce || "").slice(0, 60), detail: String(e.detail || "").slice(0, 300) });
  } catch (x) { console.log("journal", x.message); }
}
const mailDe = auth => String((auth && auth.token && auth.token.email) || "").toLowerCase();
// même clé de mois que l'Espace et les règles Firestore (« 202611 »)
const kiffyMois = () => { const d = new Date(); return String(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1); };

// +1 visite / cadeau offert / -1 point : seul chemin d'écriture de l'app Kiffy sur une carte
exports.kiffyVisite = onCall({ region: REGION, maxInstances: 10 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Connectez-vous d’abord.");
  const { cid, eid, action = "visite", montant } = req.data || {};
  if (!["visite", "cadeau", "retirer"].includes(action)) throw new HttpsError("invalid-argument", "Action inconnue.");
  const cref = db.doc("fidCartes/" + nettoyer(cid)), c0 = await cref.get();
  if (!c0.exists) throw new HttpsError("not-found", "Carte introuvable.");
  const { ref: pref, p, estAdmin } = await kiffyCommerce(req.auth, c0.data().pid);
  if (p.actif === false) throw new HttpsError("failed-precondition", "Ce commerce est en pause.");
  let emp = null;
  if (eid) {
    const e = await db.doc("fidEmployes/" + nettoyer(eid)).get();
    if (!e.exists || e.data().pid !== pref.id || e.data().actif === false) throw new HttpsError("invalid-argument", "Employé inconnu.");
    emp = { id: e.id, nom: String(e.data().nom || "").slice(0, 40) };
  }
  const obj = Math.max(1, parseInt(p.objectif, 10) || 10), mois = kiffyMois();
  const r = await db.runTransaction(async t => {
    const c = (await t.get(cref)).data(), maintenant = Date.now(), pts = c.points || 0;
    const derniere = c.lastAt && c.lastAt.toMillis ? c.lastAt.toMillis() : 0;
    let n, maj;
    if (action === "visite") {
      if (maintenant - derniere < 60000) throw new HttpsError("already-exists", "Déjà ajouté il y a moins d’une minute.");
      n = p.type === "montant" ? Math.floor(Math.max(0, Number(montant) || 0) / Math.max(1, parseInt(p.dhParPoint, 10) || 10)) : 1;
      if (n < 1 || n > 1000) throw new HttpsError("invalid-argument", "Montant trop petit pour un point.");
      maj = { points: FieldValue.increment(n), total: FieldValue.increment(n), lastAt: Timestamp.now(), ["vm." + mois]: FieldValue.increment(n) };
    } else if (action === "cadeau") {
      if (pts < obj) throw new HttpsError("failed-precondition", "Pas encore assez de points pour le cadeau.");
      n = -obj; maj = { points: FieldValue.increment(-obj), recompenses: FieldValue.increment(1) };
    } else {
      if (pts < 1) throw new HttpsError("failed-precondition", "La carte n’a pas de point.");
      n = -1; maj = { points: FieldValue.increment(-1), total: FieldValue.increment(-1) };
    }
    maj.hist = [{ a: action, n, t: maintenant, e: emp ? emp.nom : "", eid: emp ? emp.id : "" }, ...(Array.isArray(c.hist) ? c.hist : [])].slice(0, 15);
    t.update(cref, maj);   // → appleCarte met à jour l'iPhone ; l'app appelle /google/sync pour Google Wallet
    if (emp && action === "visite") t.update(db.doc("fidEmployes/" + emp.id), { ["m." + mois]: FieldValue.increment(1), lastAt: Timestamp.now() });
    return { ok: true, points: pts + n, objectif: obj, nom: c.nom || "", n };
  });
  await journal({ role: emp ? "employe" : estAdmin ? "admin" : "gerant", qui: emp ? emp.nom : mailDe(req.auth), action, pid: pref.id, commerce: p.nom,
    detail: `${r.nom} · ${r.n > 0 ? "+" : ""}${r.n} → ${r.points}/${r.objectif}` });
  return r;
});

// admin : crée (ou retrouve) le compte du gérant ; l'app envoie ensuite l'e-mail « choisir le mot de passe »
exports.kiffyAcces = onCall({ region: REGION, maxInstances: 3 }, async req => {
  const { p, estAdmin } = await kiffyCommerce(req.auth, (req.data || {}).pid);
  if (!estAdmin) throw new HttpsError("permission-denied", "Réservé à NFC WORK.");
  const email = String(p.ownerEmail || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError("invalid-argument", "E-mail du gérant invalide.");
  let u = null, cree = false;
  try { u = await admin.auth().getUserByEmail(email); } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
  if (!u) { u = await admin.auth().createUser({ email, emailVerified: true, password: crypto.randomBytes(24).toString("base64url"), displayName: String(p.nom || "").slice(0, 60) }); cree = true; }
  else if (!u.emailVerified) await admin.auth().updateUser(u.uid, { emailVerified: true });   // NFC WORK a vérifié l'e-mail avec le commerçant
  await journal({ role: "admin", qui: ADMIN, action: "acces", pid: (req.data || {}).pid, commerce: p.nom, detail: (cree ? "Compte créé · " : "") + "accès envoyé à " + email });
  return { ok: true, email, cree };
});

// réglages que le gérant peut changer lui-même : récompense, objectif, anniversaire. Tout le design de la carte est réservé à NFC WORK.
const KIFFY_GERANT = ["recompense", "objectif", "cadeauAnniv", "annivMessage", "annivAuto"];
const KIFFY_METIERS = /^(unie|barber|beaute|cafe|snack|resto|pizzeria|patisserie|glacier|vetement|pressing|hammam|sport|pharmacie|epicerie|telephone|gaming|billard|terrain|location|lavage|garage|autre)?$/;
exports.kiffyReglages = onCall({ region: REGION, maxInstances: 5 }, async req => {
  const { pid, champs } = req.data || {};
  const { ref, p, estAdmin } = await kiffyCommerce(req.auth, pid);
  const c = champs && typeof champs === "object" ? champs : {}, maj = {};
  const interdits = Object.keys(c).filter(k => !KIFFY_GERANT.includes(k));
  if (!estAdmin && interdits.length) throw new HttpsError("permission-denied", "Contactez NFC WORK pour modifier la carte (" + interdits.slice(0, 4).join(", ") + ").");
  const txt = (k, n) => { if (k in c) maj[k] = String(c[k] || "").trim().slice(0, n); };
  txt("recompense", 80); txt("unite", 30); txt("cadeauAnniv", 80); txt("annivMessage", 300); txt("lieuTexte", 80);
  if ("objectif" in c) { const o = parseInt(c.objectif, 10); if (!(o >= 1 && o <= 1000)) throw new HttpsError("invalid-argument", "Objectif invalide."); maj.objectif = o; }
  if ("couleur" in c) { if (!/^#[0-9a-fA-F]{6}$/.test(String(c.couleur))) throw new HttpsError("invalid-argument", "Couleur invalide."); maj.couleur = String(c.couleur).toLowerCase(); }
  if ("annivAuto" in c) maj.annivAuto = c.annivAuto === true;
  if ("fondMetier" in c) { if (!KIFFY_METIERS.test(String(c.fondMetier || ""))) throw new HttpsError("invalid-argument", "Photo inconnue."); maj.fondMetier = String(c.fondMetier || ""); }
  if ("lienAvis" in c) maj.lienAvis = /^https:\/\/\S{8,300}$/.test(String(c.lienAvis || "").trim()) ? String(c.lienAvis).trim() : "";
  if (!Object.keys(maj).length) throw new HttpsError("invalid-argument", "Rien à enregistrer.");
  maj.maj = FieldValue.serverTimestamp();
  await ref.update(maj);
  await journal({ role: estAdmin ? "admin" : "gerant", qui: mailDe(req.auth), action: "reglages", pid: ref.id, commerce: p.nom, detail: Object.keys(maj).filter(k => k !== "maj").join(", ") });
  return { ok: true };
});

// admin : ajouter / retirer des points à la main, avec un motif (tracé dans la carte et le journal)
exports.kiffyAjuster = onCall({ region: REGION, maxInstances: 5 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Connectez-vous d’abord.");
  if (mailDe(req.auth) !== ADMIN || req.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Réservé à NFC WORK.");
  const { cid, n, motif } = req.data || {};
  if (!nettoyer(cid)) throw new HttpsError("invalid-argument", "Carte manquante.");
  const cref = db.doc("fidCartes/" + nettoyer(cid)), c0 = await cref.get();
  if (!c0.exists) throw new HttpsError("not-found", "Carte introuvable.");
  const { p, estAdmin } = await kiffyCommerce(req.auth, c0.data().pid);
  if (!estAdmin) throw new HttpsError("permission-denied", "Réservé à NFC WORK.");
  const k = parseInt(n, 10), m = String(motif || "").trim().slice(0, 120);
  if (!k || Math.abs(k) > 1000) throw new HttpsError("invalid-argument", "Nombre de points invalide.");
  if (m.length < 3) throw new HttpsError("invalid-argument", "Indiquez le motif.");
  const r = await db.runTransaction(async t => {
    const c = (await t.get(cref)).data(), pts = c.points || 0, tot = c.total || 0;
    if (pts + k < 0) throw new HttpsError("failed-precondition", `La carte n’a que ${pts} point(s).`);
    t.update(cref, { points: FieldValue.increment(k), total: FieldValue.increment(Math.max(-tot, k)),
      hist: [{ a: "ajust", n: k, t: Date.now(), e: "NFC WORK", eid: "", motif: m }, ...(Array.isArray(c.hist) ? c.hist : [])].slice(0, 15) });
    return { ok: true, points: pts + k, nom: c.nom || "" };
  });
  await journal({ role: "admin", qui: mailDe(req.auth), action: "points", pid: c0.data().pid, commerce: p.nom, detail: `${r.nom} · ${k > 0 ? "+" : ""}${k} · ${m}` });
  return r;
});

/* ---------- 7) 📲 app Kiffy (iOS / Android) : notifications et suppression du compte ---------- */
// un téléphone du commerce s'enregistre (jeton FCM) ; « retirer » à la déconnexion
exports.kiffyAppareil = onCall({ region: REGION, maxInstances: 5 }, async req => {
  if (!req.auth || req.auth.token.email_verified !== true) throw new HttpsError("unauthenticated", "Connectez-vous d’abord.");
  const { token, plateforme, retirer } = req.data || {};
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) throw new HttpsError("invalid-argument", "Jeton invalide.");
  const ref = db.doc("kiffyAppareils/" + crypto.createHash("sha256").update(token).digest("hex").slice(0, 40));
  if (retirer) { await ref.delete(); return { ok: true }; }
  await ref.set({ token, email: String(req.auth.token.email || "").toLowerCase(), plateforme: plateforme === "ios" ? "ios" : "android", maj: Timestamp.now() });
  return { ok: true };
});

// suppression du compte depuis l'app (exigence Apple) : compte effacé tout de suite, commerce mis en pause pour NFC WORK
exports.kiffySupprimerCompte = onCall({ region: REGION, maxInstances: 3 }, async req => {
  if (!req.auth || req.auth.token.email_verified !== true) throw new HttpsError("unauthenticated", "Connectez-vous d’abord.");
  const email = String(req.auth.token.email || "").toLowerCase();
  if (email === ADMIN) throw new HttpsError("permission-denied", "Le compte NFC WORK ne peut pas être supprimé ici.");
  const progs = await db.collection("fidProgrammes").where("ownerEmail", "==", email).get();
  for (const p of progs.docs) {
    await p.ref.update({ actif: false, suppressionDemandee: FieldValue.serverTimestamp() });
    await db.doc("fidSecrets/" + p.id).update({ pins: FieldValue.delete() }).catch(() => {});
  }
  const app = await db.collection("kiffyAppareils").where("email", "==", email).get();
  for (const d of app.docs) await d.ref.delete();
  await admin.auth().deleteUser(req.auth.uid);
  console.log("kiffy : compte supprimé", email, progs.size, "commerce(s)");
  return { ok: true, commerces: progs.size };
});

// logo du commerce pour l'image de la notification (même adresse versionnée que Google Wallet)
const vLogo = p => { const t = String(p.logoPng || p.logoData || p.logo || ""); let h = 5381; for (let i = 0; i < t.length; i += 7) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); };
const lienLogo = p => (p.logoPng || p.logoData) ? `${WORKER.value()}/logo/${nettoyer(p.id)}?v=${vLogo(p)}` : "";
// titre = nom du commerce ; Android : message « data » (l'app met le logo en grande icône) ; iOS : logo joint par l'extension
async function pushA(email, p, sujet, texte) {
  const s = await db.collection("kiffyAppareils").where("email", "==", String(email || "").toLowerCase()).get();
  return envoyerPush(s.docs, String(p.nom || "Kiffy").slice(0, 60), `${sujet} · ${texte}`, lienLogo(p));
}
async function envoyerPush(docs, titre, corps, logo) {
  if (!docs.length) return 0;
  const s = { docs };
  const messages = s.docs.map(d => { const { token, plateforme } = d.data(); return plateforme === "ios"
    ? { token, notification: { title: titre, body: corps }, apns: { payload: { aps: { sound: "default", mutableContent: true } }, ...(logo ? { fcmOptions: { imageUrl: logo } } : {}) } }
    : { token, data: { kiffy_titre: titre, kiffy_texte: corps, kiffy_logo: logo }, android: { priority: "high" } }; });
  const r = await admin.messaging().sendEach(messages);
  r.responses.forEach((x, i) => { if (!x.success && /not-registered|invalid-registration|invalid-argument/.test((x.error && x.error.code) || "")) s.docs[i].ref.delete().catch(() => {}); });
  return r.successCount;
}
// admin : notification à tous les gérants (ou à un seul, par e-mail) — rappel d'impayé, nouveauté…
exports.kiffyNotifGerants = onCall({ region: REGION, maxInstances: 3 }, async req => {
  if (!req.auth || req.auth.token.email_verified !== true || mailDe(req.auth) !== ADMIN) throw new HttpsError("permission-denied", "Réservé à NFC WORK.");
  const titre = String((req.data || {}).titre || "NFC WORK").trim().slice(0, 60) || "NFC WORK", texte = String((req.data || {}).texte || "").trim().slice(0, 240);
  const email = String((req.data || {}).email || "").trim().toLowerCase();
  if (!texte) throw new HttpsError("invalid-argument", "Écrivez le message.");
  const s = await db.collection("kiffyAppareils").get();
  const docs = s.docs.filter(d => d.data().email && d.data().email !== ADMIN && (!email || d.data().email === email));
  const envoyes = await envoyerPush(docs, titre, texte, "");
  await journal({ role: "admin", qui: ADMIN, action: "notification", detail: `${email || "tous les gérants"} · ${titre} — ${texte}`.slice(0, 300) });
  return { ok: true, appareils: docs.length, envoyes, gerants: new Set(docs.map(d => d.data().email)).size };
});

// 📒 équipe et codes PIN modifiés (depuis l'app ou l'Espace) → journal, avec l'auteur
const auteur = async ev => {
  if (ev.authType !== "app_user" || !ev.authId) return { role: "systeme", qui: "" };
  const u = await admin.auth().getUser(ev.authId).catch(() => null), m = String((u && u.email) || "").toLowerCase();
  return { role: m === ADMIN ? "admin" : "gerant", qui: m };
};
exports.kiffyJournalEquipe = onDocumentWrittenWithAuthContext({ document: "fidEmployes/{eid}", region: REGION }, async ev => {
  const a = ev.data.before.exists ? ev.data.before.data() : null, n = ev.data.after.exists ? ev.data.after.data() : null, x = n || a;
  const action = !a ? "Employé ajouté" : !n ? "Employé supprimé" : a.actif !== false && n.actif === false ? "Employé désactivé" : a.actif === false && n.actif !== false ? "Employé réactivé" : a.nom !== n.nom ? "Employé renommé" : "";
  if (!action || !x || !x.pid) return;
  const p = await programme(x.pid);
  await journal({ ...(await auteur(ev)), action: "equipe", pid: x.pid, commerce: p ? p.nom : "", detail: `${action} : ${x.nom || ev.params.eid}` });
});
exports.kiffyJournalPins = onDocumentWrittenWithAuthContext({ document: "fidSecrets/{pid}", region: REGION }, async ev => {
  const a = (ev.data.before.exists && ev.data.before.data().pins) || {}, n = (ev.data.after.exists && ev.data.after.data().pins) || {};
  const cles = [...new Set([...Object.keys(a), ...Object.keys(n)])].filter(k => a[k] !== n[k]);
  if (!cles.length) return;
  const noms = [];
  for (const k of cles) {
    if (k === "gerant") { noms.push("gérant" + (n[k] ? "" : " (effacé)")); continue; }
    const e = await db.doc("fidEmployes/" + nettoyer(k)).get().catch(() => null);
    noms.push(((e && e.exists && e.data().nom) || "employé") + (n[k] ? "" : " (retiré)"));
  }
  const p = await programme(ev.params.pid);
  await journal({ ...(await auteur(ev)), action: "pin", pid: ev.params.pid, commerce: p ? p.nom : "", detail: "Code PIN : " + noms.join(", ") });
});

const programme = async pid => { const d = await db.doc("fidProgrammes/" + nettoyer(pid)).get(); return d.exists ? { id: d.id, ...d.data() } : null; };
// début de la journée au Maroc (pour les bilans)
const debutJour = () => { const n = Date.now(), [h, m, s] = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(n).split(":").map(Number); return n - ((h * 60 + m) * 60 + s) * 1000; };
const prenomDe = nom => String(nom || "Un client").trim().split(/\s+/)[0];

// 🆕 un client vient de créer sa carte
exports.kiffyPushInscription = onDocumentCreated({ document: "fidCartes/{cid}", region: REGION }, async ev => {
  const c = ev.data && ev.data.data(); if (!c || !c.ownerEmail) return;
  const p = await programme(c.pid); if (!p) return;
  await pushA(c.ownerEmail, p, "Nouveau client", `${prenomDe(c.nom)} vient de créer sa carte.`).catch(e => console.log("push inscription", e.message));
  await journal({ role: "client", qui: prenomDe(c.nom), action: "inscription", pid: c.pid, commerce: p.nom, detail: "Nouvelle carte" });
});

// 🎂 le matin : les anniversaires du jour
exports.kiffyPushMatin = onSchedule({ schedule: "5 9 * * *", timeZone: "Africa/Casablanca", region: REGION }, async () => {
  const j = new Date().toLocaleDateString("fr-CA", { timeZone: "Africa/Casablanca" }).slice(5);
  const s = await db.collection("fidCartes").where("anniv", "==", j).get(), par = {};
  s.docs.forEach(d => { const c = d.data(); if (c.pid) (par[c.pid] = par[c.pid] || []).push(prenomDe(c.nom)); });
  for (const [pid, L] of Object.entries(par)) {
    const p = await programme(pid); if (!p || p.actif === false || !p.ownerEmail) continue;
    await pushA(p.ownerEmail, p, `${L.length} anniversaire${L.length > 1 ? "s" : ""} aujourd’hui`, L.slice(0, 4).join(", ") + (L.length > 4 ? "…" : "") + (p.annivAuto !== false ? " · le message part tout seul dans leur Wallet." : "")).catch(e => console.log("push matin", e.message));
  }
});

// 🌙 le soir : bilan de la journée (seulement s'il s'est passé quelque chose)
exports.kiffyPushSoir = onSchedule({ schedule: "0 20 * * *", timeZone: "Africa/Casablanca", region: REGION }, async () => {
  const t0 = debutJour(), emails = new Set((await db.collection("kiffyAppareils").get()).docs.map(d => d.data().email).filter(Boolean));
  for (const email of emails) {
    const progs = await db.collection("fidProgrammes").where("ownerEmail", "==", email).get();
    const s = await db.collection("fidCartes").where("ownerEmail", "==", email).get();
    for (const pd of progs.docs) {
      const p = { id: pd.id, ...pd.data() }; if (p.actif === false) continue;
      let visites = 0, nouveaux = 0, cadeaux = 0;
      s.docs.forEach(d => { const c = d.data(); if (c.pid !== p.id) return; if (c.createdAt && c.createdAt.toMillis() >= t0) nouveaux++; (c.hist || []).forEach(h => { if (h.t >= t0) { if (h.a === "visite") visites++; else if (h.a === "cadeau") cadeaux++; } }); });
      if (!visites && !nouveaux) continue;
      const bouts = [`${visites} visite${visites > 1 ? "s" : ""}`, nouveaux ? `${nouveaux} nouveau${nouveaux > 1 ? "x" : ""} client${nouveaux > 1 ? "s" : ""}` : "", cadeaux ? `${cadeaux} cadeau${cadeaux > 1 ? "x" : ""} offert${cadeaux > 1 ? "s" : ""}` : ""].filter(Boolean);
      await pushA(email, p, "Bilan du jour", bouts.join(" · ")).catch(e => console.log("push soir", e.message));
    }
  }
});
