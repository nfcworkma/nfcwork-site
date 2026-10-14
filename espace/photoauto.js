/* =========================================================
   NFCWORK — PHOTO AUTOMATIQUE pour les produits du menu
   1) cherche d'abord dans la banque de photos (Unsplash, banque.js)
   2) pour un produit de marque (Coca-Cola, Poms, Sidi Ali…) : photo du vrai produit
      sur Open Food Facts (base libre, licence CC BY-SA) → enregistrée « o:<chemin> »
   ========================================================= */
(function () {
  const OFF_IMG = "https://images.openfoodfacts.org/images/products/";
  const sansAccent = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const VIDES = new Set("de du des la le les l d a au aux et en avec sans sur the with of and un une cl ml l".split(" "));
  const mots = t => sansAccent(t).replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 1 && !VIDES.has(w) && !/^\d+$/.test(w)).map(w => (w.length > 3 ? w.replace(/s$/, "") : w));

  // marques vendues en bouteille / canette (le menu peut écrire « Coca », « coca cola 33cl »…)
  const MARQUES = [
    ["coca cola zero", /coca.*(zero|0)/], ["coca cola light", /coca.*light/], ["coca cola", /coca|coke/], ["pepsi", /pepsi/], ["fanta", /fanta/], ["sprite", /sprite/],
    ["7up", /7 ?up|seven ?up/], ["schweppes", /schweppes|tonic/], ["orangina", /orangina/], ["oasis", /oasis/],
    ["hawai tropical", /hawa[iï]/], ["poms", /\bpoms?\b/], ["mirinda", /mirinda/],
    ["sidi ali", /sidi ?ali/], ["oulmes", /oulm[eè]s/], ["sidi harazem", /harazem/], ["ain saiss", /a[iï]n ?sa[iï]s/],
    ["ain ifrane", /ifrane/], ["bahia eau", /bahia/], ["perrier", /perrier/], ["san pellegrino", /pellegrino/], ["evian", /evian/],
    ["red bull", /red ?bull/], ["monster energy", /monster/], ["lipton ice tea", /lipton|ice ?tea/], ["nestea", /nestea/],
    ["raibi jamila", /ra[iï]bi/], ["jaouda", /jaouda/], ["danone", /danone|danao/], ["yop", /\byop\b/], ["activia", /activia/],
    ["valencia jus", /valencia/], ["marrakech cola", /marrakech cola/], ["nutella", /nutella/],
    ["kinder bueno", /bueno/], ["kitkat", /kit ?kat/], ["snickers", /snickers/], ["twix", /twix/], ["mars", /\bmars\b/], ["oreo", /oreo/],
    ["pringles", /pringles/], ["lays", /\blay'?s\b/], ["heineken 0.0", /heineken/], ["nescafe", /nescaf/]
  ];
  const marque = nom => { const n = sansAccent(nom); const m = MARQUES.find(([, r]) => r.test(n)); return m ? m[0] : ""; };

  // 1) banque de photos : tous les mots du nom doivent s'y retrouver
  function banqueMeilleure(nom) {
    const ws = mots(nom); if (!ws.length) return "";
    let best = null, bs = 0;
    for (const x of window.BANQUE || []) {
      const t = " " + mots(x[1] + " " + x[3]).join(" ") + " ";
      const s = ws.filter(w => t.includes(" " + w)).length;
      if (s > bs) { bs = s; best = x; }
    }
    return best && (bs === ws.length || bs >= 2) ? "u:" + best[0] : "";
  }

  // 2) Open Food Facts
  const okChemin = p => /^[0-9/]{4,40}\/front_[a-z]{2}\.\d{1,4}$/.test(p);
  function versId(u) {
    const m = String(u || "").match(/^https:\/\/images\.openfoodfacts\.org\/images\/products\/([0-9/]+\/front_[a-z]{2}\.\d+)\.(?:\d+|full)\.jpg$/);
    return m && okChemin(m[1]) ? "o:" + m[1] : "";
  }
  const cache = {};
  try { Object.assign(cache, JSON.parse(localStorage.getItem("nfcwork-off") || "{}")); } catch (e) {}
  const garder = () => { try { localStorage.setItem("nfcwork-off", JSON.stringify(cache)); } catch (e) {} };
  let file = Promise.resolve();   // une recherche à la fois (Open Food Facts limite les appels)
  async function lire(url) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  function trier(l, q) {
    const ws = mots(q);
    const txt = p => sansAccent([p.product_name, [].concat(p.brands || []).join(" ")].join(" "));
    return l.map(p => ({ id: versId(p.image_front_url), nom: String(p.product_name || "").slice(0, 60) || q,
        sc: ws.filter(w => txt(p).includes(w)).length * 2 + ([].concat(p.countries_tags || []).includes("en:morocco") ? 3 : 0) }))
      .filter(x => x.id).sort((a, b) => b.sc - a.sc)
      .filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  }
  function chercherOFF(q, n) {
    const cle = sansAccent(q).trim();
    if (!cle) return Promise.resolve([]);
    if (cache[cle]) return Promise.resolve(cache[cle]);
    const f = "product_name,brands,image_front_url,countries_tags";
    const job = file.then(async () => {
      let l = [];
      try { const j = await lire(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${n || 20}&fields=${f}`); l = trier(j.hits || [], q); } catch (e) {}
      if (!l.length) {
        try { const j = await lire(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${n || 20}&fields=${f}`); l = trier(j.products || [], q); } catch (e) {}
      }
      l = l.slice(0, 12);
      if (l.length) { cache[cle] = l; garder(); }
      return l;
    });
    file = job.catch(() => {});
    return job;
  }

  // la photo la plus probable pour un produit (ou "" si rien de sûr)
  async function trouver(nom) {
    if (!String(nom || "").trim()) return "";
    const mq = marque(nom);
    if (!mq) return banqueMeilleure(nom);
    const n = sansAccent(nom);
    const q = mq + (/zero|0 ?%/.test(n) && !/zero|light/.test(mq) ? " zero" : "");
    const l = await chercherOFF(q).catch(() => []);
    return (l[0] && l[0].id) || banqueMeilleure(nom);
  }

  const url = (id, w) => OFF_IMG + id.slice(2) + ((w || 400) > 500 ? ".full.jpg" : ".400.jpg");
  window.PHOTO_AUTO = { trouver, chercherOFF, marque, url, banqueMeilleure };
})();
