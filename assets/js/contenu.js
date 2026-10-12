/* =========================================================
   NFCWORK — CONTENU MODIFIABLE (mode édition de l'admin)
   Les modifications faites par l'admin sur le site (prix, noms, textes, photos) sont gardées
   dans Firestore : document « settings/site » (lecture publique, écriture admin seulement —
   règle déjà en place dans firestore.rules) et une photo par document « settings/site-img-<produit> ».
   Ce fichier les applique à CATALOG, T et CONFIG pour TOUS les visiteurs :
     1. tout de suite, depuis la dernière copie gardée dans le navigateur (pas de « clignotement »),
     2. puis depuis Firestore (requête REST légère, sans charger Firebase), et la page se redessine si ça a changé.
   catalog.js / i18n.js / config.js restent les valeurs d'origine (« Rétablir l'original »).
   ========================================================= */
const CONTENU = (function () {
  "use strict";
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/settings/";
  const CLE = "nfcwork-contenu";
  const clone = o => JSON.parse(JSON.stringify(o));
  const BASE = { catalog: clone(CATALOG), t: clone(T), conf: { designPremium: CONFIG.designPremium, shipping: clone(CONFIG.shipping) } };
  let actuel = {};            // modifications en cours (objet enregistré dans settings/site)
  let version = "";

  const lire = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // Réapplique tout depuis les valeurs d'origine + modifications (une modification supprimée disparaît bien)
  function appliquer(o) {
    actuel = o || {};
    const cat = clone(BASE.catalog);
    for (const C of cat) {
      const m = (actuel.cat || {})[C.id];
      if (m) for (const k of ["name", "short", "intro"]) if (m[k]) C[k] = m[k];
      const img = (actuel.img || {})[C.id];
      const cache = img && lire("nfcwork-img-" + C.id);
      if (cache && cache.v === img) C.img = cache.data;
      for (const Ti of C.tiers) {
        const mt = (actuel.tier || {})[C.id + ":" + Ti.k];
        if (!mt) continue;
        if (mt.n) Ti.n = mt.n;
        if (typeof mt.p === "number") Ti.p = mt.p;
        if ("old" in mt) { if (mt.old) Ti.old = mt.old; else delete Ti.old; }
        if (mt.f) Ti.f = mt.f;
      }
    }
    CATALOG.splice(0, CATALOG.length, ...cat);
    for (const l of ["fr", "ar"]) {
      T[l] = clone(BASE.t[l]);
      Object.assign(T[l], ((actuel.t || {})[l]) || {});
    }
    CONFIG.designPremium = BASE.conf.designPremium;
    CONFIG.shipping = clone(BASE.conf.shipping);
    if (actuel.conf) {
      if (typeof actuel.conf.designPremium === "number") CONFIG.designPremium = actuel.conf.designPremium;
      if (actuel.conf.shipping) Object.assign(CONFIG.shipping, actuel.conf.shipping);
    }
  }

  const memo = lire(CLE);
  if (memo && memo.data) { version = memo.v || ""; appliquer(memo.data); }

  const redessiner = () => { if (window.NFCWORK && window.NFCWORK.render) window.NFCWORK.render(); };

  // Photos remplacées : un document Firestore par photo (version = date), gardées dans le navigateur
  async function chargerImages() {
    let change = false;
    await Promise.all(Object.entries(actuel.img || {}).map(async ([id, v]) => {
      const c = lire("nfcwork-img-" + id);
      if (c && c.v === v) return;
      try {
        const r = await fetch(DOC + "site-img-" + id, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const data = j.fields && j.fields.data && j.fields.data.stringValue;
        if (!data || !data.startsWith("data:image/")) return;
        ecrire("nfcwork-img-" + id, { v, data });
        const C = CATALOG.find(x => x.id === id);
        if (C) { C.img = data; change = true; }
      } catch (e) {}
    }));
    if (change) redessiner();
  }

  async function charger() {
    try {
      const r = await fetch(DOC + "site", { cache: "no-store" });
      if (r.status === 404) { if (version) { version = ""; ecrire(CLE, null); appliquer({}); redessiner(); } return; }
      if (!r.ok) return;
      const j = await r.json();
      const f = j.fields || {};
      const v = (f.v && (f.v.stringValue || f.v.integerValue)) || j.updateTime || "";
      if (v !== version) {
        const data = JSON.parse((f.json && f.json.stringValue) || "{}");
        version = v; ecrire(CLE, { v, data }); appliquer(data); redessiner();
      }
      chargerImages();
    } catch (e) {}
  }
  charger();

  return {
    BASE, appliquer, charger,
    get actuel() { return actuel; },
    // Après un enregistrement de l'admin : mise à jour immédiate de cette page
    memoriser(data, v) { version = v; ecrire(CLE, { v, data }); appliquer(data); },
    memoriserImage(id, v, data) { ecrire("nfcwork-img-" + id, { v, data }); }
  };
})();
