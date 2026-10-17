/* =========================================================
   NFCWORK — ÉCRIRE UN LIEN DANS UNE PUCE NFC depuis l'Espace
   Android (Chrome) : directement, sans application (Web NFC).
   iPhone : Apple ne le permet pas depuis un site → on copie le lien et on ouvre NFC Tools.
   Utilisation : NFCW_ECRIRE("https://nfcwork.ma/p/nom", "Nom du produit")
   ========================================================= */
(function () {
  "use strict";
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webnfc = "NDEFReader" in window;
  function fenetre(html) {
    const d = document.createElement("div");
    d.className = "modal";
    d.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d);
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-fermer]")) { d.remove(); if (d._stop) d._stop.abort(); } });
    return d;
  }
  async function copier(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { prompt("Copiez le lien :", t); return false; } }
  window.NFCW_ECRIRE = function (lien, nom) {
    if (webnfc) {
      const d = fenetre(`<div class="row between"><h2>📲 Écrire sur la puce</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
        <p class="muted" style="margin:6px 0 12px">${esc(nom || "")}<br><code style="word-break:break-all">${esc(lien)}</code></p>
        <div class="paper" style="text-align:center;padding:22px;border-radius:16px"><div style="font-size:46px" id="nf-ic">📶</div><b id="nf-tx">Approchez la carte ou la plaque du dos du téléphone…</b><div class="muted" style="font-size:13px;margin-top:6px" id="nf-sub">Gardez-la collée 2 secondes.</div></div>
        <button class="btn block" style="margin-top:12px" data-fermer>Annuler</button>`);
      const ctl = new AbortController(); d._stop = ctl;
      (async () => {
        try {
          const w = new window.NDEFReader();
          await w.write({ records: [{ recordType: "url", data: lien }] }, { signal: ctl.signal, overwrite: true });
          d.querySelector("#nf-ic").textContent = "✅"; d.querySelector("#nf-tx").textContent = "C’est écrit ! La puce ouvre maintenant ce lien.";
          d.querySelector("#nf-sub").textContent = "Testez avec un autre téléphone.";
          if (navigator.vibrate) navigator.vibrate(120);
        } catch (e) {
          if (e && e.name === "AbortError") return;
          d.querySelector("#nf-ic").textContent = "⚠️";
          d.querySelector("#nf-tx").textContent = e && e.name === "NotAllowedError" ? "Autorisez le NFC pour ce site (Chrome → Paramètres du site → NFC), puis réessayez." : "La puce n’a pas pu être écrite. Elle est peut-être verrouillée ou trop loin : réessayez.";
          d.querySelector("#nf-sub").textContent = "Activez aussi le NFC dans les paramètres du téléphone.";
        }
      })();
      return;
    }
    const d = fenetre(`<div class="row between"><h2>📲 Écrire sur la puce</h2><button class="btn sm ghost" data-fermer>Fermer</button></div>
      <p class="muted" style="margin:6px 0 10px">${ios ? "Sur iPhone, Apple oblige à passer par l’application <b>NFC Tools</b> (gratuite)." : "Ce navigateur ne sait pas écrire le NFC. Sur Android, ouvrez l’Espace avec <b>Chrome</b> pour écrire directement. Sinon, utilisez NFC Tools."}</p>
      <code style="display:block;word-break:break-all;margin-bottom:10px">${esc(lien)}</code>
      <ol style="margin:0 0 12px 18px;line-height:1.7;font-size:14.5px"><li>Touchez <b>Copier le lien</b> ci-dessous.</li><li>Ouvrez <b>NFC Tools</b> → <b>Écrire</b> → <b>Ajouter un enregistrement</b> → <b>URL / URI</b>.</li><li>Collez le lien, <b>OK</b>, puis <b>Écrire</b> et approchez la carte du haut du téléphone.</li></ol>
      <div class="row" style="gap:8px"><button class="btn primary" id="nf-copier">📋 Copier le lien</button>${ios ? `<a class="btn" href="https://apps.apple.com/app/nfc-tools/id1252962749" target="_blank" rel="noopener">NFC Tools</a>` : `<a class="btn" href="https://play.google.com/store/apps/details?id=com.wakdev.wdnfc" target="_blank" rel="noopener">NFC Tools</a>`}</div>`);
    d.querySelector("#nf-copier").onclick = async () => { if (await copier(lien)) d.querySelector("#nf-copier").textContent = "✅ Lien copié"; };
  };
  window.NFCW_WEBNFC = webnfc;
})();
