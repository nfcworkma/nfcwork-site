/* NFCWORK — préavis de coupure (abonnement impayé)
   Entre l'échéance (« preavis ») et la date de coupure (« expire »), les pages publiques
   (carte fidélité, menu, avis Google…) affichent un avertissement avec le compte à rebours.
   NFCW_PREAVIS(preavis, expire) — dates AAAA-MM-JJ. Ne fait rien hors de cette période.
   Visible SEULEMENT par le patron (jamais par ses clients) :
     - téléphone du patron : marqué quand il se connecte à l'Espace / à la caisse, ou en ouvrant une fois un lien « ?patron=1 »
     - l'admin NFCWORK (pour vérifier)
   NFCW_PREAVIS(preavis, expire, true) : affiché à coup sûr (caisse, Espace : écrans du commerçant). */
(function () {
  "use strict";
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const TEL = "212620666027";
  const lire = k => { try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } };
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("patron") === "1") { localStorage.setItem("nfcwork-patron", "1"); q.delete("patron"); history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash); }
  } catch (e) {}
  window.NFCW_PATRON = () => lire("nfcwork-patron") || lire("nfcwork-fid-pro") || lire("nfcwork-admin");
  window.NFCW_PREAVIS = function (preavis, expire, ecranPatron) {
    if (!ecranPatron && !window.NFCW_PATRON()) return;
    preavis = String(preavis || ""); expire = String(expire || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(preavis) || !/^\d{4}-\d{2}-\d{2}$/.test(expire)) return;
    const auj = iso(new Date());
    if (auj < preavis || auj > expire) return;
    if (document.getElementById("nfcw-preavis")) return;
    const [y, m, j] = expire.split("-").map(Number), fin = new Date(y, m - 1, j + 1, 0, 0, 0);   // coupure : fin du jour « expire »
    const st = document.createElement("style");
    st.textContent = `#nfcw-preavis{position:fixed;inset:0;z-index:2147483000;background:rgba(5,8,15,.72);display:flex;align-items:center;justify-content:center;padding:18px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
#nfcw-preavis .bx{width:100%;max-width:380px;background:#0b1220;color:#e9effa;border:2px solid #ff4d5e;border-radius:22px;padding:24px 20px 18px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#nfcw-preavis .ic{width:64px;height:64px;margin:0 auto 10px;border-radius:50%;background:#ff4d5e;display:grid;place-items:center;font-size:34px;animation:npv 1s ease-in-out infinite alternate}
@keyframes npv{from{transform:scale(1)}to{transform:scale(1.08)}}
#nfcw-preavis h2{margin:0 0 6px;font-size:21px;line-height:1.25}
#nfcw-preavis p{margin:0 0 12px;color:#b8c5de;font-size:14.5px;line-height:1.45}
#nfcw-preavis .cd{font:800 34px/1.1 ui-monospace,Menlo,monospace;color:#ff6b7a;letter-spacing:.04em;margin:6px 0 4px}
#nfcw-preavis .lb{font-size:12px;color:#93a3be;margin-bottom:14px}
#nfcw-preavis a,#nfcw-preavis button{display:block;width:100%;border:0;border-radius:14px;padding:13px;font:700 15.5px system-ui,sans-serif;text-decoration:none;cursor:pointer}
#nfcw-preavis a{background:#25d366;color:#06301a;margin-bottom:8px}
#nfcw-preavis button{background:#1d2b45;color:#e9effa}
#nfcw-preavis .ar{direction:rtl;font-size:14px;color:#b8c5de;margin:-4px 0 12px}
#nfcw-bar{position:fixed;left:0;right:0;top:0;z-index:2147482999;background:#ff4d5e;color:#fff;text-align:center;font:700 13px system-ui,sans-serif;padding:7px 10px;cursor:pointer}`;
    document.head.appendChild(st);
    const d = document.createElement("div"); d.id = "nfcw-preavis";
    d.innerHTML = `<div class="bx" role="alertdialog" aria-modal="true"><div class="ic">⚠️</div>
      <h2>Service bientôt suspendu</h2>
      <p>Ce service NFCWORK sera suspendu automatiquement dans :</p>
      <div class="cd" id="nfcw-cd">--:--:--</div><div class="lb">heures · minutes · secondes</div>
      <p><b>Responsable du commerce :</b> merci de contacter le fondateur NFCWORK pour éviter la coupure.</p>
      <p class="ar">الخدمة غادي تتوقف أوتوماتيكياً. مول المحل خاصو يتواصل مع المؤسس ديال NFCWORK.</p>
      <a href="https://wa.me/${TEL}?text=${encodeURIComponent("Bonjour, j’ai vu l’avis de suspension du service NFCWORK : " + location.href)}" target="_blank" rel="noopener">📲 Contacter le fondateur (WhatsApp)</a>
      <button type="button" id="nfcw-ok">Continuer</button></div>`;
    const bar = document.createElement("div"); bar.id = "nfcw-bar";
    document.body.appendChild(d);
    const tick = () => {
      const s = Math.max(0, Math.floor((fin - Date.now()) / 1000)), h = Math.floor(s / 3600), mn = Math.floor(s % 3600 / 60), sc = s % 60;
      const t = `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}:${String(sc).padStart(2, "0")}`;
      const c = document.getElementById("nfcw-cd"); if (c) c.textContent = t;
      bar.textContent = `⚠️ Service suspendu dans ${h} h ${String(mn).padStart(2, "0")} min · Responsable : contactez NFCWORK`;
      if (s === 0) location.reload();
    };
    tick(); setInterval(tick, 1000);
    document.getElementById("nfcw-ok").onclick = () => { d.remove(); document.body.appendChild(bar); };
    bar.onclick = () => document.body.appendChild(d);
  };
})();
