/* =========================================================
   NFCWORK — MODE ÉDITION (admin uniquement)
   Chargé par app.js seulement si l'admin s'est connecté à l'espace client sur cet appareil.
   1. Vérifie avec Firebase que la personne connectée est bien l'admin (e-mail vérifié de firestore.rules).
   2. Affiche un bouton « Mode édition » (icône crayon) ; une fois activé, un crayon apparaît à côté de chaque élément modifiable :
      textes, noms / descriptions / photos des produits et packs, prix et contenu des formules, options.
   3. Enregistre dans Firestore (settings/site et settings/site-img-<produit>) → visible par tous les visiteurs.
      Les visiteurs ne chargent jamais ce fichier ; et même s'ils le chargeaient, les règles Firestore refusent
      toute écriture qui ne vient pas de l'admin.
   ========================================================= */
(function () {
  "use strict";
  const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  const charger = src => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  let db = null, email = "", actif = false;

  /* ---------- Démarrage : Firebase + vérification du compte admin ---------- */
  (async function () {
    try {
      await charger("espace/config.js");
      await charger(FB + "firebase-app-compat.js");
      await Promise.all([charger(FB + "firebase-auth-compat.js"), charger(FB + "firebase-firestore-compat.js")]);
    } catch (e) { return; }
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
    firebase.auth().onAuthStateChanged(u => {
      const ok = u && u.emailVerified && String(u.email || "").toLowerCase() === ADMIN;
      if (!ok) {
        try { localStorage.removeItem("nfcwork-admin"); } catch (e) {}
        retirerBarre();
        if (/[?&]edition=1/.test(location.search)) toast("Connectez-vous d’abord à l’espace client avec le compte admin.", "espace/");
        return;
      }
      try { localStorage.setItem("nfcwork-admin", "1"); } catch (e) {}
      email = u.email; db = firebase.firestore();
      actif = sessionStorage.getItem("nfcwork-edition") === "1" || /[?&]edition=1/.test(location.search);
      installer();
    });
  })();

  /* ---------- Styles du mode édition ---------- */
  function styles() {
    if ($("#ed-style")) return;
    const st = document.createElement("style"); st.id = "ed-style";
    st.textContent = `
.ed-bar{position:fixed;z-index:70;bottom:18px;inset-inline-start:18px;display:flex;gap:6px;align-items:center;padding:6px;border-radius:999px;background:color-mix(in srgb,#0b1220 85%,transparent);border:1px solid #f2b53a;box-shadow:0 12px 34px -10px rgba(242,181,58,.6);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:var(--display)}
.ed-bar button{border:0;border-radius:999px;padding:9px 14px;font-weight:700;font-size:14px;background:transparent;color:#e9effa;cursor:pointer}
.ed-bar button.on{background:linear-gradient(135deg,#f2b53a,#ffd77a);color:#2a1c00}
.ed-pen{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;width:28px;height:28px;margin-inline:6px;vertical-align:middle;border-radius:50%;cursor:pointer;
  background:linear-gradient(135deg,#f2b53a,#ffd77a);color:#2a1c00;font-size:14px;line-height:1;box-shadow:0 4px 14px -4px rgba(242,181,58,.8);flex:none;position:relative;z-index:5;text-transform:none;letter-spacing:0;font-weight:400;-webkit-text-fill-color:#2a1c00}
.ed-pen:focus-visible{outline:2px solid #fff;outline-offset:2px}
.ed-pen.ed-opt{width:auto;height:auto;padding:8px 14px;border-radius:999px;margin:0 0 12px;font-weight:700;font-size:13.5px;font-family:var(--display)}
.ed-pen.coin{position:absolute;top:10px;inset-inline-end:10px;margin:0;width:34px;height:34px;font-size:16px}
.ed-on [data-t]{outline:1px dashed color-mix(in srgb,#f2b53a 45%,transparent);outline-offset:3px;border-radius:4px}
.ed-dlg{width:min(680px,calc(100% - 24px));max-height:calc(100vh - 32px);border:1px solid #26385a;border-radius:20px;padding:0;background:#0b1220;color:#e9effa;box-shadow:0 30px 80px -20px #000}
.ed-dlg::backdrop{background:rgba(2,4,9,.75);backdrop-filter:blur(4px)}
.ed-dlg form{display:grid;gap:12px;padding:18px}
.ed-dlg h2{font-size:20px;margin:0}
.ed-dlg .ed-sub{color:#93a3be;font-size:13px;margin:-6px 0 0}
.ed-dlg .ed-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:560px){.ed-dlg .ed-2{grid-template-columns:1fr}}
.ed-dlg label{display:grid;gap:4px;font-size:12.5px;color:#93a3be;font-weight:600}
.ed-dlg textarea{min-height:72px}
.ed-dlg .ed-orig{font-size:11.5px;color:#6f80a0;font-weight:400;white-space:pre-wrap}
.ed-dlg .ed-act{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;position:sticky;bottom:0;background:#0b1220;padding-top:10px;border-top:1px solid #1b2942}
.ed-dlg .ed-act div{display:flex;gap:8px;flex-wrap:wrap}
.ed-dlg .ed-img{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ed-dlg .ed-img img{width:96px;aspect-ratio:2/3;object-fit:cover;object-position:top;border-radius:12px;border:1px solid #26385a}
.ed-dlg .ed-err{color:#ff6b6b;font-size:13px;margin:0}
.ed-dlg .btn.danger{color:#ff8f8f}
`;
    document.head.appendChild(st);
  }

  /* ---------- Barre « Mode édition » ---------- */
  function installer() {
    styles();
    let bar = $("#ed-bar");
    if (!bar) {
      bar = document.createElement("div"); bar.id = "ed-bar"; bar.className = "ed-bar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Mode édition");
      document.body.appendChild(bar);
      bar.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.a === "toggle") { actif = !actif; try { sessionStorage.setItem("nfcwork-edition", actif ? "1" : "0"); } catch (x) {} installer(); }
      });
    }
    bar.innerHTML = `<button type="button" data-a="toggle" class="${actif ? "on" : ""}" aria-pressed="${actif}"><i class="ico ico-pencil" aria-hidden="true"></i> ${actif ? "Mode édition : activé" : "Mode édition"}</button>`;
    window.NFCWORK_APRES = decorer;
    decorer();
  }
  function retirerBarre() { const b = $("#ed-bar"); if (b) b.remove(); window.NFCWORK_APRES = null; $$(".ed-pen").forEach(x => x.remove()); document.documentElement.classList.remove("ed-on"); }

  /* ---------- Crayons à côté de ce qui est modifiable ---------- */
  function crayon(titre, action, coin) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ed-pen" + (coin ? " coin" : ""); b.innerHTML = '<i class="ico ico-pencil" aria-hidden="true"></i>'; b.title = titre; b.setAttribute("aria-label", titre);
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); action(); }, true);
    return b;
  }
  function decorer() {
    $$(".ed-pen").forEach(x => x.remove());
    document.documentElement.classList.toggle("ed-on", actif);
    if (!actif) return;
    // textes (titres, phrases, boutons…)
    $$("[data-t]").forEach(el => {
      if (el.closest("head") || /^(TITLE|OPTION|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const k = el.dataset.t, v = T.fr[k];
      if (typeof v !== "string") return;
      el.appendChild(crayon("Modifier ce texte", () => editerTexte(k, el.hasAttribute("data-html"))));
    });
    // produits & packs : nom, description, photo
    $$(".shot[data-cat]").forEach(el => el.appendChild(crayon("Modifier le produit (nom, description, photo)", () => editerProduit(el.dataset.cat), true)));
    const poster = $("#posterBtn .shot");
    if (poster && window.NFCWORK.cat) poster.appendChild(crayon("Modifier le produit (nom, description, photo)", () => editerProduit(window.NFCWORK.cat), true));
    // formules : nom, prix, contenu
    $$(".tier").forEach(el => {
      const b = $(".add[data-k]", el); if (!b) return;
      el.appendChild(crayon("Modifier la formule (nom, prix, contenu)", () => editerFormule(b.dataset.k), true));
    });
    // options & services (page Produits)
    const ex = $("#extras");
    if (ex) { const b = crayon("Modifier les options et leurs prix", editerOptions); b.classList.add("ed-opt"); b.innerHTML = '<i class="ico ico-pencil" aria-hidden="true"></i> Options &amp; prix'; ex.before(b); }
  }

  /* ---------- Fenêtre d'édition ---------- */
  function fenetre(titre, sous, corps, enregistrer, retablir) {
    const d = document.createElement("dialog"); d.className = "ed-dlg";
    d.innerHTML = `<form method="dialog" novalidate><h2>${esc(titre)}</h2>${sous ? `<p class="ed-sub">${esc(sous)}</p>` : ""}${corps}
      <p class="ed-err" role="alert"></p>
      <div class="ed-act">${retablir ? `<button type="button" class="btn danger" data-r>Rétablir l’original</button>` : "<span></span>"}
        <div><button type="button" class="btn" data-x>Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div></div></form>`;
    document.body.appendChild(d);
    const f = $("form", d), err = $(".ed-err", d);
    const fermer = () => { d.close(); d.remove(); };
    $("[data-x]", d).onclick = fermer;
    d.addEventListener("cancel", () => setTimeout(() => d.remove(), 0));
    const lancer = async fn => {
      const btns = $$("button", d); btns.forEach(b => (b.disabled = true)); err.textContent = "";
      try { await fn(f, d); fermer(); toast("Enregistré — visible par tous les visiteurs"); }
      catch (x) { err.textContent = x && x.code === "permission-denied" ? "Refusé : reconnectez-vous à l’espace client avec le compte admin." : (x.message || String(x)); btns.forEach(b => (b.disabled = false)); }
    };
    f.addEventListener("submit", e => { e.preventDefault(); lancer(enregistrer); });
    if (retablir) $("[data-r]", d).onclick = () => { if (confirm("Revenir à la version d’origine pour cet élément ?")) lancer(retablir); };
    d.showModal();
    return d;
  }
  const champ = (nom, label, val, opt = {}) => {
    const orig = opt.orig != null && String(opt.orig) !== String(val) ? `<span class="ed-orig">Original : ${esc(opt.orig)}</span>` : "";
    const attrs = `name="${nom}" ${opt.ar ? 'dir="rtl" lang="ar"' : ""} ${opt.num ? 'type="number" inputmode="numeric" min="0" step="1"' : ""}`;
    return `<label>${esc(label)}${opt.area ? `<textarea ${attrs} rows="${opt.rows || 3}">${esc(val)}</textarea>` : `<input ${attrs} value="${esc(val)}">`}${orig}</label>`;
  };
  const val = (f, n) => (f.elements[n] ? f.elements[n].value.trim() : "");
  const lignes = s => s.split("\n").map(x => x.trim()).filter(Boolean);
  // Seuls <em>, <strong>, <br> sont gardés dans les textes (le reste est affiché tel quel)
  const propre = s => esc(s).replace(/&lt;(\/?)(em|strong)&gt;/g, "<$1$2>").replace(/&lt;br\s*\/?&gt;/g, "<br>");

  /* ---------- Enregistrement dans Firestore ---------- */
  async function sauver(o) {
    const v = String(Date.now());
    await db.doc("settings/site").set({ json: JSON.stringify(o), v, maj: firebase.firestore.FieldValue.serverTimestamp(), par: email });
    CONTENU.memoriser(o, v);
    window.NFCWORK.render();
  }
  const modifs = () => clone(CONTENU.actuel);
  const nettoyer = o => { for (const k of ["cat", "tier", "img", "conf"]) if (o[k] && !Object.keys(o[k]).length) delete o[k];
    if (o.t) { for (const l of ["fr", "ar"]) if (o.t[l] && !Object.keys(o.t[l]).length) delete o.t[l]; if (!Object.keys(o.t).length) delete o.t; } return o; };

  /* --- Textes --- */
  function editerTexte(k, html) {
    const B = CONTENU.BASE.t;
    fenetre("Modifier le texte", "Français et arabe." + (html ? " Vous pouvez entourer un mot de <em>…</em> pour le mettre en bleu." : ""),
      `${champ("fr", "Français", T.fr[k], { area: true, orig: B.fr[k] })}${champ("ar", "العربية", T.ar[k], { area: true, ar: true, orig: B.ar[k] })}`,
      async f => {
        const fr = val(f, "fr"), ar = val(f, "ar");
        if (!fr || !ar) throw new Error("Remplissez le texte dans les deux langues.");
        const o = modifs(); o.t = o.t || {};
        for (const [l, v] of [["fr", fr], ["ar", ar]]) {
          o.t[l] = o.t[l] || {};
          const p = html ? propre(v) : v;
          if (p === B[l][k]) delete o.t[l][k]; else o.t[l][k] = p;
        }
        await sauver(nettoyer(o));
      },
      async () => { const o = modifs(); if (o.t) { for (const l of ["fr", "ar"]) if (o.t[l]) delete o.t[l][k]; } await sauver(nettoyer(o)); });
  }

  /* --- Produit : nom, phrase courte, intro, photo --- */
  function editerProduit(id) {
    const C = CATALOG.find(x => x.id === id), B = CONTENU.BASE.catalog.find(x => x.id === id);
    if (!C) return;
    let nouvellePhoto = null;
    const d = fenetre("Modifier : " + C.name.fr, "La photo garde le même format (2:3) dans le site.",
      `<div class="ed-img"><img id="ed-apercu" src="${esc(C.img)}" alt=""><div style="display:grid;gap:8px">
         <span class="btn" style="position:relative;overflow:hidden"><i class="ico ico-camera" aria-hidden="true"></i> Changer la photo<input type="file" accept="image/*" id="ed-photo" style="position:absolute;inset:0;opacity:0;cursor:pointer"></span>
         ${C.img !== B.img ? `<label class="check" style="flex-direction:row"><input type="checkbox" name="photoOrig" style="width:auto"> Remettre la photo d’origine</label>` : ""}</div></div>
       <div class="ed-2">${champ("nfr", "Nom (français)", C.name.fr, { orig: B.name.fr })}${champ("nar", "الاسم (عربية)", C.name.ar, { ar: true, orig: B.name.ar })}</div>
       <div class="ed-2">${champ("sfr", "Phrase courte (français)", C.short.fr, { orig: B.short.fr })}${champ("sar", "الجملة القصيرة (عربية)", C.short.ar, { ar: true, orig: B.short.ar })}</div>
       <div class="ed-2">${champ("ifr", "Description (français)", C.intro.fr, { area: true, orig: B.intro.fr })}${champ("iar", "الوصف (عربية)", C.intro.ar, { area: true, ar: true, orig: B.intro.ar })}</div>`,
      async f => {
        const o = modifs(); o.cat = o.cat || {}; o.img = o.img || {};
        const m = {};
        const paire = (cle, a, b) => { const v = { fr: val(f, a), ar: val(f, b) }; if (!v.fr || !v.ar) throw new Error("Remplissez les deux langues."); if (v.fr !== B[cle].fr || v.ar !== B[cle].ar) m[cle] = v; };
        paire("name", "nfr", "nar"); paire("short", "sfr", "sar"); paire("intro", "ifr", "iar");
        if (Object.keys(m).length) o.cat[id] = m; else delete o.cat[id];
        if (f.elements.photoOrig && f.elements.photoOrig.checked) delete o.img[id];
        else if (nouvellePhoto) {
          const v = String(Date.now());
          await db.doc("settings/site-img-" + id).set({ data: nouvellePhoto, v, maj: firebase.firestore.FieldValue.serverTimestamp(), par: email });
          CONTENU.memoriserImage(id, v, nouvellePhoto);
          o.img[id] = v;
        }
        await sauver(nettoyer(o));
      },
      async () => { const o = modifs(); if (o.cat) delete o.cat[id]; if (o.img) delete o.img[id]; await sauver(nettoyer(o)); });
    $("#ed-photo", d).addEventListener("change", async e => {
      const fi = e.target.files[0]; if (!fi) return;
      try { nouvellePhoto = await compresser(fi); $("#ed-apercu", d).src = nouvellePhoto; }
      catch (x) { $(".ed-err", d).textContent = "Photo illisible : choisissez un fichier JPG ou PNG."; }
    });
  }
  // Photo : 900 px de large au maximum, JPEG, < 850 Ko (limite d'un document Firestore : 1 Mo)
  function compresser(fichier) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(fichier), img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 900 / w, 1350 / h);
        const c = document.createElement("canvas"), g = c.getContext("2d");
        for (let q = 0.85, essai = 0; essai < 8; essai++) {
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, c.width, c.height);
          const d = c.toDataURL("image/jpeg", q);
          if (d.length < 850000) { URL.revokeObjectURL(url); return ok(d); }
          if (q > 0.6) q -= 0.08; else k *= 0.85;
        }
        URL.revokeObjectURL(url); ko(new Error("trop lourde"));
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("illisible")); };
      img.src = url;
    });
  }

  /* --- Formule : nom, prix, ancien prix, contenu --- */
  function editerFormule(cle) {
    const [cid, k] = cle.split(":");
    const C = CATALOG.find(x => x.id === cid), Ti = C && C.tiers.find(x => x.k === k);
    const BC = CONTENU.BASE.catalog.find(x => x.id === cid), BT = BC && BC.tiers.find(x => x.k === k);
    if (!Ti || !BT) return;
    const nomDouble = typeof BT.n !== "string";
    const nf = typeof Ti.n === "string" ? Ti.n : Ti.n.fr, na = typeof Ti.n === "string" ? Ti.n : Ti.n.ar;
    fenetre(`Modifier : ${C.name.fr} — ${nf}`, "Le nouveau prix s’applique partout (cartes, panier, total, message WhatsApp).",
      `${nomDouble ? `<div class="ed-2">${champ("nfr", "Nom (français)", nf, { orig: BT.n.fr })}${champ("nar", "الاسم (عربية)", na, { ar: true, orig: BT.n.ar })}</div>`
                   : champ("nfr", "Nom de la formule", nf, { orig: BT.n })}
       <div class="ed-2">${champ("p", "Prix (DH)", Ti.p, { num: true, orig: BT.p })}${champ("old", "Ancien prix barré (DH, facultatif)", Ti.old || "", { num: true, orig: BT.old || "" })}</div>
       <div class="ed-2">${champ("ffr", "Contenu (français) — une ligne par avantage", Ti.f.fr.join("\n"), { area: true, rows: 6 })}${champ("far", "المحتوى (عربية) — سطر لكل ميزة", Ti.f.ar.join("\n"), { area: true, rows: 6, ar: true })}</div>`,
      async f => {
        const p = Number(val(f, "p")), old = val(f, "old") ? Number(val(f, "old")) : 0;
        if (!Number.isFinite(p) || p < 0 || !val(f, "p")) throw new Error("Prix invalide.");
        if (!Number.isFinite(old) || old < 0) throw new Error("Ancien prix invalide.");
        const fr = lignes(val(f, "ffr")), ar = lignes(val(f, "far"));
        if (!fr.length || !ar.length) throw new Error("Mettez au moins un avantage dans chaque langue.");
        const n = nomDouble ? { fr: val(f, "nfr"), ar: val(f, "nar") } : val(f, "nfr");
        if (nomDouble ? !n.fr || !n.ar : !n) throw new Error("Le nom est obligatoire.");
        const m = {};
        if (JSON.stringify(n) !== JSON.stringify(BT.n)) m.n = n;
        if (p !== BT.p) m.p = p;
        if ((old || 0) !== (BT.old || 0)) m.old = old || null;
        if (JSON.stringify({ fr, ar }) !== JSON.stringify(BT.f)) m.f = { fr, ar };
        const o = modifs(); o.tier = o.tier || {};
        if (Object.keys(m).length) o.tier[cle] = m; else delete o.tier[cle];
        await sauver(nettoyer(o));
      },
      async () => { const o = modifs(); if (o.tier) delete o.tier[cle]; await sauver(nettoyer(o)); });
  }

  /* --- Options & services + prix réellement utilisés au panier --- */
  function editerOptions() {
    const B = CONTENU.BASE;
    const txt = l => T[l].extras.map(r => r.join(" | ")).join("\n");
    fenetre("Options et services", "Une ligne par option : Nom | description | prix affiché. Les deux prix du bas sont ceux calculés dans le panier.",
      `${champ("fr", "Français", txt("fr"), { area: true, rows: 6 })}${champ("ar", "العربية", txt("ar"), { area: true, rows: 6, ar: true })}
       <div class="ed-2">${champ("design", "Design premium au panier (DH)", CONFIG.designPremium, { num: true, orig: B.conf.designPremium })}
         ${champ("casa", "Livraison Casablanca (DH)", CONFIG.shipping.Casablanca, { num: true, orig: B.conf.shipping.Casablanca })}</div>`,
      async f => {
        const lire = l => lignes(val(f, l)).map(x => { const c = x.split("|").map(s => s.trim()); if (c.length !== 3 || c.some(s => !s)) throw new Error("Chaque ligne doit avoir 3 parties : Nom | description | prix."); return c; });
        const fr = lire("fr"), ar = lire("ar");
        const design = Number(val(f, "design")), casa = Number(val(f, "casa"));
        if (!Number.isFinite(design) || design < 0 || !Number.isFinite(casa) || casa < 0) throw new Error("Prix invalide.");
        const o = modifs(); o.t = o.t || {}; o.conf = o.conf || {};
        for (const [l, v] of [["fr", fr], ["ar", ar]]) {
          o.t[l] = o.t[l] || {};
          if (JSON.stringify(v) === JSON.stringify(B.t[l].extras)) delete o.t[l].extras; else o.t[l].extras = v;
        }
        if (design !== B.conf.designPremium) o.conf.designPremium = design; else delete o.conf.designPremium;
        if (casa !== B.conf.shipping.Casablanca) o.conf.shipping = { Casablanca: casa }; else delete o.conf.shipping;
        await sauver(nettoyer(o));
      },
      async () => { const o = modifs(); if (o.t) for (const l of ["fr", "ar"]) if (o.t[l]) delete o.t[l].extras; delete o.conf; await sauver(nettoyer(o)); });
  }

  /* ---------- Message ---------- */
  function toast(msg, lien) {
    let el = $("#ed-toast");
    if (!el) { el = document.createElement("div"); el.id = "ed-toast"; el.className = "toast"; el.setAttribute("role", "status"); el.style.bottom = "84px"; document.body.appendChild(el); }
    el.innerHTML = esc(msg) + (lien ? ` <a href="${lien}" style="color:inherit;font-weight:700">→</a>` : "");
    el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), lien ? 6000 : 3000);
  }
})();
