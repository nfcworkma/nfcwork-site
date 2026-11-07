(function () {
  "use strict";
  // Vue livreur (lecture seule) : une commande de livraison, ouverte depuis le lien reçu sur WhatsApp.
  // Lit un seul document commande (get par id — autorisé). Aucune écriture : le resto garde la main sur le statut.
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/";
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = new URLSearchParams(location.search);
  const slug = (qs.get("s") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const oid = (qs.get("o") || "").replace(/[^A-Za-z0-9_-]/g, "");
  const cparam = (qs.get("c") || "").replace(/\D/g, "");
  let CODE = "", confirming = false, autoTried = false;

  const S = f => (f && f.stringValue) || "";
  const N = f => f ? (f.doubleValue != null ? +f.doubleValue : f.integerValue != null ? +f.integerValue : 0) : 0;
  function items(f) {
    const vs = f && f.arrayValue && f.arrayValue.values;
    if (!vs) return [];
    return vs.map(v => { const x = (v.mapValue && v.mapValue.fields) || {}; return { n: S(x.n), q: N(x.q), p: N(x.p) }; });
  }
  function fmt(n) { return (Math.round(n * 100) / 100) + " DH"; }
  function waNum(t) { const d = String(t || "").replace(/\D/g, ""); return d.replace(/^0/, "212"); }

  let resto = { nom: "", wa: "" };
  async function lireResto() {
    try {
      const r = await fetch(DOC + "settings/menu-" + slug, { cache: "no-store" });
      if (!r.ok) return;
      const f = (await r.json()).fields || {};
      const m = JSON.parse((f.json && f.json.stringValue) || "{}");
      resto.nom = m.nom || ""; resto.wa = (m.infos || {}).whatsapp || "";
    } catch (e) {}
  }

  function etat(h) { app.innerHTML = '<div class="state">' + h + '</div>'; }

  const STAT = { nouvelle: ["🕒", "Reçue", "attend"], cuisine: ["👨‍🍳", "En préparation", "attend"], prete: ["📦", "À récupérer", "attend"], enroute: ["🛵", "En livraison", "go"], livree: ["✅", "Livrée", "done"], payee: ["✅", "Terminée", "done"], annulee: ["✖", "Annulée", "done"] };

  function rendre(f) {
    const st = S(f.statut) || "nouvelle";
    CODE = S(f.code);
    const info = STAT[st] || STAT.nouvelle;
    const its = items(f.items);
    const total = N(f.total), num = S(f.num), nom = S(f.nom), tel = S(f.tel), adresse = S(f.adresse), pos = S(f.pos), pay = S(f.pay);

    if (st === "livree" || st === "payee") {
      app.innerHTML = '<div class="bar">🛵 ' + esc(resto.nom || "Livraison") + '<span class="pill ok">✓ Livrée</span></div>' +
        '<div class="card"><div class="big"><div class="em">✅</div><h2 style="margin:8px 0 2px">Commande N° ' + esc(num) + ' livrée</h2><p class="num">Merci, bonne route !</p></div></div>';
      return;
    }
    if (st === "annulee") { etat('<div><div style="font-size:50px">✖</div><h2>Commande annulée</h2></div>'); return; }

    const gps = pos || (adresse ? "https://maps.google.com/?q=" + encodeURIComponent(adresse) : "");
    const recu = resto.wa ? '<a class="btn done" target="_blank" rel="noopener" href="https://wa.me/' + waNum(resto.wa) + '?text=' + encodeURIComponent("✅ Commande N° " + num + " livrée 🛵") + '">✅ J\'ai livré — prévenir ' + esc(resto.nom || "le resto") + '</a>' : "";

    app.innerHTML = '<div class="bar">🛵 ' + esc(resto.nom || "Livraison") + '<span class="pill' + (info[2] === "go" ? "" : " ok") + '">' + info[0] + ' ' + esc(info[1]) + '</span></div>' +
      '<div class="card">' +
        '<div class="num">Commande <b>N° ' + esc(num) + '</b></div>' +
        (nom || tel ? '<div class="addr"><span class="pin">👤</span><span><b>' + esc(nom || "Client") + '</b>' + (tel ? '<br><small>' + esc(tel) + '</small>' : "") + '</span></div>' : "") +
        (adresse || pos ? '<div class="addr"><span class="pin">📍</span><span><b>Adresse</b><br><small>' + esc(adresse || "Voir la position GPS") + '</small></span></div>' : "") +
        '<div class="items">' + its.map(i => '<div class="l"><span>' + i.q + '× ' + esc(i.n) + '</span><span>' + fmt(i.q * i.p) + '</span></div>').join("") +
          '<div class="tot"><span>Total' + (pay === "virement" ? " (payé par virement)" : " à encaisser") + '</span><span>' + fmt(total) + '</span></div></div>' +
        '<span class="pay ' + (pay === "virement" ? "vir" : "cash") + '">' + (pay === "virement" ? "🏦 Virement (déjà payé)" : "💵 Cash à encaisser") + '</span>' +
        (gps ? '<a class="btn gps" target="_blank" rel="noopener" href="' + esc(gps) + '">🗺 Ouvrir l\'itinéraire GPS</a>' : "") +
        (tel ? '<a class="btn call" href="tel:' + esc(tel.replace(/[^0-9+]/g, "")) + '">📞 Appeler le client</a>' : "") +
        recu + confirmBox() +
      '</div>' +
      '<p class="num" style="text-align:center">Cette page se met à jour toute seule.</p>';
    const inp = app.querySelector("#cf-code"), ok = app.querySelector("#cf-ok"), err = app.querySelector("#cf-err"), sc = app.querySelector("#cf-scan");
    if (ok) ok.onclick = () => tryConfirm(inp ? inp.value : "", err);
    if (sc) sc.onclick = () => scanner(err);
    if (cparam && !autoTried) { autoTried = true; if (inp) inp.value = cparam; tryConfirm(cparam, err); }
  }
  async function scanner(err) {
    if (!window.jsQR) { if (err) { err.style.color = "var(--accent)"; err.textContent = "Scanner indisponible — tapez le code."; } return; }
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center";
    ov.innerHTML = '<video playsinline muted style="width:100%;max-width:460px;max-height:70vh;object-fit:cover"></video>' +
      '<div style="position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:0;right:0;text-align:center;color:#fff;font-weight:700">Visez le QR du client</div>' +
      '<button style="position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:14px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:22px" aria-label="Fermer">✕</button>';
    document.body.appendChild(ov);
    const video = ov.querySelector("video");
    let stream, raf;
    const stop = () => { if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); };
    ov.querySelector("button").onclick = stop;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); video.srcObject = stream; await video.play(); }
    catch (e) { stop(); if (err) { err.style.color = "var(--accent)"; err.textContent = "Caméra refusée — tapez le code à la main."; } return; }
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    const loop = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        cv.width = video.videoWidth; cv.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, cv.width, cv.height);
        let img; try { img = ctx.getImageData(0, 0, cv.width, cv.height); } catch (e) {}
        const qr = img && window.jsQR(img.data, img.width, img.height);
        if (qr && qr.data) {
          const m = qr.data.match(/[?&]c=(\d{4})/), code = m ? m[1] : (/^\d{4}$/.test(qr.data.trim()) ? qr.data.trim() : "");
          if (code) { stop(); if (inpRef()) inpRef().value = code; tryConfirm(code, app.querySelector("#cf-err")); return; }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function inpRef() { return app.querySelector("#cf-code"); }
  function confirmBox() {
    return '<div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px">' +
      '<div style="font-weight:800;font-size:14px;margin-bottom:4px">✅ Confirmer la livraison</div>' +
      '<p class="num" style="margin:0 0 8px">Scannez le QR du client, ou tapez son code à 4 chiffres.</p>' +
      '<button class="btn" id="cf-scan" style="background:var(--accent);color:#fff;margin:0 0 8px">📷 Scanner le QR du client</button>' +
      '<div style="display:flex;gap:8px"><input id="cf-code" inputmode="numeric" maxlength="4" placeholder="0000" style="flex:1;min-width:0;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--bg);color:var(--fg);font-size:22px;letter-spacing:6px;text-align:center">' +
      '<button class="btn done" id="cf-ok" style="width:auto;margin:0;padding:0 18px">Valider</button></div>' +
      '<p id="cf-err" style="color:var(--accent);min-height:1em;margin:8px 0 0;font-size:13px"></p></div>';
  }
  async function tryConfirm(val, err) {
    const v = String(val || "").replace(/\D/g, "");
    if (v.length !== 4) { if (err) { err.style.color = "var(--accent)"; err.textContent = "Entrez le code à 4 chiffres."; } return; }
    if (CODE && v !== CODE) { if (err) { err.style.color = "var(--accent)"; err.textContent = "Code incorrect."; } return; }
    if (confirming) return; confirming = true;
    if (err) { err.style.color = "var(--muted)"; err.textContent = "Confirmation…"; }
    try {
      const now = new Date().toISOString();
      const r = await fetch(DOC + "commandes/" + encodeURIComponent(slug) + "/liste/" + encodeURIComponent(oid) + "?updateMask.fieldPaths=statut&updateMask.fieldPaths=maj&updateMask.fieldPaths=livreLe", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { statut: { stringValue: "livree" }, maj: { timestampValue: now }, livreLe: { timestampValue: now } } }) });
      if (!r.ok) throw new Error("http " + r.status);
      last = ""; tick();
    } catch (e) { confirming = false; if (err) { err.style.color = "var(--accent)"; err.textContent = "Échec. Réessayez, ou prévenez le resto sur WhatsApp."; } }
  }

  let last = "";
  async function tick() {
    try {
      const r = await fetch(DOC + "commandes/" + encodeURIComponent(slug) + "/liste/" + encodeURIComponent(oid), { cache: "no-store" });
      if (r.status === 404) { etat('<div><div style="font-size:50px">🔍</div><h2>Commande introuvable</h2><p>Le lien est peut-être incomplet.</p></div>'); return; }
      if (r.ok) {
        const f = (await r.json()).fields || {};
        const sig = JSON.stringify(f.statut) + JSON.stringify(f.livreurNom);
        if (sig !== last) { last = sig; rendre(f); }
      }
    } catch (e) {}
    setTimeout(tick, document.hidden ? 20000 : 10000);
  }

  if (!slug || !oid) { etat('<div><div style="font-size:50px">🛵</div><h2>Lien livreur</h2><p>Ouvrez le lien reçu sur WhatsApp pour voir la livraison.</p></div>'); return; }
  lireResto().then(tick);
})();
