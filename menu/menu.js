/* =========================================================
   NFCWORK — MENU DIGITAL (page publique, en français)
   Lien : nfcwork.ma/menu/<nom-du-menu>  (404.html renvoie ici avec ?m=<nom>)
   Le menu est lu dans Firestore (document « settings/menu-<nom> »), les photos
   envoyées dans « settings/mimg-<id> ». On les remplit depuis l'Espace → Menus.
   Une photo peut aussi être :  « u:<id> » = banque de photos (Unsplash)
                                « /chemin.jpg » = fichier du site (menus de démonstration)
   3 formules :
     standard : les photos de la carte papier, l'une sous l'autre
     pro      : menu designé (catégories, produits, photos, prix), 4 thèmes
     premium  : grande couverture, « À ne pas manquer », grandes photos, commande WhatsApp
   Démonstrations : nfcwork.ma/menu/demo-standard, demo-pro, demo-premium (menu/demos.json)
   ========================================================= */
(function () {
  "use strict";
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/settings/";
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- quel menu ? ---------- */
  const qs = new URLSearchParams(location.search);
  let slug = qs.get("m") || location.hash.slice(1) || "";
  const mp = location.pathname.match(/^\/menu\/([a-z0-9-]+)\/?$/i);
  if (!slug && mp) slug = mp[1];
  slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (slug === "demo") slug = "demo-premium";
  const apercu = qs.has("apercu");
  const tableQR = String(qs.get("table") || "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 6);   // stand de table numéroté
  const demo = /^demo-[a-z]+$/.test(slug);   // démonstrations : menu/demos.json (resto, location, salon, hotel, boutique…)

  const U = {
    none: "Menu introuvable", noneTx: "Vérifiez le lien ou demandez au personnel.", off: "Menu bientôt disponible", offTx: "Ce menu est en cours de mise à jour.",
    load: "Chargement du menu…", zoom: "Touchez une page pour l'agrandir", soldout: "Épuisé", order: "Ma commande", see: "Voir ma commande", total: "Total",
    table: "Table ou nom", note: "Remarque", opt: "(facultatif)", send: "Envoyer la commande sur WhatsApp", close: "Fermer", empty: "Votre commande est vide.",
    hello: "Bonjour, je souhaite commander :", by: "Menu digital par", add: "Ajouter", top: "À ne pas manquer", carte: "La carte"
  };

  // type de commerce : change les mots de la page et ce qu'on demande au client
  const TYPES = {
    resto: { carte: "La carte", choix: "choix", order: "Ma commande", hello: "Bonjour, je souhaite commander :", titre: "Menu", add: "Ajouter" },
    boutique: { carte: "Catalogue", choix: "articles", order: "Mon panier", hello: "Bonjour, je souhaite commander :", titre: "Catalogue", add: "Ajouter" },
    salon: { carte: "Nos services", choix: "services", order: "Mon rendez-vous", hello: "Bonjour, je souhaite prendre rendez-vous :", titre: "Rendez-vous", add: "Choisir" },
    hotel: { carte: "Room service", choix: "choix", order: "Ma commande", hello: "Room service, je souhaite commander :", titre: "Room service", add: "Ajouter" },
    location: { carte: "Nos voitures", choix: "véhicules", order: "Ma réservation", hello: "Bonjour, je souhaite louer :", titre: "Location", add: "Choisir" }
  };
  const TY = () => TYPES[M && M.type] || TYPES.resto;
  let M = null, panier = {};
  let liv = null;   // livraison activée par le commerce : { frais, min, zone }
  // texte enregistré en chaîne ou en { fr: … } (anciens menus) → toujours la version française
  const tr = x => x == null ? "" : typeof x === "string" ? x : (x.fr || Object.values(x).find(Boolean) || "");
  const prixNum = p => { const n = parseFloat(String(p || "").replace(",", ".").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
  const fmtPrix = p => { const s = String(p == null ? "" : p).trim(); if (!s) return ""; return /[a-z€$]/i.test(s) ? s : s + " " + (M.devise || "DH"); };
  const waNum = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 9 ? d : ""; };
  const arr = n => String(Math.round(n * 100) / 100);

  function etat(titre, texte, spin) {
    app.innerHTML = `<div class="state"><div>${spin ? '<div class="spin"></div>' : ""}${titre ? `<h1>${esc(titre)}</h1>` : ""}<div>${esc(texte || "")}</div></div></div>`;
  }

  /* ---------- lecture Firestore (REST, sans charger Firebase) ---------- */
  const CLE = "nfcwork-menu-" + slug;
  async function lireDoc(id) {
    const r = await fetch(DOC + id, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("http " + r.status);
    return (await r.json()).fields || {};
  }

  // Plats épuisés cochés par le commerçant lui-même (Espace client) : dispo/<slug> { off:[ids] }
  let OFF = null;
  function lireDispo() {
    if (demo || !slug) return;
    fetch(DOC.replace(/settings\/$/, "dispo/") + slug, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => {
      const v = j && j.fields && j.fields.off && j.fields.off.arrayValue;
      const l = ((v && v.values) || []).map(x => x.stringValue).filter(Boolean);
      const nv = new Set(l), avant = OFF ? [...OFF].sort().join() : "";
      OFF = nv;
      if (M && [...nv].sort().join() !== avant) { appliquerDispo(); rendre(); }
    }).catch(() => {});
  }
  function appliquerDispo() {
    if (!M || !OFF) return;
    (M.categories || []).forEach(c => (c.items || []).forEach(i => { if (i.__off) { delete i.__off; i.dispo = true; } if (OFF.has(i.id) && i.dispo !== false) { i.dispo = false; i.__off = 1; } }));
  }

  // Photos : un id ne change jamais → gardée dans le cache du navigateur
  const imgCache = {};
  const posCouv = () => /^\d{1,3}% \d{1,3}%$/.test(M && M.couvPos || "") ? ` style="object-position:${M.couvPos}"` : "";
  const unsplash = (id, w) => "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + w + "&q=75";
  async function photo(id, w) {
    if (!id) return "";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (id.startsWith("u:")) return unsplash(id.slice(2), Math.round((w || 400) * dpr / 100) * 100);
    if (id.startsWith("o:") && /^o:[0-9/]{4,40}\/front_[a-z]{2}\.\d{1,4}$/.test(id)) return "https://images.openfoodfacts.org/images/products/" + id.slice(2) + ((w || 400) > 500 ? ".full.jpg" : ".400.jpg");
    if (id.startsWith("o:")) return "";
    if (id.startsWith("/")) return id;
    if (imgCache[id]) return imgCache[id];
    const k = "/__menu-img/" + id;
    let box = null;
    try { box = await caches.open("nfcwork-menu-img"); const hit = await box.match(k); if (hit) return (imgCache[id] = await hit.text()); } catch (e) {}
    const f = await lireDoc("mimg-" + id).catch(() => null);
    const d = f && f.data && f.data.stringValue;
    if (!d || !d.startsWith("data:image/")) return "";
    imgCache[id] = d;
    try { if (box) box.put(k, new Response(d)); } catch (e) {}
    return d;
  }
  // remplit toutes les <img data-img="id" data-w="largeur affichée"> (6 en même temps)
  async function remplirPhotos() {
    const els = [...document.querySelectorAll("img[data-img]")].filter(e => !e.src);
    let i = 0;
    const suivant = async () => {
      while (i < els.length) {
        const el = els[i++];
        const d = await photo(el.dataset.img, +el.dataset.w || 400);
        if (d) el.src = d; else el.removeAttribute("data-img");
      }
    };
    await Promise.all(Array.from({ length: 6 }, suivant));
  }

  async function charger() {
    if (!slug) { etat(U.none, U.noneTx); return; }
    lireDispo(); setInterval(() => { if (!document.hidden) lireDispo(); }, 60000);
    if (demo) {
      try {
        const all = await (await fetch("/menu/demos.json", { cache: "no-cache" })).json();
        const m = all[slug];
        if (m && slug === "demo-pro" && ["nuit", "creme", "cafe", "lagon"].includes(qs.get("theme"))) m.theme = qs.get("theme");
        if (m) demarrer(m); else etat(U.none, U.noneTx);
      } catch (e) { etat(U.none, "Connexion impossible. Réessayez dans un instant."); }
      return;
    }
    let memo = null;
    try { memo = JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) {}
    if (memo && memo.json && !apercu) { try { demarrer(JSON.parse(memo.json)); } catch (e) {} }
    else etat("", U.load, true);
    try {
      const f = await lireDoc("menu-" + slug);
      if (!f) { if (!M) etat(U.none, U.noneTx); return; }
      const json = (f.json && f.json.stringValue) || "{}";
      if (memo && memo.json === json && M) return;
      try { localStorage.setItem(CLE, JSON.stringify({ json })); } catch (e) {}
      demarrer(JSON.parse(json));
    } catch (e) {
      if (!M) etat(U.none, "Connexion impossible. Réessayez dans un instant.");
    }
  }

  /* ---------- démarrage ---------- */
  function demarrer(data) {
    M = data || {};
    const root = document.documentElement;
    root.lang = "fr"; root.dir = "ltr";
    root.dataset.theme = ["nuit", "creme", "cafe", "lagon"].includes(M.theme) ? M.theme : "nuit";
    if (/^#[0-9a-f]{6}$/i.test(M.couleur || "")) {
      root.style.setProperty("--accent", M.couleur);
      root.style.setProperty("--on-accent", clair(M.couleur) ? "#16130d" : "#ffffff");
    } else { root.style.removeProperty("--accent"); root.style.removeProperty("--on-accent"); }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim() || "#0d0f14";
    if (mp === null && !apercu && history.replaceState) { try { history.replaceState(null, "", "/menu/" + slug + location.search.replace(/[?&]m=[^&]*/, "").replace(/^&/, "?")); } catch (e) {} }
    appliquerDispo();
    rendre();
    if (!apercu && !demo && !/^essai-/.test(slug) && window.NFCW_VUE) NFCW_VUE("menu", slug);
  }
  function clair(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
  }

  /* ---------- icônes ---------- */
  const I = {
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/></svg>'
  };

  /* ---------- rendu ---------- */
  function puces() {
    const inf = M.infos || {}, c = [];
    if (inf.horaires) c.push(`<span class="chip">${I.clock}${esc(inf.horaires)}</span>`);
    if (inf.adresse || inf.maps) {
      const href = inf.maps || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(inf.adresse);
      c.push(`<a class="chip" href="${esc(href)}" target="_blank" rel="noopener">${I.pin}${esc(inf.adresse || "Google Maps")}</a>`);
    }
    if (inf.tel) c.push(`<a class="chip" href="tel:${esc(inf.tel.replace(/[^\d+]/g, ""))}">${I.phone}${esc(inf.tel)}</a>`);
    if (inf.instagram) {
      const ig = inf.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
      c.push(`<a class="chip" href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">${I.insta}@${esc(ig)}</a>`);
    }
    return c.length ? `<div class="chips">${c.join("")}</div>` : "";
  }
  const logoTag = () => M.logo ? `<img class="logo${M.logoCarre ? " sq" : ""}" data-img="${esc(M.logo)}" data-w="120" alt="${esc(M.nom || "")}">` : "";

  function barreDemo() {
    if (!demo || qs.has("cadre")) return "";
    if (!/^demo-(standard|pro|premium)$/.test(slug)) return `<div class="demobar"><b>Exemple NFCWORK</b><a href="/demo/" class="on">Voir tous les métiers</a></div>`;
    const f = slug.slice(5), th = M.theme || "nuit";
    return `<div class="demobar"><b>Exemple NFCWORK</b>${["standard", "pro", "premium"].map(k => `<a href="/menu/?m=demo-${k}" class="${f === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</a>`).join("")}
      ${f === "pro" ? `<span class="th">Thème : ${[["nuit", "Nuit"], ["creme", "Crème"], ["cafe", "Café"], ["lagon", "Lagon"]].map(([k, n]) => `<a href="/menu/?m=demo-pro&theme=${k}" class="${th === k ? "on" : ""}">${n}</a>`).join("")}</span>` : ""}</div>`;
  }

  // icône « application » : le logo du commerce quand on ajoute le menu à l'écran d'accueil
  let iconeFaite = "";
  async function iconeApp() {
    const cle = (M.logo || "") + "|" + (M.nom || "");
    if (iconeFaite === cle) return;
    iconeFaite = cle;
    const meta = (n, c) => { let m = document.querySelector(`meta[name="${n}"]`); if (!m) { m = document.createElement("meta"); m.name = n; document.head.appendChild(m); } m.content = c; };
    meta("apple-mobile-web-app-title", String(M.nom || "Menu").slice(0, 30));
    meta("apple-mobile-web-app-capable", "yes");
    meta("mobile-web-app-capable", "yes");
    if (!M.logo) return;
    try {
      const src = await photo(M.logo, 400);
      if (!src) return;
      const img = await new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = ko; i.src = src; });
      const T = 180, c = document.createElement("canvas"); c.width = c.height = T;
      const x = c.getContext("2d");
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, T, T);
      const marge = T * 0.1, k = Math.min((T - 2 * marge) / img.naturalWidth, (T - 2 * marge) / img.naturalHeight);
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      x.drawImage(img, (T - w) / 2, (T - h) / 2, w, h);
      const url = c.toDataURL("image/png");
      document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(l => l.remove());
      const l = document.createElement("link"); l.rel = "apple-touch-icon"; l.sizes = "180x180"; l.href = url; document.head.appendChild(l);
      const ic = document.querySelector('link[rel="icon"]'); if (ic) { ic.href = url; ic.removeAttribute("sizes"); }
      // Android / Chrome : petit manifeste avec le même logo
      const man = { name: M.nom || "Menu", short_name: String(M.nom || "Menu").slice(0, 12), start_url: location.href, scope: location.origin + "/menu/", display: "standalone", background_color: "#ffffff", theme_color: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0d0f14", icons: [{ src: url, sizes: "180x180", type: "image/png" }] };
      document.querySelectorAll('link[rel="manifest"]').forEach(m => m.remove());
      const lm = document.createElement("link"); lm.rel = "manifest"; lm.href = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: "application/manifest+json" })); document.head.appendChild(lm);
    } catch (e) { iconeFaite = ""; }
  }

  function rendre() {
    document.title = (M.nom || "Menu") + " · " + TY().titre;
    U.order = TY().order; U.hello = TY().hello; U.add = TY().add; U.carte = TY().carte;
    U.table = M.type === "hotel" ? "Numéro de chambre" : M.type === "boutique" ? "Votre nom" : "Table ou nom";
    if (tableQR && M.type === "hotel" && saisie.table === "Table " + tableQR) saisie.table = "Chambre " + tableQR;
    U.soldout = M.type === "location" ? "Indisponible" : "Épuisé";
    U.send = M.type === "salon" ? "Envoyer la demande de rendez-vous sur WhatsApp" : M.type === "location" ? "Envoyer la demande de réservation sur WhatsApp" : "Envoyer la commande sur WhatsApp";
    U.see = M.type === "salon" ? "Voir mon rendez-vous" : M.type === "boutique" ? "Voir mon panier" : "Voir ma commande";
    if (!apercu) iconeApp();
    if (M.actif === false && !apercu && !demo) { etat(U.off, U.offTx); return; }
    // abonnement NFCWORK non payé : coupure automatique après la date prévue
    if (M.expire && !apercu && !demo) { const d = new Date(), j = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; if (j > String(M.expire)) { etat("Menu momentanément indisponible", "Merci de revenir un peu plus tard ou de demander au personnel."); return; } }
    const pro = M.formule === "pro" || M.formule === "premium";
    const prem = M.formule === "premium";
    const off = (M.categories || []).some(c => (c.items || []).some(i => String(i.photo || "").startsWith("o:")));
    const pied = `<footer>${U.by} <a href="https://nfcwork.ma" target="_blank" rel="noopener"><b>NFCWORK</b></a>${off ? `<br><small style="opacity:.7">Photos produits : <a href="https://openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (CC BY-SA)</small>` : ""}</footer>`;
    document.body.classList.toggle("prem", prem);
    document.body.classList.toggle("has-cover", pro && !prem && !!M.couverture);

    if (!pro) {
      const pages = (M.pages || []).filter(Boolean);
      app.innerHTML = `${barreDemo()}<div class="head wrap">${logoTag()}<h1>${esc(M.nom || "Menu")}</h1>${tr(M.slogan) ? `<p class="slogan">${esc(tr(M.slogan))}</p>` : ""}${puces()}</div>
        <div class="wrap">${pages.length ? `<p class="hint">${U.zoom}</p>` : ""}
        <div class="pages">${pages.map((id, i) => `<div class="page" data-zoom="${esc(id)}"><img data-img="${esc(id)}" data-w="720" alt="Menu — page ${i + 1}"></div>`).join("")}</div></div>${pied}`;
      remplirPhotos();
      return;
    }

    const inf = M.infos || {};
    const cats = (M.categories || []).filter(c => (c.items || []).length);   // une catégorie sans produit ne s’affiche pas
    const waOk = prem && waNum(inf.whatsapp) && M.commande !== false;
    const L = M.livraison || {};
    liv = waOk && L.actif ? { frais: prixNum(L.frais), min: prixNum(L.min), zone: String(L.zone || "").trim() } : null;
    if (liv && !saisie.mode) saisie.mode = qs.has("livraison") ? "livraison" : "place";
    const promo = promosActives().map(p => `<div class="wrap"><div class="promoban"><b>🔥 ${esc(p.texte)}</b>${p.de && p.a ? `<span>${esc(p.de.replace(":", "h"))} – ${esc(p.a.replace(":", "h"))}${(p.jours || []).length && p.jours.length < 7 ? " · " + p.jours.map(j => JOURS[j]).join(", ") : ""}</span>` : ""}</div></div>`).join("");
    const resaOk = prem && waNum(inf.whatsapp) && (M.reservation || {}).actif && M.type !== "salon" && M.type !== "boutique";
    const resa = resaOk ? `<div class="wrap"><button class="resabtn" id="resa">📅 ${M.type === "hotel" ? "Réserver une chambre ou une table" : "Réserver une table"}</button></div>` : "";
    const bandeau = promo + resa + (liv ? `<div class="wrap"><div class="livban"><b>🛵 ${liv.frais ? "Livraison " + esc(fmtPrix(arr(liv.frais))) : "Livraison gratuite"}</b><span>${liv.zone ? esc(liv.zone) + " · " : ""}${liv.min ? "dès " + esc(fmtPrix(arr(liv.min))) + " · " : ""}commandez ici, recevez chez vous</span></div></div>` : "");
    const nav = cats.length > 1 ? `<nav class="cats"><div class="cats-in">${cats.map(c => `<a href="#c-${esc(c.id)}" data-cat="${esc(c.id)}">${esc(tr(c.nom))}</a>`).join("")}</div></nav>` : "";
    const fin = `${pied}${waOk ? `<button class="cartbar" id="cartbar" hidden></button>` : ""}
      ${prem && !qs.has("cadre") && waNum(inf.whatsapp) && !waOk ? `<a class="wafab" href="https://wa.me/${waNum(inf.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ""}`;

    if (prem) {
      const vedettes = cats.flatMap(c => c.items || []).filter(i => i.vedette && i.photo && i.dispo !== false);
      app.innerHTML = `${barreDemo()}
        <header class="phero">${M.couverture ? `<img class="bgf" data-img="${esc(M.couverture)}" data-w="900" alt="" aria-hidden="true"${posCouv()}><img class="fg" data-img="${esc(M.couverture)}" data-w="900" alt=""${posCouv()}>` : ""}
          <div class="in">${logoTag()}<h1>${esc(M.nom || "Menu")}</h1>${tr(M.slogan) ? `<p class="slogan">${esc(tr(M.slogan))}</p>` : ""}<div class="orn">${U.carte}</div></div></header>
        <div class="wrap pinfo">${puces()}${tableQR ? `<div style="text-align:center"><span class="tablechip">${M.type === "hotel" ? "🛏 Chambre " : "🪑 Table "}${esc(tableQR)}</span></div>` : ""}</div>
        ${bandeau}
        ${vedettes.length ? `<section class="wrap vedettes"><h2>${U.top}</h2><div class="vscroll">${vedettes.map(it => vcarte(it, waOk)).join("")}</div></section>` : ""}
        ${nav}
        <div class="wrap">${cats.map(c => `<section class="cat" id="c-${esc(c.id)}"><h2>${esc(tr(c.nom))}</h2><div class="orn">${(c.items || []).length} ${TY().choix}</div>
          <div class="pgrid">${(c.items || []).map(it => it.photo ? pcarte(it, waOk) : carte(it, waOk)).join("")}</div></section>`).join("")}</div>
        ${fin}`;
    } else {
      const cover = !!M.couverture;
      app.innerHTML = `${barreDemo()}
        ${cover ? `<div class="hero"><img class="cover" data-img="${esc(M.couverture)}" data-w="760" alt=""${posCouv()}></div>` : ""}
        <div class="head wrap">${logoTag()}<h1>${esc(M.nom || "Menu")}</h1>${tr(M.slogan) ? `<p class="slogan">${esc(tr(M.slogan))}</p>` : ""}${puces()}</div>
        ${promo}
        ${nav}
        <div class="wrap">${cats.map(c => `<section class="cat" id="c-${esc(c.id)}"><h2>${esc(tr(c.nom))}</h2><div class="items">${(c.items || []).map(it => carte(it, false)).join("")}</div></section>`).join("")}</div>
        ${fin}`;
    }
    espion();
    majPanier();
    remplirPhotos();
  }

  /* ---------- promos et happy hour : affichées seulement aux jours et heures prévus ---------- */
  const JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  function promosActives(quand) {
    const d = quand || new Date(), j = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
    const mn = t => { const x = String(t || "").match(/^(\d{1,2}):(\d{2})$/); return x ? +x[1] * 60 + +x[2] : null; };
    return (M.promos || []).filter(p => {
      if (!p || p.actif === false || !String(p.texte || "").trim()) return false;
      if ((p.jours || []).length && !p.jours.includes(j)) return false;
      const a = mn(p.de), b = mn(p.a);
      if (a == null || b == null || a === b) return true;
      return a < b ? m >= a && m < b : m >= a || m < b;   // ex. 22:00 → 02:00
    });
  }
  window.NFCW_PROMOS = promosActives;

  function ctrl(it, waOk, gros) {
    const off = it.dispo === false;
    if (off) return `<span class="tag">${U.soldout}</span>`;
    if (!waOk || (prixNum(it.prix) <= 0 && M.type !== "location")) return "";   // location : on réserve même sans prix affiché
    const q = panier[it.id] || 0;
    return q ? `<span class="qty"><button data-moins="${esc(it.id)}" aria-label="Retirer">−</button><b>${q}</b><button data-plus="${esc(it.id)}" aria-label="Ajouter">+</button></span>`
             : `<button class="add" data-plus="${esc(it.id)}" aria-label="${U.add}">+${gros ? " " + U.add : ""}</button>`;
  }
  const parJour = () => (M.type === "location" ? " / jour" : "");
  const pk = id => (String(id || "").startsWith("o:") ? " pk" : "");   // photo de produit emballé : affichée en entier sur fond blanc
  // ligne compacte (Pro, ou produit sans photo en Premium)
  function carte(it, waOk) {
    const p = fmtPrix(it.prix);
    return `<article class="item${it.dispo === false ? " off" : ""}" data-item="${esc(it.id)}">
      ${it.photo ? `<img class="ph${pk(it.photo)}" data-img="${esc(it.photo)}" data-w="130" data-zoom="${esc(it.photo)}" alt="${esc(tr(it.nom))}" loading="lazy">` : ""}
      <div class="tx"><h3>${esc(tr(it.nom))}</h3>${tr(it.desc) ? `<p>${esc(tr(it.desc))}</p>` : ""}
      <div class="bot">${p ? `<span class="price">${esc(p)}${parJour()}</span>` : "<span></span>"}${ctrl(it, waOk)}</div></div></article>`;
  }
  // grande carte photo (Premium)
  function pcarte(it, waOk) {
    const p = fmtPrix(it.prix);
    return `<article class="pcard${it.dispo === false ? " off" : ""}" data-item="${esc(it.id)}">
      <img class="ph${pk(it.photo)}" data-img="${esc(it.photo)}" data-w="700" data-zoom="${esc(it.photo)}" alt="${esc(tr(it.nom))}" loading="lazy">
      <div class="tx"><div class="top"><h3>${esc(tr(it.nom))}</h3>${p ? `<span class="price">${esc(p)}${parJour()}</span>` : ""}</div>
      ${tr(it.desc) ? `<p>${esc(tr(it.desc))}</p>` : ""}<div class="bot">${ctrl(it, waOk, true)}</div></div></article>`;
  }
  // carte « À ne pas manquer »
  function vcarte(it, waOk) {
    const p = fmtPrix(it.prix);
    return `<article class="vcard" data-item="${esc(it.id)}" data-v="1">
      <img class="ph${pk(it.photo)}" data-img="${esc(it.photo)}" data-w="320" data-zoom="${esc(it.photo)}" alt="${esc(tr(it.nom))}" loading="lazy">
      <div class="tx"><h3>${esc(tr(it.nom))}</h3><div class="bot">${p ? `<span class="price">${esc(p)}${parJour()}</span>` : "<span></span>"}${ctrl(it, waOk)}</div></div></article>`;
  }

  /* catégorie visible = puce allumée */
  let obs = null;
  function espion() {
    if (obs) obs.disconnect();
    const nav = document.querySelector(".cats-in");
    if (!nav || !("IntersectionObserver" in window)) return;
    obs = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const id = e.target.id.slice(2);
        nav.querySelectorAll("a").forEach(a => {
          const on = a.dataset.cat === id;
          a.classList.toggle("on", on);
          if (on) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2, behavior: "smooth" });
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll(".cat").forEach(s => obs.observe(s));
  }

  /* ---------- panier WhatsApp (premium) ---------- */
  const tousItems = () => (M.categories || []).flatMap(c => c.items || []);
  function majPanier() {
    const bar = document.getElementById("cartbar");
    if (!bar) return;
    const its = tousItems();
    let n = 0, t = 0;
    for (const [id, q] of Object.entries(panier)) { const it = its.find(x => x.id === id); if (it) { n += q; t += q * prixNum(it.prix); } }
    bar.hidden = !n;
    bar.innerHTML = `<span>${U.see} (${n})</span><span>${esc(fmtPrix(arr(t)))}</span>`;
  }
  function rafraichirItem(id) {
    const it = tousItems().find(x => x.id === id);
    if (!it) return;
    document.querySelectorAll(`[data-item="${CSS.escape(id)}"]`).forEach(el => {
      const tmp = document.createElement("div");
      tmp.innerHTML = el.dataset.v ? vcarte(it, true) : el.classList.contains("pcard") ? pcarte(it, true) : carte(it, true);
      const neuf = tmp.firstElementChild, old = el.querySelector("img.ph"), ni = neuf.querySelector("img.ph");
      if (old && ni && old.src) ni.src = old.src;
      el.replaceWith(neuf);
    });
    majPanier();
  }
  // ce que le client a écrit reste gardé, même si la fenêtre se redessine (quand il change une quantité)
  const joursLoc = () => { if (!saisie.date || !saisie.fin) return 0; const n = Math.round((new Date(saisie.fin + "T12:00:00") - new Date(saisie.date + "T12:00:00")) / 864e5); return n > 0 ? n : 0; };
  const saisie = { fin: "", hfin: "", table: tableQR ? "Table " + tableQR : "", note: "", mode: "", nom: "", tel: "", adresse: "", pos: "", gps: "", date: "", heure: "", pers: "" };
  function feuille() {
    const its = tousItems();
    const lignes = Object.entries(panier).map(([id, q]) => ({ it: its.find(x => x.id === id), q })).filter(x => x.it && x.q);
    const total = lignes.reduce((a, l) => a + l.q * prixNum(l.it.prix), 0);
    const d = document.createElement("div");
    d.className = "sheet";
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true"><h2>${U.order}</h2>
      ${lignes.length ? lignes.map(l => `<div class="line"><div class="n">${esc(tr(l.it.nom))}<br><small>${esc(fmtPrix(l.it.prix))}</small></div><span class="qty"><button data-moins="${esc(l.it.id)}">−</button><b>${l.q}</b><button data-plus="${esc(l.it.id)}">+</button></span></div>`).join("")
        + blocFin(total)
        + `<button class="wa" id="c-send">${I.wa.replace("<svg", '<svg width="22" height="22"')} ${U.send}</button><p class="cerr" id="c-err"></p>`
        : `<p>${U.empty}</p>`}
      <button class="ghost" data-fermer>${U.close}</button></div>`;
    document.body.appendChild(d);
    d.addEventListener("input", e => { const k = (e.target.id || "").replace(/^c-/, ""); if (k in saisie && k !== "mode") saisie[k] = e.target.value; });
    d.addEventListener("change", e => { if (M.type === "location" && /^c-(date|fin)$/.test(e.target.id || "")) { d.remove(); feuille(); } });
    d.addEventListener("click", e => {
      if (e.target === d || e.target.closest("[data-fermer]")) { d.remove(); return; }
      const p = e.target.closest("[data-plus]"), m = e.target.closest("[data-moins]");
      if (p || m) { changer((p || m).dataset[p ? "plus" : "moins"], p ? 1 : -1); d.remove(); feuille(); return; }
      const md = e.target.closest("[data-mode]");
      if (md) { saisie.mode = md.dataset.mode; d.remove(); feuille(); return; }
      if (e.target.closest("#c-geo")) { position(d); return; }
      if (e.target.closest("#c-send")) envoyer(lignes, total, d);
    });
  }
  function changer(id, delta) {
    const q = Math.max(0, (panier[id] || 0) + delta);
    if (q) panier[id] = q; else delete panier[id];
    rafraichirItem(id);
  }
  const enLivraison = () => !!liv && saisie.mode === "livraison";
  // bas de la fenêtre : total, sur place / livraison, champs du client
  function blocFin(total) {
    const champ = (k, label, attrs) => `<label class="f">${label}<input id="c-${k}" value="${esc(saisie[k])}" ${attrs || ""}></label>`;
    if (M.type === "location") {
      const j = joursLoc();
      return `<div class="grid2">${champ("date", "📅 Je prends le", `type="date" min="${aujourdhui()}"`)}${champ("heure", "🕘 à", 'type="time" step="900"')}</div>
        <div class="grid2">${champ("fin", "📅 Je rends le", `type="date" min="${saisie.date || aujourdhui()}"`)}${champ("hfin", "🕘 à", 'type="time" step="900"')}</div>
        ${j ? `<div class="sous"><span>Durée</span><span>${j} jour${j > 1 ? "s" : ""}</span></div>${total > 0 ? `<div class="total"><span>${U.total} estimé</span><span>${esc(fmtPrix(arr(total * j)))}</span></div>` : ""}` : `<p class="hint" style="margin:6px 0">Choisissez les dates${total > 0 ? " pour voir le prix total" : ""}.</p>`}
        ${champ("nom", "Votre nom", 'maxlength="60" autocomplete="name"')}${champ("tel", "Téléphone", 'type="tel" inputmode="tel" maxlength="20" autocomplete="tel"')}
        ${champ("note", `Lieu de livraison du véhicule, remarque ${U.opt}`, 'maxlength="200"')}`;
    }
    if (M.type === "salon") return `<div class="total"><span>${U.total}</span><span>${esc(fmtPrix(arr(total)))}</span></div>
        <div class="grid2">${champ("date", "Jour souhaité", `type="date" min="${aujourdhui()}"`)}${champ("heure", "Heure souhaitée", 'type="time" step="900"')}</div>
        ${champ("nom", "Votre nom", 'maxlength="60" autocomplete="name"')}${champ("note", `${U.note} ${U.opt}`, 'maxlength="200"')}`;
    if (!liv) return `<div class="total"><span>${U.total}</span><span>${esc(fmtPrix(arr(total)))}</span></div>
        ${champ("table", M.type === "hotel" ? U.table : `${U.table} ${U.opt}`, 'maxlength="60"' + (M.type === "hotel" ? ' inputmode="numeric"' : ""))}${champ("note", `${U.note} ${U.opt}`, 'maxlength="200"')}`;
    const lv = enLivraison();
    const choix = `<div class="mode"><button type="button" data-mode="place" aria-pressed="${!lv}">🍽 Sur place</button><button type="button" data-mode="livraison" aria-pressed="${lv}">🛵 Livraison</button></div>`;
    if (!lv) return choix + `<div class="total"><span>${U.total}</span><span>${esc(fmtPrix(arr(total)))}</span></div>
        ${champ("table", `${U.table} ${U.opt}`, 'maxlength="60"')}${champ("note", `${U.note} ${U.opt}`, 'maxlength="200"')}`;
    const manque = liv.min && total < liv.min ? liv.min - total : 0;
    return choix + `<div class="sous"><span>Sous-total</span><span>${esc(fmtPrix(arr(total)))}</span></div>
        <div class="sous"><span>Livraison</span><span>${liv.frais ? esc(fmtPrix(arr(liv.frais))) : '<b class="gratuit">Gratuite</b>'}</span></div>
        <div class="total"><span>${U.total}</span><span>${esc(fmtPrix(arr(total + liv.frais)))}</span></div>
        ${manque ? `<p class="cmin">Commande minimum ${esc(fmtPrix(arr(liv.min)))} pour la livraison : ajoutez encore ${esc(fmtPrix(arr(manque)))}.</p>` : ""}
        ${champ("nom", "Votre nom", 'maxlength="60" autocomplete="name"')}
        ${champ("tel", "Téléphone", 'type="tel" inputmode="tel" maxlength="20" autocomplete="tel"')}
        ${champ("adresse", "Adresse (quartier, rue, immeuble, étage)", 'maxlength="200" autocomplete="street-address"')}
        <button type="button" class="posbtn" id="c-geo">📍 ${saisie.pos ? "Position ajoutée ✓ (toucher pour la mettre à jour)" : "Envoyer ma position"}</button>
        ${champ("pos", "Ou collez le lien de votre localisation (Google Maps, Plans d’Apple…)", 'maxlength="300" inputmode="url" autocapitalize="off"')}
        ${champ("note", `Remarque : allergie, sans oignon… ${U.opt}`, 'maxlength="200"')}`;
  }
  function position(d) {
    const b = d.querySelector("#c-geo");
    if (!navigator.geolocation) { b.textContent = "📍 Position non disponible : collez le lien ci-dessous"; return; }
    b.textContent = "📍 Recherche de votre position…";
    navigator.geolocation.getCurrentPosition(p => {
      saisie.gps = `${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`;
      saisie.pos = `https://maps.google.com/?q=${saisie.gps}`;
      const champPos = d.querySelector("#c-pos");
      if (champPos) champPos.value = saisie.pos;
      b.textContent = "📍 Position ajoutée ✓";
    }, () => { b.textContent = "📍 Position refusée : collez le lien ci-dessous ou écrivez l’adresse"; }, { enableHighAccuracy: true, timeout: 15000 });
  }
  // position GPS → lien Google Maps ET lien Plans (Apple) : le livreur ouvre celui de son téléphone
  function positionTexte() {
    const p = saisie.pos.trim();
    if (saisie.gps && p === `https://maps.google.com/?q=${saisie.gps}`)
      return ["📍 Position du client :", `Google Maps : https://maps.google.com/?q=${saisie.gps}`, `Plans (iPhone) : https://maps.apple.com/?ll=${saisie.gps}&q=Livraison`];
    const m = p.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);   // lien collé contenant des coordonnées
    if (m) return ["📍 Position du client :", `Google Maps : https://maps.google.com/?q=${m[1]},${m[2]}`, `Plans (iPhone) : https://maps.apple.com/?ll=${m[1]},${m[2]}&q=Livraison`];
    return p ? [`📍 Localisation : ${p}`] : [];
  }
  function envoyer(lignes, total, d) {
    const table = (d.querySelector("#c-table") || {}).value || saisie.table, note = (d.querySelector("#c-note") || {}).value || saisie.note;
    const liste = lignes.map(l => `• ${l.q} × ${tr(l.it.nom)} — ${fmtPrix(arr(l.q * prixNum(l.it.prix)))}`);
    let txt;
    if (M.type === "location") {
      const err = d.querySelector("#c-err"), j = joursLoc();
      if (!j) { err.textContent = "Choisissez la date de départ et la date de retour."; return; }
      if (!saisie.tel.trim()) { err.textContent = "Indiquez votre numéro de téléphone."; return; }
      const liste2 = lignes.map(l => `• ${l.q > 1 ? l.q + " × " : ""}${tr(l.it.nom)}${prixNum(l.it.prix) > 0 ? " — " + fmtPrix(l.it.prix) + " / jour" : ""}`);
      const h = x => x ? " à " + x.replace(":", "h") : "";
      txt = [U.hello, "", ...liste2, "", `🚗 Départ : ${dateFr(saisie.date)}${h(saisie.heure)}`, `🔑 Retour : ${dateFr(saisie.fin)}${h(saisie.hfin)}`, `⏱ Durée : ${j} jour${j > 1 ? "s" : ""}`].concat(total > 0 ? [`💰 Total estimé : ${fmtPrix(arr(total * j))}`] : [], [""])
        .concat(saisie.nom.trim() ? [`Nom : ${saisie.nom.trim()}`] : [], [`Téléphone : ${saisie.tel.trim()}`], note.trim() ? [`Remarque : ${note.trim()}`] : [], ["", "Merci de me confirmer la disponibilité 🙏"]).join("\n");
    } else if (M.type === "salon") {
      const err = d.querySelector("#c-err");
      if (!saisie.date || !saisie.heure) { err.textContent = "Choisissez le jour et l’heure du rendez-vous."; return; }
      txt = [U.hello, "", ...liste, "", `${U.total} : ${fmtPrix(arr(total))}`, "", `📅 Jour : ${dateFr(saisie.date)}`, `🕒 Heure : ${saisie.heure}`]
        .concat(saisie.nom.trim() ? [`Nom : ${saisie.nom.trim()}`] : [], note.trim() ? [`${U.note} : ${note.trim()}`] : []).join("\n");
    } else if (M.type === "hotel" && !enLivraison() && !table.trim()) {
      d.querySelector("#c-err").textContent = "Indiquez le numéro de votre chambre."; d.querySelector("#c-table").focus(); return;
    } else if (enLivraison()) {
      const err = d.querySelector("#c-err");
      if (liv.min && total < liv.min) { err.textContent = `Commande minimum : ${fmtPrix(arr(liv.min))}.`; return; }
      if (!saisie.tel.trim()) { err.textContent = "Indiquez votre numéro de téléphone pour le livreur."; d.querySelector("#c-tel").focus(); return; }
      if (!saisie.adresse.trim() && !saisie.pos.trim()) { err.textContent = "Indiquez votre adresse ou envoyez votre position."; d.querySelector("#c-adresse").focus(); return; }
      txt = ["Bonjour, je souhaite commander en LIVRAISON 🛵 :", "", ...liste, "",
        `Sous-total : ${fmtPrix(arr(total))}`, `Livraison : ${liv.frais ? fmtPrix(arr(liv.frais)) : "gratuite"}`, `${U.total} : ${fmtPrix(arr(total + liv.frais))}`, ""]
        .concat(saisie.nom.trim() ? [`Nom : ${saisie.nom.trim()}`] : [], [`Téléphone : ${saisie.tel.trim()}`],
          saisie.adresse.trim() ? [`Adresse : ${saisie.adresse.trim()}`] : [], positionTexte(),
          note.trim() ? [`${U.note} : ${note.trim()}`] : []).join("\n");
    } else {
      txt = [U.hello, "", ...liste, "", `${U.total} : ${fmtPrix(arr(total))}`]
        .concat(table.trim() ? [`${U.table} : ${table.trim()}`] : [], note.trim() ? [`${U.note} : ${note.trim()}`] : []).join("\n");
    }
    window.open(`https://wa.me/${waNum((M.infos || {}).whatsapp)}?text=${encodeURIComponent(txt)}`, "_blank");
  }

  /* ---------- réservation de table (envoyée sur WhatsApp) ---------- */
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dateFr = v => { const d = new Date(v + "T12:00:00"); return isNaN(d) ? v : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
  function reserver() {
    const d = document.createElement("div");
    d.className = "sheet";
    const champ = (k, label, attrs) => `<label class="f">${label}<input id="r-${k}" value="${esc(saisie[k])}" ${attrs || ""}></label>`;
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true"><h2>📅 Réserver une table</h2>
      <div class="grid2">${champ("date", "Jour", `type="date" min="${aujourdhui()}"`)}${champ("heure", "Heure", 'type="time" step="900"')}</div>
      ${champ("pers", "Nombre de personnes", 'type="number" min="1" max="200" inputmode="numeric"')}
      ${champ("nom", "Votre nom", 'maxlength="60" autocomplete="name"')}
      ${champ("tel", "Téléphone", 'type="tel" inputmode="tel" maxlength="20" autocomplete="tel"')}
      ${champ("note", `Remarque : anniversaire, terrasse… ${U.opt}`, 'maxlength="200"')}
      ${tr((M.reservation || {}).note) ? `<p class="hint" style="margin:6px 0 0">${esc(tr(M.reservation.note))}</p>` : ""}
      <button class="wa" id="r-send">${I.wa.replace("<svg", '<svg width="22" height="22"')} Envoyer la demande sur WhatsApp</button><p class="cerr" id="r-err"></p>
      <button class="ghost" data-fermer>${U.close}</button></div>`;
    document.body.appendChild(d);
    d.addEventListener("input", e => { const k = (e.target.id || "").replace(/^r-/, ""); if (k in saisie) saisie[k] = e.target.value; });
    d.addEventListener("click", e => {
      if (e.target === d || e.target.closest("[data-fermer]")) { d.remove(); return; }
      if (!e.target.closest("#r-send")) return;
      const err = d.querySelector("#r-err");
      if (!saisie.date || !saisie.heure) { err.textContent = "Choisissez le jour et l’heure."; return; }
      if (!(+saisie.pers > 0)) { err.textContent = "Indiquez le nombre de personnes."; return; }
      if (!saisie.nom.trim()) { err.textContent = "Indiquez votre nom."; return; }
      const txt = ["Bonjour, je souhaite RÉSERVER une table 📅 :", "", `Jour : ${dateFr(saisie.date)}`, `Heure : ${saisie.heure}`, `Personnes : ${saisie.pers}`, `Nom : ${saisie.nom.trim()}`]
        .concat(saisie.tel.trim() ? [`Téléphone : ${saisie.tel.trim()}`] : [], saisie.note.trim() ? [`Remarque : ${saisie.note.trim()}`] : []).join("\n");
      window.open(`https://wa.me/${waNum((M.infos || {}).whatsapp)}?text=${encodeURIComponent(txt)}`, "_blank");
    });
  }

  /* ---------- visionneuse ---------- */
  function zoom(id) {
    const d = document.createElement("div");
    d.className = "lb";
    d.innerHTML = `<button class="x" aria-label="${U.close}">×</button><img alt="">`;
    document.body.appendChild(d);
    document.body.style.overflow = "hidden";
    photo(id, 1100).then(s => { d.querySelector("img").src = s; });
    const fin = () => { d.remove(); document.body.style.overflow = ""; };
    d.querySelector(".x").onclick = fin;
    d.addEventListener("click", e => { if (e.target === d) fin(); });
  }

  /* ---------- clics ---------- */
  document.addEventListener("click", e => {
    if (e.target.closest(".sheet")) return;
    const p = e.target.closest("[data-plus]"), m = e.target.closest("[data-moins]");
    if (p) { changer(p.dataset.plus, 1); return; }
    if (m) { changer(m.dataset.moins, -1); return; }
    if (e.target.closest("#cartbar")) { feuille(); return; }
    if (e.target.closest("#resa")) { reserver(); return; }
    const z = e.target.closest("[data-zoom]");
    if (z) { zoom(z.dataset.zoom); return; }
    const c = e.target.closest(".cats a");
    if (c) { e.preventDefault(); const s = document.getElementById("c-" + c.dataset.cat); if (s) s.scrollIntoView({ behavior: "smooth" }); }
  });

  // L'Espace (aperçu) envoie le menu en cours de modification sans l'enregistrer
  window.addEventListener("message", e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== "nfcwork-menu-apercu") return;
    if (e.data.images) Object.assign(imgCache, e.data.images);
    demarrer(e.data.menu);
  });

  if (apercu && window.parent !== window) { etat("", U.load, true); window.parent.postMessage({ type: "nfcwork-menu-pret" }, location.origin); }
  else charger();
})();
