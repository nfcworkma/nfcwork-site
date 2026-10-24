/* =========================================================
   NFCWORK — MENU TV AUTOMATIQUE
   Un menu de l'Espace → des écrans 1920 × 1080 (format exact de la TV, rien n'est coupé) :
   1 écran d'accueil, puis chaque catégorie séparée (Ftour, Crêpes, Boissons…),
   coupée en plusieurs écrans si elle a beaucoup de produits, puis un écran « Scannez le QR ».
   + une vidéo MP4 (H.264) qui tourne en boucle, à mettre sur une clé USB : marche sans Internet.
   ========================================================= */
(function () {
  "use strict";
  const W = 1920, H = 1080;
  const THEMES = {
    nuit: { bg: "#0d0f14", surface: "#171a22", fg: "#f3f1ec", muted: "#a4a7b1", line: "#2a2f3b", accent: "#e0b15c" },
    creme: { bg: "#f6f0e6", surface: "#fffaf2", fg: "#2a211a", muted: "#7b6d60", line: "#e3d7c5", accent: "#b5552b" },
    cafe: { bg: "#1d1410", surface: "#2a1e18", fg: "#f4e9dc", muted: "#c0a996", line: "#45342a", accent: "#d99a4e" },
    lagon: { bg: "#f2f7f6", surface: "#ffffff", fg: "#10302c", muted: "#5b7470", line: "#d3e3e0", accent: "#0f8a7e" }
  };
  const TITRE = '"Fraunces", Georgia, serif', TEXTE = '"Inter", "Helvetica Neue", Arial, sans-serif';
  const T = (v, l) => v && typeof v === "object" ? (v[l] || v.fr || Object.values(v)[0] || "") : String(v || "");

  // une image utilisable dans un canvas (sinon null : on dessine un emplacement vide)
  function charger(src) {
    return new Promise(ok => {
      if (!src) return ok(null);
      const i = new Image(), t = setTimeout(() => ok(null), 15000);
      if (!src.startsWith("data:")) i.crossOrigin = "anonymous";
      i.onload = () => { clearTimeout(t); ok(i.naturalWidth ? i : null); };
      i.onerror = () => { clearTimeout(t); ok(null); };
      i.src = src;
    });
  }
  function source(id, resoudre) {
    if (!id) return Promise.resolve("");
    if (id.startsWith("data:")) return Promise.resolve(id);
    if (id.startsWith("u:")) return Promise.resolve("https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=1000&q=80");
    if (id.startsWith("o:")) return Promise.resolve("https://images.openfoodfacts.org/images/products/" + id.slice(2) + ".400.jpg");
    if (id.startsWith("/")) return Promise.resolve(id);
    return resoudre ? Promise.resolve(resoudre(id)).catch(() => "") : Promise.resolve("");
  }

  /* ---------- outils de dessin ---------- */
  function rond(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // l'image remplit le cadre sans être déformée
  function couvrir(g, im, x, y, w, h) {
    const k = Math.max(w / im.naturalWidth, h / im.naturalHeight), sw = w / k, sh = h / k;
    g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  function contenir(g, im, x, y, w, h) {
    const k = Math.min(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k;
    g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  function lignes(g, txt, maxW, maxL) {
    const mots = String(txt || "").split(/\s+/).filter(Boolean), out = [];
    let cur = "";
    for (const m of mots) {
      const t = cur ? cur + " " + m : m;
      if (g.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = m; }
    }
    if (cur) out.push(cur);
    if (out.length > maxL) { out.length = maxL; let d = out[maxL - 1]; while (d && g.measureText(d + "…").width > maxW) d = d.slice(0, -1); out[maxL - 1] = d.replace(/[\s,·-]+$/, "") + "…"; }
    return out.map(l => { if (g.measureText(l).width <= maxW) return l; let d = l; while (d && g.measureText(d + "…").width > maxW) d = d.slice(0, -1); return d + "…"; });
  }
  function logoRond(g, im, cx, cy, r, bord) {
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath(); g.fillStyle = "#fff"; g.fill(); g.clip(); couvrir(g, im, cx - r, cy - r, r * 2, r * 2); g.restore();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = bord; g.stroke();
  }
  function ornement(g, cx, y, txt, coul) {
    g.font = `600 22px ${TEXTE}`; g.fillStyle = coul; g.textAlign = "center"; g.textBaseline = "middle";
    const t = txt.toUpperCase().split("").join(String.fromCharCode(8202)), w = g.measureText(t).width;
    g.fillText(t, cx, y); g.fillRect(cx - w / 2 - 80, y - 1, 56, 2); g.fillRect(cx + w / 2 + 24, y - 1, 56, 2);
  }
  const prixTxt = (p, dev) => { const s = String(p || "").trim(); return s ? s + " " + (dev || "DH") : ""; };

  /* ---------- les écrans ---------- */
  async function ecrans(M, opts) {
    opts = opts || {};
    const l0 = (M.langues || ["fr"])[0] || "fr";
    const th = Object.assign({}, THEMES[M.theme] || THEMES.nuit);
    if (/^#[0-9a-f]{6}$/i.test(M.couleur || "")) th.accent = M.couleur;
    try { await Promise.all([`700 80px Fraunces`, `600 40px Inter`, `400 26px Inter`, `700 40px Inter`].map(f => document.fonts.load(f))); } catch (e) {}
    const res = opts.resoudre;
    const logo = M.logo ? await charger(await source(M.logo, res)) : null;
    const couv = M.couverture ? await charger(await source(M.couverture, res)) : null;
    const nom = M.nom || "Menu", slogan = T(M.slogan, l0), dev = M.devise || "DH";
    const cats = (M.categories || []).map(c => ({ nom: T(c.nom, l0), items: (c.items || []).filter(i => i.dispo !== false && T(i.nom, l0).trim()) })).filter(c => c.items.length);
    // photos de tous les produits (en parallèle, 6 à la fois)
    const PH = {};
    const tous = cats.flatMap(c => c.items).filter(i => i.photo);
    let k = 0, fait = 0;
    await Promise.all(Array.from({ length: 6 }, async () => { while (k < tous.length) { const it = tous[k++]; PH[it.photo] = await charger(await source(it.photo, res)); if (opts.progres) opts.progres(++fait / Math.max(1, tous.length) * 0.7, "Photos des produits…"); } }));

    const out = [];
    const neuf = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.fillStyle = th.bg; g.fillRect(0, 0, W, H); out.push(c); return g; };

    // 1) accueil
    {
      const g = neuf();
      if (couv) {
        couvrir(g, couv, 0, 0, W, H);
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "rgba(0,0,0,.25)"); gr.addColorStop(.45, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,.82)");
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      } else {
        const gr = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1100); gr.addColorStop(0, th.surface); gr.addColorStop(1, th.bg); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      const clair = !!couv || !/creme|lagon/.test(M.theme || "");
      let y = 330;
      if (logo) { logoRond(g, logo, W / 2, y, 120, clair ? "rgba(255,255,255,.9)" : th.accent); y += 200; } else y = 430;
      g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = clair ? "#fff" : th.fg;
      g.font = `700 128px ${TITRE}`; g.shadowColor = "rgba(0,0,0,.4)"; g.shadowBlur = couv ? 30 : 0;
      const ln = lignes(g, nom, 1600, 2); ln.forEach(l => { y += 130; g.fillText(l, W / 2, y); });
      g.shadowBlur = 0;
      if (slogan) { g.font = `400 40px ${TEXTE}`; g.fillStyle = clair ? "rgba(255,255,255,.88)" : th.muted; y += 80; g.fillText(lignes(g, slogan, 1500, 1)[0], W / 2, y); }
      ornement(g, W / 2, y + 90, "La carte", th.accent);
    }

    // 2) chaque catégorie, coupée en écrans de 8 produits maximum (répartis à égalité)
    const entete = (g, titre, sous) => {
      if (logo) logoRond(g, logo, 130, 112, 62, th.accent);
      const x0 = logo ? 220 : 80;
      g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = th.fg; g.font = `700 50px ${TITRE}`;
      g.fillText(lignes(g, nom, 700, 1)[0], x0, 104);
      if (slogan) { g.font = `400 26px ${TEXTE}`; g.fillStyle = th.muted; g.fillText(lignes(g, slogan, 700, 1)[0], x0, 146); }
      g.textAlign = "right"; g.fillStyle = th.accent; g.font = `700 76px ${TITRE}`;
      g.fillText(lignes(g, titre, 980, 1)[0], W - 80, 118);
      if (sous) { g.font = `500 26px ${TEXTE}`; g.fillStyle = th.muted; g.fillText(sous, W - 80, 160); }
      g.fillStyle = th.line; g.fillRect(80, 196, W - 160, 2);
    };
    for (const c of cats) {
      const avecPhoto = c.items.filter(i => i.photo && PH[i.photo]).length >= c.items.length / 2;
      const max = avecPhoto ? 8 : 14, nb = Math.ceil(c.items.length / max), par = Math.ceil(c.items.length / nb);
      for (let p = 0; p < nb; p++) {
        const its = c.items.slice(p * par, (p + 1) * par), g = neuf();
        entete(g, c.nom, nb > 1 ? `${p + 1} / ${nb}` : "");
        const X = 80, Y = 236, AW = W - 160, AH = H - Y - 64;
        if (avecPhoto) {
          const n = its.length, cols = n <= 4 ? n : n <= 6 ? 3 : 4, rows = Math.ceil(n / cols), gap = 32;
          const cw = (AW - gap * (cols - 1)) / cols, ch0 = (AH - gap * (rows - 1)) / rows, ch = Math.min(ch0, rows === 1 ? 700 : ch0, cw * 1.25);
          const oy = Y + (AH - (ch * rows + gap * (rows - 1))) / 2;
          its.forEach((it, i) => {
            const r = Math.floor(i / cols), ligne = Math.min(cols, n - r * cols), ox = X + (AW - (cw * ligne + gap * (ligne - 1))) / 2;
            const x = ox + (i % cols) * (cw + gap), y = oy + r * (ch + gap);
            const txtH = Math.min(150, ch * 0.36), phH = ch - txtH;
            g.save(); rond(g, x, y, cw, ch, 26); g.fillStyle = th.surface; g.fill(); g.clip();
            const im = it.photo && PH[it.photo];
            if (im) { if (String(it.photo).startsWith("o:")) { g.fillStyle = "#fff"; g.fillRect(x, y, cw, phH); contenir(g, im, x + 16, y + 16, cw - 32, phH - 32); } else couvrir(g, im, x, y, cw, phH); }
            else { g.fillStyle = th.line; g.fillRect(x, y, cw, phH); g.font = `700 ${Math.round(phH * 0.4)}px ${TITRE}`; g.fillStyle = th.muted; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText((T(it.nom, l0)[0] || "•").toUpperCase(), x + cw / 2, y + phH / 2); }
            g.restore();
            g.save(); rond(g, x, y, cw, ch, 26); g.lineWidth = 2; g.strokeStyle = th.line; g.stroke(); g.restore();
            if (it.vedette) { g.font = `700 22px ${TEXTE}`; const t = "★ À NE PAS MANQUER", tw = g.measureText(t).width + 30; rond(g, x + 16, y + 16, tw, 42, 21); g.fillStyle = th.accent; g.fill(); g.fillStyle = th.bg; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(t, x + 31, y + 38); }
            // nom + prix
            const pr = prixTxt(it.prix, dev), fs = cols >= 4 ? 34 : 40;
            g.textBaseline = "alphabetic"; g.font = `700 ${fs + 4}px ${TEXTE}`; const pw = pr ? g.measureText(pr).width : 0;
            g.font = `600 ${fs}px ${TEXTE}`; g.fillStyle = th.fg; g.textAlign = "left";
            const nl = lignes(g, T(it.nom, l0), cw - 44 - pw - 20, 2), ty = y + phH + (nl.length > 1 ? fs + 14 : txtH / 2 + fs / 3 - (T(it.desc, l0) && txtH > 110 ? 16 : 0));
            nl.forEach((l, j) => g.fillText(l, x + 22, ty + j * (fs + 6)));
            if (pr) { g.font = `700 ${fs + 4}px ${TEXTE}`; g.fillStyle = th.accent; g.textAlign = "right"; g.fillText(pr, x + cw - 22, ty); }
            const ds = T(it.desc, l0).split("·")[0].trim();
            if (ds && nl.length === 1 && txtH > 110) { g.font = `400 ${fs - 12}px ${TEXTE}`; g.fillStyle = th.muted; g.textAlign = "left"; g.fillText(lignes(g, ds, cw - 44, 1)[0], x + 22, ty + fs + 4); }
          });
        } else {
          // liste en 2 colonnes : nom ........ prix (+ description)
          const cols = its.length > 7 ? 2 : 1, rows = Math.ceil(its.length / cols), gap = 90;
          const cw = cols === 2 ? (AW - gap) / 2 : Math.min(AW, 1200), ox = cols === 2 ? X : (W - cw) / 2, rh = Math.min(AH / rows, 150);
          const oy = Y + (AH - rh * rows) / 2;
          its.forEach((it, i) => {
            const x = ox + Math.floor(i / rows) * (cw + gap), y = oy + (i % rows) * rh;
            const pr = prixTxt(it.prix, dev); g.textBaseline = "alphabetic";
            g.font = `700 44px ${TEXTE}`; g.fillStyle = th.accent; g.textAlign = "right"; if (pr) g.fillText(pr, x + cw, y + 56);
            const pw = pr ? g.measureText(pr).width + 30 : 0;
            g.font = `600 42px ${TEXTE}`; g.fillStyle = th.fg; g.textAlign = "left"; const nm = lignes(g, T(it.nom, l0), cw - pw - 40, 1)[0]; g.fillText(nm, x, y + 56);
            const nw = g.measureText(nm).width; g.fillStyle = th.line; for (let d = x + nw + 18; d < x + cw - pw - 6; d += 16) g.fillRect(d, y + 52, 6, 3);
            const ds = T(it.desc, l0); if (ds && rh > 100) { g.font = `400 28px ${TEXTE}`; g.fillStyle = th.muted; g.fillText(lignes(g, ds, cw - 20, 1)[0], x, y + 98); }
          });
        }
      }
    }

    // 3) scannez le QR (si on a le lien du menu)
    if (opts.lien && window.QRGEN) {
      const g = neuf();
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, th.bg); gr.addColorStop(1, th.surface); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      try {
        const svg = window.QRGEN.svg(opts.lien, { marge: 1, couleur: "#05080f" });
        const qr = await charger("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
        rond(g, 1180, 240, 600, 600, 36); g.fillStyle = "#fff"; g.fill();
        if (qr) g.drawImage(qr, 1215, 275, 530, 530);
      } catch (e) {}
      if (logo) logoRond(g, logo, 300, 300, 90, th.accent);
      g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = th.fg; g.font = `700 96px ${TITRE}`;
      let y = logo ? 500 : 380;
      lignes(g, "Scannez le QR code", 900, 2).forEach(l => { g.fillText(l, 210, y); y += 104; });
      g.font = `400 44px ${TEXTE}`; g.fillStyle = th.muted;
      lignes(g, "avec votre téléphone pour voir le menu en photos et commander.", 900, 3).forEach(l => { y += 10; g.fillText(l, 210, y); y += 50; });
      const inf = M.infos || {}, pts = [inf.whatsapp && "WhatsApp " + inf.whatsapp, inf.instagram && "Instagram " + inf.instagram].filter(Boolean);
      if (pts.length) { g.font = `600 38px ${TEXTE}`; g.fillStyle = th.accent; y += 30; pts.forEach(t => { y += 52; g.fillText(lignes(g, t, 880, 1)[0], 210, y); }); }
      g.textAlign = "center"; g.font = `600 30px ${TEXTE}`; g.fillStyle = th.muted; g.fillText(opts.lien.replace(/^https?:\/\//, ""), 1480, 900);
    }
    if (opts.progres) opts.progres(1, "Écrans prêts");
    return out;
  }

  /* ---------- vidéo MP4 en boucle ---------- */
  async function video(images, opts) {
    opts = opts || {};
    if (typeof VideoEncoder === "undefined" || !window.Mp4Muxer) throw new Error("webcodecs");
    const fps = 25, duree = Math.max(3, opts.duree || 8), fondu = 0.8, n = images.length;
    const essais = [["avc", "avc1.640028"], ["avc", "avc1.4d0028"], ["avc", "avc1.42002a"], ["vp9", "vp09.00.40.08"]];
    let choix = null;
    for (const [mux, codec] of essais) {
      const cfg = { codec, width: W, height: H, bitrate: 2500000, framerate: fps, ...(mux === "avc" ? { avc: { format: "avc" } } : {}) };
      try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) { choix = [mux, cfg]; break; } } catch (e) {}
    }
    if (!choix) throw new Error("webcodecs");
    const [mux, cfg] = choix;
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: mux, width: W, height: H, frameRate: fps }, fastStart: "in-memory" });
    const morceaux = []; let meta0 = null, erreur = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); if (meta && meta.decoderConfig && !meta0) meta0 = meta; morceaux.push({ d, type: chunk.type, ts: chunk.timestamp, dur: chunk.duration || Math.round(1e6 / fps) }); },
      error: e => { erreur = e; }
    });
    enc.configure(cfg);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const tenir = Math.round((duree - fondu) * fps), passe = Math.round(fondu * fps), parEcran = tenir + passe, total = parEcran * n;
    let f = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < parEcran; j++, f++) {
        if (erreur) throw erreur;
        g.globalAlpha = 1; g.drawImage(images[i], 0, 0, W, H);
        if (j >= tenir) { g.globalAlpha = (j - tenir + 1) / (passe + 1); g.drawImage(images[(i + 1) % n], 0, 0, W, H); g.globalAlpha = 1; }
        const fr = new VideoFrame(c, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(fr, { keyFrame: j === 0 });
        fr.close();
        while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5));
        if (opts.progres && f % 10 === 0) opts.progres(f / total);
      }
    }
    await enc.flush(); enc.close();
    if (erreur) throw erreur;
    // la boucle est encodée une fois, puis recopiée pour faire une vidéo plus longue (rapide, pas de ré-encodage)
    const tour = total * 1e6 / fps, tours = Math.max(1, Math.ceil((opts.minutes || 0) * 60e6 / tour));
    morceaux.sort((a, b) => a.ts - b.ts);
    for (let t = 0; t < tours; t++) morceaux.forEach((m, i) => muxer.addVideoChunkRaw(m.d, m.type, m.ts + t * tour, m.dur, t === 0 && i === 0 ? meta0 : undefined));
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), codec: mux, secondes: Math.round(tour * tours / 1e6) };
  }

  window.NFCW_TVGEN = { ecrans, video, W, H };
})();
