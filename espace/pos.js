/* NFCWORK — Caisse web (espace/pos.html#m=<slug>)
   Données :
   - caisses/<slug>  { emails:[…], tables:12, employes:[{nom,pin}], ticket:{entete,pied,largeur} }  (réglé par NFCWORK dans « Menus »)
   - commandes/<slug>/liste/<id>  { statut: nouvelle|cuisine|prete|payee|annulee, source: menu|caisse, num, cree, mode: place|emporter|livraison|chambre,
       table, nom, tel, adresse, pos, note, items:[{id,n,q,p}], total, frais, devise, employe, paiement, payeA } */
(function () {
  "use strict";
  const app = document.getElementById("app"), top = document.getElementById("top");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = v => v && typeof v === "object" ? (v.fr || v.ar || v.en || Object.values(v)[0] || "") : (v || "");
  const num = p => { const n = parseFloat(String(p == null ? "" : p).replace(",", ".").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
  const fmt = n => (Math.round(n * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + (DEV || "DH");
  const heure = d => d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  const depuis = d => { if (!d) return ""; const m = Math.round((Date.now() - d) / 60000); return m < 1 ? "à l’instant" : m < 60 ? `il y a ${m} min` : `il y a ${Math.floor(m / 60)} h ${m % 60}`; };
  const LS = { get(k, d) { try { const v = localStorage.getItem("pos-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("pos-" + k, JSON.stringify(v)); } catch (e) {} } };
  const toast = t => { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); };

  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  let user = null, admin = false, slug = (location.hash.match(/m=([a-z0-9-]+)/) || [])[1] || LS.get("slug", "");
  let C = {}, MENU = {}, DEV = "DH", ORD = [], vu = new Set(), premier = true, unsub = null, employe = null, vue = { k: "home" }, panier = {}, catSel = null;

  /* ---------- son : bip qui se répète tant qu'une commande est « nouvelle » ---------- */
  let AC = null, sonOn = LS.get("son", true), bipT = null;
  function bip() {
    if (!sonOn || !AC) return;
    try { [0, .22, .44].forEach((t, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = "sine"; o.frequency.value = [880, 1175, 1568][i]; g.gain.setValueAtTime(.0001, AC.currentTime + t); g.gain.exponentialRampToValueAtTime(.5, AC.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + t + .2); o.connect(g).connect(AC.destination); o.start(AC.currentTime + t); o.stop(AC.currentTime + t + .22); }); } catch (e) {}
  }
  function alarme() {
    const n = ORD.filter(o => o.statut === "nouvelle").length;
    document.title = n ? `(${n}) 🔔 Caisse NFCWORK` : "Caisse NFCWORK";
    let a = document.querySelector(".alarm");
    if (n && employe) {
      if (!a) { a = document.createElement("div"); a.className = "alarm"; document.body.appendChild(a); a.onclick = () => go({ k: "ligne" }); }
      a.innerHTML = `🔔 ${n} nouvelle${n > 1 ? "s" : ""} commande${n > 1 ? "s" : ""} <span style="text-decoration:underline">Voir</span>`;
      if (!bipT) { bip(); bipT = setInterval(bip, 5000); }
    } else { if (a) a.remove(); clearInterval(bipT); bipT = null; }
  }

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
    return `<h1>${esc(MENU.nom || "")}</h1>${T.entete ? `<div class="c">${esc(T.entete).replace(/\n/g, "<br>")}</div>` : ""}<hr>
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
  function login(msg) {
    top.hidden = true;
    app.innerHTML = `<div class="center"><form class="pinbox" id="lf"><div style="font-size:44px">🧾</div><h2 style="margin:6px 0">Caisse NFCWORK</h2>
      <p class="mut" style="margin:0 0 6px">Connectez la caisse une seule fois avec le compte du commerce.</p>
      <label class="field">E-mail<input id="le" type="email" autocomplete="username" required></label>
      <label class="field">Mot de passe<input id="lp" type="password" autocomplete="current-password" required></label>
      <p class="err" id="lerr">${esc(msg || "")}</p><button class="btn p big" style="width:100%">Se connecter</button></form></div>`;
    document.getElementById("lf").onsubmit = async e => {
      e.preventDefault();
      try { await auth.signInWithEmailAndPassword(document.getElementById("le").value.trim(), document.getElementById("lp").value); }
      catch (x) { document.getElementById("lerr").textContent = "E-mail ou mot de passe incorrect."; }
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
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="center"><div class="pinbox"><h2>Accès refusé</h2><p class="mut">Ce compte (${esc(user.email)}) n’est pas autorisé sur cette caisse. Demandez à NFCWORK de l’ajouter.</p><button class="btn" id="out">Changer de compte</button></div></div>`;
      document.getElementById("out").onclick = () => auth.signOut(); return;
    }
    ecouter();
    if (AC) pin(); else demarrage();
  }
  // un clic est nécessaire pour autoriser le son dans le navigateur
  function demarrage() {
    top.hidden = true;
    app.innerHTML = `<div class="center"><div class="pinbox">${MENU.logo ? "" : ""}<div style="font-size:48px">🧾</div><h2 style="margin:8px 0 4px">${esc(MENU.nom || "Caisse")}</h2><p class="mut">Les commandes du menu arrivent ici en direct.</p>
      <button class="btn p big" id="go" style="width:100%;margin-top:10px">▶ Démarrer la caisse</button></div></div>`;
    document.getElementById("go").onclick = () => { try { AC = new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) {} pin(); };
  }

  /* ---------- employés : code PIN ---------- */
  function pin() {
    const E = (C.employes || []).filter(e => e && e.nom && e.pin);
    if (!E.length) { employe = { nom: "Caisse" }; return go({ k: "home" }); }
    top.hidden = true;
    let code = "";
    app.innerHTML = `<div class="center"><div class="pinbox"><h2 style="margin:0">${esc(MENU.nom || "")}</h2><p class="mut" style="margin:4px 0 0">Entrez votre code PIN</p>
      <div class="dots" id="pd">${"<i></i>".repeat(4)}</div><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, "OK"].map(k => `<button data-k="${k}">${k}</button>`).join("")}</div><p class="err" id="perr"></p>
      <p class="mut" style="font-size:13px;margin:10px 0 0">${E.map(e => esc(e.nom)).join(" · ")}</p></div></div>`;
    const maj = () => app.querySelectorAll("#pd i").forEach((i, n) => i.classList.toggle("f", n < code.length));
    const ok = () => { const e = E.find(x => String(x.pin) === code); if (e) { employe = e; go({ k: "home" }); } else { code = ""; maj(); document.getElementById("perr").textContent = "Code incorrect"; } };
    app.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const k = b.dataset.k; if (k === "⌫") code = code.slice(0, -1); else if (k === "OK") return ok(); else if (code.length < 6) code += k; maj(); if (code.length === 4 && E.some(x => String(x.pin) === code)) ok(); });
  }

  /* ---------- commandes du jour, en direct ---------- */
  function ecouter() {
    if (unsub) unsub();
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - 1);   // depuis hier : les tables encore ouvertes après minuit restent visibles
    unsub = db.collection("commandes").doc(slug).collection("liste").where("cree", ">=", d0).orderBy("cree", "desc").limit(400).onSnapshot(s => {
      ORD = s.docs.map(x => { const o = x.data(); o.id = x.id; o.d = o.cree && o.cree.toDate ? o.cree.toDate() : null; o.items = o.items || []; return o; })
        .filter(o => o.statut !== "payee" && o.statut !== "annulee" || (o.d && o.d >= jour()));
      const nouv = ORD.filter(o => o.statut === "nouvelle" && !vu.has(o.id));
      if (!premier && nouv.length && LS.get("auto", false)) nouv.forEach(o => imprimer(bonCuisine(o)));
      ORD.forEach(o => vu.add(o.id)); premier = false;
      setEtat(true); alarme(); rendre();
    }, e => { console.error(e); setEtat(false); toast("Connexion perdue : vérifiez internet"); });
  }
  const jour = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  let enLigne = true; function setEtat(v) { enLigne = v; const d = document.getElementById("etat"); if (d) d.className = "dot" + (v ? "" : " off"); }
  const ouvertes = () => ORD.filter(o => o.statut !== "payee" && o.statut !== "annulee");
  const numTable = t => { const m = String(t || "").match(/(\d+)/); return m ? +m[1] : 0; };
  async function maj(o, data) { try { await db.collection("commandes").doc(slug).collection("liste").doc(o.id).update(Object.assign({ maj: firebase.firestore.FieldValue.serverTimestamp() }, data)); } catch (e) { console.error(e); toast("Échec : vérifiez la connexion"); } }

  /* ---------- navigation ---------- */
  function go(v) { vue = v; if (v.k !== "cmd") { panier = {}; } rendre(); window.scrollTo(0, 0); }
  function barre() {
    top.hidden = false;
    top.innerHTML = `<div class="nm"><span>🧾 ${esc(MENU.nom || "Caisse")}</span></div><span class="sp"></span>
      <span class="chip"><i class="dot${enLigne ? "" : " off"}" id="etat"></i><span class="mut" style="font-weight:500">En direct</span></span>
      <button class="chip${sonOn ? " on" : ""}" id="bs">${sonOn ? "🔊" : "🔇"}</button>
      <button class="chip" id="bset">⚙️</button>
      <button class="chip" id="bemp">👤 ${esc(employe ? employe.nom : "")}</button>`;
    document.getElementById("bs").onclick = () => { sonOn = !sonOn; LS.set("son", sonOn); if (sonOn) bip(); barre(); };
    document.getElementById("bemp").onclick = () => { employe = null; pin(); };
    document.getElementById("bset").onclick = reglages;
  }
  function rendre() {
    if (!employe) return;
    barre();
    if (vue.k === "home") return accueil();
    if (vue.k === "tables") return tables();
    if (vue.k === "ligne") return enligne();
    if (vue.k === "cmd") return commande();
  }

  function accueil() {
    const O = ouvertes(), nNew = O.filter(o => o.statut === "nouvelle").length;
    const occ = new Set(O.filter(o => o.mode === "place" && numTable(o.table)).map(o => numTable(o.table))).size;
    const pay = ORD.filter(o => o.statut === "payee" && o.d >= jour()), ca = pay.reduce((a, o) => a + num(o.total), 0);
    const nEmp = O.filter(o => o.mode !== "place" || !numTable(o.table)).length;
    app.innerHTML = `<h1>Bonjour ${esc(employe.nom)} 👋</h1><p class="mut" style="margin:0">Que souhaitez-vous faire ?</p>
      <div class="tiles">
        <button class="tile${O.some(o => o.statut === "nouvelle" && o.mode === "place" && numTable(o.table)) ? " alert" : ""}" data-go="tables"><span class="ic">🍽</span><b>Sur place</b><small>Choisir une table · ${occ} occupée${occ > 1 ? "s" : ""}</small></button>
        <button class="tile" data-go="emporter"><span class="ic" style="background:rgb(255 159 28/.2)">🥡</span><b>À emporter</b><small>Créer une commande</small></button>
        <button class="tile" data-go="livraison"><span class="ic" style="background:rgb(31 170 89/.2)">🛵</span><b>Livraison</b><small>Commande par téléphone</small></button>
        <button class="tile${nNew ? " alert" : ""}" data-go="ligne">${nNew ? `<span class="bdg">${nNew}</span>` : ""}<span class="ic" style="background:rgb(92 200 255/.2)">📲</span><b>Commandes</b><small>Menu QR, à emporter, livraison · ${nEmp} en cours</small></button>
      </div>
      <div class="stats"><div><span class="mut">Encaissé aujourd’hui</span><b>${fmt(ca)}</b></div><div><span class="mut">Commandes payées</span><b>${pay.length}</b></div><div><span class="mut">En cours</span><b>${O.length}</b></div></div>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { const g = b.dataset.go; if (g === "emporter" || g === "livraison") go({ k: "cmd", mode: g }); else go({ k: g }); });
  }

  function tables() {
    const N = Math.max(1, Math.min(80, +C.tables || 12)), O = ouvertes();
    app.innerHTML = `<button class="btn sm back" data-home>← Accueil</button><h1>Sélectionnez une table</h1><p class="mut" style="margin:0">Touchez une table pour voir, ajouter ou encaisser.</p>
      <div class="tables">${Array.from({ length: N }, (_, i) => i + 1).map(n => {
        const os = O.filter(o => o.mode === "place" && numTable(o.table) === n), t = os.reduce((a, o) => a + num(o.total), 0), nv = os.some(o => o.statut === "nouvelle");
        return `<button class="tb${nv ? " new" : os.length ? " occ" : ""}" data-t="${n}"><span class="ic">${nv ? "🔔" : os.length ? "🍽" : "🪑"}</span><small>TABLE</small><span class="n">${n}</span>
          ${os.length ? `<span class="t">${fmt(t)}</span><small>${os.length} commande${os.length > 1 ? "s" : ""}${nv ? " · nouvelle !" : ""}</small>` : `<small>Libre</small>`}</button>`; }).join("")}</div>`;
    app.querySelector("[data-home]").onclick = () => go({ k: "home" });
    app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => go({ k: "cmd", mode: "place", table: +b.dataset.t }));
  }

  /* ---------- une carte de commande ---------- */
  function carte(o, compact) {
    const src = o.source === "menu" ? "📲 Menu QR" : "👤 " + esc(o.employe || "Caisse");
    const mode = o.mode === "livraison" ? "🛵 Livraison" : o.mode === "emporter" ? "🥡 À emporter" : o.mode === "chambre" ? "🛎 " + esc(o.table || "Chambre") : "🍽 " + esc(o.table || "Sur place");
    const lab = { nouvelle: "NOUVELLE", cuisine: "EN CUISINE", prete: "PRÊTE", payee: "PAYÉE", annulee: "ANNULÉE" }[o.statut] || o.statut;
    return `<div class="oc ${esc(o.statut)}"><div class="h"><b style="font-size:17px">N° ${esc(o.num)} <span class="mut" style="font-weight:500;font-size:14px">· ${mode}</span></b><span class="st ${esc(o.statut)}">${lab}</span></div>
      <div class="mut" style="font-size:13px;margin-bottom:4px">${src} · ${heure(o.d)} · ${depuis(o.d)}</div>
      ${o.items.map(i => `<div class="ln"><span>${i.q} × ${esc(i.n)}</span><b>${fmt(i.q * num(i.p))}</b></div>`).join("")}
      ${num(o.frais) ? `<div class="ln"><span>Livraison</span><b>${fmt(num(o.frais))}</b></div>` : ""}
      <div class="ln" style="border:0;font-weight:800"><span>Total</span><b>${fmt(num(o.total))}</b></div>
      ${o.note ? `<div class="note">📝 ${esc(o.note)}</div>` : ""}
      ${o.nom || o.tel || o.adresse ? `<div class="cli">${o.nom ? "👤 " + esc(o.nom) + " " : ""}${o.tel ? `📞 <a href="tel:${esc(o.tel)}">${esc(o.tel)}</a>` : ""}${o.adresse ? "<br>📍 " + esc(o.adresse) : ""}${o.pos ? ` · <a href="${esc(o.pos)}" target="_blank" rel="noopener">Position</a>` : ""}</div>` : ""}
      <div class="acts">${o.statut === "nouvelle" ? `<button class="btn p sm" data-a="lancer" data-o="${o.id}">👨‍🍳 Lancer en cuisine</button>` : ""}
        ${o.statut === "cuisine" ? `<button class="btn ok sm" data-a="prete" data-o="${o.id}">✅ Prête</button>` : ""}
        ${o.statut !== "payee" && o.statut !== "annulee" ? `<button class="btn sm" data-a="bon" data-o="${o.id}">🖨 Bon cuisine</button><button class="btn sm" data-a="ticket" data-o="${o.id}">🧾 Ticket</button>` : `<button class="btn sm" data-a="ticket" data-o="${o.id}">🧾 Ticket</button>`}
        ${!compact && o.statut !== "payee" && o.statut !== "annulee" ? `<button class="btn w sm" data-a="encaisser" data-o="${o.id}">💰 Encaisser</button>` : ""}
        ${o.statut !== "payee" && o.statut !== "annulee" ? `<button class="btn bad sm" data-a="annuler" data-o="${o.id}">✖</button>` : ""}</div></div>`;
  }
  function brancher(root) {
    root.querySelectorAll("[data-a]").forEach(b => b.onclick = e => {
      e.stopPropagation();
      const o = ORD.find(x => x.id === b.dataset.o); if (!o) return;
      const a = b.dataset.a;
      if (a === "lancer") { maj(o, { statut: "cuisine", employe: employe.nom }); if (LS.get("bon", true)) imprimer(bonCuisine(o)); toast("Envoyée en cuisine 👨‍🍳"); }
      if (a === "prete") maj(o, { statut: "prete" });
      if (a === "bon") imprimer(bonCuisine(o));
      if (a === "ticket") imprimer(ticket([o]));
      if (a === "encaisser") encaisser([o]);
      if (a === "annuler") confirmer(`Annuler la commande N° ${o.num} ?`, () => maj(o, { statut: "annulee", employe: employe.nom }));
    });
  }

  function enligne() {
    const O = ouvertes().filter(o => o.mode !== "place" || !numTable(o.table) || o.statut === "nouvelle");
    const col = (st, t) => { const L = O.filter(o => o.statut === st); return `<div class="col"><h3><span>${t}</span><span class="mut">${L.length}</span></h3>${L.length ? L.map(o => carte(o)).join("") : `<div class="empty">Aucune</div>`}</div>`; };
    app.innerHTML = `<button class="btn sm back" data-home>← Accueil</button><h1>Commandes</h1><p class="mut" style="margin:0">Menu QR, à emporter et livraison. Les commandes de table sont aussi dans « Sur place ».</p>
      <div class="cols">${col("nouvelle", "🔔 Nouvelles")}${col("cuisine", "👨‍🍳 En cuisine")}${col("prete", "✅ Prêtes")}</div>`;
    app.querySelector("[data-home]").onclick = () => go({ k: "home" });
    brancher(app);
  }

  /* ---------- une table, ou une nouvelle commande à emporter / livraison ---------- */
  function commande() {
    const v = vue, cats = (MENU.categories || []).filter(c => (c.items || []).length);
    if (!catSel || !cats.some(c => c.id === catSel)) catSel = cats[0] && cats[0].id;
    const os = v.mode === "place" ? ouvertes().filter(o => o.mode === "place" && numTable(o.table) === v.table) : [];
    const tot = os.reduce((a, o) => a + num(o.total), 0);
    const items = Object.entries(panier).map(([id, q]) => { const it = cats.flatMap(c => c.items).find(x => x.id === id); return it ? { id, n: tr(it.nom), q, p: num(it.prix) } : null; }).filter(Boolean);
    const tp = items.reduce((a, i) => a + i.q * i.p, 0);
    const titre = v.mode === "place" ? `Table ${v.table}` : v.mode === "livraison" ? "🛵 Livraison" : "🥡 À emporter";
    app.innerHTML = `<button class="btn sm back" data-back>← ${v.mode === "place" ? "Tables" : "Accueil"}</button><h1>${titre}</h1>
      <div class="split"><div>
        ${v.mode === "place" ? `<div class="panel"><h2 style="display:flex;justify-content:space-between"><span>Commandes de la table</span><span>${fmt(tot)}</span></h2>
          ${os.length ? os.map(o => carte(o, true)).join("") + `<div class="acts"><button class="btn sm" data-tt>🧾 Ticket de la table</button><button class="btn w big" data-pay style="flex:1">💰 Encaisser ${fmt(tot)}</button></div>` : `<div class="empty">Table libre. Ajoutez des produits à droite.</div>`}</div>` : ""}
        <div class="panel cart" style="margin-top:${v.mode === "place" ? 14 : 0}px"><h2>${v.mode === "place" ? "Ajouter à la table" : "Nouvelle commande"}</h2>
          ${v.mode === "livraison" ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="field" style="margin:0">Nom<input id="cn" value="${esc(v.nom || "")}"></label><label class="field" style="margin:0">Téléphone<input id="ct" type="tel" value="${esc(v.tel || "")}"></label></div><label class="field">Adresse<input id="ca" value="${esc(v.adresse || "")}"></label>` : ""}
          ${items.length ? items.map(i => `<div class="ln"><span class="q"><button data-m="${esc(i.id)}">−</button><b>${i.q}</b><button data-p="${esc(i.id)}">+</button> ${esc(i.n)}</span><b>${fmt(i.q * i.p)}</b></div>`).join("") : `<p class="mut">Touchez les produits pour les ajouter.</p>`}
          <label class="field">Remarque (cuisine)<input id="cnote" value="${esc(v.note || "")}" maxlength="200" placeholder="sans oignon, bien cuit…"></label>
          <div class="tot"><span>Total</span><span>${fmt(tp)}</span></div>
          <div class="acts"><button class="btn p big" data-send ${items.length ? "" : "disabled"} style="flex:1">👨‍🍳 Envoyer en cuisine</button>${v.mode !== "place" ? `<button class="btn w big" data-sendpay ${items.length ? "" : "disabled"}>💰 Encaisser</button>` : ""}</div></div>
      </div>
      <div class="panel"><div class="cats">${cats.map(c => `<button data-c="${esc(c.id)}" aria-pressed="${c.id === catSel}">${esc(tr(c.nom))}</button>`).join("")}</div>
        <div class="prods">${((cats.find(c => c.id === catSel) || {}).items || []).map(it => `<button class="pr" data-add="${esc(it.id)}"><b>${esc(tr(it.nom))}</b><span>${num(it.prix) ? fmt(num(it.prix)) : ""}${panier[it.id] ? ` · ×${panier[it.id]}` : ""}</span></button>`).join("") || `<div class="empty">Ajoutez des produits dans le menu (Espace → Menus).</div>`}</div></div></div>`;
    const garder = () => { ["cn", "ct", "ca"].forEach((k, i) => { const el = document.getElementById(k); if (el) v[["nom", "tel", "adresse"][i]] = el.value; }); const n = document.getElementById("cnote"); if (n) v.note = n.value; };
    app.querySelector("[data-back]").onclick = () => go({ k: v.mode === "place" ? "tables" : "home" });
    app.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { garder(); catSel = b.dataset.c; commande(); });
    app.querySelectorAll("[data-add],[data-p]").forEach(b => b.onclick = () => { garder(); const id = b.dataset.add || b.dataset.p; panier[id] = (panier[id] || 0) + 1; commande(); });
    app.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { garder(); const id = b.dataset.m; panier[id] = (panier[id] || 0) - 1; if (panier[id] <= 0) delete panier[id]; commande(); });
    const tt = app.querySelector("[data-tt]"); if (tt) tt.onclick = () => imprimer(ticket(os, `TABLE ${v.table}`));
    const pb = app.querySelector("[data-pay]"); if (pb) pb.onclick = () => encaisser(os, `Table ${v.table}`);
    brancher(app);
    const creer = async payer => {
      garder();
      if (v.mode === "livraison" && !String(v.tel || "").trim()) { toast("Indiquez le téléphone du client"); return; }
      const o = { statut: "cuisine", source: "caisse", num: String(Date.now() % 10000).padStart(4, "0"), cree: firebase.firestore.FieldValue.serverTimestamp(),
        mode: v.mode, table: v.mode === "place" ? "Table " + v.table : "", nom: v.nom || "", tel: v.tel || "", adresse: v.adresse || "", pos: "", note: v.note || "",
        items, total: Math.round(tp * 100) / 100, frais: 0, devise: DEV, employe: employe.nom };
      try {
        const ref = await db.collection("commandes").doc(slug).collection("liste").add(o);
        const loc = Object.assign({}, o, { id: ref.id, d: new Date() });
        if (LS.get("bon", true)) imprimer(bonCuisine(loc));
        panier = {}; v.note = "";
        toast("Envoyée en cuisine 👨‍🍳");
        if (payer) encaisser([loc]); else if (v.mode !== "place") go({ k: "ligne" }); else commande();
      } catch (e) { console.error(e); toast("Échec : vérifiez la connexion"); }
    };
    const s1 = app.querySelector("[data-send]"); if (s1) s1.onclick = () => creer(false);
    const s2 = app.querySelector("[data-sendpay]"); if (s2) s2.onclick = () => creer(true);
  }

  /* ---------- encaisser : une ou plusieurs commandes (toute la table) ---------- */
  function encaisser(orders, titre) {
    const tot = orders.reduce((a, o) => a + num(o.total), 0);
    let mode = "Espèces";
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box"><h2>💰 Encaisser${titre ? " · " + esc(titre) : ""}</h2><div class="tot"><span>Total</span><span>${fmt(tot)}</span></div>
      <div class="pay"><button data-pm="Espèces" aria-pressed="true">💵 Espèces</button><button data-pm="Carte" aria-pressed="false">💳 Carte</button></div>
      <label class="field" id="rf">Montant reçu<input id="recu" type="number" inputmode="decimal" min="0" step="any" placeholder="${Math.ceil(tot)}"></label><p class="mut" id="rendu" style="font-size:18px;margin:4px 0 0"></p>
      <label style="display:flex;gap:8px;align-items:center;margin:12px 0;color:var(--mut)"><input type="checkbox" id="pt" ${LS.get("ticketPay", true) ? "checked" : ""}> Imprimer le ticket</label>
      <div class="acts"><button class="btn ok big" id="pok" style="flex:1">✔ Valider le paiement</button><button class="btn" id="px">Annuler</button></div></div>`;
    document.body.appendChild(d);
    const r = d.querySelector("#recu"), rd = d.querySelector("#rendu");
    r.oninput = () => { const v = num(r.value); rd.textContent = v ? (v >= tot ? `À rendre : ${fmt(v - tot)}` : `Manque : ${fmt(tot - v)}`) : ""; };
    d.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { mode = b.dataset.pm; d.querySelectorAll("[data-pm]").forEach(x => x.setAttribute("aria-pressed", x === b)); d.querySelector("#rf").hidden = mode !== "Espèces"; rd.hidden = mode !== "Espèces"; });
    d.querySelector("#px").onclick = () => d.remove();
    d.querySelector("#pok").onclick = async () => {
      const pt = d.querySelector("#pt").checked; LS.set("ticketPay", pt);
      d.remove();
      await Promise.all(orders.map(o => maj(o, { statut: "payee", paiement: mode, payeA: firebase.firestore.FieldValue.serverTimestamp(), employe: o.employe || employe.nom })));
      if (pt) imprimer(ticket(orders.map(o => Object.assign({}, o, { paiement: mode })), titre ? titre.toUpperCase() : "TICKET"));
      toast(`Payé : ${fmt(tot)} ✔`);
      if (vue.k === "cmd" && vue.mode !== "place") go({ k: "home" }); else rendre();
    };
  }
  function confirmer(txt, fn) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box"><h2>${esc(txt)}</h2><div class="acts"><button class="btn bad big" id="cy" style="flex:1">Oui</button><button class="btn big" id="cn">Non</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector("#cy").onclick = () => { d.remove(); fn(); };
    d.querySelector("#cn").onclick = () => d.remove();
  }

  /* ---------- réglages de cet appareil ---------- */
  function reglages() {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box"><h2>⚙️ Réglages de cette caisse</h2>
      <label class="field">Largeur du papier<select id="rl"><option value="80">80 mm (standard)</option><option value="58">58 mm (petite imprimante)</option></select></label>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="rb" ${LS.get("bon", true) ? "checked" : ""}> Imprimer un bon cuisine en lançant une commande</label>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="ra" ${LS.get("auto", false) ? "checked" : ""}> Imprimer automatiquement chaque nouvelle commande du menu</label>
      <p class="mut" style="font-size:13px">💡 Pour imprimer sans fenêtre de confirmation, ouvrez la caisse avec Google Chrome en mode « kiosk-printing ». NFCWORK peut le régler pour vous.</p>
      <div class="acts"><button class="btn p" id="rok" style="flex:1">Enregistrer</button><button class="btn" id="rtest">🖨 Ticket test</button></div>
      <div class="acts" style="margin-top:14px"><button class="btn sm" id="rch">Changer de caisse</button><button class="btn bad sm" id="rout">Déconnecter cette caisse</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector("#rl").value = String((C.ticket || {}).largeur || LS.get("larg", 80));
    d.addEventListener("click", e => { if (e.target === d) d.remove(); });
    d.querySelector("#rok").onclick = () => { LS.set("larg", +d.querySelector("#rl").value); C.ticket = Object.assign({}, C.ticket, { largeur: +d.querySelector("#rl").value }); LS.set("bon", d.querySelector("#rb").checked); LS.set("auto", d.querySelector("#ra").checked); d.remove(); toast("Réglages enregistrés"); };
    d.querySelector("#rtest").onclick = () => imprimer(ticket([{ num: "0000", mode: "place", table: "Table 1", items: [{ n: "Café noir", q: 2, p: 12 }, { n: "Jus d’orange", q: 1, p: 18 }], total: 42 }], "TICKET TEST"));
    d.querySelector("#rch").onclick = () => { d.remove(); slug = ""; LS.set("slug", ""); history.replaceState(null, "", location.pathname); if (unsub) unsub(); choisir(); };
    d.querySelector("#rout").onclick = () => confirmer("Déconnecter cette caisse ?", () => { d.remove(); auth.signOut(); });
  }

  setInterval(() => { if (vue.k === "ligne" || vue.k === "tables") rendre(); }, 60000);   // « il y a N min »
  window.addEventListener("hashchange", () => { const s = (location.hash.match(/m=([a-z0-9-]+)/) || [])[1]; if (s && s !== slug) { slug = s; vu.clear(); premier = true; demarrer(); } });
})();
