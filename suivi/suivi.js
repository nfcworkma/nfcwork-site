(function () {
  "use strict";
  // Page de suivi client autonome : le resto envoie ce lien au client (/suivi/?s=<slug>&o=<id>).
  // Lecture seule (get par id). Affiche l'avancement, le code de livraison + QR, et le livreur.
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/";
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = new URLSearchParams(location.search);
  const slug = (qs.get("s") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const oid = (qs.get("o") || "").replace(/[^A-Za-z0-9_-]/g, "");
  const S = f => (f && f.stringValue) || "";

  let resto = { nom: "" };
  async function lireResto() {
    try { const r = await fetch(DOC + "settings/menu-" + slug, { cache: "no-store" }); if (!r.ok) return; const f = (await r.json()).fields || {}; const m = JSON.parse((f.json && f.json.stringValue) || "{}"); resto.nom = m.nom || ""; } catch (e) {}
  }
  function etat(h) { app.innerHTML = '<div class="state">' + h + '</div>'; }

  function etapes(mode) {
    return mode === "livraison"
      ? [["nouvelle", "📥", "Reçue"], ["cuisine", "👨‍🍳", "En préparation"], ["prete", "📦", "Prête"], ["enroute", "🛵", "En route vers vous"], ["livree", "✅", "Livrée"]]
      : [["nouvelle", "📥", "Reçue"], ["cuisine", "👨‍🍳", "En préparation"], ["prete", "✅", "Prête"]];
  }
  const IDX = { nouvelle: 0, cuisine: 1, prete: 2, assignee: 2, enroute: 3, livree: 4, payee: 4 };

  function codeBloc(code) {
    if (!code) return "";
    const url = location.origin + "/livreur/?s=" + encodeURIComponent(slug) + "&o=" + encodeURIComponent(oid) + "&c=" + encodeURIComponent(code);
    let qr = ""; try { if (window.QRGEN) qr = '<div class="qr">' + QRGEN.svg(url, { marge: 2 }) + '</div>'; } catch (e) {}
    return '<div class="codebox"><small>Code à donner au livreur</small><b>' + esc(code) + '</b>' + qr + '</div>';
  }

  let last = "";
  function rendre(f) {
    const st = S(f.statut) || "nouvelle", mode = S(f.mode) || "place", num = S(f.num), code = S(f.code), livNom = S(f.livreurNom), livTel = S(f.livreurTel), pay = S(f.pay);
    const ET = etapes(mode), i = IDX[st] == null ? 0 : IDX[st];
    if (st === "annulee") { etat('<div><div style="font-size:50px">✖</div><h2>Commande annulée</h2><p>Contactez le restaurant.</p></div>'); return; }
    const done = st === "livree" || st === "payee";
    app.innerHTML = '<div class="bar">🍽 ' + esc(resto.nom || "Votre commande") + '<span class="pill' + (done ? " ok" : "") + '">' + (done ? "✅ Livrée" : "● En direct") + '</span></div>' +
      (done ? '<div class="card"><div class="big"><div class="em">' + (mode === "livraison" ? "🛵" : "✅") + '</div><h2 style="margin:8px 0 2px">' + (mode === "livraison" ? "Commande livrée !" : "Commande prête !") + '</h2><p class="num">N° ' + esc(num) + ' · Bon appétit 🍽</p></div></div>' :
        '<div class="card"><div class="num">Commande <b>N° ' + esc(num) + '</b></div><ul class="steps">' +
        ET.map((e, k) => '<li class="' + (k < i ? "on" : k === i ? "on cur" : "") + '"><span class="dot">' + (k <= i ? e[1] : "○") + '</span><span class="stxt"><b>' + esc(e[2]) + '</b></span></li>').join("") +
        '</ul>' +
        (livNom && (st === "enroute" || st === "assignee") ? '<div class="liv"><span class="av">🧑🏽</span><span><b>' + esc(livNom) + '</b><br><small>Votre livreur · 🛵</small></span>' + (livTel ? '<a href="tel:' + esc(livTel.replace(/[^0-9+]/g, "")) + '" style="margin-left:auto;background:var(--ok);color:#fff;text-decoration:none;font-weight:700;font-size:12px;padding:8px 12px;border-radius:9px">Appeler</a>' : "") + '</div>' : "") +
        '</div>' +
        (mode === "livraison" && code && !done ? '<div class="card">' + codeBloc(code) + '</div>' : "")) +
      '<p class="num" style="text-align:center">Cette page se met à jour toute seule.</p>';
  }

  async function tick() {
    try {
      const r = await fetch(DOC + "commandes/" + encodeURIComponent(slug) + "/liste/" + encodeURIComponent(oid), { cache: "no-store" });
      if (r.status === 404) { etat('<div><div style="font-size:50px">🔍</div><h2>Commande introuvable</h2><p>Vérifiez le lien.</p></div>'); return; }
      if (r.ok) { const f = (await r.json()).fields || {}; const sig = JSON.stringify(f.statut) + JSON.stringify(f.livreurNom); if (sig !== last) { last = sig; rendre(f); } }
    } catch (e) {}
    setTimeout(tick, document.hidden ? 20000 : 8000);
  }

  if (!slug || !oid) { etat('<div><div style="font-size:50px">📦</div><h2>Lien de suivi</h2><p>Ouvrez le lien envoyé par le restaurant.</p></div>'); return; }
  lireResto().then(tick);
})();
