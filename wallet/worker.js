/* =========================================================
   NFCWORK — SERVEUR WALLET (Cloudflare Worker, gratuit)
   Les cartes fidélité dans Google Wallet (Apple Wallet : plus tard, même serveur).

   À coller dans Cloudflare → Workers → nfcwork-wallet → « Modifier le code ».
   Réglages du Worker (Settings → Variables and Secrets) :
     ISSUER_ID   (texte)   l'Issuer ID de Google Pay & Wallet Console
     GOOGLE_SA   (secret)  TOUT le contenu du fichier .json du compte de service
   Aucun secret dans ce fichier : il peut être public.

   Adresses :
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
      return json({ ok: true, service: "nfcwork-wallet" });
    } catch (e) {
      const m = String(e && e.message || e);
      if (url.pathname === "/google/save") return page("Impossible d’ajouter la carte", "Réessayez dans un instant. (" + m.slice(0, 120) + ")");
      return json({ ok: false, erreur: m }, e.status || 500);
    }
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
function classe(env, p, base) {
  return {
    id: idClasse(env, p),
    issuerName: String(p.nom || "Commerce").slice(0, 60),
    programName: "Carte fidélité",
    programLogo: { sourceUri: { uri: base + "/logo/" + propre(p.id, 60) }, contentDescription: { defaultValue: { language: "fr-FR", value: String(p.nom || "Logo") } } },
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

/* ---------- logo ---------- */
async function logo(pid) {
  const p = await lire("fidProgrammes/" + propre(pid, 60)).catch(() => null);
  const d = p && String(p.logoData || "");
  const m = d.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (m) return new Response(Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0)), { headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=3600" } });
  if (p && /^https:\/\//.test(p.logo || "")) return Response.redirect(p.logo, 302);
  return Response.redirect(SITE + "/assets/img/icons/icon-512.png", 302);
}
