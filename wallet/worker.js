/* =========================================================
   NFCWORK — SERVEUR WALLET (Cloudflare Worker, gratuit)
   Les cartes fidélité dans Google Wallet (Apple Wallet : plus tard, même serveur).

   À coller dans Cloudflare → Workers → nfcwork-wallet → « Modifier le code ».
   Réglages du Worker (Settings → Variables and Secrets) :
     ISSUER_ID   (texte)   l'Issuer ID de Google Pay & Wallet Console
     GOOGLE_SA   (secret)  TOUT le contenu du fichier .json du compte de service
   Aucun secret dans ce fichier : il peut être public.

   Apple Wallet (compte Apple Developer) — Settings → Variables and Secrets :
     APPLE_PASS_TYPE (texte)   ex. pass.ma.nfcwork.fidelite   (le Pass Type ID créé chez Apple)
     APPLE_TEAM_ID   (texte)   le Team ID (10 caractères, page Membership)
     APPLE_CERT      (secret)  le certificat Pass Type ID en PEM (-----BEGIN CERTIFICATE-----)
     APPLE_KEY       (secret)  sa clé privée en PEM PKCS#8 (-----BEGIN PRIVATE KEY-----)
     APPLE_WWDR      (secret)  le certificat Apple WWDR G4 en PEM
     APPLE_AUTH      (secret)  un mot de passe long au hasard — le même dans Firebase (mises à jour auto)
     APPLE_WS        (texte)   l'adresse du service web Firebase, ex. https://europe-west1-nfcwork-espace.cloudfunctions.net/apple

   Adresses :
     GET  /apple/pass?c=<carte>      → la carte en fichier .pkpass (s'ouvre dans Apple Wallet)
     GET  /apple/etat                → { pret: true } quand Apple Wallet est configuré
     GET  /google/save?c=<carte>     → ajoute la carte dans Google Wallet (redirige vers Google)
     GET  /google/sync?c=<carte>     → met à jour les points dans Wallet (lit la vraie carte dans Firebase)
     POST /google/message            → notification à tous les clients du programme (commerçant connecté), offre datée possible (fin)
     POST /google/notify             → notification à quelques clients choisis (absents, anniversaires…)
     GET  /logo/<programme>          → logo du commerce (Google a besoin d'une adresse https)
   ========================================================= */
const PROJET = "nfcwork-espace";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJET}/databases/(default)/documents/`;
const FS_KEY = "AIzaSyDFJGerneuM-Og0Hs9IKIcFqVbLlS9Yqjc";   // clé web publique (la même que le site)
const ADMIN = "nfcworkmacontact@gmail.com";
const SITE = "https://nfcwork.ma";
const WO = "https://walletobjects.googleapis.com/walletobjects/v1/";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
    try {
      if (url.pathname === "/google/save") return await save(url, env);
      if (url.pathname === "/google/sync") return json(await sync(url.searchParams.get("c"), env));
      if (url.pathname === "/google/message" && req.method === "POST") return json(await message(req, env));
      if (url.pathname === "/google/notify" && req.method === "POST") return json(await notifier(req, env));
      if (url.pathname.startsWith("/logo/")) return await logo(url.pathname.slice(6));
      if (url.pathname === "/apple/pass") return await applePass(url, env);
      if (url.pathname === "/apple/etat") return json({ ok: true, pret: appleConfig(env, true) });
      return json({ ok: true, service: "nfcwork-wallet" });
    } catch (e) {
      const m = String(e && e.message || e);
      if (url.pathname === "/google/save" || url.pathname === "/apple/pass") return page("Impossible d’ajouter la carte", "Réessayez dans un instant. (" + m.slice(0, 120) + ")");
      return json({ ok: false, erreur: m }, e.status || 500);
    }
  },
  // ⏰ tous les jours : anniversaires du jour → message automatique dans Google Wallet
  async scheduled(event, env, ctx) {
    ctx.waitUntil(anniversairesAuto(env).catch(e => console.log("anniv auto:", String(e && e.message || e))));
  }
};

/* ---------- réponses ---------- */
const cors = () => ({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" });
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json", ...cors() } });
const page = (t, m) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#05080f;color:#e9effa;font-family:system-ui;text-align:center;padding:24px"><div><h2>${t}</h2><p style="color:#93a3be">${m}</p></div>`, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
const err = (m, s) => Object.assign(new Error(m), { status: s });
const propre = (v, n) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, n || 40);

/* ---------- Firebase (lecture publique, comme le site) ---------- */
function dec(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) { const o = {}; for (const k in v.mapValue.fields || {}) o[k] = dec(v.mapValue.fields[k]); return o; }
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
async function lire(chemin) {
  const r = await fetch(FS + chemin + "?key=" + FS_KEY);
  if (r.status === 404) return null;
  if (!r.ok) throw err("Firebase " + r.status, 502);
  const j = await r.json(), o = { id: chemin.split("/").pop() };
  for (const k in j.fields || {}) o[k] = dec(j.fields[k]);
  return o;
}
// requête simple : une collection où <champ> == <valeur>
async function requete(collection, champ, valeur, limite) {
  const r = await fetch(FS.replace(/\/$/, "") + ":runQuery?key=" + FS_KEY, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: champ }, op: "EQUAL", value: { stringValue: String(valeur) } } }, limit: limite || 500 } })
  });
  if (!r.ok) throw err("Firebase query " + r.status, 502);
  const a = await r.json();
  return (Array.isArray(a) ? a : []).filter(x => x.document).map(x => { const o = { id: x.document.name.split("/").pop() }; for (const k in x.document.fields || {}) o[k] = dec(x.document.fields[k]); return o; });
}
async function carteEtProg(cid) {
  cid = propre(cid);
  if (!cid) throw err("carte manquante", 400);
  const c = await lire("fidCartes/" + cid);
  if (!c) throw err("carte introuvable", 404);
  const p = await lire("fidProgrammes/" + propre(c.pid, 60));
  if (!p) throw err("programme introuvable", 404);
  return { c, p };
}

