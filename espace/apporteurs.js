/* =========================================================
   NFCWORK — APPORTEURS (parrainage), admin
   Chaque apporteur a un code et un lien : nfcwork.ma/?ref=CODE
   Le site garde le code et l'ajoute aux messages WhatsApp (« Code apporteur : CODE »).
   On note ici les clients qu'il a apportés et la commission (payée ou non).
   Firestore : settings/apporteurs { json: "[{code, nom, tel, commission, clients:[{nom, date, montant, paye}]}]" }
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const app = $("#app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600); }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
  const NOW = () => firebase.firestore.FieldValue.serverTimestamp();
  const SITE = "https://nfcwork.ma";
  const auj = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const waNum = t => { let d = String(t || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 11 ? d : ""; };
  let L = [];

  auth.onAuthStateChanged(async u => {
    if (!u) { login(); return; }
    if ((u.email || "").toLowerCase() !== ADMIN) { app.innerHTML = `<div class="empty"><h3>Accès réservé</h3><p>Page réservée à l’administrateur NFCWORK.</p><a class="btn" href="./">Retour</a></div>`; return; }
    try { const d = await db.doc("settings/apporteurs").get(); L = d.exists ? JSON.parse(d.data().json || "[]") : []; } catch (e) { L = []; }
    rendre();
  });
  function login() {
    app.innerHTML = `<div class="auth paper"><h2>Connexion</h2><form id="lf" class="stack"><label class="f">E-mail<input id="le" type="email" required></label>
      <label class="f">Mot de passe<input id="lp" type="password" required></label><p class="err" id="lerr"></p><button class="btn primary">Se connecter</button></form></div>`;
    $("#lf").onsubmit = async e => { e.preventDefault(); try { await auth.signInWithEmailAndPassword($("#le").value.trim(), $("#lp").value); } catch (x) { $("#lerr").textContent = "E-mail ou mot de passe incorrect."; } };
  }
  const sauver = async () => { await db.doc("settings/apporteurs").set({ json: JSON.stringify(L), maj: NOW() }); };
  const lien = a => SITE + "/?ref=" + a.code;
  const du = a => (a.clients || []).filter(c => !c.paye).reduce((s, c) => s + (+c.montant || 0), 0);

  function rendre() {
    const tot = L.reduce((s, a) => s + du(a), 0), nb = L.reduce((s, a) => s + (a.clients || []).length, 0);
    app.innerHTML = `<div><h2>Apporteurs</h2><p class="muted">Ils vous envoient des commerces, vous leur donnez une commission. Chacun a son lien : quand le commerce vous écrit sur WhatsApp depuis le site, son code apparaît dans le message.</p></div>
      <div class="kp"><div><b>${L.length}</b><small>Apporteurs</small></div><div><b>${nb}</b><small>Clients apportés</small></div><div><b>${tot} DH</b><small>À payer</small></div></div>
      ${L.length ? `<div class="alist">${L.map((a, i) => `<div class="paper acard">
        <div class="row between"><b style="font-size:18px">${esc(a.nom)}</b><span class="pill pro">${esc(a.code)}</span></div>
        <div class="muted" style="font-size:13px">${esc(a.tel || "")} · commission ${esc(a.commission || 0)} DH par client</div>
        <div class="lien">${esc(lien(a).replace(/^https:\/\//, ""))}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-copier="${i}">📋 Copier le lien</button>${waNum(a.tel) ? `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${waNum(a.tel)}?text=${encodeURIComponent(`Salam ${a.nom} 👋 Voici ton lien NFCWORK : ${lien(a)}\nChaque commerce qui signe avec ce lien = ${a.commission || 0} DH pour toi 💰`)}">📲 Envoyer</a>` : ""}<button class="btn sm primary" data-client="${i}">＋ Client apporté</button><button class="btn sm ghost" data-suppr="${i}">🗑</button></div>
        ${(a.clients || []).map((c, j) => `<div class="cl"><span class="n"><b>${esc(c.nom)}</b> <small class="muted">${esc(c.date || "")}</small></span><b>${esc(c.montant || 0)} DH</b><button class="btn sm ${c.paye ? "ghost" : "primary"}" data-paye="${i}:${j}">${c.paye ? "✓ Payé" : "Marquer payé"}</button></div>`).join("")}
        ${du(a) ? `<div style="margin-top:8px;font-weight:700;color:#ffc542">À lui payer : ${du(a)} DH</div>` : ""}
      </div>`).join("")}</div>`
      : `<div class="empty paper"><h3>Aucun apporteur</h3><p>Ajoutez un ami, un client content ou un commercial : il reçoit son lien et gagne une commission.</p></div>`}`;
  }
  function formulaire() {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box"><h2>Nouvel apporteur</h2><form class="stack" id="af">
      <label class="f">Nom<input id="a-nom" required maxlength="40"></label>
      <label class="f">Téléphone (WhatsApp)<input id="a-tel" type="tel" maxlength="20" placeholder="06…"></label>
      <label class="f">Commission par client signé (DH)<input id="a-com" type="number" min="0" value="150" inputmode="numeric"></label>
      <div class="row"><button class="btn primary" style="flex:1">Créer</button><button type="button" class="btn ghost" data-x>Annuler</button></div></form></div>`;
    document.body.appendChild(d);
    d.onclick = e => { if (e.target === d || e.target.closest("[data-x]")) d.remove(); };
    $("#af", d).onsubmit = async e => {
      e.preventDefault();
      const nom = $("#a-nom", d).value.trim(); let base = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6) || "REF";
      let code = base, k = 1; while (L.some(a => a.code === code)) code = base + (++k);
      L.push({ code, nom, tel: $("#a-tel", d).value.trim(), commission: +$("#a-com", d).value || 0, clients: [], cree: auj() });
      try { await sauver(); d.remove(); rendre(); toast("Apporteur créé ✓"); } catch (x) { toast("Échec de l’enregistrement."); L.pop(); }
    };
  }
  $("#nouveau").onclick = formulaire;
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-copier],[data-client],[data-paye],[data-suppr]"); if (!b) return;
    if (b.dataset.copier != null) { const l = lien(L[+b.dataset.copier]); try { await navigator.clipboard.writeText(l); toast("Lien copié ✓"); } catch (x) { prompt("Copiez le lien :", l); } return; }
    if (b.dataset.client != null) {
      const a = L[+b.dataset.client], nom = prompt("Nom du commerce apporté :"); if (!nom) return;
      const m = prompt("Commission (DH) :", a.commission || 0); if (m === null) return;
      a.clients = a.clients || []; a.clients.push({ nom: nom.trim(), date: auj(), montant: +m || 0, paye: false });
    } else if (b.dataset.paye) { const [i, j] = b.dataset.paye.split(":").map(Number); const c = L[i].clients[j]; c.paye = !c.paye; }
    else if (b.dataset.suppr != null) { if (!confirm("Supprimer cet apporteur ?")) return; L.splice(+b.dataset.suppr, 1); }
    try { await sauver(); rendre(); toast("Enregistré ✓"); } catch (x) { toast("Échec de l’enregistrement."); }
  });
})();
