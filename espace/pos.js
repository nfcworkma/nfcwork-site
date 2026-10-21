/* NFCWORK — Caisse web (espace/pos.html#m=<slug>)
   Pensée pour être utilisée sans lire : grandes icônes, couleurs, photos des produits, billets, un seul gros bouton par étape. FR / عربي.
   Données :
   - caisses/<slug>  { emails:[…], tables:12, employes:[{nom,pin}], ticket:{entete,pied,largeur} }  (réglé par NFCWORK dans « Menus »)
   - commandes/<slug>/liste/<id>  { statut: nouvelle|cuisine|prete|payee|annulee, source: menu|caisse, num, cree, mode: place|emporter|livraison|chambre,
       table, nom, tel, adresse, pos, note, items:[{id,n,q,p}], total, frais, devise, employe, paiement, payeA }
   Robustesse : cache hors connexion (les ventes continuent sans internet), alerte rouge + son si internet coupé, écran toujours allumé. */
(function () {
  "use strict";
  const app = document.getElementById("app"), top = document.getElementById("top");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = v => v && typeof v === "object" ? (v.fr || v.ar || v.en || Object.values(v)[0] || "") : (v || "");
  const num = p => { const n = parseFloat(String(p == null ? "" : p).replace(",", ".").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
  const LS = { get(k, d) { try { const v = localStorage.getItem("pos-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("pos-" + k, JSON.stringify(v)); } catch (e) {} } };

  /* ---------- langue ---------- */
  let LG = LS.get("lg", "fr");
  const W = {
    fr: { start: "Démarrer la caisse", startTx: "Les commandes du menu arrivent ici en direct.", who: "Touchez votre nom", code: "Entrez votre code", wrong: "Code incorrect", hello: "Bonjour", what: "Que voulez-vous faire ?",
      place: "Sur place", emporter: "À emporter", livraison: "Livraison", commandes: "Commandes", tables: "Tables", libre: "Libre", occ: "occupées",
      nouvelle: "Nouvelle", cuisine: "En cuisine", prete: "Prête", payee: "Payée", annulee: "Annulée", lancer: "Envoyer en cuisine", lancerTout: "Envoyer en cuisine", pret: "C’est prêt",
      encaisser: "Encaisser", ticket: "Ticket", bon: "Bon cuisine", annuler: "Annuler", ajouter: "Ajouter des produits", total: "Total", especes: "Espèces", carte: "Carte",
      donne: "Le client donne", rendre: "À rendre", manque: "Il manque", valider: "C’est payé", effacer: "Effacer", exact: "Montant exact", retour: "Retour", fermer: "Fermer",
      encaisse: "Encaissé aujourd’hui", payees: "Payées", encours: "En cours", aucune: "Aucune", vide: "Table libre", envoyee: "Envoyée en cuisine", paye: "Payé",
      offline: "Pas d’internet : les commandes du menu n’arrivent pas. Vous pouvez continuer à vendre.", online: "Internet revenu ✓", nouv: "nouvelle(s) commande(s)", voir: "Voir",
      tel: "Téléphone", nom: "Nom", adresse: "Adresse", note: "Remarque pour la cuisine", panier: "Ma commande", serveur: "Serveur", menuQR: "Menu QR", reglages: "Réglages",
      oui: "Oui", non: "Non", annulerQ: "Annuler cette commande ?", pin: "Changer de serveur", livr: "Livraison", depuis: "il y a", min: "min", instant: "à l’instant",
      choisir: "Choisissez une table", lang: "عربي", ticketTest: "Ticket test", papier: "Largeur du papier", bonAuto: "Imprimer le bon cuisine en envoyant", auto: "Imprimer chaque nouvelle commande du menu automatiquement",
      sauver: "Enregistrer", changer: "Changer de caisse", deco: "Déconnecter cette caisse", telReq: "Écrivez le téléphone du client", touch: "Touchez les produits", tableW: "Table",
      histo: "Historique", histoTx: "Ventes, produits, serveurs", patron: "Code du patron", jour: "Aujourd’hui", hier: "Hier", j7: "7 jours", mois: "Ce mois", moisP: "Mois dernier",
      ca: "Chiffre d’affaires", tickets: "Tickets", moyen: "Ticket moyen", produits: "Produits vendus", serveurs: "Par serveur", parJour: "Par jour", liste: "Tous les tickets",
      qte: "Qté", montant: "Montant", annulees: "Annulées", rapport: "Imprimer le rapport", csv: "Télécharger (Excel)", chargement: "Chargement…", du: "Du", au: "au", voirP: "Voir",
      gerer: "Gérer la caisse", equipe: "Serveurs et codes", ajouterS: "Ajouter un serveur", nbTables: "Nombre de tables", entete: "Adresse sur le ticket", contact: "Pour changer les codes, les prix ou les produits, contactez NFCWORK", pinErr: "Chaque code doit avoir 4 chiffres, différents" },
    ar: { start: "بدا الكيسة", startTx: "الطلبات ديال المنيو كيوصلو هنا مباشرة.", who: "ورك على سميتك", code: "دخل الكود ديالك", wrong: "الكود غالط", hello: "مرحبا", what: "شنو بغيتي دير؟",
      place: "فالمحل", emporter: "ديها معاك", livraison: "توصيل", commandes: "الطلبات", tables: "الطوابل", libre: "خاوية", occ: "عامرين",
      nouvelle: "جديدة", cuisine: "فالكوزينة", prete: "واجدة", payee: "تخلصات", annulee: "تلغات", lancer: "صيفط للكوزينة", lancerTout: "صيفط للكوزينة", pret: "واجدة",
      encaisser: "خلّص", ticket: "التيكي", bon: "ورقة الكوزينة", annuler: "لغي", ajouter: "زيد شي حاجة", total: "المجموع", especes: "كاش", carte: "كارط",
      donne: "الكليان عطاك", rendre: "رجّع ليه", manque: "ناقص", valider: "صافي، تخلّص", effacer: "مسح", exact: "الحساب نيشان", retour: "رجوع", fermer: "سد",
      encaisse: "دخل اليوم", payees: "تخلصو", encours: "باقيين", aucune: "والو", vide: "الطابلة خاوية", envoyee: "تصيفطات للكوزينة", paye: "تخلّص",
      offline: "ماكاينش الأنترنيت: الطلبات ديال المنيو ما كيوصلوش. تقدر تكمل تبيع.", online: "رجع الأنترنيت ✓", nouv: "طلب جديد", voir: "شوف",
      tel: "التيليفون", nom: "السمية", adresse: "العنوان", note: "ملاحظة للكوزينة", panier: "الطلب", serveur: "السرفور", menuQR: "منيو QR", reglages: "الإعدادات",
      oui: "إيه", non: "لا", annulerQ: "تلغي هاد الطلب؟", pin: "بدل السرفور", livr: "التوصيل", depuis: "هادي", min: "دقيقة", instant: "دابا",
      choisir: "اختار الطابلة", lang: "Français", ticketTest: "تيكي تجربة", papier: "عرض الورقة", bonAuto: "طبع ورقة الكوزينة ملي تصيفط", auto: "طبع كل طلب جديد من المنيو بوحدو",
      sauver: "سجل", changer: "بدل الكيسة", deco: "خرج من هاد الكيسة", telReq: "كتب التيليفون ديال الكليان", touch: "ورك على المنتوجات", tableW: "الطابلة",
      histo: "الحسابات", histoTx: "المبيعات، المنتوجات، السرفورات", patron: "الكود ديال مول المحل", jour: "اليوم", hier: "البارح", j7: "7 أيام", mois: "هاد الشهر", moisP: "الشهر اللي فات",
      ca: "المدخول", tickets: "التيكيات", moyen: "معدل التيكي", produits: "المنتوجات اللي تباعو", serveurs: "على حساب السرفور", parJour: "على حساب النهار", liste: "كاع التيكيات",
      qte: "العدد", montant: "المبلغ", annulees: "تلغاو", rapport: "طبع الحساب", csv: "تحميل (Excel)", chargement: "كيتشارجا…", du: "من", au: "حتى", voirP: "شوف",
      gerer: "تسيير الكيسة", equipe: "السرفورات والكودات", ajouterS: "زيد سرفور", nbTables: "عدد الطوابل", entete: "العنوان فالتيكي", contact: "باش تبدل الكودات ولا الأثمنة ولا المنتوجات، تواصل مع NFCWORK", pinErr: "كل كود خاصو 4 أرقام، وما يتعاودش" }
  };
  const t = k => (W[LG] || W.fr)[k] || W.fr[k] || k;
  const setLang = () => { document.documentElement.lang = LG; document.documentElement.dir = LG === "ar" ? "rtl" : "ltr"; };
  setLang();

  const fmt = n => { const v = (Math.round(n * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + (DEV || "DH"); return LG === "ar" ? "\u2066" + v + "\u2069" : v; };
  const heure = d => d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  const depuis = d => { if (!d) return ""; const m = Math.round((Date.now() - d) / 60000); return m < 1 ? t("instant") : m < 60 ? `${t("depuis")} ${m} ${t("min")}` : `${t("depuis")} ${Math.floor(m / 60)} h ${m % 60}`; };
  const toast = (txt, cls) => { const d = document.createElement("div"); d.className = "toast" + (cls ? " " + cls : ""); d.textContent = txt; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); };
  const COUL = ["#2f7bff", "#ff9f1c", "#1faa59", "#e14eca", "#00b3a4", "#ff5d5d", "#8b5cf6", "#f5b301"];
  const ICO = { nouvelle: "🔔", cuisine: "👨‍🍳", prete: "✅", payee: "💰", annulee: "✖" };

  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  // 📶 hors connexion : les commandes, tables et encaissements continuent et partent dès que l'internet revient
  try { db.enablePersistence && db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
  let user = null, admin = false, slug = (location.hash.match(/m=([a-z0-9-]+)/) || [])[1] || LS.get("slug", "");
  let C = {}, MENU = {}, DEV = "DH", ORD = [], vu = new Set(), premier = true, unsub = null, employe = null, vue = { k: "home" }, panier = {}, catSel = null;

  /* ---------- sons ---------- */
  let AC = null, sonOn = LS.get("son", true), bipT = null;
  function ton(freqs, vol) {
    if (!sonOn || !AC) return;
    try { freqs.forEach((f, i) => { const tt = i * .22, o = AC.createOscillator(), g = AC.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(.0001, AC.currentTime + tt); g.gain.exponentialRampToValueAtTime(vol || .5, AC.currentTime + tt + .02); g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + tt + .2); o.connect(g).connect(AC.destination); o.start(AC.currentTime + tt); o.stop(AC.currentTime + tt + .22); }); } catch (e) {}
  }
  const bip = () => ton([880, 1175, 1568]), bipPanne = () => ton([440, 330, 440, 330], .6);
  function alarme() {
    const n = ORD.filter(o => o.statut === "nouvelle").length;
    document.title = n ? `(${n}) 🔔 Caisse` : "Caisse NFCWORK";
    let a = document.querySelector(".alarm");
    if (n && employe) {
      if (!a) { a = document.createElement("button"); a.className = "alarm"; document.body.appendChild(a); a.onclick = () => go({ k: "ligne" }); }
      a.innerHTML = `<span class="big">🔔</span><span><b>${n}</b> ${t("nouv")}</span><span class="go">${t("voir")} ›</span>`;
      if (!bipT) { bip(); bipT = setInterval(bip, 5000); }
    } else { if (a) a.remove(); clearInterval(bipT); bipT = null; }
  }

  /* ---------- internet : bandeau rouge + son si coupé ---------- */
  let enLigne = navigator.onLine !== false, panneT = null;
  function setEtat(v) {
    if (v === enLigne) return majEtat();
    enLigne = v;
    if (!v) { panneT = setTimeout(bipPanne, 4000); } else { clearTimeout(panneT); toast(t("online"), "ok"); }
    majEtat();
  }
  function majEtat() {
    const d = document.getElementById("etat"); if (d) d.className = "dot" + (enLigne ? "" : " off");
    let b = document.querySelector(".panne");
    if (!enLigne) { if (!b) { b = document.createElement("div"); b.className = "panne"; document.body.appendChild(b); } b.innerHTML = `📵 ${esc(t("offline"))}`; }
    else if (b) b.remove();
  }
  window.addEventListener("offline", () => setEtat(false));
  window.addEventListener("online", () => setEtat(true));

  /* ---------- écran toujours allumé ---------- */
  async function eveil() { try { if ("wakeLock" in navigator && document.visibilityState === "visible") await navigator.wakeLock.request("screen"); } catch (e) {} }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") eveil(); });

  /* ---------- photos des produits (même format que le menu) ---------- */
  const IMGC = {};
  function photoUrl(id) {
    if (!id) return "";
    if (/^data:image\//.test(id)) return id;
    if (id.startsWith("u:")) return "https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=240&h=240&q=60";
    if (id.startsWith("/")) return id;
    if (IMGC[id] !== undefined) return IMGC[id];
    IMGC[id] = "";
    db.doc("settings/mimg-" + id).get().then(d => { IMGC[id] = d.exists ? d.data().data || "" : ""; document.querySelectorAll(`img[data-ph="${CSS.escape(id)}"]`).forEach(i => { i.src = IMGC[id]; i.hidden = !IMGC[id]; }); }).catch(() => {});
    return "";
  }
  const imgP = it => { const u = photoUrl(it.photo); return `<span class="pim">${it.photo ? `<img data-ph="${esc(it.photo)}" src="${esc(u)}" alt="" ${u ? "" : "hidden"} onerror="this.hidden=true">` : ""}<i>${esc(it.e || (tr(it.nom) || "?").trim().charAt(0).toUpperCase())}</i></span>`; };

  /* ---------- 🎨 aux couleurs du commerce : son logo et sa couleur (menu), NFCWORK reste discret ---------- */
  let LOGO = "";
  function logoUrl() {
    const id = C.logo || MENU.logo || "";
    if (!id) return Promise.resolve("");
    const u = photoUrl(id);
    if (u || !id || id.startsWith("u:") || id.startsWith("/")) return Promise.resolve(u);
    return db.doc("settings/mimg-" + id).get().then(d => (d.exists && d.data().data) || "").catch(() => "");
  }
  const hexRgb = h => { const m = String(h || "").match(/^#?([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, n >> 8 & 255, n & 255]; };
  const hex = c => "#" + c.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  function couleurLogo(url) {
    return new Promise(ok => {
      if (!url) return ok(null);
      const im = new Image(); im.crossOrigin = "anonymous";
      im.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = c.height = 40; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 40, 40);
          const d = g.getImageData(0, 0, 40, 40).data, B = {};
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3]; if (a < 128) continue;
            const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx < 50 || mx - mn < 40) continue;   // ni noir, ni blanc, ni gris
            const k = (r >> 4) + "," + (gg >> 4) + "," + (b >> 4); B[k] = B[k] || Object.assign([0, 0, 0, 0], { n: 0 }); B[k][0] += r; B[k][1] += gg; B[k][2] += b; B[k].n++; B[k][3] += 1 + (mx - mn) / 60;
          }
          const best = Object.values(B).sort((a, b) => b[3] - a[3])[0];
          ok(best ? hex([best[0], best[1], best[2]].map(v => v / best.n)) : null);
        } catch (e) { ok(null); }
      };
      im.onerror = () => ok(null); im.src = url;
    });
  }
  async function theme() {
    LOGO = await logoUrl();
    let col = /^#[0-9a-f]{6}$/i.test(C.couleur || "") ? C.couleur : /^#[0-9a-f]{6}$/i.test(MENU.couleur || "") ? MENU.couleur : await couleurLogo(LOGO);
    const rgb = hexRgb(col);
    if (rgb) {
      const lum = (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255;
      const R = document.documentElement.style;
      R.setProperty("--acc", col); R.setProperty("--acc2", hex(rgb.map(v => v + (255 - v) * .35))); R.setProperty("--accfg", lum > .55 ? "#141414" : "#fff");
      // fonds sombres teintés de la couleur du logo
      [["--bg", 7, "#05060a"], ["--bg2", 10, "#0a0c12"], ["--card", 13, "#10131b"], ["--card2", 18, "#161a24"], ["--line", 28, "#232836"]].forEach(([k, p, base]) => R.setProperty(k, `color-mix(in srgb, ${col} ${p}%, ${base})`));
      const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.content = "#07080c";
    }
    document.title = (MENU.nom || "Caisse") + " · Caisse";
    if (LOGO) { let l = document.querySelector('link[rel="icon"]'); if (l) l.href = LOGO; }
    if (!document.querySelector(".par")) { const a = document.createElement("a"); a.className = "par"; a.href = "https://nfcwork.ma"; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Caisse par nfcwork.ma"; document.body.appendChild(a); }
  }
  const logoTag = cls => LOGO ? `<img class="${cls || "blogo"}" src="${esc(LOGO)}" alt="">` : `<div style="font-size:56px">🧾</div>`;

  /* ---------- impression : ticket 58 ou 80 mm dans un cadre caché ---------- */
  function imprimer(html) {
    const larg = (C.ticket || {}).largeur || LS.get("larg", 80);
    let f = document.getElementById("printf");
    if (!f) { f = document.createElement("iframe"); f.id = "printf"; f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0"; document.body.appendChild(f); }
    const doc = f.contentWindow.document;
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${larg}mm auto;margin:3mm}body{margin:0;font-family:"Courier New",monospace;font-size:${larg < 70 ? 11 : 12.5}px;color:#000;width:${larg - 6}mm}
      h1{font-size:1.5em;text-align:center;margin:0 0 2px}h2{font-size:2.2em;text-align:center;margin:4px 0}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:6px}.r span:last-child{white-space:nowrap}
      hr{border:0;border-top:1px dashed #000;margin:5px 0}.b{font-weight:bold}.big{font-size:1.25em}.k .r{font-size:1.35em;font-weight:bold;margin:3px 0}.nt{border:1px solid #000;padding:3px;margin-top:4px}</style></head><body>${html}</body></html>`);
    doc.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast("Impression impossible sur cet appareil"); } }, 250);
  }
  const lignesT = items => items.map(i => `<div class="r"><span>${i.q} x ${esc(i.n)}</span><span>${fmt(i.q * num(i.p))}</span></div>`).join("");
  const modeTxt = o => o.mode === "livraison" ? "LIVRAISON" : o.mode === "emporter" ? "A EMPORTER" : o.mode === "chambre" ? (o.table || "CHAMBRE") : (o.table || "SUR PLACE");
  function ticket(orders, titre) {
    const T = C.ticket || {}, items = fusion(orders), tot = orders.reduce((a, o) => a + num(o.total), 0), o0 = orders[0] || {};
    return `${LOGO && T.logoTicket !== false ? `<div class="c"><img src="${esc(LOGO)}" style="max-height:60px;max-width:60%;filter:grayscale(1) contrast(1.3)"></div>` : ""}<h1>${esc(MENU.nom || "")}</h1>${T.entete ? `<div class="c">${esc(T.entete).replace(/\n/g, "<br>")}</div>` : ""}<hr>
      <div class="r"><span>${esc(titre || "TICKET")}</span><span>${new Date().toLocaleDateString("fr-FR")} ${heure(new Date())}</span></div>
      <div class="r b"><span>${esc(modeTxt(o0))}</span><span>N° ${orders.map(o => esc(o.num)).join(", ")}</span></div>${employe ? `<div>Serveur : ${esc(employe.nom)}</div>` : ""}<hr>
      ${lignesT(items)}${orders.some(o => num(o.frais)) ? `<div class="r"><span>Livraison</span><span>${fmt(orders.reduce((a, o) => a + num(o.frais), 0))}</span></div>` : ""}<hr>
      <div class="r b big"><span>TOTAL</span><span>${fmt(tot)}</span></div>${o0.paiement ? `<div class="r"><span>Paiement</span><span>${esc(o0.paiement)}</span></div>` : ""}
      ${o0.mode === "livraison" ? `<hr><div>${esc(o0.nom)} ${esc(o0.tel)}</div><div>${esc(o0.adresse)}</div>` : ""}
      ${orders.filter(o => o.note).map(o => `<div class="nt">${esc(o.note)}</div>`).join("")}<hr><div class="c">${esc(T.pied || "Merci de votre visite !")}</div><div class="c" style="font-size:.85em">nfcwork.ma</div>`;
  }
  const bonCuisine = o => `<div class="k"><h1>BON CUISINE</h1><h2>${esc(modeTxt(o))}</h2><div class="c">N° ${esc(o.num)} · ${heure(o.d || new Date())}${employe ? " · " + esc(employe.nom) : ""}</div><hr>
    ${(o.items || []).map(i => `<div class="r"><span>${i.q} x ${esc(i.n)}</span></div>`).join("")}${o.note ? `<div class="nt big">${esc(o.note)}</div>` : ""}<hr></div>`;
  function fusion(orders) { const m = {}; orders.forEach(o => (o.items || []).forEach(i => { const k = i.n + "|" + num(i.p); m[k] = m[k] || { n: i.n, p: num(i.p), q: 0 }; m[k].q += +i.q || 0; })); return Object.values(m); }

  /* ---------- connexion ---------- */
  auth.onAuthStateChanged(async u => {
    user = u;
    if (!u) return login();
    admin = !!window.ADMIN_EMAIL && u.email === window.ADMIN_EMAIL;
    if (!slug) return choisir();
    demarrer();
  });
  function login() {
    top.hidden = true;
    app.innerHTML = `<div class="center"><form class="pinbox" id="lf"><div style="font-size:52px">🧾</div><h2 style="margin:6px 0">Caisse NFCWORK</h2>
      <p class="mut" style="margin:0 0 6px">Connectez la caisse une seule fois avec le compte du commerce.<br>كونيكطي الكيسة مرة وحدة بالحساب ديال المحل.</p>
      <label class="field">E-mail<input id="le" type="email" autocomplete="username" required></label>
      <label class="field">Mot de passe · المودباس<input id="lp" type="password" autocomplete="current-password" required></label>
      <p class="err" id="lerr"></p><button class="btn p big" style="width:100%">Se connecter · دخول</button></form></div>`;
    document.getElementById("lf").onsubmit = async e => {
      e.preventDefault();
      try { await auth.signInWithEmailAndPassword(document.getElementById("le").value.trim(), document.getElementById("lp").value); }
      catch (x) { document.getElementById("lerr").textContent = "E-mail ou mot de passe incorrect · الإيميل ولا المودباس غالط"; }
    };
  }
  async function choisir() {
    let L = [];
    if (admin) { try { const d = await db.doc("settings/menus").get(); L = JSON.parse((d.data() || {}).json || "[]"); } catch (e) {} }
    app.innerHTML = `<div class="center"><div class="pinbox"><h2>Quelle caisse ?</h2>${L.length ? `<div class="who" style="flex-direction:column">${L.map(m => `<button class="btn" data-s="${esc(m.slug)}">${esc(m.nom || m.slug)}</button>`).join("")}</div>` : `<p class="mut">Ouvrez le lien de la caisse donné par NFCWORK (il se termine par #m=…).</p>`}
      <button class="btn sm" id="out" style="margin-top:10px">Changer de compte</button></div></div>`;
    app.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { slug = b.dataset.s; location.hash = "m=" + slug; demarrer(); });
    document.getElementById("out").onclick = () => auth.signOut();
  }
  async function demarrer() {
    LS.set("slug", slug);
    try {
      const [c, m] = await Promise.all([db.doc("caisses/" + slug).get(), db.doc("settings/menu-" + slug).get()]);
      C = c.exists ? c.data() : {};
      MENU = m.exists ? JSON.parse(m.data().json || "{}") : {};
      DEV = MENU.devise || "DH";
      await theme();
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="center"><div class="pinbox"><div style="font-size:48px">🔒</div><h2>Accès refusé</h2><p class="mut">Ce compte (${esc(user.email)}) n’est pas autorisé sur cette caisse. Demandez à NFCWORK de l’ajouter.</p><button class="btn" id="out">Changer de compte</button></div></div>`;
      document.getElementById("out").onclick = () => auth.signOut(); return;
    }
    ecouter();
    if (AC) pin(); else demarrage();
  }
  function demarrage() {
    top.hidden = true;
    app.innerHTML = `<div class="center"><div class="pinbox">${logoTag()}<h2 style="margin:8px 0 4px">${esc(MENU.nom || "Caisse")}</h2><p class="mut">${t("startTx")}</p>
      <button class="btn ok huge" id="go" style="width:100%;margin-top:12px">▶ ${t("start")}</button>
      <button class="btn sm" id="lg" style="margin-top:12px">🌐 ${t("lang")}</button></div></div>`;
    document.getElementById("go").onclick = () => { try { AC = new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) {} eveil(); pin(); };
    document.getElementById("lg").onclick = () => { LG = LG === "ar" ? "fr" : "ar"; LS.set("lg", LG); setLang(); demarrage(); };
  }

  /* ---------- employés : on touche son nom (pastille de couleur), puis son code ---------- */
  function pin(choisi) {
    const E = (C.employes || []).filter(e => e && e.nom && e.pin);
    if (!E.length) { employe = { nom: "Caisse" }; return go({ k: "home" }); }
    top.hidden = true;
    const qui = choisi != null ? E[choisi] : E.length === 1 ? E[0] : null;
    if (!qui) {
      app.innerHTML = `<div class="center"><div class="pinbox" style="width:min(640px,100%)">${LOGO ? logoTag() : ""}<h2 style="margin:0 0 4px">${esc(MENU.nom || "")}</h2><p class="mut" style="margin:0 0 14px;font-size:18px">👆 ${t("who")}</p>
        <div class="faces">${E.map((e, i) => `<button data-e="${i}"><span class="av" style="background:${COUL[i % COUL.length]}">${esc(e.nom.trim().charAt(0).toUpperCase())}</span><b>${esc(e.nom)}</b></button>`).join("")}</div>
        <button class="btn sm" id="lg" style="margin-top:14px">🌐 ${t("lang")}</button></div></div>`;
      app.querySelectorAll("[data-e]").forEach(b => b.onclick = () => pin(+b.dataset.e));
      document.getElementById("lg").onclick = () => { LG = LG === "ar" ? "fr" : "ar"; LS.set("lg", LG); setLang(); pin(); };
      return;
    }
    let code = "";
    const i = E.indexOf(qui);
    app.innerHTML = `<div class="center"><div class="pinbox"><span class="av big" style="background:${COUL[i % COUL.length]}">${esc(qui.nom.trim().charAt(0).toUpperCase())}</span><h2 style="margin:8px 0 0">${esc(qui.nom)}</h2><p class="mut" style="margin:4px 0 0">🔢 ${t("code")}</p>
      <div class="dots" id="pd">${"<i></i>".repeat(String(qui.pin).length)}</div><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, "✓"].map(k => `<button data-k="${k}">${k}</button>`).join("")}</div><p class="err" id="perr"></p>
      ${E.length > 1 ? `<button class="btn sm" id="bk">‹ ${t("retour")}</button>` : ""}</div></div>`;
    const maj = () => app.querySelectorAll("#pd i").forEach((x, n) => x.classList.toggle("f", n < code.length));
    const ok = () => { if (String(qui.pin) === code) { employe = qui; go({ k: "home" }); } else { code = ""; maj(); document.getElementById("perr").textContent = "❌ " + t("wrong"); bipPanne(); } };
    app.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const k = b.dataset.k; if (k === "⌫") code = code.slice(0, -1); else if (k === "✓") return ok(); else if (code.length < 6) code += k; maj(); if (code.length === String(qui.pin).length) ok(); });
    const bk = document.getElementById("bk"); if (bk) bk.onclick = () => pin();
  }

  /* ---------- commandes de la journée, en direct ---------- */
  // journée de travail : depuis 5 h du matin (après minuit, on garde la veille) → peu de lectures Firebase
  const debutJour = () => { const d = new Date(); if (d.getHours() < 5) d.setDate(d.getDate() - 1); d.setHours(5, 0, 0, 0); return d; };
  function ecouter() {
    if (unsub) unsub();
    unsub = db.collection("commandes").doc(slug).collection("liste").where("cree", ">=", debutJour()).orderBy("cree", "desc").limit(500).onSnapshot({ includeMetadataChanges: true }, s => {
      if (s.metadata && navigator.onLine !== false) setEtat(!s.metadata.fromCache || enLigne);
      const d0 = debutJour();
      ORD = s.docs.map(x => { const o = x.data(); o.id = x.id; o.d = o.cree && o.cree.toDate ? o.cree.toDate() : new Date(); o.items = o.items || []; return o; }).filter(o => o.d >= d0);
      const nouv = ORD.filter(o => o.statut === "nouvelle" && !vu.has(o.id));
      if (!premier && nouv.length && LS.get("auto", false)) nouv.forEach(o => imprimer(bonCuisine(o)));
      ORD.forEach(o => vu.add(o.id)); premier = false;
      alarme(); rendre();
    }, e => { console.error(e); setEtat(false); });
  }
  const ouvertes = () => ORD.filter(o => o.statut !== "payee" && o.statut !== "annulee");
  const numTable = tb => { const m = String(tb || "").match(/(\d+)/); return m ? +m[1] : 0; };
  const deTable = (o, n) => (o.mode === "place" || o.mode === "chambre") && numTable(o.table) === n;
  function maj(o, data) { return db.collection("commandes").doc(slug).collection("liste").doc(o.id).update(Object.assign({ maj: firebase.firestore.FieldValue.serverTimestamp() }, data)).catch(e => { console.error(e); toast("⚠️ " + e.message); }); }

  /* ---------- navigation ---------- */
  function go(v) { vue = v; panier = {}; rendre(); window.scrollTo(0, 0); }
  function barre() {
    top.hidden = false;
    const i = Math.max(0, (C.employes || []).findIndex(e => employe && e.nom === employe.nom));
    top.innerHTML = `<button class="nm" id="bh">${LOGO ? `<img src="${esc(LOGO)}" alt="">` : "<span>🏠</span>"}<span class="tx">${esc(MENU.nom || "Caisse")}</span></button><span class="sp"></span>
      <span class="chip"><i class="dot${enLigne ? "" : " off"}" id="etat"></i></span>
      <button class="chip${sonOn ? " on" : ""}" id="bs" aria-label="son">${sonOn ? "🔊" : "🔇"}</button>
      <button class="chip" id="blg">🌐</button><button class="chip" id="bset" aria-label="${t("reglages")}">⚙️</button>
      <button class="chip emp" id="bemp"><span class="av sm" style="background:${COUL[i % COUL.length]}">${esc((employe.nom || "?").charAt(0).toUpperCase())}</span><span class="tx">${esc(employe.nom)}</span></button>`;
    document.getElementById("bh").onclick = () => go({ k: "home" });
    document.getElementById("bs").onclick = () => { sonOn = !sonOn; LS.set("son", sonOn); if (sonOn) bip(); barre(); };
    document.getElementById("blg").onclick = () => { LG = LG === "ar" ? "fr" : "ar"; LS.set("lg", LG); setLang(); rendre(); alarme(); majEtat(); };
    document.getElementById("bemp").onclick = () => { employe = null; alarme(); pin(); };
    document.getElementById("bset").onclick = reglages;
  }
  function rendre() {
    if (!employe) return;
    barre();
    if (vue.k === "home") return accueil();
    if (vue.k === "tables") return tables();
    if (vue.k === "ligne") return enligne();
    if (vue.k === "table") return table();
    if (vue.k === "nouvelle") return nouvelleCmd();
    if (vue.k === "histo") return historique();
  }
  const retour = (k, lab) => `<button class="btn back" data-ret="${k}">${LG === "ar" ? "›" : "‹"} ${lab || t("retour")}</button>`;
  const brancherRetour = () => app.querySelectorAll("[data-ret]").forEach(b => b.onclick = () => go({ k: b.dataset.ret }));

  function accueil() {
    const O = ouvertes(), nNew = O.filter(o => o.statut === "nouvelle").length;
    const occ = new Set(O.filter(o => o.mode === "place" && numTable(o.table)).map(o => numTable(o.table))).size;
    const pay = ORD.filter(o => o.statut === "payee"), ca = pay.reduce((a, o) => a + num(o.total), 0);
    app.innerHTML = `<h1>${t("hello")} ${esc(employe.nom)} 👋</h1><p class="mut" style="margin:0;font-size:18px">${t("what")}</p>
      <div class="tiles">
        <button class="tile c1${O.some(o => o.statut === "nouvelle" && o.mode === "place" && numTable(o.table)) ? " alert" : ""}" data-go="tables"><span class="ic">🍽</span><b>${t("place")}</b><small>🪑 ${occ} ${t("occ")}</small></button>
        <button class="tile c2" data-go="emporter"><span class="ic">🥡</span><b>${t("emporter")}</b><small>➕</small></button>
        <button class="tile c3" data-go="livraison"><span class="ic">🛵</span><b>${t("livraison")}</b><small>➕</small></button>
        <button class="tile c0" data-go="histo"><span class="ic">📊</span><b>${t("histo")}</b><small>${t("histoTx")}</small></button>
        <button class="tile c4${nNew ? " alert" : ""}" data-go="ligne">${nNew ? `<span class="bdg">${nNew}</span>` : ""}<span class="ic">📲</span><b>${t("commandes")}</b><small>🔔 ${nNew} · 👨‍🍳 ${O.filter(o => o.statut === "cuisine").length} · ✅ ${O.filter(o => o.statut === "prete").length}</small></button>
      </div>
      <div class="stats"><div>💰 <span class="mut">${t("encaisse")}</span><b>${fmt(ca)}</b></div><div>🧾 <span class="mut">${t("payees")}</span><b>${pay.length}</b></div><div>⏳ <span class="mut">${t("encours")}</span><b>${O.length}</b></div></div>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { const g = b.dataset.go; if (g === "emporter" || g === "livraison") go({ k: "nouvelle", mode: g }); else if (g === "histo") patron(() => go({ k: "histo", per: "jour" })); else go({ k: g }); });
  }

  function tables() {
    const N = Math.max(1, Math.min(80, +C.tables || 12)), O = ouvertes();
    app.innerHTML = `${retour("home")}<h1>🍽 ${t("choisir")}</h1>
      <div class="leg"><span><i style="background:#3a4a74"></i>${t("libre")}</span><span><i style="background:var(--warn)"></i>${t("nouvelle")}</span><span><i style="background:var(--acc)"></i>${t("cuisine")}</span><span><i style="background:var(--ok)"></i>${t("prete")}</span></div>
      <div class="tables">${Array.from({ length: N }, (_, i) => i + 1).map(n => {
        const os = O.filter(o => deTable(o, n)), tt = os.reduce((a, o) => a + num(o.total), 0);
        const st = os.some(o => o.statut === "nouvelle") ? "new" : os.some(o => o.statut === "prete") ? "rdy" : os.length ? "occ" : "";
        return `<button class="tb ${st}" data-t="${n}"><span class="n">${n}</span><span class="ic">${st === "new" ? "🔔" : st === "rdy" ? "✅" : st === "occ" ? "👨‍🍳" : "🪑"}</span>${os.length ? `<span class="t">${fmt(tt)}</span>` : `<small>${t("libre")}</small>`}</button>`; }).join("")}</div>`;
    brancherRetour();
    app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => go({ k: "table", table: +b.dataset.t }));
  }

  /* ---------- carte d'une commande : un gros bouton selon l'étape ---------- */
  function carte(o) {
    const mode = o.mode === "livraison" ? "🛵 " + t("livraison") : o.mode === "emporter" ? "🥡 " + t("emporter") : "🍽 " + esc(o.table || t("place"));
    const gros = o.statut === "nouvelle" ? `<button class="btn w big" data-a="lancer" data-o="${o.id}">👨‍🍳 ${t("lancer")}</button>`
      : o.statut === "cuisine" ? `<button class="btn ok big" data-a="prete" data-o="${o.id}">✅ ${t("pret")}</button>`
      : o.statut === "prete" ? `<button class="btn p big" data-a="encaisser" data-o="${o.id}">💰 ${t("encaisser")} ${fmt(num(o.total))}</button>` : "";
    return `<div class="oc ${esc(o.statut)}"><div class="h"><span class="st ${esc(o.statut)}">${ICO[o.statut] || ""} ${t(o.statut)}</span><b class="nb">N° ${esc(o.num)}</b></div>
      <div class="meta">${mode} · ${o.source === "menu" ? "📲 " + t("menuQR") : "👤 " + esc(o.employe || "")} · 🕒 ${heure(o.d)} (${depuis(o.d)})</div>
      ${o.items.map(i => `<div class="ln"><span><b class="q">${i.q}×</b> ${esc(i.n)}</span><b>${fmt(i.q * num(i.p))}</b></div>`).join("")}
      ${num(o.frais) ? `<div class="ln"><span>🛵 ${t("livr")}</span><b>${fmt(num(o.frais))}</b></div>` : ""}
      <div class="ln tot2"><span>${t("total")}</span><b>${fmt(num(o.total))}</b></div>
      ${o.note ? `<div class="note">📝 ${esc(o.note)}</div>` : ""}
      ${o.nom || o.tel || o.adresse ? `<div class="cli">${o.nom ? "👤 " + esc(o.nom) + " " : ""}${o.tel ? `📞 <a href="tel:${esc(o.tel)}">${esc(o.tel)}</a>` : ""}${o.adresse ? "<br>📍 " + esc(o.adresse) : ""}${o.pos ? ` · <a href="${esc(o.pos)}" target="_blank" rel="noopener">🗺 Maps</a>` : ""}</div>` : ""}
      ${o.statut !== "payee" && o.statut !== "annulee" ? `<div class="acts">${gros}<span class="sp2"></span><button class="btn icon" data-a="bon" data-o="${o.id}" title="${t("bon")}">🖨</button><button class="btn icon" data-a="ticket" data-o="${o.id}" title="${t("ticket")}">🧾</button>${o.statut !== "prete" ? `<button class="btn icon" data-a="encaisser" data-o="${o.id}" title="${t("encaisser")}">💰</button>` : ""}<button class="btn icon bad" data-a="annuler" data-o="${o.id}" title="${t("annuler")}">✖</button></div>` : ""}</div>`;
  }
  function brancher(root) {
    root.querySelectorAll("[data-a]").forEach(b => b.onclick = e => {
      e.stopPropagation();
      const o = ORD.find(x => x.id === b.dataset.o); if (!o) return;
      const a = b.dataset.a;
      if (a === "lancer") lancer([o]);
      if (a === "prete") maj(o, { statut: "prete" });
      if (a === "bon") imprimer(bonCuisine(o));
      if (a === "ticket") imprimer(ticket([o]));
      if (a === "encaisser") encaisser([o]);
      if (a === "annuler") confirmer("✖ " + t("annulerQ") + ` (N° ${o.num})`, () => maj(o, { statut: "annulee", employe: employe.nom }));
    });
  }
  function lancer(os) { os.forEach(o => { maj(o, { statut: "cuisine", employe: o.employe || employe.nom }); if (LS.get("bon", true)) imprimer(bonCuisine(o)); }); toast("👨‍🍳 " + t("envoyee"), "ok"); }

  function enligne() {
    const O = ouvertes();
    const col = (st, c) => { const L = O.filter(o => o.statut === st); return `<div class="col"><h3 class="${c}">${ICO[st]} ${t(st)} <span>${L.length}</span></h3>${L.length ? L.map(carte).join("") : `<div class="empty">${t("aucune")}</div>`}</div>`; };
    app.innerHTML = `${retour("home")}<h1>📲 ${t("commandes")}</h1><div class="cols">${col("nouvelle", "c2")}${col("cuisine", "c1")}${col("prete", "c3")}</div>`;
    brancherRetour(); brancher(app);
  }

  /* ---------- une table : ce qui est commandé + gros boutons ---------- */
  function table() {
    const n = vue.table, os = ouvertes().filter(o => deTable(o, n)), tot = os.reduce((a, o) => a + num(o.total), 0), nouv = os.filter(o => o.statut === "nouvelle");
    app.innerHTML = `${retour("tables", t("tables"))}<div class="thead"><span class="tnum">${n}</span><div><h1 style="margin:0">${t("tableW")} ${n}</h1><p class="mut" style="margin:0">${os.length ? `🧾 × ${os.length}` : t("vide")}</p></div><span class="sp"></span>${os.length ? `<b class="tbig">${fmt(tot)}</b>` : ""}</div>
      <div class="bigacts">
        <button class="act c1" data-add>➕<b>${t("ajouter")}</b></button>
        ${nouv.length ? `<button class="act c2 alert" data-lt>👨‍🍳<b>${t("lancerTout")}</b></button>` : ""}
        ${os.length ? `<button class="act c3" data-pay>💰<b>${t("encaisser")} ${fmt(tot)}</b></button><button class="act c0" data-tt>🧾<b>${t("ticket")}</b></button>` : ""}
      </div>
      <div class="grid2">${os.map(carte).join("")}</div>`;
    brancherRetour(); brancher(app);
    app.querySelector("[data-add]").onclick = () => go({ k: "nouvelle", mode: "place", table: n });
    const lt = app.querySelector("[data-lt]"); if (lt) lt.onclick = () => lancer(nouv);
    const pb = app.querySelector("[data-pay]"); if (pb) pb.onclick = () => encaisser(os, `Table ${n}`);
    const tt = app.querySelector("[data-tt]"); if (tt) tt.onclick = () => imprimer(ticket(os, `TABLE ${n}`));
  }

  /* ---------- prendre une commande : photos des produits, gros boutons ---------- */
  function nouvelleCmd() {
    const v = vue, cats = (MENU.categories || []).filter(c => (c.items || []).length), tous = cats.flatMap(c => c.items);
    if (!catSel || !cats.some(c => c.id === catSel)) catSel = cats[0] && cats[0].id;
    const items = Object.entries(panier).map(([id, q]) => { const it = tous.find(x => x.id === id); return it ? { id, n: tr(it.nom), q, p: num(it.prix), it } : null; }).filter(Boolean);
    const tp = items.reduce((a, i) => a + i.q * i.p, 0), nb = items.reduce((a, i) => a + i.q, 0);
    const titre = v.mode === "place" ? `🍽 ${t("tableW")} ${v.table}` : v.mode === "livraison" ? `🛵 ${t("livraison")}` : `🥡 ${t("emporter")}`;
    app.innerHTML = `${retour(v.mode === "place" ? "table" : "home")}<h1>${titre}</h1>
      <div class="order">
        <div class="pick panel"><div class="cats">${cats.map(c => `<button data-c="${esc(c.id)}" aria-pressed="${c.id === catSel}">${esc(tr(c.nom))}</button>`).join("")}</div>
          <div class="prods">${((cats.find(c => c.id === catSel) || {}).items || []).map(it => `<button class="pr${panier[it.id] ? " in" : ""}" data-add="${esc(it.id)}">${imgP(it)}<b>${esc(tr(it.nom))}</b><span>${num(it.prix) ? fmt(num(it.prix)) : ""}</span>${panier[it.id] ? `<em>${panier[it.id]}</em>` : ""}</button>`).join("") || `<div class="empty">—</div>`}</div></div>
        <div class="cart panel"><h2>🧾 ${t("panier")} ${nb ? `<span class="bdg2">${nb}</span>` : ""}</h2>
          ${v.mode === "livraison" ? `<label class="field">📞 ${t("tel")}<input id="ct" type="tel" inputmode="tel" value="${esc(v.tel || "")}"></label><label class="field">👤 ${t("nom")}<input id="cn" value="${esc(v.nom || "")}"></label><label class="field">📍 ${t("adresse")}<input id="ca" value="${esc(v.adresse || "")}"></label>` : ""}
          ${items.length ? items.map(i => `<div class="cl">${imgP(i.it)}<span class="nn">${esc(i.n)}<small>${fmt(i.p)}</small></span><span class="q"><button data-m="${esc(i.id)}">−</button><b>${i.q}</b><button data-p="${esc(i.id)}">+</button></span></div>`).join("") : `<div class="empty">👆 ${t("touch")}</div>`}
          <label class="field">📝 ${t("note")}<input id="cnote" value="${esc(v.note || "")}" maxlength="200"></label>
          <div class="tot"><span>${t("total")}</span><span>${fmt(tp)}</span></div>
          <button class="btn w huge" data-send ${items.length ? "" : "disabled"} style="width:100%">👨‍🍳 ${t("lancer")}</button>
          ${v.mode !== "place" ? `<button class="btn ok big" data-sendpay ${items.length ? "" : "disabled"} style="width:100%;margin-top:8px">💰 ${t("encaisser")}</button>` : ""}</div>
      </div>`;
    const garder = () => { [["cn", "nom"], ["ct", "tel"], ["ca", "adresse"], ["cnote", "note"]].forEach(([id, k]) => { const el = document.getElementById(id); if (el) v[k] = el.value; }); };
    app.querySelectorAll("[data-ret]").forEach(b => b.onclick = () => go(b.dataset.ret === "table" ? { k: "table", table: v.table } : { k: "home" }));
    app.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { garder(); catSel = b.dataset.c; nouvelleCmd(); });
    app.querySelectorAll("[data-add],[data-p]").forEach(b => b.onclick = () => { garder(); const id = b.dataset.add || b.dataset.p; panier[id] = (panier[id] || 0) + 1; ton([1320], .15); nouvelleCmd(); });
    app.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { garder(); const id = b.dataset.m; panier[id] = (panier[id] || 0) - 1; if (panier[id] <= 0) delete panier[id]; nouvelleCmd(); });
    const creer = payer => {
      garder();
      if (v.mode === "livraison" && !String(v.tel || "").trim()) { toast("📞 " + t("telReq")); const el = document.getElementById("ct"); if (el) el.focus(); return; }
      const o = { statut: "cuisine", source: "caisse", num: String(Date.now() % 10000).padStart(4, "0"), cree: new Date(),
        mode: v.mode, table: v.mode === "place" ? "Table " + v.table : "", nom: v.nom || "", tel: v.tel || "", adresse: v.adresse || "", pos: "", note: v.note || "",
        items: items.map(i => ({ id: i.id, n: i.n, q: i.q, p: i.p })), total: Math.round(tp * 100) / 100, frais: 0, devise: DEV, employe: employe.nom };
      const ref = db.collection("commandes").doc(slug).collection("liste").doc();
      ref.set(o).catch(e => { console.error(e); toast("⚠️ " + e.message); });   // hors connexion : enregistré ici et envoyé quand l'internet revient
      const loc = Object.assign({}, o, { id: ref.id, d: new Date() });
      if (LS.get("bon", true)) imprimer(bonCuisine(loc));
      toast("👨‍🍳 " + t("envoyee"), "ok");
      panier = {};
      if (payer) encaisser([loc]); else go(v.mode === "place" ? { k: "table", table: v.table } : { k: "ligne" });
    };
    app.querySelector("[data-send]").onclick = () => creer(false);
    const s2 = app.querySelector("[data-sendpay]"); if (s2) s2.onclick = () => creer(true);
  }

  /* ---------- 📊 historique pour le patron : ventes, produits, serveurs, tickets ---------- */
  let patronOk = 0;
  function patron(fn) {
    const P = String(C.pinPatron || "");
    if (!P || Date.now() - patronOk < 10 * 60000) return fn();
    let code = "";
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box" style="text-align:center;width:min(380px,100%)"><div style="font-size:44px">🔐</div><h2>${t("patron")}</h2><div class="dots" id="xd">${"<i></i>".repeat(P.length)}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "✖", 0, "⌫"].map(k => `<button data-k="${k}">${k}</button>`).join("")}</div><p class="err" id="xe"></p></div>`;
    document.body.appendChild(d);
    const maj = () => d.querySelectorAll("#xd i").forEach((x, n) => x.classList.toggle("f", n < code.length));
    d.querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === "✖") return d.remove();
      if (k === "⌫") code = code.slice(0, -1); else code += k;
      maj();
      if (code.length === P.length) { if (code === P) { patronOk = Date.now(); d.remove(); fn(); } else { code = ""; maj(); d.querySelector("#xe").textContent = "❌ " + t("wrong"); bipPanne(); } }
    });
  }
  function periode(k) {
    const d0 = debutJour(), j = 864e5;
    if (k === "jour") return [d0, new Date(+d0 + j)];
    if (k === "hier") return [new Date(+d0 - j), d0];
    if (k === "j7") return [new Date(+d0 - 6 * j), new Date(+d0 + j)];
    const m = new Date(d0); m.setDate(1);
    if (k === "mois") return [m, new Date(+d0 + j)];
    const p = new Date(m); p.setMonth(p.getMonth() - 1);
    return [p, m];
  }
  let HCACHE = {};
  async function historique() {
    const k = vue.per || "jour", [d1, d2] = periode(k);
    const onglets = ["jour", "hier", "j7", "mois", "moisP"].map(x => `<button data-per="${x}" aria-pressed="${x === k}">${t(x)}</button>`).join("");
    app.innerHTML = `${retour("home")}<h1>📊 ${t("histo")}</h1><div class="cats" style="margin:8px 0 14px">${onglets}</div><div id="hz"><div class="empty">⏳ ${t("chargement")}</div></div>`;
    brancherRetour();
    app.querySelectorAll("[data-per]").forEach(b => b.onclick = () => go({ k: "histo", per: b.dataset.per }));
    let L;
    try {
      if (k === "jour") L = ORD.slice();
      else {
        const cle = k + "|" + d1.toISOString();
        if (!HCACHE[cle]) {
          const s = await db.collection("commandes").doc(slug).collection("liste").where("cree", ">=", d1).where("cree", "<", d2).orderBy("cree", "desc").limit(5000).get();
          HCACHE[cle] = s.docs.map(x => { const o = x.data(); o.id = x.id; o.d = o.cree && o.cree.toDate ? o.cree.toDate() : null; o.items = o.items || []; return o; });
        }
        L = HCACHE[cle];
      }
    } catch (e) { console.error(e); document.getElementById("hz").innerHTML = `<div class="empty">⚠️ ${esc(e.message)}</div>`; return; }
    if (vue.k !== "histo" || (vue.per || "jour") !== k) return;
    L = L.filter(o => !o.d || (o.d >= d1 && o.d < d2)).sort((a, b) => (b.d || 0) - (a.d || 0));
    const P = L.filter(o => o.statut === "payee"), ca = P.reduce((a, o) => a + num(o.total), 0);
    const esp = P.filter(o => o.paiement !== "Carte").reduce((a, o) => a + num(o.total), 0), crt = ca - esp;
    const prods = {}; P.forEach(o => o.items.forEach(i => { const c = i.n; prods[c] = prods[c] || { n: c, q: 0, m: 0 }; prods[c].q += +i.q || 0; prods[c].m += (+i.q || 0) * num(i.p); }));
    const PR = Object.values(prods).sort((a, b) => b.q - a.q), maxQ = PR.length ? PR[0].q : 1;
    const serv = {}; P.forEach(o => { const s = o.employe || (o.source === "menu" ? t("menuQR") : "—"); serv[s] = serv[s] || { n: s, c: 0, m: 0 }; serv[s].c++; serv[s].m += num(o.total); });
    const jours = {}; P.forEach(o => { const j = o.d ? o.d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }) : "—"; jours[j] = (jours[j] || 0) + num(o.total); });
    const JR = Object.entries(jours).reverse(), maxJ = Math.max(1, ...JR.map(x => x[1]));
    const ann = L.filter(o => o.statut === "annulee").length;
    document.getElementById("hz").innerHTML = `
      <div class="kpis"><div class="k1">💰<span>${t("ca")}</span><b>${fmt(ca)}</b></div><div>🧾<span>${t("tickets")}</span><b>${P.length}</b></div><div>➗<span>${t("moyen")}</span><b>${fmt(P.length ? ca / P.length : 0)}</b></div><div>💵<span>${t("especes")}</span><b>${fmt(esp)}</b></div><div>💳<span>${t("carte")}</span><b>${fmt(crt)}</b></div>${ann ? `<div>✖<span>${t("annulees")}</span><b>${ann}</b></div>` : ""}</div>
      <div class="acts" style="margin:4px 0 14px"><button class="btn p" id="hp">🖨 ${t("rapport")}</button><button class="btn" id="hc">⬇️ ${t("csv")}</button><span class="sp2"></span>${C.autonome ? `<button class="btn" id="hg">⚙️ ${t("gerer")}</button>` : `<a class="btn sm" href="https://wa.me/212620666027?text=${encodeURIComponent("Bonjour NFCWORK, je voudrais une modification sur la caisse de " + (MENU.nom || slug))}" target="_blank" rel="noopener" title="${esc(t("contact"))}">💬 ${t("contact")}</a>`}</div>
      <div class="hgrid">
        <div class="panel"><h2>🍽 ${t("produits")}</h2>${PR.length ? PR.map(p => `<div class="hb"><span class="hn">${esc(p.n)}</span><span class="bar"><i style="width:${Math.max(4, p.q / maxQ * 100)}%"></i></span><b class="hq">${p.q}</b><span class="hm">${fmt(p.m)}</span></div>`).join("") : `<div class="empty">${t("aucune")}</div>`}</div>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="panel"><h2>👤 ${t("serveurs")}</h2>${Object.values(serv).sort((a, b) => b.m - a.m).map(s => `<div class="hb"><span class="hn">${esc(s.n)}</span><b class="hq">${s.c} 🧾</b><span class="hm">${fmt(s.m)}</span></div>`).join("") || `<div class="empty">${t("aucune")}</div>`}</div>
          ${JR.length > 1 ? `<div class="panel"><h2>📅 ${t("parJour")}</h2>${JR.map(([j, v]) => `<div class="hb"><span class="hn">${esc(j)}</span><span class="bar"><i style="width:${Math.max(4, v / maxJ * 100)}%"></i></span><span class="hm">${fmt(v)}</span></div>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="panel" style="margin-top:16px"><h2>🧾 ${t("liste")} <span class="mut">(${L.length})</span></h2><div class="tl">${L.map(o => `<button class="tr2 ${esc(o.statut)}" data-tk="${o.id}"><span>${o.d ? o.d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + heure(o.d) : ""}</span><span>N° ${esc(o.num)}</span><span>${o.mode === "livraison" ? "🛵" : o.mode === "emporter" ? "🥡" : "🍽 " + esc(o.table || "")}</span><span>${esc(o.employe || (o.source === "menu" ? "📲" : ""))}</span><span>${o.statut === "payee" ? (o.paiement === "Carte" ? "💳" : "💵") : ICO[o.statut] || ""}</span><b>${fmt(num(o.total))}</b></button>`).join("") || `<div class="empty">${t("aucune")}</div>`}</div></div>`;
    const hg = document.getElementById("hg"); if (hg) hg.onclick = gerer;
    document.querySelectorAll("[data-tk]").forEach(b => b.onclick = () => { const o = L.find(x => x.id === b.dataset.tk); if (o) imprimer(ticket([o], "DUPLICATA")); });
    document.getElementById("hp").onclick = () => imprimer(`<h1>${esc(MENU.nom || "")}</h1><div class="c b">RAPPORT · ${esc(t(k).toUpperCase())}</div><div class="c">${d1.toLocaleDateString("fr-FR")} → ${new Date(+d2 - 1).toLocaleDateString("fr-FR")}</div><hr>
      <div class="r b big"><span>TOTAL</span><span>${fmt(ca)}</span></div><div class="r"><span>Tickets</span><span>${P.length}</span></div><div class="r"><span>Espèces</span><span>${fmt(esp)}</span></div><div class="r"><span>Carte</span><span>${fmt(crt)}</span></div>${ann ? `<div class="r"><span>Annulées</span><span>${ann}</span></div>` : ""}<hr>
      <div class="b">PRODUITS</div>${PR.map(p => `<div class="r"><span>${p.q} x ${esc(p.n)}</span><span>${fmt(p.m)}</span></div>`).join("")}<hr>
      <div class="b">SERVEURS</div>${Object.values(serv).map(s => `<div class="r"><span>${esc(s.n)} (${s.c})</span><span>${fmt(s.m)}</span></div>`).join("")}<hr><div class="c">Imprimé le ${new Date().toLocaleString("fr-FR")}</div>`);
    document.getElementById("hc").onclick = () => {
      const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      const rows = [["Date", "Heure", "N°", "Mode", "Table", "Serveur", "Statut", "Paiement", "Produits", "Total"]].concat(L.map(o => [o.d ? o.d.toLocaleDateString("fr-FR") : "", heure(o.d), o.num, o.mode, o.table, o.employe || o.source, o.statut, o.paiement || "", o.items.map(i => i.q + " x " + i.n).join(" | "), String(num(o.total)).replace(".", ",")]));
      const blob = new Blob(["\ufeff" + rows.map(r => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ventes-${slug}-${k}-${d1.toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
    };
  }

  /* ---------- ⚙️ le patron gère lui-même (seulement si NFCWORK l'a autorisé : caisses/<slug>.autonome) ---------- */
  function gerer() {
    let E = (C.employes || []).map(e => ({ nom: e.nom, pin: String(e.pin) }));
    const d = document.createElement("div"); d.className = "modal";
    const dessiner = () => {
      d.innerHTML = `<div class="box"><h2>⚙️ ${t("gerer")}</h2><h3 style="margin:6px 0">👥 ${t("equipe")}</h3>
        <div style="display:grid;gap:8px">${E.map((e, i) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) 110px 48px;gap:8px"><input class="gi" data-n="${i}" value="${esc(e.nom)}" placeholder="${t("nom")}" maxlength="30"><input class="gi" data-p="${i}" value="${esc(e.pin)}" inputmode="numeric" maxlength="4" placeholder="PIN"><button class="btn icon bad" data-x="${i}">✖</button></div>`).join("")}</div>
        <button class="btn sm" id="ga" style="margin-top:8px">➕ ${t("ajouterS")}</button>
        <label class="field">🔐 ${t("patron")}<input id="gp" inputmode="numeric" maxlength="4" value="${esc(C.pinPatron || "")}"></label>
        <label class="field">🪑 ${t("nbTables")}<input id="gt" type="number" min="1" max="80" value="${esc(C.tables || 12)}"></label>
        <label class="field">🧾 ${t("entete")}<input id="gh" maxlength="200" value="${esc((C.ticket || {}).entete || "")}"></label>
        <p class="err" id="ge"></p><div class="acts"><button class="btn ok big" id="gs" style="flex:1">✔ ${t("sauver")}</button><button class="btn big" id="gx">${t("fermer")}</button></div></div>`;
      const garder = () => d.querySelectorAll("[data-n]").forEach(x => { const i = +x.dataset.n; E[i].nom = x.value.trim(); E[i].pin = d.querySelector(`[data-p="${i}"]`).value.trim(); });
      d.querySelector("#ga").onclick = () => { garder(); E.push({ nom: "", pin: "" }); dessiner(); };
      d.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { garder(); E.splice(+b.dataset.x, 1); dessiner(); });
      d.querySelector("#gx").onclick = () => d.remove();
      d.querySelector("#gs").onclick = async () => {
        garder();
        const L = E.filter(e => e.nom || e.pin), pp = d.querySelector("#gp").value.trim();
        if (L.some(e => !e.nom || !/^\d{4}$/.test(e.pin)) || new Set(L.map(e => e.pin)).size !== L.length || (pp && !/^\d{4}$/.test(pp))) { d.querySelector("#ge").textContent = "❌ " + t("pinErr"); return; }
        const up = { employes: L, pinPatron: pp, tables: Math.max(1, Math.min(80, +d.querySelector("#gt").value || 12)), ticket: Object.assign({}, C.ticket, { entete: d.querySelector("#gh").value.trim() }), maj: firebase.firestore.FieldValue.serverTimestamp() };
        try { await db.doc("caisses/" + slug).update(up); Object.assign(C, up); d.remove(); toast("✔ " + t("sauver"), "ok"); rendre(); }
        catch (e) { console.error(e); d.querySelector("#ge").textContent = "⚠️ " + e.message; }
      };
    };
    dessiner(); document.body.appendChild(d);
  }

  /* ---------- encaisser : billets marocains, rendu en grand ---------- */
  function encaisser(orders, titre) {
    const tot = orders.reduce((a, o) => a + num(o.total), 0);
    let mode = "Espèces", recu = 0;
    const d = document.createElement("div"); d.className = "modal";
    const blocRendu = () => { const diff = recu - tot; return recu ? `<div class="rendu ${diff >= 0 ? "ok" : "ko"}">${diff >= 0 ? `↩️ ${t("rendre")} : <b>${fmt(diff)}</b>` : `⚠️ ${t("manque")} : <b>${fmt(-diff)}</b>`}</div>` : ""; };
    const dessiner = (focus) => {
      d.innerHTML = `<div class="box pay"><h2>💰 ${t("encaisser")}${titre ? " · " + esc(titre) : ""}</h2><div class="bigtot">${fmt(tot)}</div>
        <div class="pm"><button data-pm="Espèces" aria-pressed="${mode === "Espèces"}">💵<b>${t("especes")}</b></button><button data-pm="Carte" aria-pressed="${mode === "Carte"}">💳<b>${t("carte")}</b></button></div>
        ${mode === "Espèces" ? `<p class="mut" style="margin:6px 0">${t("donne")} :</p>
          <div class="bills">${[[20, "#8b5cf6"], [50, "#1faa59"], [100, "#b7791f"], [200, "#2f7bff"]].map(([b, c]) => `<button data-b="${b}" style="--b:${c}">${b}</button>`).join("")}<button data-b="ex" class="ex">${t("exact")}</button></div>
          <div class="recu"><span class="ri">💵<input id="recu" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${recu || ""}" aria-label="${t("donne")}"><em>${esc(DEV)}</em></span>${recu ? `<button data-b="0" class="btn sm">${t("effacer")}</button>` : ""}</div>
          <div id="rendu">${blocRendu()}</div>` : ""}
        <label class="chk"><input type="checkbox" id="pt" ${LS.get("ticketPay", true) ? "checked" : ""}> 🧾 ${t("ticket")}</label>
        <button class="btn ok huge" id="pok" style="width:100%" ${mode === "Espèces" && recu && recu < tot ? "disabled" : ""}>✔ ${t("valider")}</button>
        <button class="btn" id="px" style="width:100%;margin-top:8px">${t("fermer")}</button></div>`;
      d.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { mode = b.dataset.pm; dessiner(); });
      d.querySelectorAll("[data-b]").forEach(b => b.onclick = () => { const v = b.dataset.b; recu = v === "ex" ? tot : v === "0" ? 0 : recu + +v; ton([990], .12); dessiner(); });
      const ri = d.querySelector("#recu");
      if (ri) {
        // le caissier tape ce que le client a donné : la monnaie à rendre s'affiche tout de suite
        ri.oninput = () => { recu = num(ri.value); d.querySelector("#rendu").innerHTML = blocRendu(); d.querySelector("#pok").disabled = !!(recu && recu < tot); };
        ri.onkeydown = e => { if (e.key === "Enter" && !d.querySelector("#pok").disabled) d.querySelector("#pok").click(); };
        if (focus !== false) setTimeout(() => { ri.focus(); ri.select(); }, 30);
      }
      d.querySelector("#px").onclick = () => d.remove();
      d.querySelector("#pok").onclick = () => {
        const pt = d.querySelector("#pt").checked; LS.set("ticketPay", pt);
        d.remove();
        orders.forEach(o => maj(o, { statut: "payee", paiement: mode, payeA: firebase.firestore.FieldValue.serverTimestamp(), employe: o.employe || employe.nom }));
        if (pt) imprimer(ticket(orders.map(o => Object.assign({}, o, { paiement: mode })), titre ? titre.toUpperCase() : "TICKET"));
        ton([1047, 1319, 1568], .3); toast(`✔ ${t("paye")} : ${fmt(tot)}`, "ok");
        go(vue.k === "table" ? { k: "tables" } : { k: "home" });
      };
    };
    dessiner(); document.body.appendChild(d);
  }
  function confirmer(txt, fn) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box"><h2>${esc(txt)}</h2><div class="acts"><button class="btn bad big" id="cy" style="flex:1">${t("oui")}</button><button class="btn big" id="cn" style="flex:1">${t("non")}</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector("#cy").onclick = () => { d.remove(); fn(); };
    d.querySelector("#cn").onclick = () => d.remove();
  }

  /* ---------- réglages de cet appareil ---------- */
  function reglages() {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box"><h2>⚙️ ${t("reglages")}</h2>
      <label class="field">🧾 ${t("papier")}<select id="rl"><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
      <label class="chk"><input type="checkbox" id="rb" ${LS.get("bon", true) ? "checked" : ""}> 🖨 ${t("bonAuto")}</label>
      <label class="chk"><input type="checkbox" id="ra" ${LS.get("auto", false) ? "checked" : ""}> 🖨 ${t("auto")}</label>
      <p class="mut" style="font-size:13px">💡 Impression sans fenêtre : Google Chrome en mode « kiosk-printing » (NFCWORK le règle pour vous).</p>
      <div class="acts"><button class="btn p" id="rok" style="flex:1">${t("sauver")}</button><button class="btn" id="rtest">🖨 ${t("ticketTest")}</button></div>
      <div class="acts" style="margin-top:14px"><button class="btn sm" id="rch">${t("changer")}</button><button class="btn bad sm" id="rout">${t("deco")}</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector("#rl").value = String((C.ticket || {}).largeur || LS.get("larg", 80));
    d.addEventListener("click", e => { if (e.target === d) d.remove(); });
    d.querySelector("#rok").onclick = () => { LS.set("larg", +d.querySelector("#rl").value); C.ticket = Object.assign({}, C.ticket, { largeur: +d.querySelector("#rl").value }); LS.set("bon", d.querySelector("#rb").checked); LS.set("auto", d.querySelector("#ra").checked); d.remove(); toast("✔"); };
    d.querySelector("#rtest").onclick = () => imprimer(ticket([{ num: "0000", mode: "place", table: "Table 1", items: [{ n: "Café noir", q: 2, p: 12 }, { n: "Jus d’orange", q: 1, p: 18 }], total: 42 }], "TICKET TEST"));
    d.querySelector("#rch").onclick = () => { d.remove(); slug = ""; LS.set("slug", ""); history.replaceState(null, "", location.pathname); if (unsub) unsub(); choisir(); };
    d.querySelector("#rout").onclick = () => confirmer(t("deco") + " ?", () => { d.remove(); auth.signOut(); });
  }

  setInterval(() => { if (vue.k === "ligne" || vue.k === "tables" || vue.k === "table") rendre(); }, 60000);
  window.addEventListener("hashchange", () => { const s = (location.hash.match(/m=([a-z0-9-]+)/) || [])[1]; if (s && s !== slug) { slug = s; vu.clear(); premier = true; demarrer(); } });
})();
