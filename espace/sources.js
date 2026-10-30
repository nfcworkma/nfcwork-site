/* NFCWORK — « Remplir depuis un client existant »
   Quand on crée un menu, une carte fidélité, un avis Google, une carte digitale, un Wi-Fi ou une page liens,
   on choisit le client : son nom, son logo, sa couleur, ses téléphones, Instagram, adresse, horaires
   et les liens de ses autres services sont déjà remplis. Il ne reste que ce qui manque.
   NFCW_SOURCES.choisir(db, titre) → Promise<données | {vide:true} | null> */
(function () {
  "use strict";
  const SITE = "https://nfcwork.ma";
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const proche = (a, b) => { const x = norm(a).replace(/ /g, ""), y = norm(b).replace(/ /g, ""); return x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x)); };
  const tr = v => v && typeof v === "object" ? (v.fr || v.ar || v.en || Object.values(v)[0] || "") : (v || "");
  const ICP = { profil: "👤", avis: "⭐", wifi: "📶", liens: "🔗" };
  const json = async (db, id) => { try { const d = await db.doc("settings/" + id).get(); return d.exists ? JSON.parse(d.data().json || "null") : null; } catch (e) { return null; } };

  async function lister(db) {
    const L = [];
    const [menus, pages] = await Promise.all([json(db, "menus"), json(db, "pages")]);
    (menus || []).forEach(m => L.push({ k: "menu", id: m.slug, nom: m.nom || m.slug, ic: "🍽", sous: "Menu · /menu/" + m.slug }));
    (pages || []).forEach(p => L.push({ k: "page", id: p.slug, nom: p.nom || p.slug, ic: ICP[p.type] || "📄", sous: "Page · /p/" + p.slug, type: p.type }));
    try { (await db.collection("fidProgrammes").get()).docs.forEach(d => { const p = d.data(); L.push({ k: "fid", id: d.id, court: p.court || "", nom: p.nom || "", ic: "🎁", sous: "Carte fidélité" }); }); } catch (e) {}
    try { (await db.collection("clients").get()).docs.forEach(d => { const c = d.data(); if (c.name) L.push({ k: "client", id: d.id, nom: c.name, ic: "🧾", sous: "Fiche client" + (c.phone ? " · " + c.phone : "") }); }); } catch (e) {}
    return L;
  }

  // une image (id de photo NFCWORK, chemin du site, lien) → data:image/…
  async function versData(db, id) {
    if (!id) return "";
    if (/^data:image\//.test(id)) return id;
    try {
      let url = id;
      if (id.startsWith("u:")) url = "https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=600&q=80";
      else if (!id.startsWith("/") && !/^https?:/.test(id)) { const d = await db.doc("settings/mimg-" + id).get(); return d.exists ? d.data().data || "" : ""; }
      const b = await (await fetch(url)).blob();
      return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(""); r.readAsDataURL(b); });
    } catch (e) { return ""; }
  }
  // « 8h – 23h, 7j/7 » → { 1:"08:00-23:00", … } (tous les jours) ; et l'inverse
  function horairesJours(s) {
    const m = String(s || "").match(/(\d{1,2})(?:[h:](\d{2}))?\s*h?\s*(?:-|–|—|à)\s*(\d{1,2})(?:[h:](\d{2}))?/i);
    if (!m) return {};
    const t = `${m[1].padStart(2, "0")}:${m[2] || "00"}-${m[3].padStart(2, "0")}:${m[4] || "00"}`, o = {};
    for (let j = 0; j < 7; j++) o[j] = t;
    return o;
  }
  function horairesTexte(o) {
    const v = Object.values(o || {}).filter(Boolean);
    if (!v.length) return "";
    return v.length === 7 && v.every(x => x === v[0]) ? v[0].replace(/:00/g, "h").replace(/-/, " – ") + ", 7j/7" : "";
  }

  // données communes, à partir de la source choisie + de tout ce qui porte le même nom
  async function donnees(db, src, tout) {
    const D = { source: src, nom: src.nom, logo: "", couleur: "", tel: "", whatsapp: "", email: "", ownerEmail: "", instagram: "", facebook: "", tiktok: "", adresse: "", maps: "", horaires: "", horairesJ: {}, slogan: "", liens: [], lienGoogle: "" };
    const remplir = (k, v) => { if (v && !D[k]) D[k] = v; };
    const lire = async s => {
      if (s.k === "menu") {
        const m = await json(db, "menu-" + s.id); if (!m) return;
        const i = m.infos || {};
        remplir("tel", i.tel); remplir("whatsapp", i.whatsapp); remplir("instagram", i.instagram); remplir("adresse", i.adresse); remplir("maps", i.maps);
        remplir("horaires", i.horaires); remplir("slogan", tr(m.slogan)); if (/^#[0-9a-f]{6}$/i.test(m.couleur || "")) remplir("couleur", m.couleur);
        if (!D.logo && m.logo) D.logo = await versData(db, m.logo);
      } else if (s.k === "page") {
        const p = await json(db, "page-" + s.id); if (!p) return;
        ["tel", "whatsapp", "email", "instagram", "facebook", "tiktok", "adresse", "maps", "lienGoogle"].forEach(k => remplir(k, p[k]));
        remplir("slogan", p.slogan || p.bio || p.fonction); if (/^#[0-9a-f]{6}$/i.test(p.couleur || "")) remplir("couleur", p.couleur);
        if (p.horaires && Object.keys(p.horaires).length && !Object.keys(D.horairesJ).length) D.horairesJ = p.horaires;
        if (!D.logo && p.photo) D.logo = await versData(db, p.photo);
      } else if (s.k === "fid") {
        try { const d = await db.doc("fidProgrammes/" + s.id).get(); if (!d.exists) return; const p = d.data();
          remplir("ownerEmail", p.ownerEmail); if (/^#[0-9a-f]{6}$/i.test(p.couleur || "")) remplir("couleur", p.couleur);
          if (!D.logo && p.logoData) D.logo = p.logoData; } catch (e) {}
      } else if (s.k === "client") {
        try { const d = await db.doc("clients/" + s.id).get(); if (!d.exists) return; const c = d.data();
          remplir("tel", c.phone); remplir("email", c.email); remplir("ownerEmail", c.email); remplir("adresse", c.address || c.adresse); } catch (e) {}
      }
    };
    await lire(src);
    const freres = (tout || []).filter(s => s !== src && (s.k !== src.k || s.id !== src.id) && proche(s.nom, src.nom));
    for (const s of freres) await lire(s);
    if (!D.whatsapp) D.whatsapp = D.tel;
    if (!D.horaires) D.horaires = horairesTexte(D.horairesJ);
    if (!Object.keys(D.horairesJ).length) D.horairesJ = horairesJours(D.horaires);
    // liens vers ses autres services
    for (const s of [src, ...freres]) {
      if (s.k === "menu") D.liens.push({ titre: "🍔 Notre menu", url: SITE + "/menu/" + s.id, k: "menu" });
      if (s.k === "fid") D.liens.push({ titre: "🎁 Ma carte fidélité", url: SITE + "/f/" + (s.court || s.id), k: "fid" });
      if (s.k === "page" && s.type === "avis") D.liens.push({ titre: "⭐ Laisser un avis Google", url: SITE + "/p/" + s.id, k: "avis", slug: s.id });
      if (s.k === "page" && s.type === "wifi") D.liens.push({ titre: "📶 Notre Wi-Fi", url: SITE + "/p/" + s.id, k: "wifi", slug: s.id });
      if (s.k === "page" && s.type === "profil") D.liens.push({ titre: "👤 Carte de visite", url: SITE + "/p/" + s.id, k: "profil", slug: s.id });
    }
    D.trouve = [src, ...freres].map(s => s.ic + " " + s.nom).filter((v, i, a) => a.indexOf(v) === i);
    return D;
  }

  // fenêtre de choix
  async function choisir(db, titre) {
    const st = document.createElement("style");
    st.textContent = `.srcl{display:grid;gap:6px;max-height:52vh;overflow:auto;margin-top:10px}.srcl button{display:flex;gap:10px;align-items:center;text-align:start;width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;cursor:pointer}
      .srcl button span{font-size:22px}.srcl small{display:block;color:var(--muted);font-size:12.5px}.srcl button:hover{border-color:var(--accent)}`;
    document.head.appendChild(st);
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true"><h2 style="margin:0">${esc(titre)}</h2>
      <p class="muted" style="margin:4px 0 0;font-size:14px">Choisissez le client : son nom, son logo, ses numéros, Instagram, adresse, horaires et ses autres liens seront déjà remplis ✨</p>
      <input id="srcq" type="search" placeholder="🔎 Chercher un client…" style="width:100%;margin-top:10px;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:16px">
      <div class="srcl" id="srcl"><p class="muted">Chargement…</p></div>
      <div class="row" style="justify-content:space-between;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" id="srcv">➕ Nouveau client (tout vide)</button><button class="btn ghost" id="srcx">Annuler</button></div></div>`;
    document.body.appendChild(d);
    const L = await lister(db);
    // un client = un nom : on regroupe ce qui porte le même nom
    const groupes = [];
    for (const s of L) { const g = groupes.find(g => proche(g[0].nom, s.nom)); if (g) g.push(s); else groupes.push([s]); }
    const ordre = { menu: 0, fid: 1, page: 2, client: 3 };
    groupes.forEach(g => g.sort((a, b) => ordre[a.k] - ordre[b.k]));
    const dessiner = q => {
      const n = norm(q), G = groupes.filter(g => !n || g.some(s => norm(s.nom).includes(n)));
      d.querySelector("#srcl").innerHTML = G.length ? G.map((g, i) => `<button data-g="${groupes.indexOf(g)}"><span>${g[0].ic}</span><span style="font-size:inherit;flex:1;min-width:0"><b>${esc(g[0].nom)}</b><small>${g.map(s => s.ic).join(" ")} ${esc(g.map(s => s.sous.split(" · ")[0]).filter((v, i, a) => a.indexOf(v) === i).join(" · "))}</small></span></button>`).join("") : `<p class="muted">Aucun client trouvé.</p>`;
    };
    dessiner("");
    d.querySelector("#srcq").oninput = e => dessiner(e.target.value);
    return new Promise(ok => {
      const fin = v => { d.remove(); st.remove(); ok(v); };
      d.querySelector("#srcx").onclick = () => fin(null);
      d.querySelector("#srcv").onclick = () => fin({ vide: true });
      d.addEventListener("click", async e => {
        if (e.target === d) return fin(null);
        const b = e.target.closest("[data-g]"); if (!b) return;
        b.disabled = true; b.querySelector("small").textContent = "Récupération des infos…";
        fin(await donnees(db, groupes[+b.dataset.g][0], L));
      });
    });
  }

  window.NFCW_SOURCES = { choisir, lister, donnees, horairesJours, horairesTexte };
})();
