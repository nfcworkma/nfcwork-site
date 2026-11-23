/* =========================================================
   NFCWORK — Apple Wallet, phase 2 (Firebase Functions, Node 20)
   Le Worker Cloudflare fabrique la carte (.pkpass). Ici :
   1) le « web service » Apple : les iPhones s'enregistrent pour recevoir les mises à jour d'une carte
   2) l'envoi des mises à jour (APNs, HTTP/2 + certificat Pass Type ID) :
      - quand les points d'une carte changent       → l'iPhone recharge la carte (« Vous avez 8 visites »)
      - quand le commerçant envoie un message        → toutes les cartes Apple du programme le reçoivent
   Secrets (firebase functions:secrets:set …) : APPLE_CERT, APPLE_KEY (PEM), APPLE_AUTH (même valeur que le Worker)
   Paramètres : APPLE_PASS_TYPE, WORKER (fichier .env de ce dossier)
   ========================================================= */
const { onRequest } = require("firebase-functions/v2/https");
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
  const cle = x => JSON.stringify([x.nom, x.couleur, x.objectif, x.unite, x.recompense, x.logoPng, x.lieux, x.lieuTexte, x.annonce, x.actif]);
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
    const cadeau = String(p.cadeauAnniv || "").trim();
    const t = `🎂 ${p.nom || "Nous"} vous souhaite un joyeux anniversaire ! ` + (cadeau ? `Votre cadeau : ${cadeau} 🎁` : "Une surprise vous attend 🎁");
    await c.ref.update({ msgWallet: { texte: datee(t).slice(0, 160), date: Date.now() } });
    n++;
  }
  console.log("anniversaires Apple :", n);
});
