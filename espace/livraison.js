(function () {
  "use strict";
  // Outil admin : créer une livraison traçable pour n'importe quel resto (même menu photo / WhatsApp).
  // Écrit une commande dans Firestore et génère le lien livreur + le lien de suivi client.
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  const ADMIN = String(window.ADMIN_EMAIL || "").trim().toLowerCase();
  const NOW = () => firebase.firestore.FieldValue.serverTimestamp();
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wa = t => String(t || "").replace(/\D/g, "").replace(/^0/, "212");
  let user = null, menus = [], livreurs = [];

  function toast(m, bad) { const t = document.getElementById("toast"); if (!t) return; t.textContent = m; t.hidden = false; t.className = bad ? "bad" : "ok"; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2500); }

  auth.onAuthStateChanged(u => { user = u; if (!u) return login(); if ((u.email || "").toLowerCase() !== ADMIN) return refuse(); charger(); });
  function refuse() { app.innerHTML = '<div class="empty paper"><h3>Accès réservé</h3><p>Connectez-vous en administrateur.</p><button class="btn" id="o">Changer de compte</button></div>'; const o = document.getElementById("o"); if (o) o.onclick = () => auth.signOut(); }
  function login() {
    app.innerHTML = '<div class="auth paper"><h2>Connexion</h2><form id="lf" class="stack"><label class="f">E-mail<input id="le" type="email" required></label><label class="f">Mot de passe<input id="lp" type="password" required></label><p class="err" id="er"></p><button class="btn primary">Se connecter</button></form></div>';
    document.getElementById("lf").onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true; try { await auth.signInWithEmailAndPassword(document.getElementById("le").value.trim(), document.getElementById("lp").value); } catch (x) { document.getElementById("er").textContent = "Identifiants incorrects."; b.disabled = false; } };
  }

  async function charger() {
    try { const d = await db.doc("settings/menus").get(); menus = (d.exists ? JSON.parse(d.data().json || "[]") : []).filter(m => m && m.slug && !m.corb && !m.arch); } catch (e) { menus = []; }
    livreurs = [];
    try { const d = await db.doc("settings/livreurs").get(); if (d.exists) livreurs = livreurs.concat(JSON.parse(d.data().json || "[]")); } catch (e) {}
    try { const d = await db.doc("settings/charikat").get(); if (d.exists) JSON.parse(d.data().json || "[]").forEach(s => { if (s.actif !== false) (s.livreurs || []).forEach(l => { if (l.actif !== false) livreurs.push({ nom: l.nom + " (" + s.nom + ")", tel: l.tel, part: s.part || "" }); }); }); } catch (e) {}
    livreurs = livreurs.filter(l => l && l.nom);
    form();
  }

  function form() {
    app.innerHTML = '<form class="lv-f" id="f">' +
      '<div><label>Restaurant</label><select id="f-resto" required>' + menus.map(m => '<option value="' + esc(m.slug) + '">' + esc(m.nom || m.slug) + '</option>').join("") + '</select></div>' +
      '<div class="lv-row"><div><label>Nom du client</label><input id="f-nom" maxlength="60" required></div><div><label>Téléphone</label><input id="f-tel" type="tel" inputmode="tel" maxlength="20" required></div></div>' +
      '<div><label>Adresse</label><input id="f-adr" maxlength="200" placeholder="Quartier, rue, immeuble…"></div>' +
      '<div class="lv-row"><div><label>Sous-total plats (DH)</label><input id="f-tot" inputmode="decimal" maxlength="8" placeholder="0"></div><div><label>Frais livraison (DH)</label><input id="f-frais" inputmode="decimal" maxlength="8" placeholder="0"></div></div>' +
      '<div><label>Paiement</label><select id="f-pay"><option value="cash">💵 Cash</option><option value="virement">🏦 Virement</option></select></div>' +
      '<div><label>Livreur</label><select id="f-liv">' + (livreurs.length ? '<option value="">— Choisir —</option>' + livreurs.map((l, i) => '<option value="' + i + '">' + esc(l.nom) + (l.tel ? " · " + esc(l.tel) : "") + '</option>').join("") : '') + '<option value="autre">+ Autre (saisir)</option></select></div>' +
      '<div class="lv-row" id="f-livm" hidden><div><label>Nom livreur</label><input id="f-livn" maxlength="40"></div><div><label>Tél livreur</label><input id="f-livt" type="tel" maxlength="20"></div></div>' +
      '<button class="btn primary" style="margin-top:4px">🛵 Créer la livraison</button></form>';
    const sel = document.getElementById("f-liv"), m = document.getElementById("f-livm");
    sel.onchange = () => { m.hidden = sel.value !== "autre"; };
    document.getElementById("f").onsubmit = creer;
  }

  async function creer(e) {
    e.preventDefault();
    const slug = document.getElementById("f-resto").value;
    const nom = document.getElementById("f-nom").value.trim(), tel = document.getElementById("f-tel").value.trim(), adr = document.getElementById("f-adr").value.trim();
    const plats = parseFloat(document.getElementById("f-tot").value) || 0, frais = parseFloat(document.getElementById("f-frais").value) || 0, pay = document.getElementById("f-pay").value;
    const tot = plats + frais;
    const sv = document.getElementById("f-liv").value;
    let livNom = "", livTel = "", part = "";
    if (sv === "autre") { livNom = document.getElementById("f-livn").value.trim(); livTel = document.getElementById("f-livt").value.trim(); }
    else if (sv !== "") { const l = livreurs[+sv] || {}; livNom = (l.nom || "").replace(/\s*\(.*\)$/, ""); livTel = l.tel || ""; part = l.part || ""; }
    if (!nom || !tel) { toast("Nom et téléphone du client requis.", true); return; }
    const btn = e.target.querySelector("button"); btn.disabled = true; btn.textContent = "Création…";
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const num = String(Date.now() % 10000).padStart(4, "0");
    const o = { statut: livNom ? "enroute" : "prete", source: "manuel", num, cree: new Date(), mode: "livraison", table: "", nom, tel, adresse: adr, pos: "", note: "", items: [], total: Math.round(tot * 100) / 100, frais: Math.round(frais * 100) / 100, part: part ? String(part) : "", devise: "DH", pay, code, livreurNom: livNom, livreurTel: livTel, maj: NOW(), par: user.email };
    try {
      const ref = db.collection("commandes").doc(slug).collection("liste").doc();
      await ref.set(o);
      resultat(slug, ref.id, code, { nom, tel, adr, tot, pay, livNom, livTel });
    } catch (x) { console.error(x); toast("Échec : " + (x.message || x), true); btn.disabled = false; btn.textContent = "🛵 Créer la livraison"; }
  }

  function resultat(slug, oid, code, d) {
    const suivi = location.origin + "/suivi/?s=" + encodeURIComponent(slug) + "&o=" + encodeURIComponent(oid);
    const livlien = location.origin + "/livreur/?s=" + encodeURIComponent(slug) + "&o=" + encodeURIComponent(oid) + "&c=" + encodeURIComponent(code);
    const waLiv = d.livTel ? 'https://wa.me/' + wa(d.livTel) + '?text=' + encodeURIComponent("🛵 Nouvelle livraison\nClient : " + d.nom + " " + d.tel + (d.adr ? "\nAdresse : " + d.adr : "") + "\nMontant : " + d.tot + " DH (" + (d.pay === "virement" ? "Virement" : "Cash") + ")\n\n👉 Détails + GPS : " + livlien) : "";
    const waCli = 'https://wa.me/' + wa(d.tel) + '?text=' + encodeURIComponent("Votre commande est en route 🛵\nSuivez-la ici : " + suivi + "\nVotre code de livraison : " + code);
    app.innerHTML = '<div class="lv-res"><h3>✅ Livraison créée</h3>' +
      '<div class="lv-code"><small>Code de livraison</small><b>' + esc(code) + '</b></div>' +
      '<label style="font-size:12px;font-weight:700;color:var(--muted,#8a93a6)">📍 Lien de suivi (à envoyer au client)</label>' +
      '<div class="lv-link"><code>' + esc(suivi) + '</code><button class="btn sm" data-c="' + esc(suivi) + '">Copier</button></div>' +
      '<a class="btn" style="width:100%;margin-bottom:12px" target="_blank" rel="noopener" href="' + waCli + '">📲 Envoyer le suivi au client (WhatsApp)</a>' +
      (d.livNom ? '<label style="font-size:12px;font-weight:700;color:var(--muted,#8a93a6)">🛵 Lien livreur</label><div class="lv-link"><code>' + esc(livlien) + '</code><button class="btn sm" data-c="' + esc(livlien) + '">Copier</button></div>' + (waLiv ? '<a class="btn primary" style="width:100%;margin-bottom:12px" target="_blank" rel="noopener" href="' + waLiv + '">📲 Envoyer au livreur (WhatsApp)</a>' : "") : '<p class="muted" style="font-size:13px">Aucun livreur assigné — vous pourrez le faire plus tard.</p>') +
      '<button class="btn" id="again" style="width:100%">+ Nouvelle livraison</button></div>';
    app.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { const t = b.dataset.c; try { navigator.clipboard.writeText(t).then(() => { b.textContent = "Copié ✓"; setTimeout(() => b.textContent = "Copier", 1500); }); } catch (e) {} });
    document.getElementById("again").onclick = form;
  }
})();