/* ---------- signature RS256 (compte de service Google) ---------- */
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uTxt = s => b64u(new TextEncoder().encode(s));
let CLE = null, JETON = null;
function compte(env) {
  if (!env.GOOGLE_SA) throw err("GOOGLE_SA manquant dans les réglages du Worker", 500);
  if (!env.ISSUER_ID) throw err("ISSUER_ID manquant dans les réglages du Worker", 500);
  return JSON.parse(env.GOOGLE_SA);
}
async function cle(sa) {
  if (CLE) return CLE;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));
  CLE = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return CLE;
}
async function signer(sa, charge) {
  const t = b64uTxt(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64uTxt(JSON.stringify(charge));
  const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await cle(sa), new TextEncoder().encode(t));
  return t + "." + b64u(s);
}
async function jeton(env) {
  const sa = compte(env), now = Math.floor(Date.now() / 1000);
  if (JETON && JETON.exp > now + 60) return JETON.t;
  const a = await signer(sa, { iss: sa.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + a });
  const j = await r.json();
  if (!j.access_token) throw err("connexion Google refusée : " + (j.error_description || j.error || r.status), 502);
  JETON = { t: j.access_token, exp: now + (j.expires_in || 3600) };
  return JETON.t;
}
async function wo(env, methode, chemin, corps) {
  const r = await fetch(WO + chemin, { method: methode, headers: { Authorization: "Bearer " + await jeton(env), "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
  const t = await r.text();
  return { status: r.status, j: t ? JSON.parse(t) : {} };
}

/* ---------- la carte dans Google Wallet ---------- */
const couleur = p => /^#[0-9a-f]{6}$/i.test(p.couleur || "") ? p.couleur : "#1e90ff";
const unite = p => p.unite || (p.type === "montant" ? "points" : p.type === "articles" ? "articles" : "visites");
const idClasse = (env, p) => `${env.ISSUER_ID}.fid-${propre(p.id, 60)}`;
const idObjet = (env, c) => `${env.ISSUER_ID}.c-${propre(c.id)}`;
// empreinte du logo : quand il change, l'adresse change → Google recharge l'image
const vLogo = p => { const t = String(p.logoPng || p.logoData || p.logo || ""); let h = 5381; for (let i = 0; i < t.length; i += 7) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); };
function classe(env, p, base) {
  return {
    id: idClasse(env, p),
    issuerName: String(p.nom || "Commerce").slice(0, 60),
    programName: "Carte fidélité",
    programLogo: { sourceUri: { uri: base + "/logo/" + propre(p.id, 60) + "?v=" + vLogo(p) }, contentDescription: { defaultValue: { language: "fr-FR", value: String(p.nom || "Logo") } } },
    hexBackgroundColor: couleur(p),
    reviewStatus: "UNDER_REVIEW",
    countryCode: "MA"
  };
}
function objet(env, c, p) {
  const obj = Math.max(1, p.objectif || 10), pts = c.points || 0, u = unite(p);
  return {
    id: idObjet(env, c), classId: idClasse(env, p), state: "ACTIVE",
    accountId: (c.tel || c.id).replace(/\s/g, "").slice(-12), accountName: String(c.nom || "Client").slice(0, 60),
    loyaltyPoints: { label: u.charAt(0).toUpperCase() + u.slice(1), balance: { int: pts } },
    secondaryLoyaltyPoints: { label: "Objectif", balance: { string: pts >= obj ? "🎁 Récompense prête !" : `${pts} / ${obj}` } },
    barcode: { type: "QR_CODE", value: SITE + "/f/?c=" + c.id },
    hexBackgroundColor: couleur(p),
    textModulesData: [{ id: "recompense", header: "Récompense", body: `${obj} ${u} = ${p.recompense || "une récompense"}` }],
    linksModuleData: { uris: [{ id: "carte", uri: SITE + "/f/?c=" + c.id, description: "Ouvrir ma carte" }] }
  };
}
async function preparer(env, c, p, base) {
  const k = classe(env, p, base);
  let r = await wo(env, "POST", "loyaltyClass", k);
  if (r.status === 409) r = await wo(env, "PATCH", "loyaltyClass/" + encodeURIComponent(k.id), k);
  if (r.status >= 300) throw err("classe : " + ((r.j.error || {}).message || r.status), 502);
  const o = objet(env, c, p);
  r = await wo(env, "POST", "loyaltyObject", o);
  if (r.status === 409) r = await wo(env, "PATCH", "loyaltyObject/" + encodeURIComponent(o.id), o);
  if (r.status >= 300) throw err("carte : " + ((r.j.error || {}).message || r.status), 502);
  return o.id;
}
async function save(url, env) {
  const { c, p } = await carteEtProg(url.searchParams.get("c"));
  if (p.actif === false) throw err("programme en pause", 403);
  const oid = await preparer(env, c, p, url.origin);
  const sa = compte(env);
  const jwt = await signer(sa, { iss: sa.client_email, aud: "google", typ: "savetowallet", origins: [SITE, "https://www.nfcwork.ma"], payload: { loyaltyObjects: [{ id: oid }] } });
  return Response.redirect("https://pay.google.com/gp/v/save/" + jwt, 302);
}
// la vérité, c'est Firebase : on relit la carte et on recopie ses points (personne ne peut tricher par ici)
async function sync(cid, env) {
  const { c, p } = await carteEtProg(cid);
  const o = objet(env, c, p);
  const r = await wo(env, "PATCH", "loyaltyObject/" + encodeURIComponent(o.id), { loyaltyPoints: o.loyaltyPoints, secondaryLoyaltyPoints: o.secondaryLoyaltyPoints, accountName: o.accountName, textModulesData: o.textModulesData, hexBackgroundColor: o.hexBackgroundColor });
  return { ok: r.status < 300, dansWallet: r.status !== 404 };
}

/* ---------- 📣 message à tous les clients du programme ---------- */
let JWK = null;
async function verifierFirebase(tok) {
  const [h, c, s] = String(tok || "").split(".");
  if (!s) throw err("non connecté", 401);
  const hd = JSON.parse(atob(h.replace(/-/g, "+").replace(/_/g, "/"))), cl = JSON.parse(decodeURIComponent(escape(atob(c.replace(/-/g, "+").replace(/_/g, "/")))));
  if (!JWK || JWK.exp < Date.now()) { const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"); JWK = { keys: (await r.json()).keys, exp: Date.now() + 3600e3 }; }
  const k = JWK.keys.find(x => x.kid === hd.kid);
  if (!k) throw err("session expirée : reconnectez-vous", 401);
  const pub = await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - s.length % 4) % 4)), ch => ch.charCodeAt(0));
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pub, sig, new TextEncoder().encode(h + "." + c));
  const now = Date.now() / 1000;
  if (!ok || cl.aud !== PROJET || cl.iss !== "https://securetoken.google.com/" + PROJET || cl.exp < now) throw err("session invalide : reconnectez-vous", 401);
  return { email: String(cl.email || "").toLowerCase(), verifie: !!cl.email_verified };
}
async function message(req, env) {
  const qui = await verifierFirebase((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  const b = await req.json().catch(() => ({}));
  const p = await lire("fidProgrammes/" + propre(b.pid, 60));
  if (!p) throw err("programme introuvable", 404);
  const patron = qui.email === ADMIN || (qui.verifie && qui.email && qui.email === String(p.ownerEmail || "").toLowerCase());
  if (!patron) throw err("réservé au commerçant de ce programme", 403);
  const titre = String(b.titre || "").trim().slice(0, 60), texte = String(b.texte || "").trim().slice(0, 400);
  if (!titre || !texte) throw err("titre et message obligatoires", 400);
  const debut = new Date(), j = /^\d{4}-\d{2}-\d{2}$/.test(b.fin || "") ? new Date(b.fin + "T23:59:00Z") : null;
  const fin = j && j > debut && j - debut < 90 * 86400e3 ? j : new Date(Date.now() + 7 * 86400e3);
  const r = await wo(env, "POST", "loyaltyClass/" + encodeURIComponent(idClasse(env, p)) + "/addMessage", {
    message: { id: "m" + Date.now(), header: titre, body: texte, messageType: "TEXT_AND_NOTIFY", displayInterval: { start: { date: debut.toISOString() }, end: { date: fin.toISOString() } } }
  });
  if (r.status === 404) throw err("aucun client n’a encore ajouté cette carte dans Google Wallet", 404);
  if (r.status >= 300) throw err((r.j.error || {}).message || "Google a refusé le message", 502);
  return { ok: true };
}

/* ---------- 🎯 message à quelques clients (relance des absents, anniversaire…) ---------- */
async function notifier(req, env) {
  const qui = await verifierFirebase((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  const b = await req.json().catch(() => ({}));
  const p = await lire("fidProgrammes/" + propre(b.pid, 60));
  if (!p) throw err("programme introuvable", 404);
  const patron = qui.email === ADMIN || (qui.verifie && qui.email && qui.email === String(p.ownerEmail || "").toLowerCase());
  if (!patron) throw err("réservé au commerçant de ce programme", 403);
  const titre = String(b.titre || "").trim().slice(0, 60), texte = String(b.texte || "").trim().slice(0, 400);
  if (!titre || !texte) throw err("titre et message obligatoires", 400);
  const ids = [...new Set((Array.isArray(b.cartes) ? b.cartes : []).map(x => propre(x)).filter(Boolean))].slice(0, 200);
  let ok = 0, absents = 0;
  for (const cid of ids) {
    const c = await lire("fidCartes/" + cid).catch(() => null);
    if (!c || c.pid !== p.id) continue;   // seulement les cartes de CE commerce
    const r = await wo(env, "POST", "loyaltyObject/" + encodeURIComponent(`${env.ISSUER_ID}.c-${cid}`) + "/addMessage", {
      message: { id: "n" + Date.now() + cid.slice(0, 4), header: titre, body: texte, messageType: "TEXT_AND_NOTIFY",
        displayInterval: { start: { date: new Date().toISOString() }, end: { date: new Date(Date.now() + 7 * 86400e3).toISOString() } } }
    });
    if (r.status < 300) ok++; else absents++;
  }
  return { ok: true, envoyes: ok, sansWallet: absents };
}

/* ---------- 🎂 anniversaires automatiques (déclenché chaque jour par le cron) ---------- */
// 🎂 message d'anniversaire : celui écrit par le commerçant ({prenom}, {cadeau}, {commerce}), sinon le texte par défaut
function texteAnniv(p, c) {
  const cadeau = String(p.cadeauAnniv || "").trim(), prenom = String(c.nom || "").trim().split(/\s+/)[0] || "";
  const modele = String(p.annivMessage || "").trim() || `${p.nom || "Nous"} vous souhaite un très joyeux anniversaire{ prenom} ! ` + (cadeau ? "Votre cadeau : {cadeau} — passez cette semaine 🎁" : "Passez cette semaine, une surprise vous attend 🎁");
  return modele.replace(/\{ prenom\}/g, prenom ? " " + prenom : "").replace(/\{prenom\}/gi, prenom).replace(/\{cadeau\}/gi, cadeau || "une surprise").replace(/\{commerce\}/gi, p.nom || "");
}

async function anniversairesAuto(env) {
  const d = new Date(), today = String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  const dateJour = d.toISOString().slice(0, 10);
  const cartes = await requete("fidCartes", "anniv", today);   // toutes les cartes dont c'est l'anniversaire aujourd'hui
  const parProg = {};
  for (const c of cartes) { (parProg[c.pid] = parProg[c.pid] || []).push(c); }
  let envoyes = 0;
  for (const pid of Object.keys(parProg)) {
    const p = await lire("fidProgrammes/" + propre(pid, 60)).catch(() => null);
    if (!p || p.actif === false || p.annivAuto === false) continue;   // le commerçant peut couper l'envoi auto
    const titre = "🎂 Joyeux anniversaire !";
    const texte = texteAnniv(p, c).slice(0, 400);
    for (const c of parProg[pid]) {
      const r = await wo(env, "POST", "loyaltyObject/" + encodeURIComponent(`${env.ISSUER_ID}.c-${propre(c.id)}`) + "/addMessage", {
        message: { id: "anniv-" + dateJour + "-" + propre(c.id).slice(0, 8), header: titre, body: texte, messageType: "TEXT_AND_NOTIFY",
          displayInterval: { start: { date: new Date().toISOString() }, end: { date: new Date(Date.now() + 7 * 86400e3).toISOString() } } }
      }).catch(() => ({ status: 500 }));
      if (r.status < 300) envoyes++;
    }
  }
  console.log("anniversaires:", cartes.length, "cartes,", envoyes, "notifiées");
  return envoyes;
}

/* ---------- logo ---------- */
async function logo(pid) {
  const p = await lire("fidProgrammes/" + propre(pid, 60)).catch(() => null);
  // Google Wallet : PNG ou JPEG seulement (logoData peut être en WebP → on prend alors logoPng)
  const re = /^data:(image\/(?:png|jpeg));base64,(.+)$/;
  const m = p && (String(p.logoData || "").match(re) || String(p.logoPng || "").match(re));
  if (m) return new Response(Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0)), { headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=3600" } });
  if (p && /^https:\/\//.test(p.logo || "")) return Response.redirect(p.logo, 302);
  return Response.redirect(SITE + "/assets/img/icons/icon-512.png", 302);
}

/* =========================================================
   🍎 APPLE WALLET — la carte en .pkpass
   Un .pkpass = un zip : pass.json + images + manifest.json (SHA-1 de chaque fichier)
   + signature (PKCS#7 détachée du manifest, signée par le certificat Pass Type ID).
   Tout est fait ici à la main (DER + zip) : aucune librairie, le Worker reste un seul fichier.
   ========================================================= */
function appleConfig(env, juste) {
  const ok = !!(env.APPLE_PASS_TYPE && env.APPLE_TEAM_ID && env.APPLE_CERT && env.APPLE_KEY && env.APPLE_WWDR);
  if (juste) return ok;
  if (!ok) throw err("Apple Wallet pas encore configuré (APPLE_PASS_TYPE, APPLE_TEAM_ID, APPLE_CERT, APPLE_KEY, APPLE_WWDR)", 503);
}
const pemDer = pem => {
  const b = String(pem || "").replace(/-----[^-]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b), ch => ch.charCodeAt(0));
};
const hex = n => n.toString(16).padStart(2, "0");
const rgb = h => { const x = /^#([0-9a-f]{6})$/i.exec(h) ? h.slice(1) : "1e90ff"; return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
const rgbTxt = a => `rgb(${a[0]},${a[1]},${a[2]})`;
const clair = a => (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) > 170;

/* --- DER (ASN.1) minimal --- */
const cat = (...l) => { const n = l.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of l) { o.set(x, i); i += x.length; } return o; };
function derLen(n) { if (n < 128) return Uint8Array.of(n); const b = []; while (n > 0) { b.unshift(n & 255); n >>= 8; } return Uint8Array.of(0x80 | b.length, ...b); }
const tlv = (tag, ...c) => { const v = cat(...c); return cat(Uint8Array.of(tag), derLen(v.length), v); };
const SEQ = (...c) => tlv(0x30, ...c), SET = (...c) => tlv(0x31, ...c);
const INT = n => tlv(0x02, Uint8Array.of(n));
const NUL = Uint8Array.of(0x05, 0x00);
function OID(s) {
  const p = s.split(".").map(Number), o = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) { const b = [v & 127]; let x = v >> 7; while (x > 0) { b.unshift(0x80 | (x & 127)); x >>= 7; } o.push(...b); }
  return tlv(0x06, Uint8Array.from(o));
}
// lit un élément DER : { tag, debut du contenu, fin, octets bruts }
function derLire(b, i) {
  const tag = b[i]; let l = b[i + 1], j = i + 2;
  if (l & 0x80) { const k = l & 127; l = 0; for (let t = 0; t < k; t++) l = (l << 8) | b[j + t]; j += k; }
  return { tag, c: j, f: j + l, brut: b.slice(i, j + l) };
}
// émetteur + numéro de série du certificat (pour dire « qui signe »)
function certId(der) {
  const cert = derLire(der, 0), tbs = derLire(der, cert.c);
  let x = derLire(der, tbs.c);
  if (x.tag === 0xa0) x = derLire(der, x.f);          // version (optionnelle)
  const serie = x.brut; x = derLire(der, x.f);        // serialNumber
  x = derLire(der, x.f);                              // signature (algo) → l'émetteur suit
  return { serie, emetteur: x.brut };
}
function utcTime(d) {
  const p = n => String(n).padStart(2, "0");
  return tlv(0x17, new TextEncoder().encode(p(d.getUTCFullYear() % 100) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + "Z"));
}
const cmpBytes = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

let APPLE_CLE = null;
async function signerManifest(env, manifest) {
  const cert = pemDer(env.APPLE_CERT), wwdr = pemDer(env.APPLE_WWDR);
  if (!APPLE_CLE) APPLE_CLE = await crypto.subtle.importKey("pkcs8", pemDer(env.APPLE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sha256 = SEQ(OID("2.16.840.1.101.3.4.2.1"), NUL);
  const empreinte = new Uint8Array(await crypto.subtle.digest("SHA-256", manifest));
  const attrs = [
    SEQ(OID("1.2.840.113549.1.9.3"), SET(OID("1.2.840.113549.1.7.1"))),      // contentType = data
    SEQ(OID("1.2.840.113549.1.9.5"), SET(utcTime(new Date()))),               // signingTime
    SEQ(OID("1.2.840.113549.1.9.4"), SET(tlv(0x04, empreinte)))               // messageDigest
  ].sort(cmpBytes);                                                           // SET OF en DER : trié
  const aSigner = SET(...attrs);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", APPLE_CLE, aSigner));
  const { serie, emetteur } = certId(cert);
  const signerInfo = SEQ(INT(1), SEQ(emetteur, serie), sha256, tlv(0xa0, ...attrs), SEQ(OID("1.2.840.113549.1.1.1"), NUL), tlv(0x04, sig));
  const signedData = SEQ(INT(1), SET(sha256), SEQ(OID("1.2.840.113549.1.7.1")), tlv(0xa0, cert, wwdr), SET(signerInfo));
  return SEQ(OID("1.2.840.113549.1.7.2"), tlv(0xa0, signedData));
}

/* --- zip (sans compression) --- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = d => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(fichiers) {
  const u16 = n => Uint8Array.of(n & 255, (n >> 8) & 255), u32 = n => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
  const locaux = [], centraux = []; let pos = 0;
  for (const [nom, data] of fichiers) {
    const n = new TextEncoder().encode(nom), c = crc32(data);
    const commun = cat(u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(c), u32(data.length), u32(data.length), u16(n.length), u16(0));
    const local = cat(u32(0x04034b50), commun, n, data);
    centraux.push(cat(u32(0x02014b50), u16(20), commun, u16(0), u16(0), u16(0), u32(0), u32(pos), n));
    locaux.push(local); pos += local.length;
  }
  const cd = cat(...centraux);
  return cat(...locaux, cd, u32(0x06054b50), u16(0), u16(0), u16(fichiers.length), u16(fichiers.length), u32(cd.length), u32(pos), u16(0));
}

/* --- images : Apple Wallet n'accepte que le PNG --- */
async function pngLogo(p) {
  const m = String(p.logoPng || "").match(/^data:image\/png;base64,(.+)$/) || String(p.logoData || "").match(/^data:image\/png;base64,(.+)$/);
  if (m) return Uint8Array.from(atob(m[1]), ch => ch.charCodeAt(0));
  if (/^https:\/\/.+\.png(\?|$)/i.test(p.logo || "")) { const r = await fetch(p.logo); if (r.ok) return new Uint8Array(await r.arrayBuffer()); }
  return null;
}
let ICONE = null;
async function pngIcone() {
  if (ICONE) return ICONE;
  const r = await fetch(SITE + "/assets/img/icons/icon-512.png");
  if (!r.ok) throw err("icône NFCWORK introuvable", 502);
  return (ICONE = new Uint8Array(await r.arrayBuffer()));
}

/* --- 🎨 le bandeau de tampons (strip.png), dessiné ici pixel par pixel, à la couleur du commerce --- */
async function pngEncode(W, H, rgbBuf) {
  const raw = new Uint8Array((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) raw.set(rgbBuf.subarray(y * W * 3, (y + 1) * W * 3), y * (W * 3 + 1) + 1);   // filtre 0 par ligne
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const u32 = n => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  const bloc = (type, data) => { const t = new TextEncoder().encode(type), td = cat(t, data); return cat(u32(data.length), td, u32(crc32(td))); };
  return cat(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), bloc("IHDR", cat(u32(W), u32(H), Uint8Array.of(8, 2, 0, 0, 0))), bloc("IDAT", z), bloc("IEND", new Uint8Array(0)));
}
// lit un PNG (8 bits, RGB ou RGBA, non entrelacé) → pixels RGB 750×246
async function pngDecode(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let i = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (i < u8.length) {
    const len = dv.getUint32(i), type = String.fromCharCode(...u8.subarray(i + 4, i + 8)), data = u8.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = dv.getUint32(i + 8); h = dv.getUint32(i + 12); ct = u8[i + 17]; if (u8[i + 16] !== 8 || u8[i + 20] !== 0 || (ct !== 2 && ct !== 6)) return null; }
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    i += 12 + len;
  }
  if (!w || !idat.length) return null;
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  const bpp = ct === 6 ? 4 : 3, st = w * bpp, px = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], src = y * (st + 1) + 1, o = y * st;
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - st + x] : 0, c = x >= bpp && y ? px[o - st + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  const W = 750, H = 246, out = new Uint8Array(W * H * 3);                 // recadrage au centre si la taille diffère
  const k = Math.max(W / w, H / h), ox = (w - W / k) / 2, oy = (h - H / k) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(w - 1, Math.floor(ox + x / k)), sy = Math.min(h - 1, Math.floor(oy + y / k)), s = (sy * w + sx) * bpp, d = (y * W + x) * 3;
    out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2];
  }
  return out;
}
// le fond derrière les tampons : la photo du commerce, sinon celle de son métier
const FONDS = { gaming: "gaming", cafe: "cafe", billard: "billard", terrain: "terrain", resto: "resto", snack: "snack", pizzeria: "pizzeria", barber: "barber", beaute: "beaute", hammam: "hammam", sport: "sport", lavage: "lavage", patisserie: "patisserie", glacier: "glacier", vetement: "vetement", location: "location", telephone: "telephone", garage: "garage" };   // vraies photos Unsplash (assets/wallet/CREDITS.md)
async function photoFond(p) {
  try {
    const f = await lire("fidFonds/" + propre(p.id, 60)).catch(() => null);
    const m = f && String(f.png || "").match(/^data:image\/png;base64,(.+)$/);
    if (m) return { id: "p" + (f.maj || 0), px: await pngDecode(Uint8Array.from(atob(m[1]), ch => ch.charCodeAt(0))) };
  } catch (e) {}
  if (p.fondMetier === "unie") return null;   // Kiffy : couleur unie choisie
  const n = FONDS[p.fondMetier || p.metier]; if (!n) return null;   // Kiffy : photo d'un autre métier possible
  try {   // pixels déjà prêts (750×246 RGB brut) : aucun décodage, très rapide
    const r = await fetch(`${SITE}/assets/wallet/fond-${n}.rgb`);
    if (r.ok) { const px = new Uint8Array(await r.arrayBuffer()); if (px.length === 750 * 246 * 3) return { id: "m" + n, px }; }
  } catch (e) {}
  return null;
}
function dessiner(fond, obj, pts, tampons, photo) {
  const W = 750, H = 246, b = new Uint8Array(W * H * 3);
  const mix = (a, c, t) => a.map((v, i) => Math.round(v * (1 - t) + c[i] * t));
  const haut = mix(fond, [255, 255, 255], 0.06), bas = mix(fond, [0, 0, 0], 0.32);
  if (photo) {                                                            // photo assombrie + teinte du commerce (les tampons restent lisibles)
    const t = mix(fond, [0, 0, 0], 0.45);
    for (let y = 0; y < H; y++) { const a = 0.5 + 0.2 * (y / H); let o = y * W * 3;
      for (let x = 0; x < W; x++, o += 3) { b[o] = photo[o] * (1 - a) + t[0] * a; b[o + 1] = photo[o + 1] * (1 - a) + t[1] * a; b[o + 2] = photo[o + 2] * (1 - a) + t[2] * a; } }
  } else for (let y = 0; y < H; y++) {                                           // dégradé + lumière douce en haut à gauche
    const t = y / H, r0 = haut[0] * (1 - t) + bas[0] * t, g0 = haut[1] * (1 - t) + bas[1] * t, b0 = haut[2] * (1 - t) + bas[2] * t, dy2 = (y + 60) * (y + 60);
    let o = y * W * 3;
    for (let x = 0; x < W; x++, o += 3) {
      const dx = x - 120, d = Math.sqrt(dx * dx + dy2), g = d < 520 ? (1 - d / 520) * 45.9 : 0;
      b[o] = r0 + g > 255 ? 255 : r0 + g; b[o + 1] = g0 + g > 255 ? 255 : g0 + g; b[o + 2] = b0 + g > 255 ? 255 : b0 + g;
    }
  }
  const px = (x, y, c, a) => { if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; for (let k = 0; k < 3; k++) b[o + k] = Math.round(b[o + k] * (1 - a) + c[k] * a); };
  const cov = v => Math.max(0, Math.min(1, v));
  const zone = (cx, cy, R, f) => { for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) f(x, y, x + 0.5 - cx, y + 0.5 - cy); };
  const disque = (cx, cy, R, c, a = 1) => zone(cx, cy, R, (x, y, dx, dy) => { const q = dx * dx + dy * dy; if (q > (R + 1) * (R + 1)) return; px(x, y, c, a * cov(R - Math.sqrt(q) + 0.5)); });
  const segD = (dx, dy, x1, y1, x2, y2) => { const vx = x2 - x1, vy = y2 - y1, t = cov(((dx - x1) * vx + (dy - y1) * vy) / (vx * vx + vy * vy)), ex = dx - x1 - t * vx, ey = dy - y1 - t * vy; return Math.sqrt(ex * ex + ey * ey); };
  const trait = (cx, cy, R, pts2, ep, c) => {                           // seulement la boîte autour du trait
    const xs = pts2.map(q => q[0]), ys = pts2.map(q => q[1]), m = ep / 2 + 2;
    for (let y = Math.floor(cy + Math.min(...ys) - m); y <= cy + Math.max(...ys) + m; y++) for (let x = Math.floor(cx + Math.min(...xs) - m); x <= cx + Math.max(...xs) + m; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy; let d = 1e9;
      for (let i = 0; i < pts2.length - 1; i++) { const v = segD(dx, dy, pts2[i][0], pts2[i][1], pts2[i + 1][0], pts2[i + 1][1]); if (v < d) d = v; }
      if (d < ep / 2 + 1) px(x, y, c, cov(ep / 2 - d + 0.5));
    }
  };
  const anneau = (cx, cy, R, ep, c, a) => zone(cx, cy, R, (x, y, dx, dy) => {
    const d = Math.sqrt(dx * dx + dy * dy); if (Math.abs(d - R) > ep / 2 + 1) return;
    const ang = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
    if ((ang * 18) % 1 < 0.55) px(x, y, c, a * cov(ep / 2 - Math.abs(d - R) + 0.5));
  });
  const boite = (cx, cy, x0, y0, x1, y1, c, a = 1) => { for (let y = Math.floor(cy + y0); y < cy + y1; y++) for (let x = Math.floor(cx + x0); x < cx + x1; x++) px(x, y, c, a); };
  const cadeau = (cx, cy, r, c, ruban) => {                               // 🎁 boîte + couvercle + ruban
    boite(cx, cy, -0.42 * r, -0.08 * r, 0.42 * r, 0.42 * r, c); boite(cx, cy, -0.5 * r, -0.3 * r, 0.5 * r, -0.06 * r, c);
    boite(cx, cy, -0.07 * r, -0.3 * r, 0.07 * r, 0.42 * r, ruban); boite(cx, cy, -0.5 * r, -0.21 * r, 0.5 * r, -0.13 * r, ruban);
    trait(cx, cy, r, [[0, -0.3 * r], [-0.28 * r, -0.52 * r], [-0.3 * r, -0.36 * r], [0, -0.3 * r]], 0.09 * r, c);
    trait(cx, cy, r, [[0, -0.3 * r], [0.28 * r, -0.52 * r], [0.3 * r, -0.36 * r], [0, -0.3 * r]], 0.09 * r, c);
  };
  const blanc = [255, 255, 255], pale = !photo && clair(fond);
  const encre = pale ? mix(fond, [0, 0, 0], 0.6) : blanc;                  // traits sur le fond (clair → foncé)
  const coche = clair(fond) ? mix(fond, [0, 0, 0], 0.45) : fond;                  // couleur dans les pastilles blanches
  if (tampons) {
    const rangs = obj <= 5 ? 1 : 2, cols = Math.ceil(obj / rangs);
    const cw = (W - 70) / cols, ch = (H - 26) / rangs, r = Math.min(cw, ch) * 0.39;
    for (let i = 0; i < obj; i++) {
      const cx = 35 + cw * (i % cols + 0.5), cy = 13 + ch * (Math.floor(i / cols) + 0.5), plein = i < pts, dernier = i === obj - 1;
      if (plein) {
        disque(cx, cy + 2, r, [0, 0, 0], 0.18); disque(cx, cy, r, blanc);
        if (dernier) cadeau(cx, cy, r, coche, blanc);
        else trait(cx, cy, r, [[-0.36 * r, 0.02 * r], [-0.1 * r, 0.28 * r], [0.4 * r, -0.26 * r]], 0.17 * r, coche);
      } else {
        disque(cx, cy, r, encre, 0.08); anneau(cx, cy, r - 1.5, 3, encre, 0.8);
        if (dernier) cadeau(cx, cy, r, encre, mix(fond, [0, 0, 0], 0.1));
      }
    }
  } else {                                                                // points au montant : grande jauge + cadeau au bout
    const x0 = 60, x1 = W - 150, yc = H / 2, h = 34, t = Math.min(1, pts / obj), rr = h / 2;
    const barre = (xa, xb, c, a) => { for (let y = Math.floor(yc - rr - 1); y <= yc + rr + 1; y++) for (let x = Math.floor(xa - rr); x <= xb + rr; x++) { const dx = x + 0.5 < xa ? x + 0.5 - xa : x + 0.5 > xb ? x + 0.5 - xb : 0; px(x, y, c, a * cov(rr - Math.hypot(dx, y + 0.5 - yc) + 0.5)); } };
    barre(x0 + rr, x1 - rr, encre, 0.22); if (t > 0) barre(x0 + rr, x0 + rr + (x1 - x0 - 2 * rr) * t, pale ? encre : blanc, 1);
    const cx = W - 85, r = 52; if (t >= 1) { disque(cx, yc, r, blanc); cadeau(cx, yc, r, coche, blanc); } else { anneau(cx, yc, r - 1.5, 3, encre, 0.8); cadeau(cx, yc, r, encre, mix(fond, [0, 0, 0], 0.1)); }
  }
  return { W, H, b };
}
async function bandeau(p, c) {
  const obj = Math.max(1, p.objectif || 10), pts = Math.min(obj, c.points || 0), tampons = p.type !== "montant" && obj <= 20;
  const f = await photoFond(p);
  const cle = `https://cache.nfcwork.ma/strip/v6/${couleur(p).slice(1)}/${obj}/${pts}/${tampons ? 1 : 0}/${f ? f.id : "0"}${f && f.id[0] === "p" ? "/" + propre(p.id, 40) : ""}`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) { const r = await cache.match(cle); if (r) return new Uint8Array(await r.arrayBuffer()); }
  const { W, H, b } = dessiner(rgb(couleur(p)), obj, pts, tampons, f && f.px);
  const png = await pngEncode(W, H, b);
  if (cache) await cache.put(cle, new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000" } })).catch(() => {});
  return png;
}

