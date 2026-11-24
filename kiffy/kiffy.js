/* =========================================================
   KIFFY — app du commerçant (PWA, mobile d'abord) · maquettes : design/kiffy/
   Données partagées avec l'Espace (/espace/fidelite.js), les cartes clients (/f/) et le Worker Wallet :
     fidProgrammes, fidCartes, fidEmployes, fidSecrets (pins), fidFonds, kiffyPaiements, fidPlaques.
   Rôles : admin NFC Work (Espace NFC Work) · compte du commerce → code PIN gérant ou employé.
   Écritures sur une carte : Cloud Function « kiffyVisite » (jamais d'écriture directe des points).
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = $("#app");
  const SITE = "https://nfcwork.ma";
  const WALLET = window.NFCW_WALLET || "", APPLE_WS = window.NFCW_APPLE_WS || "";
  const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
  const WHATSAPP = typeof CONFIG !== "undefined" && CONFIG.whatsapp ? CONFIG.whatsapp : "";
  const NATIF = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  if (!window.FIREBASE_CONFIG || !window.firebase) { app.innerHTML = '<div class="vide">Configuration manquante.</div>'; return; }
  // tests en local : http://localhost:5500/kiffy/?emu → émulateurs Firebase (projet demo-kiffy, aucune vraie donnée)
  const EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("emu");
  firebase.initializeApp(EMU ? Object.assign({}, window.FIREBASE_CONFIG, { projectId: "demo-kiffy" }) : window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore(), fns = firebase.app().functions("europe-west1");
  if (EMU) { auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true }); db.useEmulator("127.0.0.1", 8080); fns.useEmulator("127.0.0.1", 5001); }
  const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
  const appel = (nom, data) => fns.httpsCallable(nom)(data).then(r => r.data);

  /* ---------------- icônes ---------------- */
  // Tabler (assets/icons/ui, licence MIT) : à la place des emojis des maquettes
  const ic = (n, t, extra) => `<i class="ic${t ? " s" + t : ""}" style="--i:url('../assets/icons/${n === "whatsapp" ? "brands" : "ui"}/${n}.svg')${extra ? ";" + extra : ""}" aria-hidden="true"></i>`;
  // dessins des maquettes (design/kiffy)
  const S = {
    retour: c => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c || "#0A0A0A"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
    fermer: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    chev: c => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c || "#8A938E"}" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`,
    cloche: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>`,
    scan: (t, c) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${c || "#0A0A0A"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M4 12h16"/></svg>`,
    bulle: (t, c) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/></svg>`,
    maison: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>`,
    gens: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/></svg>`,
    reglage: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    loupe: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A938E" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>`,
    coche: (t, c) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
    cadeau: (t, c) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M2 9h20M12 9v12M12 9c-2-4-7-4-6-1s6 1 6 1c2-4 7-4 6-1s-6 1-6 1"/></svg>`,
    plus: (t, c) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
    envoyer: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16C172" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>`,
    ondes: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8.5q2 3.5 0 7"/><path d="M10 6q4 6 0 12"/><path d="M14 3.5q6 8.5 0 17"/></svg>`,
    faceid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16C172" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2M9 9v1M15 9v1M9 15c1.5 1.5 4.5 1.5 6 0"/></svg>`,
    boutique: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>`,
    plaques: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h3v3H8zM13 8h3M13 11h3M8 13h3M14 14h2v2h-2z"/></svg>`,
    billet: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/></svg>`,
    perso: c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>`,
    coins: `<svg class="coins" width="264" height="264" viewBox="0 0 264 264" aria-hidden="true"><g fill="none" stroke="#16C172" stroke-width="6" stroke-linecap="round"><path d="M4 50V24A20 20 0 0 1 24 4h26"/><path d="M214 4h26a20 20 0 0 1 20 20v26"/><path d="M260 214v26a20 20 0 0 1-20 20h-26"/><path d="M50 260H24A20 20 0 0 1 4 240v-26"/></g></svg>`,
    cercles: (w, h, cx) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="position:absolute;left:0;top:0"><g fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2"><circle cx="${cx}" cy="20" r="60"/><circle cx="${cx}" cy="20" r="100"/></g></svg>`,
    vague: `<svg class="vague" viewBox="0 0 560 26" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h560v8c-70 18-140 18-210 6s-140-14-210 2S70 30 0 12z" fill="#16C172"/></svg>`
  };

  /* ---------------- métiers, couleurs ---------------- */
  // les 22 métiers de l'Espace (mêmes clés, mêmes récompenses) ; photo = assets/wallet/fond-<clé>.png
  const M = (nom, rec, u, idees, type, ico) => ({ nom, rec, u, idees, type: type || "visites", ico });
  const METIERS = {
    barber: M("Barber", "La 9e coupe offerte", "coupes", ["1 barbe offerte", "1 soin du visage offert"]),
    beaute: M("Beauté", "1 brushing offert", "visites", ["La 6e manucure offerte", "1 soin capillaire offert"]),
    cafe: M("Café", "1 café offert", "cafés", ["1 boisson au choix offerte", "1 viennoiserie offerte"]),
    snack: M("Snack", "1 sandwich offert", "commandes", ["1 menu offert", "1 boisson offerte"]),
    resto: M("Restaurant", "-50 DH sur l’addition", "repas", ["1 dessert offert", "1 boisson offerte"]),
    pizzeria: M("Pizzeria", "La 9e pizza offerte", "pizzas", ["1 boisson 1 L offerte", "1 pizza familiale offerte"]),
    patisserie: M("Pâtisserie", "1 gâteau offert", "visites", ["1 viennoiserie offerte", "-20 % sur une commande de fête"]),
    glacier: M("Glacier / Jus", "1 glace offerte", "commandes", ["1 jus offert", "La 7e crêpe offerte"]),
    vetement: M("Vêtements", "-20 % sur le prochain achat", "achats", ["1 accessoire offert", "Bon d’achat de 50 DH"]),
    pressing: M("Pressing", "5 pièces nettoyées offertes", "visites", ["1 couette nettoyée offerte", "1 costume nettoyé offert"], "", "wash-machine"),
    hammam: M("Hammam / Spa", "La 7e séance offerte", "séances", ["1 gommage offert", "1 massage offert"]),
    sport: M("Salle de sport", "Le 4e mois à -50 %", "mois", ["1 mois offert", "1 tenue de sport offerte"]),
    pharmacie: M("Parapharmacie", "Bon d’achat de 30 DH", "achats", ["1 produit de soin offert"], "", "pill"),
    epicerie: M("Épicerie", "Bon d’achat de 25 DH", "achats", ["1 article surprise offert"], "", "shopping-cart"),
    telephone: M("Téléphonie", "1 protection d’écran offerte", "achats", ["-30 % sur la 4e réparation", "1 câble ou chargeur offert"]),
    gaming: M("Gaming", "2 heures offertes", "heures", ["1 boisson offerte", "1 tournoi gratuit"]),
    billard: M("Billard", "1 partie offerte", "parties", ["1 heure offerte", "1 boisson offerte"]),
    terrain: M("Terrain / Padel", "Le 11e match offert", "matchs", ["1 heure offerte", "Boissons offertes pour l’équipe"]),
    location: M("Location", "La 6e location à -50 %", "locations", ["1 jour offert", "1 nuit offerte"]),
    lavage: M("Lavage auto", "Le 6e lavage offert", "lavages", ["1 lavage intérieur complet offert", "1 polissage offert"]),
    garage: M("Garage", "La 5e vidange à -50 %", "vidanges", ["1 contrôle offert", "1 lavage offert"]),
    autre: M("Autre", "Une surprise offerte", "visites", ["-10 % sur la prochaine visite", "Cadeau surprise"], "", "sparkles")
  };
  const AVEC_PHOTO = k => k && !METIERS[k].ico;
  const photoMetier = k => AVEC_PHOTO(k) ? `../assets/wallet/fond-${k}.png` : "";
  const nomMetier = k => (METIERS[k] || METIERS.autre).nom;
  const COULEURS = ["#16C172", "#0A0A0A", "#1C5FD4", "#0EA5E9", "#7C3AED", "#C026D3", "#DB2777", "#E11D48", "#C8453D", "#EA580C", "#F59E0B", "#EAB308", "#84CC16", "#0F766E", "#14532D", "#7A2048", "#78350F", "#64748B"];
  const clair = hex => { const h = String(hex || "#16C172").replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return 0.299 * r + 0.587 * g + 0.114 * b > 170; };
  const TARIF = { installation: 299, mensuel: 149, offre: 599, moisOfferts: 3 };

  /* ---------------- outils ---------------- */
  const toast = (m, long) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), long ? 5000 : 2600); };
  const erreur = e => { console.error(e); const m = e && (e.message || e.code) || ""; toast(/permission|insufficient/i.test(m) ? "Action refusée pour ce compte." : /network|unavailable|offline/i.test(m) ? "Pas de connexion. Réessayez." : m.length < 120 && m ? m : "Échec. Réessayez.", true); };
  const ms = v => v && v.toMillis ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0;
  const moisCle = d => { d = new Date(d || Date.now()); return String(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1); };
  const moisPlus = (k, n) => { const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(4) - 1 + n, 1)); return moisCle(d); };
  const nomMois = k => { const s = new Date(Date.UTC(+k.slice(0, 4), +k.slice(4) - 1, 1)).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" }); return s[0].toUpperCase() + s.slice(1); };
  const jourMMJJ = (decal = 0) => new Date(Date.now() + decal * 864e5).toLocaleDateString("fr-CA", { timeZone: "Africa/Casablanca" }).slice(5);
  const jourPlus = n => new Date(Date.now() + n * 864e5).toLocaleDateString("fr-CA", { timeZone: "Africa/Casablanca" });
  const ilya = t => { if (!t) return "jamais"; const s = (Date.now() - t) / 1000; if (s < 60) return "à l’instant"; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`; if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`; const j = Math.floor(s / 86400); return j === 1 ? "hier" : `il y a ${j} jours`; };
  const dateCourte = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const quand = t => { const d = new Date(t), auj = new Date(); const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); if (d.toDateString() === auj.toDateString()) return "Aujourd’hui, " + h; if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return "Hier, " + h; return dateCourte(t); };
  const initiale = s => (String(s || "?").trim()[0] || "?").toUpperCase();
  const prenom = s => String(s || "Client").trim().split(/\s+/)[0];
  const masque = tel => { let d = String(tel || "").replace(/\D/g, ""); if (d.startsWith("212")) d = "0" + d.slice(3); return d.length < 6 ? "" : `${d.slice(0, 2)} •• •• •${d.slice(-3, -2)} ${d.slice(-2)}`; };
  const rid = n => { const a = "abcdefghijkmnopqrstuvwxyz23456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(n)); for (const x of r) s += a[x % a.length]; return s; };
  const slugify = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "commerce";
  // même empreinte que l'Espace : les codes restent valables partout (jamais stockés en clair)
  const hachePin = async (pid, eid, pin) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nfcw:${pid}:${eid}:${pin}`)))].map(x => x.toString(16).padStart(2, "0")).join("");
  const unite = p => p.unite || (p.type === "montant" ? "points" : "visites");
  const objectif = p => Math.max(1, parseInt(p.objectif, 10) || 10);
  const logoSrc = p => /^data:image\//.test(p.logoData || "") ? p.logoData : /^https?:\/\//.test(p.logo || "") ? p.logo : "";
  const logoHTML = p => logoSrc(p) ? `<img src="${esc(logoSrc(p))}" alt="">` : esc(initiale(p.nom));
  const walletSync = cid => WALLET && !EMU && fetch(WALLET + "/google/sync?c=" + encodeURIComponent(cid), { mode: "no-cors" }).catch(() => {});
  const lienCarte = p => SITE + "/f/" + (p.court || p.id);

  /* ---------------- fenêtres ---------------- */
  function feuille(html, opts = {}) {
    const v = document.createElement("div"); v.className = "voile-f" + (opts.pin ? " pin-f" : "");
    v.innerHTML = `<div class="feuille${opts.noir ? " noir" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    v.addEventListener("click", e => { if (e.target === v && !opts.bloque) fermer(); });
    const fermer = () => { v.remove(); opts.surFermer && opts.surFermer(); };
    v.fermer = fermer; $$("[data-fermer]", v).forEach(b => (b.onclick = fermer));
    document.body.appendChild(v); return v;
  }
  const confirmer = (titre, texte, oui = "Confirmer", danger) => new Promise(ok => {
    const f = feuille(`<h2>${esc(titre)}</h2>${texte ? `<p class="muted" style="margin:0;font-size:14px">${esc(texte)}</p>` : ""}
      <button class="btn-noir moyen${danger ? " danger" : ""}" data-oui>${esc(oui)}</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`, { surFermer: () => ok(false) });
    $("[data-oui]", f).onclick = () => { f.remove(); ok(true); };
  });

  /* ---------------- état ---------------- */
  let user = null, estAdmin = false;
  let P = null, mesProgs = [];                  // commerce affiché
  let cartes = [], employes = [], pins = {}, plaque = "";
  let vueAdmin = "";                            // admin « voir comme le gérant » : pid
  let session = null;                           // { mode: "gerant" | "employe", eid }
  let dernierPinGerant = 0;
  let abos = [];
  let dernierResultat = null;                   // mode employé : dernière carte servie
  let progsAdmin = [], cartesAdmin = {}, paiementsAdmin = [];
  const cleSession = pid => "kiffy-session-" + pid;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const ssGet = k => { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const desabonner = () => { abos.forEach(f => { try { f(); } catch (e) {} }); abos = []; };

  /* ---------------- démarrage ---------------- */
  app.innerHTML = `<div class="chargement"><span class="logo-kiffy">kiffy</span></div>`;
  auth.onAuthStateChanged(async u => {
    desabonner(); user = u; P = null; session = null; vueAdmin = ""; cartes = []; employes = []; pins = {};
    if (!u) return ecranConnexion();
    estAdmin = u.emailVerified && String(u.email || "").toLowerCase() === ADMIN;
    if (estAdmin) { if (!/^#\/(admin|voir)/.test(location.hash)) location.hash = "#/admin"; return route(); }
    try {
      const q = await db.collection("fidProgrammes").where("ownerEmail", "==", String(u.email || "").toLowerCase()).get();
      mesProgs = q.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.arch);
    } catch (e) { mesProgs = []; }
    if (!mesProgs.length) return ecranAucun();
    if (!u.emailVerified) return ecranAucun("Votre e-mail n’est pas encore vérifié. Demandez à NFC Work de renvoyer l’accès.");
    const choisi = lsGet("kiffy-pid");
    ouvrirCommerce((mesProgs.find(p => p.id === choisi) || mesProgs[0]).id);
  });

  function ouvrirCommerce(pid, admin) {
    desabonner(); cartes = []; employes = []; pins = {}; plaque = ""; pinsCharges = false;
    vueAdmin = admin ? pid : ""; lsSet("kiffy-pid", admin ? lsGet("kiffy-pid") : pid);
    session = admin ? { mode: "gerant" } : ssGet(cleSession(pid));
    let pret = false;
    abos.push(db.doc("fidProgrammes/" + pid).onSnapshot(d => { P = d.exists ? { id: d.id, ...d.data() } : null; if (!pret) { pret = true; route(); } else rafraichir(); }, erreur));
    const base = col => admin ? db.collection(col).where("pid", "==", pid) : db.collection(col).where("ownerEmail", "==", String(user.email).toLowerCase());
    abos.push(base("fidCartes").onSnapshot(s => { cartes = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.pid === pid); rafraichir(); }, erreur));
    abos.push(base("fidEmployes").onSnapshot(s => { employes = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.pid === pid); rafraichir(); }, erreur));
    chargerPins(pid);
    db.collection("fidPlaques").where("pid", "==", pid).limit(1).get().then(s => { plaque = s.empty ? "" : s.docs[0].id; }).catch(() => {});
  }
  let pinsCharges = false;
  const chargerPins = pid => db.doc("fidSecrets/" + pid).get().then(s => { pins = (s.exists && s.data().pins) || {}; pinsCharges = true; rafraichir(); })
    .catch(() => { pins = {}; pinsCharges = true; rafraichir(); });
  // un changement de données : on redessine l'écran courant (sauf pendant une saisie)
  let rafT = 0;
  function rafraichir() {
    clearTimeout(rafT);
    rafT = setTimeout(() => { const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName) && app.contains(a)) return; if ($(".voile-f")) return; route(true); }, 120);
  }

  /* ---------------- routes ---------------- */
  window.addEventListener("hashchange", () => route());
  let scanActif = null;
  function route(rafraichissement) {
    if (!rafraichissement && scanActif) { scanActif(); scanActif = null; }
    const h = location.hash.replace(/^#\/?/, "") || "", [r, a] = h.split("/");
    document.body.classList.remove("sombre");
    if (!user) return ecranConnexion();
    if (estAdmin && !vueAdmin) {
      if (r === "voir" && a) { ouvrirCommerce(a, true); location.hash = "#/accueil"; return; }
      if (rafraichissement) return;
      if (r === "admin" && a === "creer") return adminCreer();
      if (r === "admin" && a === "modifier") return adminCreer(h.split("/")[2]);
      if (r === "admin" && a === "c") return adminCommerce(h.split("/")[2]);
      if (r === "admin" && a === "paiements") return adminPaiements();
      return adminAccueil();
    }
    if (!P) return vueAdmin ? null : ecranAucun("Ce commerce n’existe plus.");
    if (!session) {
      if (!pinsCharges) { app.innerHTML = `<div class="chargement"><span class="logo-kiffy">kiffy</span></div>`; return; }
      if (rafraichissement && $(".pin")) return;   // ne pas effacer un code en cours de saisie
      return ecranPin();
    }
    if (session.mode === "employe") {
      if (r === "client" && a) return ecranClient(a);
      if (rafraichissement) return;               // la caméra reste ouverte
      return ecranEmploye();
    }
    if (rafraichissement && (r === "scanner" || r === "message" || r === "equipe")) return;   // ne pas couper la caméra / la saisie
    if (rafraichissement && r === "reglages") return ecranReglages(true);
    switch (r) {
      case "clients": return ecranClients();
      case "scanner": return ecranScanner();
      case "client": return ecranClient(a);
      case "message": return ecranMessage();
      case "anniversaires": return ecranAnniversaires();
      case "reglages": return ecranReglages();
      case "equipe": return ecranEquipe();
      default: return ecranAccueil();
    }
  }
  const aller = h => { if (location.hash === h) route(); else location.hash = h; };

  /* ---------------- connexion ---------------- */
  function ecranConnexion() {
    document.body.classList.remove("sombre");
    app.innerHTML = `<div class="ecran" style="background:#fff">
      <div class="bienvenue-haut">
        <svg width="390" height="360" viewBox="0 0 390 360" aria-hidden="true" style="position:absolute;left:50%;top:0;transform:translateX(-50%)"><g fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2"><circle cx="40" cy="70" r="70"/><circle cx="40" cy="70" r="120"/><circle cx="360" cy="320" r="60"/><circle cx="360" cy="320" r="110"/></g></svg>
        <div class="logo-kiffy">kiffy</div><div class="slogan">Approchez. Cumulez. Gagnez.</div>
      </div>${S.vague}
      <form class="page" id="cx" style="padding:18px 24px;gap:12px" novalidate>
        <div><div style="font-size:22px;font-weight:800">Connexion du commerce</div><div style="font-size:13.5px;color:#5B665F;margin-top:4px">Une seule fois sur ce téléphone, par le gérant.</div></div>
        <label class="champ grand">E-mail du commerce<input id="cx-m" type="email" autocomplete="username" autocapitalize="off" placeholder="gerant@commerce.ma" required></label>
        <label class="champ grand">Mot de passe<input id="cx-p" type="password" autocomplete="current-password" required></label>
        <p class="err" id="cx-e"></p>
        <button class="btn-noir" style="border-radius:18px;padding:16px;font-size:16px">Se connecter</button>
        <button type="button" class="lien" id="cx-o" style="align-self:center">Mot de passe oublié ?</button>
        <div class="petit" style="font-size:12px">Kiffy · propulsé par NFC Work</div>
      </form></div>`;
    $("#cx").onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector("button.btn-noir"); $("#cx-e").textContent = ""; b.disabled = true;
      try { await auth.signInWithEmailAndPassword($("#cx-m").value.trim(), $("#cx-p").value); }
      catch (x) { $("#cx-e").textContent = /wrong-password|invalid-credential|user-not-found|invalid-login/i.test(x.code || "") ? "E-mail ou mot de passe incorrect." : /too-many/i.test(x.code || "") ? "Trop d’essais. Réessayez dans quelques minutes." : "Connexion impossible. Vérifiez internet."; b.disabled = false; }
    };
    $("#cx-o").onclick = async () => {
      const m = $("#cx-m").value.trim(); if (!m) { $("#cx-e").textContent = "Écrivez d’abord l’e-mail du commerce."; return; }
      try { await auth.sendPasswordResetEmail(m, { url: SITE + "/kiffy/" }); toast("E-mail envoyé : choisissez un nouveau mot de passe.", true); } catch (x) { $("#cx-e").textContent = "Envoi impossible pour cet e-mail."; }
    };
  }
  function ecranAucun(msg) {
    app.innerHTML = `<div class="ecran"><div class="bienvenue-haut" style="height:240px"><div class="logo-kiffy" style="font-size:64px">kiffy</div></div>${S.vague}
      <div class="page" style="padding:18px 24px"><div class="carte"><h3>Aucun commerce sur ce compte</h3><p class="muted" style="font-size:14px;margin:6px 0 0">${esc(msg || "Ce compte n’est lié à aucun commerce Kiffy. Contactez NFC Work.")}</p></div>
      ${WHATSAPP ? `<a class="btn-vert" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Bonjour NFC Work, j’ai besoin d’aide pour Kiffy (" + (user && user.email) + ").")}" target="_blank" rel="noopener">${ic("whatsapp", 20)} Écrire à NFC Work</a>` : ""}
      <button class="btn-clair" id="dx" style="padding:12px">Se déconnecter</button></div></div>`;
    $("#dx").onclick = () => auth.signOut();
  }

  /* ---------------- code PIN ---------------- */
  const actifs = () => employes.filter(e => e.actif !== false);
  async function quiEst(code) {   // → "gerant", l'id d'un employé, ou ""
    for (const [k, h] of Object.entries(pins)) {
      if (k !== "gerant" && !actifs().some(e => e.id === k)) continue;
      if (typeof h === "string" && h === await hachePin(P.id, k, code)) return k;
    }
    return "";
  }
  async function codeLibre(code, sauf) {
    for (const [k, h] of Object.entries(pins)) if (k !== sauf && typeof h === "string" && h === await hachePin(P.id, k, code)) return false;
    return true;
  }
  // clavier réutilisable : écran de démarrage et confirmation du gérant
  function clavier(zone, { titre, aide, note, surCode, annuler }) {
    let code = "", bloqueJusqua = 0, essais = 0;
    zone.innerHTML = `<div class="pin">
      <div class="logo-c">${logoHTML(P)}</div><div class="nom">${esc(titre)}</div><div class="aide" data-aide>${esc(aide)}</div>
      <div class="points" data-pts>${"<span></span>".repeat(4)}</div>
      <div class="clavier">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-n="${n}">${n}</button>`).join("")}<button type="button" class="vide" ${NATIF ? 'data-face' : "disabled"} aria-label="${NATIF ? "Face ID" : ""}">${NATIF ? S.faceid : ""}</button><button type="button" data-n="0">0</button><button type="button" class="vide" data-x aria-label="Effacer">${ic("backspace", 24)}</button></div>
      ${note ? `<div class="note">${esc(note)}</div>` : ""}
      ${annuler ? `<button class="sortir" data-ann>${esc(annuler)}</button>` : ""}</div>`;
    const pts = $("[data-pts]", zone), aideEl = $("[data-aide]", zone);
    const dessine = () => $$("span", pts).forEach((s, i) => s.classList.toggle("on", i < code.length));
    const tape = async n => {
      if (Date.now() < bloqueJusqua) return;
      if (n === "x") code = code.slice(0, -1); else if (code.length < 4) code += n;
      dessine(); if (code.length < 4) return;
      const c = code; code = "";
      const ok = await surCode(c);
      if (ok === false) {
        essais++; pts.classList.remove("secoue"); void pts.offsetWidth; pts.classList.add("secoue"); dessine();
        if (essais >= 5) { bloqueJusqua = Date.now() + 30000; essais = 0; aideEl.textContent = "Trop d’essais : attendez 30 secondes"; setTimeout(() => (aideEl.textContent = aide), 30000); }
        else aideEl.textContent = "Code incorrect";
      } else if (typeof ok === "string") { aideEl.textContent = ok; dessine(); }
    };
    $$("[data-n]", zone).forEach(b => (b.onclick = () => tape(b.dataset.n)));
    $("[data-x]", zone).onclick = () => tape("x");
    if ($("[data-face]", zone)) $("[data-face]", zone).onclick = () => window.KiffyNatif && window.KiffyNatif.faceId && window.KiffyNatif.faceId().then(ok => ok && surCode(null, true));
    const clav = e => { if (/^[0-9]$/.test(e.key)) tape(e.key); else if (e.key === "Backspace") tape("x"); };
    document.addEventListener("keydown", clav);
    if (annuler) $("[data-ann]", zone).onclick = () => { document.removeEventListener("keydown", clav); zone.dispatchEvent(new Event("annule")); };
    return () => document.removeEventListener("keydown", clav);
  }
  function ecranPin() {
    document.body.classList.add("sombre");
    app.innerHTML = `<div class="ecran noir" id="pinz"></div>`;
    const z = $("#pinz");
    if (!pins.gerant) {   // premier lancement : le gérant choisit son code
      let premier = "";
      const fin = clavier(z, { titre: P.nom, aide: "Choisissez le code du gérant (4 chiffres)", note: "Ce code ouvre tout l’espace. Les employés auront leur propre code.", annuler: "Se déconnecter",
        surCode: async c => {
          if (!premier) { premier = c; return "Retapez le même code"; }
          if (c !== premier) { premier = ""; return "Les 2 codes sont différents. Recommencez"; }
          if (!(await codeLibre(c, "gerant"))) { premier = ""; return "Ce code est déjà pris par un employé"; }
          try { await db.doc("fidSecrets/" + P.id).set({ pins: { gerant: await hachePin(P.id, "gerant", c) } }, { merge: true }); }
          catch (e) { erreur(e); premier = ""; return "Enregistrement impossible"; }
          pins.gerant = await hachePin(P.id, "gerant", c); fin(); ouvrirSession({ mode: "gerant" }); return true;
        } });
      z.addEventListener("annule", () => auth.signOut());
      return;
    }
    const fin = clavier(z, { titre: P.nom, aide: "Tapez votre code", note: "Code du gérant → tout l’espace · Code d’un employé → le scan", annuler: mesProgs.length > 1 ? "Changer de commerce" : "Se déconnecter",
      surCode: async (c, face) => {
        const k = face ? "gerant" : await quiEst(c);
        if (!k) return false;
        fin(); ouvrirSession(k === "gerant" ? { mode: "gerant" } : { mode: "employe", eid: k }); return true;
      } });
    z.addEventListener("annule", () => mesProgs.length > 1 ? choisirCommerce() : auth.signOut());
  }
  function ouvrirSession(s) {
    session = s; if (s.mode === "gerant") dernierPinGerant = Date.now();
    if (!vueAdmin) ssSet(cleSession(P.id), s);
    location.hash = s.mode === "employe" ? "#/emp" : "#/accueil"; route();
  }
  function verrouiller() { if (!vueAdmin) ssSet(cleSession(P.id), null); session = null; dernierResultat = null; location.hash = "#/"; route(); }
  function choisirCommerce() {
    const f = feuille(`<h2>Quel commerce ?</h2><div class="carte liste">${mesProgs.map(p => `<button class="ligne" data-p="${esc(p.id)}"><span class="tuile" style="background:${esc(p.couleur || "#16C172")}">${logoHTML(p)}</span><span class="txt"><b>${esc(p.nom)}</b><span>${esc(nomMetier(p.metier))}</span></span>${S.chev()}</button>`).join("")}</div>
      <button class="btn-clair" id="dx" style="padding:12px">Se déconnecter</button>`, { noir: false });
    $$("[data-p]", f).forEach(b => (b.onclick = () => { f.remove(); lsSet("kiffy-pid", b.dataset.p); ouvrirCommerce(b.dataset.p); }));
    $("#dx", f).onclick = () => auth.signOut();
  }
  // actions sensibles : redemander le code du gérant (valable 2 minutes)
  function pinGerant() {
    if (vueAdmin || Date.now() - dernierPinGerant < 120000) return Promise.resolve(true);
    return new Promise(ok => {
      const f = feuille(`<div id="pg"></div>`, { pin: true, noir: true, bloque: true });
      const z = $("#pg", f);
      const fin = clavier(z, { titre: "Code du gérant", aide: "Pour continuer, tapez le code du gérant", annuler: "Annuler",
        surCode: async (c, face) => { if (!face && (await quiEst(c)) !== "gerant") return false; dernierPinGerant = Date.now(); fin(); f.remove(); ok(true); return true; } });
      z.addEventListener("annule", () => { fin(); f.remove(); ok(false); });
    });
  }

  /* ---------------- barre du bas (gérant) ---------------- */
  const nav = actif => `<nav class="nav-bas">
    <a href="#/accueil" class="${actif === "accueil" ? "on" : ""}">${S.maison(actif === "accueil" ? "#0A0A0A" : "#8A938E")}Accueil</a>
    <a href="#/clients" class="${actif === "clients" ? "on" : ""}">${S.gens(actif === "clients" ? "#0A0A0A" : "#8A938E")}Clients</a>
    <a href="#/scanner" class="centre" aria-label="Scanner"><span>${S.scan(28)}</span></a>
    <a href="#/message" class="${actif === "message" ? "on" : ""}">${S.bulle(22, actif === "message" ? "#0A0A0A" : "#8A938E")}Messages</a>
    <a href="#/reglages" class="${actif === "reglages" ? "on" : ""}">${S.reglage(actif === "reglages" ? "#0A0A0A" : "#8A938E")}Réglages</a></nav>`;
  const bandeauAdmin = () => vueAdmin ? `<div style="position:sticky;top:0;z-index:30;background:#0A0A0A;color:#fff;font-size:12.5px;font-weight:700;padding:8px 14px;display:flex;justify-content:space-between;align-items:center">Vue du gérant · ${esc(P.nom)}<button class="lien" id="quitte-vue" style="color:#16C172">Quitter</button></div>` : "";
  function brancherAdmin() { const q = $("#quitte-vue"); if (q) q.onclick = () => { const pid = vueAdmin; desabonner(); vueAdmin = ""; P = null; session = null; document.body.classList.remove("sombre"); aller("#/admin/c/" + encodeURIComponent(pid)); }; }

  /* ---------------- calculs ---------------- */
  const pret = c => (c.points || 0) >= objectif(P);
  const absent = c => (c.total || 0) > 0 && Date.now() - ms(c.lastAt) > 30 * 864e5;
  const visitesMois = () => cartes.reduce((s, c) => s + ((c.vm && c.vm[moisCle()]) || 0), 0);
  const cadeaux = () => cartes.reduce((s, c) => s + (c.recompenses || 0), 0);
  const annivDans = c => { if (!c.anniv) return -1; for (let i = 0; i < 7; i++) if (c.anniv === jourMMJJ(i)) return i; return -1; };
  const annivJour = () => cartes.filter(c => annivDans(c) === 0);
  const progression = c => P.type === "montant" || objectif(P) > 15 ? `${c.points || 0}/${objectif(P)}` : `${Math.min(c.points || 0, objectif(P))}/${objectif(P)}`;
  const empNom = id => (employes.find(e => e.id === id) || {}).nom || "";

  /* ================= ACCUEIL (gérant) ================= */
  function ecranAccueil() {
    const an = annivJour(), recents = [...cartes].filter(c => ms(c.lastAt) > 0).sort((a, b) => ms(b.lastAt) - ms(a.lastAt)).slice(0, 5);
    const nouveaux = cartes.filter(c => Date.now() - ms(c.createdAt) < 7 * 864e5).length;
    app.innerHTML = `${bandeauAdmin()}<div class="ecran nav">
      <header class="entete">${S.cercles(390, 190, 360)}
        <div class="r"><div style="display:flex;align-items:center;gap:12px"><div class="logo-c m">${logoHTML(P)}</div>
          <div><div style="font-size:13px;font-weight:600;color:#0A3D24">Bonjour</div><div style="font-size:19px;font-weight:800">${esc(P.nom)}</div></div></div>
          <button class="rond" id="cloche" aria-label="Nouveaux clients">${S.cloche}${nouveaux ? "<i></i>" : ""}</button></div></header>
      <div class="stats"><div><div class="n">${cartes.length}</div><div class="l">Clients</div></div><div><div class="n">${visitesMois()}</div><div class="l">Visites ce mois</div></div><div><div class="n">${cadeaux()}</div><div class="l">Cadeaux</div></div></div>
      <div class="page" style="padding-top:18px">
        ${P.actif === false ? `<div class="pause">Commerce en pause : les visites sont bloquées. Contactez NFC Work.</div>` : ""}
        <a href="#/scanner" class="grosse-action"><span class="c">${S.scan(26)}</span><span style="flex:1"><b>Ajouter une visite</b><small>Scannez ou approchez la carte du client</small></span></a>
        ${an.length ? `<a href="#/anniversaires" class="bandeau-anniv">${ic("cake", 26, "color:#16C172")}<span style="flex:1"><b>${an.length} anniversaire${an.length > 1 ? "s" : ""} aujourd’hui</b><span class="s">${esc(an.slice(0, 3).map(c => prenom(c.nom)).join(" et "))}${P.annivAuto !== false ? " · message envoyé automatiquement" : ""}</span></span>${S.chev("#0A0A0A")}</a>` : ""}
        <div class="raccourcis"><a href="#/message">${S.bulle(24, "#16C172")}Message à tous</a><button id="relance">${S.cloche.replace('stroke="#0A0A0A"', 'stroke="#16C172"').replace(/width="20" height="20"/, 'width="24" height="24"')}Relancer les absents</button><button id="mode-emp">${ic("lock", 24)}Mode employé</button></div>
        <div class="carte"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><h3>Dernières visites</h3><a href="#/clients" class="lien" style="font-weight:600">Tout voir</a></div>
          ${recents.length ? recents.map((c, i) => { const h = (c.hist || [])[0]; return `<a href="#/client/${esc(c.id)}" class="ligne" style="padding:10px 0${i === recents.length - 1 ? " 0" : ""}"><span class="av p">${esc(initiale(c.nom))}</span><span class="txt"><b style="font-size:14px">${esc(prenom(c.nom))}</b><span style="font-size:12px">${ilya(ms(c.lastAt))}${h && h.e ? " · par " + esc(h.e) : ""}</span></span>${pret(c) ? `<span class="tag vert">${S.cadeau(14, "#0A0A0A")} Cadeau</span>` : `<span style="font-size:13px;font-weight:800">${progression(c)}</span>`}</a>`; }).join("") : `<div class="vide">Pas encore de visite. Touchez « Ajouter une visite ».</div>`}
        </div></div>${nav("accueil")}</div>`;
    brancherAdmin();
    $("#mode-emp").onclick = () => { if (!actifs().some(e => pins[e.id])) { toast("Ajoutez d’abord un employé avec son code (Réglages → Employés).", true); return; } verrouiller(); };
    $("#relance").onclick = () => relancer();
    $("#cloche").onclick = () => {
      const L = cartes.filter(c => Date.now() - ms(c.createdAt) < 7 * 864e5).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      const f = feuille(`<h2>Nouveaux clients (7 jours)</h2><div class="carte liste">${L.length ? L.map(c => `<a class="ligne" href="#/client/${esc(c.id)}"><span class="av">${esc(initiale(c.nom))}</span><span class="txt"><b>${esc(c.nom)}</b><span>Inscrit ${ilya(ms(c.createdAt))}</span></span></a>`).join("") : `<div class="vide">Aucun nouveau client cette semaine.</div>`}</div><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
      $$("a", f).forEach(a => a.addEventListener("click", () => f.remove()));
    };
  }

  async function relancer() {
    const L = cartes.filter(absent);
    if (!L.length) { toast("Aucun client absent depuis 30 jours."); return; }
    if (!(await pinGerant())) return;
    const f = feuille(`<h2>Relancer les absents (${L.length})</h2><p class="muted" style="margin:0;font-size:13.5px">${esc(L.slice(0, 8).map(c => prenom(c.nom)).join(", "))}${L.length > 8 ? "…" : ""} · pas venus depuis 30 jours</p>
      <label class="champ">Titre<input id="rl-t" maxlength="60" value="On ne vous a pas vu depuis un moment"></label>
      <label class="champ">Message<textarea id="rl-x" rows="3" maxlength="300">${esc(`${P.nom} vous attend ! Votre carte de fidélité est toujours là : passez cette semaine.`)}</textarea></label>
      <p class="err" id="rl-e"></p><button class="btn-noir moyen" id="rl-go">Envoyer dans leur Wallet</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
    $("#rl-go", f).onclick = async () => {
      const b = $("#rl-go", f); b.disabled = true; b.textContent = "Envoi…";
      try { const r = await envoyerA(L.map(c => c.id), $("#rl-t", f).value.trim(), $("#rl-x", f).value.trim()); f.remove(); toast(`Envoyé : ${r.google} Google Wallet · ${r.iphones} iPhone`, true); }
      catch (e) { $("#rl-e", f).textContent = "Envoi impossible. Réessayez."; b.disabled = false; b.textContent = "Envoyer dans leur Wallet"; }
    };
  }
  async function envoyerA(ids, titre, texte) {
    const tok = await user.getIdToken(), h = { "Content-Type": "application/json", Authorization: "Bearer " + tok }, corps = JSON.stringify({ pid: P.id, cartes: ids, titre, texte });
    const a = APPLE_WS ? fetch(APPLE_WS + "/notifier", { method: "POST", headers: h, body: corps }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
    const g = WALLET ? fetch(WALLET + "/google/notify", { method: "POST", headers: h, body: corps }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
    const [ja, jg] = await Promise.all([a, g]);
    if (!ja && !jg) throw new Error("envoi");
    return { iphones: (ja && ja.iphones) || 0, google: (jg && jg.envoyes) || 0 };
  }

  /* ================= SCANNER ================= */
  // caméra : BarcodeDetector si le téléphone l'a, sinon jsQR (assets/js/jsQR.js)
  let jsqrPret = null;
  const chargerJsQR = () => jsqrPret || (jsqrPret = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "../assets/js/jsQR.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }));
  function lireCode(txt) {
    const t = String(txt || "").trim();
    try { const u = new URL(t); const c = u.searchParams.get("c"); if (c && /\/f\/?$/.test(u.pathname) && /^[\w-]{6,60}$/.test(c)) return c; } catch (e) {}
    return /^[A-Za-z0-9_-]{10,60}$/.test(t) ? t : "";
  }
  async function demarrerCamera(cadre, surCode) {
    const msg = $(".msg-cam", cadre);
    if (window.KiffyNatif && window.KiffyNatif.scanner) { msg.textContent = "Touchez pour scanner"; cadre.onclick = () => window.KiffyNatif.scanner().then(t => t && surCode(t)); return () => {}; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "Caméra non disponible sur ce navigateur."; return () => {}; }
    let flux, arret = false, t = 0;
    try { flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
    catch (e) { msg.textContent = "Autorisez la caméra pour scanner (réglages du navigateur)."; return () => {}; }
    const v = document.createElement("video"); v.setAttribute("playsinline", ""); v.muted = true; v.srcObject = flux; cadre.prepend(v);
    await v.play().catch(() => {}); msg.textContent = "";
    let det = null;
    try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) det = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) {}
    if (!det) await chargerJsQR().catch(() => {});
    const cv = document.createElement("canvas"), g = cv.getContext("2d", { willReadFrequently: true });
    const tour = async () => {
      if (arret) return;
      try {
        if (v.readyState >= 2) {
          let txt = "";
          if (det) { const r = await det.detect(v); txt = r[0] && r[0].rawValue; }
          else if (window.jsQR) { const w = 360, h = Math.round(w * v.videoHeight / v.videoWidth) || 360; cv.width = w; cv.height = h; g.drawImage(v, 0, 0, w, h); const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" }); txt = r && r.data; }
          if (txt) { const c = lireCode(txt); if (c) { if (navigator.vibrate) navigator.vibrate(60); arreter(); return surCode(c); } }
        }
      } catch (e) {}
      t = setTimeout(tour, 180);
    };
    const arreter = () => { arret = true; clearTimeout(t); flux.getTracks().forEach(x => x.stop()); };
    tour(); return arreter;
  }
  // NFC : app native, ou Chrome Android (Web NFC) ; une carte / un autocollant NFC qui contient le lien de la carte
  async function lireNFC(surCode) {
    if (window.KiffyNatif && window.KiffyNatif.nfc) { const t = await window.KiffyNatif.nfc().catch(() => ""); const c = lireCode(t); return c ? surCode(c) : toast("Carte NFC non reconnue."); }
    if (!("NDEFReader" in window)) { toast("NFC : disponible sur Android (Chrome) et dans l’app Kiffy. Scannez le QR.", true); return; }
    try {
      const r = new NDEFReader(); await r.scan(); toast("Approchez la carte du téléphone…");
      r.onreading = e => { for (const rec of e.message.records) { const txt = new TextDecoder().decode(rec.data); const c = lireCode(txt); if (c) return surCode(c); } toast("Carte NFC non reconnue."); };
    } catch (e) { toast("NFC refusé ou désactivé.", true); }
  }
  function chercher(surChoix, sansTel) {
    const f = feuille(`<h2>Chercher un client</h2><label class="recherche" style="border:1px solid #D5DED9">${S.loupe}<input id="ch" placeholder="${sansTel ? "Prénom" : "Prénom ou téléphone"}" autocomplete="off"></label><div class="carte liste" id="chl" style="max-height:50vh;overflow:auto"></div><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
    const dessine = () => {
      const q = $("#ch", f).value.trim().toLowerCase(), qd = q.replace(/\D/g, "");
      const L = q ? cartes.filter(c => String(c.nom || "").toLowerCase().includes(q) || (!sansTel && qd.length >= 3 && String(c.tel || "").replace(/\D/g, "").includes(qd))).slice(0, 30) : [];
      $("#chl", f).innerHTML = L.length ? L.map(c => `<button class="ligne" data-c="${esc(c.id)}"><span class="av">${esc(initiale(c.nom))}</span><span class="txt"><b>${esc(sansTel ? prenom(c.nom) : c.nom)}</b><span>${progression(c)}${sansTel ? "" : " · " + esc(masque(c.tel))}</span></span></button>`).join("") : `<div class="vide">${q ? "Aucun client trouvé." : "Tapez quelques lettres."}</div>`;
      $$("[data-c]", f).forEach(b => (b.onclick = () => { f.remove(); surChoix(b.dataset.c); }));
    };
    $("#ch", f).oninput = dessine; dessine(); setTimeout(() => $("#ch", f).focus(), 50);
  }
  function ecranScanner() {
    document.body.classList.add("sombre");
    app.innerHTML = `${bandeauAdmin()}<div class="ecran noir">
      <div class="barre" style="justify-content:space-between"><button class="retour" onclick="history.length>1?history.back():location.hash='#/accueil'" aria-label="Retour">${S.fermer}</button><span class="t">Ajouter une visite</span><span style="width:42px"></span></div>
      <div class="scan-zone"><div class="cadre" id="cadre">${S.coins}<div class="ligne-scan"></div><div class="msg-cam">Ouverture de la caméra…</div></div>
        <div class="scan-txt"><b>Scannez la carte du client</b><span>Le QR de sa carte Kiffy, dans son Wallet</span></div>
        <div class="ou">OU</div>
        <button class="btn-vert" id="nfc">${S.ondes}Lire la carte en NFC</button>
        <button class="btn-ligne" id="cherche">Chercher par nom ou téléphone</button></div></div>`;
    brancherAdmin();
    const ouvrir = cid => aller("#/client/" + encodeURIComponent(cid));
    demarrerCamera($("#cadre"), ouvrir).then(stop => (scanActif = stop));
    $("#nfc").onclick = () => lireNFC(ouvrir);
    $("#cherche").onclick = () => chercher(ouvrir);
  }

  /* ================= MODE EMPLOYÉ ================= */
  function ecranEmploye() {
    document.body.classList.add("sombre");
    const e = employes.find(x => x.id === session.eid) || { nom: "Employé" };
    const r = dernierResultat;
    app.innerHTML = `<div class="ecran noir">
      <div class="emp-haut"><span class="qui"><span class="av">${esc(initiale(e.nom))}</span><span><b>${esc(e.nom)}</b><small>Mode employé · ${esc(P.nom)}</small></span></span><button class="pilule" id="changer">${ic("lock", 16)} Changer</button></div>
      <div class="scan-zone"><div class="cadre" id="cadre">${S.coins}<div class="ligne-scan"></div><div class="msg-cam">Ouverture de la caméra…</div></div>
        <div class="scan-txt"><b>Scannez la carte du client</b><span>Le QR de sa carte Kiffy, dans son Wallet</span></div>
        <div class="ou">OU</div>
        <button class="btn-vert" id="nfc">${S.ondes}Lire la carte en NFC</button>
        <button class="btn-ligne" id="cherche">Chercher par prénom</button>
        ${r ? `<div class="resultat${r.ok ? "" : " ko"}">${r.ok ? ic("circle-check", 24, "color:#16C172") : ic("alert-triangle", 24, "color:#FF8A8A")}<span style="flex:1"><b>${esc(r.titre)}</b><span class="s">${esc(r.sous)}</span></span></div>` : ""}
      </div></div>`;
    $("#changer").onclick = verrouiller;
    const ouvrir = cid => aller("#/client/" + encodeURIComponent(cid));
    demarrerCamera($("#cadre"), ouvrir).then(stop => (scanActif = stop));
    $("#nfc").onclick = () => lireNFC(ouvrir);
    $("#cherche").onclick = () => chercher(ouvrir, true);
  }

  /* ================= CARTE DU CLIENT ================= */
  async function ecranClient(cid) {
    cid = decodeURIComponent(cid || "");
    let c = cartes.find(x => x.id === cid);
    if (!c) { try { const d = await db.doc("fidCartes/" + cid).get(); c = d.exists ? { id: d.id, ...d.data() } : null; } catch (e) { c = null; } }
    const emp = session.mode === "employe", retour = emp ? "#/emp" : "#/scanner";
    if (!c || c.pid !== P.id) {
      if (emp) { dernierResultat = { ok: false, titre: "Carte inconnue", sous: "Cette carte n’est pas de ce commerce" }; return aller("#/emp"); }
      app.innerHTML = `${bandeauAdmin()}<div class="ecran"><div class="barre"><a class="retour" href="${retour}" aria-label="Retour">${S.retour()}</a><span class="t">Carte introuvable</span></div><div class="page"><div class="carte"><p class="muted" style="margin:0">Cette carte n’existe pas ou n’est pas de ce commerce.</p></div></div></div>`;
      return brancherAdmin();
    }
    const obj = objectif(P), pts = c.points || 0, u = unite(P), tamp = P.type !== "montant" && obj <= 15;
    const depuis = ms(c.createdAt) ? new Date(ms(c.createdAt)).toLocaleDateString("fr-FR", { month: "short" }) : "";
    let choisi = emp ? session.eid : "";
    const equipe = !emp && P.employes && actifs().length;
    app.innerHTML = `${bandeauAdmin()}<div class="ecran" style="padding-bottom:30px">
      <div class="barre"><a class="retour" href="${retour}" aria-label="Retour">${S.retour()}</a><span class="t">Carte trouvée</span></div>
      <div class="page">
        <div class="carte-client" style="background:${esc(P.couleur || "#16C172")}">
          <svg width="358" height="200" viewBox="0 0 358 200" aria-hidden="true" style="position:absolute;right:-40px;top:-40px"><g fill="none" stroke="#FFFFFF" stroke-opacity="0.2" stroke-width="2"><circle cx="300" cy="40" r="60"/><circle cx="300" cy="40" r="100"/></g></svg>
          <div class="h" style="color:${clair(P.couleur) ? "#0A0A0A" : "#FFFFFF"}"><div><div class="k" style="color:inherit;opacity:.75">CLIENT</div><div class="n">${esc(emp ? prenom(c.nom) : c.nom)}</div>${emp ? "" : `<div class="d" style="color:inherit;opacity:.8">${esc(masque(c.tel))}${depuis ? " · client depuis " + esc(depuis) : ""}</div>`}</div><div class="mk">kiffy</div></div>
          ${tamp ? `<div class="tampons">${Array.from({ length: obj }, (_, i) => i < Math.min(pts, obj) ? `<span class="plein" style="color:${esc(P.couleur || "#16C172")}">${S.coche(20, "currentColor")}</span>` : `<span class="vide">${i === obj - 1 ? S.cadeau(20, "#0A0A0A") : ""}</span>`).join("")}</div>`
            : `<div class="jauge"><i style="width:${Math.min(100, Math.round(pts / obj * 100))}%"></i></div><div style="position:relative;margin-top:8px;font-weight:800;font-size:20px">${pts} / ${obj} ${esc(u)}</div>`}
          <div class="reste">${S.cadeau(18, "#0A0A0A")} ${esc(P.recompense || "Une récompense")} · ${pts >= obj ? "prêt à offrir !" : `encore ${obj - pts} ${esc(u)}`}</div>
        </div>
        ${P.actif === false ? `<div class="pause">Commerce en pause : ajout impossible.</div>` : ""}
        ${P.type === "montant" ? `<label class="champ">Montant de l’achat (DH)<input id="mt" type="number" inputmode="decimal" min="1" placeholder="Ex. 120"></label><div class="muted" style="font-size:12.5px;margin-top:-8px">${esc(P.dhParPoint || 10)} DH = 1 point</div>` : ""}
        <button class="btn-noir gros" id="ajout" ${P.actif === false ? "disabled" : ""}>${S.plus(24, "#16C172")}${P.type === "montant" ? "Ajouter les points" : "Ajouter 1 visite"}</button>
        ${!emp && pts >= obj ? `<button class="btn-vert" id="cadeau">${S.cadeau(20, "#0A0A0A")} Offrir le cadeau</button>` : ""}
        ${equipe ? `<div class="carte"><h3>Qui a servi le client ?</h3><div class="qui-servi">${actifs().map(e => `<button data-e="${esc(e.id)}">${esc(e.nom)}</button>`).join("")}</div></div>` : ""}
        ${emp ? "" : `<div class="carte"><h3>Historique</h3>${(c.hist || []).length ? c.hist.slice(0, 8).map(h => `<div class="histo"><span>${h.a === "visite" ? `+${h.n} ${h.n > 1 ? "points" : "visite"}` : h.a === "cadeau" ? "Cadeau offert" : "-1 point"}${h.e ? " · " + esc(h.e) : ""}</span><span class="q">${esc(quand(h.t))}</span></div>`).join("") : `<div class="vide" style="padding:10px 0 4px">Les prochaines visites s’afficheront ici.</div>`}</div>
        <div class="actions-g"><button class="btn-clair" id="moins">Retirer 1 point</button><button class="btn-clair danger" id="suppr">${ic("trash", 16)} Supprimer</button></div>`}
      </div></div>`;
    brancherAdmin();
    $$("[data-e]").forEach(b => (b.onclick = () => { choisi = choisi === b.dataset.e ? "" : b.dataset.e; $$("[data-e]").forEach(x => x.classList.toggle("on", x.dataset.e === choisi)); }));
    $("#ajout").onclick = async () => {
      const b = $("#ajout"); const montant = $("#mt") ? parseFloat($("#mt").value) : 0;
      if (P.type === "montant" && !(montant > 0)) { toast("Écrivez le montant de l’achat."); return; }
      b.disabled = true;
      try {
        const r = await appel("kiffyVisite", { cid: c.id, eid: choisi || "", action: "visite", montant });
        walletSync(c.id); if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
        const msg = `+${r.n} · ${r.points}/${r.objectif}${r.points >= r.objectif ? " · cadeau prêt !" : ""}`;
        if (emp) { dernierResultat = { ok: true, titre: `${prenom(r.nom)} · +${r.n} ${r.n > 1 ? "points" : "visite"}`, sous: `${r.points}/${r.objectif} · ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` }; return aller("#/emp"); }
        toast(msg); route(true);
      } catch (e) {
        if (emp) { dernierResultat = { ok: false, titre: prenom(c.nom), sous: e.message || "Échec" }; return aller("#/emp"); }
        erreur(e); b.disabled = false;
      }
    };
    if ($("#cadeau")) $("#cadeau").onclick = async () => {
      if (!(await confirmer("Offrir le cadeau ?", `${P.recompense || "La récompense"} pour ${prenom(c.nom)}. ${obj} ${u} seront retirés de sa carte.`, "Oui, offrir"))) return;
      try { await appel("kiffyVisite", { cid: c.id, action: "cadeau" }); walletSync(c.id); toast("Cadeau offert"); } catch (e) { erreur(e); }
    };
    if ($("#moins")) $("#moins").onclick = async () => {
      if (!(await pinGerant())) return;
      try { await appel("kiffyVisite", { cid: c.id, action: "retirer" }); walletSync(c.id); toast("1 point retiré"); } catch (e) { erreur(e); }
    };
    if ($("#suppr")) $("#suppr").onclick = async () => {
      if (!(await pinGerant())) return;
      if (!(await confirmer("Supprimer cette carte ?", `La carte de ${c.nom} et ses ${pts} ${u} seront effacés. Impossible d’annuler.`, "Supprimer", true))) return;
      try { await db.doc("fidCartes/" + c.id).delete(); toast("Carte supprimée"); aller("#/clients"); } catch (e) { erreur(e); }
    };
  }

  /* ================= CLIENTS ================= */
  let filtre = "tous", recherche = "";
  function ecranClients() {
    const F = { tous: () => true, cadeau: pret, absents: absent, anniv: c => annivDans(c) >= 0 };
    const n = k => cartes.filter(F[k]).length;
    const q = recherche.trim().toLowerCase(), qd = q.replace(/\D/g, "");
    const L = cartes.filter(F[filtre]).filter(c => !q || String(c.nom || "").toLowerCase().includes(q) || (qd.length >= 3 && String(c.tel || "").replace(/\D/g, "").includes(qd)))
      .sort((a, b) => ms(b.lastAt) - ms(a.lastAt) || String(a.nom).localeCompare(String(b.nom)));
    const statut = c => pret(c) ? `<span class="tag vert">${S.cadeau(13, "#0A0A0A")} Prêt</span>` : absent(c) ? `<span class="tag orange">Absent</span>` : `<b style="font-size:13px">${progression(c)}</b>`;
    const detail = c => { const t = ms(c.lastAt); return `${progression(c)} · ${!t ? "nouveau client" : Date.now() - t < 864e5 && new Date(t).toDateString() === new Date().toDateString() ? "dernière visite aujourd’hui" : ilya(t)}`; };
    app.innerHTML = `${bandeauAdmin()}<div class="ecran nav"><div class="titre-page"><h1>Clients</h1><p>${cartes.length} carte${cartes.length > 1 ? "s" : ""}</p></div>
      <div class="page" style="gap:12px">
        <label class="recherche">${S.loupe}<input id="rq" placeholder="Prénom ou téléphone" value="${esc(recherche)}" autocomplete="off"></label>
        <div class="puces">${[["tous", "Tous"], ["cadeau", `${S.cadeau(14, "currentColor")} Cadeau prêt · ${n("cadeau")}`], ["absents", `${ic("zzz", 16)} Absents · ${n("absents")}`], ["anniv", `${ic("cake", 16)} · ${n("anniv")}`]].map(([k, t]) => `<button class="puce${filtre === k ? " on" : ""}" data-f="${k}">${t}</button>`).join("")}</div>
        <div class="carte liste">${L.length ? L.slice(0, 200).map(c => `<a class="ligne" href="#/client/${esc(c.id)}"><span class="av">${esc(initiale(c.nom))}</span><span class="txt"><b>${esc(c.nom)}</b><span>${esc(detail(c))}</span></span>${statut(c)}</a>`).join("") : `<div class="vide">${cartes.length ? "Aucun client ne correspond." : "Pas encore de clients : ils s’inscrivent en scannant la plaque Kiffy."}</div>`}</div>
      </div>${nav("clients")}</div>`;
    brancherAdmin();
    $$("[data-f]").forEach(b => (b.onclick = () => { filtre = b.dataset.f; ecranClients(); }));
    $("#rq").oninput = e => { recherche = e.target.value; const pos = e.target.selectionStart; ecranClients(); const r = $("#rq"); r.focus(); r.setSelectionRange(pos, pos); };
  }

  /* ================= MESSAGE À TOUS ================= */
  async function ecranMessage() {
    if (!(await pinGerant())) return aller("#/accueil");
    const bloque = P.kiffy && P.kiffy.promo === false;
    app.innerHTML = `${bandeauAdmin()}<div class="ecran nav">
      <div class="barre"><a class="retour" href="#/accueil" aria-label="Retour">${S.retour()}</a><span class="t">Message à tous les clients</span></div>
      <div class="page">
        ${bloque ? `<div class="pause">Les messages promo ne sont pas activés pour ce commerce. Contactez NFC Work.</div>` : ""}
        <div class="carte" style="display:flex;flex-direction:column;gap:12px">
          <label class="champ">Titre<input id="m-t" maxlength="60" placeholder="Ce week-end chez nous"></label>
          <label class="champ">Message<textarea id="m-x" rows="3" maxlength="300" placeholder="-20 % sur tous les cafés samedi et dimanche"></textarea></label></div>
        <div style="font-size:13px;font-weight:700;color:#5B665F;padding:0 4px">Aperçu sur l’iPhone du client</div>
        <div class="apercu-tel"><div class="notif"><span class="ap" style="background:${esc(P.couleur || "#16C172")}">${logoHTML(P)}</span><span style="flex:1;min-width:0"><span class="tt">${esc(String(P.nom).toUpperCase())}<span>maintenant</span></span><span class="cc" id="m-ap"></span></span></div></div>
        <div class="info-vert"><b>${cartes.length}</b> clients recevront la notification (Apple et Google Wallet)</div>
        <p class="err" id="m-e"></p>
        <button class="btn-noir" id="m-go" ${bloque ? "disabled" : ""}>${S.envoyer}Envoyer</button>
      </div>${nav("message")}</div>`;
    brancherAdmin();
    const ap = () => { const t = $("#m-t").value.trim(), x = $("#m-x").value.trim(); $("#m-ap").textContent = [t, x].filter(Boolean).join(" — ") || "Votre message apparaîtra ici"; };
    $("#m-t").oninput = ap; $("#m-x").oninput = ap; ap();
    $("#m-go").onclick = async () => {
      const t = $("#m-t").value.trim(), x = $("#m-x").value.trim(), b = $("#m-go");
      if (!t && !x) { $("#m-e").textContent = "Écrivez un titre ou un message."; return; }
      if (!(await confirmer("Envoyer à tous les clients ?", `${cartes.length} clients recevront ce message dans leur Wallet.`, "Envoyer"))) return;
      b.disabled = true; $("#m-e").textContent = "";
      try {
        const tok = await user.getIdToken(), h = { "Content-Type": "application/json", Authorization: "Bearer " + tok };
        const a = APPLE_WS ? fetch(APPLE_WS + "/annonce", { method: "POST", headers: h, body: JSON.stringify({ pid: P.id, titre: t, texte: x }) }).then(r => r.ok).catch(() => false) : Promise.resolve(false);
        const g = WALLET ? fetch(WALLET + "/google/message", { method: "POST", headers: h, body: JSON.stringify({ pid: P.id, titre: t, texte: x }) }).then(r => r.ok).catch(() => false) : Promise.resolve(false);
        const [oa, og] = await Promise.all([a, g]);
        if (!oa && !og) throw new Error("envoi");
        toast("Message envoyé", true); $("#m-t").value = ""; $("#m-x").value = ""; ap();
      } catch (e) { $("#m-e").textContent = "Envoi impossible. Réessayez."; }
      b.disabled = false;
    };
  }

  /* ================= ANNIVERSAIRES ================= */
  const modeleAnniv = () => P.annivMessage || `Joyeux anniversaire {prenom} ! Toute l’équipe de ${P.nom} vous offre {cadeau}. Passez cette semaine.`;
  function ecranAnniversaires() {
    const auj = annivJour(), semaine = cartes.filter(c => { const d = annivDans(c); return d > 0; }).sort((a, b) => annivDans(a) - annivDans(b));
    const auto = P.annivAuto !== false, envoye = c => c.msgWallet && new Date(c.msgWallet.date || 0).toDateString() === new Date().toDateString() && /🎂/.test(c.msgWallet.texte || "");
    const jourNom = d => new Date(Date.now() + d * 864e5).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "Africa/Casablanca" });
    const dateAn = c => new Date(2000, +c.anniv.slice(0, 2) - 1, +c.anniv.slice(3)).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const html = modeleAnniv().replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])).replace(/\{(prenom|cadeau|commerce)\}/gi, "<b>{$1}</b>");
    app.innerHTML = `${bandeauAdmin()}<div class="ecran nav">
      <div class="barre"><a class="retour" href="#/accueil" aria-label="Retour">${S.retour()}</a><span class="t">Anniversaires</span>${ic("cake", 20)}</div>
      <div class="page">
        <div class="anniv-haut">${ic("cake", 38)}<span style="flex:1"><b>${auj.length ? `${auj.length} anniversaire${auj.length > 1 ? "s" : ""} aujourd’hui` : "Aucun anniversaire aujourd’hui"}</b><span class="s">${auto ? "Le message part tout seul à 9 h" : "Envoi automatique désactivé"}</span></span>${auto ? `<span class="tag noir">AUTO ${S.coche(12, "#FFFFFF")}</span>` : ""}</div>
        <div class="carte liste" style="padding-bottom:8px">
          ${auj.map(c => `<a class="ligne" href="#/client/${esc(c.id)}"><span class="av">${esc(initiale(c.nom))}</span><span class="txt"><b>${esc(prenom(c.nom))}</b><span>${esc(dateAn(c))} · ${c.total || 0} visite${(c.total || 0) > 1 ? "s" : ""}</span></span>${envoye(c) ? `<span class="tag menthe">Envoyé ${S.coche(12, "#0A0A0A")}</span>` : auto ? `<span class="tag menthe">Auto</span>` : ""}</a>`).join("")}
          <div class="sect">CETTE SEMAINE</div>
          ${semaine.length ? semaine.map(c => `<a class="ligne" href="#/client/${esc(c.id)}"><span class="av">${esc(initiale(c.nom))}</span><span class="txt"><b>${esc(prenom(c.nom))}</b><span>${esc(dateAn(c))}</span></span><span style="font-size:12.5px;color:#5B665F">${esc(jourNom(annivDans(c)))}</span></a>`).join("") : `<div class="vide" style="padding:10px 0">Aucun anniversaire dans les 7 jours.</div>`}
        </div>
        <div class="carte" style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;justify-content:space-between;align-items:center"><h3>Votre message</h3><button class="lien" id="an-mod">Modifier</button></div>
          <div class="modele">${html}</div>
          <div class="kv"><span style="display:flex;align-items:center;gap:6px">${S.cadeau(16, "#0A0A0A")} Cadeau</span><b>${esc(P.cadeauAnniv || "Une surprise")}</b></div>
          <div class="kv"><span>Envoi automatique le jour J</span><button class="inter${auto ? " on" : ""}" id="an-auto" aria-label="Envoi automatique"></button></div>
        </div>
        <div class="petit">Le message part dans Apple Wallet et Google Wallet des clients qui ont donné leur date.</div>
      </div>${nav("")}</div>`;
    brancherAdmin();
    $("#an-auto").onclick = async () => { if (!(await pinGerant())) return; try { await appel("kiffyReglages", { pid: P.id, champs: { annivAuto: !auto } }); toast(!auto ? "Envoi automatique activé" : "Envoi automatique désactivé"); } catch (e) { erreur(e); } };
    $("#an-mod").onclick = async () => {
      if (!(await pinGerant())) return;
      const f = feuille(`<h2>Message d’anniversaire</h2>
        <label class="champ">Cadeau<input id="an-c" maxlength="80" value="${esc(P.cadeauAnniv || "")}" placeholder="${esc(P.recompense || "1 café offert")}"></label>
        <label class="champ">Message<textarea id="an-x" rows="4" maxlength="300">${esc(modeleAnniv())}</textarea></label>
        <div class="muted" style="font-size:12.5px">{prenom} = prénom du client · {cadeau} = le cadeau</div>
        <button class="btn-noir moyen" id="an-ok">Enregistrer</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
      $("#an-ok", f).onclick = async () => {
        try { await appel("kiffyReglages", { pid: P.id, champs: { cadeauAnniv: $("#an-c", f).value, annivMessage: $("#an-x", f).value } }); f.remove(); toast("Message enregistré"); } catch (e) { erreur(e); }
      };
    };
  }

  /* ================= RÉGLAGES ================= */
  async function ecranReglages(deja) {
    if (!deja && !(await pinGerant())) return aller("#/accueil");
    const nbLieux = Array.isArray(P.lieux) ? P.lieux.length : 0;
    const opt = (id, icone, l, v, rouge) => `<button class="opt" id="${id}"><span class="ico">${icone}</span><span class="l${rouge ? " danger" : ""}">${esc(l)}</span><span class="v">${esc(v || "")}</span><span class="chev">${S.chev()}</span></button>`;
    app.innerHTML = `${bandeauAdmin()}<div class="ecran nav"><div class="titre-page"><h1>Réglages</h1></div>
      <div class="page">
        <div class="carte" style="display:flex;align-items:center;gap:14px"><div class="logo-c" style="width:56px;height:56px;border-radius:16px;background:${esc(P.couleur || "#16C172")};display:flex;align-items:center;justify-content:center;font-family:var(--logo);font-weight:800;font-size:26px;overflow:hidden;color:${clair(P.couleur) ? "#0A0A0A" : "#FFFFFF"}">${logoHTML(P)}</div>
          <div style="flex:1;min-width:0"><b style="display:block;font-size:17px">${esc(P.nom)}</b><span style="font-size:13px;color:#5B665F">${esc(nomMetier(P.metier))}${P.ville ? " · " + esc(P.ville) : ""}</span></div><button class="lien" id="r-mod">Modifier</button></div>
        <div class="carte menu"><div class="sect">LA CARTE</div>
          ${opt("r-design", ic("palette"), "Logo, couleur, photo de fond", "")}
          ${opt("r-prog", ic("target"), "Objectif et récompense", `${objectif(P)} ${unite(P)}`)}
          ${opt("r-anniv", ic("cake"), "Anniversaires", P.cadeauAnniv || "")}
          ${opt("r-lieu", ic("map-pin"), "Adresse du commerce", nbLieux ? `${nbLieux} lieu${nbLieux > 1 ? "x" : ""}` : "aucune")}</div>
        <div class="carte menu"><div class="sect">L’ÉQUIPE</div>
          ${opt("r-equipe", ic("users"), "Employés et codes PIN", String(actifs().length))}
          ${opt("r-emp", ic("lock"), "Mode employé", "")}</div>
        <div class="carte menu"><div class="sect">COMPTE</div>
          ${opt("r-plaque", ic("qrcode"), "Ma plaque Kiffy", plaque || "")}
          ${opt("r-lien", ic("link"), "Lien d’inscription des clients", "")}
          ${WHATSAPP ? opt("r-aide", ic("whatsapp"), "Aide NFC Work (WhatsApp)", "") : ""}
          <button class="opt" id="r-dx" style="display:block;font-weight:700" ><span class="danger" style="font-size:15px">Se déconnecter</span></button></div>
      </div>${nav("reglages")}</div>`;
    brancherAdmin();
    $("#r-mod").onclick = $("#r-design").onclick = () => reglageDesign();
    $("#r-prog").onclick = () => reglageProgramme();
    $("#r-anniv").onclick = () => aller("#/anniversaires");
    $("#r-lieu").onclick = () => {
      const f = feuille(`<h2>Adresse du commerce</h2><p class="muted" style="margin:0;font-size:13.5px">${nbLieux ? `${nbLieux} adresse${nbLieux > 1 ? "s" : ""} enregistrée${nbLieux > 1 ? "s" : ""} : la carte s’affiche toute seule sur l’iPhone du client quand il passe près du commerce.` : "Aucune adresse : demandez à NFC Work de l’ajouter pour que la carte s’affiche près du commerce."}</p>
        <label class="champ">Texte affiché près du commerce<input id="lt" maxlength="80" value="${esc(P.lieuTexte || "")}" placeholder="Vous êtes près de ${esc(P.nom)} : montrez votre carte"></label>
        <button class="btn-noir moyen" id="lt-ok">Enregistrer</button><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
      $("#lt-ok", f).onclick = async () => { try { await appel("kiffyReglages", { pid: P.id, champs: { lieuTexte: $("#lt", f).value } }); f.remove(); toast("Enregistré"); } catch (e) { erreur(e); } };
    };
    $("#r-equipe").onclick = () => aller("#/equipe");
    $("#r-emp").onclick = () => actifs().some(e => pins[e.id]) ? verrouiller() : toast("Ajoutez d’abord un employé avec son code.", true);
    $("#r-plaque").onclick = () => feuille(`<h2>Ma plaque Kiffy</h2><p class="muted" style="margin:0;font-size:14px">${plaque ? `Votre plaque : <b>${esc(plaque)}</b>. Les clients la scannent ou l’approchent pour créer leur carte.` : "Aucune plaque liée pour l’instant. NFC Work la lie à votre commerce lors de l’installation."}</p><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
    $("#r-lien").onclick = () => {
      const l = lienCarte(P);
      const f = feuille(`<h2>Lien d’inscription</h2><p class="muted" style="margin:0;font-size:14px">Les clients ouvrent ce lien pour créer leur carte :</p><div class="modele" style="word-break:break-all">${esc(l)}</div><button class="btn-noir moyen" id="cp">Copier le lien</button><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
      $("#cp", f).onclick = () => navigator.clipboard.writeText(l).then(() => toast("Lien copié"), () => toast(l));
    };
    if ($("#r-aide")) $("#r-aide").onclick = () => window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Bonjour NFC Work, j’ai besoin d’aide pour Kiffy (${P.nom}).`)}`, "_blank", "noopener");
    $("#r-dx").onclick = async () => { if (await confirmer("Se déconnecter ?", "Il faudra retaper l’e-mail et le mot de passe du commerce sur ce téléphone.", "Se déconnecter", true)) { if (vueAdmin) { $("#quitte-vue") && $("#quitte-vue").click(); return; } ssSet(cleSession(P.id), null); auth.signOut(); } };
  }
  function reglageDesign() {
    let col = P.couleur || "#16C172", fm = P.fondMetier || "";
    const photos = () => [["", "Photo du métier", photoMetier(P.metier)], ...["cafe", "gaming", "terrain", "resto"].filter(k => k !== P.metier).slice(0, 4).map(k => [k, nomMetier(k), photoMetier(k)]), ["unie", "Couleur unie", ""]];
    const f = feuille(`<h2>Logo, couleur, photo</h2>
      <div class="section" style="padding:14px"><b>Couleur de la carte</b><div class="couleurs" id="dc">${COULEURS.map(x => `<button data-c="${x}" style="background:${x}" aria-label="Couleur ${x}"></button>`).join("")}</div>
        <label class="champ">Code couleur<input id="dc-h" maxlength="7" value="${esc(col)}" autocapitalize="off"></label></div>
      <div class="section" style="padding:14px"><b>Photo derrière les tampons</b><div class="grille3" id="dp">${photos().map(([k, l, src]) => `<button class="photo-choix" data-p="${k}">${src ? `<img src="${esc(src)}" alt="">` : ""}<span>${esc(l)}</span></button>`).join("")}</div>
        <label class="pointille">${ic("camera", 18)} Photo du commerce (la meilleure option)<input type="file" accept="image/*" id="dp-f" hidden></label></div>
      <div class="muted" style="font-size:12.5px">Le logo est changé par NFC Work (envoyez-le sur WhatsApp).</div>
      <button class="btn-noir moyen" id="d-ok">Enregistrer</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
    let fond = null;
    const maj = () => { $$("#dc button", f).forEach(b => b.classList.toggle("on", b.dataset.c.toLowerCase() === col.toLowerCase())); $$("#dp button", f).forEach(b => b.classList.toggle("on", fond == null && b.dataset.p === fm)); };
    $$("#dc button", f).forEach(b => (b.onclick = () => { col = b.dataset.c; $("#dc-h", f).value = col; maj(); }));
    $("#dc-h", f).oninput = e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { col = e.target.value; maj(); } };
    $$("#dp button", f).forEach(b => (b.onclick = () => { fm = b.dataset.p; fond = null; maj(); }));
    $("#dp-f", f).onchange = async e => { const fi = e.target.files[0]; if (!fi) return; try { fond = await lireFond(fi); toast("Photo prête : touchez Enregistrer"); maj(); } catch (x) { toast("Photo illisible."); } };
    maj();
    $("#d-ok", f).onclick = async () => {
      const b = $("#d-ok", f); b.disabled = true;
      try {
        if (fond) await db.doc("fidFonds/" + P.id).set({ png: fond, maj: Date.now(), ownerEmail: P.ownerEmail });
        else if (fm !== (P.fondMetier || "")) await db.doc("fidFonds/" + P.id).delete().catch(() => {});
        await appel("kiffyReglages", { pid: P.id, champs: { couleur: col, fondMetier: fond ? "" : fm } });
        f.remove(); toast("Carte mise à jour (les Wallet se mettent à jour tout seuls)", true);
      } catch (e) { erreur(e); b.disabled = false; }
    };
  }
  function reglageProgramme() {
    const f = feuille(`<h2>Objectif et récompense</h2>
      <label class="champ">Objectif (${P.type === "montant" ? "points" : "nombre de visites"})<input id="po" type="number" inputmode="numeric" min="1" max="1000" value="${objectif(P)}"></label>
      <label class="champ">Unité<input id="pu" maxlength="30" value="${esc(unite(P))}"></label>
      <label class="champ">Récompense<input id="pr" maxlength="80" value="${esc(P.recompense || "")}"></label>
      <div class="muted" style="font-size:12.5px">Les cartes de vos clients se mettent à jour toutes seules.</div>
      <button class="btn-noir moyen" id="p-ok">Enregistrer</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
    $("#p-ok", f).onclick = async () => {
      try { await appel("kiffyReglages", { pid: P.id, champs: { objectif: parseInt($("#po", f).value, 10), unite: $("#pu", f).value, recompense: $("#pr", f).value } }); f.remove(); toast("Enregistré"); } catch (e) { erreur(e); }
    };
  }
  // photo du commerce → 750×246 PNG (le Worker Wallet la lit sans librairie)
  function lireFond(fichier) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(fichier), img = new Image();
      img.onload = () => {
        const dessine = flou => { const c = document.createElement("canvas"); c.width = 750; c.height = 246; const g = c.getContext("2d"); const k = Math.max(750 / img.naturalWidth, 246 / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k; g.filter = `blur(${flou}px)`; g.drawImage(img, (750 - w) / 2, (246 - h) / 2, w, h); return c.toDataURL("image/png"); };
        let d = dessine(0.6); if (d.length > 900000) d = dessine(1.6); URL.revokeObjectURL(url); d.length > 1000000 ? ko(new Error("trop lourde")) : ok(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("illisible")); };
      img.src = url;
    });
  }
  function lireLogo(fichier) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(fichier), img = new Image();
      img.onload = () => {
        const n = 256, c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d");
        const k = Math.min(n / img.naturalWidth, n / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
        g.fillStyle = "#fff"; g.fillRect(0, 0, n, n); g.drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
        const px = g.getImageData(0, 0, n, n).data; let r = 0, gg = 0, b = 0, t = 0;
        for (let q = 0; q < px.length; q += 16) { const R = px[q], G = px[q + 1], B = px[q + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B); if (mx < 40 || mn > 215 || mx - mn < 40) continue; const wgt = mx - mn; r += R * wgt; gg += G * wgt; b += B * wgt; t += wgt; }
        const hex = t ? "#" + [r, gg, b].map(v => Math.round(v / t).toString(16).padStart(2, "0")).join("") : "";
        let data = c.toDataURL("image/webp", 0.85); if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", 0.85);
        const cp = document.createElement("canvas"); cp.width = cp.height = 160; cp.getContext("2d").drawImage(c, 0, 0, 160, 160);
        URL.revokeObjectURL(url); ok({ data, png: cp.toDataURL("image/png"), couleur: hex });
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("illisible")); };
      img.src = url;
    });
  }

  /* ================= ÉQUIPE ================= */
  function ecranEquipe() {
    const L = [...employes].sort((a, b) => (b.actif !== false) - (a.actif !== false) || String(a.nom).localeCompare(String(b.nom)));
    app.innerHTML = `${bandeauAdmin()}<div class="ecran nav">
      <div class="barre"><a class="retour" href="#/reglages" aria-label="Retour">${S.retour()}</a><span class="t">Employés et codes PIN</span></div>
      <div class="page">
        <div class="carte menu"><button class="opt" id="e-ger"><span class="ico">${ic("key")}</span><span class="l">Code du gérant</span><span class="v">${pins.gerant ? "défini" : "à créer"}</span><span class="chev">${S.chev()}</span></button></div>
        <div class="carte liste">${L.length ? L.map(e => `<div class="ligne"><span class="av" style="${e.actif === false ? "opacity:.45" : ""}">${esc(initiale(e.nom))}</span><span class="txt"><b>${esc(e.nom)}</b><span>${e.actif === false ? "désactivé" : pins[e.id] ? "code défini" : "pas de code"}${e.m && e.m[moisCle()] ? ` · ${e.m[moisCle()]} visite${e.m[moisCle()] > 1 ? "s" : ""} ce mois` : ""}</span></span>${e.actif === false ? `<button class="lien" data-r="${esc(e.id)}">Réactiver</button>` : `<button class="lien" data-p="${esc(e.id)}">${pins[e.id] ? "Changer le code" : "Donner un code"}</button>`}</div>`).join("") : `<div class="vide">Aucun employé. Ajoutez-en un : il aura son propre code et ne pourra que scanner.</div>`}</div>
        <button class="btn-noir moyen" id="e-add">${ic("user-plus", 20)} Ajouter un employé</button>
        <div class="petit">Un employé ne voit que le scan : pas de liste de clients, pas de téléphones, pas de messages ni de réglages.</div>
      </div>${nav("reglages")}</div>`;
    brancherAdmin();
    $("#e-ger").onclick = () => nouveauCode("gerant", "le gérant");
    $$("[data-p]").forEach(b => (b.onclick = () => { const e = employes.find(x => x.id === b.dataset.p); gererEmploye(e); }));
    $$("[data-r]").forEach(b => (b.onclick = async () => { try { await db.doc("fidEmployes/" + b.dataset.r).update({ actif: true }); toast("Employé réactivé"); } catch (e) { erreur(e); } }));
    $("#e-add").onclick = () => {
      const f = feuille(`<h2>Nouvel employé</h2><label class="champ">Prénom<input id="en" maxlength="40" placeholder="Karim"></label><button class="btn-noir moyen" id="en-ok">Ajouter puis choisir son code</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
      setTimeout(() => $("#en", f).focus(), 50);
      $("#en-ok", f).onclick = async () => {
        const nom = $("#en", f).value.trim(); if (!nom) return;
        try {
          const ref = db.collection("fidEmployes").doc(rid(14));
          await ref.set({ pid: P.id, ownerEmail: P.ownerEmail, nom, m: {}, actif: true, lastAt: TS.fromMillis(0), createdAt: FV.serverTimestamp() });
          f.remove(); nouveauCode(ref.id, nom);
        } catch (e) { erreur(e); }
      };
    };
  }
  function gererEmploye(e) {
    const f = feuille(`<h2>${esc(e.nom)}</h2><button class="btn-noir moyen" id="g-c">${pins[e.id] ? "Changer son code" : "Donner un code"}</button>${pins[e.id] ? `<button class="btn-clair" id="g-x" style="padding:12px">Retirer son code</button>` : ""}<button class="btn-clair danger" id="g-d" style="padding:12px">Désactiver ${esc(e.nom)}</button><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
    $("#g-c", f).onclick = () => { f.remove(); nouveauCode(e.id, e.nom); };
    if ($("#g-x", f)) $("#g-x", f).onclick = async () => { try { await db.doc("fidSecrets/" + P.id).update({ ["pins." + e.id]: FV.delete() }); f.remove(); await chargerPins(P.id); toast("Code retiré"); } catch (x) { erreur(x); } };
    $("#g-d", f).onclick = async () => { if (!(await confirmer(`Désactiver ${e.nom} ?`, "Son code ne marchera plus. Ses visites restent comptées.", "Désactiver", true))) return; try { await db.doc("fidEmployes/" + e.id).update({ actif: false }); await db.doc("fidSecrets/" + P.id).update({ ["pins." + e.id]: FV.delete() }).catch(() => {}); f.remove(); await chargerPins(P.id); toast("Employé désactivé"); } catch (x) { erreur(x); } };
  }
  async function nouveauCode(cle, nom) {
    if (!(await pinGerant())) return;
    const f = feuille(`<div id="nc"></div>`, { pin: true, noir: true, bloque: true }), z = $("#nc", f);
    let premier = "";
    const fin = clavier(z, { titre: `Code de ${nom}`, aide: "Choisissez 4 chiffres", note: "Chaque code est unique dans le commerce. Il est enregistré chiffré, jamais en clair.", annuler: "Annuler",
      surCode: async c => {
        if (!premier) { if (!(await codeLibre(c, cle))) return "Ce code est déjà pris. Choisissez-en un autre"; premier = c; return "Retapez le même code"; }
        if (c !== premier) { premier = ""; return "Les 2 codes sont différents. Recommencez"; }
        try { await db.doc("fidSecrets/" + P.id).set({ pins: { [cle]: await hachePin(P.id, cle, c) } }, { merge: true }); }
        catch (e) { erreur(e); return "Enregistrement impossible"; }
        fin(); f.remove(); await chargerPins(P.id); toast(`Code enregistré pour ${nom}. Donnez-le-lui.`, true); if (/^#\/equipe/.test(location.hash)) ecranEquipe(); return true;
      } });
    z.addEventListener("annule", () => { fin(); f.remove(); });
  }

  /* ================= ESPACE NFC WORK (admin) ================= */
  const navAdmin = actif => `<nav class="nav-bas">
    <a href="#/admin" class="${actif === "accueil" ? "on" : ""}">${S.boutique(actif === "accueil" ? "#0A0A0A" : "#8A938E")}Commerces</a>
    <a href="#/admin/paiements" class="${actif === "paiements" ? "on" : ""}">${S.billet(actif === "paiements" ? "#0A0A0A" : "#8A938E")}Paiements</a>
    <a href="#/admin/creer" class="centre" aria-label="Nouveau commerce"><span>${S.plus(30, "#0A0A0A")}</span></a>
    <a href="#/admin" id="na-pl" class="">${S.plaques("#8A938E")}Plaques</a>
    <a href="#" id="na-cpt">${S.perso("#8A938E")}Compte</a></nav>`;
  function brancherNavAdmin() {
    $("#na-pl").onclick = e => { e.preventDefault(); toast("Plaques à code unique : prochaine étape (phase 2)."); };
    $("#na-cpt").onclick = e => { e.preventDefault(); const f = feuille(`<h2>Compte NFC Work</h2><p class="muted" style="margin:0">${esc(user.email)}</p><a class="btn-clair" href="../espace/" style="padding:12px;text-decoration:none">Ouvrir l’Espace client</a><button class="btn-clair danger" id="dx" style="padding:12px">Se déconnecter</button><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`); $("#dx", f).onclick = () => auth.signOut(); };
  }
  async function chargerAdmin(force) {
    if (progsAdmin.length && !force) return;
    const [p, c, pa] = await Promise.all([db.collection("fidProgrammes").get(), db.collection("fidCartes").get(), db.collection("kiffyPaiements").get()]);
    progsAdmin = p.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.arch);
    cartesAdmin = {}; c.docs.forEach(d => { const x = d.data(); const k = x.pid; if (!cartesAdmin[k]) cartesAdmin[k] = { n: 0, vm: 0 }; cartesAdmin[k].n++; cartesAdmin[k].vm += (x.vm && x.vm[moisCle()]) || 0; });
    paiementsAdmin = pa.docs.map(d => ({ id: d.id, ...d.data() }));
    // facture du mois en cours pour les commerces Kiffy (créée une seule fois)
    const b = db.batch(); let n = 0;
    for (const x of progsAdmin) { const doc = factureDue(x); if (doc && !paiementsAdmin.some(y => y.id === doc.id)) { b.set(db.doc("kiffyPaiements/" + doc.id), doc.data); paiementsAdmin.push({ id: doc.id, ...doc.data }); n++; } }
    if (n) await b.commit().catch(erreur);
  }
  // standard : installation + 149 DH chaque mois (dès le 1er) · offre : 599 DH couvre les 3 premiers mois · essai en cours : rien
  function factureDue(p) {
    if (!p.kiffy || p.actif === false) return null;
    const k = moisCle(), debut = moisCle(ms(p.kiffy.cree) || ms(p.createdAt) || Date.now());
    if (p.essai && p.expire && p.expire >= jourPlus(0)) return null;
    if (p.kiffy.formule === "offre" && k < moisPlus(debut, TARIF.moisOfferts)) return null;
    return { id: `${p.id}-${k}`, data: { pid: p.id, mois: k, libelle: nomMois(k), montant: p.kiffy.mensuel || TARIF.mensuel, paye: false, cree: FV.serverTimestamp() } };
  }
  const impayes = pid => paiementsAdmin.filter(x => x.pid === pid && !x.paye);
  function statut(p) {
    if (p.actif === false) return `<span class="tag" style="background:#EEF2EF;color:#5B665F">En pause</span>`;
    if (impayes(p.id).length) return `<span class="tag rouge">Impayé</span>`;
    if (p.essai && p.expire >= jourPlus(0)) { const j = Math.max(0, Math.round((new Date(p.expire) - new Date(jourPlus(0))) / 864e5)); return `<span class="tag jaune">Essai · ${j} j</span>`; }
    return `<span class="tag menthe">Actif</span>`;
  }
  let rechercheAdmin = "";
  async function adminAccueil() {
    document.body.classList.remove("sombre");
    if (!progsAdmin.length) app.innerHTML = `<div class="chargement"><span class="logo-kiffy">kiffy</span></div>`;
    try { await chargerAdmin(); } catch (e) { erreur(e); }
    const k = moisCle(), encaisse = paiementsAdmin.filter(x => x.paye && moisCle(ms(x.payeLe)) === k).reduce((s, x) => s + (x.montant || 0), 0);
    const nAct = progsAdmin.filter(p => p.actif !== false && !(p.essai && p.expire >= jourPlus(0)) && !impayes(p.id).length).length;
    const nEss = progsAdmin.filter(p => p.actif !== false && p.essai && p.expire >= jourPlus(0)).length, nImp = progsAdmin.filter(p => impayes(p.id).length).length;
    const q = rechercheAdmin.trim().toLowerCase();
    const L = progsAdmin.filter(p => !q || String(p.nom).toLowerCase().includes(q) || String(p.ville || "").toLowerCase().includes(q)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    app.innerHTML = `<div class="ecran nav">
      <div style="padding:var(--haut) 20px 6px;display:flex;justify-content:space-between;align-items:center"><div><div class="eyebrow">ESPACE NFC WORK</div><div style="font-size:26px;font-weight:800">Mes commerces</div></div><span style="font-family:var(--logo);font-weight:800;font-size:22px">kiffy</span></div>
      <div class="page" style="padding-top:8px;gap:12px">
        <div class="ca"><div class="t">Encaissé ce mois</div><div class="m">${encaisse.toLocaleString("fr-FR")} <span>DH</span></div>
          <div class="g"><div><b>${nAct}</b><span>Actifs</span></div><div><b>${nEss}</b><span>En essai</span></div><div class="rouge"><b>${nImp}</b><span>Impayés</span></div></div></div>
        <label class="recherche">${S.loupe}<input id="aq" placeholder="Chercher un commerce" value="${esc(rechercheAdmin)}" autocomplete="off"></label>
        <div class="carte liste">${L.length ? L.map(p => `<a class="ligne" href="#/admin/c/${esc(p.id)}"><span class="tuile" style="background:${esc(p.couleur || "#16C172")};color:${clair(p.couleur) ? "#0A0A0A" : "#FFFFFF"}">${logoHTML(p)}</span><span class="txt"><b>${esc(p.nom)}</b><span>${esc(nomMetier(p.metier))} · ${(cartesAdmin[p.id] || { n: 0 }).n} clients${p.ville ? " · " + esc(p.ville) : ""}</span></span>${statut(p)}</a>`).join("") : `<div class="vide">Aucun commerce. Touchez + pour en créer un.</div>`}</div>
      </div>${navAdmin("accueil")}</div>`;
    brancherNavAdmin();
    $("#aq").oninput = e => { rechercheAdmin = e.target.value; const pos = e.target.selectionStart; adminAccueil(); const r = $("#aq"); r.focus(); r.setSelectionRange(pos, pos); };
  }
  async function adminPaiements() {
    try { await chargerAdmin(); } catch (e) { erreur(e); }
    const L = paiementsAdmin.filter(x => !x.paye).sort((a, b) => String(a.mois).localeCompare(String(b.mois)));
    const nom = pid => (progsAdmin.find(p => p.id === pid) || { nom: pid }).nom;
    app.innerHTML = `<div class="ecran nav"><div class="titre-page"><h1>Paiements</h1><p>${L.length} à encaisser · ${L.reduce((s, x) => s + (x.montant || 0), 0)} DH</p></div>
      <div class="page"><div class="carte liste">${L.length ? L.map(x => `<a class="ligne" href="#/admin/c/${esc(x.pid)}"><span class="txt"><b>${esc(nom(x.pid))}</b><span>${esc(x.libelle || x.mois)} · ${x.montant} DH</span></span><span class="tag jaune">À payer</span></a>`).join("") : `<div class="vide">Tout est payé.</div>`}</div></div>${navAdmin("paiements")}</div>`;
    brancherNavAdmin();
  }
  async function adminCommerce(pid) {
    pid = decodeURIComponent(pid || ""); lsSet("kiffy-admin-pid", pid);
    try { await chargerAdmin(); } catch (e) { erreur(e); }
    let p = progsAdmin.find(x => x.id === pid);
    if (!p) { const d = await db.doc("fidProgrammes/" + pid).get().catch(() => null); p = d && d.exists ? { id: d.id, ...d.data() } : null; }
    if (!p) { app.innerHTML = `<div class="ecran"><div class="barre"><a class="retour" href="#/admin">${S.retour()}</a><span class="t">Commerce introuvable</span></div></div>`; return; }
    const emps = (await db.collection("fidEmployes").where("pid", "==", pid).get().catch(() => ({ docs: [] }))).docs.filter(d => d.data().actif !== false).length;
    const pl = await db.collection("fidPlaques").where("pid", "==", pid).limit(1).get().then(s => s.empty ? "" : s.docs[0].id).catch(() => "");
    const paies = paiementsAdmin.filter(x => x.pid === pid).sort((a, b) => (a.mois === "installation") - (b.mois === "installation") || String(b.mois).localeCompare(String(a.mois)));
    const du = paies.filter(x => !x.paye).sort((a, b) => (b.mois === "installation") - (a.mois === "installation") || String(a.mois).localeCompare(String(b.mois)))[0];
    const st = cartesAdmin[pid] || { n: 0, vm: 0 };
    const opt = (id, icone, l, v, rouge) => `<button class="opt" id="${id}" style="padding:13px 0"><span class="ico">${icone}</span><span class="l${rouge ? " danger" : ""}" ${rouge ? 'style="font-weight:700"' : ""}>${esc(l)}</span><span class="v">${esc(v || "")}</span>${rouge ? "" : `<span class="chev">${S.chev()}</span>`}</button>`;
    app.innerHTML = `<div class="ecran nav">
      <div class="barre"><a class="retour" href="#/admin" aria-label="Retour">${S.retour()}</a><span class="t">Fiche commerce</span></div>
      <div class="page" style="gap:12px">
        <div class="fiche-haut" style="background:${esc(p.couleur || "#16C172")};color:${clair(p.couleur) ? "#0A0A0A" : "#FFFFFF"}"><span class="logo-c" style="color:#0A0A0A">${logoHTML(p)}</span><span style="flex:1;min-width:0"><b>${esc(p.nom)}</b><span class="s" style="color:inherit;opacity:.8">${esc(p.ownerEmail || "sans e-mail")}${ms(p.createdAt) ? " · depuis " + new Date(ms(p.createdAt)).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : ""}</span></span>${p.actif === false ? `<span class="tag noir">En pause</span>` : `<span class="tag noir">Actif</span>`}</div>
        <div class="mini-stats"><div><b>${st.n}</b><span>Clients</span></div><div><b>${st.vm}</b><span>Visites ce mois</span></div><div><b>${emps}</b><span>Employés</span></div></div>
        <div class="carte" style="padding:14px 16px"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Paiements</h3>${du ? `<span class="tag jaune">${esc(du.libelle || du.mois)} à payer</span>` : paies.length ? `<span class="tag menthe">À jour</span>` : ""}</div>
          ${paies.length ? paies.slice(0, 6).map(x => `<div class="paie"><span>${esc(x.libelle || x.mois)} · ${x.montant} DH</span>${x.paye ? `<b class="ok">Payé ${S.coche(13, "#0E8A51")}</b>` : `<b class="ko">À payer</b>`}</div>`).join("") : `<div class="vide" style="padding:10px 0">${p.kiffy ? "Aucun paiement." : "Commerce créé dans l’Espace (pas d’abonnement Kiffy)."}</div>`}
          ${du ? `<button class="btn-noir moyen" id="enc" style="margin-top:10px">Encaisser ${du.montant} DH</button>` : ""}</div>
        <div class="carte menu">
          ${opt("a-mod", ic("palette"), "Modifier la carte", "")}
          ${opt("a-voir", ic("eye"), "Voir comme le gérant", "")}
          ${opt("a-pl", ic("qrcode"), "Plaque liée", pl || "aucune")}
          ${opt("a-acc", ic("key"), "Renvoyer l’accès au gérant", "")}
          ${opt("a-pause", ic(p.actif === false ? "player-play" : "player-pause"), p.actif === false ? "Réactiver" : "Mettre en pause", "", p.actif !== false)}
        </div></div>${navAdmin("")}</div>`;
    brancherNavAdmin();
    $("#a-mod").onclick = () => aller("#/admin/modifier/" + encodeURIComponent(pid));
    $("#a-voir").onclick = () => { if (!p.ownerEmail) { toast("Ajoutez d’abord l’e-mail du gérant."); return; } location.hash = "#/voir/" + encodeURIComponent(pid); };
    $("#a-pl").onclick = () => toast("Lier une plaque en la scannant : prochaine étape (phase 2).");
    $("#a-acc").onclick = () => envoyerAcces(p);
    $("#a-pause").onclick = async () => {
      const pause = p.actif !== false;
      if (!(await confirmer(pause ? "Mettre en pause ?" : "Réactiver ?", pause ? "Les visites seront bloquées et les nouvelles inscriptions refusées. Les clients gardent leurs points." : "Le commerce peut de nouveau ajouter des visites.", pause ? "Mettre en pause" : "Réactiver", pause))) return;
      try { await db.doc("fidProgrammes/" + pid).update({ actif: !pause, maj: FV.serverTimestamp() }); p.actif = !pause; const x = progsAdmin.find(y => y.id === pid); if (x) x.actif = !pause; toast(pause ? "Commerce en pause" : "Commerce réactivé"); adminCommerce(pid); } catch (e) { erreur(e); }
    };
    if ($("#enc")) $("#enc").onclick = async () => {
      if (!(await confirmer(`Encaisser ${du.montant} DH ?`, `${p.nom} · ${du.libelle || du.mois}`, "Encaisser"))) return;
      try { await db.doc("kiffyPaiements/" + du.id).update({ paye: true, payeLe: FV.serverTimestamp(), par: user.email }); du.paye = true; du.payeLe = Date.now(); toast("Paiement enregistré"); adminCommerce(pid); } catch (e) { erreur(e); }
    };
  }
  async function envoyerAcces(p) {
    if (!p.ownerEmail) { toast("Pas d’e-mail de gérant."); return false; }
    try {
      const r = await appel("kiffyAcces", { pid: p.id });
      await auth.sendPasswordResetEmail(r.email, { url: SITE + "/kiffy/" });
      toast(`Accès envoyé à ${r.email} (e-mail « choisir le mot de passe »)`, true); return true;
    } catch (e) { erreur(e); return false; }
  }

  /* ---------- créer / modifier un commerce ---------- */
  async function adminCreer(pid) {
    document.body.classList.remove("sombre");
    let ex = null;
    if (pid) { pid = decodeURIComponent(pid); const d = await db.doc("fidProgrammes/" + pid).get().catch(() => null); ex = d && d.exists ? { id: d.id, ...d.data() } : null; if (!ex) return aller("#/admin"); }
    const k0 = ex ? ex.kiffy || {} : {};
    const s = {
      nom: ex ? ex.nom || "" : "", ville: ex ? ex.ville || "" : "", tel: ex ? ex.telCommerce || "" : "", email: ex ? ex.ownerEmail || "" : "",
      metier: ex && METIERS[ex.metier] ? ex.metier : "cafe", couleur: ex ? ex.couleur || "#16C172" : "#16C172", logoData: ex ? ex.logoData || "" : "", logoPng: ex ? ex.logoPng || "" : "", couleurLogo: "",
      fond: ex ? ex.fondMetier || "" : "", fondPerso: null, type: ex && ex.type === "montant" ? "montant" : "visites", objectif: ex ? objectif(ex) : 10, rec: ex ? ex.recompense || "" : "", unite: ex ? ex.unite || "" : "",
      on: { wallet: k0.wallet !== false, anniv: ex ? ex.annivAuto !== false : true, relance: k0.relance !== false, avis: ex ? !!ex.lienAvis : false, employes: ex ? !!ex.employes : true, proche: ex ? !!(ex.lieux && ex.lieux.length) : true, promo: k0.promo !== false, essai: ex ? !!ex.essai : false },
      lienAvis: ex ? ex.lienAvis || "" : "", lieux: ex && Array.isArray(ex.lieux) ? ex.lieux : [], formule: k0.formule || "standard"
    };
    if (!s.rec) s.rec = METIERS[s.metier].rec;
    if (!s.unite) s.unite = s.type === "montant" ? "points" : METIERS[s.metier].u;
    const OBJ = { visites: [5, 6, 8, 10, 12, 15], montant: [50, 100, 150, 200, 300, 500] };
    const OPTS = [["wallet", "device-mobile", "Apple Wallet et Google Wallet", "La carte dans le téléphone du client"], ["anniv", "cake", "Anniversaires automatiques", "Message + cadeau le jour J"], ["relance", "zzz", "Relance des absents", "Après 30 jours sans visite"], ["avis", "star", "Avis Google = +1 point", "Plus d’avis pour le commerce"], ["employes", "users", "Mode employé (codes PIN)", "Les employés scannent, c’est tout"], ["proche", "map-pin", "Carte à l’approche (iPhone)", "S’affiche près du commerce"], ["promo", "speakerphone", "Messages promo", "Offres envoyées à tous les clients"], ["essai", "gift", "Essai gratuit 7 jours", "Avant le premier paiement"]];
    const recs = () => [...new Set([METIERS[s.metier].rec, ...METIERS[s.metier].idees, "1 boisson offerte", "-20 % sur la visite", "Une surprise offerte", s.rec].filter(Boolean))].slice(0, 6);
    const photos = () => [["", "Photo du métier", photoMetier(s.metier)], ...["cafe", "gaming", "terrain", "resto"].filter(k => k !== s.metier).slice(0, 4).map(k => [k, nomMetier(k), photoMetier(k)]), ["unie", "Couleur unie", ""]];
    const srcFond = () => s.fondPerso || (s.fond === "unie" ? "" : photoMetier(s.fond || s.metier));

    app.innerHTML = `<div class="ecran" style="padding-bottom:40px">
      <div class="creer-haut"><div style="display:flex;align-items:center;gap:12px"><a class="retour" href="${ex ? "#/admin/c/" + esc(ex.id) : "#/admin"}" aria-label="Retour">${S.retour()}</a><span class="t" style="font-size:16px;font-weight:700">${ex ? "Modifier la carte" : "Nouveau commerce"}</span><span style="margin-left:auto;font-size:12px;font-weight:700;color:#0E8A51">Aperçu en direct</span></div><div class="apercu" id="ap"></div></div>
      <div class="page" style="padding:4px 16px 40px;gap:12px">
        <section class="section"><b>1 · Le commerce</b>
          <div style="display:flex;gap:12px;align-items:center"><label class="logo-btn" id="lg" style="display:flex;align-items:center;justify-content:center;cursor:pointer">${s.logoData ? `<img src="${esc(s.logoData)}" alt="">` : "+ Logo"}<input type="file" accept="image/*" id="lg-f" hidden></label><label class="champ" style="flex:1">Nom<input id="c-nom" maxlength="60" value="${esc(s.nom)}" placeholder="Café des Amis"></label></div>
          <div class="grille2"><label class="champ">Ville<input id="c-ville" maxlength="40" value="${esc(s.ville)}" placeholder="Kénitra"></label><label class="champ">Téléphone<input id="c-tel" type="tel" maxlength="20" value="${esc(s.tel)}" placeholder="06…"></label></div>
          <label class="champ">E-mail du gérant<input id="c-mail" type="email" autocapitalize="off" value="${esc(s.email)}" placeholder="gerant@commerce.ma"></label></section>
        <section class="section"><b>2 · Métier <span>(photo et récompense proposées)</span></b><div class="grille3" id="mt">${Object.entries(METIERS).map(([k, m]) => `<button class="metier" data-m="${k}">${AVEC_PHOTO(k) ? `<img src="${photoMetier(k)}" alt="" loading="lazy">` : `<span class="sans" style="display:flex;align-items:center;justify-content:center">${ic(m.ico, 20)}</span>`}${esc(m.nom)}</button>`).join("")}</div></section>
        <section class="section"><b>3 · Couleur de la carte</b><div class="couleurs" id="cl">${COULEURS.map(x => `<button data-c="${x}" style="background:${x}" aria-label="Couleur ${x}"></button>`).join("")}</div>
          <div style="display:flex;gap:8px"><button class="btn-clair" id="cl-logo">${ic("palette", 16)} Couleur du logo</button><button class="btn-clair" id="cl-code">${ic("hash", 16)} Code couleur</button></div></section>
        <section class="section"><b>4 · Photo derrière les tampons</b><div class="grille3" id="ph"></div>
          <label class="pointille" style="cursor:pointer">${ic("camera", 18)} Photo du commerce (la meilleure option)<input type="file" accept="image/*" id="ph-f" hidden></label></section>
        <section class="section"><b>5 · Le programme</b>
          <div class="seg"><button data-t="visites">Tampons (visites)</button><button data-t="montant">Points (montant)</button></div>
          <div style="font-size:13px;font-weight:700">Objectif <span class="muted" style="font-weight:500" id="obj-aide"></span></div><div class="choix" id="ob"></div>
          <div style="font-size:13px;font-weight:700">Récompense</div><div class="choix rec" id="rc"></div>
          <label class="champ" style="font-weight:600">Autre récompense<input id="rc-x" maxlength="80" value="${esc(s.rec)}"></label></section>
        <section class="section" style="gap:2px"><b style="margin-bottom:8px">6 · Fonctions à activer</b><div id="op"></div></section>
        <section class="section" style="gap:10px"><b>7 · Abonnement et plaque</b>
          <div class="seg"><button data-f="standard">Standard</button><button data-f="offre">Offre fin d’année</button></div>
          <div class="kv" style="font-size:14px"><span>Installation</span><b>${TARIF.installation} DH</b></div>
          <div class="kv" style="font-size:14px"><span>Abonnement</span><b>${TARIF.mensuel} DH / mois</b></div>
          <div class="kv" style="font-size:14px"><span>Offre fin d’année (3 mois inclus)</span><b>${TARIF.offre} DH</b></div>
          <div class="plaque-ligne">${ic("qrcode", 20)}<span style="flex:1"><b>Plaque Kiffy</b> · scannez la plaque à installer</span><button class="lien" id="pl-scan">Scanner</button></div></section>
        <p class="err" id="c-err"></p>
        <button class="btn-noir" id="c-ok">${ex ? "Enregistrer" : "Créer et envoyer l’accès au gérant"}</button>
      </div></div>`;

    const dessine = () => {
      const col = s.couleur, ink = clair(col) ? "#0A0A0A" : "#FFFFFF", obj = s.objectif, u = s.unite || "visites", fond = srcFond(), tamp = s.type === "visites" && obj <= 15;
      const n = Math.min(obj, 10), plein = Math.min(7, n - 1);
      $("#ap").style.background = col;
      $("#ap").innerHTML = `<div class="h"><span class="lg">${s.logoData ? `<img src="${esc(s.logoData)}" alt="">` : esc(initiale(s.nom || "C"))}</span><span class="nm" style="color:${ink}">${esc(s.nom || "Nom du commerce")}</span><span class="u" style="color:${ink}">${esc(u.toUpperCase())}<span>${tamp ? plein : Math.round(obj * .7)} / ${obj}</span></span></div>
        <div class="bd" style="background:${col}">${fond ? `<img src="${esc(fond)}" alt="">` : ""}<div class="voile" style="background:${col};opacity:${fond ? .55 : 0}"></div>
          <div class="tp">${tamp ? Array.from({ length: n }, (_, i) => { const full = i < plein, last = i === n - 1; return `<span style="background:${full ? "#FFFFFF" : "transparent"};border:${full ? 0 : "2px dashed " + (clair(col) ? "rgba(10,10,10,.45)" : "rgba(255,255,255,.75)")};color:${clair(col) && !full ? "#0A0A0A" : col}">${last ? S.cadeau(14, clair(col) ? "#0A0A0A" : "#FFFFFF") : full ? S.coche(14, col) : ""}</span>`; }).join("") : `<div style="grid-column:1/-1;height:12px;border-radius:6px;background:rgba(255,255,255,.4);position:relative"><i style="position:absolute;left:0;top:0;bottom:0;width:70%;background:#fff;border-radius:6px"></i></div>`}</div></div>
        <div class="bas" style="color:${ink}"><span><small>RÉCOMPENSE</small><b>${esc(s.rec || "—")}</b></span><span style="text-align:right"><small>IL VOUS MANQUE</small><b>${tamp ? obj - plein : obj - Math.round(obj * .7)} ${esc(u)}</b></span></div>`;
      $$("#mt [data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === s.metier));
      $$("#cl [data-c]").forEach(b => b.classList.toggle("on", b.dataset.c.toLowerCase() === col.toLowerCase()));
      $("#ph").innerHTML = photos().map(([k, l, src]) => `<button class="photo-choix${!s.fondPerso && s.fond === k ? " on" : ""}" data-p="${k}">${src ? `<img src="${esc(src)}" alt="">` : ""}<span>${esc(l)}</span></button>`).join("") + (s.fondPerso ? `<button class="photo-choix on" data-p="perso"><img src="${esc(s.fondPerso)}" alt=""><span>Photo du commerce</span></button>` : "");
      $$("#ph [data-p]").forEach(b => (b.onclick = () => { if (b.dataset.p === "perso") return; s.fond = b.dataset.p; s.fondPerso = null; dessine(); }));
      $$(".seg [data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === s.type));
      $$(".seg [data-f]").forEach(b => b.classList.toggle("on", b.dataset.f === s.formule));
      $("#obj-aide").textContent = s.type === "montant" ? "(points · 10 DH = 1 point)" : "(visites)";
      $("#ob").innerHTML = OBJ[s.type].map(n => `<button class="${n === s.objectif ? "on" : ""}" data-o="${n}">${n}</button>`).join("");
      $$("#ob [data-o]").forEach(b => (b.onclick = () => { s.objectif = +b.dataset.o; dessine(); }));
      $("#rc").innerHTML = recs().map(t => `<button class="${t === s.rec ? "on" : ""}" data-r="${esc(t)}">${esc(t)}</button>`).join("");
      $$("#rc [data-r]").forEach(b => (b.onclick = () => { s.rec = b.dataset.r; $("#rc-x").value = s.rec; dessine(); }));
      $("#op").innerHTML = OPTS.map(([k, i, t, d]) => `<button class="fonction" data-k="${k}"><span class="ico">${ic(i, 20)}</span><span class="txt"><b>${esc(t)}</b><small>${esc(d)}</small></span><span class="inter p${s.on[k] ? " on" : ""}"></span></button>
        ${k === "avis" && s.on.avis ? `<div class="sous-champ"><label class="champ" style="font-weight:600">Lien « laisser un avis » Google<input id="av" value="${esc(s.lienAvis)}" placeholder="https://g.page/r/…/review" autocapitalize="off"></label></div>` : ""}
        ${k === "proche" && s.on.proche ? `<div class="sous-champ" style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:#5B665F"><span style="flex:1">${s.lieux.length ? `${s.lieux.length} adresse${s.lieux.length > 1 ? "s" : ""} enregistrée${s.lieux.length > 1 ? "s" : ""}` : "Aucune adresse : sur place, touchez « Je suis au commerce »"}</span><button class="lien" id="ici">Je suis au commerce</button></div>` : ""}
        ${k === "essai" && s.on.essai ? `<div class="sous-champ" style="font-size:12.5px;color:#5B665F">Fin de l’essai : ${new Date(ex && ex.expire ? ex.expire : jourPlus(7)).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div>` : ""}`).join("");
      $$("#op [data-k]").forEach(b => (b.onclick = () => { s.on[b.dataset.k] = !s.on[b.dataset.k]; dessine(); }));
      if ($("#av")) $("#av").oninput = e => (s.lienAvis = e.target.value.trim());
      if ($("#ici")) $("#ici").onclick = () => {
        if (!navigator.geolocation) { toast("Position non disponible."); return; }
        navigator.geolocation.getCurrentPosition(pos => { s.lieux = [...s.lieux, { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) }].slice(-10); toast("Adresse ajoutée"); dessine(); }, () => toast("Autorisez la position."), { enableHighAccuracy: true, timeout: 15000 });
      };
    };
    const champ = (id, k) => ($(id).oninput = e => { s[k] = e.target.value; if (k === "nom") dessine(); });
    champ("#c-nom", "nom"); champ("#c-ville", "ville"); champ("#c-tel", "tel"); champ("#c-mail", "email");
    $("#rc-x").oninput = e => { s.rec = e.target.value; dessine(); };
    $$("#mt [data-m]").forEach(b => (b.onclick = () => { const m = METIERS[b.dataset.m]; s.metier = b.dataset.m; s.rec = m.rec; s.unite = s.type === "montant" ? "points" : m.u; s.fond = ""; $("#rc-x").value = s.rec; dessine(); }));
    $$("#cl [data-c]").forEach(b => (b.onclick = () => { s.couleur = b.dataset.c; dessine(); }));
    $("#cl-logo").onclick = () => { if (s.couleurLogo) { s.couleur = s.couleurLogo; dessine(); } else toast("Ajoutez d’abord le logo (section 1)."); };
    $("#cl-code").onclick = () => {
      const f = feuille(`<h2>Code couleur</h2><label class="champ">Couleur (#RRGGBB)<input id="hx" maxlength="7" value="${esc(s.couleur)}" autocapitalize="off"></label><input type="color" id="hx2" value="${esc(s.couleur)}" style="width:100%;height:48px;border:0;background:none"><button class="btn-noir moyen" id="hx-ok">Appliquer</button>`);
      $("#hx2", f).oninput = e => ($("#hx", f).value = e.target.value);
      $("#hx-ok", f).onclick = () => { const v = $("#hx", f).value.trim(); if (!/^#[0-9a-f]{6}$/i.test(v)) { toast("Format : #16C172"); return; } s.couleur = v.toUpperCase(); f.remove(); dessine(); };
    };
    const surLogo = async e => { const fi = e.target.files[0]; if (!fi) return; try { const r = await lireLogo(fi); s.logoData = r.data; s.logoPng = r.png; s.couleurLogo = r.couleur; $("#lg").innerHTML = `<img src="${r.data}" alt=""><input type="file" accept="image/*" id="lg-f" hidden>`; $("#lg-f").onchange = surLogo; if (r.couleur) { s.couleur = r.couleur.toUpperCase(); toast("Couleur du logo appliquée"); } dessine(); } catch (x) { toast("Logo illisible : JPG ou PNG."); } };
    $("#lg-f").onchange = surLogo;
    $("#ph-f").onchange = async e => { const fi = e.target.files[0]; if (!fi) return; try { s.fondPerso = await lireFond(fi); dessine(); } catch (x) { toast("Photo illisible ou trop lourde."); } e.target.value = ""; };
    $$(".seg [data-t]").forEach(b => (b.onclick = () => { s.type = b.dataset.t; s.objectif = s.type === "montant" ? 200 : 10; s.unite = s.type === "montant" ? "points" : METIERS[s.metier].u; dessine(); }));
    $$(".seg [data-f]").forEach(b => (b.onclick = () => { s.formule = b.dataset.f; dessine(); }));
    $("#pl-scan").onclick = () => toast("Lier une plaque en la scannant : prochaine étape (phase 2).");
    dessine();

    $("#c-ok").onclick = async () => {
      const err = $("#c-err"), b = $("#c-ok"); err.textContent = "";
      const email = s.email.trim().toLowerCase();
      if (!s.nom.trim()) { err.textContent = "Écrivez le nom du commerce."; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "E-mail du gérant invalide."; return; }
      if (s.on.avis && !/^https:\/\//.test(s.lienAvis)) { err.textContent = "Collez le lien Google « laisser un avis » (https://…), ou désactivez Avis Google."; return; }
      b.disabled = true; b.textContent = "Enregistrement…";
      const m = METIERS[s.metier];
      const data = {
        metier: s.metier, nom: s.nom.trim().slice(0, 60), ville: s.ville.trim().slice(0, 40), telCommerce: s.tel.trim().slice(0, 20), ownerEmail: email,
        couleur: s.couleur, logoData: s.logoData, logo: "", logoPng: s.logoPng, type: s.type, objectif: s.objectif, unite: (s.unite || m.u).slice(0, 30), dhParPoint: 10,
        recompense: s.rec.trim().slice(0, 80) || m.rec, employes: s.on.employes, annivAuto: s.on.anniv, lienAvis: s.on.avis ? s.lienAvis : "",
        lieux: s.on.proche ? s.lieux : [], fondMetier: s.fondPerso ? "" : s.fond,
        kiffy: { wallet: s.on.wallet, relance: s.on.relance, promo: s.on.promo, formule: s.formule, installation: s.formule === "offre" ? TARIF.offre : TARIF.installation, mensuel: TARIF.mensuel, ...(ex && ex.kiffy && ex.kiffy.cree ? {} : { cree: FV.serverTimestamp() }) },
        maj: FV.serverTimestamp()
      };
      if (s.on.essai && !(ex && ex.essai)) Object.assign(data, { essai: true, expire: jourPlus(7), preavis: jourPlus(5) });
      if (!s.on.essai && ex && ex.essai) Object.assign(data, { essai: false, expire: "", preavis: "" });
      try {
        let id = ex && ex.id;
        if (!ex) {
          const base = slugify(data.nom); id = base; let i = 2;
          for (;;) { const [x, y] = await Promise.all([db.doc("fidProgrammes/" + id).get(), db.doc("settings/fidlien-" + id).get().catch(() => ({ exists: false }))]); if (!x.exists && !y.exists) break; id = base + "-" + i++; }
          Object.assign(data, { modeClient: "commercant", delaiH: 3, modeEmploye: "visite", actif: true, cadeauAnniv: "", annivMessage: "", createdAt: FV.serverTimestamp() });
        }
        await db.doc("fidProgrammes/" + id).set(data, { merge: true });
        if (s.fondPerso) await db.doc("fidFonds/" + id).set({ png: s.fondPerso, maj: Date.now(), ownerEmail: email });
        else if (ex) await db.doc("fidFonds/" + id).delete().catch(() => {});
        if (ex && String(ex.ownerEmail || "").toLowerCase() !== email) {   // nouvel e-mail : cartes et employés suivent (comme l'Espace)
          for (const col of ["fidCartes", "fidEmployes"]) { const q = await db.collection(col).where("pid", "==", id).get(); for (const d of q.docs) await d.ref.update({ ownerEmail: email }); }
        }
        if (!ex) {
          await db.doc(`kiffyPaiements/${id}-installation`).set({ pid: id, mois: "installation", libelle: s.formule === "offre" ? "Offre fin d’année (3 mois)" : "Installation", montant: data.kiffy.installation, paye: false, cree: FV.serverTimestamp() });
          b.textContent = "Envoi de l’accès…";
          const ok = await envoyerAcces({ id, ownerEmail: email });
          if (!ok) toast("Commerce créé. L’accès n’est pas parti : utilisez « Renvoyer l’accès ».", true);
        } else toast("Carte enregistrée (les Wallet se mettent à jour tout seuls)", true);
        progsAdmin = []; aller("#/admin/c/" + encodeURIComponent(id));
      } catch (e) { erreur(e); b.disabled = false; b.textContent = ex ? "Enregistrer" : "Créer et envoyer l’accès au gérant"; }
    };
  }

  /* ---------------- PWA ---------------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
})();
