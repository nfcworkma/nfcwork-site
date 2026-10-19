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
  const PROD = [["Plaque avis Google Pro", 149], ["Plaque avis Google Standard", 99], ["Plaque avis Google Premium", 199], ["Porte-clés NFC Menu", 99], ["Carte NFC Business Pro", 149], ["Carte NFC Business Standard", 99],
    ["Plaque Wi-Fi Pro", 99], ["Plaque de table « Menu + Ma carte »", 79], ["Stand de table numéroté", 79], ["Stickers QR (12)", 99], ["Caisson LED A4", 499],
    ["Menu Essentiel (mise en place)", 399], ["Menu Premium (mise en place)", 1490], ["Fidélité (mise en place)", 990], ["Menu + Fidélité (mise en place)", 1990], ["Commerce Complet (mise en place)", 2490],
    ["Abonnement mensuel", 149], ["Import du menu", 290], ["Séance photo", 490], ["Création de logo", 290]];
  let V = null, filtre = "mois", recherche = "";

  async function charger() {
    try { V = (await A().fs.collection("ventes").get()).docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.cree || "").localeCompare(String(a.cree || ""))); return true; }
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
      <button class="btn primary block" id="vnew" style="margin:12px 0">＋ Nouvelle vente</button>
      <input id="vq" type="search" placeholder="🔎 Client, produit…" value="${esc(recherche)}" style="width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:16px">
      <div class="vf">${[["jour", "Aujourd’hui"], ["mois", "Ce mois"], ["tout", "Tout"], ["reste", "À encaisser"]].map(([k, n]) => `<button data-vf="${k}" aria-pressed="${filtre === k}">${n}</button>`).join("")}</div>
      <div class="stack" style="gap:8px;margin-top:10px">${parClient(L)}</div>
      ${L.length ? `<p class="muted" style="text-align:center;font-size:13px;margin-top:10px">Sélection : <b>${dh(somme(L))}</b> · ${nb(L.length)}</p>` : ""}
`);
    document.getElementById("vnew").onclick = () => editer(null);
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
      <div class="stack" style="gap:8px;margin:10px 0">${L.map(v => { const rr = reste(v); return `<button class="vrow" data-vfid="${esc(v.id)}"><div style="flex:1;min-width:0;text-align:start"><b>${esc((v.lignes || []).map(l => (l.q > 1 ? l.q + " × " : "") + l.nom).join(", "))}</b><small>${frD(v.date)}${v.note ? " · " + esc(v.note) : ""}</small></div>
        <div style="text-align:end"><b>${dh(total(v))}</b>${rr ? `<small class="r">reste ${dh(rr)}</small>` : `<small class="ok">✅ payé</small>`}</div></button>`; }).join("") || `<p class="muted" style="margin:0">Rien encore.</p>`}</div>
      <button class="btn primary block" id="vfnew">＋ Ajouter une vente pour ${esc(c.name || "ce client")}</button>`;
    const retour = () => { A().clientView ? A().clientView(c) : dessiner(); };
    box.querySelector("#vfnew").onclick = () => editer(null, { client: c.name, clientId: c.id }, retour);
    box.querySelectorAll("[data-vfid]").forEach(b => b.onclick = () => editer(V.find(v => v.id === b.dataset.vfid), null, retour));
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
