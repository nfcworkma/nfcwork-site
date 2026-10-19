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
  const RULE2 = `    // 🏪 Espace client : ses pages (carte, avis, Wi-Fi, liens), ses menus TV, ses abonnements
    match /settings/{doc} {
      allow update: if doc.matches('(page|tv)-[a-z0-9-]+') && proprio(doc);
      allow create: if doc.matches('mimg-[a-z0-9]+') && proprio('page-' + request.resource.data.get('page', ''));
      allow create: if doc.matches('mimg-[a-z0-9]+') && proprio('tv-' + request.resource.data.get('tv', ''));
      allow delete: if doc.matches('mimg-[a-z0-9]+') && proprio('page-' + resource.data.get('page', ''));
      allow delete: if doc.matches('mimg-[a-z0-9]+') && proprio('tv-' + resource.data.get('tv', ''));
    }
    match /abonnements/{id} {
      allow read: if verified() && resource.data.email == myEmail();
    }`;
  const SVC = { menu: "Menu digital", fid: "Carte fidélité", profil: "Carte NFC · Avis · Wi-Fi", autre: "Abonnement" };
  const jour = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const frD = v => { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const ICP = { profil: "👤", avis: "⭐", wifi: "📶", liens: "🔗" };
  async function liste(id) { try { const d = await A().fs.doc("settings/" + id).get(); return d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { return []; } }

  /* ================= ADMIN : réglage de l'accès ================= */
  async function admin(c, box) {
    const ap = A(), [menus, pages, tvs] = await Promise.all([liste("menus"), liste("pages"), liste("tvs")]);
    let progs = [], abos = [];
    try { progs = (await ap.fs.collection("fidProgrammes").get()).docs.map(x => ({ id: x.id, ...x.data() })); } catch (e) {}
    try { abos = (await ap.fs.collection("abonnements").get()).docs.map(x => ({ id: x.id, ...x.data() })); } catch (e) {}
    const em = String(c.email || "").trim().toLowerCase();
    const ac = c.acces || null, nc = norm(c.name);
    const proche = s => { const x = norm(s); return x && nc && (x.includes(nc) || nc.includes(x)); };
    const selM = new Set(ac ? ac.menus || [] : menus.filter(m => proche(m.nom)).map(m => m.slug));
    const selP = new Set(ac ? ac.pages || [] : pages.filter(p => proche(p.nom)).map(p => p.slug));
    const selT = new Set(ac ? ac.tvs || [] : tvs.filter(t => proche(t.nom)).map(t => t.slug));
    const selA = new Set(abos.filter(a => (em && String(a.email || "").toLowerCase() === em) || (!ac && proche(a.client))).map(a => a.id));
    const dr = ac ? ac : { epuise: true, visites: true };
    const chk = (attr, val, on, txt) => `<label><input type="checkbox" ${attr}="${esc(val)}"${on ? " checked" : ""}> ${txt}</label>`;
    const vide = t => `<span class="muted">${t}</span>`;
    const el = document.createElement("div");
    el.innerHTML = `<div class="section-head" style="margin-top:14px"><h3>🔒 Son espace client</h3>${ac ? `<span class="pill paid">activé</span>` : `<span class="pill draft">pas encore</span>`}</div>
      <div class="mcbox">
        ${c.email ? `<p class="muted" style="margin:0;font-size:13.5px">Il se connecte sur <b>nfcwork.ma/espace</b> avec <b>${esc(c.email)}</b> et voit seulement ce que vous cochez.</p>` : `<div class="notice">⚠️ Ajoutez d’abord l’<b>e-mail</b> du client dans sa fiche : c’est avec lui qu’il se connecte.</div>`}
        <p class="muted" style="margin:0;font-size:13px">👇 Cochez <b>tout ce qui est à lui</b>. Dès qu’il crée son compte avec cet e-mail, il le retrouve dans <b>🏪 Mon commerce</b>.</p>
        <b style="font-size:14px">🍽 Ses menus digitaux</b>
        <div class="mcchk">${menus.length ? menus.map(m => chk("data-mcm", m.slug, selM.has(m.slug), `${esc(m.nom)} <small>/menu/${esc(m.slug)}</small>`)).join("") : vide("Aucun menu.")}</div>
        <label class="mcdroit"><input type="checkbox" id="mc-ed"${dr.edit ? " checked" : ""}> <span>✏️ Il modifie lui-même ses menus (prix, photos, produits)</span></label>
        <label class="mcdroit"><input type="checkbox" id="mc-ep"${dr.epuise ? " checked" : ""}> <span>🚫 Il coche lui-même les plats <b>épuisés</b> / voitures louées</span></label>
        <b style="font-size:14px">📄 Ses cartes NFC, avis Google, Wi-Fi, pages liens</b>
        <div class="mcchk">${pages.length ? pages.map(p => chk("data-mcp", p.slug, selP.has(p.slug), `${ICP[p.type] || "📄"} ${esc(p.nom)} <small>/p/${esc(p.slug)}</small>`)).join("") : vide("Aucune page.")}</div>
        <label class="mcdroit"><input type="checkbox" id="mc-edp"${dr.editPages ? " checked" : ""}> <span>✏️ Il modifie lui-même ses pages (téléphone, horaires, photos, liens, Wi-Fi)</span></label>
        <b style="font-size:14px">📺 Ses menus TV</b>
        <div class="mcchk">${tvs.length ? tvs.map(t => chk("data-mct", t.slug, selT.has(t.slug), `📺 ${esc(t.nom)} <small>/tv/${esc(t.slug)}</small>`)).join("") : vide("Aucun menu TV.")}</div>
        <label class="mcdroit"><input type="checkbox" id="mc-edt"${dr.editTv ? " checked" : ""}> <span>✏️ Il change lui-même les pages de sa TV (nouveau PDF, photos)</span></label>
        <b style="font-size:14px">🎁 Ses cartes fidélité <small class="muted" style="font-weight:400">(il scanne, voit ses clients et le rapport)</small></b>
        <div class="mcchk">${progs.length ? progs.map(p => chk("data-mcf", p.id, (em && String(p.ownerEmail || "").toLowerCase() === em) || (!ac && proche(p.nom)), `🎁 ${esc(p.nom)} <small>${p.ownerEmail && String(p.ownerEmail).toLowerCase() !== em ? "· " + esc(p.ownerEmail) : ""}</small>`)).join("") : vide("Aucune carte fidélité.")}</div>
        <b style="font-size:14px">💳 Ses abonnements <small class="muted" style="font-weight:400">(il voit le prix et la prochaine échéance)</small></b>
        <div class="mcchk">${abos.length ? abos.map(a => chk("data-mca", a.id, selA.has(a.id), `💳 ${esc(a.client || "")} <small>· ${esc(SVC[a.service] || "")}${a.libelle ? " · " + esc(a.libelle) : ""} · ${(+a.prix || 0)} DH</small>`)).join("") : vide("Aucun abonnement.")}</div>
        <b style="font-size:14px">📊 En plus</b>
        <label class="mcdroit"><input type="checkbox" id="mc-vi"${dr.visites ? " checked" : ""}> <span>📊 Il voit ses <b>visites</b></span></label>
        <label class="muted" style="font-size:13px">🧾 Ses factures, 🛒 commandes et ✏️ demandes de modification : toujours visibles pour lui.</label>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" id="mc-save"${c.email ? "" : " disabled"}>💾 Enregistrer l’accès</button>${c.email ? `<button class="btn" id="mc-send">📲 Envoyer l’accès au client</button>` : ""}${ac ? `<button class="btn ghost" id="mc-off">⛔ Couper l’accès</button>` : ""}</div>
      </div>`;
    box.appendChild(el);
    const sauver = async acces => {
      try { await ap.fs.doc("clients/" + c.id).update({ acces }); }
      catch (e) { ap.toast("Échec de l’enregistrement.", true); return false; }
      return true;
    };
    el.querySelector("#mc-save").onclick = async () => {
      const coches = a => [...el.querySelectorAll(`[${a}]:checked`)].map(x => x.getAttribute(a));
      const v = id => el.querySelector(id).checked;
      const avant = c.acces || {};
      const acces = { menus: coches("data-mcm"), pages: coches("data-mcp"), tvs: coches("data-mct"), epuise: v("#mc-ep"), visites: v("#mc-vi"), edit: v("#mc-ed"), editPages: v("#mc-edp"), editTv: v("#mc-edt"), maj: new Date().toISOString() };
      if (!(await sauver(acces))) return;
      c.acces = acces;
      // abonnements cochés → il les voit (champ email)
      for (const a of abos) {
        const coche = acces && el.querySelector(`[data-mca="${a.id}"]:checked`), a0 = String(a.email || "").toLowerCase();
        try {
          if (coche && a0 !== em) { await ap.fs.doc("abonnements/" + a.id).update({ email: em }); a.email = em; }
          else if (!coche && a0 === em) { await ap.fs.doc("abonnements/" + a.id).update({ email: "" }); a.email = ""; }
        } catch (e) { console.warn("abo", e); }
      }
      // cartes fidélité cochées → elles appartiennent à son e-mail (ses cartes clients et employés suivent)
      for (const p of progs) {
        const coche = !!el.querySelector(`[data-mcf="${p.id}"]:checked`), a = String(p.ownerEmail || "").toLowerCase();
        if (coche && a !== em) { await changerProprio(ap.fs, p.id, em); p.ownerEmail = em; }
      }
      // fiches « dispo » : qui a le droit de modifier quoi (lu par les règles Firebase)
      let refus = false;
      const poser = async (cle, edit, garderOff) => {
        try { const r = ap.fs.doc("dispo/" + cle), d = await r.get(); await r.set({ email: em, off: garderOff && d.exists ? (d.data().off || []) : [], edit: !!edit, maj: new Date().toISOString() }); }
        catch (e) { refus = true; }
      };
      const retirer = async cle => { try { const r = ap.fs.doc("dispo/" + cle), d = await r.get(); if (d.exists && String(d.data().email || "").toLowerCase() === em) await r.set({ email: "", edit: false, maj: new Date().toISOString() }, { merge: true }); } catch (e) {} };
      if (acces.epuise || acces.edit) for (const x of acces.menus) await poser(x, acces.edit, true);
      for (const x of (avant.menus || []).filter(x => !acces.menus.includes(x) || !(acces.epuise || acces.edit))) await retirer(x);
      for (const [k, ed, pre] of [["pages", acces.editPages, "page-"], ["tvs", acces.editTv, "tv-"]]) {
        if (ed) for (const x of acces[k]) await poser(pre + x, true, false);
        for (const x of (avant[k] || []).filter(x => !ed || !acces[k].includes(x))) await retirer(pre + x);
      }
      if (refus) { regle(); return; }
      ap.toast("✅ Accès enregistré");
      el.remove(); admin(c, box);
    };
    const send = el.querySelector("#mc-send");
    if (send) send.onclick = () => {
      const w = (() => { let d = String(c.phone || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 9 ? d : ""; })();
      const a = c.acces || {}, L = [];
      if ((a.menus || []).length) L.push(a.edit ? "🍽 votre menu (prix, photos, produits)" : "🍽 votre menu" + (a.epuise ? " (plats épuisés)" : ""));
      if ((a.pages || []).length) L.push(a.editPages ? "📄 votre carte / page (téléphone, horaires, photos)" : "📄 votre carte / page");
      if ((a.tvs || []).length) L.push("📺 votre menu TV");
      if (el.querySelector("[data-mcf]:checked")) L.push("🎁 votre carte fidélité (scanner, clients, rapport)");
      if (el.querySelector("[data-mca]:checked")) L.push("💳 votre abonnement");
      if (a.visites) L.push("📊 vos visites");
      L.push("🧾 vos factures");
      const txt = `Bonjour ${c.name || ""} 👋\n\nVotre espace NFCWORK est prêt. Vous y retrouvez :\n${L.map(x => "• " + x).join("\n")}\n\n1️⃣ Ouvrez : https://nfcwork.ma/espace\n2️⃣ Touchez « Créer un compte »\n3️⃣ E-mail : ${c.email}\n4️⃣ Choisissez un mot de passe\n5️⃣ Ouvrez l’e-mail de confirmation reçu, puis revenez sur nfcwork.ma/espace\n\n💡 Ajoutez la page sur l’écran d’accueil de votre téléphone pour l’ouvrir comme une application.\n\nNFCWORK · nfcwork.ma`;
      window.open((w ? "https://wa.me/" + w : "https://wa.me/") + "?text=" + encodeURIComponent(txt), "_blank");
    };
    const off = el.querySelector("#mc-off");
    if (off) off.onclick = async () => { if (!confirm("Couper son accès à « Mon commerce » ?")) return; if (await sauver(null)) { c.acces = null; ap.toast("Accès coupé"); el.remove(); admin(c, box); } };
  }
  async function changerProprio(fs, pid, email) {
    await fs.doc("fidProgrammes/" + pid).set({ ownerEmail: email }, { merge: true });
    for (const col of ["fidCartes", "fidEmployes"]) {
      try { const s = await fs.collection(col).where("pid", "==", pid).get(); for (const d of s.docs) await d.ref.update({ ownerEmail: email }); } catch (e) { console.warn(col, e); }
    }
  }
  function regle() {
    const ap = A(), R = RULE + "\n" + RULE2;
    ap.openModal(`${ap.head("🔒 Règle Firebase")}<div class="notice">L’accès est enregistré ✅. Pour que le client puisse <b>modifier lui-même</b>, Firebase doit avoir ces règles (une seule fois), puis cliquez encore <b>Enregistrer l’accès</b>.<br><br>Firebase → Firestore Database → <b>Règles</b> → collez juste avant « // Tout le reste est fermé » → <b>Publier</b>.</div>
      <pre style="white-space:pre-wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;font-size:12.5px;direction:ltr;text-align:left">${esc(R)}</pre><button class="btn primary" id="cpr">📋 Copier la règle</button>`);
    document.getElementById("cpr").onclick = async () => { try { await navigator.clipboard.writeText(R); ap.toast("Règle copiée ✓"); } catch (e) { prompt("Copiez :", R); } };
  }

  /* ================= CLIENT : « Mon commerce » ================= */
  const cache = { vis: {}, noms: {} };
  async function visites(type, slug) {
    const k = type + "-" + slug; if (cache.vis[k]) return cache.vis[k];
    const fs = A().fs, lire = async m => { try { const d = await fs.doc("stats/" + k + "-" + m).get(); return d.exists ? +d.data().n || 0 : 0; } catch (e) { return null; } };
    const [a, b] = await Promise.all([lire(mois(0)), lire(mois(1))]);
    return (cache.vis[k] = { a, b });
  }
  async function client(c, fid) {
    const box = document.getElementById("mcBox"); if (!box) return;
    const F = fid || [], ac = (c && c.acces) || { menus: [], pages: [] };
    const cu = window.firebase && firebase.auth().currentUser, em = String((cu && cu.email) || (c && c.email) || "").toLowerCase();
    let abos = [];
    if (em) { try { abos = (await A().fs.collection("abonnements").where("email", "==", em).get()).docs.map(x => ({ id: x.id, ...x.data() })).filter(a => a.actif !== false); } catch (e) {} }
    if (!(ac.menus || []).length && !(ac.pages || []).length && !(ac.tvs || []).length && !F.length && !abos.length) { box.innerHTML = ""; return; }
    if (!cache.noms.ok) { const [m, p, t] = await Promise.all([liste("menus"), liste("pages"), liste("tvs")]); m.forEach(x => cache.noms["menu-" + x.slug] = x.nom); p.forEach(x => { cache.noms["page-" + x.slug] = x.nom; cache.noms["t-" + x.slug] = x.type; }); t.forEach(x => cache.noms["tv-" + x.slug] = x.nom); cache.noms.ok = 1; }
    const L = [...(ac.menus || []).map(s => ["menu", s]), ...(ac.pages || []).map(s => ["page", s]), ...(ac.tvs || []).map(s => ["tv", s])];
    const URLS = { menu: "menu", page: "p", tv: "tv" }, EDIT = { menu: ["edit", "menus.html#m="], page: ["editPages", "pages.html#e="], tv: ["editTv", "tv.html#e="] };
    const ligne = ([t, s], v) => `<div class="grow" style="flex-wrap:wrap"><span style="font-size:22px">${t === "menu" ? "🍽" : t === "tv" ? "📺" : ICP[cache.noms["t-" + s]] || "📄"}</span>
        <div style="flex:1;min-width:0"><b>${esc(cache.noms[t + "-" + s] || s)}</b><div class="muted" style="font-size:12.5px;direction:ltr;text-align:start">nfcwork.ma/${URLS[t]}/${esc(s)}</div>${v && v.a != null ? `<div style="font-size:13px;margin-top:2px">📊 <b>${v.a}</b> visites ce mois · ${v.b} le mois dernier</div>` : ""}</div>
        <div class="row" style="gap:6px;width:100%;justify-content:flex-end;flex-wrap:wrap"><a class="btn sm" href="/${URLS[t]}/${esc(s)}" target="_blank" rel="noopener">👁 Voir</a>${ac[EDIT[t][0]] ? `<a class="btn sm primary" href="${EDIT[t][1]}${esc(s)}">✏️ Modifier</a>` : ""}${t === "menu" && ac.epuise ? `<button class="btn sm${ac.edit ? "" : " primary"}" data-mcdispo="${esc(s)}">🚫 ${ac.edit ? "Indispo" : "Épuisés"}</button>` : ""}</div></div>`;
    const auj = jour();
    const aboL = abos.map(a => { const r = a.echeance && a.echeance < auj; return `<div class="grow" style="flex-wrap:wrap"><span style="font-size:22px">💳</span><div style="flex:1;min-width:0"><b>${esc(SVC[a.service] || "Abonnement")}${a.libelle ? " · " + esc(a.libelle) : ""}</b>
        <div style="font-size:13.5px;margin-top:2px"><b>${(+a.prix || 0).toLocaleString("fr-FR")} DH</b> / mois${a.echeance ? ` · prochaine échéance <b>${esc(frD(a.echeance))}</b>` : ""}</div>
        <div style="font-size:13px;margin-top:2px;color:${r ? "var(--bad,#e5484d)" : "var(--ok,#30a46c)"}">${r ? "⚠️ Paiement en attente : contactez NFCWORK" : "✅ À jour"}</div></div>
        <div class="row" style="gap:6px;width:100%;justify-content:flex-end"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/212620666027?text=${encodeURIComponent("Bonjour NFCWORK, je veux payer mon abonnement " + (SVC[a.service] || "") + (a.libelle ? " (" + a.libelle + ")" : "") + " 🙏")}">💬 Payer / question</a></div></div>`; }).join("");
    const fidL = F.map(p => `<div class="grow" style="flex-wrap:wrap"><span style="font-size:22px">🎁</span><div style="flex:1;min-width:0"><b>${esc(p.nom)}</b><div class="muted" style="font-size:12.5px">Carte fidélité · ${esc(p.objectif || "")} ${esc(p.unite || "")} = ${esc(p.recompense || "")}</div></div>
        <div class="row" style="gap:6px;width:100%;justify-content:flex-end;flex-wrap:wrap"><a class="btn sm primary" href="fidelite.html#p=${esc(p.id)}">📷 Scanner · clients · rapport</a>${p.modeClient === "caisse" ? `<a class="btn sm" href="caisse.html#p=${esc(p.id)}">📱 Écran caisse</a>` : ""}</div></div>`).join("");
    const dessiner = V => { const b = document.getElementById("mcBox"); if (b) b.innerHTML = `<div class="section-head" style="margin-top:4px"><h3>🏪 Mon commerce</h3></div><div class="stack" style="gap:8px;margin-bottom:16px">${fidL}${L.map((x, i) => ligne(x, V[i])).join("")}${aboL}</div>`; };
    dessiner([]);
    if (ac.visites) dessiner(await Promise.all(L.map(([t, s]) => t === "tv" ? null : visites(t, s))));
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
  st.textContent = `.mcchk{display:grid;gap:6px}.mcchk label{display:flex;gap:10px;align-items:center;font-size:14.5px;justify-content:flex-start;text-align:start}.mcchk input[type=checkbox]{width:20px!important;height:20px;flex:none;margin:0;padding:0;accent-color:var(--accent)}.mcbox{padding:14px;display:grid;gap:10px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.mcchk small{color:var(--muted)}.mcdroit{display:flex;gap:10px;align-items:center;font-size:13.5px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--accent) 9%,transparent)}.mcdroit input{width:20px!important;height:20px;flex:none;margin:0;accent-color:var(--accent)}
    .mcit{width:100%;font:inherit;color:var(--fg);cursor:pointer}.mcit.ko{border-color:var(--bad,#e5484d);background:color-mix(in srgb,var(--bad,#e5484d) 14%,var(--surface))}.mcit:disabled{opacity:.6;cursor:default}`;
  document.head.appendChild(st);
  window.NFCW_MC = { admin, client };
})();
