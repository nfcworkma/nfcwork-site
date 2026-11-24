/* =========================================================
   NFCWORK — Apple Wallet, phase 2 (Firebase Functions, Node 22)
   Le Worker Cloudflare fabrique la carte (.pkpass). Ici :
   1) le « web service » Apple : les iPhones s'enregistrent pour recevoir les mises à jour d'une carte
   2) l'envoi des mises à jour (APNs, HTTP/2 + certificat Pass Type ID) :
      - quand les points d'une carte changent       → l'iPhone recharge la carte (« Vous avez 8 visites »)
      - quand le commerçant envoie un message        → toutes les cartes Apple du programme le reçoivent
   Secrets (firebase functions:secrets:set …) : APPLE_CERT, APPLE_KEY (PEM), APPLE_AUTH (même valeur que le Worker)
   Paramètres : APPLE_PASS_TYPE, WORKER (fichier .env de ce dossier)
   ========================================================= */
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
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

/* ---------- 1) web service Apple ---------- */
exports.apple = onRequest({ region: REGION, secrets: [APPLE_CERT, APPLE_KEY, APPLE_AUTH], cors: false, maxInstances: 5 }, async (req, res) => {
  try {
    const p = req.path.replace(/\/+$/, "").split("/").filter(Boolean);   // ex. v1/devices/<dev>/registrations/<type>/<serie>
    if (p[0] === "notifier" && req.method === "OPTIONS") p[0] = "annonce";   // même réponse CORS
    if (p[0] === "notifier" && req.method === "POST") return notifier(req, res);
    if (p[0] === "annonce" && req.method === "OPTIONS") return res.set({ "Access-Control-Allow-Origin": "https://nfcwork.ma", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" }).status(204).end();
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

/* ---------- 3) message du commerçant (« Aujourd'hui -20 % ») ---------- */
// vérifie que la personne connectée est le commerçant de ce programme (ou l'admin)
async function patron(req, res, pid) {
  res.set("Access-Control-Allow-Origin", "https://nfcwork.ma");
  const tok = String(req.get("Authorization") || "").replace(/^Bearer\s+/, "");
  let u; try { u = await admin.auth().verifyIdToken(tok); } catch (e) { res.status(401).json({ ok: false, erreur: "connexion" }); return null; }
  const ref = db.doc("fidProgrammes/" + nettoyer(pid)), p = await ref.get();
  if (!p.exists) { res.status(404).json({ ok: false }); return null; }
  const mail = String(u.email || "").toLowerCase();
  if (mail !== ADMIN && !(u.email_verified && mail === String(p.data().ownerEmail || "").toLowerCase())) { res.status(403).json({ ok: false }); return null; }
  return { ref, p: p.data() };
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
// La personne connectée doit être le gérant du commerce (e-mail vérifié = ownerEmail) ou l'admin NFC Work.
async function kiffyCommerce(auth, pid) {
  if (!auth || !auth.token) throw new HttpsError("unauthenticated", "Connectez-vous d’abord.");
  const mail = String(auth.token.email || "").toLowerCase(), verifie = auth.token.email_verified === true;
  const ref = db.doc("fidProgrammes/" + nettoyer(pid)), snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Commerce introuvable.");
  const p = snap.data(), estAdmin = verifie && mail === ADMIN;
  if (!estAdmin && !(verifie && mail === String(p.ownerEmail || "").toLowerCase())) throw new HttpsError("permission-denied", "Ce compte n’est pas celui du commerce.");
  return { ref, p, estAdmin };
}
// même clé de mois que l'Espace et les règles Firestore (« 202611 »)
const kiffyMois = () => { const d = new Date(); return String(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1); };

// +1 visite / cadeau offert / -1 point : seul chemin d'écriture de l'app Kiffy sur une carte
exports.kiffyVisite = onCall({ region: REGION, maxInstances: 10 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Connectez-vous d’abord.");
  const { cid, eid, action = "visite", montant } = req.data || {};
  if (!["visite", "cadeau", "retirer"].includes(action)) throw new HttpsError("invalid-argument", "Action inconnue.");
  const cref = db.doc("fidCartes/" + nettoyer(cid)), c0 = await cref.get();
  if (!c0.exists) throw new HttpsError("not-found", "Carte introuvable.");
  const { ref: pref, p } = await kiffyCommerce(req.auth, c0.data().pid);
  if (p.actif === false) throw new HttpsError("failed-precondition", "Ce commerce est en pause.");
  let emp = null;
  if (eid) {
    const e = await db.doc("fidEmployes/" + nettoyer(eid)).get();
    if (!e.exists || e.data().pid !== pref.id || e.data().actif === false) throw new HttpsError("invalid-argument", "Employé inconnu.");
    emp = { id: e.id, nom: String(e.data().nom || "").slice(0, 40) };
  }
  const obj = Math.max(1, parseInt(p.objectif, 10) || 10), mois = kiffyMois();
  return db.runTransaction(async t => {
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
});

// admin : crée (ou retrouve) le compte du gérant ; l'app envoie ensuite l'e-mail « choisir le mot de passe »
exports.kiffyAcces = onCall({ region: REGION, maxInstances: 3 }, async req => {
  const { p, estAdmin } = await kiffyCommerce(req.auth, (req.data || {}).pid);
  if (!estAdmin) throw new HttpsError("permission-denied", "Réservé à NFC Work.");
  const email = String(p.ownerEmail || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError("invalid-argument", "E-mail du gérant invalide.");
  let u = null, cree = false;
  try { u = await admin.auth().getUserByEmail(email); } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
  if (!u) { u = await admin.auth().createUser({ email, emailVerified: true, password: crypto.randomBytes(24).toString("base64url"), displayName: String(p.nom || "").slice(0, 60) }); cree = true; }
  else if (!u.emailVerified) await admin.auth().updateUser(u.uid, { emailVerified: true });   // NFC Work a vérifié l'e-mail avec le commerçant
  return { ok: true, email, cree };
});

// réglages que le gérant peut changer lui-même (le reste du programme reste réservé à l'admin)
const KIFFY_METIERS = /^(unie|barber|beaute|cafe|snack|resto|pizzeria|patisserie|glacier|vetement|pressing|hammam|sport|pharmacie|epicerie|telephone|gaming|billard|terrain|location|lavage|garage|autre)?$/;
exports.kiffyReglages = onCall({ region: REGION, maxInstances: 5 }, async req => {
  const { pid, champs } = req.data || {};
  const { ref } = await kiffyCommerce(req.auth, pid);
  const c = champs && typeof champs === "object" ? champs : {}, maj = {};
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
  return { ok: true };
});
