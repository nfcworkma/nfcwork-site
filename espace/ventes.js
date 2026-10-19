/* NFCWORK — 💰 Mes ventes (admin)
   Chaque vente : client, produits (quantité × prix), payé / reste à payer, date, note.
   Totaux : aujourd'hui, ce mois, l'année, reste à encaisser ; par produit et par client.
   Collection Firestore « ventes » (admin seulement) — règle : regle-ventes.txt */
(function () {
  "use strict";
  const A = () => window.NFCW_APP;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dh = n => (Math.round(+n || 0)).toLocaleString("fr-FR").replace(/ | /g, " ") + " DH";
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const auj = () => iso(new Date());
  const frD = s => s ? new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";
  const RULE = `match /ventes/{id} { allow read, write: if isAdmin(); }`;
  // produits les plus vendus (prix modifiables à chaque vente)
  let PROD = [["Plaque avis Google Pro", 149], ["Plaque avis Google Standard", 99], ["Plaque avis Google Premium", 199], ["Porte-clés NFC Menu", 99], ["Carte NFC Business Pro", 149], ["Carte NFC Business Standard", 99],
    ["Plaque Wi-Fi Pro", 99], ["Plaque de table « Menu + Ma carte »", 79], ["Stand de table numéroté", 79], ["Stickers QR (12)", 99], ["Caisson LED A4", 499],
    ["Menu Essentiel (mise en place)", 399], ["Menu Premium (mise en place)", 1490], ["Fidélité (mise en place)", 990], ["Menu + Fidélité (mise en place)", 1990], ["Commerce Complet (mise en place)", 2490],
    ["Abonnement mensuel", 149], ["Import du menu", 290], ["Séance photo", 490], ["Création de logo", 290]];
  let V = null, filtre = "mois", recherche = "";

  async function charger() {
    try { const all = (await A().fs.collection("ventes").get()).docs; const px = all.find(x => x.id === "__prix"); if (px && Array.isArray(px.data().liste)) PROD = px.data().liste.map(x => [x.n, +x.p || 0]);
      V = all.filter(x => !x.id.startsWith("__")).map(x => ({ id: x.id, ...x.data() })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.cree || "").localeCompare(String(a.cree || ""))); return true; }
    catch (e) { V = null; return false; }
  }
  const total = v => (v.lignes || []).reduce((s, l) => s + (+l.q || 0) * (+l.p || 0), 0);
  const reste = v => Math.max(0, total(v) - (+v.paye || 0));

  async function ouvrir() {
    const ap = A();
    ap.openModal(`${ap.head("💰 Mes ventes")}<p class="muted">Chargement…</p>`);
    if (!(await charger())) return regle();
    dessiner();
  }
  function regle() {
    const ap = A();
    ap.openModal(`${ap.head("💰 Mes ventes")}<div class="notice">Une seule fois : ajoutez cette règle dans Firebase → Firestore Database → <b>Règles</b>, juste avant « // Tout le reste est fermé », puis <b>Publier</b>. Ensuite rouvrez 💰 Ventes.</div>
      <pre style="white-space:pre-wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;font-size:13px;direction:ltr;text-align:left">${esc(RULE)}</pre><button class="btn primary" id="vcp">📋 Copier la règle</button>`);
    document.getElementById("vcp").onclick = async () => { try { await navigator.clipboard.writeText(RULE); ap.toast("Règle copiée ✓"); } catch (e) { prompt("Copiez :", RULE); } };
  }

  function dessiner() {
    const ap = A(), t = auj(), mois = t.slice(0, 7), an = t.slice(0, 4);
    const somme = L => L.reduce((s, v) => s + total(v), 0);
    const jour = V.filter(v => v.date === t), m = V.filter(v => String(v.date).startsWith(mois)), y = V.filter(v => String(v.date).startsWith(an));
    const aEnc = V.reduce((s, v) => s + reste(v), 0);
    const q = recherche.toLowerCase();
    const L = V.filter(v => (filtre === "tout" || (filtre === "mois" && String(v.date).startsWith(mois)) || (filtre === "jour" && v.date === t) || (filtre === "reste" && reste(v) > 0))
      && (!q || (v.client + " " + (v.lignes || []).map(l => l.nom).join(" ") + " " + (v.note || "")).toLowerCase().includes(q)));
    // classement produits / clients sur la sélection
    const parP = {}, parC = {};
    L.forEach(v => { (v.lignes || []).forEach(l => { const k = l.nom || "?"; parP[k] = parP[k] || [0, 0]; parP[k][0] += +l.q || 0; parP[k][1] += (+l.q || 0) * (+l.p || 0); }); parC[v.client || "?"] = (parC[v.client || "?"] || 0) + total(v); });
    const topP = Object.entries(parP).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6), topC = Object.entries(parC).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const nb = n => `${n} vente${n > 1 ? "s" : ""}`;
    ap.openModal(`${ap.head("💰 Mes ventes")}
      <div class="vk"><div><small>Aujourd’hui</small><b>${dh(somme(jour))}</b><i>${nb(jour.length)}</i></div><div><small>Ce mois</small><b>${dh(somme(m))}</b><i>${nb(m.length)}</i></div>
        <div><small>Cette année</small><b>${dh(somme(y))}</b><i>${nb(y.length)}</i></div><div class="${aEnc ? "bad" : ""}"><small>Reste à encaisser</small><b>${dh(aEnc)}</b><i>${V.filter(v => reste(v) > 0).length} client(s)</i></div></div>
      <div class="row" style="gap:8px;margin:12px 0"><button class="btn primary" id="vnew" style="flex:1">＋ Nouvelle vente</button><button class="btn" id="vpx">💲 Mes prix</button><button class="btn" data-g="devis">📝 Devis</button></div>
      <input id="vq" type="search" placeholder="🔎 Client, produit…" value="${esc(recherche)}" style="width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:16px">
      <div class="vf">${[["jour", "Aujourd’hui"], ["mois", "Ce mois"], ["tout", "Tout"], ["reste", "À encaisser"]].map(([k, n]) => `<button data-vf="${k}" aria-pressed="${filtre === k}">${n}</button>`).join("")}</div>
      <div class="stack" style="gap:8px;margin-top:10px">${parClient(L)}</div>
      ${L.length ? `<p class="muted" style="text-align:center;font-size:13px;margin-top:10px">Sélection : <b>${dh(somme(L))}</b> · ${nb(L.length)}</p>` : ""}
`);
    document.getElementById("vnew").onclick = () => editer(null);
    document.getElementById("vpx").onclick = () => prix();
    const qi = document.getElementById("vq"); qi.oninput = () => { recherche = qi.value; const p = qi.selectionStart; dessiner(); const n = document.getElementById("vq"); n.focus(); n.setSelectionRange(p, p); };
    document.querySelectorAll("[data-vf]").forEach(b => b.onclick = () => { filtre = b.dataset.vf; dessiner(); });
    document.querySelectorAll("[data-vcl]").forEach(b => b.onclick = () => { const S = A().S || {}, c = (S.clients || []).find(x => x.name === b.dataset.vcl); if (c && A().clientView) { A().closeModal && A().closeModal(); A().clientView(c); } else { recherche = b.dataset.vcl; dessiner(); } });
  }

  // une carte par client : ce qu'il a acheté, payé, reste
  function parClient(L) {
    if (!L.length) return `<p class="muted" style="text-align:center">Aucune vente ici. Touchez « Nouvelle vente ».</p>`;
    const G = {};
    L.forEach(v => { const k = v.client || "Client"; (G[k] = G[k] || []).push(v); });
    return Object.entries(G).sort((a, b) => b[1].reduce((s, v) => s + total(v), 0) - a[1].reduce((s, v) => s + total(v), 0)).map(([n, vs]) => {
      const t = vs.reduce((s, v) => s + total(v), 0), p = vs.reduce((s, v) => s + (+v.paye || 0), 0), r = vs.reduce((s, v) => s + reste(v), 0);
      const prods = {}; vs.forEach(v => (v.lignes || []).forEach(l => prods[l.nom] = (prods[l.nom] || 0) + (+l.q || 0)));
      return `<button class="vrow" data-vcl="${esc(n)}"><div style="flex:1;min-width:0;text-align:start"><b>👤 ${esc(n)}</b>
        <small>${esc(Object.entries(prods).map(([k, q]) => (q > 1 ? q + " × " : "") + k).join(", "))}</small><small>Payé ${dh(p)}</small></div>
        <div style="text-align:end"><b>${dh(t)}</b>${r ? `<small class="r">reste ${dh(r)}</small>` : `<small class="ok">✅ payé</small>`}</div></button>`;
    }).join("");
  }

  // 📦 dans la fiche client : ce qu'on lui a vendu
  async function client(c, box) {
    if (V === null && !(await charger())) { box.innerHTML = `<div class="section-head" style="margin-top:14px"><h3>💰 Ce qu’il a acheté</h3></div><button class="btn block" id="vrg">🔒 Activer le suivi des ventes</button>`; box.querySelector("#vrg").onclick = regle; return; }
    const nm = String(c.name || "").toLowerCase(), L = V.filter(v => v.clientId === c.id || String(v.client || "").toLowerCase() === nm);
    const t = L.reduce((s, v) => s + total(v), 0), p = L.reduce((s, v) => s + (+v.paye || 0), 0), r = t - p > 0 ? t - p : 0;
    box.innerHTML = `<div class="section-head" style="margin-top:14px"><h3>💰 Ce qu’il a acheté</h3></div>
      <div class="vk" style="grid-template-columns:1fr 1fr 1fr"><div><small>Total</small><b>${dh(t)}</b></div><div><small>Payé</small><b style="color:var(--ok,#30a46c)">${dh(p)}</b></div><div class="${r ? "bad" : ""}"><small>Reste</small><b>${dh(r)}</b></div></div>
      <div class="stack" style="gap:8px;margin:10px 0">${L.map(v => { const rr = reste(v); return `<button class="vrow" data-vfid="${esc(v.id)}"><div style="flex:1;min-width:0;text-align:start"><b>${esc((v.lignes || []).map(l => (l.q > 1 ? l.q + " × " : "") + l.nom).join(", "))}</b><small>${frD(v.date)}${v.note ? " · " + esc(v.note) : ""}</small><span class="btn sm" data-recu="${esc(v.id)}" style="margin-top:6px;display:inline-flex">🧾 Reçu</span></div>
        <div style="text-align:end"><b>${dh(total(v))}</b>${rr ? `<small class="r">reste ${dh(rr)}</small>` : `<small class="ok">✅ payé</small>`}</div></button>`; }).join("") || `<p class="muted" style="margin:0">Rien encore.</p>`}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" id="vfnew" style="flex:1">＋ Ajouter une vente</button><button class="btn" data-g="devis" data-c="${esc(c.id)}">📝 Devis</button></div>
      <div class="section-head" style="margin-top:16px"><h3>💳 Son abonnement</h3></div><div id="vabo"><p class="muted" style="margin:0">Chargement…</p></div>`;
    abosClient(c, box.querySelector("#vabo"));
    const retour = () => { A().clientView ? A().clientView(c) : dessiner(); };
    box.querySelector("#vfnew").onclick = () => editer(null, { client: c.name, clientId: c.id }, retour);
    box.querySelectorAll("[data-vfid]").forEach(b => b.onclick = e => { if (e.target.closest("[data-recu]")) return; editer(V.find(v => v.id === b.dataset.vfid), null, retour); });
    box.querySelectorAll("[data-recu]").forEach(b => b.onclick = e => { e.stopPropagation(); recu(V.find(v => v.id === b.dataset.recu), c); });
  }


  // 💳 abonnements du client (gestion complète : page Abonnements filtrée sur lui)
  async function abosClient(c, el) {
    let L = [];
    const n = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    try { L = (await A().fs.collection("abonnements").get()).docs.map(x => ({ id: x.id, ...x.data() })).filter(a => n(a.client) === n(c.name) || (c.email && String(a.email || "").toLowerCase() === String(c.email).toLowerCase())); } catch (e) {}
    const lien = "abonnements.html#client=" + encodeURIComponent(c.name || "");
    const SV = { menu: "🍽 Menu", fid: "🎁 Fidélité", profil: "📄 Carte / avis / Wi-Fi", autre: "💳 Abonnement" };
    el.innerHTML = (L.length ? `<div class="stack" style="gap:8px">${L.map(a => { const r = a.actif === false ? ["⛔ Coupé", "r"] : a.echeance && a.echeance < auj() ? ["⚠️ En retard", "r"] : ["✅ À jour", "ok"];
        return `<div class="vrow" style="cursor:default"><div style="flex:1;min-width:0;text-align:start"><b>${SV[a.service] || "💳"}${a.libelle ? " · " + esc(a.libelle) : ""}</b><small>${dh(a.prix)} / mois · échéance ${frD(a.echeance)}</small></div><small class="${r[1]}" style="white-space:nowrap">${r[0]}</small></div>`; }).join("")}</div>
      <a class="btn block" href="${lien}" style="margin-top:8px">💳 Paiement reçu · couper · réactiver</a>`
      : `<p class="muted" style="margin:0 0 8px">Aucun abonnement.</p><a class="btn block" href="${lien}&new=1">＋ Créer son abonnement</a>`);
  }

  // 🧾 reçu de paiement imprimable
  function recu(v, c) {
    if (!v) return;
    const w = window.open("", "_blank"); if (!w) { A().toast("Autorisez les fenêtres pour imprimer le reçu.", true); return; }
    const num = "R-" + String(v.date || auj()).replace(/-/g, "") + "-" + String(v.id || "").slice(0, 4).toUpperCase();
    const t = total(v), r = reste(v);
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reçu ${num}</title><style>
      body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#15181d}h1{font-size:22px;margin:0}.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e6fff;padding-bottom:10px}
      .hd img{height:34px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px;border-bottom:1px solid #e1e7f0;text-align:left}th{background:#0e1b33;color:#fff;font-size:13px}td.n,th.n{text-align:right;white-space:nowrap}
      .tot{text-align:right;font-size:15px;line-height:1.8}.tot b{font-size:20px}.box{display:flex;justify-content:space-between;gap:12px;margin-top:14px;font-size:14px}.sig{margin-top:40px;text-align:right;font-size:13px;color:#555}
      .bar{margin:20px 0;text-align:center}.bar button{padding:12px 20px;border-radius:12px;border:0;background:#1e6fff;color:#fff;font-size:16px}@media print{.bar{display:none}}</style></head><body>
      <div class="hd"><img src="${location.origin}/assets/img/logo-nfcwork.png" alt="NFCWORK"><div style="text-align:right"><h1>REÇU DE PAIEMENT</h1><div>N° ${num} · ${frD(v.date)}</div></div></div>
      <div class="box"><div><b>NFCWORK</b><br>Oualid Fahfouhi · Kénitra<br>06 20 66 60 27 · nfcwork.ma</div><div style="text-align:right"><b>Client</b><br>${esc(v.client)}${c && c.phone ? "<br>" + esc(c.phone) : ""}</div></div>
      <table><tr><th>Produit / service</th><th class="n">Qté</th><th class="n">Prix</th><th class="n">Montant</th></tr>${(v.lignes || []).map(l => `<tr><td>${esc(l.nom)}</td><td class="n">${l.q}</td><td class="n">${dh(l.p)}</td><td class="n">${dh(l.q * l.p)}</td></tr>`).join("")}</table>
      <div class="tot">Total : <b>${dh(t)}</b><br>Payé (${esc(v.mode || "")}) : <b style="color:#1f7a4d">${dh(v.paye)}</b>${r ? `<br>Reste à payer : <b style="color:#c0392b">${dh(r)}</b>` : `<br><b style="color:#1f7a4d">✅ Payé en totalité</b>`}</div>
      ${v.note ? `<p style="font-size:14px">Note : ${esc(v.note)}</p>` : ""}<div class="sig">Signature et cachet NFCWORK<br><br><br>________________________</div>
      <div class="bar"><button onclick="print()">🖨 Imprimer / Enregistrer en PDF</button></div></body></html>`);
    w.document.close();
  }

  // 💲 mes prix (catalogue proposé dans chaque vente)
  function prix() {
    const ap = A(), L = PROD.map(([n, p]) => ({ n, p }));
    const draw = () => {
      ap.openModal(`${ap.head("💲 Mes prix")}<p class="muted" style="margin:0 0 10px">Ces prix se remplissent tout seuls quand vous ajoutez un produit à une vente.</p>
        <div class="stack" style="gap:6px">${L.map((x, i) => `<div class="vl" style="grid-template-columns:minmax(0,1fr) 90px 32px"><input data-pn="${i}" value="${esc(x.n)}"><input data-pp="${i}" type="number" inputmode="decimal" value="${esc(x.p)}"><button type="button" data-px="${i}">✕</button></div>`).join("")}</div>
        <button class="btn sm" id="pxa" style="margin-top:8px">＋ Ajouter</button>
        <div class="row" style="gap:8px;margin-top:12px"><button class="btn primary" id="pxs" style="flex:1">💾 Enregistrer</button><button class="btn ghost" id="pxb">Retour</button></div>`);
      const lire = () => { document.querySelectorAll("[data-pn]").forEach(x => L[+x.dataset.pn].n = x.value.trim()); document.querySelectorAll("[data-pp]").forEach(x => L[+x.dataset.pp].p = +x.value || 0); };
      document.getElementById("pxa").onclick = () => { lire(); L.push({ n: "", p: 0 }); draw(); };
      document.querySelectorAll("[data-px]").forEach(b => b.onclick = () => { lire(); L.splice(+b.dataset.px, 1); draw(); });
      document.getElementById("pxb").onclick = () => dessiner();
      document.getElementById("pxs").onclick = async () => { lire(); const liste = L.filter(x => x.n); try { await ap.fs.doc("ventes/__prix").set({ liste, maj: new Date().toISOString() }); PROD = liste.map(x => [x.n, x.p]); ap.toast("✅ Prix enregistrés"); dessiner(); } catch (e) { ap.toast("Échec.", true); } };
    };
    draw();
  }

  function editer(v0, pre, apres) {
    apres = apres || dessiner;
    const ap = A(), S = ap.S || {};
    const v = v0 ? JSON.parse(JSON.stringify(v0)) : { client: (pre && pre.client) || "", clientId: (pre && pre.clientId) || "", date: auj(), lignes: [{ nom: "", q: 1, p: 0 }], paye: null, mode: "Espèces", note: "" };
    const draw = () => {
      const tot = total(v);
      ap.openModal(`${ap.head(v0 ? "✏️ Modifier la vente" : "＋ Nouvelle vente")}
        <form id="vform" class="stack" style="gap:10px">
          <label class="f">Client<input id="v-cl" list="v-cls" value="${esc(v.client)}" placeholder="Doner Turkish" autocomplete="off"><datalist id="v-cls">${(S.clients || []).map(c => `<option value="${esc(c.name)}">`).join("")}</datalist></label>
          <label class="f">Date<input id="v-d" type="date" value="${esc(v.date)}"></label>
          <div><div class="eyebrow" style="margin-bottom:6px">Produits vendus</div>
            <div class="vl vlh"><span>Produit</span><span>Qté</span><span>Prix</span><span></span></div>
            ${v.lignes.map((l, i) => `<div class="vl"><input data-ln="${i}" list="v-pr" value="${esc(l.nom)}" placeholder="Plaque avis Google Pro"><input data-lq="${i}" type="number" inputmode="numeric" min="1" value="${esc(l.q)}"><input data-lp="${i}" type="number" inputmode="decimal" min="0" value="${esc(l.p)}"><button type="button" data-lx="${i}" aria-label="Retirer">✕</button></div>`).join("")}
            <datalist id="v-pr">${PROD.map(([n, p]) => `<option value="${esc(n)}">${p} DH</option>`).join("")}</datalist>
            <button type="button" class="btn sm" id="v-add" style="margin-top:6px">＋ Ajouter un produit</button></div>
          <div class="vtot">Total : <b id="v-tot">${dh(tot)}</b></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><label class="f" style="flex:1;min-width:140px">Payé (DH)<input id="v-pa" type="number" inputmode="decimal" min="0" value="${esc(v.paye == null ? tot : v.paye)}"></label>
            <label class="f" style="flex:1;min-width:140px">Paiement<select id="v-m">${["Espèces", "Virement", "CashPlus / Wafacash", "Chèque"].map(x => `<option${v.mode === x ? " selected" : ""}>${x}</option>`).join("")}</select></label></div>
          <label class="f">Note (facultatif)<input id="v-n" value="${esc(v.note)}" placeholder="Livré le…, avance…"></label>
          <p class="err" id="v-err"></p>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" style="flex:1">💾 Enregistrer</button><button type="button" class="btn ghost" id="v-back">Retour</button>${v0 ? `<button type="button" class="btn ghost" id="v-del" style="color:var(--bad,#e5484d)">🗑</button>` : ""}</div>
        </form>`);
      const lire = () => {
        v.client = document.getElementById("v-cl").value.trim(); v.date = document.getElementById("v-d").value || auj();
        document.querySelectorAll("[data-ln]").forEach(x => v.lignes[+x.dataset.ln].nom = x.value.trim());
        document.querySelectorAll("[data-lq]").forEach(x => v.lignes[+x.dataset.lq].q = Math.max(1, +x.value || 1));
        document.querySelectorAll("[data-lp]").forEach(x => v.lignes[+x.dataset.lp].p = Math.max(0, +x.value || 0));
        const pa = document.getElementById("v-pa").value; v.paye = pa === "" ? 0 : +pa; v.mode = document.getElementById("v-m").value; v.note = document.getElementById("v-n").value.trim();
      };
      const f = document.getElementById("vform");
      f.addEventListener("input", e => {
        const n = e.target.dataset.ln; if (n != null) { const k = PROD.find(([nm]) => nm === e.target.value); if (k) { const pi = document.querySelector(`[data-lp="${n}"]`); if (pi && !(+pi.value)) pi.value = k[1]; } }
        const old = total(v); lire(); const t2 = total(v); document.getElementById("v-tot").textContent = dh(t2);
        if (e.target.id !== "v-pa") { const pa = document.getElementById("v-pa"); if (+pa.value === old) { pa.value = t2; v.paye = t2; } }
      });
      document.getElementById("v-add").onclick = () => { lire(); v.lignes.push({ nom: "", q: 1, p: 0 }); draw(); };
      document.querySelectorAll("[data-lx]").forEach(b => b.onclick = () => { lire(); v.lignes.splice(+b.dataset.lx, 1); if (!v.lignes.length) v.lignes.push({ nom: "", q: 1, p: 0 }); draw(); });
      document.getElementById("v-back").onclick = () => apres();
      const del = document.getElementById("v-del");
      if (del) del.onclick = async () => { if (!confirm("Supprimer cette vente ?")) return; try { await ap.fs.doc("ventes/" + v0.id).delete(); V = V.filter(x => x.id !== v0.id); ap.toast("Vente supprimée"); apres(); } catch (e) { ap.toast("Échec.", true); } };
      f.onsubmit = async e => {
        e.preventDefault(); lire();
        v.lignes = v.lignes.filter(l => l.nom || +l.p);
        if (!v.client) { document.getElementById("v-err").textContent = "Indiquez le client."; if (!v.lignes.length) v.lignes.push({ nom: "", q: 1, p: 0 }); return; }
        if (!v.lignes.length) { document.getElementById("v-err").textContent = "Ajoutez au moins un produit."; v.lignes.push({ nom: "", q: 1, p: 0 }); return; }
        const cl = (S.clients || []).find(c => (c.name || "").toLowerCase() === v.client.toLowerCase());
        const data = { client: v.client, clientId: cl ? cl.id : (v.clientId || ""), date: v.date, lignes: v.lignes.map(l => ({ nom: l.nom || "Produit", q: +l.q || 1, p: +l.p || 0 })), total: total(v), paye: +v.paye || 0, mode: v.mode, note: v.note, maj: new Date().toISOString() };
        try {
          if (v0) { await ap.fs.doc("ventes/" + v0.id).set(Object.assign({ cree: v0.cree || data.maj }, data)); Object.assign(v0, data); }
          else { const r = ap.fs.collection("ventes").doc(); data.cree = data.maj; await r.set(data); V.unshift({ id: r.id, ...data }); V.sort((a, b) => String(b.date).localeCompare(String(a.date))); }
          ap.toast("✅ Vente enregistrée : " + dh(data.total)); apres();
        } catch (x) { console.error(x); if (x && x.code === "permission-denied") regle(); else ap.toast("Échec de l’enregistrement.", true); }
      };
    };
    draw();
  }

  document.addEventListener("click", e => { const b = e.target.closest("[data-g='ventes']"); if (b) { e.preventDefault(); e.stopPropagation(); ouvrir(); } }, true);
  const st = document.createElement("style");
  st.textContent = `.vk{display:grid;grid-template-columns:1fr 1fr;gap:8px}.vk div{padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surface)}.vk small{display:block;color:var(--muted);font-size:12.5px}.vk b{display:block;font-size:20px;margin:2px 0}.vk i{font-style:normal;font-size:12px;color:var(--muted)}.vk .bad b{color:var(--bad,#e5484d)}
    .vf{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.vf button{padding:7px 12px;border-radius:20px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:13.5px}.vf button[aria-pressed=true]{background:var(--accent);color:var(--on-accent,#fff);border-color:var(--accent)}
    .vtop{display:grid;grid-template-columns:1fr;gap:8px;font-size:13px}.vtop>div{padding:10px;border-radius:12px;border:1px solid var(--line);display:grid;gap:4px}.vtop span{display:flex;justify-content:space-between;gap:6px}.vtop em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.vtop strong{white-space:nowrap;flex:none}
    .vrow{display:flex;gap:10px;align-items:center;width:100%;padding:11px 12px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;cursor:pointer}.vrow small{display:block;color:var(--muted);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vrow small.r{color:var(--bad,#e5484d)}.vrow small.ok{color:var(--ok,#30a46c)}
    .vl{display:grid;grid-template-columns:minmax(0,1fr) 54px 76px 32px;gap:5px;align-items:center;margin-bottom:5px}.vl input{min-width:0;padding:10px 8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit;font-size:15px}.vl button{border:0;background:none;color:var(--muted);font-size:16px}.vlh span{font-size:11.5px;color:var(--muted)}
    .vtot{font-size:16px;text-align:end}.vtot b{font-size:22px}`;
  document.head.appendChild(st);
  window.NFCW_VENTES = { ouvrir, client };
})();
