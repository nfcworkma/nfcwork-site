/* =========================================================
   NFCWORK — MENU DIGITAL (page publique)
   Lien : nfcwork.ma/menu/<nom-du-menu>  (404.html renvoie ici avec ?m=<nom>)
   Le menu est lu dans Firestore (document « settings/menu-<nom> »), les photos
   dans « settings/mimg-<id> ». On les remplit depuis l'Espace → Menus.
   3 formules :
     standard : les photos de la carte papier, l'une sous l'autre
     pro      : menu designé (catégories, produits, photos, prix)
     premium  : pro + plusieurs langues + commande sur WhatsApp
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
  const apercu = qs.has("apercu");

  /* ---------- textes de l'interface ---------- */
  const UI = {
    fr: { load: "Chargement du menu…", none: "Menu introuvable", noneTx: "Vérifiez le lien ou demandez au personnel.", off: "Menu bientôt disponible", offTx: "Ce menu est en cours de mise à jour.", zoom: "Touchez une page pour l'agrandir", soldout: "Épuisé", order: "Ma commande", see: "Voir la commande", total: "Total", table: "Table ou nom (facultatif)", note: "Remarque (facultatif)", send: "Envoyer sur WhatsApp", close: "Fermer", empty: "Votre commande est vide.", hello: "Bonjour, je souhaite commander :", by: "Menu digital par", hours: "Horaires", call: "Appeler" },
    ar: { load: "جاري تحميل القائمة…", none: "القائمة غير موجودة", noneTx: "تحقق من الرابط أو اسأل النادل.", off: "القائمة متاحة قريبا", offTx: "يتم تحديث هذه القائمة حاليا.", zoom: "المس الصفحة لتكبيرها", soldout: "نفد", order: "طلبي", see: "عرض الطلب", total: "المجموع", table: "رقم الطاولة أو الاسم (اختياري)", note: "ملاحظة (اختياري)", send: "إرسال عبر واتساب", close: "إغلاق", empty: "طلبك فارغ.", hello: "السلام عليكم، بغيت نطلب:", by: "قائمة رقمية من", hours: "أوقات العمل", call: "اتصل" },
    en: { load: "Loading the menu…", none: "Menu not found", noneTx: "Check the link or ask the staff.", off: "Menu coming soon", offTx: "This menu is being updated.", zoom: "Tap a page to zoom in", soldout: "Sold out", order: "My order", see: "View order", total: "Total", table: "Table or name (optional)", note: "Note (optional)", send: "Send on WhatsApp", close: "Close", empty: "Your order is empty.", hello: "Hello, I would like to order:", by: "Digital menu by", hours: "Opening hours", call: "Call" }
  };
  const LANG_NOM = { fr: "FR", ar: "ع", en: "EN" };

  let M = null, lang = "fr", panier = {};
  const u = k => (UI[lang] || UI.fr)[k];
  // un texte peut être une chaîne ou { fr, ar, en } : langue choisie, sinon langue principale, sinon la première remplie
  const tr = x => {
    if (x == null) return "";
    if (typeof x === "string") return x;
    const main = (M && M.langues && M.langues[0]) || "fr";
    return x[lang] || x[main] || Object.values(x).find(Boolean) || "";
  };
  const prixNum = p => { const n = parseFloat(String(p || "").replace(",", ".").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
  const fmtPrix = p => {
    const s = String(p == null ? "" : p).trim();
    if (!s) return "";
    return /[a-z€$]/i.test(s) || /د/.test(s) ? s : s + " " + (M.devise || "DH");
  };
  const waNum = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 9 ? d : ""; };

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

  // Photos : un id = une photo qui ne change jamais → gardée dans le cache du navigateur
  const imgCache = {};
  async function photo(id) {
    if (!id) return "";
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
  // remplit toutes les <img data-img="id"> de la page (6 en même temps)
  async function remplirPhotos() {
    const els = [...document.querySelectorAll("img[data-img]")].filter(e => !e.src);
    let i = 0;
    const suivant = async () => {
      while (i < els.length) {
        const el = els[i++];
        const d = await photo(el.dataset.img);
        if (d) el.src = d; else el.removeAttribute("data-img");
      }
    };
    await Promise.all(Array.from({ length: 6 }, suivant));
  }

  async function charger() {
    if (!slug) { etat(UI.fr.none, UI.fr.noneTx); return; }
    let memo = null;
    try { memo = JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) {}
    if (memo && memo.json && !apercu) { try { demarrer(JSON.parse(memo.json)); } catch (e) {} }
    else etat("", UI.fr.load, true);
    try {
      const f = await lireDoc("menu-" + slug);
      if (!f) { if (!M) etat(UI.fr.none, UI.fr.noneTx); return; }
      const json = (f.json && f.json.stringValue) || "{}";
      if (memo && memo.json === json && M) return;
      try { localStorage.setItem(CLE, JSON.stringify({ json })); } catch (e) {}
      demarrer(JSON.parse(json));
    } catch (e) {
      if (!M) etat(UI.fr.none, "Connexion impossible. Réessayez dans un instant.");
    }
  }

  /* ---------- démarrage ---------- */
  function demarrer(data) {
    M = data || {};
    M.langues = (M.langues && M.langues.length ? M.langues : ["fr"]).filter(l => UI[l]);
    if (!M.langues.length) M.langues = ["fr"];
    if (M.formule !== "premium") M.langues = M.langues.slice(0, 1);
    let pref = "";
    try { pref = localStorage.getItem("nfcwork-menu-lang") || ""; } catch (e) {}
    if (!M.langues.includes(lang) || !M.__init) lang = M.langues.includes(pref) ? pref : M.langues[0];
    M.__init = true;
    const root = document.documentElement;
    root.dataset.theme = ["nuit", "creme", "cafe", "lagon"].includes(M.theme) ? M.theme : "nuit";
    if (/^#[0-9a-f]{6}$/i.test(M.couleur || "")) {
      root.style.setProperty("--accent", M.couleur);
      root.style.setProperty("--on-accent", clair(M.couleur) ? "#16130d" : "#ffffff");
    } else { root.style.removeProperty("--accent"); root.style.removeProperty("--on-accent"); }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim() || "#0d0f14";
    if (mp === null && !apercu && history.replaceState) { try { history.replaceState(null, "", "/menu/" + slug); } catch (e) {} }
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
  function rendre() {
    const root = document.documentElement;
    root.lang = lang; root.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = (M.nom || "Menu") + " · Menu";
    if (M.actif === false && !apercu) { etat(u("off"), u("offTx")); return; }
    const pro = M.formule === "pro" || M.formule === "premium";
    const prem = M.formule === "premium";
    const inf = M.infos || {};
    const chips = [];
    if (inf.horaires) chips.push(`<span class="chip">${I.clock}${esc(inf.horaires)}</span>`);
    if (inf.adresse || inf.maps) {
      const href = inf.maps || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(inf.adresse);
      chips.push(`<a class="chip" href="${esc(href)}" target="_blank" rel="noopener">${I.pin}${esc(inf.adresse || "Google Maps")}</a>`);
    }
    if (inf.tel) chips.push(`<a class="chip" href="tel:${esc(inf.tel.replace(/[^\d+]/g, ""))}">${I.phone}${esc(inf.tel)}</a>`);
    if (inf.instagram) {
      const ig = inf.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
      chips.push(`<a class="chip" href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">${I.insta}@${esc(ig)}</a>`);
    }
    const cover = pro && M.couverture;
    const tete = `
      ${cover ? `<div class="hero"><img class="cover" data-img="${esc(M.couverture)}" alt=""></div>` : ""}
      <div class="head wrap">
        ${M.logo ? `<img class="logo${M.logoCarre ? " sq" : ""}" data-img="${esc(M.logo)}" alt="${esc(M.nom || "")}">` : ""}
        <h1>${esc(M.nom || "Menu")}</h1>
        ${tr(M.slogan) ? `<p class="slogan">${esc(tr(M.slogan))}</p>` : ""}
        ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
      </div>`;
    const langs = M.langues.length > 1 ? `<div class="langs" role="group" aria-label="Langue">${M.langues.map(l => `<button data-lang="${l}" aria-pressed="${l === lang}">${LANG_NOM[l]}</button>`).join("")}</div>` : "";
    const pied = `<footer>${u("by")} <a href="https://nfcwork.ma" target="_blank" rel="noopener"><b>NFCWORK</b></a></footer>`;
    document.body.classList.toggle("has-cover", !!cover);

    if (!pro) {
      const pages = (M.pages || []).filter(Boolean);
      app.innerHTML = `${langs}${tete}<div class="wrap">
        ${pages.length > 0 ? `<p class="hint">${esc(u("zoom"))}</p>` : ""}
        <div class="pages">${pages.map((id, i) => `<div class="page" data-zoom="${esc(id)}"><img data-img="${esc(id)}" alt="Menu — page ${i + 1}"></div>`).join("")}</div>
      </div>${pied}`;
    } else {
      const cats = (M.categories || []).filter(c => (c.items || []).length || tr(c.nom));
      const waOk = prem && waNum(inf.whatsapp) && M.commande !== false;
      app.innerHTML = `${langs}${tete}
        ${cats.length > 1 ? `<nav class="cats"><div class="cats-in">${cats.map(c => `<a href="#c-${esc(c.id)}" data-cat="${esc(c.id)}">${esc(tr(c.nom))}</a>`).join("")}</div></nav>` : ""}
        <div class="wrap">${cats.map(c => `<section class="cat" id="c-${esc(c.id)}"><h2>${esc(tr(c.nom))}</h2><div class="items">${(c.items || []).map(it => carte(it, waOk)).join("")}</div></section>`).join("")}</div>
        ${pied}
        ${waOk ? `<button class="cartbar" id="cartbar" hidden></button>` : ""}
        ${prem && waNum(inf.whatsapp) && !waOk ? `<a class="wafab" href="https://wa.me/${waNum(inf.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ""}`;
      espion();
      majPanier();
    }
    remplirPhotos();
  }

  function carte(it, waOk) {
    const off = it.dispo === false;
    const q = panier[it.id] || 0;
    const p = fmtPrix(it.prix);
    const ctrl = waOk && !off && prixNum(it.prix) > 0
      ? (q ? `<span class="qty"><button data-moins="${esc(it.id)}" aria-label="−">−</button><b>${q}</b><button data-plus="${esc(it.id)}" aria-label="+">+</button></span>`
           : `<button class="add" data-plus="${esc(it.id)}" aria-label="+">+</button>`)
      : "";
    return `<article class="item${off ? " off" : ""}" data-item="${esc(it.id)}">
      ${it.photo ? `<img class="ph" data-img="${esc(it.photo)}" data-zoom="${esc(it.photo)}" alt="${esc(tr(it.nom))}" loading="lazy">` : ""}
      <div class="tx"><h3>${esc(tr(it.nom))}</h3>${tr(it.desc) ? `<p>${esc(tr(it.desc))}</p>` : ""}
      <div class="bot">${p ? `<span class="price">${esc(p)}</span>` : "<span></span>"}${off ? `<span class="tag">${esc(u("soldout"))}</span>` : ctrl}</div></div>
    </article>`;
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
          if (on) a.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
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
    bar.innerHTML = `<span>${esc(u("see"))} (${n})</span><span>${esc(fmtPrix(arr(t)))}</span>`;
  }
  const arr = n => String(Math.round(n * 100) / 100);
  function rafraichirItem(id) {
    const it = tousItems().find(x => x.id === id), el = document.querySelector(`[data-item="${CSS.escape(id)}"]`);
    if (!it || !el) return;
    const tmp = document.createElement("div"); tmp.innerHTML = carte(it, true);
    const neuf = tmp.firstElementChild;
    const old = el.querySelector("img.ph"), nimg = neuf.querySelector("img.ph");
    if (old && nimg && old.src) nimg.src = old.src;
    el.replaceWith(neuf);
    majPanier();
  }
  function feuille() {
    const its = tousItems();
    const lignes = Object.entries(panier).map(([id, q]) => ({ it: its.find(x => x.id === id), q })).filter(x => x.it && x.q);
    const total = lignes.reduce((a, l) => a + l.q * prixNum(l.it.prix), 0);
    const d = document.createElement("div");
    d.className = "sheet";
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true"><h2>${esc(u("order"))}</h2>
      ${lignes.length ? lignes.map(l => `<div class="line"><div class="n">${esc(tr(l.it.nom))}<br><small>${esc(fmtPrix(l.it.prix))}</small></div><span class="qty"><button data-moins="${esc(l.it.id)}">−</button><b>${l.q}</b><button data-plus="${esc(l.it.id)}">+</button></span></div>`).join("")
        + `<div class="total"><span>${esc(u("total"))}</span><span>${esc(fmtPrix(arr(total)))}</span></div>
        <label class="f">${esc(u("table"))}<input id="c-table" maxlength="60"></label>
        <label class="f">${esc(u("note"))}<input id="c-note" maxlength="200"></label>
        <button class="wa" id="c-send">${I.wa.replace("<svg", '<svg width="22" height="22"')} ${esc(u("send"))}</button>`
        : `<p>${esc(u("empty"))}</p>`}
      <button class="ghost" data-fermer>${esc(u("close"))}</button></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", e => {
      if (e.target === d || e.target.closest("[data-fermer]")) { d.remove(); return; }
      const p = e.target.closest("[data-plus]"), m = e.target.closest("[data-moins]");
      if (p || m) {
        const id = (p || m).dataset[p ? "plus" : "moins"];
        changer(id, p ? 1 : -1);
        d.remove(); feuille();
      }
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
    const txt = [u("hello"), "", ...lignes.map(l => `• ${l.q} × ${tr(l.it.nom)} — ${fmtPrix(arr(l.q * prixNum(l.it.prix)))}`), "", `${u("total")} : ${fmtPrix(arr(total))}`,
      table.trim() ? `${u("table").replace(/\s*\(.*\)/, "")} : ${table.trim()}` : "", note.trim() ? `${u("note").replace(/\s*\(.*\)/, "")} : ${note.trim()}` : ""].filter((x, i, a) => x || (i && a[i - 1])).join("\n").trim();
    window.open(`https://wa.me/${waNum((M.infos || {}).whatsapp)}?text=${encodeURIComponent(txt)}`, "_blank");
  }

  /* ---------- visionneuse ---------- */
  function zoom(id) {
    const d = document.createElement("div");
    d.className = "lb";
    d.innerHTML = `<button class="x" aria-label="${esc(u("close"))}">×</button><img alt="">`;
    document.body.appendChild(d);
    document.body.style.overflow = "hidden";
    photo(id).then(s => { d.querySelector("img").src = s; });
    const fin = () => { d.remove(); document.body.style.overflow = ""; };
    d.querySelector(".x").onclick = fin;
    d.addEventListener("click", e => { if (e.target === d) fin(); });
  }

  /* ---------- clics ---------- */
  document.addEventListener("click", e => {
    if (e.target.closest(".sheet")) return;
    const l = e.target.closest("[data-lang]");
    if (l) { lang = l.dataset.lang; try { localStorage.setItem("nfcwork-menu-lang", lang); } catch (x) {} rendre(); return; }
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

  if (apercu && window.parent !== window) { etat("", UI.fr.load, true); window.parent.postMessage({ type: "nfcwork-menu-pret" }, location.origin); }
  else charger();
})();
