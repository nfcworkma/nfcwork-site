/* NFCWORK — recadrer le logo et la photo de couverture avant l'envoi
   NFCW_RECADRER(fichier, "logo"|"cover") → Promise<{ blob, pos }> ou null si annulé
   - logo  : carré 600×600 vu dans le rond du menu (glisser, zoom, ✨ auto, couleur du fond)
   - cover : on choisit ce qui reste visible sur téléphone ET sur ordinateur (glisser, zoom)
             → l'image recadrée + pos = "x% y%" (object-position) */
(function () {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const charger = f => new Promise((ok, ko) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("illisible")); i.src = u; });
  const hex = (r, g, b) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");

  // couleur du fond (coins) + boîte du contenu
  function analyser(img) {
    const n = 200, k = n / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    const coins = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)];
    const transp = coins.every(p => p[3] < 30);
    const bg = transp ? [255, 255, 255] : [0, 1, 2].map(j => coins.reduce((s, p) => s + p[j], 0) / 4);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = px(x, y), diff = transp ? p[3] > 40 : (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60 && p[3] > 40);
      if (diff) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return { bg: hex(...bg), box: [0, 0, img.naturalWidth, img.naturalHeight], rond: false };
    // contenu déjà rond (badge) : les coins de la boîte sont du fond
    const bc = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => px(clamp(x + (x === x0 ? 2 : -2), 0, w - 1), clamp(y + (y === y0 ? 2 : -2), 0, h - 1)));
    const rond = !transp && bc.every(p => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 60) && Math.abs((x1 - x0) - (y1 - y0)) < 0.12 * Math.max(x1 - x0, y1 - y0);
    return { bg: hex(...bg), box: [x0 / k, y0 / k, (x1 - x0 + 1) / k, (y1 - y0 + 1) / k], rond };
  }

  const CSS = `.rc-box{max-width:520px}.rc-stage{position:relative;margin:10px auto;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;overflow:hidden;border-radius:14px;background:#0b0f18}
    .rc-stage:active{cursor:grabbing}.rc-stage canvas{display:block;width:100%;height:100%}
    .rc-ring{position:absolute;inset:0;pointer-events:none;border-radius:50%;box-shadow:0 0 0 999px rgb(0 0 0/.55);outline:3px solid #fff;outline-offset:-3px}
    .rc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;margin:8px 0}
    .rc-row input[type=range]{flex:1;min-width:160px;accent-color:var(--accent,#2f7bff)}
    .rc-prev{display:flex;gap:12px;justify-content:center;align-items:flex-end;flex-wrap:wrap;margin:6px 0 4px}
    .rc-tel{position:relative;width:160px;height:200px;border-radius:18px;overflow:hidden;border:3px solid #222;background:#111;touch-action:none;cursor:grab}
    .rc-pc{position:relative;width:320px;height:150px;border-radius:8px;overflow:hidden;border:3px solid #222;background:#111;touch-action:none;cursor:grab}
    .rc-tel img,.rc-pc img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
    .rc-pc img.fg{left:50%;width:120px;transform:translateX(-50%);-webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)}
    .rc-pc img.bgf{filter:blur(10px) brightness(.55);transform:scale(1.2)}
    .rc-tel::after,.rc-pc::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgb(0 0 0/.1),rgb(0 0 0/.05) 40%,rgb(0 0 0/.7));pointer-events:none}
    .rc-ov{position:absolute;left:0;right:0;bottom:12px;z-index:1;text-align:center;color:#fff;pointer-events:none}
    .rc-ov i{display:block;width:30px;height:30px;border-radius:50%;margin:0 auto 4px;border:2px solid #fff;background-size:cover;background-position:center}
    .rc-ov b{font-size:15px;font-family:Georgia,serif}.rc-pc .rc-ov{bottom:8px}.rc-pc .rc-ov i{width:24px;height:24px}
    .rc-lab{text-align:center;font-size:12px;color:var(--muted,#8a94a6);margin-top:4px}`;
  let styled = false;

  function modal(html) {
    if (!styled) { const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); styled = true; }
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box rc-box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d); return d;
  }
  function glisser(el, onMove) {
    let last = null;
    el.addEventListener("pointerdown", e => { last = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); e.preventDefault(); });
    el.addEventListener("pointermove", e => { if (!last) return; const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY]; onMove(dx, dy); });
    const fin = () => { last = null; }; el.addEventListener("pointerup", fin); el.addEventListener("pointercancel", fin);
  }
  const versBlob = c => new Promise(ok => c.toBlob(b => ok(b), "image/png"));

  /* ================= LOGO ================= */
  async function logo(fichier, opts) {
    const img = await charger(fichier), A = analyser(img), W = img.naturalWidth, H = img.naturalHeight;
    const S = 260, OUT = 600;
    // état : centre (cx, cy) dans l'image + taille vue dans le rond (pixels image)
    let cx, cy, vue, fond = A.bg;
    const auto = () => { const [x, y, w, h] = A.box; cx = x + w / 2; cy = y + h / 2; vue = A.rond ? Math.max(w, h) : Math.hypot(w, h) / 0.9; };
    const remplir = () => { cx = W / 2; cy = H / 2; vue = Math.min(W, H); };
    auto();
    const d = modal(`<h2 style="margin:0">⭕ Logo</h2><p class="muted" style="margin:4px 0 0;font-size:14px">Glissez le logo avec le doigt et zoomez : ce qui est dans le rond sera affiché.</p>
      <div class="rc-stage" style="width:${S}px;height:${S}px"><canvas width="${S * 2}" height="${S * 2}"></canvas><div class="rc-ring"></div></div>
      <div class="rc-row">➖<input type="range" id="rc-z" min="0" max="1000" value="500">➕</div>
      <div class="rc-row"><button class="btn sm primary" id="rc-auto">✨ Ajuster tout seul</button><button class="btn sm" id="rc-fill">⬛ Remplir le rond</button>
        <label class="btn sm">🎨 Fond <input type="color" id="rc-bg" value="${fond}" style="width:30px;height:22px;padding:0;border:0;background:none"></label><button class="btn sm ghost" id="rc-white">Fond blanc</button></div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn ghost" id="rc-no">Annuler</button><button class="btn primary" id="rc-ok">✅ Utiliser ce logo</button></div>`);
    const cv = d.querySelector("canvas"), g = cv.getContext("2d"), z = d.querySelector("#rc-z");
    const vmin = Math.max(W, H) * 0.08, vmax = Math.max(W, H) * 2.2;
    const zDe = v => Math.round(1000 * (1 - Math.log(v / vmin) / Math.log(vmax / vmin)));
    const vDe = s => vmin * Math.pow(vmax / vmin, 1 - s / 1000);
    function dessiner(ctx, taille) {
      const k = taille / vue;
      ctx.fillStyle = fond; ctx.fillRect(0, 0, taille, taille);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, taille / 2 - cx * k, taille / 2 - cy * k, W * k, H * k);
    }
    const maj = () => { z.value = zDe(vue); dessiner(g, cv.width); };
    maj();
    glisser(d.querySelector(".rc-stage"), (dx, dy) => { const k = vue / S; cx -= dx * k; cy -= dy * k; maj(); });
    d.querySelector(".rc-stage").addEventListener("wheel", e => { e.preventDefault(); vue = clamp(vue * (e.deltaY > 0 ? 1.08 : 0.93), vmin, vmax); maj(); }, { passive: false });
    z.oninput = () => { vue = vDe(+z.value); dessiner(g, cv.width); };
    d.querySelector("#rc-auto").onclick = () => { auto(); maj(); };
    d.querySelector("#rc-fill").onclick = () => { remplir(); maj(); };
    d.querySelector("#rc-bg").oninput = e => { fond = e.target.value; maj(); };
    d.querySelector("#rc-white").onclick = () => { fond = "#ffffff"; d.querySelector("#rc-bg").value = fond; maj(); };
    return new Promise(ok => {
      d.querySelector("#rc-no").onclick = () => { d.remove(); ok(null); };
      d.addEventListener("click", e => { if (e.target === d) { d.remove(); ok(null); } });
      d.querySelector("#rc-ok").onclick = async () => {
        const c = document.createElement("canvas"); c.width = c.height = OUT; dessiner(c.getContext("2d"), OUT);
        const blob = await versBlob(c); d.remove(); ok({ blob, pos: "" });
      };
    });
  }

  /* ================= COUVERTURE ================= */
  // couleur principale à l'intérieur d'un badge rond (ex. le bleu du logo)
  function couleurBadge(img, box) {
    const c = document.createElement("canvas"); c.width = c.height = 60; const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, box[0], box[1], box[2], box[3], 0, 0, 60, 60);
    const d = g.getImageData(0, 0, 60, 60).data, cnt = {};
    for (const [x, y] of [[8, 30], [52, 30], [30, 6], [30, 54], [12, 14], [48, 14], [12, 46], [48, 46]]) { const i = (y * 60 + x) * 4, k = [d[i], d[i + 1], d[i + 2]].map(v => Math.round(v / 24) * 24).join(","); cnt[k] = (cnt[k] || 0) + 1; }
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
    return hex(...best.map(v => clamp(v, 0, 255)));
  }
  async function cover(fichier, opts) {
    const img = await charger(fichier), W = img.naturalWidth, H = img.naturalHeight;
    const o = opts || {}, logoSrc = o.logo || "", nom = o.nom || "";
    const A = analyser(img), aire = (A.box[2] * A.box[3]) / (W * H);
    const estLogo = A.rond || aire < 0.8;               // logo sur fond uni → bannière avec le logo entier
    let mode = estLogo ? "logo" : "photo";
    let fx = 0.5, fy = 0.5, zoom = 1;                   // mode photo
    let taille = 0.42, ly = 0.36, fond = A.rond ? couleurBadge(img, A.box) : A.bg;   // mode logo
    const prev = document.createElement("canvas"), pg = prev.getContext("2d");
    const crop = () => { const w = W / zoom, h = H / zoom; const x0 = clamp(fx * W - w / 2, 0, W - w), y0 = clamp(fy * H - h / 2, 0, H - h); return { x0, y0, w, h, px: clamp((fx * W - x0) / w, 0, 1), py: clamp((fy * H - y0) / h, 0, 1) }; };
    function banniere(cv, BW) {
      const BH = Math.round(BW * 5 / 4); cv.width = BW; cv.height = BH; const g = cv.getContext("2d");
      g.fillStyle = fond; g.fillRect(0, 0, BW, BH);
      const rg = g.createRadialGradient(BW / 2, BH * ly, BH * 0.1, BW / 2, BH * ly, BW * 0.7);
      rg.addColorStop(0, "rgba(255,255,255,0.10)"); rg.addColorStop(1, "rgba(0,0,0,0.28)"); g.fillStyle = rg; g.fillRect(0, 0, BW, BH);
      const [bx, by, bw, bh] = A.box; let h = BH * taille, w = h * bw / bh;
      const wmax = BW * 0.84; if (w > wmax) { w = wmax; h = w * bh / bw; }       // reste visible sur téléphone
      const x = BW / 2 - w / 2, y = BH * ly - h / 2;
      g.save(); if (A.rond) { g.beginPath(); g.ellipse(BW / 2, BH * ly, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2); g.clip(); }
      g.imageSmoothingQuality = "high"; g.drawImage(img, bx, by, bw, bh, x, y, w, h); g.restore();
    }
    const ov = `<div class="rc-ov">${logoSrc ? `<i style="background-image:url('${logoSrc.replace(/'/g, "%27")}')"></i>` : ""}<b>${(nom || "").replace(/[<>&]/g, "")}</b></div>`;
    const d = modal(`<h2 style="margin:0">🖼 Photo de couverture</h2><p class="muted" style="margin:4px 0 0;font-size:14px" id="rc-aide"></p>
      <div class="rc-row" id="rc-modes"><button class="btn sm" data-mode="logo">✨ Bannière avec le logo</button><button class="btn sm" data-mode="photo">📷 Photo normale</button></div>
      <div class="rc-prev"><div><div class="rc-tel" data-f="tel"><img alt="">${ov}</div><div class="rc-lab">📱 Téléphone</div></div>
        <div><div class="rc-pc" data-f="pc"><img class="bgf" alt=""><img class="fg" alt="">${ov}</div><div class="rc-lab">💻 Ordinateur</div></div></div>
      <div class="rc-row">➖<input type="range" id="rc-z" min="100" max="300" value="100">➕</div>
      <div class="rc-row"><button class="btn sm" id="rc-c">🎯 Centrer</button><label class="btn sm" id="rc-bgl">🎨 Couleur du fond <input type="color" id="rc-bg" value="${fond}" style="width:30px;height:22px;padding:0;border:0;background:none"></label></div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn ghost" id="rc-no">Annuler</button><button class="btn primary" id="rc-ok">✅ Utiliser cette photo</button></div>`);
    const ims = [...d.querySelectorAll(".rc-tel img,.rc-pc img")], z = d.querySelector("#rc-z");
    let rq = 0;
    const ui = () => {
      d.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("primary", b.dataset.mode === mode));
      d.querySelector("#rc-bgl").style.display = mode === "logo" ? "" : "none";
      d.querySelector("#rc-aide").innerHTML = mode === "logo" ? "Votre logo entier sur une bannière de sa couleur : rien n’est coupé. Glissez pour le monter ou le descendre, ➖➕ pour sa taille." : "Glissez la photo dans un des écrans et zoomez : vous voyez tout de suite le menu sur <b>téléphone</b> et sur <b>ordinateur</b>.";
      if (mode === "logo") { z.min = 25; z.max = 65; z.value = Math.round(taille * 100); } else { z.min = 100; z.max = 300; z.value = Math.round(zoom * 100); }
      maj();
    };
    const maj = () => {
      if (rq) return; rq = requestAnimationFrame(() => {
        rq = 0; let url, pos = "50% 50%";
        if (mode === "logo") { banniere(prev, 560); url = prev.toDataURL("image/jpeg", 0.85); }
        else {
          const c = crop(), k = Math.min(1, 700 / Math.max(c.w, c.h));
          prev.width = Math.round(c.w * k); prev.height = Math.round(c.h * k);
          pg.drawImage(img, c.x0, c.y0, c.w, c.h, 0, 0, prev.width, prev.height);
          url = prev.toDataURL("image/jpeg", 0.8); pos = `${Math.round(c.px * 100)}% ${Math.round(c.py * 100)}%`;
        }
        ims.forEach(i => { i.src = url; i.style.objectPosition = pos; });
      });
    };
    d.querySelectorAll("[data-f]").forEach(fr => glisser(fr, (dx, dy) => {
      const r = (fr.querySelector("img.fg") || fr).getBoundingClientRect();
      if (mode === "logo") { ly = clamp(ly + dy / r.height, 0.2, 0.6); maj(); return; }
      const c = crop(), s = Math.max(r.width / c.w, r.height / c.h);
      fx = clamp(fx - dx / (s * W), 0, 1); fy = clamp(fy - dy / (s * H), 0, 1); maj();
    }));
    z.oninput = () => { if (mode === "logo") taille = +z.value / 100; else zoom = +z.value / 100; maj(); };
    d.querySelector("#rc-c").onclick = () => { if (mode === "logo") { taille = 0.42; ly = 0.36; } else { fx = fy = 0.5; zoom = 1; } ui(); };
    d.querySelector("#rc-bg").oninput = e => { fond = e.target.value; maj(); };
    d.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; ui(); });
    ui();
    return new Promise(ok => {
      d.querySelector("#rc-no").onclick = () => { d.remove(); ok(null); };
      d.addEventListener("click", e => { if (e.target === d) { d.remove(); ok(null); } });
      d.querySelector("#rc-ok").onclick = async () => {
        const out = document.createElement("canvas"); let pos = "50% 50%";
        if (mode === "logo") banniere(out, 1200);
        else {
          const c = crop(), k = Math.min(1, 1800 / Math.max(c.w, c.h));
          out.width = Math.round(c.w * k); out.height = Math.round(c.h * k);
          const og = out.getContext("2d"); og.imageSmoothingQuality = "high"; og.drawImage(img, c.x0, c.y0, c.w, c.h, 0, 0, out.width, out.height);
          pos = `${Math.round(c.px * 100)}% ${Math.round(c.py * 100)}%`;
        }
        const blob = await new Promise(r => out.toBlob(b => r(b), "image/jpeg", 0.92));
        d.remove(); ok({ blob, pos });
      };
    });
  }

  window.NFCW_RECADRER = (fichier, kind, opts) => kind === "logo" ? logo(fichier, opts) : cover(fichier, opts);
})();
