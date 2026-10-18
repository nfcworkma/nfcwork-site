/* NFCWORK — « Mon commerce » : espace client limité
   - Admin (fiche client) : choisir les menus / pages du client + ce qu'il a le droit de faire  → clients/<id>.acces
   - Client (accueil) : ses liens, ses visites, et cocher lui-même les plats épuisés → dispo/<slug> { email, off:[ids] }
   Règle Firebase : regle-dispo.txt */
(function () {
  "use strict";
  const A = () => window.NFCW_APP;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const mois = dec => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - dec); return String(d.getFullYear() * 100 + d.getMonth() + 1); };
  const RULE = `match /dispo/{slug} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (verified() && resource.data.email == myEmail()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['off', 'maj']));
    }
    // ✏️ le commerçant modifie son propre menu (prix, photos, voitures) si NFCWORK l'autorise
    function proprio(slug) { return verified() && exists(/databases/$(database)/documents/dispo/$(slug))
      && get(/databases/$(database)/documents/dispo/$(slug)).data.email == myEmail()
      && get(/databases/$(database)/documents/dispo/$(slug)).data.get('edit', false) == true; }
    match /settings/{doc} {
      allow update: if doc.matches('menu-[a-z0-9-]+') && proprio(doc.replace('^menu-', ''));
      allow create, update: if doc.matches('hist-[a-z0-9-]+') && proprio(doc.replace('^hist-', ''));
      allow create: if doc.matches('mimg-[a-z0-9]+') && proprio(request.resource.data.menu);
      allow delete: if doc.matches('mimg-[a-z0-9]+') && proprio(resource.data.menu);
    }`;
  const ICP = { profil: "👤", avis: "⭐", wifi: "📶", liens: "🔗" };
  async function liste(id) { try { const d = await A().fs.doc("settings/" + id).get(); return d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { return []; } }

  /* ================= ADMIN : réglage de l'accès ================= */
  async function admin(c, box) {
    const ap = A(), [menus, pages] = await Promise.all([liste("menus"), liste("pages")]);
    const ac = c.acces || null, nc = norm(c.name);
    const proche = s => { const x = norm(s); return x && nc && (x.includes(nc) || nc.includes(x)); };
    const selM = new Set(ac ? ac.menus || [] : menus.filter(m => proche(m.nom)).map(m => m.slug));
    const selP = new Set(ac ? ac.pages || [] : pages.filter(p => proche(p.nom)).map(p => p.slug));
    const dr = ac ? ac : { epuise: true, visites: true };
    const el = document.createElement("div");
    el.innerHTML = `<div class="section-head" style="margin-top:14px"><h3>🔒 Son espace client</h3>${ac ? `<span class="pill paid">activé</span>` : `<span class="pill draft">pas encore</span>`}</div>
      <div class="mcbox">
        ${c.email ? `<p class="muted" style="margin:0;font-size:13.5px">Il se connecte sur <b>nfcwork.ma/espace</b> avec <b>${esc(c.email)}</b> et voit seulement ce que vous cochez.</p>` : `<div class="notice">⚠️ Ajoutez d’abord l’<b>e-mail</b> du client dans sa fiche : c’est avec lui qu’il se connecte.</div>`}
        <b style="font-size:14px">🍽 Ses menus</b>
        <div class="mcchk">${menus.length ? menus.map(m => `<label><input type="checkbox" data-mcm="${esc(m.slug)}"${selM.has(m.slug) ? " checked" : ""}> ${esc(m.nom)} <small>/${esc(m.slug)}</small></label>`).join("") : `<span class="muted">Aucun menu.</span>`}</div>
        <b style="font-size:14px">📄 Ses cartes et pages</b>
        <div class="mcchk">${pages.length ? pages.map(p => `<label><input type="checkbox" data-mcp="${esc(p.slug)}"${selP.has(p.slug) ? " checked" : ""}> ${ICP[p.type] || "📄"} ${esc(p.nom)} <small>/${esc(p.slug)}</small></label>`).join("") : `<span class="muted">Aucune page.</span>`}</div>
        <b style="font-size:14px">✅ Ce qu’il peut faire</b>
        <div class="mcchk"><label><input type="checkbox" id="mc-ep"${dr.epuise ? " checked" : ""}> <span>🚫 Cocher lui-même les plats <b>épuisés</b></span></label>
          <label><input type="checkbox" id="mc-vi"${dr.visites ? " checked" : ""}> <span>📊 Voir ses <b>visites</b></span></label>
          <label><input type="checkbox" id="mc-ed"${dr.edit ? " checked" : ""}> <span>✏️ Modifier lui-même ses <b>prix, photos et produits</b></span></label>
          <label class="muted" style="font-size:13px">🧾 Factures, 🛒 commandes et ✏️ demandes de modification : toujours visibles.</label></div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" id="mc-save"${c.email ? "" : " disabled"}>💾 Enregistrer l’accès</button>${ac ? `<button class="btn ghost" id="mc-off">⛔ Couper l’accès</button>` : ""}</div>
      </div>`;
    box.appendChild(el);
    const sauver = async acces => {
      try { await ap.fs.doc("clients/" + c.id).update({ acces }); }
      catch (e) { ap.toast("Échec de l’enregistrement.", true); return false; }
      return true;
    };
    el.querySelector("#mc-save").onclick = async () => {
      const acces = { menus: [...el.querySelectorAll("[data-mcm]:checked")].map(x => x.dataset.mcm), pages: [...el.querySelectorAll("[data-mcp]:checked")].map(x => x.dataset.mcp), epuise: el.querySelector("#mc-ep").checked, visites: el.querySelector("#mc-vi").checked, edit: el.querySelector("#mc-ed").checked, maj: new Date().toISOString() };
      if (!(await sauver(acces))) return;
      c.acces = acces;
      if (acces.epuise || acces.edit) {
        let refus = false;
        for (const s of acces.menus) {
          try { const r = ap.fs.doc("dispo/" + s), d = await r.get(); await r.set({ email: String(c.email).toLowerCase(), off: d.exists ? (d.data().off || []) : [], edit: !!acces.edit, maj: new Date().toISOString() }); }
          catch (e) { refus = true; }
        }
        if (refus) { regle(); return; }
      }
      ap.toast("✅ Accès enregistré");
    };
    const off = el.querySelector("#mc-off");
    if (off) off.onclick = async () => { if (!confirm("Couper son accès à « Mon commerce » ?")) return; if (await sauver(null)) { c.acces = null; ap.toast("Accès coupé"); el.remove(); admin(c, box); } };
  }
  function regle() {
    const ap = A();
    ap.openModal(`${ap.head("🍽 Plats épuisés")}<div class="notice">L’accès est enregistré ✅. Pour que le client puisse cocher ses plats épuisés, ajoutez cette règle dans Firebase (une seule fois), puis cliquez encore <b>Enregistrer l’accès</b>.<br><br>Firebase → Firestore Database → <b>Règles</b> → collez juste avant « // Tout le reste est fermé » → <b>Publier</b>.</div>
      <pre style="white-space:pre-wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;font-size:12.5px;direction:ltr;text-align:left">${esc(RULE)}</pre><button class="btn primary" id="cpr">📋 Copier la règle</button>`);
    document.getElementById("cpr").onclick = async () => { try { await navigator.clipboard.writeText(RULE); ap.toast("Règle copiée ✓"); } catch (e) { prompt("Copiez :", RULE); } };
  }

  /* ================= CLIENT : « Mon commerce » ================= */
  const cache = { vis: {}, noms: {} };
  async function visites(type, slug) {
    const k = type + "-" + slug; if (cache.vis[k]) return cache.vis[k];
    const fs = A().fs, lire = async m => { try { const d = await fs.doc("stats/" + k + "-" + m).get(); return d.exists ? +d.data().n || 0 : 0; } catch (e) { return null; } };
    const [a, b] = await Promise.all([lire(mois(0)), lire(mois(1))]);
    return (cache.vis[k] = { a, b });
  }
  async function client(c) {
    const box = document.getElementById("mcBox"); if (!box) return;
    const ac = c && c.acces; if (!ac || (!(ac.menus || []).length && !(ac.pages || []).length)) { box.innerHTML = ""; return; }
    if (!cache.noms.ok) { const [m, p] = await Promise.all([liste("menus"), liste("pages")]); m.forEach(x => cache.noms["menu-" + x.slug] = x.nom); p.forEach(x => { cache.noms["page-" + x.slug] = x.nom; cache.noms["t-" + x.slug] = x.type; }); cache.noms.ok = 1; }
    const L = [...(ac.menus || []).map(s => ["menu", s]), ...(ac.pages || []).map(s => ["page", s])];
    const ligne = ([t, s], v) => `<div class="grow" style="flex-wrap:wrap"><span style="font-size:22px">${t === "menu" ? "🍽" : ICP[cache.noms["t-" + s]] || "📄"}</span>
        <div style="flex:1;min-width:0"><b>${esc(cache.noms[t + "-" + s] || s)}</b><div class="muted" style="font-size:12.5px;direction:ltr;text-align:start">nfcwork.ma/${t === "menu" ? "menu" : "p"}/${esc(s)}</div>${v && v.a != null ? `<div style="font-size:13px;margin-top:2px">📊 <b>${v.a}</b> visites ce mois · ${v.b} le mois dernier</div>` : ""}</div>
        <div class="row" style="gap:6px;width:100%;justify-content:flex-end;flex-wrap:wrap"><a class="btn sm" href="/${t === "menu" ? "menu" : "p"}/${esc(s)}" target="_blank" rel="noopener">👁 Voir</a>${t === "menu" && ac.edit ? `<a class="btn sm primary" href="menus.html#m=${esc(s)}">✏️ Modifier</a>` : ""}${t === "menu" && ac.epuise ? `<button class="btn sm${ac.edit ? "" : " primary"}" data-mcdispo="${esc(s)}">🚫 ${ac.edit ? "Indispo" : "Épuisés"}</button>` : ""}</div></div>`;
    const dessiner = V => { const b = document.getElementById("mcBox"); if (b) b.innerHTML = `<div class="section-head" style="margin-top:4px"><h3>🏪 Mon commerce</h3></div><div class="stack" style="gap:8px;margin-bottom:16px">${L.map((x, i) => ligne(x, V[i])).join("")}</div>`; };
    dessiner([]);
    if (ac.visites) dessiner(await Promise.all(L.map(([t, s]) => visites(t, s))));
  }
  async function dispo(slug) {
    const ap = A(), fs = ap.fs;
    let M = null, off = [];
    try { const d = await fs.doc("settings/menu-" + slug).get(); M = d.exists ? JSON.parse(d.data().json || "{}") : null; } catch (e) {}
    try { const d = await fs.doc("dispo/" + slug).get(); off = d.exists ? d.data().off || [] : []; } catch (e) {}
    if (!M) { ap.toast("Menu introuvable.", true); return; }
    const S = new Set(off), cats = (M.categories || M.cats || []);
    const nomTr = v => typeof v === "object" && v ? (v.fr || v.ar || Object.values(v)[0] || "") : (v || "");
    let q = "";
    const draw = () => {
      const n = norm(q);
      const loc = M.type === "location", KO = loc ? "🚫 Louée" : "🚫 Épuisé";
      ap.openModal(`${ap.head(loc ? "🚫 Voitures indisponibles" : "🚫 Plats épuisés")}
        <p class="muted" style="margin:0 0 10px;font-size:14px">Touchez ${loc ? "une voiture pour la mettre <b>louée / indisponible</b>" : "un plat pour le mettre <b>épuisé</b>"} 🚫 ou <b>disponible</b> ✅. Le menu change tout de suite pour vos clients.</p>
        <input id="mcq" type="search" placeholder="🔎 Chercher un plat…" value="${esc(q)}" style="width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:inherit;font-size:16px;margin-bottom:10px">
        ${S.size ? `<div class="notice" style="margin-bottom:10px">🚫 ${S.size} plat(s) épuisé(s) <button class="btn sm" id="mcall">↩️ Tout remettre disponible</button></div>` : ""}
        ${cats.map(c => { const it = (c.items || []).filter(i => !n || norm(nomTr(i.nom)).includes(n)); return it.length ? `<div style="font-weight:700;margin:12px 0 6px">${esc(nomTr(c.nom))}</div><div class="stack" style="gap:6px">${it.map(i => { const ko = S.has(i.id) || i.dispo === false;
          return `<button class="grow mcit${ko ? " ko" : ""}" data-mci="${esc(i.id)}"${i.dispo === false ? " disabled title=\"Épuisé dans le menu (demandez à NFCWORK)\"" : ""}><span style="flex:1;text-align:start">${esc(nomTr(i.nom))}</span><b>${ko ? KO : "✅ Dispo"}</b></button>`; }).join("")}</div>` : ""; }).join("")}`);
      const inp = document.getElementById("mcq"); inp.oninput = () => { q = inp.value; draw(); const x = document.getElementById("mcq"); x.focus(); x.setSelectionRange(q.length, q.length); };
      const all = document.getElementById("mcall"); if (all) all.onclick = () => { S.clear(); save(); };
      document.querySelectorAll("[data-mci]").forEach(b => b.onclick = () => { const id = b.dataset.mci; S.has(id) ? S.delete(id) : S.add(id); save(); });
    };
    const save = async () => {
      draw();
      try { await fs.doc("dispo/" + slug).update({ off: [...S], maj: new Date().toISOString() }); ap.toast("✅ C’est fait"); }
      catch (e) { ap.toast("Pas encore autorisé : demandez à NFCWORK d’activer cette option.", true); }
    };
    draw();
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-mcdispo]"); if (b) { e.preventDefault(); dispo(b.dataset.mcdispo); } });
  const st = document.createElement("style");
  st.textContent = `.mcchk{display:grid;gap:6px}.mcchk label{display:flex;gap:10px;align-items:center;font-size:14.5px;justify-content:flex-start;text-align:start}.mcchk input[type=checkbox]{width:20px!important;height:20px;flex:none;margin:0;padding:0;accent-color:var(--accent)}.mcbox{padding:14px;display:grid;gap:10px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.mcchk small{color:var(--muted)}
    .mcit{width:100%;font:inherit;color:var(--fg);cursor:pointer}.mcit.ko{border-color:var(--bad,#e5484d);background:color-mix(in srgb,var(--bad,#e5484d) 14%,var(--surface))}.mcit:disabled{opacity:.6;cursor:default}`;
  document.head.appendChild(st);
  window.NFCW_MC = { admin, client };
})();
