/* =========================================================
   NFCWORK — IMPORTER UN MENU (Glovo, Jumia, site du resto, texte copié, code NFCWORK)
   Lit un texte où chaque produit finit par son prix (« 45,00 MAD », « 45 DH »)
   et le transforme en catégories + produits pour l'éditeur de menus.
   ========================================================= */
(function () {
  const PRIX_RE = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:MAD|DH|Dhs?|Dirhams?|د\.?\s?م\.?|درهم)\b/i;
  const estPrix = l => PRIX_RE.test(l) && l.replace(new RegExp(PRIX_RE.source, "gi"), "").replace(/[-–%\d\s,.:+()€]/g, "").length <= 3;
  const BRUIT = /^(\+|ajouter|add|nouveau|new|populaire|popular|promo|-?\d+\s?%|\d+[.,]\d\s*\(\d+\+?\)|★.*|⭐.*|voir plus|see more|\d+\s*min.*|livraison.*|commander.*|\d+\+)$/i;
  const SAUTER = /^(promotions?|promos?|top des ventes|les plus vendus|meilleures ventes|populaires?|best ?sellers?|recommand[ée]s?|offres?|pour vous|nouveaut[ée]s)$/i;
  const propre = l => l.replace(/\s+/g, " ").trim();
  const prixDe = l => { const m = l.match(PRIX_RE); return m ? parseFloat(m[1].replace(",", ".")) : NaN; };
  const ressembleDesc = l => l.length > 38 || /,|\bavec\b|\bet\b|\+|\(|^[a-zàâéèêëîïôûüç]/.test(l);

  // texte (une ligne = un bout de texte de la page) → [{nom, items:[{nom, desc, prix}]}]
  function lireTexte(texte) {
    let L = String(texte || "").split(/\r?\n/).map(propre).filter(l => l && !BRUIT.test(l));
    const iPrix = L.map((l, i) => (estPrix(l) ? i : -1)).filter(i => i >= 0);
    if (!iPrix.length) return [];
    // une catégorie apparaît souvent 2 fois (menu du haut + titre) et n'est jamais juste avant un prix
    const vu = {}; L.forEach(l => (vu[l] = (vu[l] || 0) + 1));
    const avantPrix = new Set(iPrix.flatMap(i => (L[i - 1] && ressembleDesc(L[i - 1]) ? [L[i - 1], L[i - 2]] : [L[i - 1]])));
    const estCat = l => l.length <= 40 && !estPrix(l) && vu[l] >= 2 && !avantPrix.has(l);
    const cats = []; let cat = null; const deja = new Set();
    let debut = 0;
    for (const ip of iPrix) {
      const bloc = L.slice(debut, ip); debut = ip + 1;
      if (!bloc.length) continue;
      let desc = "", nom = "", reste = bloc.slice();
      if (reste.length >= 2 && ressembleDesc(reste[reste.length - 1]) && !estCat(reste[reste.length - 2])) desc = reste.pop();
      nom = reste.pop() || "";
      // ce qui reste avant le nom : la dernière ligne courte = la catégorie
      const titres = reste.filter(l => l.length <= 40);
      const t = titres.length ? titres[titres.length - 1] : "";
      if (t && (estCat(t) || reste.length)) { cat = { nom: t, items: [] }; cats.push(cat); }
      if (!cat) { cat = { nom: "Menu", items: [] }; cats.push(cat); }
      const prix = prixDe(L[ip]);
      if (!nom || nom.length > 90) continue;
      const cle = nom.toLowerCase() + "|" + prix;
      if (SAUTER.test(cat.nom) || deja.has(cle)) continue;
      deja.add(cle);
      cat.items.push({ nom, desc: desc.slice(0, 240), prix });
    }
    return cats.filter(c => c.items.length && !SAUTER.test(c.nom));
  }

  // code préparé par NFCWORK : {"categories":[{"nom":"…","items":[{"nom":"…","desc":"…","prix":25}]}]}
  function lireCode(t) {
    try {
      const j = JSON.parse(t);
      const cs = Array.isArray(j) ? j : j.categories;
      if (!Array.isArray(cs)) return null;
      return cs.map(c => ({ nom: String(c.nom || c.name || "Menu").slice(0, 60),
        items: (c.items || c.produits || []).map(i => ({ nom: String(i.nom || i.name || "").slice(0, 80), desc: String(i.desc || i.description || "").slice(0, 240), prix: parseFloat(String(i.prix ?? i.price ?? "").replace(",", ".")) })).filter(i => i.nom) }))
        .filter(c => c.items.length);
    } catch (e) { return null; }
  }

  // HTML d'une page → texte, une ligne par bout de texte
  function htmlVersTexte(html) {
    const sans = String(html).replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, "\n").replace(/<[^>]+>/g, "\n");
    const ta = document.createElement("textarea"); ta.innerHTML = sans; return ta.value;
  }
  // lire une page web depuis le navigateur (les sites bloquent la lecture directe : on passe par des relais publics)
  async function lirePage(url) {
    const relais = [u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u), u => "https://corsproxy.io/?url=" + encodeURIComponent(u), u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)];
    for (const r of relais) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
        const rep = await fetch(r(url), { signal: ctl.signal }); clearTimeout(t);
        if (!rep.ok) continue;
        const html = await rep.text();
        const cats = lireTexte(htmlVersTexte(html));
        if (cats.reduce((n, c) => n + c.items.length, 0) >= 3) return cats;
      } catch (e) {}
    }
    return null;
  }

  function lire(entree) {
    const t = String(entree || "").trim();
    if (/^[\[{]/.test(t)) return lireCode(t) || [];
    return lireTexte(t);
  }
  const arrondir = (p, pct, pas) => {
    if (!isFinite(p)) return "";
    let v = p * (1 + (pct || 0) / 100);
    v = pas ? Math.round(v / pas) * pas : Math.round(v * 100) / 100;
    return String(Number(v.toFixed(2))).replace(".", ",");
  };
  window.IMPORT_MENU = { lire, lireTexte, lireCode, lirePage, htmlVersTexte, arrondir };
})();
