/* =========================================================
   NFCWORK — MENU DEPUIS UNE PHOTO
   La photo du menu papier est lue dans le téléphone (Tesseract.js, sans serveur),
   puis transformée en catégories + produits + prix.
   Le texte lu est montré pour corriger avant d'importer.
   Format du texte de contrôle :
     # Catégorie
     Produit = 25
     Produit = 25 | description
   ========================================================= */
(function () {
  "use strict";
  const LIB = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const NUM = /^\(?(\d{1,4}(?:[.,]\d{1,2})?)\)?(?:dh|dhs|mad|د\.?م\.?|درهم|€)?[.,:;]?$/i;
  const DEV = /^(dh|dhs|mad|د\.?م\.?|درهم|dirhams?|€)[.,]?$/i;
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

  let charge = null;
  function lib() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!charge) charge = new Promise((ok, ko) => {
      const s = document.createElement("script"); s.src = LIB; s.async = true;
      s.onload = () => (window.Tesseract ? ok(window.Tesseract) : ko(new Error("lib")));
      s.onerror = () => { charge = null; ko(new Error("lib")); };
      document.head.appendChild(s);
    });
    return charge;
  }

  // photo → canvas net (gris, assez grand, contrasté)
  function preparer(f) {
    return new Promise((ok, ko) => {
      const u = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u);
        const g = Math.max(im.naturalWidth, im.naturalHeight), k = g < 1600 ? 1600 / g : g > 2600 ? 2600 / g : 1;
        const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        try {
          const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
          let lo = 255, hi = 0; const L = new Uint8Array(p.length / 4);
          for (let i = 0, j = 0; i < p.length; i += 4, j++) { const v = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000; L[j] = v; }
          const h = new Array(256).fill(0); L.forEach(v => h[v | 0]++);
          let s = 0, n = L.length; for (let v = 0; v < 256; v++) { s += h[v]; if (s > n * .02) { lo = v; break; } }
          s = 0; for (let v = 255; v >= 0; v--) { s += h[v]; if (s > n * .02) { hi = v; break; } }
          const r = Math.max(1, hi - lo);
          for (let i = 0, j = 0; i < p.length; i += 4, j++) { const v = Math.max(0, Math.min(255, (L[j] - lo) * 255 / r)); p[i] = p[i + 1] = p[i + 2] = v; }
          x.putImageData(d, 0, 0);
        } catch (e) {}
        ok(c);
      };
      im.onerror = () => { URL.revokeObjectURL(u); ko(new Error("illisible")); };
      im.src = u;
    });
  }

  // mots (avec cadres) → lignes de la carte
  function lignes(mots) {
    let W = mots.filter(w => w.text && w.text.trim()).map(w => ({ t: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, h: w.bbox.y1 - w.bbox.y0, c: w.confidence }));
    const hm = med(W.filter(w => w.c > 60 && /[A-Za-zÀ-ÿ؀-ۿ0-9]/.test(w.t)).map(w => w.h)) || med(W.map(w => w.h));
    // on enlève les pointillés (« ........ »), les traits et les mots illisibles
    W = W.filter(w => w.h > hm * .45 && (w.c >= 35 || NUM.test(w.t)) && /[A-Za-zÀ-ÿ؀-ۿ0-9]/.test(w.t))
      .map(w => Object.assign(w, { t: w.t.replace(/^[.·…_\-–—:]+|[.·…_\-–—:]+$/g, "") || w.t, m: (w.y0 + w.y1) / 2 }));
    // colonnes : bandes verticales vides (on ignore les prix, souvent à droite après les pointillés)
    const texte = W.filter(w => !NUM.test(w.t)), X = Math.max(1, ...W.map(w => w.x1));
    const cov = new Uint16Array(X + 1);
    texte.forEach(w => { for (let x = Math.max(0, w.x0); x <= Math.min(X, w.x1); x++) cov[x]++; });
    const seuil = Math.max(1, Math.round(texte.length * .03)), coupes = [];
    const g0 = Math.min(...texte.map(w => w.x0)), g1 = Math.max(...texte.map(w => w.x1));
    for (let x = g0, d = -1; x <= g1; x++) {
      if (cov[x] <= seuil) { if (d < 0) d = x; }
      else if (d >= 0) { if (x - d > hm * 2.2) coupes.push((d + x) / 2); d = -1; }
    }
    const col = w => coupes.filter(c => c < (NUM.test(w.t) ? w.x0 : (w.x0 + w.x1) / 2)).length;
    const out = [];
    for (let k = 0; k <= coupes.length; k++) {
      const C = W.filter(w => col(w) === k).sort((a, b) => a.m - b.m), R = [];
      for (const w of C) {
        const r = R.find(r => Math.abs(r.m - w.m) < hm * .55);
        if (r) { r.w.push(w); r.m = (r.m * (r.w.length - 1) + w.m) / r.w.length; } else R.push({ m: w.m, w: [w] });
      }
      R.sort((a, b) => a.m - b.m).forEach(r => { const ws = r.w.sort((a, b) => a.x0 - b.x0); out.push({ mots: ws.map(w => w.t), h: med(ws.map(w => w.h)), hm }); });
    }
    return out;
  }

  const majus = s => { const l = s.replace(/[^A-Za-zÀ-ÿ]/g, ""); return l.length >= 3 && l === l.toUpperCase(); };
  // lignes → texte de contrôle
  function versTexte(R) {
    const out = []; let dernier = null, titre = "";
    R.forEach((r, i) => {
      // « 100H » = 10DH, « Z0DH » = 20DH (erreurs de lecture courantes)
      const m = r.mots.map(t => /^[\dZOolIS]{1,4}(?:DH|0H|OH)$/i.test(t) && /\d/.test(t) ? t.replace(/(?:DH|0H|OH)$/i, "").replace(/Z/g, "2").replace(/[Oo]/g, "0").replace(/[lI]/g, "1").replace(/S/g, "5") + "DH" : t), prix = [];
      while (m.length) { const t = m[m.length - 1]; if (DEV.test(t)) { m.pop(); continue; } const p = t.match(NUM); if (p && m.length) { prix.unshift(p[1].replace(",", ".")); m.pop(); } else break; }
      const nom = m.join(" ").replace(/\s*[.·…_]{2,}\s*/g, " ").replace(/\s+/g, " ").trim();
      if (!nom && prix.length && dernier && !dernier.prix) { dernier.prix = prix[0]; dernier.autres = prix.slice(1); return; }   // prix tout seul sous le nom
      if (!nom && prix.length && out.length && out[out.length - 1].cat) { const c = out.pop(); dernier = { nom: c.cat, prix: prix[0], autres: prix.slice(1), desc: "" }; out.push(dernier); return; }   // nom au-dessus, prix en dessous
      if (!nom || nom.replace(/[^A-Za-zÀ-ÿ\u0600-\u06FF]/g, "").length < 3) return;
      if (prix.length) { dernier = { nom, prix: prix[0], autres: prix.slice(1), desc: "" }; out.push(dernier); return; }
      if (!titre && !out.length && r.h > r.hm * 1.5) { titre = nom; return; }                       // le nom du resto en gros
      const suiviPrix = R.slice(i + 1, i + 3).some(x => x.mots.some(t => NUM.test(t)));
      if (dernier && dernier.prix && /,/.test(nom)) { dernier.desc = (dernier.desc ? dernier.desc + " " : "") + nom; return; }
      const grand = nom.length <= 32 && r.h > r.hm * 1.25;
      if ((suiviPrix || grand) && (majus(nom) || grand || (!dernier && nom.length <= 32))) { dernier = null; out.push({ cat: nom }); return; }
      if (!suiviPrix && !dernier) return;                                                              // bout de texte isolé : on ignore
      if (dernier && (dernier.prix || /^[a-zà-ÿ(]/.test(nom) || nom.length > 30)) { dernier.desc = (dernier.desc ? dernier.desc + " " : "") + nom; return; }
      dernier = { nom, prix: "", autres: [], desc: "" }; out.push(dernier);   // nom sans prix : le prix est peut-être sur la ligne d'après
    });
    const T = out.map(o => o.cat ? "\n# " + o.cat : `${o.nom} = ${o.prix || "?"}${o.desc || o.autres.length ? " | " + [o.desc, o.autres.length ? "aussi " + o.autres.join(" / ") + " DH" : ""].filter(Boolean).join(" · ") : ""}`).join("\n").trim();
    return { texte: T, titre };
  }

  // texte de contrôle → [{nom, items:[{nom, desc, prix}]}]
  function lireTexte(t) {
    const cats = []; let c = null;
    String(t || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
      if (l.startsWith("#")) { c = { nom: l.replace(/^#+\s*/, "") || "Menu", items: [] }; cats.push(c); return; }
      const m = l.match(/^(.*?)\s*=\s*([\d.,?]*)\s*(?:\|\s*(.*))?$/);
      const nom = (m ? m[1] : l).trim(); if (!nom) return;
      const p = m ? parseFloat(String(m[2]).replace(",", ".")) : NaN;
      if (!c) { c = { nom: "Menu", items: [] }; cats.push(c); }
      c.items.push({ nom, desc: m && m[3] ? m[3].trim() : "", prix: isNaN(p) ? "" : String(p) });
    });
    return cats.filter(c => c.items.length);
  }

  // fichiers → { texte, titre }
  async function lire(fichiers, langues, prog) {
    prog = prog || (() => {});
    prog("Préparation de la lecture… (la 1re fois : ~20 s)", 0);
    const T = await lib();
    let page = 0;
    const w = await T.createWorker(langues || "fra", 1, { logger: m => { if (m.status === "recognizing text") prog(`Lecture de la photo ${page} / ${fichiers.length}…`, m.progress); else if (/load|init/.test(m.status)) prog("Préparation de la lecture… (la 1re fois : ~20 s)", m.progress || 0); } });
    try {
      await w.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" });
      const parts = []; let titre = "";
      for (const f of fichiers) {
        page++;
        const c = await preparer(f);
        const { data } = await w.recognize(c);
        const r = versTexte(lignes(data.words || []));
        if (!titre) titre = r.titre;
        if (r.texte) parts.push(r.texte);
      }
      return { texte: parts.join("\n\n"), titre };
    } finally { try { await w.terminate(); } catch (e) {} }
  }

  window.NFCW_MENU_PHOTO = { lire, lireTexte, versTexte, lignes };
})();
