/* =========================================================
   NFCWORK — GESTION RAPIDE (admin, téléphone ou PC)
   Dans le tableau de bord : 🔎 recherche partout, 💰 abonnements à relancer,
   🎯 démo en 2 minutes, 📝 devis, ✍️ contrat signé au doigt, 🗂 prospects.
   Dans la fiche client : tous ses produits et les actions rapides.
   Utilise le pont window.NFCW_APP (app.js).
   Prospects : collection « prospects » (admin) — règle à ajouter dans Firebase (affichée si besoin).
   ========================================================= */
(function () {
  "use strict";
  const A = () => window.NFCW_APP;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const waNum = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 9 ? d : ""; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const auj = () => iso(new Date());
  const ecart = s => Math.round((new Date(s + "T12:00:00") - new Date(auj() + "T12:00:00")) / 864e5);
  const frDate = s => s ? new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const prix = n => (+n || 0).toLocaleString("fr-FR").replace(/ | /g, " ");
  const b64 = x => btoa(unescape(encodeURIComponent(JSON.stringify(x)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const RULE = `match /prospects/{id} { allow read, write: if isAdmin(); }`;
  const MOI = { nom: "Oualid Fahfouhi", qualite: "Fondateur", cin: "GI13259", tel: "06 20 66 60 27", mail: "nfcworkmacontact@gmail.com", site: "nfcwork.ma" };

  // tarifs 2026 (mêmes prix que le site et le PDF)
  const CATA = [
    ["Abonnements", [["Fidélité", 990, 149], ["Fidélité + Avis Google", 1090, 149], ["Menu Premium", 1490, 149], ["Menu + Fidélité", 1990, 249], ["Commerce Complet", 2490, 299], ["Menu Essentiel", 399, 25], ["Abonnement mises à jour (produits NFC)", 0, 25]]],
    ["Produits (paiement unique)", [["Carte NFC Business Standard", 99, 0], ["Carte NFC Business Pro", 149, 0], ["Carte NFC Business Premium", 199, 0], ["Plaque avis Google Standard", 99, 0], ["Plaque avis Google Pro", 149, 0], ["Plaque avis Google Premium", 199, 0],
      ["Plaque Wi-Fi Standard", 79, 0], ["Plaque Wi-Fi Pro", 99, 0], ["Plaque Wi-Fi Premium", 149, 0], ["Plaque de table « Menu + Ma carte »", 79, 0], ["Plaque comptoir « Ma carte »", 149, 0], ["Stand de table numéroté", 79, 0],
      ["Porte-clés NFC", 99, 0], ["Carte au design du commerce", 149, 0], ["Cartes fidélité clients (50)", 449, 0], ["Cartes fidélité clients (100)", 790, 0], ["Sticker NFC location de voiture", 79, 0], ["Caisson LED A4", 499, 0], ["Caisson LED A3", 699, 0], ["12 stickers QR", 99, 0]]],
    ["Services", [["Menu sur écran TV", 490, 49], ["Gestion fiche Google", 0, 199], ["Mini-site vitrine", 990, 99], ["Import menu Glovo / photo", 290, 0], ["Séance photo des plats", 490, 0], ["Création de logo", 290, 0]]]
  ];

  /* ---------- données chargées une fois ---------- */
  let D = null;
  async function donnees(force) {
    if (D && !force) return D;
    const fs = A().fs, liste = async id => { try { const d = await fs.doc("settings/" + id).get(); return d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { return []; } };
    const [menus, pages, tvs] = await Promise.all([liste("menus"), liste("pages"), liste("tvs")]);
    let abos = [], progs = [], prospects = null;
    try { abos = (await fs.collection("abonnements").get()).docs.map(x => ({ id: x.id, ...x.data() })); } catch (e) {}
    try { progs = (await fs.collection("fidProgrammes").get()).docs.map(x => ({ id: x.id, ...x.data() })); } catch (e) {}
    try { prospects = (await fs.collection("prospects").get()).docs.map(x => ({ id: x.id, ...x.data() })); } catch (e) { prospects = null; }
    D = { menus, pages, tvs, abos, progs, prospects };
    return D;
  }

  /* ---------- tableau de bord ---------- */
  async function home() {
    const box = document.getElementById("gHome"); if (!box) return;
    box.innerHTML = `<input id="gq" type="search" placeholder="🔎 Chercher : client, menu, carte, facture…" autocomplete="off" style="width:100%;padding:13px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:16px;margin-bottom:10px">
      <div id="gres"></div>
      <div class="gacts"><button class="ga" data-g="demo"><span>🎯</span><b>Démo 2 min</b></button><button class="ga" data-g="devis"><span>📝</span><b>Devis</b></button><button class="ga" data-g="contrat"><span>✍️</span><b>Contrat</b></button><button class="ga" data-g="prospects"><span>🗂</span><b>Prospects</b><i id="gpb"></i></button>
        <button class="ga" data-g="ventes"><span>💰</span><b>Ventes</b></button><button class="ga" data-g="stats"><span>📊</span><b>Visites</b></button><button class="ga" data-new-inv><span>🧾</span><b>Facture</b></button><button class="ga" data-g="guide"><span>📖</span><b>Guide</b></button><button class="ga" data-g="app" id="gapp"><span>📲</span><b>Application</b></button></div>
      <div id="grel"></div>`;
    try { if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) document.getElementById("gapp").remove(); } catch (e) {}
    const q = document.getElementById("gq"); q.oninput = () => chercher(q.value);
    const d = await donnees();
    relances(d);
    if (d.prospects) { const n = d.prospects.filter(p => p.rappel && p.rappel <= auj() && !["signe", "perdu"].includes(p.statut)).length; const b = document.getElementById("gpb"); if (b && n) b.textContent = n; }
  }
  function relances(d) {
    const box = document.getElementById("grel"); if (!box) return;
    const l = d.abos.filter(a => a.actif !== false && a.echeance && ecart(a.echeance) <= 3).sort((a, b) => a.echeance.localeCompare(b.echeance));
    if (!l.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="section-head" style="margin-top:6px"><h3>💰 À encaisser (${l.length})</h3><a class="btn sm ghost" href="abonnements.html">Abonnements</a></div>
      <div class="stack" style="gap:8px;margin-bottom:16px">${l.map(a => { const j = ecart(a.echeance), w = waNum(a.tel);
        const txt = `Bonjour ${a.client},\n\nVotre abonnement NFCWORK${a.libelle ? " (" + a.libelle + ")" : ""} ${j < 0 ? "est arrivé à échéance le " + frDate(a.echeance) : "arrive à échéance le " + frDate(a.echeance)} : ${prix(a.prix)} DH / mois.\n\nMerci de régler pour garder votre service actif 🙏\n\nNFCWORK · nfcwork.ma`;
        return `<div class="grow"><div style="flex:1;min-width:0"><b>${esc(a.client)}</b><div class="muted" style="font-size:13px">${prix(a.prix)} DH · ${j < 0 ? `<b style="color:var(--bad)">⚠️ ${-j} j de retard</b>` : j === 0 ? "<b style=\"color:var(--warn)\">aujourd’hui</b>" : "dans " + j + " j"}</div></div>
          ${w ? `<a class="btn sm" href="https://wa.me/${w}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">💬 Rappel</a>` : ""}<a class="btn sm primary" href="abonnements.html">✅ Payé</a></div>`; }).join("")}</div>`;
  }
  async function chercher(q) {
    const box = document.getElementById("gres"); if (!box) return;
    const n = norm(q); if (n.length < 2) { box.innerHTML = ""; return; }
    const d = await donnees(), S = A().S, ok = s => norm(s).includes(n), res = [];
    S.clients.filter(c => ok(c.name + " " + c.email + " " + c.phone)).forEach(c => res.push(["👤", c.name, "Client · " + (c.phone || c.email || ""), `data-gcli="${esc(c.id)}"`]));
    d.menus.filter(m => ok(m.nom + " " + m.slug)).forEach(m => res.push(["🍽", m.nom, "Menu · nfcwork.ma/menu/" + m.slug, `href="menus.html#m=${esc(m.slug)}"`]));
    d.pages.filter(p => ok(p.nom + " " + p.slug)).forEach(p => res.push([{ profil: "👤", avis: "⭐", wifi: "📶", liens: "🔗" }[p.type] || "📄", p.nom, "Page · nfcwork.ma/p/" + p.slug, `href="pages.html#e=${esc(p.slug)}"`]));
    d.tvs.filter(t => ok(t.nom + " " + t.slug)).forEach(t => res.push(["📺", t.nom, "Menu TV · nfcwork.ma/tv/" + t.slug, `href="tv.html#e=${esc(t.slug)}"`]));
    d.progs.filter(p => ok(p.nom + " " + p.ownerEmail)).forEach(p => res.push(["🎁", p.nom, "Fidélité", `href="fidelite.html#p=${esc(p.id)}"`]));
    S.creations.filter(c => ok((c.titre || "") + " " + (c.slug || "") + " " + (c.clientEmail || ""))).forEach(c => res.push(["💳", c.titre || c.slug, "Outil Mac · " + (c.lien || "").replace(/^https?:\/\//, ""), `href="${esc(c.lien || "#")}" target="_blank" rel="noopener"`]));
    S.invoices.filter(i => ok(i.number)).forEach(i => res.push(["🧾", i.number, "Facture", `data-open-inv="${esc(i.id)}"`]));
    (d.prospects || []).filter(p => ok(p.nom + " " + p.tel + " " + p.ville)).forEach(p => res.push(["🗂", p.nom, "Prospect · " + (STATUTS[p.statut] || [""])[0], `data-gpro="${esc(p.id)}"`]));
    box.innerHTML = res.length ? `<div class="list" style="margin-bottom:14px">${res.slice(0, 25).map(([i, t, s, at]) => `<${/href=/.test(at) ? "a" : "button"} class="item" ${at} style="text-decoration:none"><div class="avatar" style="font-size:18px">${i}</div><div class="main"><div class="t">${esc(t)}</div><div class="s">${esc(s)}</div></div></${/href=/.test(at) ? "a" : "button"}>`).join("")}</div>`
      : `<p class="muted" style="margin:0 0 12px">Rien trouvé pour « ${esc(q)} ».</p>`;
  }

  /* ---------- fiche client : ses produits + actions ---------- */
  async function client(c) {
    const box = document.getElementById("gClient"); if (!box) return;
    box.innerHTML = `<p class="muted">Chargement des produits…</p>`;
    const d = await donnees(true), S = A().S, nc = norm(c.name), em = String(c.email || "").toLowerCase();
    const proche = s => { const x = norm(s); return x && nc && (x.includes(nc) || nc.includes(x)); };
    const P = [];
    d.menus.filter(m => proche(m.nom)).forEach(m => P.push(["🍽", m.nom, "nfcwork.ma/menu/" + m.slug, "menus.html#m=" + m.slug]));
    d.pages.filter(p => proche(p.nom)).forEach(p => P.push([{ profil: "👤", avis: "⭐", wifi: "📶", liens: "🔗" }[p.type] || "📄", p.nom, "nfcwork.ma/p/" + p.slug, "pages.html#e=" + p.slug]));
    d.tvs.filter(t => proche(t.nom)).forEach(t => P.push(["📺", t.nom, "nfcwork.ma/tv/" + t.slug, "tv.html#e=" + t.slug]));
    d.progs.filter(p => (em && String(p.ownerEmail || "").toLowerCase() === em) || proche(p.nom)).forEach(p => P.push(["🎁", p.nom, "Fidélité", "fidelite.html#p=" + p.id]));
    S.creations.filter(x => (em && String(x.clientEmail || "").toLowerCase() === em) || proche(x.titre)).forEach(x => P.push(["💳", x.titre || x.slug, (x.lien || "").replace(/^https?:\/\//, ""), x.lien || "#"]));
    const ab = d.abos.filter(a => proche(a.client) || (waNum(a.tel) && waNum(a.tel) === waNum(c.phone)));
    const w = waNum(c.phone);
    box.innerHTML = `<div class="section-head" style="margin-top:16px"><h3>⚡ Actions</h3></div>
      <div class="gacts">${w ? `<a class="ga" href="https://wa.me/${w}" target="_blank" rel="noopener"><span>💬</span><b>WhatsApp</b></a><a class="ga" href="tel:+${w}"><span>📞</span><b>Appeler</b></a>` : ""}
        <button class="ga" data-g="devis" data-c="${esc(c.id)}"><span>📝</span><b>Devis</b></button><button class="ga" data-g="contrat" data-c="${esc(c.id)}"><span>✍️</span><b>Contrat</b></button></div>
      <div class="section-head" style="margin-top:10px"><h3>📱 Ses produits (${P.length})</h3><button class="btn sm" data-creer>＋ Créer</button></div>
      ${P.length ? `<div class="list">${P.map(([i, t, s, h]) => `<a class="item" href="${esc(h)}" ${/^https?:/.test(h) ? 'target="_blank" rel="noopener"' : ""} style="text-decoration:none"><div class="avatar" style="font-size:18px">${i}</div><div class="main"><div class="t">${esc(t)}</div><div class="s">${esc(s)}</div></div></a>`).join("")}</div>`
        : `<p class="muted" style="font-size:13.5px">Aucun produit trouvé avec le nom « ${esc(c.name)} ». Astuce : donnez au menu ou à la carte le même nom que le client.</p>`}
      <div id="gAcces"></div>
      ${ab.length ? `<div class="section-head" style="margin-top:10px"><h3>🔁 Abonnements</h3><a class="btn sm ghost" href="abonnements.html">Gérer</a></div>
        <div class="list">${ab.map(a => { const j = ecart(a.echeance); return `<div class="item" style="cursor:default"><div class="avatar">🔁</div><div class="main"><div class="t">${esc(a.libelle || a.service)} · ${prix(a.prix)} DH/mois</div><div class="s">${a.actif === false ? "⏸ arrêté" : j < 0 ? `⚠️ en retard de ${-j} j` : "prochaine échéance " + frDate(a.echeance)}</div></div></div>`; }).join("")}</div>` : ""}`;
    const ga = document.getElementById("gAcces"); if (ga && window.NFCW_MC) window.NFCW_MC.admin(c, ga);
  }

  /* ---------- 🎯 démo en 2 minutes ---------- */
  function demo() {
    const nom = prompt("🎯 Nom du commerce pour la démo :", "");
    if (!nom || !nom.trim()) return;
    location.href = "menus.html#nouveau=" + b64({ nom: nom.trim(), formule: "premium", demo: true });
  }

  /* ---------- 📝 devis ---------- */
  function lignesHtml(L) {
    return L.map((l, i) => `<div class="dl"><input data-d="${i}.nom" value="${esc(l.nom)}" placeholder="Désignation"><input data-d="${i}.q" type="number" min="1" value="${esc(l.q)}" class="num" title="Quantité"><input data-d="${i}.p" type="number" min="0" value="${esc(l.p)}" class="num" title="Une fois (DH)"><input data-d="${i}.m" type="number" min="0" value="${esc(l.m)}" class="num" title="Par mois (DH)"><button type="button" class="iconbtn" data-dx="${i}">✕</button></div>`).join("");
  }
  function totaux(L, remise) {
    const u = L.reduce((a, l) => a + (+l.q || 0) * (+l.p || 0), 0), m = L.reduce((a, l) => a + (+l.q || 0) * (+l.m || 0), 0);
    const r = Math.round(u * (Math.min(50, Math.max(0, +remise || 0)) / 100));
    return { u, m, r, net: u - r };
  }
  function devis(cid) {
    const ap = A(), S = ap.S, c = cid ? ap.clientById(cid) : null;
    const st = { client: c ? c.name : "", tel: c ? c.phone || "" : "", clientId: c ? c.id : "", L: [], remise: 0, note: "Validité : 30 jours. Acompte 50 % pour les produits personnalisés. 1er mois d’abonnement offert." };
    const draw = () => {
      const t = totaux(st.L, st.remise);
      ap.openModal(`${ap.head("📝 Devis")}
        <div class="stack">
          <div class="grid2"><label class="f">Client<input id="dv-c" value="${esc(st.client)}" list="dv-cl" placeholder="Nom du commerce"></label><label class="f">Téléphone<input id="dv-t" type="tel" value="${esc(st.tel)}"></label></div>
          <datalist id="dv-cl">${S.clients.map(x => `<option value="${esc(x.name)}">`).join("")}</datalist>
          <label class="f">➕ Ajouter<select id="dv-add"><option value="">Choisir une formule ou un produit…</option>${CATA.map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(([n, p, m], i) => `<option value="${esc(g)}|${i}">${esc(n)} · ${p ? prix(p) + " DH" : ""}${p && m ? " + " : ""}${m ? prix(m) + " DH/mois" : ""}</option>`).join("")}</optgroup>`).join("")}<option value="libre">✏️ Ligne libre</option></select></label>
          ${st.L.length ? `<div class="dl dlh"><span>Désignation</span><span>Qté</span><span>Une fois</span><span>/ mois</span><span></span></div>${lignesHtml(st.L)}` : `<p class="muted" style="margin:0">Ajoutez au moins une ligne.</p>`}
          <label class="f">Remise sur la mise en place (%)<input id="dv-r" type="number" min="0" max="50" value="${esc(st.remise)}" class="num" style="max-width:120px"></label>
          <div class="totals num"><div><span class="muted">À payer une fois</span><span>${prix(t.u)} DH</span></div>${t.r ? `<div><span class="muted">Remise</span><span>− ${prix(t.r)} DH</span></div>` : ""}<div class="grand"><span>Au départ</span><span>${prix(t.net)} DH</span></div>${t.m ? `<div class="grand"><span>Ensuite</span><span>${prix(t.m)} DH / mois</span></div>` : ""}</div>
          <label class="f">Conditions<textarea id="dv-n" rows="2">${esc(st.note)}</textarea></label>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" data-dv="pdf">🖨 PDF</button><button class="btn" data-dv="wa">💬 WhatsApp</button><button class="btn" data-dv="fac">🧾 En facture</button><button class="btn" data-dv="contrat">✍️ Contrat</button></div>
        </div>`);
      const m = document.getElementById("modal");
      const lire = () => { st.client = document.getElementById("dv-c").value; st.tel = document.getElementById("dv-t").value; st.remise = +document.getElementById("dv-r").value || 0; st.note = document.getElementById("dv-n").value;
        const cl = S.clients.find(x => x.name === st.client); st.clientId = cl ? cl.id : ""; if (cl && !st.tel) st.tel = cl.phone || ""; };
      m.querySelectorAll("[data-d]").forEach(el => el.oninput = () => { const [i, k] = el.dataset.d.split("."); st.L[+i][k] = k === "nom" ? el.value : +el.value || 0; });
      m.querySelectorAll("[data-d]").forEach(el => el.onchange = () => { lire(); setTimeout(draw, 0); });
      document.getElementById("dv-r").onchange = () => { lire(); setTimeout(draw, 0); };
      document.getElementById("dv-add").onchange = e => { lire(); const v = e.target.value; if (v === "libre") st.L.push({ nom: "", q: 1, p: 0, m: 0 }); else if (v) { const [g, i] = v.split("|"), x = CATA.find(k => k[0] === g)[1][+i]; st.L.push({ nom: x[0], q: 1, p: x[1], m: x[2] }); } draw(); };
      m.querySelectorAll("[data-dx]").forEach(b => b.onclick = () => { lire(); st.L.splice(+b.dataset.dx, 1); draw(); });
      m.querySelectorAll("[data-dv]").forEach(b => b.onclick = () => {
        lire(); if (!st.L.length) { ap.toast("Ajoutez au moins une ligne."); return; }
        const t2 = totaux(st.L, st.remise), num = "DEV-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-5);
        if (b.dataset.dv === "pdf") imprimerDevis(st, t2, num);
        if (b.dataset.dv === "wa") { const w = waNum(st.tel); const txt = `Bonjour ${st.client},\n\nVoici votre devis NFCWORK (${num}) :\n\n${st.L.map(l => `• ${l.q > 1 ? l.q + " × " : ""}${l.nom}${l.p ? " — " + prix(l.p * l.q) + " DH" : ""}${l.m ? " + " + prix(l.m * l.q) + " DH/mois" : ""}`).join("\n")}\n\n${t2.r ? `Remise : −${prix(t2.r)} DH\n` : ""}👉 Au départ : ${prix(t2.net)} DH${t2.m ? `\n👉 Ensuite : ${prix(t2.m)} DH / mois` : ""}\n\n${st.note}\n\nNFCWORK · nfcwork.ma · ${MOI.tel}`; window.open((w ? "https://wa.me/" + w : "https://wa.me/") + "?text=" + encodeURIComponent(txt), "_blank"); }
        if (b.dataset.dv === "fac") { if (!st.clientId) { ap.toast("Choisissez un client enregistré (ou créez-le d’abord)."); return; } ap.factureDepuis(st.clientId, st.L.filter(l => l.p).map(l => ({ serviceId: "", desc: l.nom, qty: l.q, price: l.p * (1 - (+st.remise || 0) / 100) })).concat(st.L.filter(l => l.m).map(l => ({ serviceId: "", desc: l.nom + " · 1er mois d’abonnement", qty: l.q, price: l.m }))), st.note); }
        if (b.dataset.dv === "contrat") { const f = st.L.find(l => l.m) || st.L[0]; contrat(st.clientId, { client: st.client, tel: st.tel, formule: f.nom, setup: t2.net, mois: t2.m, lignes: st.L }); }
      });
    };
    draw();
  }
  function imprimerDevis(st, t, num) {
    const w = window.open("", "_blank"); if (!w) { A().toast("Autorisez les fenêtres pour imprimer."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Devis ${esc(num)}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12pt}
      .h{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e6fff;padding-bottom:8px}.h img{height:34px}h1{font-size:20pt;margin:18px 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f3f6fb;font-size:10pt}td.r,th.r{text-align:right}
      .tot{margin-left:auto;width:60%}.tot div{display:flex;justify-content:space-between;padding:6px 0}.tot .g{font-weight:700;font-size:14pt;border-top:2px solid #111}.n{color:#555;font-size:10pt;white-space:pre-wrap}.bar{text-align:center;margin-bottom:12px}.bar button{font-size:16px;padding:10px 18px;border-radius:10px;border:0;background:#1e90ff;color:#fff}@media print{.bar{display:none}}</style></head><body>
      <div class="bar"><button onclick="print()">🖨 Imprimer / Enregistrer en PDF</button></div>
      <div class="h"><img src="${location.origin}/assets/img/logo-nfcwork.png" alt="NFCWORK"><div style="text-align:right;font-size:10pt">${MOI.nom} · ${MOI.qualite}<br>WhatsApp ${MOI.tel}<br>${MOI.site} · ${MOI.mail}</div></div>
      <h1>Devis ${esc(num)}</h1><div>Date : ${frDate(auj())}<br>Client : <b>${esc(st.client || "—")}</b>${st.tel ? " · " + esc(st.tel) : ""}</div>
      <table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">Une fois</th><th class="r">Par mois</th></tr></thead><tbody>${st.L.map(l => `<tr><td>${esc(l.nom)}</td><td class="r">${l.q}</td><td class="r">${l.p ? prix(l.p * l.q) + " DH" : "—"}</td><td class="r">${l.m ? prix(l.m * l.q) + " DH" : "—"}</td></tr>`).join("")}</tbody></table>
      <div class="tot"><div><span>Total à payer une fois</span><span>${prix(t.u)} DH</span></div>${t.r ? `<div><span>Remise</span><span>− ${prix(t.r)} DH</span></div>` : ""}<div class="g"><span>Au départ</span><span>${prix(t.net)} DH</span></div>${t.m ? `<div class="g"><span>Ensuite</span><span>${prix(t.m)} DH / mois</span></div>` : ""}</div>
      <p class="n">${esc(st.note)}</p><p class="n">Prix en dirhams. Paiement : espèces, virement, CashPlus ou Wafacash.</p></body></html>`);
    w.document.close();
  }

  /* ---------- ✍️ contrat signé au doigt ---------- */
  function signature(canvas) {
    const g = canvas.getContext("2d"), r = () => canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1; canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio; g.scale(ratio, ratio);
    g.lineWidth = 2.4; g.lineCap = "round"; g.strokeStyle = "#0b1a3a"; let on = false, vide = true;
    const pt = e => { const t = e.touches ? e.touches[0] : e, b = r(); return [t.clientX - b.left, t.clientY - b.top]; };
    const dn = e => { e.preventDefault(); on = true; vide = false; const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); };
    const mv = e => { if (!on) return; e.preventDefault(); const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); };
    const up = () => (on = false);
    canvas.addEventListener("pointerdown", dn); canvas.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    canvas.style.touchAction = "none";
    return { vide: () => vide, effacer: () => { g.clearRect(0, 0, canvas.width, canvas.height); vide = true; }, image: () => (vide ? "" : canvas.toDataURL("image/png")) };
  }
  function contrat(cid, pre) {
    const ap = A(), c = cid ? ap.clientById(cid) : null; pre = pre || {};
    const forms = CATA[0][1].filter(f => f[2]);
    const st = { client: pre.client || (c ? c.name : ""), gerant: "", ident: c && c.ice ? "ICE " + c.ice : "", tel: pre.tel || (c ? c.phone || "" : ""), adresse: c ? [c.address, c.city].filter(Boolean).join(", ") : "", formule: pre.formule || "Menu + Fidélité", setup: pre.setup != null ? pre.setup : 1990, mois: pre.mois != null ? pre.mois : 249, debut: auj(), options: pre.lignes ? pre.lignes.filter(l => !l.m).map(l => (l.q > 1 ? l.q + " × " : "") + l.nom).join(", ") : "" };
    ap.openModal(`${ap.head("✍️ Contrat")}
      <div class="stack">
        <div class="grid2"><label class="f">Commerce<input id="ct-c" value="${esc(st.client)}"></label><label class="f">Gérant (nom)<input id="ct-g" value="${esc(st.gerant)}"></label></div>
        <div class="grid2"><label class="f">CIN ou ICE du client<input id="ct-i" value="${esc(st.ident)}"></label><label class="f">Téléphone<input id="ct-t" type="tel" value="${esc(st.tel)}"></label></div>
        <label class="f">Adresse<input id="ct-a" value="${esc(st.adresse)}"></label>
        <label class="f">Formule<select id="ct-f">${forms.map(f => `<option ${f[0] === st.formule ? "selected" : ""} data-s="${f[1]}" data-m="${f[2]}">${esc(f[0])}</option>`).join("")}${forms.some(f => f[0] === st.formule) ? "" : `<option selected>${esc(st.formule)}</option>`}</select></label>
        <div class="grid2"><label class="f">Mise en place (DH)<input id="ct-s" type="number" value="${esc(st.setup)}" class="num"></label><label class="f">Abonnement (DH / mois)<input id="ct-m" type="number" value="${esc(st.mois)}" class="num"></label></div>
        <div class="grid2"><label class="f">Date de début<input id="ct-d" type="date" value="${esc(st.debut)}"></label><label class="f">Produits en plus<input id="ct-o" value="${esc(st.options)}" placeholder="4 plaques de table…"></label></div>
        <div><div class="eyebrow">✍️ Signature du client</div><canvas id="sg1" class="sig"></canvas><button type="button" class="btn sm ghost" data-ef="1">Effacer</button></div>
        <div><div class="eyebrow">✍️ Signature NFCWORK</div><canvas id="sg2" class="sig"></canvas><button type="button" class="btn sm ghost" data-ef="2">Effacer</button></div>
        <div class="row" style="gap:8px"><button class="btn primary" id="ct-pdf">🖨 Contrat en PDF</button></div>
        <p class="muted" style="font-size:12.5px;margin:0">💡 Sur le téléphone : « Imprimer » → « Enregistrer en PDF », puis envoyez-le au client sur WhatsApp.</p>
      </div>`);
    const s1 = signature(document.getElementById("sg1")), s2 = signature(document.getElementById("sg2"));
    document.querySelectorAll("[data-ef]").forEach(b => b.onclick = () => (b.dataset.ef === "1" ? s1 : s2).effacer());
    document.getElementById("ct-f").onchange = e => { const o = e.target.selectedOptions[0]; if (o.dataset.s) { document.getElementById("ct-s").value = o.dataset.s; document.getElementById("ct-m").value = o.dataset.m; } };
    document.getElementById("ct-pdf").onclick = () => {
      const v = id => document.getElementById(id).value.trim();
      const k = { client: v("ct-c"), gerant: v("ct-g"), ident: v("ct-i"), tel: v("ct-t"), adresse: v("ct-a"), formule: v("ct-f"), setup: +v("ct-s") || 0, mois: +v("ct-m") || 0, debut: v("ct-d"), options: v("ct-o"), sig1: s1.image(), sig2: s2.image() };
      if (!k.client) { ap.toast("Écrivez le nom du commerce."); return; }
      imprimerContrat(k);
    };
  }
  function imprimerContrat(k) {
    const w = window.open("", "_blank"); if (!w) { A().toast("Autorisez les fenêtres pour imprimer."); return; }
    const box = (t, on) => `<div class="cb"><span>${on ? "☑" : "☐"}</span>${t}</div>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Contrat NFCWORK × ${esc(k.client)}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11pt;line-height:1.45}
      .h{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e6fff;padding-bottom:8px}.h img{height:32px}h1{font-size:17pt;margin:14px 0 2px}h2{font-size:12pt;margin:14px 0 4px;color:#0b4fc0}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.p{border:1px solid #ddd;border-radius:8px;padding:8px 10px}.cb{margin:3px 0}.cb span{margin-right:6px}
      table{width:100%;border-collapse:collapse}td{padding:6px;border-bottom:1px solid #eee}td.r{text-align:right;font-weight:700}.sg{height:90px;border:1px dashed #999;border-radius:8px;display:flex;align-items:center;justify-content:center}.sg img{max-height:86px;max-width:100%}
      .bar{text-align:center;margin-bottom:10px}.bar button{font-size:16px;padding:10px 18px;border-radius:10px;border:0;background:#1e90ff;color:#fff}@media print{.bar{display:none}}</style></head><body>
      <div class="bar"><button onclick="print()">🖨 Imprimer / Enregistrer en PDF</button></div>
      <div class="h"><img src="${location.origin}/assets/img/logo-nfcwork.png" alt="NFCWORK"><div style="text-align:right;font-size:9.5pt">${MOI.site} · WhatsApp ${MOI.tel}<br>${MOI.mail}</div></div>
      <h1>Contrat de prestation · NFCWORK × ${esc(k.client)}</h1><div style="color:#555">Fait le ${frDate(auj())}</div>
      <h2>1. Les parties</h2><div class="two"><div class="p"><b>NFCWORK</b><br>Représenté par ${MOI.nom}, ${MOI.qualite}<br>CIN : ${MOI.cin}<br>Tél. : ${MOI.tel}</div>
        <div class="p"><b>${esc(k.client)}</b>${k.gerant ? "<br>Représenté par " + esc(k.gerant) : ""}${k.ident ? "<br>" + esc(k.ident) : ""}${k.tel ? "<br>Tél. : " + esc(k.tel) : ""}${k.adresse ? "<br>" + esc(k.adresse) : ""}</div></div>
      <h2>2. Objet</h2><p>NFCWORK met en place pour le client la formule <b>${esc(k.formule)}</b>${k.options ? ", avec : " + esc(k.options) : ""}, et assure l’hébergement, les mises à jour et le support pendant toute la durée de l’abonnement.</p>
      <h2>3. Prix</h2><table><tr><td>Mise en place (payée une seule fois, à la signature)</td><td class="r">${prix(k.setup)} DH</td></tr><tr><td>Abonnement mensuel, à partir du ${frDate(k.debut)}</td><td class="r">${prix(k.mois)} DH / mois</td></tr></table>
      <h2>4. Conditions</h2>
      ${box("1er mois d’abonnement offert (offre de lancement).", true)}${box("Paiement à l’année possible : 12 mois au prix de 10.", true)}${box("Sans engagement : arrêt possible à la fin de chaque mois, en prévenant NFCWORK.", true)}
      ${box("Rappel WhatsApp 3 jours avant l’échéance ; 5 jours de grâce ; ensuite le service se met en pause automatiquement et revient dès le paiement, sans perte de données.", true)}
      ${box("Les cartes, plaques et QR codes imprimés restent la propriété du client et gardent le même lien.", true)}${box("Paiement : espèces, virement, CashPlus ou Wafacash.", true)}
      <h2>5. Signatures</h2><div class="two"><div><b>Pour NFCWORK</b><div class="sg">${k.sig2 ? `<img src="${k.sig2}">` : ""}</div><small>${MOI.nom}</small></div><div><b>Pour ${esc(k.client)}</b><div class="sg">${k.sig1 ? `<img src="${k.sig1}">` : ""}</div><small>${esc(k.gerant || "Nom, signature et cachet")}</small></div></div>
      </body></html>`);
    w.document.close();
  }

  /* ---------- 🗂 prospects ---------- */
  const STATUTS = { nouveau: ["🆕 Nouveau"], visite: ["👀 Visité"], demo: ["🎯 Démo faite"], rappeler: ["📞 À rappeler"], signe: ["✅ Signé"], perdu: ["❌ Perdu"] };
  let pf = "actifs";
  async function prospects() {
    const ap = A(), d = await donnees(true);
    if (!d.prospects) {
      ap.openModal(`${ap.head("🗂 Prospects")}<div class="notice">Pour garder vos prospects, ajoutez une petite règle dans Firebase (une seule fois) :<br><br>Firebase → Firestore Database → <b>Règles</b> → collez cette ligne juste avant « // Tout le reste est fermé », puis <b>Publier</b> :</div>
        <pre style="white-space:pre-wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;font-size:13px">${esc(RULE)}</pre><button class="btn primary" id="cpr">📋 Copier la règle</button>`);
      document.getElementById("cpr").onclick = async () => { try { await navigator.clipboard.writeText(RULE); ap.toast("Règle copiée ✓"); } catch (e) { prompt("Copiez :", RULE); } };
      return;
    }
    const l = d.prospects.filter(p => pf === "tous" || (pf === "actifs" ? !["signe", "perdu"].includes(p.statut) : p.statut === pf)).sort((a, b) => String(a.rappel || "9").localeCompare(String(b.rappel || "9")));
    ap.openModal(`${ap.head("🗂 Prospects", `<button class="btn sm primary" id="pnew">＋ Prospect</button>`)}
      <div class="filters">${[["actifs", "En cours"], ...Object.entries(STATUTS).map(([k, v]) => [k, v[0]]), ["tous", "Tous"]].map(([k, n]) => `<button class="chip" data-pf="${k}" aria-pressed="${pf === k}">${n}</button>`).join("")}</div>
      ${l.length ? `<div class="list">${l.map(p => { const w = waNum(p.tel), late = p.rappel && p.rappel <= auj() && !["signe", "perdu"].includes(p.statut);
        return `<div class="item" style="cursor:default"><div class="avatar">${(STATUTS[p.statut] || ["🆕"])[0].split(" ")[0]}</div><button class="main" data-gpro="${esc(p.id)}" style="text-align:start;background:none;border:0;color:inherit;font:inherit;cursor:pointer"><div class="t">${esc(p.nom)}</div><div class="s">${esc([p.metier, p.ville].filter(Boolean).join(" · "))}${p.rappel ? ` · ${late ? "<b style='color:var(--bad)'>📞 rappeler " + frDate(p.rappel) + "</b>" : "📅 " + frDate(p.rappel)}` : ""}</div></button>
          ${w ? `<a class="btn sm" href="https://wa.me/${w}" target="_blank" rel="noopener">💬</a><a class="btn sm" href="tel:+${w}">📞</a>` : ""}</div>`; }).join("")}</div>` : `<div class="empty"><p>Aucun prospect ici. Ajoutez les commerces que vous visitez.</p></div>`}`);
    document.getElementById("pnew").onclick = () => prospect(null);
    document.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { pf = b.dataset.pf; prospects(); });
  }
  function prospect(p) {
    const ap = A(); p = p || { nom: "", metier: "", tel: "", ville: "Kénitra", statut: "nouveau", rappel: "", note: "" };
    ap.openModal(`${ap.head(p.id ? "🗂 " + esc(p.nom) : "＋ Nouveau prospect")}
      <form id="pf" class="stack"><label class="f">Commerce<input id="p-n" required value="${esc(p.nom)}"></label>
        <div class="grid2"><label class="f">Activité<input id="p-m" value="${esc(p.metier)}" placeholder="Café, restaurant, salon…"></label><label class="f">Ville<input id="p-v" value="${esc(p.ville)}"></label></div>
        <div class="grid2"><label class="f">Téléphone<input id="p-t" type="tel" value="${esc(p.tel)}"></label><label class="f">📅 Rappeler le<input id="p-r" type="date" value="${esc(p.rappel)}"></label></div>
        <div class="filters">${Object.entries(STATUTS).map(([k, v]) => `<button type="button" class="chip" data-ps="${k}" aria-pressed="${p.statut === k}">${v[0]}</button>`).join("")}</div>
        <label class="f">Note<textarea id="p-o" rows="3">${esc(p.note)}</textarea></label>
        <div class="row between">${p.id ? `<button type="button" class="btn danger" id="p-del">Supprimer</button>` : "<span></span>"}<div class="row" style="gap:6px">${p.id ? `<button type="button" class="btn" id="p-demo">🎯 Démo</button><button type="button" class="btn" id="p-cli">👤 En client</button>` : ""}<button class="btn primary">Enregistrer</button></div></div></form>`);
    let statut = p.statut;
    document.querySelectorAll("[data-ps]").forEach(b => b.onclick = () => { statut = b.dataset.ps; document.querySelectorAll("[data-ps]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    const fs = ap.fs;
    document.getElementById("pf").onsubmit = async e => {
      e.preventDefault();
      const data = { nom: document.getElementById("p-n").value.trim(), metier: document.getElementById("p-m").value.trim(), ville: document.getElementById("p-v").value.trim(), tel: document.getElementById("p-t").value.trim(), rappel: document.getElementById("p-r").value, statut, note: document.getElementById("p-o").value.trim(), maj: new Date().toISOString() };
      try { await (p.id ? fs.doc("prospects/" + p.id) : fs.collection("prospects").doc()).set(data); ap.toast("✅ Enregistré"); D = null; prospects(); } catch (x) { ap.toast("Refusé : ajoutez la règle « prospects » dans Firebase.", true); }
    };
    if (p.id) {
      document.getElementById("p-del").onclick = async () => { if (!confirm("Supprimer ce prospect ?")) return; try { await fs.doc("prospects/" + p.id).delete(); D = null; prospects(); } catch (x) { ap.toast("Échec."); } };
      document.getElementById("p-demo").onclick = () => { location.href = "menus.html#nouveau=" + b64({ nom: p.nom, formule: "premium", demo: true, tel: p.tel }); };
      document.getElementById("p-cli").onclick = () => ap.nouveauClient({ name: p.nom, phone: p.tel, city: p.ville });
    }
  }

  /* ---------- 📊 visites (menus + pages) ---------- */
  const RULE_STATS = `match /stats/{id} {
      allow read: if request.auth != null;
      allow create: if id.size() < 90 && request.resource.data.keys().hasOnly(['n']) && request.resource.data.n == 1;
      allow update: if request.resource.data.keys().hasOnly(['n']) && request.resource.data.n == resource.data.n + 1;
    }`;
  const moisCle = dec => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - dec); return String(d.getFullYear() * 100 + d.getMonth() + 1); };
  function regleBox(ap, titre, texte, regle) {
    ap.openModal(`${ap.head(titre)}<div class="notice">${texte}<br><br>Firebase → Firestore Database → <b>Règles</b> → collez ce bloc juste avant « // Tout le reste est fermé », puis <b>Publier</b> :</div>
      <pre style="white-space:pre-wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;font-size:12.5px;direction:ltr;text-align:left">${esc(regle)}</pre><button class="btn primary" id="cpr">📋 Copier la règle</button>`);
    document.getElementById("cpr").onclick = async () => { try { await navigator.clipboard.writeText(regle); ap.toast("Règle copiée ✓"); } catch (e) { prompt("Copiez :", regle); } };
  }
  async function stats() {
    const ap = A(), d = await donnees();
    let docs;
    try { docs = (await ap.fs.collection("stats").get()).docs.map(x => ({ id: x.id, n: +x.data().n || 0 })); }
    catch (e) { regleBox(ap, "📊 Visites", "Pour compter les visites de vos menus et cartes, ajoutez cette règle dans Firebase (une seule fois). Le comptage commence juste après.", RULE_STATS); return; }
    const m0 = moisCle(0), m1 = moisCle(1), T = {};
    docs.forEach(x => { const r = x.id.match(/^(menu|page)-(.+)-(\d{6})$/); if (!r) return; const k = r[1] + "-" + r[2]; const t = T[k] = T[k] || { type: r[1], slug: r[2], m0: 0, m1: 0, tot: 0 }; t.tot += x.n; if (r[3] === m0) t.m0 += x.n; if (r[3] === m1) t.m1 += x.n; });
    d.menus.forEach(m => { const k = "menu-" + m.slug; T[k] = T[k] || { type: "menu", slug: m.slug, m0: 0, m1: 0, tot: 0 }; T[k].nom = m.nom; });
    d.pages.forEach(p => { const k = "page-" + p.slug; T[k] = T[k] || { type: "page", slug: p.slug, m0: 0, m1: 0, tot: 0 }; T[k].nom = p.nom; T[k].pt = p.type; });
    const L = Object.values(T).sort((a, b) => b.m0 - a.m0 || b.tot - a.tot), tot0 = L.reduce((s, t) => s + t.m0, 0), tot1 = L.reduce((s, t) => s + t.m1, 0);
    const mx = Math.max(1, ...L.map(t => t.m0)), nomMois = new Date().toLocaleDateString("fr-FR", { month: "long" });
    const txt = t => `Bonjour 👋\n\n📊 Votre ${t.type === "menu" ? "menu" : "carte"} NFCWORK « ${t.nom || t.slug} » a été ouvert(e) par ${t.m0} personne(s) ce mois-ci${t.m1 ? " (" + t.m1 + " le mois dernier)" : ""}.\n\nnfcwork.ma/${t.type === "menu" ? "menu" : "p"}/${t.slug}\n\nNFCWORK · nfcwork.ma`;
    ap.openModal(`${ap.head("📊 Visites")}
      <div class="grid2" style="margin-bottom:12px"><div class="grow" style="flex-direction:column;align-items:flex-start"><span class="muted" style="font-size:12.5px">Ce mois (${esc(nomMois)})</span><b style="font-size:26px">${tot0}</b></div><div class="grow" style="flex-direction:column;align-items:flex-start"><span class="muted" style="font-size:12.5px">Mois dernier</span><b style="font-size:26px">${tot1}</b></div></div>
      <p class="muted" style="font-size:12.5px;margin:0 0 10px">1 visite = 1 téléphone par jour. Vos propres visites (connecté à l’Espace) ne comptent pas.</p>
      ${L.length ? `<div class="stack" style="gap:8px">${L.map(t => `<div class="grow"><span style="font-size:20px">${t.type === "menu" ? "🍽" : ({ profil: "👤", avis: "⭐", wifi: "📶", liens: "🔗" }[t.pt] || "📄")}</span><div style="flex:1;min-width:0"><b>${esc(t.nom || t.slug)}</b><div style="height:6px;border-radius:6px;background:var(--line);margin:5px 0"><i style="display:block;height:100%;border-radius:6px;background:var(--accent);width:${Math.round(t.m0 / mx * 100)}%"></i></div><div class="muted" style="font-size:12.5px">${t.m0} ce mois · ${t.m1} le mois dernier · ${t.tot} au total</div></div><a class="btn sm" href="https://wa.me/?text=${encodeURIComponent(txt(t))}" target="_blank" rel="noopener" title="Envoyer au client">💬</a></div>`).join("")}</div>` : `<div class="empty"><p>Pas encore de visites.</p></div>`}
      ${!docs.length ? `<details style="margin-top:14px"><summary class="muted">Toujours 0 ? Vérifiez la règle Firebase</summary><pre style="white-space:pre-wrap;font-size:12px;direction:ltr;text-align:left">${esc(RULE_STATS)}</pre></details>` : ""}`);
  }

  /* ---------- 📲 installer l'Espace comme une application ---------- */
  function installer() {
    const ap = A(), ev = window.NFCW_INSTALL;
    if (ev) { ev.prompt(); ev.userChoice.then(r => { if (r.outcome === "accepted") { ap.toast("✅ Installée !"); window.NFCW_INSTALL = null; } }).catch(() => {}); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    ap.openModal(`${ap.head("📲 L’Espace comme une application")}<div dir="rtl" lang="ar" style="font-size:16px;line-height:1.9">
      ${ios ? `<p>📱 <b>آيفون</b> (Safari):</p><ol><li>ورك على زر <b>المشاركة</b> ⬆️ لتحت</li><li>اختار <b>«Sur l’écran d’accueil»</b> ➕</li><li>ورك <b>Ajouter</b> ✅</li></ol>`
        : `<p>📱 <b>أندرويد</b> (Chrome):</p><ol><li>ورك على <b>⋮</b> الفوق على اليمين</li><li>اختار <b>«Installer l’application»</b> ولا <b>«Ajouter à l’écran d’accueil»</b> ➕</li><li>ورك <b>Installer</b> ✅</li></ol>
        <p>💻 <b>PC</b> (Chrome / Edge): ورك على الأيقونة ⊕ فـ آخر خانة العنوان الفوق.</p>`}
      <p>🎉 من بعد غادي تلقى <b>NFCWORK</b> فـ التليفون بحال شي تطبيق، كيتحل نيشان على الـEspace.</p></div>`);
  }

  /* ---------- 📖 guide : téléphone seul / PC seul ---------- */
  let gTab = "tel";
  function guide() {
    const ap = A();
    const T = {
      tel: [
        ["🆕", "زبون جديد", "الصفحة الأولى ← <b>＋ Créer</b> ← <b>Client</b>. كتب الاسم والتيليفون وصافي."],
        ["🎯", "ديمو قدام الزبون", "<b>🎯 Démo 2 min</b> ← كتب اسم المحل ← كيتصاوب منيو تجريبي 7 أيام. وريه للزبون فـ التيليفون."],
        ["🍽", "منيو", "<b>Menus</b> ← ＋ ← زيد الأطباق والتصاور (صوّر بالكاميرا نيشان). ولا <b>Importer</b> من صورة المنيو."],
        ["📲", "نكتب الستيكر NFC", "من المنيو ولا الكارط ← زر <b>📲 NFC</b> ← قرّب الستيكر من ظهر التيليفون. (أندرويد Chrome كيكتب بوحدو، آيفون كيعطيك NFC Tools)."],
        ["⭐", "كارط، أفيس غوغل، Wi-Fi", "<b>＋ Créer</b> ← اختار النوع ← عمّر ← <b>Enregistrer</b> ← <b>📲 NFC</b>."],
        ["🎁", "الفيدليتي", "<b>Fidélité</b> ← ＋ برنامج. المحل كيسكاني الكارطات بالتيليفون ديالو."],
        ["📝", "ديفي وكونطرا", "<b>📝 Devis</b> ← اختار المنتوجات ← صيفطو فـ واتساب. <b>✍️ Contrat</b> ← الزبون كيسيني بصبعو فـ الشاشة."],
        ["🧾", "فاكتورة", "<b>🧾 Facture</b> ← اختار الزبون ← <b>PDF</b> ولا واتساب."],
        ["💰", "الفلوس ديال الشهر", "فـ الصفحة الأولى كيبانو <b>💰 À encaisser</b> ← <b>💬 Rappel</b> فـ واتساب ← ملي يخلّص <b>✅ Payé</b>."],
        ["📊", "شحال من واحد شاف المنيو", "<b>📊 Visites</b> ← صيفط الرقم للزبون فـ واتساب 💬 (كيفرح بيه 😄)."]
      ],
      pc: [
        ["📺", "منيو TV", "<b>Menus TV</b> ← ＋ ← حط <b>PDF</b> ديال المنيو ← خذ الرابط <b>nfcwork.ma/tv/…</b> وحلّو فـ التلفزة."],
        ["🖨", "طباعة الستاندات", "<b>Menus</b> ← المنيو ← <b>Stands</b> ← <b>Imprimer</b> (6 فـ كل ورقة A4، كل واحد برقم الطابلة)."],
        ["📄", "ديفي / كونطرا / فاكتورة PDF", "نفس الشي بحال التيليفون، ولكن <b>Imprimer</b> كيخرج ورقة نقية للطابعة."],
        ["📥", "منيو كبير", "<b>Menus</b> ← <b>Importer</b> ← لصق المنيو كامل (من Glovo ولا ملف) ← كيتقسم بوحدو."],
        ["🗂", "البروسبي", "<b>🗂 Prospects</b> ← زيد المحلات اللي دزتي عليهم + نهار الرجوع 📅."],
        ["🔁", "الأبونمان", "<b>Abonnements</b> ← شوف شكون خلّص وشكون لا، وقطع/رجّع الخدمة بنقرة."],
        ["🔎", "قلّب على أي حاجة", "خانة <b>🔎 Chercher</b> فـ الصفحة الأولى: زبون، منيو، كارط، فاكتورة…"]
      ]
    };
    const plus = gTab === "tel" ? "✅ <b>كلشي كيتدار بالتيليفون بوحدو</b> — حتى PC ما خاصك." : "💡 <b>الـPC مزيان للحوايج الكبار</b> (TV، طباعة، منيو طويل). وكلشي خدام حتى بلا Mac.";
    ap.openModal(`${ap.head("📖 Guide")}
      <div class="filters" style="margin-bottom:12px"><button class="chip" data-gt="tel" aria-pressed="${gTab === "tel"}">📱 بالتيليفون بوحدو</button><button class="chip" data-gt="pc" aria-pressed="${gTab === "pc"}">💻 بالـPC بوحدو</button></div>
      <div dir="rtl" lang="ar"><div class="notice" style="margin-bottom:12px">${plus}</div>
      <div class="stack" style="gap:8px">${T[gTab].map(([i, t, x], n) => `<div class="grow" style="align-items:flex-start"><span style="font-size:24px">${i}</span><div style="flex:1"><b>${n + 1}. ${t}</b><div style="font-size:15px;line-height:1.8;margin-top:2px">${x}</div></div></div>`).join("")}</div>
      <p class="muted" style="margin-top:14px;font-size:14px">📲 نصيحة: ثبّت الـEspace فـ التيليفون بحال تطبيق ← زر <b>📲 Application</b>.</p></div>`);
    document.querySelectorAll("[data-gt]").forEach(b => b.onclick = () => { gTab = b.dataset.gt; guide(); });
  }

  /* ---------- clics ---------- */
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-g]");
    if (g) { e.preventDefault(); const k = g.dataset.g, c = g.dataset.c || ""; if (k === "demo") demo(); if (k === "devis") devis(c); if (k === "contrat") contrat(c); if (k === "prospects") prospects(); if (k === "stats") stats(); if (k === "guide") guide(); if (k === "app") installer(); return; }
    const cl = e.target.closest("[data-gcli]"); if (cl) { const c = A().clientById(cl.dataset.gcli); if (c) A().clientView(c); return; }
    const pr = e.target.closest("[data-gpro]"); if (pr) { const p = (D && D.prospects || []).find(x => x.id === pr.dataset.gpro); if (p) prospect(p); return; }
  }, true);

  const st = document.createElement("style");
  st.textContent = `.gacts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.ga[hidden]{display:none}.ga{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 4px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;cursor:pointer;text-decoration:none}
    .ga span{font-size:24px;line-height:1}.ga b{font-size:12.5px}.ga i{position:absolute;top:6px;right:8px;font-style:normal;background:var(--bad,#e5484d);color:#fff;border-radius:10px;font-size:11px;padding:0 6px}.ga i:empty{display:none}
    .grow{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:var(--surface)}
    .dl{display:grid;grid-template-columns:minmax(0,2.4fr) 52px 78px 70px 32px;gap:5px;align-items:center}.dl input{min-width:0;padding:9px 8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit;font-size:14px}
    .dlh span{font-size:11.5px;color:var(--muted)}.sig{width:100%;height:150px;border:1px dashed var(--line);border-radius:12px;background:#fff;display:block;margin:6px 0}`;
  document.head.appendChild(st);
  window.NFCW_GESTION = { home, client };
})();
