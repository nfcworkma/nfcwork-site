/* =========================================================
   NFCWORK — PHOTO AUTOMATIQUE pour les produits du menu
   1) cherche d'abord dans la banque de photos (Unsplash, banque.js)
   2) pour un produit de marque (Coca-Cola, Poms, Sidi Ali…) : photo du vrai produit
      sur Open Food Facts (base libre, licence CC BY-SA) → enregistrée « o:<chemin> »
   ========================================================= */
(function () {
  const OFF_IMG = "https://images.openfoodfacts.org/images/products/";
  const sansAccent = t => String(t || "").replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const VIDES = new Set("de du des la le les l d a au aux et en avec sans sur with of and un une cl ml l".split(" "));
  const mots = t => sansAccent(t).replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 1 && !VIDES.has(w) && !/^\d+$/.test(w)).map(w => (w.length > 3 ? w.replace(/s$/, "") : w));

  // marques vendues en bouteille / canette (le menu peut écrire « Coca », « coca cola 33cl »…)
  const MARQUES = [
    ["coca cola zero", /coca.*(zero|0)/], ["coca cola light", /coca.*light/], ["coca cola", /coca|coke/], ["pepsi", /pepsi/], ["fanta", /fanta/], ["sprite", /sprite/],
    ["7up", /7 ?up|seven ?up/], ["schweppes", /schweppes|tonic/], ["orangina", /orangina/], ["oasis", /oasis/],
    ["hawai tropical", /hawa[iï]/], ["poms", /\bpom'?s?\b/], ["mirinda", /mirinda/],
    ["sidi ali", /sidi ?ali/], ["oulmes", /oulm[eè]s/], ["sidi harazem", /harazem/], ["ain saiss", /a[iï]n ?sa[iï]s/],
    ["ain ifrane", /ifrane/], ["bahia eau", /bahia/], ["perrier", /perrier/], ["san pellegrino", /pellegrino/], ["evian", /evian/],
    ["red bull", /red ?bull/], ["monster energy", /monster/], ["lipton ice tea", /lipton|ice ?tea/], ["nestea", /nestea/],
    ["raibi jamila", /ra[iï]bi/], ["jaouda", /jaouda/], ["danone", /danone|danao/], ["yop", /\byop\b/], ["activia", /activia/],
    ["valencia jus", /valencia/], ["marrakech cola", /marrakech cola/], ["nutella", /nutella/],
    ["kinder bueno", /bueno/], ["kitkat", /kit ?kat/], ["snickers", /snickers/], ["twix", /twix/], ["mars", /\bmars\b/], ["oreo", /oreo/],
    ["pringles", /pringles/], ["lays", /\blay'?s\b/], ["heineken 0.0", /heineken/], ["nescafe", /nescaf/]
  ];
  // photo ajoutée depuis le téléphone (« bq… », gardée dans Firebase) ou photo Unsplash
  const pid = id => /^bq/.test(id) ? id : "u:" + id;
  const marque = nom => { const n = sansAccent(nom); const m = MARQUES.find(([, r]) => r.test(n)); return m ? m[0] : ""; };

  // 1) banque de photos : tous les mots du nom doivent s'y retrouver
  // mêmes mots écrits autrement (darija, anglais, fautes courantes)
  const SYN = { shawarma: "chawarma", shawerma: "chawarma", chawerma: "chawarma", hamburger: "burger", burguer: "burger", waffle: "gaufre",
    pancake: "pancake", crep: "crepe", pizz: "pizza", panin: "panini", sandwitch: "sandwich", sandwish: "sandwich", tacco: "taco", taco: "taco",
    nugget: "nugget", wing: "wing", fry: "frite", fries: "frite", frie: "frite", fried: "frit", juice: "ju", coffee: "cafe", latte: "latte", tea: "the", atay: "menthe",
    mojitto: "mojito", milk: "lait", shake: "milkshake", lemonade: "limonade", water: "eau", donuts: "donut", beignet: "donut", glac: "glace",
    harira: "soupe", chicken: "poulet", beef: "boeuf", cheese: "fromage", classic: "classique", crispy: "crispy", "jus": "ju", omelet: "omelette", nespresso: "espresso", expresso: "espresso", infusion: "theiere", tisane: "theiere", verveine: "theiere", croque: "toast", toasts: "toast", chamali: "menthe", gazeuse: "gazeuse", kefta: "kefta", kafta: "kefta", poisson: "poisson", fish: "poisson", crevette: "crevette" };
  const norm = w => SYN[w] || w;
  // le mot qui dit « ce que c'est » pèse le plus (Classic Burger → burger, Chicken Burger → burger, pas les ailes de poulet)
  const TETES = new Set("burger cheeseburger pizza taco tacos crepe gaufre pancake sandwich panini chawarma wrap quesadilla hot dog ju jus smoothie milkshake frappe mojito limonade citronnade the cafe espresso cappuccino latte chocolat eau soda soupe salade pate lasagne couscous tajine omelette croissant frite nugget wing brochette steak poisson crevette tiramisu brownie donut glace cheesecake gateau sushi maki nigiri roll poke temaki rouleau tarte".split(" "));
  function banqueMeilleure(nom, deja, grp, plat) {
    const ws = mots(nom).map(norm); if (!ws.length) return "";
    let bs = 0, tous = [];
    for (const x of window.BANQUE || []) {
      if (grp && x[2] !== grp) continue;
      const tl = mots(x[1] + " " + x[3]).map(norm);
      const t = " " + tl.join(" ") + " ";
      // le 1er mot (« Pizza … », « Crêpe … », « Jus … ») compte double ; bonus si la photo commence pareil
      let s = 0;
      ws.forEach((w, i) => { if (t.includes(" " + w + (w.length < 4 ? " " : ""))) s += TETES.has(w) && !plat ? 3 : i === 0 ? 2 : 1; });
      if (s && ws.includes(tl[0])) s += tl[0] === ws[0] ? 0.6 : 0.5;
      if (s) tous.push([x, s]);
      if (s > bs) bs = s;
    }
    // assez sûr : le 1er mot est trouvé (score ≥ 2). Entre photos aussi bonnes, une pas encore utilisée dans le menu.
    if (bs < 2) return "";
    const top = tous.filter(([, s]) => s === bs).map(([x]) => pid(x[0]));
    return top.find(id => !(deja && deja.has(id))) || top[0];
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
  async function trouver(nom, deja) {
    if (!String(nom || "").trim()) return "";
    const mq = marque(nom);
    if (!mq) return banqueMeilleure(nom, deja);
    // la marque a déjà une belle photo dans la banque (Coca-Cola, Fanta, Pepsi, Red Bull…) → on la garde
    const b = banqueMeilleure(nom, deja), e = b && (window.BANQUE || []).find(x => pid(x[0]) === b);
    if (e && !/zero|light/.test(sansAccent(nom)) && sansAccent(e[1]).replace(/[^a-z0-9]/g, "").includes(mots(mq)[0])) return b;
    const n = sansAccent(nom);
    const q = mq + (/zero|0 ?%/.test(n) && !/zero|light/.test(mq) ? " zero" : "");
    const l = await chercherOFF(q).catch(() => []);
    // on ne garde la photo du produit que si elle s'affiche vraiment (sinon : photo de la banque)
    for (const x of l.slice(0, 3)) if (await charge(url(x.id, 400))) return x.id;
    return banqueMeilleure(nom, deja);
  }

  // chaque produit reçoit une photo : 1) son nom  2) sa description (« toasts, œufs, avocat… »)  3) sa catégorie
  const CATS = [[/ftour|petit|dejeun|breakfast|formule|brunch/, "Petit-déjeuner"], [/crepe|gaufre|pancake/, "Crêpes & gaufres"], [/jus|smoothie|cocktail|panache/, "Jus & smoothies"],
    [/chaud|cafe|caf|the\b|hot/, "Boissons chaudes"], [/soda|eau|gazeu/, "Sodas & eaux"], [/froid|frais|boisson|drink/, "Boissons fraîches"], [/sandwich|taco|wrap|panini/, "Sandwichs & tacos"],
    [/burger/, "Burgers"], [/pizza/, "Pizzas"], [/grill|poisson|brochette|viande/, "Grillades & poissons"], [/dessert|glace|patiss|gateau|sucre/, "Desserts"], [/sushi|bowl|poke/, "Sushi & bowls"], [/plat|tajine|cuisine|soupe/, "Plats"]];
  function parCategorie(cat, deja) {
    const c = sansAccent(cat); if (!c) return "";
    if (/soupe|harira/.test(c)) { const s = banqueMeilleure("soupe", deja); if (s) return s; }
    const e = CATS.find(([r]) => r.test(c)); if (!e) return "";
    const l = (window.BANQUE || []).filter(x => x[2] === e[1]).map(x => pid(x[0]));
    return l.find(id => !(deja && deja.has(id))) || l[0] || "";
  }
  async function trouverTout(nom, cat, desc, deja) {
    const d = String(desc || "").split(/[·•|]/)[0], e = CATS.find(([r]) => r.test(sansAccent(cat))), grp = e && e[1];
    return (await trouver(nom, deja).catch(() => "")) || (grp && banqueMeilleure(d, deja, grp, true)) || banqueMeilleure(d, deja, null, true) || parCategorie(cat, deja);
  }
  // photo de couverture selon ce que vend le commerce
  function couverture(cats) {
    const t = sansAccent((cats || []).join(" "));
    if (/burger|pizza|taco|sandwich|grill|sushi|plat/.test(t) && !/cafe|ftour|petit/.test(t)) { const e = CATS.find(([r]) => r.test(t)); const l = (window.BANQUE || []).filter(x => e && x[2] === e[1]); if (l.length) return pid(l[0][0]); }
    return "/menu/demo/cover-cafe.jpg";
  }

  // plusieurs photos de couverture possibles (salle, puis ce que vend le commerce)
  function couvertures(cats) {
    const t = sansAccent((cats || []).join(" ")), B = window.BANQUE || [], out = [];
    const add = id => { if (id && !out.includes(id)) out.push(id); };
    B.filter(x => /couverture|salle/i.test(x[2])).forEach(x => add(pid(x[0])));
    const cafe = /cafe|ftour|petit|jus|crepe/.test(t);
    if (cafe) add("/menu/demo/cover-cafe.jpg");
    CATS.filter(([r]) => r.test(t)).forEach(([, g]) => B.filter(x => x[2] === g).slice(0, 3).forEach(x => add(pid(x[0]))));
    if (!cafe) add("/menu/demo/cover-cafe.jpg");
    return out;
  }

  const charge = src => typeof Image === "undefined" ? Promise.resolve(true) : new Promise(ok => {
    const i = new Image(), t = setTimeout(() => ok(false), 8000);
    i.onload = () => { clearTimeout(t); ok(i.naturalWidth > 20); }; i.onerror = () => { clearTimeout(t); ok(false); }; i.src = src;
  });
  const url = (id, w) => OFF_IMG + id.slice(2) + ((w || 400) > 500 ? ".full.jpg" : ".400.jpg");
  window.PHOTO_AUTO = { trouver, trouverTout, couverture, couvertures, pid, chercherOFF, marque, url, banqueMeilleure };
})();