/* --- la carte --- */
// jeton propre à la carte : l'iPhone le renvoie au service web (Firebase) qui calcule le même
async function jetonApple(env, serie) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.APPLE_AUTH), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(serie)))].map(hex).join("").slice(0, 40);
}
function passJson(env, c, p) {
  const obj = Math.max(1, p.objectif || 10), pts = c.points || 0, u = unite(p), fond = rgb(couleur(p)), txt = clair(fond) ? [20, 20, 20] : [255, 255, 255];
  const lien = SITE + "/f/?c=" + c.id;
  return {
    formatVersion: 1, passTypeIdentifier: env.APPLE_PASS_TYPE, teamIdentifier: env.APPLE_TEAM_ID,
    serialNumber: "c-" + propre(c.id), organizationName: String(p.nom || "Commerce").slice(0, 60),
    description: "Carte fidélité " + String(p.nom || "").slice(0, 60), logoText: String(p.nom || "").slice(0, 30),
    backgroundColor: rgbTxt(fond), foregroundColor: rgbTxt(txt), labelColor: rgbTxt(clair(fond) ? [70, 70, 70] : [255, 255, 255].map((v, i) => Math.round(v * 0.72 + fond[i] * 0.28))),
    storeCard: {
      // le bandeau (strip.png) montre les tampons ; le compteur est en haut à droite, à côté du logo
      headerFields: [{ key: "points", label: u.toUpperCase(), value: `${pts} / ${obj}`, changeMessage: `${String(p.nom || "Votre carte").slice(0, 30)} : %@ ${u}` }],
      secondaryFields: [
        { key: "recompense", label: "RÉCOMPENSE", value: String(p.recompense || "Cadeau").slice(0, 40) },
        { key: "client", label: "CLIENT", value: String(c.nom || "Client").slice(0, 24) }
      ],
      auxiliaryFields: [
        { key: "reste", label: pts >= obj ? "BRAVO" : "IL VOUS MANQUE", value: pts >= obj ? "🎁 Récompense prête !" : `${obj - pts} ${u}` }
      ],
      backFields: [
        ...(c.msgWallet && c.msgWallet.texte && Date.now() - (c.msgWallet.date || 0) < 14 * 86400e3 ? [{ key: "perso", label: "✉️ Pour vous", value: String(c.msgWallet.texte).slice(0, 320), changeMessage: "%@" }] : []),
        ...(p.annonce && p.annonce.texte ? [{ key: "annonce", label: "📣 " + String(p.nom || "Message").slice(0, 40), value: String(p.annonce.texte).slice(0, 160), changeMessage: "%@" }] : []),
        { key: "regle", label: "Récompense", value: `${obj} ${u} = ${p.recompense || "une récompense"}` },
        { key: "carte", label: "Ma carte", value: lien, attributedValue: `<a href="${lien}">Ouvrir ma carte</a>` },
        { key: "nfcwork", label: "Carte fidélité digitale", value: "NFCWORK — nfcwork.ma" }
      ]
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: lien, messageEncoding: "iso-8859-1" }],
    // 📍 près du commerce, la carte s'affiche toute seule sur l'écran verrouillé (10 adresses max)
    ...(lieux(p).length ? { locations: lieux(p).map(l => ({ latitude: l.lat, longitude: l.lng, relevantText: String(p.lieuTexte || `Vous êtes près de ${p.nom || "chez nous"} : montrez votre carte 🎁`).slice(0, 80) })) } : {})
  };
}
const lieux = p => (Array.isArray(p.lieux) ? p.lieux : []).filter(l => l && Number.isFinite(+l.lat) && Number.isFinite(+l.lng)).slice(0, 10).map(l => ({ lat: +l.lat, lng: +l.lng }));
async function construirePkpass(env, c, p) {
  const enc = o => new TextEncoder().encode(typeof o === "string" ? o : JSON.stringify(o));
  const icone = await pngIcone(), logoP = await pngLogo(p);
  const pj = passJson(env, c, p);
  if (env.APPLE_WS && env.APPLE_AUTH) { pj.webServiceURL = String(env.APPLE_WS).replace(/\/+$/, ""); pj.authenticationToken = await jetonApple(env, pj.serialNumber); }   // mises à jour automatiques
  // icône = celle des notifications sur l'iPhone : le logo du commerce (sinon NFCWORK)
  const ico = logoP || icone;
  const fichiers = [["pass.json", enc(pj)], ["icon.png", ico], ["icon@2x.png", ico], ["icon@3x.png", ico]];
  if (logoP) fichiers.push(["logo.png", logoP], ["logo@2x.png", logoP]);
  const bande = await bandeau(p, c);
  fichiers.push(["strip.png", bande], ["strip@2x.png", bande]);
  const man = {};
  for (const [n, d] of fichiers) man[n] = [...new Uint8Array(await crypto.subtle.digest("SHA-1", d))].map(hex).join("");
  const manifest = enc(man);
  fichiers.push(["manifest.json", manifest], ["signature", await signerManifest(env, manifest)]);
  return zip(fichiers);
}
async function applePass(url, env) {
  appleConfig(env);
  const { c, p } = await carteEtProg(url.searchParams.get("c"));
  if (p.actif === false) throw err("programme en pause", 403);
  const f = await construirePkpass(env, c, p);
  return new Response(f, { headers: { "Content-Type": "application/vnd.apple.pkpass", "Content-Disposition": `attachment; filename="carte-${propre(c.id, 12)}.pkpass"`, "Cache-Control": "no-store", ...cors() } });
}
