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
        recu +
      '</div>' +
      '<p class="num" style="text-align:center">Cette page se met à jour toute seule.</p>';
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
