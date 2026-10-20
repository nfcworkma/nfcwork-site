/* NFCWORK — ✏️ Mode édition du site (nfcwork.ma/?edition=1), réservé à l'admin.
   Textes : cliquez et écrivez. Images : bouton 📷 sur chaque image. Couleurs, numéro WhatsApp.
   Tout est gardé dans settings/site = { json: '{"slots":{}, "textes":{"fr":{},"ar":{}}, "theme":"a", "wa":""}' } */
(function () {
  "use strict";
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const S = window.NFCW_SITE; if (!S) return;
  const esc = S.esc;
  const charger = src => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });

  const css = document.createElement("style");
  css.textContent = `
  .edbar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 24px);
    background:#0b0f18;color:#fff;border:1px solid #2a3348;border-radius:18px;padding:10px 12px;box-shadow:0 20px 50px rgb(0 0 0/.45);font:500 14px/1.3 Inter,system-ui,sans-serif}
  .edbar b{font-weight:700}.edbar .sep{width:1px;height:26px;background:#2a3348}
  .edbar button,.edbar a{font:inherit;color:#fff;background:#1a2133;border:1px solid #2a3348;border-radius:12px;padding:8px 12px;cursor:pointer;text-decoration:none;white-space:nowrap}
  .edbar button.go{background:#1faa59;border-color:#1faa59;font-weight:700}.edbar button.go:disabled{opacity:.5}
  .edbar .sw{width:30px;height:30px;padding:0;border-radius:50%;border:2px solid #2a3348}.edbar .sw[aria-pressed=true]{border-color:#fff;box-shadow:0 0 0 2px #1faa59}
  .edbar input{font:inherit;width:140px;background:#1a2133;color:#fff;border:1px solid #2a3348;border-radius:10px;padding:7px 10px}
  body.edit .fab{display:none}
  body.edit [data-ek]{outline:1px dashed rgb(31 170 89/.0);outline-offset:3px;border-radius:4px;cursor:text;transition:outline-color .15s}
  body.edit [data-ek]:hover{outline-color:rgb(31 170 89/.9)}
  body.edit [data-ek]:focus{outline:2px solid #1faa59;background:rgb(31 170 89/.08)}
  body.edit [data-ek].mod{box-shadow:inset 0 -2px 0 #1faa59}
  .edimg{position:absolute;top:10px;right:10px;z-index:20;display:flex;gap:6px}
  .edimg button{font:600 13px/1 Inter,system-ui,sans-serif;background:#1faa59;color:#fff;border:0;border-radius:999px;padding:9px 12px;cursor:pointer;box-shadow:0 6px 18px rgb(0 0 0/.35)}
  .edimg button.d{background:#0b0f18}
  .edtoast{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:101;background:#0b0f18;color:#fff;padding:12px 18px;border-radius:14px;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 14px 40px rgb(0 0 0/.4)}
  @media(max-width:700px){.edbar{bottom:8px;gap:6px;padding:8px}.edbar .lbl,.edbar .sep{display:none}.edbar input{width:120px}}`;
  document.head.appendChild(css);
  const toast = (t, ms) => { const d = document.createElement("div"); d.className = "edtoast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), ms || 2600); };
  const bar = document.createElement("div"); bar.className = "edbar"; bar.innerHTML = "<b>✏️ Mode édition</b> · Connexion…"; document.body.appendChild(bar);

  // HTML permis dans un texte : <i> <b> <em> <strong> <br>
  function propre(html) {
    const t = document.createElement("template"); t.innerHTML = html;
    const out = n => [...n.childNodes].map(c => {
      if (c.nodeType === 3) return esc(c.textContent);
      if (c.nodeType !== 1) return "";
      const tag = c.tagName.toLowerCase();
      if (tag === "br") return "<br>";
      if (["i", "b", "em", "strong"].includes(tag)) return `<${tag}>${out(c)}</${tag}>`;
      return out(c) + (["div", "p"].includes(tag) ? "<br>" : "");
    }).join("");
    return out(t.content).replace(/(<br>)+$/, "").replace(/&nbsp;/g, " ").trim();
  }

  function jpeg(f) {
    return new Promise((ok, ko) => {
      const u = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u); let k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement("canvas"), g = c.getContext("2d");
        for (let q = .86, i = 0; i < 10; i++) { c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); const d = c.toDataURL("image/jpeg", q); if (d.length < 900000) return ok(d); if (q > .6) q -= .08; else k *= .85; }
        ko(new Error("lourde"));
      };
      im.onerror = () => { URL.revokeObjectURL(u); ko(new Error("illisible")); }; im.src = u;
    });
  }

  (async () => {
    try { await charger(SDK + "firebase-app-compat.js"); await charger(SDK + "firebase-auth-compat.js"); await charger(SDK + "firebase-firestore-compat.js"); await charger("espace/config.js"); }
    catch (e) { bar.innerHTML = "<b>✏️ Mode édition</b> · Pas de connexion internet."; return; }
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth(), fs = firebase.firestore();
    auth.onAuthStateChanged(u => {
      if (!u || (window.ADMIN_EMAIL && u.email !== window.ADMIN_EMAIL)) {
        bar.innerHTML = `<b>✏️ Mode édition</b> <span>réservé à l’admin.</span> <a href="espace/">Se connecter à l’Espace</a> <a href="./">Quitter</a>`;
        return;
      }
      demarrer(fs);
    });
  })();

  async function demarrer(fs) {
    let J = {};
    try { const d = await fs.doc("settings/site").get(); if (d.exists) J = JSON.parse(d.data().json || "{}") || {}; } catch (e) {}
    J.slots = J.slots || {}; J.textes = J.textes || { fr: {}, ar: {} }; J.textes.fr = J.textes.fr || {}; J.textes.ar = J.textes.ar || {}; J.theme = J.theme || "b";
    let dirty = 0;
    document.body.classList.add("edit");
    S.appliquer(J);   // on part de la version enregistrée
    const TX = () => S.TX;

    // ---- textes
    const activer = () => {
      document.querySelectorAll("[data-ek]").forEach(el => {
        if (el.querySelector("[data-ek]")) return;
        el.contentEditable = "true"; el.spellcheck = true;
        if (TX()[S.L][el.dataset.ek] != null) el.classList.add("mod");
      });
      images();
    };
    document.addEventListener("input", e => {
      const el = e.target.closest && e.target.closest("[data-ek]"); if (!el) return;
      const k = el.dataset.ek, v = propre(el.innerHTML), t = TX()[S.L];
      if (v === k || v === esc(k)) delete t[k]; else t[k] = v;
      el.classList.toggle("mod", k in t); marquer();
    });
    document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest && e.target.closest("[data-ek]") && !e.shiftKey) { e.preventDefault(); e.target.blur(); } });
    document.addEventListener("paste", e => { if (!(e.target.closest && e.target.closest("[data-ek]"))) return; e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text")); });
    // en édition, les liens ne s'ouvrent pas (sauf la barre)
    document.addEventListener("click", e => { const a = e.target.closest("a"); if (a && !a.closest(".edbar")) e.preventDefault(); }, true);
    document.addEventListener("nfcw-draw", activer);

    // ---- images
    function images() {
      document.querySelectorAll("[data-slot]").forEach(el => {
        const box = getComputedStyle(el).display === "contents" ? el.parentElement : el;
        if (box.querySelector(":scope > .edimg")) return;
        if (getComputedStyle(box).position === "static") box.style.position = "relative";
        const k = el.dataset.slot, w = document.createElement("div"); w.className = "edimg";
        w.innerHTML = `<button type="button">📷 Changer</button>${J.slots[k] ? '<button type="button" class="d">↺</button>' : ""}`;
        w.firstElementChild.onclick = e => { e.preventDefault(); e.stopPropagation(); const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = () => i.files[0] && changer(k, el, i.files[0]); i.click(); };
        if (w.children[1]) w.children[1].onclick = e => { e.preventDefault(); e.stopPropagation(); defaut(k, el); };
        box.appendChild(w);
      });
    }
    const refaire = el => { delete el.dataset.done; S.remplir(); const box = getComputedStyle(el).display === "contents" ? el.parentElement : el; const w = box.querySelector(":scope > .edimg"); if (w) w.remove(); images(); };
    async function changer(k, el, f) {
      try {
        toast("Envoi de l’image…", 1500);
        const data = await jpeg(f), id = Math.random().toString(36).slice(2, 12);
        await fs.doc("settings/mimg-" + id).set({ data, site: true, maj: new Date().toISOString() });
        const old = J.slots[k]; J.slots[k] = id; S.SLOTS[k] = data;
        await enregistrer(true);
        if (old) fs.doc("settings/mimg-" + old).delete().catch(() => {});
        refaire(el); toast("✅ Image changée");
      } catch (e) { console.error(e); toast(/illisible|lourde/.test(e.message) ? "Image illisible : essayez une capture d’écran." : "Échec de l’envoi."); }
    }
    async function defaut(k, el) {
      const old = J.slots[k]; delete J.slots[k]; delete S.SLOTS[k];
      try { await enregistrer(true); if (old) fs.doc("settings/mimg-" + old).delete().catch(() => {}); refaire(el); toast("Image d’origine remise"); } catch (e) { toast("Échec."); }
    }

    // ---- barre
    const COUL = [["a", "linear-gradient(135deg,#07090f 50%,#d6a64f 50%)", "Nuit & Or"], ["b", "linear-gradient(135deg,#040a1d 50%,#2f7bff 50%)", "Bleu électrique"], ["c", "linear-gradient(135deg,#fff 50%,#1f5eff 50%)", "Blanc & Bleu"]];
    bar.innerHTML = `<b>✏️ Édition</b><span class="lbl">Cliquez sur un texte pour l’écrire · 📷 sur une image</span><span class="sep"></span>
      <button type="button" id="ed-l"></button>
      <span class="lbl">Couleurs</span>${COUL.map(([k, g, n]) => `<button type="button" class="sw" data-th="${k}" title="${n}" style="background:${g}"></button>`).join("")}
      <span class="sep"></span><input id="ed-wa" inputmode="tel" placeholder="WhatsApp 2126…" title="Numéro WhatsApp du site" value="${esc(J.wa || S.WA)}">
      <button type="button" class="go" id="ed-go" disabled>💾 Enregistrer</button><a href="./" id="ed-x">Quitter</a>`;
    const go = bar.querySelector("#ed-go"), bl = bar.querySelector("#ed-l");
    const majBar = () => { bl.textContent = S.L === "ar" ? "🇫🇷 Français" : "🇲🇦 عربي"; bar.querySelectorAll("[data-th]").forEach(b => b.setAttribute("aria-pressed", b.dataset.th === J.theme)); go.disabled = !dirty; go.textContent = dirty ? "💾 Enregistrer" : "✅ Enregistré"; };
    function marquer() { dirty = 1; majBar(); }
    bl.onclick = () => { document.getElementById("lang").click(); majBar(); };
    bar.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { J.theme = b.dataset.th; if (J.theme === "a") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", J.theme); marquer(); });
    bar.querySelector("#ed-wa").oninput = e => { J.wa = e.target.value.replace(/\D/g, ""); marquer(); };
    go.onclick = () => enregistrer(false);
    bar.querySelector("#ed-x").onclick = e => { if (dirty && !confirm("Des changements ne sont pas enregistrés. Quitter quand même ?")) e.preventDefault(); };
    window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

    async function enregistrer(images) {
      // on relit la dernière version pour ne rien écraser (ex. images changées depuis « Mon site »)
      let cur = {}; try { const d = await fs.doc("settings/site").get(); if (d.exists) cur = JSON.parse(d.data().json || "{}") || {}; } catch (e) {}
      const tout = Object.assign({}, cur, { slots: J.slots, textes: TX(), theme: J.theme, wa: J.wa || cur.wa || "" });
      if (!images || 1) {
        try { go.disabled = true; go.textContent = "Enregistrement…"; await fs.doc("settings/site").set({ json: JSON.stringify(tout), maj: new Date().toISOString() }); }
        catch (e) { console.error(e); toast("❌ Échec : connectez-vous en admin dans l’Espace."); majBar(); throw e; }
      }
      J.textes = TX();
      try { localStorage.setItem("nfcw-site", JSON.stringify({ theme: J.theme, textes: J.textes, wa: J.wa || "" })); } catch (e) {}
      if (!images) { dirty = 0; toast("✅ Site enregistré : en ligne pour tout le monde"); }
      majBar();
    }
    majBar(); activer();
    toast("✏️ Mode édition : cliquez sur un texte pour le changer", 3500);
  }
})();
