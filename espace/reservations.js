/* =========================================================
   NFCWORK — RÉSERVATIONS (Espace du commerçant)
   Le client réserve sur sa page /p/<slug> (type « rdv ») → reservations/{id} + rdvOccupe/{id}.
   Ici : confirmer ✓ / refuser ✕, agenda du jour (par coiffeuse ou par table), « Arrivé +1 » (carte fidélité),
   rappels de demain sur WhatsApp, fidélité et statistiques au même endroit.
   Commerçant : e-mail = ownerEmail de la page. Admin : toutes les pages.
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
  const inc = n => firebase.firestore.FieldValue.increment(n);
  const SITE = "https://nfcwork.ma", WALLET = window.NFCW_WALLET || "";
  const cle = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deCle = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const plus = (k, n) => { const d = deCle(k); d.setDate(d.getDate() + n); return cle(d); };
  const auj = () => cle(new Date());
  const NJ = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."], NJL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const jourLong = k => { const d = deCle(k); return NJL[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()]; };
  const lab = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const hm = s => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const fdur = m => !m ? "" : m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") : "");
  const waNum = t => { let d = String(t || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); if (d.length === 9) d = "212" + d; return d.length >= 11 ? d : ""; };
  const emo = t => { const m = String(t || "").match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u); return m ? [m[1], m[2] || t] : ["", String(t || "")]; };
  const lignes = t => String(t || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
  const ACTIF = r => r.statut === "attente" || r.statut === "confirmee" || r.statut === "venu";

  let user = null, email = "", admin = false;
  const PAGES = {};          // slug → config de la page
  let R = [];                // réservations
  const FID = {};            // pid → { prog, cartes: [] }
  let tab = "res", jour = auj(), filtre = "", mois = auj().slice(0, 7), cherche = "";
  const subs = [];

  auth.onAuthStateChanged(async u => {
    subs.splice(0).forEach(f => f());
    if (!u) { login(); return; }
    user = u; email = (u.email || "").toLowerCase(); admin = email === ADMIN;
    try { localStorage.setItem("nfcwork-patron", "1"); } catch (e) {}
    await chargerPages();
    ecouter();
  });
  function login() {
    app.innerHTML = `<div class="auth paper"><h2>Connexion</h2><p class="muted">Connectez-vous avec le compte de votre Espace pour voir vos réservations.</p><form id="lf" class="stack"><label class="f">E-mail<input id="le" type="email" required autocapitalize="off"></label>
      <label class="f">Mot de passe<input id="lp" type="password" required></label><p class="err" id="lerr"></p><button class="btn primary">Se connecter</button></form></div>`;
    $("#lf").onsubmit = async e => { e.preventDefault(); try { await auth.signInWithEmailAndPassword($("#le").value.trim(), $("#lp").value); } catch (x) { $("#lerr").textContent = "E-mail ou mot de passe incorrect."; } };
  }
  function ajouterPage(d) { if (!d || !d.exists) return; try { const P = JSON.parse(d.data().json || "{}"); if (P.type === "rdv" && P.slug) { PAGES[P.slug] = P; fidelite(P.fidPid); } } catch (e) {} }
  async function chargerPages() {
    try {
      if (admin) {
        const l = await db.doc("settings/pages").get(), liste = l.exists ? JSON.parse(l.data().json || "[]") : [];
        (await Promise.all(liste.filter(x => x.type === "rdv").map(x => db.doc("settings/page-" + x.slug).get().catch(() => null)))).forEach(ajouterPage);
      } else (await db.collection("settings").where("ownerEmail", "==", email).get()).docs.forEach(ajouterPage);
    } catch (e) { console.warn("pages", e); }
  }
  function ecouter() {
    const q = admin ? db.collection("reservations") : db.collection("reservations").where("ownerEmail", "==", email);
    let premier = true;
    subs.push(q.onSnapshot(s => {
      const avant = new Set(R.map(r => r.id));
      R = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
      // pages inconnues (réservation d'une page pas encore chargée)
      for (const slug of new Set(R.map(r => r.page))) if (slug && !PAGES[slug]) { PAGES[slug] = { slug, nom: slug, _tmp: 1 }; db.doc("settings/page-" + slug).get().then(d => { ajouterPage(d); rendre(); }).catch(() => {}); }
      if (!premier && R.some(r => !avant.has(r.id) && r.statut === "attente")) { toast("📅 Nouvelle réservation !"); try { navigator.vibrate && navigator.vibrate(200); } catch (e) {} }
      premier = false; rendre();
    }, e => { console.error(e); app.innerHTML = `<div class="empty paper"><h3>Accès refusé</h3><p>Les réservations ne sont pas encore activées pour ce compte. Contactez NFCWORK.</p><a class="btn" href="./">Retour</a></div>`; }));
    rendre();
  }
  function fidelite(pid) {
    if (!pid || FID[pid]) return;
    FID[pid] = { prog: null, cartes: [] };
    db.doc("fidProgrammes/" + pid).get().then(d => { if (d.exists) { FID[pid].prog = Object.assign({ id: d.id }, d.data()); rendre(); } }).catch(() => {});
    const q = db.collection("fidCartes").where("pid", "==", pid);
    subs.push((admin ? q : q.where("ownerEmail", "==", email)).onSnapshot(s => { FID[pid].cartes = s.docs.map(d => Object.assign({ id: d.id }, d.data())); if (tab === "fid") rendre(); }, e => console.warn("fidCartes", e)));
  }

  /* ---------- rendu ---------- */
  const pagesVues = () => Object.values(PAGES).filter(p => !filtre || p.slug === filtre);
  const RF = () => R.filter(r => !filtre || r.page === filtre);
  const quoi = r => r.mode === "tables" ? emo(r.ressource)[1] : r.service || "Rendez-vous";
  const tri = (a, b) => (a.jour + String(a.debutMin || hm(a.debut)).padStart(5, "0")).localeCompare(b.jour + String(b.debutMin || hm(b.debut)).padStart(5, "0"));
  const unite = p => p.unite || (p.type === "montant" ? "points" : p.type === "articles" ? "articles" : "visites");
  const carteDe = r => { const P = PAGES[r.page] || {}, F = P.fidPid && FID[P.fidPid]; if (!F) return null; return F.cartes.find(c => c.id === r.fid) || F.cartes.find(c => String(c.tel || "").replace(/\D/g, "").slice(-9) === String(r.tel || "").replace(/\D/g, "").slice(-9)) || null; };

  function rendre() {
    const pv = Object.values(PAGES);
    const un = pv.length === 1 ? pv[0] : filtre && PAGES[filtre];
    $("#topTitle").textContent = un ? un.nom || "Réservations" : "Réservations";
    $("#topSub").textContent = "Mon Espace · " + jourLong(auj());
    $("#rappels").hidden = tab !== "res" || !R.length;
    if (!pv.length && !R.length) {
      app.innerHTML = `<div class="empty paper"><h3>Pas encore de page de réservation</h3><p>Demandez à NFCWORK d’activer la réservation en ligne pour votre commerce : vos clients réservent depuis leur téléphone et tout arrive ici.</p><a class="btn primary" href="https://wa.me/212620666027?text=${encodeURIComponent("Salam, je veux activer la réservation en ligne pour mon commerce 📅")}" target="_blank" rel="noopener">📲 Demander</a></div>`;
      return;
    }
    app.innerHTML = `${pv.length > 1 ? `<div class="pg"><button class="chip" aria-pressed="${!filtre}" data-pg="">Toutes</button>${pv.map(p => `<button class="chip" aria-pressed="${filtre === p.slug}" data-pg="${esc(p.slug)}">${esc(p.nom || p.slug)}</button>`).join("")}</div>` : ""}
      <div class="tabs"><button data-tab="res" aria-pressed="${tab === "res"}">📅 ${pagesVues().every(p => p.mode === "tables") ? "Réservations" : "Agenda"}</button><button data-tab="fid" aria-pressed="${tab === "fid"}">🎁 Fidélité</button><button data-tab="sta" aria-pressed="${tab === "sta"}">📊 Stats</button></div>
      <div id="corps"></div>`;
    const c = $("#corps");
    if (tab === "res") c.innerHTML = vueRes(); else if (tab === "fid") c.innerHTML = vueFid(); else c.innerHTML = vueStats();
    const s = $("#fq"); if (s) { s.oninput = () => { cherche = s.value; const l = $("#flist"); if (l) l.innerHTML = listeCartes(); }; }
  }

  function ligne(r, avecJour) {
    const fin = (r.debutMin || hm(r.debut)) + (+r.duree || 0), wa = waNum(r.tel);
    const ca = carteDe(r), F = ca && FID[ca.pid], prog = F && F.prog;
    const sous = [fdur(r.duree), r.prix ? r.prix + " DH" : "", r.mode !== "tables" && r.staff && avecJour ? r.staff : "", ca && prog ? `${ca.points || 0}/${prog.objectif || 10} ${unite(prog)}` : r.fid || !PAGES[r.page] || !PAGES[r.page].fidPid ? "" : "nouveau client"].filter(Boolean).join(" · ");
    let act = "";
    if (r.statut === "attente") act = `<button class="ic ok" data-ok="${r.id}" aria-label="Confirmer">✓</button><button class="ic no" data-non="${r.id}" aria-label="Refuser">✕</button>`;
    else if (r.statut === "confirmee") act = `${wa ? `<a class="ic" href="https://wa.me/${wa}?text=${encodeURIComponent(msgConf(r))}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ""}${r.jour <= auj() ? `<button class="tag arr" data-arr="${r.id}">Arrivé ? +1</button>` : `<span class="tag c">Confirmé</span>`}<button class="ic no" data-ann="${r.id}" aria-label="Annuler">✕</button>`;
    else if (r.statut === "venu") act = `<span class="tag v">Venu ✓</span>`;
    else act = `<span class="tag r">${r.statut === "annulee" ? "Annulé" : "Refusé"}</span>`;
    return `<div class="rv"${ACTIF(r) ? "" : ' style="opacity:.55"'}><div class="h">${esc(r.debut)}${avecJour ? `<small>${esc(NJ[deCle(r.jour).getDay()] + " " + deCle(r.jour).getDate())}</small>` : `<small>→ ${lab(fin)}</small>`}</div>
      <div class="q"><b>${esc(r.nom)} · ${esc(quoi(r))}</b><small>${esc(sous)}</small></div><div class="a">${act}</div></div>`;
  }
  const msgConf = r => { const P = PAGES[r.page] || {}; return `Bonjour ${r.nom} 👋\nVotre réservation chez ${P.nom || "nous"} est confirmée ✅\n🗓 ${jourLong(r.jour)} à ${r.debut}\n${r.mode === "tables" ? "🎱 " + emo(r.ressource)[1] : "✂️ " + (r.service || "") + (r.staff ? " avec " + r.staff : "")}\nÀ bientôt !`; };
  const msgRappel = r => { const P = PAGES[r.page] || {}; return `Bonjour ${r.nom} 👋\nPetit rappel : votre réservation chez ${P.nom || "nous"} c’est demain, ${jourLong(r.jour)} à ${r.debut} (${quoi(r)}${r.staff ? " avec " + r.staff : ""}).\nÀ demain ! Si vous ne pouvez pas venir, prévenez-nous ici 🙏`; };

  function vueRes() {
    const L = RF(), A = L.filter(r => r.statut === "attente" && r.jour >= auj()).sort(tri);
    const J = L.filter(r => r.jour === jour).sort(tri), JA = J.filter(ACTIF);
    const pages = pagesVues(), tables = pages.length && pages.every(p => p.mode === "tables");
    let k3;
    if (tables) {
      const cap = pages.reduce((s, p) => { const o = hm(p.ouverture) ?? 540; let f = hm(p.fermeture) ?? 1260; if (f <= o) f += 1440; return s + Math.max(1, lignes(p.ressources).length) * (f - o); }, 0);
      const pris = JA.reduce((s, r) => s + (+r.duree || 0), 0);
      k3 = `<div><b>${cap ? Math.round(pris * 100 / cap) : 0}%</b><small>Tables pleines</small></div>`;
    } else k3 = `<div><b>${JA.reduce((s, r) => s + (+r.prix || 0), 0).toLocaleString("fr-FR")}</b><small>DH prévus</small></div>`;
    const jours = []; for (let i = -1; i < 14; i++) jours.push(plus(auj(), i));
    const att = j => L.filter(r => r.jour === j && r.statut === "attente").length;
    const nbJ = j => L.filter(r => r.jour === j && ACTIF(r)).length;
    // regroupement : par coiffeuse (salon avec équipe) sinon liste simple
    const conf = J.filter(r => r.statut !== "attente");
    let blocs = "";
    if (!tables && conf.some(r => r.staff)) {
      const G = {}; conf.forEach(r => (G[r.staff || "—"] = G[r.staff || "—"] || []).push(r));
      blocs = Object.keys(G).sort().map(s => `<div class="sh">👤 ${esc(s)}</div>${G[s].map(r => ligne(r)).join("")}`).join("");
    } else if (conf.length) blocs = `<div class="sh">${tables ? "Confirmées" : "Rendez-vous"}</div>${conf.map(r => ligne(r)).join("")}`;
    const liens = pages.filter(p => !p._tmp).map(p => `<div class="lnk">${esc("nfcwork.ma/p/" + p.slug)}</div>`).join("");
    return `<div class="kp"><div><b>${jour === auj() ? JA.length : JA.length}</b><small>${jour === auj() ? "Aujourd’hui" : esc(NJ[deCle(jour).getDay()] + " " + deCle(jour).getDate())}</small></div><div><b>${A.length}</b><small>À confirmer</small></div>${k3}</div>
      <div class="days">${jours.map(j => `<button data-jour="${j}" aria-pressed="${jour === j}"><small>${j === auj() ? "auj." : NJ[deCle(j).getDay()]}</small><b>${deCle(j).getDate()}</b>${att(j) ? `<i>${att(j)}</i>` : nbJ(j) ? `<small style="font-size:10px">${nbJ(j)} rés.</small>` : ""}</button>`).join("")}</div>
      ${A.length ? `<div class="sh">À confirmer</div>${A.map(r => ligne(r, true)).join("")}` : ""}
      ${blocs || (A.length ? "" : `<div class="empty paper" style="margin-top:14px"><h3>Rien ce jour-là</h3><p>Partagez votre lien de réservation (Instagram, WhatsApp, plaque NFC) :</p>${liens}</div>`)}
      ${blocs && liens ? `<details style="margin-top:16px"><summary class="muted" style="cursor:pointer">🔗 Mon lien de réservation</summary>${liens}</details>` : ""}`;
  }

  function listeCartes() {
    let h = "";
    for (const p of pagesVues()) {
      const F = p.fidPid && FID[p.fidPid]; if (!F || !F.prog) continue;
      const prog = F.prog, obj = Math.max(1, prog.objectif || 10), q = cherche.trim().toLowerCase();
      const L = F.cartes.filter(c => !q || String(c.nom || "").toLowerCase().includes(q) || String(c.tel || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "#"))
        .sort((a, b) => ((b.points || 0) >= obj) - ((a.points || 0) >= obj) || ((b.lastAt && b.lastAt.seconds) || 0) - ((a.lastAt && a.lastAt.seconds) || 0)).slice(0, 40);
      h += L.map(c => { const pret = (c.points || 0) >= obj; return `<div class="fc"><div class="q"><b>${esc(c.nom || "Client")}</b> · <small>${pret ? "🎁 cadeau prêt" : `${c.points || 0}/${obj} ${esc(unite(prog))}`}</small></div>
        ${pret ? `<button class="btn sm primary" data-offrir="${c.id}" data-pid="${esc(p.fidPid)}">Offrir</button>` : `<button class="btn sm primary" data-plus="${c.id}">+1</button>`}</div>`; }).join("") || `<p class="muted">Aucune carte${q ? " trouvée" : " pour l’instant"}.</p>`;
    }
    return h;
  }
  function vueFid() {
    const pv = pagesVues().filter(p => p.fidPid && FID[p.fidPid] && FID[p.fidPid].prog);
    if (!pv.length) return `<div class="empty paper"><h3>Pas de carte fidélité liée</h3><p>Avec la carte fidélité, chaque client qui réserve gagne des points, et vous le faites revenir.</p><a class="btn primary" href="https://wa.me/212620666027?text=${encodeURIComponent("Salam, je veux la carte fidélité avec mes réservations 🎁")}" target="_blank" rel="noopener">📲 Demander à NFCWORK</a></div>`;
    const prog = FID[pv[0].fidPid].prog, C = pv.flatMap(p => FID[p.fidPid].cartes), obj = Math.max(1, prog.objectif || 10);
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
    const actifs = C.filter(c => c.lastAt && c.lastAt.seconds * 1000 >= m0.getTime()).length;
    return `<div class="kp"><div><b>${C.length}</b><small>Cartes</small></div><div><b>${C.filter(c => (c.points || 0) >= obj).length}</b><small>Cadeaux prêts</small></div><div><b>${actifs}</b><small>Venus ce mois</small></div></div>
      <p class="muted" style="font-size:13.5px;margin:0 0 10px">🎁 ${esc(prog.objectif)} ${esc(unite(prog))} = ${esc(prog.recompense || "")}</p>
      <label class="f"><input id="fq" placeholder="🔎 Chercher un client (nom ou téléphone)" value="${esc(cherche)}"></label>
      <div id="flist" style="margin-top:10px">${listeCartes()}</div>
      <a class="btn" href="fidelite.html" style="margin-top:12px;display:flex;justify-content:center;width:100%;white-space:normal;text-align:center">⭐ Fidélité complète : scanner, employés, messages</a>`;
  }

  function vueStats() {
    const L = RF().filter(r => r.jour.slice(0, 7) === mois), A = L.filter(ACTIF);
    const venus = L.filter(r => r.statut === "venu").length, absents = L.filter(r => r.statut === "confirmee" && r.jour < auj()).length;
    const non = L.filter(r => r.statut === "refusee" || r.statut === "annulee").length;
    const ca = A.reduce((s, r) => s + (+r.prix || 0), 0);
    const premiers = {}; RF().slice().sort(tri).forEach(r => { const t = String(r.tel || "").replace(/\D/g, "").slice(-9); if (t && !premiers[t]) premiers[t] = r.jour.slice(0, 7); });
    const nouveaux = Object.values(premiers).filter(m => m === mois).length;
    const barres = (titre, obj) => { const e = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8), mx = Math.max(1, ...e.map(x => x[1])); return e.length ? `<div class="sh">${titre}</div><div class="paper" style="padding:12px;border-radius:14px"><div class="bars">${e.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><div><i style="width:${Math.round(v * 100 / mx)}%"></i></div><b>${v}</b></div>`).join("")}</div></div>` : ""; };
    const cpt = f => A.reduce((o, r) => { const k = f(r); if (k) o[k] = (o[k] || 0) + 1; return o; }, {});
    const [y, m] = mois.split("-").map(Number);
    const autre = n => { const d = new Date(y, m - 1 + n, 1); return cle(d).slice(0, 7); };
    return `<div class="row between" style="margin-bottom:6px"><button class="btn sm ghost" data-mois="${autre(-1)}">‹</button><b style="text-transform:capitalize">${MOIS[m - 1]} ${y}</b><button class="btn sm ghost" data-mois="${autre(1)}" ${mois >= auj().slice(0, 7) ? "disabled" : ""}>›</button></div>
      <div class="kp"><div><b>${A.length}</b><small>Réservations</small></div><div><b>${venus}</b><small>Clients venus</small></div><div><b>${nouveaux}</b><small>Nouveaux clients</small></div></div>
      <div class="kp"><div><b>${ca.toLocaleString("fr-FR")}</b><small>DH réservés</small></div><div><b>${absents}</b><small>Pas venus</small></div><div><b>${non}</b><small>Refusées / annulées</small></div></div>
      ${absents ? `<p class="muted" style="font-size:13px">💡 « Pas venus » = confirmés mais pas marqués « Arrivé ». Pensez au bouton Arrivé +1 : le client gagne son point.</p>` : ""}
      ${barres("Jours les plus pleins", cpt(r => NJL[deCle(r.jour).getDay()]))}
      ${barres("Heures les plus demandées", cpt(r => r.debut))}
      ${barres(RF().some(r => r.mode === "tables") ? "Tables" : "Soins", cpt(r => quoi(r)))}
      ${barres("Équipe", cpt(r => r.staff))}
      ${!L.length ? `<div class="empty paper"><h3>Pas encore de chiffres ce mois</h3><p>Les statistiques se remplissent avec les réservations.</p></div>` : ""}`;
  }

  function rappels() {
    const dem = plus(auj(), 1), L = RF().filter(r => r.jour === dem && r.statut === "confirmee").sort(tri);
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="box"><h2>🔔 Rappels de demain</h2><p class="muted">Un message WhatsApp à chaque client de demain (${esc(jourLong(dem))}) : moins d’oublis, moins de tables vides.</p>
      ${L.map(r => { const w = waNum(r.tel); return `<div class="rv"><div class="h">${esc(r.debut)}</div><div class="q"><b>${esc(r.nom)}</b><small>${esc(quoi(r))}${r.staff ? " · " + esc(r.staff) : ""}</small></div>${w ? `<a class="btn sm primary" target="_blank" rel="noopener" href="https://wa.me/${w}?text=${encodeURIComponent(msgRappel(r))}" data-vu>📲 Rappeler</a>` : `<small class="muted">pas de n°</small>`}</div>`; }).join("") || `<p class="muted">Aucune réservation confirmée pour demain.</p>`}
      <button class="btn block ghost" data-x style="margin-top:10px">Fermer</button></div>`;
    document.body.appendChild(d);
    d.onclick = e => { if (e.target === d || e.target.closest("[data-x]")) d.remove(); const a = e.target.closest("[data-vu]"); if (a) { a.textContent = "✓ Envoyé"; a.classList.remove("primary"); } };
  }
  $("#rappels").onclick = rappels;

  /* ---------- actions ---------- */
  const R1 = id => R.find(r => r.id === id);
  async function statut(r, st) {
    const b = db.batch();
    b.update(db.doc("reservations/" + r.id), { statut: st, maj: NOW() });
    if (st === "refusee" || st === "annulee") b.delete(db.doc("rdvOccupe/" + r.id));
    else b.update(db.doc("rdvOccupe/" + r.id), { statut: st });
    try { await b.commit(); return true; }
    catch (e) {   // ancienne réservation sans créneau public
      try { await db.doc("reservations/" + r.id).update({ statut: st, maj: NOW() }); return true; } catch (x) { console.error(x); toast(x.code === "permission-denied" ? "Refusé : compte non autorisé." : "Échec. Vérifiez la connexion."); return false; }
    }
  }
  async function idTel(pid, tel) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("nfcwork-fid|" + pid + "|" + String(tel || "").replace(/\D/g, "").slice(-9))));
    const a = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 20; i++) s += a[h[i] % a.length]; return s;
  }
  async function arrive(r) {
    const P = PAGES[r.page] || {}, pid = P.fidPid, F = pid && FID[pid], prog = F && F.prog;
    if (!(await statut(r, "venu"))) return;
    if (!prog || String(r.tel || "").replace(/\D/g, "").length < 9) { toast("✓ Arrivée notée"); return; }
    const n = prog.type === "montant" && r.prix ? Math.max(1, Math.floor(r.prix / (prog.dhParPoint || 10))) : 1;
    try {
      const cid = r.fid || await idTel(pid, r.tel), ref = db.doc("fidCartes/" + cid);
      let c = await ref.get();
      if (!c.exists) { await ref.set({ pid, ownerEmail: prog.ownerEmail || email, nom: String(r.nom || "").slice(0, 60), tel: String(r.tel || "").slice(0, 30), points: 0, total: 0, recompenses: 0, lastAt: new Date(0), createdAt: NOW() }); }
      await ref.update({ points: inc(n), total: inc(n), lastAt: NOW() });
      if (!r.fid) db.doc("reservations/" + r.id).update({ fid: cid }).catch(() => {});
      if (WALLET) fetch(WALLET + "/google/sync?c=" + encodeURIComponent(cid), { mode: "no-cors", keepalive: true }).catch(() => {});
      toast(`✓ Arrivé · +${n} ${n > 1 ? unite(prog) : "point"} pour ${r.nom}`);
    } catch (e) { console.error(e); toast("✓ Arrivée notée (point fidélité non ajouté)"); }
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-tab],[data-pg],[data-jour],[data-mois],[data-ok],[data-non],[data-ann],[data-arr],[data-plus],[data-offrir]"); if (!b) return;
    const d = b.dataset;
    if (d.tab) { tab = d.tab; rendre(); return; }
    if (d.pg != null) { filtre = d.pg; rendre(); return; }
    if (d.jour) { jour = d.jour; rendre(); return; }
    if (d.mois) { mois = d.mois; rendre(); return; }
    b.disabled = true;
    if (d.ok) { const r = R1(d.ok); if (r && await statut(r, "confirmee")) toast(`✓ Confirmé · ${r.nom} le voit sur sa page`); }
    else if (d.non) { const r = R1(d.non); if (r && confirm(`Refuser la réservation de ${r.nom} ?`)) { if (await statut(r, "refusee")) toast("Réservation refusée · le créneau est libéré"); } }
    else if (d.ann) { const r = R1(d.ann); if (r && confirm(`Annuler la réservation de ${r.nom} (${r.debut}) ?`)) { if (await statut(r, "annulee")) toast("Réservation annulée · le créneau est libéré"); } }
    else if (d.arr) { const r = R1(d.arr); if (r) await arrive(r); }
    else if (d.plus) { try { await db.doc("fidCartes/" + d.plus).update({ points: inc(1), total: inc(1), lastAt: NOW() }); if (WALLET) fetch(WALLET + "/google/sync?c=" + d.plus, { mode: "no-cors" }).catch(() => {}); toast("+1 ✓"); } catch (x) { toast("Échec."); } }
    else if (d.offrir) { const pr = FID[d.pid] && FID[d.pid].prog, obj = Math.max(1, (pr && pr.objectif) || 10); if (confirm("Offrir le cadeau à ce client ?")) { try { await db.doc("fidCartes/" + d.offrir).update({ points: inc(-obj), recompenses: inc(1), lastAt: NOW() }); toast("🎁 Cadeau offert"); } catch (x) { toast("Échec."); } } }
    b.disabled = false; rendre();
  });
})();
