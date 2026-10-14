/* =========================================================
   NFCWORK — MENU DIGITAL (page publique, en français)
   Lien : nfcwork.ma/menu/<nom-du-menu>  (404.html renvoie ici avec ?m=<nom>)
   Le menu est lu dans Firestore (document « settings/menu-<nom> »), les photos
   envoyées dans « settings/mimg-<id> ». On les remplit depuis l'Espace → Menus.
   Une photo peut aussi être :  « u:<id> » = banque de photos (Unsplash)
                                « /chemin.jpg » = fichier du site (menus de démonstration)
   3 formules :
     standard : les photos de la carte papier, l'une sous l'autre
     pro      : menu designé (catégories, produits, photos, prix), 4 thèmes
     premium  : grande couverture, « À ne pas manquer », grandes photos, commande WhatsApp
   Démonstrations : nfcwork.ma/menu/demo-standard, demo-pro, demo-premium (menu/demos.json)
   ========================================================= */
(function () {
  "use strict";
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/settings/";
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- quel menu ? ---------- */
  const qs = new URLSearchParams(location.search);
  let slug = qs.get("m") || location.hash.slice(1) || "";
  const mp = location.pathname.match(/^\/menu\/([a-z0-9-]+)\/?$/i);
  if (!slug && mp) slug = mp[1];
  slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (slug === "demo") slug = "demo-premium";
  const apercu = qs.has("apercu");
  const demo = /^demo-(standard|pro|premium)$/.test(slug);

  const U = {
    none: "Menu introuvable", noneTx: "Vérifiez le lien ou demandez au personnel.", off: "Menu bientôt disponible", offTx: "Ce menu est en cours de mise à jour.",
    load: "Chargement du menu…", zoom: "Touchez une page pour l'agrandir", soldout: "Épuisé", order: "Ma commande", see: "Voir ma commande", total: "Total",
    table: "Table ou nom", note: "Remarque", opt: "(facultatif)", send: "Envoyer la commande sur WhatsApp", close: "Fermer", empty: "Votre commande est vide.",
    hello: "Bonjour, je souhaite commander :", by: "Menu digital par", add: "Ajouter", top: "À ne pas manquer", carte: "La carte"
  };

  let M = null, panier = {};
  // texte enregistré en chaîne ou en { fr: … } (anciens menus) → toujours la version française
  const tr = x => x == null ? "" : typeof x === "string" ? x : (x.fr || Object.values(x).find(Boolean) || "");
  const prixNum = p => { const n = parseFloat(String(p || "").replace(",", ".").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
  const fmtPrix = p => { const s = String(p == null ? "" : p).trim(); if (!s) return ""; return /[a-z€$]/i.test(s) ? s : s + " " + (M.devise || "DH"); };
  const waNum = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 9 ? d : ""; };
  const arr = n => String(Math.round(n * 100) / 100);

  function etat(titre, texte, spin) {
    app.innerHTML = `<div class="state"><div>${spin ? '<div class="spin"></div>' : ""}${titre ? `<h1>${esc(titre)}</h1>` : ""}<div>${esc(texte || "")}</div></div></div>`;
  }

  /* ---------- lecture Firestore (REST, sans charger Firebase) ---------- */
  const CLE = "nfcwork-menu-" + slug;
  async function lireDoc(id) {
    const r = await fetch(DOC + id, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("http " + r.status);
    return (await r.json()).fields || {};
  }

  // Photos : un id ne change jamais → gardée dans le cache du navigateur
  const imgCache = {};
  const unsplash = (id, w) => "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + w + "&q=75";
  async function photo(id, w) {
    if (!id) return "";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (id.startsWith("u:")) return unsplash(id.slice(2), Math.round((w || 400) * dpr / 100) * 100);
    if (id.startsWith("/")) return id;
    if (imgCache[id]) return imgCache[id];
    const k = "/__menu-img/" + id;
    let box = null;
    try { box = await caches.open("nfcwork-menu-img"); const hit = await box.match(k); if (hit) return (imgCache[id] = await hit.text()); } catch (e) {}
    const f = await lireDoc("mimg-" + id).catch(() => null);
    const d = f && f.data && f.data.stringValue;
    if (!d || !d.startsWith("data:image/")) return "";
    imgCache[id] = d;
    try { if (box) box.put(k, new Response(d)); } catch (e) {}
    return d;
  }
  // remplit toutes les <img data-img="id" data-w="largeur affichée"> (6 en même temps)
  async function remplirPhotos() {
    const els = [...document.querySelectorAll("img[data-img]")].filter(e => !e.src);
    let i = 0;
    const suivant = async () => {
      while (i < els.length) {
        const el = els[i++];
        const d = await photo(el.dataset.img, +el.dataset.w || 400);
        if (d) el.src = d; else el.removeAttribute("data-img");
      }
    };
    await Promise.all(Array.from({ length: 6 }, suivant));
  }

  async function charger() {
    if (!slug) { etat(U.none, U.noneTx); return; }
    if (demo) {
      try {
        const all = await (await fetch("/menu/demos.json", { cache: "no-cache" })).json();
        const m = all[slug];
        if (m && slug === "demo-pro" && ["nuit", "creme", "cafe", "lagon"].includes(qs.get("theme"))) m.theme = qs.get("theme");
        if (m) demarrer(m); else etat(U.none, U.noneTx);
      } catch (e) { etat(U.none, "Connexion impossible. Réessayez dans un instant."); }
      return;
    }
    let memo = null;
    try { memo = JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) {}
    if (memo && memo.json && !apercu) { try { demarrer(JSON.parse(memo.json)); } catch (e) {} }
    else etat("", U.load, true);
    try {
      const f = await lireDoc("menu-" + slug);
      if (!f) { if (!M) etat(U.none, U.noneTx); return; }
      const json = (f.json && f.json.stringValue) || "{}";
      if (memo && memo.json === json && M) return;
      try { localStorage.setItem(CLE, JSON.stringify({ json })); } catch (e) {}
      demarrer(JSON.parse(json));
    } catch (e) {
      if (!M) etat(U.none, "Connexion impossible. Réessayez dans un instant.");
    }
  }

  /* ---------- démarrage ---------- */
  function demarrer(data) {
    M = data || {};
    const root = document.documentElement;
    root.lang = "fr"; root.dir = "ltr";
    root.dataset.theme = ["nuit", "creme", "cafe", "lagon"].includes(M.theme) ? M.theme : "nuit";
    if (/^#[0-9a-f]{6}$/i.test(M.couleur || "")) {
      root.style.setProperty("--accent", M.couleur);
      root.style.setProperty("--on-accent", clair(M.couleur) ? "#16130d" : "#ffffff");
    } else { root.style.removeProperty("--accent"); root.style.removeProperty("--on-accent"); }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim() || "#0d0f14";
    if (mp === null && !apercu && history.replaceState) { try { history.replaceState(null, "", "/menu/" + slug + location.search.replace(/[?&]m=[^&]*/, "").replace(/^&/, "?")); } catch (e) {} }
    rendre();
  }
  function clair(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
  }

  /* ---------- icônes ---------- */
  const I = {
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/></svg>'
  };

  /* ---------- rendu ---------- */
  function puces() {
    const inf = M.infos || {}, c = [];
    if (inf.horaires) c.push(`<span class="chip">${I.clock}${esc(inf.horaires)}</span>`);
    if (inf.adresse || inf.maps) {
      const href = inf.maps || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(inf.adresse);
      c.push(`<a class="chip" href="${esc(href)}" target="_blank" rel="noopener">${I.pin}${esc(inf.adresse || "Google Maps")}</a>`);
    }
    if (inf.tel) c.push(`<a class="chip" href="tel:${esc(inf.tel.replace(/[^\d+]/g, ""))}">${I.phone}${esc(inf.tel)}</a>`);
    if (inf.instagram) {
      const ig = inf.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
      c.push(`<a class="chip" href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">${I.insta}@${esc(ig)}</a>`);
    }
    return c.length ? `<div class="chips">${c.join("")}</div>` : "";
  }
  const logoTag = () => M.logo ? `<img class="logo${M.logoCarre ? " sq" : ""}" data-img="${esc(M.logo)}" data-w="120" alt="${esc(M.nom || "")}">` : "";

  function barreDemo() {
    if (!demo) return "";
    const f = slug.slice(5), th = M.theme || "nuit";
    return `<div class="demobar"><b>Exemple NFCWORK</b>${["standard", "pro", "premium"].map(k => `<a href="/menu/?m=demo-${k}" class="${f === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</a>`).join("")}
      ${f === "pro" ? `<span class="th">Thème : ${[["nuit", "Nuit"], ["creme", "Crème"], ["cafe", "Café"], ["lagon", "Lagon"]].map(([k, n]) => `<a href="/menu/?m=demo-pro&theme=${k}" class="${th === k ? "on" : ""}">${n}</a>`).join("")}</span>` : ""}</div>`;
  }

  function rendre() {
    document.title = (M.nom || "Menu") + " · Menu";
    if (M.actif === false && !apercu && !demo) { etat(U.off, U.offTx); return; }
    const pro = M.formule === "pro" || M.formule === "premium";
    const prem = M.formule === "premium";
    const pied = `<footer>${U.by} <a href="https://nfcwork.ma" target="_blank" rel="noopener"><b>NFCWORK</b></a></footer>`;
    document.body.classList.toggle("prem", prem);
    document.body.classList.toggle("has-cover", pro && !prem && !!M.couverture);

    if (!pro) {
      const pages = (M.pages || []).filter(Boolean);
      app.innerHTML = `${barreDemo()}<div class="head wrap">${logoTag()}<h1>${esc(M.nom || "Menu")}</h1>${tr(M.slogan) ? `<p class="slogan">${esc(tr(M.slogan))}</p>` : ""}${puces()}</div>
        <div class="wrap">${pages.length ? `<p class="hint">${U.zoom}</p>` : ""}
        <div class="pages">${pages.map((id, i) => `<div class="page" data-zoom="${esc(id)}"><img data-img="${esc(id)}" data-w="720" alt="Menu — page ${i + 1}"></div>`).join("")}</div></div>${pied}`;
      remplirPhotos();
      return;
    }

    const inf = M.infos || {};
    const cats = (M.categories || []).filter(c => (c.items || []).length || tr(c.nom));
    const waOk = prem && waNum(inf.whatsapp) && M.commande !== false;
    const nav = cats.length > 1 ? `<nav class="cats"><div class="cats-in">${cats.map(c => `<a href="#c-${esc(c.id)}" data-cat="${esc(c.id)}">${esc(tr(c.nom))}</a>`).join("")}</div></nav>` : "";
    const fin = `${pied}${waOk ? `<button class="cartbar" id="cartbar" hidden></button>` : ""}
      ${prem && waNum(inf.whatsapp) && !waOk ? `<a class="wafab" href="https://wa.me/${waNum(inf.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ""}`;

    if (prem) {
      const vedettes = cats.flatMap(c => c.items || []).filter(i => i.vedette && i.photo && i.dispo !== false);
      app.innerHTML = `${barreDemo()}
        <header class="phero">${M.couverture ? `<img data-img="${esc(M.couverture)}" data-w="900" alt="">` : ""}
          <div class="in">${logoTag()}<h1>${esc(M.nom || "Menu")}</h1>${tr(M.slogan) ? `<p class="slogan">${esc(tr(M.slogan))}</p>` : ""}<div class="orn">${U.carte}</div></div></header>
        <div class="wrap pinfo">${puces()}</div>
        ${vedettes.length ? `<section class="wrap vedettes"><h2>${U.top}</h2><div class="vscroll">${vedettes.map(it => vcarte(it, waOk)).join("")}</div></section>` : ""}
        ${nav}
        <div class="wrap">${cats.map(c => `<section class="cat" id="c-${esc(c.id)}"><h2>${esc(tr(c.nom))}</h2><div class="orn">${(c.items || []).length} choix</div>
          <div class="pgrid">${(c.items || []).map(it => it.photo ? pcarte(it, waOk) : carte(it, waOk)).join("")}</div></section>`).join("")}</div>
        ${fin}`;
    } else {
      const cover = !!M.couverture;
      app.innerHTML = `${barreDemo()}
        ${cover ? `<div class="hero"><img class="cover" data-img="${esc(M.couverture)}" data-w="760" alt=""></div>` : ""}
        <div class="head wrap">${logoTag()}<h1>${esc(M.nom || "Menu")}</h1>${tr(M.slogan) ? `<p class="slogan">${esc(tr(M.slogan))}</p>` : ""}${puces()}</div>
        ${nav}
        <div class="wrap">${cats.map(c => `<section class="cat" id="c-${esc(c.id)}"><h2>${esc(tr(c.nom))}</h2><div class="items">${(c.items || []).map(it => carte(it, false)).join("")}</div></section>`).join("")}</div>
        ${fin}`;
    }
    espion();
    majPanier();
    remplirPhotos();
  }

  function ctrl(it, waOk, gros) {
    const off = it.dispo === false;
    if (off) return `<span class="tag">${U.soldout}</span>`;
    if (!waOk || prixNum(it.prix) <= 0) return "";
    const q = panier[it.id] || 0;
    return q ? `<span class="qty"><button data-moins="${esc(it.id)}" aria-label="Retirer">−</button><b>${q}</b><button data-plus="${esc(it.id)}" aria-label="Ajouter">+</button></span>`
             : `<button class="add" data-plus="${esc(it.id)}" aria-label="${U.add}">+${gros ? " " + U.add : ""}</button>`;
  }
  // ligne compacte (Pro, ou produit sans photo en Premium)
  function carte(it, waOk) {
    const p = fmtPrix(it.prix);
    return `<article class="item${it.dispo === false ? " off" : ""}" data-item="${esc(it.id)}">
      ${it.photo ? `<img class="ph" data-img="${esc(it.photo)}" data-w="130" data-zoom="${esc(it.photo)}" alt="${esc(tr(it.nom))}" loading="lazy">` : ""}
      <div class="tx"><h3>${esc(tr(it.nom))}</h3>${tr(it.desc) ? `<p>${esc(tr(it.desc))}</p>` : ""}
      <div class="bot">${p ? `<span class="price">${esc(p)}</span>` : "<span></span>"}${ctrl(it, waOk)}</div></div></article>`;
  }
  // grande carte photo (Premium)
  function pcarte(it, waOk) {
    const p = fmtPrix(it.prix);
    return `<article class="pcard${it.dispo === false ? " off" : ""}" data-item="${esc(it.id)}">
      <img class="ph" data-img="${esc(it.photo)}" data-w="700" data-zoom="${esc(it.photo)}" alt="${esc(tr(it.nom))}" loading="lazy">
      <div class="tx"><div class="top"><h3>${esc(tr(it.nom))}</h3>${p ? `<span class="price">${esc(p)}</span>` : ""}</div>
      ${tr(it.desc) ? `<p>${esc(tr(it.desc))}</p>` : ""}<div class="bot">${ctrl(it, waOk, true)}</div></div></article>`;
  }
  // carte « À ne pas manquer »
  function vcarte(it, waOk) {
    const p = fmtPrix(it.prix);
    return `<article class="vcard" data-item="${esc(it.id)}" data-v="1">
      <img class="ph" data-img="${esc(it.photo)}" data-w="320" data-zoom="${esc(it.photo)}" alt="${esc(tr(it.nom))}" loading="lazy">
      <div class="tx"><h3>${esc(tr(it.nom))}</h3><div class="bot">${p ? `<span class="price">${esc(p)}</span>` : "<span></span>"}${ctrl(it, waOk)}</div></div></article>`;
  }

  /* catégorie visible = puce allumée */
  let obs = null;
  function espion() {
    if (obs) obs.disconnect();
    const nav = document.querySelector(".cats-in");
    if (!nav || !("IntersectionObserver" in window)) return;
    obs = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const id = e.target.id.slice(2);
        nav.querySelectorAll("a").forEach(a => {
          const on = a.dataset.cat === id;
          a.classList.toggle("on", on);
          if (on) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2, behavior: "smooth" });
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll(".cat").forEach(s => obs.observe(s));
  }

  /* ---------- panier WhatsApp (premium) ---------- */
  const tousItems = () => (M.categories || []).flatMap(c => c.items || []);
  function majPanier() {
    const bar = document.getElementById("cartbar");
    if (!bar) return;
    const its = tousItems();
    let n = 0, t = 0;
    for (const [id, q] of Object.entries(panier)) { const it = its.find(x => x.id === id); if (it) { n += q; t += q * prixNum(it.prix); } }
    bar.hidden = !n;
    bar.innerHTML = `<span>${U.see} (${n})</span><span>${esc(fmtPrix(arr(t)))}</span>`;
  }
  function rafraichirItem(id) {
    const it = tousItems().find(x => x.id === id);
    if (!it) return;
    document.querySelectorAll(`[data-item="${CSS.escape(id)}"]`).forEach(el => {
      const tmp = document.createElement("div");
      tmp.innerHTML = el.dataset.v ? vcarte(it, true) : el.classList.contains("pcard") ? pcarte(it, true) : carte(it, true);
      const neuf = tmp.firstElementChild, old = el.querySelector("img.ph"), ni = neuf.querySelector("img.ph");
      if (old && ni && old.src) ni.src = old.src;
      el.replaceWith(neuf);
    });
    majPanier();
  }
  function feuille() {
    const its = tousItems();
    const lignes = Object.entries(panier).map(([id, q]) => ({ it: its.find(x => x.id === id), q })).filter(x => x.it && x.q);
    const total = lignes.reduce((a, l) => a + l.q * prixNum(l.it.prix), 0);
    const d = document.createElement("div");
    d.className = "sheet";
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true"><h2>${U.order}</h2>
      ${lignes.length ? lignes.map(l => `<div class="line"><div class="n">${esc(tr(l.it.nom))}<br><small>${esc(fmtPrix(l.it.prix))}</small></div><span class="qty"><button data-moins="${esc(l.it.id)}">−</button><b>${l.q}</b><button data-plus="${esc(l.it.id)}">+</button></span></div>`).join("")
        + `<div class="total"><span>${U.total}</span><span>${esc(fmtPrix(arr(total)))}</span></div>
        <label class="f">${U.table} ${U.opt}<input id="c-table" maxlength="60"></label>
        <label class="f">${U.note} ${U.opt}<input id="c-note" maxlength="200"></label>
        <button class="wa" id="c-send">${I.wa.replace("<svg", '<svg width="22" height="22"')} ${U.send}</button>`
        : `<p>${U.empty}</p>`}
      <button class="ghost" data-fermer>${U.close}</button></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", e => {
      if (e.target === d || e.target.closest("[data-fermer]")) { d.remove(); return; }
      const p = e.target.closest("[data-plus]"), m = e.target.closest("[data-moins]");
      if (p || m) { changer((p || m).dataset[p ? "plus" : "moins"], p ? 1 : -1); d.remove(); feuille(); return; }
      if (e.target.closest("#c-send")) envoyer(lignes, total, d);
    });
  }
  function changer(id, delta) {
    const q = Math.max(0, (panier[id] || 0) + delta);
    if (q) panier[id] = q; else delete panier[id];
    rafraichirItem(id);
  }
  function envoyer(lignes, total, d) {
    const table = (d.querySelector("#c-table") || {}).value || "", note = (d.querySelector("#c-note") || {}).value || "";
    const txt = [U.hello, "", ...lignes.map(l => `• ${l.q} × ${tr(l.it.nom)} — ${fmtPrix(arr(l.q * prixNum(l.it.prix)))}`), "", `${U.total} : ${fmtPrix(arr(total))}`]
      .concat(table.trim() ? [`${U.table} : ${table.trim()}`] : [], note.trim() ? [`${U.note} : ${note.trim()}`] : []).join("\n");
    window.open(`https://wa.me/${waNum((M.infos || {}).whatsapp)}?text=${encodeURIComponent(txt)}`, "_blank");
  }

  /* ---------- visionneuse ---------- */
  function zoom(id) {
    const d = document.createElement("div");
    d.className = "lb";
    d.innerHTML = `<button class="x" aria-label="${U.close}">×</button><img alt="">`;
    document.body.appendChild(d);
    document.body.style.overflow = "hidden";
    photo(id, 1100).then(s => { d.querySelector("img").src = s; });
    const fin = () => { d.remove(); document.body.style.overflow = ""; };
    d.querySelector(".x").onclick = fin;
    d.addEventListener("click", e => { if (e.target === d) fin(); });
  }

  /* ---------- clics ---------- */
  document.addEventListener("click", e => {
    if (e.target.closest(".sheet")) return;
    const p = e.target.closest("[data-plus]"), m = e.target.closest("[data-moins]");
    if (p) { changer(p.dataset.plus, 1); return; }
    if (m) { changer(m.dataset.moins, -1); return; }
    if (e.target.closest("#cartbar")) { feuille(); return; }
    const z = e.target.closest("[data-zoom]");
    if (z) { zoom(z.dataset.zoom); return; }
    const c = e.target.closest(".cats a");
    if (c) { e.preventDefault(); const s = document.getElementById("c-" + c.dataset.cat); if (s) s.scrollIntoView({ behavior: "smooth" }); }
  });

  // L'Espace (aperçu) envoie le menu en cours de modification sans l'enregistrer
  window.addEventListener("message", e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== "nfcwork-menu-apercu") return;
    if (e.data.images) Object.assign(imgCache, e.data.images);
    demarrer(e.data.menu);
  });

  if (apercu && window.parent !== window) { etat("", U.load, true); window.parent.postMessage({ type: "nfcwork-menu-pret" }, location.origin); }
  else charger();
})();
