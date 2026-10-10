/* =========================================================
   NFCWORK — LOGIQUE DU SITE
   - Header / footer communs à toutes les pages
   - Langue (AR/FR), panier (sauvegardé dans le navigateur)
   - Envoi des commandes, contacts et réclamations sur WhatsApp
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PAGE = document.body.dataset.page;

  /* ---------- State ---------- */
  let lang = "fr";
  let cart = [];
  try {
    const s = JSON.parse(localStorage.getItem("nfcwork") || "{}");
    if (s.lang === "ar" || s.lang === "fr") lang = s.lang;
    if (Array.isArray(s.cart)) cart = s.cart;
  } catch (e) {}
  const save = () => { try { localStorage.setItem("nfcwork", JSON.stringify({ lang, cart })); } catch (e) {} };
  const t = k => (T[lang] && T[lang][k] !== undefined ? T[lang][k] : k);
  const L = o => (typeof o === "string" ? o : o[lang]);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const findItem = key => {
    const [c, k] = key.split(":");
    const C = CATALOG.find(x => x.id === c);
    const Ti = C && C.tiers.find(x => x.k === k);
    return C && Ti ? { C, Ti } : null;
  };
  cart = cart.filter(l => findItem(l.key));
  const cartCount = () => cart.reduce((s, l) => s + l.q, 0);
  const waLink = text => `https://wa.me/${CONFIG.whatsapp}${text ? "?text=" + encodeURIComponent(text) : ""}`;
  const telLink = "tel:+" + CONFIG.whatsapp;

  /* ---------- Application installable (PWA) ---------- */
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); installPrompt = e;
    window.dispatchEvent(new Event("installprompt-ready"));
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  }
  const newRef = prefix => prefix + "-" + Date.now().toString(36).slice(-5).toUpperCase();
  const phoneOk = p => /^(\+212|00212|0)[5-7]\d{8}$/.test(p.replace(/[\s.\-]/g, ""));
  const cityName = c => (lang === "ar" && CITY_AR[c]) || c;

  /* ---------- Toast ---------- */
  let tt;
  function toast(msg) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => (el.hidden = true), 2000);
  }

  /* ---------- Header & footer ---------- */
  const NAV = [
    ["home", "index.html"], ["products", "produits.html"], ["about", "a-propos.html"],
    ["faq", "faq.html"], ["contact", "contact.html"], ["claim", "reclamation.html"]
  ];
  const USER_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/></svg>`;
  function renderHeader() {
    const h = $("#site-header"); if (!h) return;
    h.className = "bar";
    h.innerHTML = `
      <div class="wrap bar-in">
        <a class="brand" href="index.html"><img src="assets/img/logo.png" alt="NFCWORK" width="40" height="40"><b>NFC<span>WORK</span></b></a>
        <nav class="nav" id="nav" aria-label="Menu">
          ${NAV.map(([k, href]) => `<a href="${href}" ${PAGE === k ? 'aria-current="page"' : ""}>${t("nav_" + k)}</a>`).join("")}
          <a class="nav-acct" href="espace/">${USER_ICON}${t("account")}</a>
        </nav>
        <div class="bar-tools">
          <div class="lang" role="group" aria-label="Langue">
            <button type="button" data-l="fr" lang="fr" aria-pressed="${lang === "fr"}" aria-label="Français">FR</button>
            <button type="button" data-l="ar" lang="ar" aria-pressed="${lang === "ar"}" aria-label="العربية">AR</button>
          </div>
          <a class="acctbtn" href="espace/" aria-label="${t("account")}">${USER_ICON}<span>${t("account")}</span></a>
          <a class="cartbtn" href="commande.html" ${PAGE === "order" ? 'aria-current="page"' : ""}><span>${t("cart")}</span><span class="c num">${cartCount()}</span></a>
          <button type="button" class="burger" id="burger" aria-expanded="false" aria-controls="nav" aria-label="${t("menu")}"><span></span><span></span><span></span></button>
        </div>
      </div>`;
    $$(".lang button", h).forEach(b => b.addEventListener("click", () => { lang = b.dataset.l; save(); render(); }));
    $("#burger", h).addEventListener("click", e => {
      const open = $("#nav").classList.toggle("open");
      e.currentTarget.setAttribute("aria-expanded", open);
    });
  }
  function updateCartBadge() { const c = $(".cartbtn .c"); if (c) c.textContent = cartCount(); }

  function renderFooter() {
    const f = $("#site-footer"); if (!f) return;
    f.className = "foot";
    f.innerHTML = `
      <div class="wrap foot-grid">
        <div><a class="brand" href="index.html"><img src="assets/img/logo.png" alt="" width="36" height="36"><b>NFC<span>WORK</span></b></a><p>${t("footerAbout")}</p></div>
        <div><h4>${t("footerLinks")}</h4>
          ${[["products","produits.html"],["order","commande.html"],["faq","faq.html"],["claim","reclamation.html"],["cond","conditions.html"]].map(([k,h])=>`<a href="${h}">${t("nav_"+k)}</a>`).join("")}
          <a class="foot-acct" href="espace/">${t("accountFoot")}</a>
        </div>
        <div><h4>${t("footerContact")}</h4>
          <a href="${waLink()}" target="_blank" rel="noopener">WhatsApp <span dir="ltr">${CONFIG.phoneDisplay}</span></a>
          <a href="${telLink}">${t("telLbl")} <span dir="ltr">${CONFIG.phoneDisplay}</span></a>
          <a href="https://instagram.com/${CONFIG.instagram}" target="_blank" rel="noopener">Instagram @${CONFIG.instagram}</a>
          ${CONFIG.email ? `<a href="mailto:${CONFIG.email}">${CONFIG.email}</a>` : ""}
        </div>
      </div>
      <div class="wrap foot-bottom">© ${new Date().getFullYear()} NFCWORK · ${t("slogan")}</div>
      <a class="wa-float" href="${waLink()}" target="_blank" rel="noopener" aria-label="WhatsApp">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>
      </a>`;
  }

  /* ---------- i18n for static elements ---------- */
  function applyStatic() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    $$("[data-t]").forEach(el => {
      const v = t(el.dataset.t);
      if (el.hasAttribute("data-html")) el.innerHTML = v; else el.textContent = v;
    });
    $$("[data-ph]").forEach(el => (el.placeholder = t(el.dataset.ph)));
    $$(".phone-num").forEach(el => (el.textContent = CONFIG.phoneDisplay));
    const title = $("[data-title]", document.head) || document.querySelector("title");
    if (title && title.dataset.title) document.title = t(title.dataset.title) + " · NFCWORK";
  }

  /* ---------- Shared bits ---------- */
  function tierCard(C, Ti) {
    const key = C.id + ":" + Ti.k, inC = cart.some(l => l.key === key);
    const badge = Ti.best ? t("best") : Ti.rec ? t("rec") : Ti.launch ? t("launch") : "";
    return `<article class="tier ${Ti.rec ? "rec" : ""} ${Ti.prem ? "prem" : ""}">
      ${Ti.prem && !badge ? `<span class="badge">Premium</span>` : badge ? `<span class="badge">${badge}</span>` : ""}
      <h3>${esc(L(Ti.n))}</h3>
      <div class="price num">${Ti.p} <small>${t("dh")}${Ti.yr ? " " + t("yr") : ""}</small>${Ti.old ? `<s>${Ti.old} ${t("dh")}</s>` : ""}</div>
      <ul>${L(Ti.f).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <button type="button" class="add ${inC ? "done" : ""}" data-k="${key}">${inC ? t("inCart") : t("addBtn")}</button>
    </article>`;
  }
  function bindAdd(root, after) {
    root.addEventListener("click", e => {
      const b = e.target.closest(".add"); if (!b) return;
      const k = b.dataset.k;
      if (!cart.some(l => l.key === k)) { cart.push({ key: k, q: 1 }); save(); toast(t("added")); }
      updateCartBadge(); after && after();
    });
  }
  function citySelect(sel) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${t("choose")}</option>` +
      CITIES.map(c => `<option value="${c}">${cityName(c)}</option>`).join("") +
      `<option value="other">${t("other")}</option>`;
    sel.value = cur;
  }
  function options(sel, arr, withEmpty) {
    const cur = sel.selectedIndex;
    sel.innerHTML = (withEmpty ? `<option value="">${t("choose")}</option>` : "") + arr.map((x, i) => `<option value="${i}">${esc(x)}</option>`).join("");
    if (cur >= 0) sel.selectedIndex = cur;
  }
  function setErr(id, msg) {
    const input = $("#" + id), e = $("#e-" + id);
    if (e) e.textContent = msg || "";
    if (input) input.setAttribute("aria-invalid", !!msg);
    return !msg;
  }
  function copyText(text) {
    const done = () => toast(t("copied"));
    const fallback = () => {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {} ta.remove();
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  // Ouvre WhatsApp avec le message (lien réel => marche sur mobile et ordinateur)
  // getData (optionnel) : infos envoyées aussi au Google Sheet (sans bloquer WhatsApp)
  function bindWaButton(btn, getMessage, validate, onSent, getData) {
    btn.addEventListener("click", e => {
      if (!validate()) { e.preventDefault(); return; }
      btn.href = waLink(getMessage());
      if (getData) sendToSheet(getData());
      setTimeout(onSent, 400);
    });
  }
  // Envoi au Google Sheet (CONFIG.sheetsUrl). Une seule fois par numéro NW-/RC-.
  const sentRefs = new Set();
  function sendToSheet(data) {
    if (!CONFIG.sheetsUrl || sentRefs.has(data.ref)) return;
    sentRefs.add(data.ref);
    try {
      fetch(CONFIG.sheetsUrl, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" }, body: JSON.stringify(data) }).catch(() => {});
    } catch (e) {}
  }
  // Apostrophe devant: Google Sheets garde la valeur comme texte (le 0 du début reste)
  const asText = s => (s ? "'" + s : "");
  const nowText = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  /* ---------- Pages ---------- */
  const pages = {};

  pages.home = function () {
    $("#cats").innerHTML = CATALOG.filter(c => c.id !== "packs").map(C => {
      const min = Math.min(...C.tiers.map(x => x.p));
      return `<a class="catcard" href="produits.html#${C.id}">
        <img src="${C.img}" alt="" loading="lazy">
        <div><h3>${esc(L(C.name))}</h3><p>${esc(L(C.short))}</p>
        <span class="from">${t("from")} <b class="num">${min} ${t("dh")}</b></span></div></a>`;
    }).join("");
    const P = CATALOG.find(c => c.id === "packs");
    const pick = ["starter", "business", "premium"].map(k => P.tiers.find(x => x.k === k));
    $("#packs").innerHTML = pick.map(Ti => tierCard(P, Ti)).join("");
    $("#steps").innerHTML = t("steps").map(s => `<li><b>${esc(s[0])}</b><span>${esc(s[1])}</span></li>`).join("");
    $("#why").innerHTML = t("why").map(s => `<div class="why"><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join("");
    $$(".wa-link").forEach(a => (a.href = waLink()));
    $("#gallery").innerHTML = GALLERY.map(g =>
      `<button type="button" data-full="assets/img/affiches/${g.f}.jpg"><img src="assets/img/galerie/${g.f}.jpg" alt="${esc(L(g.n))}" loading="lazy"></button>`
    ).join("");
  };
  pages.home.bind = function () {
    bindAdd($("#packs"), () => pages.home());
    $("#gallery").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      $("#lbImg").src = b.dataset.full; $("#lbImg").alt = b.firstChild.alt; $("#lb").hidden = false;
    });
    bindLightbox();
    // Bouton « Installer l'application » (Android / ordinateur) ou conseil iPhone
    const btn = $("#installBtn");
    const showBtn = () => { btn.hidden = !installPrompt; };
    showBtn(); window.addEventListener("installprompt-ready", showBtn);
    btn.addEventListener("click", () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt.userChoice.finally(() => { installPrompt = null; showBtn(); });
    });
    window.addEventListener("appinstalled", () => { installPrompt = null; showBtn(); });
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    $("#iosHint").hidden = !(ios && !installed);
  };
  function bindLightbox() {
    $("#lb").addEventListener("click", e => { if (e.target.id !== "lbImg") $("#lb").hidden = true; });
    document.addEventListener("keydown", e => { if (e.key === "Escape") $("#lb").hidden = true; });
  }
  // Affiches de la galerie (en français uniquement): originaux dans assets/img/affiches/,
  // miniatures dans assets/img/galerie/. f = nom du fichier sans ".jpg"
  // Retirées: services-processus-fr (ancien numéro) et caisson-led-intro (texte en arabe).
  const GALLERY = [
    { f: "carte-nfc-prix-fr", n: { ar: "أثمنة بطاقة NFC", fr: "Tarifs Carte NFC" } },
    { f: "google-reviews-intro-fr", n: { ar: "لوحة تقييمات Google", fr: "Plaque Google Reviews" } },
    { f: "google-reviews-prix-fr", n: { ar: "أثمنة لوحة Google", fr: "Tarifs Google Reviews" } },
    { f: "menu-prix-fr", n: { ar: "أثمنة المنيو الرقمي", fr: "Tarifs Menu digital" } },
    { f: "wifi-prix-fr", n: { ar: "أثمنة لوحة واي فاي", fr: "Tarifs Plaque Wi-Fi" } },
    { f: "caisson-led-prix-fr", n: { ar: "أثمنة صندوق LED", fr: "Tarifs Caisson LED" } },
    { f: "packs-fr", n: { ar: "الباقات", fr: "Packs" } }
  ];

  let cat = (location.hash || "").slice(1);
  pages.products = function () {
    if (!CATALOG.some(c => c.id === cat)) cat = CATALOG[0].id;
    const C = CATALOG.find(c => c.id === cat);
    $("#tabs").innerHTML = CATALOG.map(c => `<button type="button" role="tab" aria-selected="${c.id === cat}" data-c="${c.id}">${esc(L(c.name))}</button>`).join("");
    $("#posterImg").src = C.img; $("#posterImg").alt = L(C.name);
    $("#catIntro").textContent = L(C.intro);
    $("#tiers").innerHTML = C.tiers.map(Ti => tierCard(C, Ti)).join("");
    $("#extras").innerHTML = t("extras").map(e => `<div class="extra"><div><b>${esc(e[0])}</b><span>${esc(e[1])}</span></div><em>${esc(e[2])}</em></div>`).join("");
  };
  pages.products.bind = function () {
    $("#tabs").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      cat = b.dataset.c; history.replaceState(null, "", "#" + cat); pages.products();
    });
    window.addEventListener("hashchange", () => { cat = location.hash.slice(1); pages.products(); });
    bindAdd($("#tiers"), () => pages.products());
    $("#posterBtn").addEventListener("click", () => { $("#lbImg").src = $("#posterImg").src; $("#lb").hidden = false; });
    bindLightbox();
  };

  /* --- Commande --- */
  let orderRef = null;
  function totals() {
    const sub = cart.reduce((s, l) => s + findItem(l.key).Ti.p * l.q, 0);
    const design = $("#f-design").checked && cart.length ? CONFIG.designPremium : 0;
    const city = $("#f-city").value;
    const ship = CONFIG.shipping[city] !== undefined ? CONFIG.shipping[city] : null;
    return { sub, design, ship, city, total: sub + design + (ship || 0) };
  }
  function orderMessage() {
    const x = totals(), fr = lang === "fr";
    const city = x.city === "other" ? $("#f-other").value.trim() : x.city;
    if (!orderRef) orderRef = newRef(CONFIG.orderPrefix);
    const v = id => $("#" + id).value.trim();
    return [
      (fr ? "🛒 Nouvelle commande NFCWORK" : "🛒 طلب جديد NFCWORK") + ` (${orderRef})`, "",
      ...cart.map(l => { const { C, Ti } = findItem(l.key); return `• ${l.q} × ${L(C.name)} — ${L(Ti.n)} = ${Ti.p * l.q} DH`; }),
      x.design ? (fr ? "• Design premium" : "• تصميم احترافي") + ` = ${x.design} DH` : null, "",
      (fr ? "Sous-total : " : "المجموع الفرعي: ") + (x.sub + x.design) + " DH",
      (fr ? "Livraison : " : "التوصيل: ") + (x.ship !== null ? x.ship + " DH" : (fr ? "à confirmer" : "للتأكيد")),
      (fr ? "Total : " : "المجموع: ") + x.total + " DH" + (x.ship === null ? (fr ? " + livraison" : " + التوصيل") : ""), "",
      (fr ? "Nom : " : "الاسم: ") + v("f-name"),
      (fr ? "Téléphone : " : "الهاتف: ") + v("f-phone"),
      (fr ? "Ville : " : "المدينة: ") + city,
      v("f-addr") ? (fr ? "Adresse : " : "العنوان: ") + v("f-addr") : null,
      v("f-biz") ? (fr ? "Commerce : " : "المحل: ") + v("f-biz") : null,
      v("f-note") ? (fr ? "Remarque : " : "ملاحظة: ") + v("f-note") : null
    ].filter(l => l !== null).join("\n");
  }
  // Ligne envoyée au Google Sheet (onglet « Commandes »), appelée juste après orderMessage()
  function orderData() {
    const x = totals(), v = id => $("#" + id).value.trim();
    return {
      type: "commande", date: nowText(), ref: asText(orderRef),
      nom: v("f-name"), telephone: asText(v("f-phone")),
      ville: x.city === "other" ? v("f-other") : x.city,
      adresse: v("f-addr"), commerce: v("f-biz"),
      produits: cart.map(l => { const { C, Ti } = findItem(l.key); return `${l.q} × ${C.name.fr} — ${typeof Ti.n === "string" ? Ti.n : Ti.n.fr} (${Ti.p * l.q} DH)`; }).join(" ; "),
      sousTotal: x.sub, designPremium: x.design,
      livraison: x.ship !== null ? x.ship : "à confirmer",
      total: x.total, remarque: v("f-note"), langue: lang
    };
  }
  function validateOrder() {
    if (!cart.length) { toast(t("eCart")); return false; }
    const city = $("#f-city").value;
    const a = setErr("f-name", $("#f-name").value.trim() ? "" : t("eName"));
    const b = setErr("f-phone", phoneOk($("#f-phone").value) ? "" : t("ePhone"));
    const c = setErr("f-city", city && !(city === "other" && !$("#f-other").value.trim()) ? "" : t("eCity"));
    const bad = $("[aria-invalid=true]"); if (bad) bad.focus();
    return a && b && c;
  }
  pages.order = function () {
    citySelect($("#f-city"));
    $("#otherWrap").hidden = $("#f-city").value !== "other";
    const lines = $("#lines"), tot = $("#tot");
    if (!cart.length) {
      lines.innerHTML = `<div class="empty"><p>${t("empty")}</p><a class="btn" href="produits.html">${t("browse")}</a></div>`;
      tot.innerHTML = ""; return;
    }
    lines.innerHTML = cart.map((l, i) => {
      const { C, Ti } = findItem(l.key);
      return `<div class="line">
        <div><div class="n">${esc(L(C.name))}</div><div class="t">${esc(L(Ti.n))} · <span class="num">${Ti.p} ${t("dh")}</span></div></div>
        <div class="p num">${Ti.p * l.q} ${t("dh")}</div>
        <div class="qty"><button type="button" data-i="${i}" data-d="-1" aria-label="-">−</button><span class="num">${l.q}</span><button type="button" data-i="${i}" data-d="1" aria-label="+">+</button></div>
      </div>`;
    }).join("");
    const x = totals(), d = t("dh");
    tot.innerHTML = `<div><span>${t("sub")}</span><span class="num">${x.sub} ${d}</span></div>
      ${x.design ? `<div><span>${t("design")}</span><span class="num">${x.design} ${d}</span></div>` : ""}
      <div><span>${t("ship")}</span><span class="num ${x.ship === null ? "m" : ""}">${x.ship === null ? t("quote") : x.ship + " " + d}</span></div>
      <div class="g"><span>${t("total")}</span><span class="num">${x.total} ${d}${x.ship === null ? " +" : ""}</span></div>`;
  };
  pages.order.bind = function () {
    $("#lines").addEventListener("click", e => {
      const b = e.target.closest("[data-i]"); if (!b) return;
      const i = +b.dataset.i; cart[i].q += +b.dataset.d;
      if (cart[i].q < 1) cart.splice(i, 1);
      save(); updateCartBadge(); pages.order();
    });
    $("#orderForm").addEventListener("input", () => { orderRef = null; pages.order(); });
    $("#orderForm").addEventListener("change", () => pages.order());
    $("#orderForm").addEventListener("submit", e => e.preventDefault());
    bindWaButton($("#send"), orderMessage, validateOrder, () => {
      $("#doneRef").textContent = orderRef; $("#done").hidden = false; $("#done").scrollIntoView({ behavior: "smooth", block: "center" });
    }, orderData);
    $("#copyOrder").addEventListener("click", () => { if (validateOrder()) copyText(orderMessage()); });
    $("#newOrder").addEventListener("click", () => {
      cart = []; orderRef = null; save(); updateCartBadge();
      $("#orderForm").reset(); $("#done").hidden = true; pages.order();
    });
  };

  /* --- Contact --- */
  function contactMessage() {
    const fr = lang === "fr", v = id => $("#" + id).value.trim();
    return [
      fr ? "✉️ Message depuis le site NFCWORK" : "✉️ رسالة من موقع NFCWORK", "",
      (fr ? "Nom : " : "الاسم: ") + v("c-name"),
      (fr ? "Téléphone : " : "الهاتف: ") + v("c-phone"),
      (fr ? "Sujet : " : "الموضوع: ") + t("subjects")[+$("#c-subject").value], "",
      v("c-msg")
    ].join("\n");
  }
  function validateContact() {
    const a = setErr("c-name", $("#c-name").value.trim() ? "" : t("eName"));
    const b = setErr("c-phone", phoneOk($("#c-phone").value) ? "" : t("ePhone"));
    const c = setErr("c-msg", $("#c-msg").value.trim() ? "" : t("eMsg"));
    const bad = $("[aria-invalid=true]"); if (bad) bad.focus();
    return a && b && c;
  }
  pages.contact = function () {
    options($("#c-subject"), t("subjects"));
    $("#d-wa").href = waLink(); $("#d-wa-num").textContent = CONFIG.phoneDisplay;
    $("#d-ig").href = "https://instagram.com/" + CONFIG.instagram; $("#d-ig-name").textContent = "@" + CONFIG.instagram;
    $("#d-tel").href = telLink; $("#d-tel-num").textContent = CONFIG.phoneDisplay;
    $("#d-email-row").hidden = !CONFIG.email;
    if (CONFIG.email) { $("#d-email").textContent = CONFIG.email; $("#d-email").href = "mailto:" + CONFIG.email; }
  };
  pages.contact.bind = function () {
    $("#contactForm").addEventListener("submit", e => e.preventDefault());
    bindWaButton($("#c-send"), contactMessage, validateContact, () => {});
    $("#c-copy").addEventListener("click", () => { if (validateContact()) copyText(contactMessage()); });
  };

  /* --- Réclamation --- */
  let claimRef = null;
  function claimMessage() {
    const fr = lang === "fr", v = id => $("#" + id).value.trim();
    if (!claimRef) claimRef = newRef(CONFIG.claimPrefix);
    const wants = $$("input[name=want]:checked").map(i => t("wants")[+i.value]);
    return [
      (fr ? "⚠️ RÉCLAMATION NFCWORK" : "⚠️ شكاية NFCWORK") + ` (${claimRef})`, "",
      (fr ? "Nom : " : "الاسم: ") + v("r-name"),
      (fr ? "Téléphone : " : "الهاتف: ") + v("r-phone"),
      (fr ? "N° commande : " : "رقم الطلب: ") + (v("r-order") || "—"),
      (fr ? "Problème : " : "المشكل: ") + t("types")[+$("#r-type").value],
      wants.length ? (fr ? "Souhaite : " : "الطلب: ") + wants.join(", ") : null, "",
      v("r-desc")
    ].filter(l => l !== null).join("\n");
  }
  // Ligne envoyée au Google Sheet (onglet « Reclamations »), appelée juste après claimMessage()
  function claimData() {
    const v = id => $("#" + id).value.trim();
    return {
      type: "reclamation", date: nowText(), ref: claimRef,
      nom: v("r-name"), telephone: asText(v("r-phone")), commande: asText(v("r-order")),
      probleme: T.fr.types[+$("#r-type").value],
      souhait: $$("input[name=want]:checked").map(i => T.fr.wants[+i.value]).join(", "),
      description: v("r-desc")
    };
  }
  function validateClaim() {
    const a = setErr("r-name", $("#r-name").value.trim() ? "" : t("eName"));
    const b = setErr("r-phone", phoneOk($("#r-phone").value) ? "" : t("ePhone"));
    const c = setErr("r-type", $("#r-type").value !== "" ? "" : t("eType"));
    const d = setErr("r-desc", $("#r-desc").value.trim() ? "" : t("eDesc"));
    const bad = $("[aria-invalid=true]"); if (bad) bad.focus();
    return a && b && c && d;
  }
  pages.claim = function () {
    options($("#r-type"), t("types"), true);
    const checked = $$("input[name=want]:checked").map(i => i.value);
    $("#r-wants").innerHTML = t("wants").map((w, i) => `<label class="chip" for="w${i}"><input type="checkbox" name="want" id="w${i}" value="${i}" ${checked.includes(String(i)) ? "checked" : ""}><span>${esc(w)}</span></label>`).join("");
  };
  pages.claim.bind = function () {
    $("#claimForm").addEventListener("submit", e => e.preventDefault());
    $("#claimForm").addEventListener("input", () => (claimRef = null));
    bindWaButton($("#r-send"), claimMessage, validateClaim, () => {
      $("#rDoneRef").textContent = claimRef; $("#rDone").hidden = false;
    }, claimData);
    $("#r-copy").addEventListener("click", () => { if (validateClaim()) copyText(claimMessage()); });
  };

  /* --- Pages de contenu --- */
  pages.about = function () {
    $("#aboutBlocks").innerHTML = t("about").map(b => `<div class="block"><h2>${esc(b[0])}</h2><p>${esc(b[1])}</p></div>`).join("");
    $("#sectors").innerHTML = t("sectors").map(s => `<li>${esc(s)}</li>`).join("");
  };
  pages.faq = function () {
    $("#faqList").innerHTML = t("faq").map(q => `<details><summary>${esc(q[0])}</summary><p>${esc(q[1])}</p></details>`).join("");
    $("#faqWa").href = waLink();
  };
  pages.cond = function () {
    $("#condList").innerHTML = t("cond").map((c, i) => `<section><h2>${i + 1}. ${esc(c[0])}</h2><p>${esc(c[1])}</p></section>`).join("");
  };

  /* ---------- Render ---------- */
  function render() {
    renderHeader(); renderFooter(); applyStatic();
    if (pages[PAGE]) pages[PAGE]();
  }
  render();
  if (pages[PAGE] && pages[PAGE].bind) pages[PAGE].bind();
  // Panier synchronisé entre onglets
  window.addEventListener("storage", e => {
    if (e.key !== "nfcwork") return;
    try { cart = (JSON.parse(e.newValue || "{}").cart || []).filter(l => findItem(l.key)); } catch (_) {}
    updateCartBadge(); if (pages[PAGE]) pages[PAGE]();
  });
})();
