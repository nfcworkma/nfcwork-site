/* =========================================================
   KIFFY — espace NFC WORK (admin seulement) · branché par kiffy.js (window.KiffyAdminModule)
   Statistiques · clients de tous les commerces · abonnements · journal · notifications aux gérants
   Carnet des ventes · catalogue · devis / factures / reçus (PDF) · Mon entreprise
   Collections (règles Firestore : admin seulement) : kiffyJournal, kiffyVentes, kiffyProduits, kiffyDocs, kiffyCompteurs, kiffyEntreprise
   ========================================================= */
window.KiffyAdminModule = function (K) {
  "use strict";
  const { $, $$, esc, app, db, FV, ic, S, toast, erreur, ms, moisCle, moisPlus, nomMois, jourPlus, quand, initiale, feuille, confirmer, aller, appel, logoHTML, clair, nomMetier, objectif } = K;

  /* ---------------- outils ---------------- */
  const dh = n => (Math.round((+n || 0) * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[  ]/g, " ") + " DH";
  const jour = d => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";
  const auj = () => jourPlus(0), moisDe = d => String(d || "").slice(0, 7), moisActuel = () => auj().slice(0, 7);
  const sansAccent = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const telWa = t => { let d = String(t || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "212" + d.slice(1); return d.length >= 11 ? d : ""; };
  const cleClient = c => { const d = String(c.tel || "").replace(/\D/g, "").slice(-9); return d.length === 9 ? "t" + d : "n" + sansAccent(c.nom).replace(/[^a-z0-9]+/g, "-"); };
  const haut = (titre, retour, droite) => `<div class="barre">${retour ? `<a class="retour" href="${retour}" aria-label="Retour">${S.retour()}</a>` : ""}<span class="t" style="flex:1">${esc(titre)}</span>${droite || ""}</div>`;
  const ecran = (contenu, actif) => { app.innerHTML = `<div class="ecran nav">${contenu}${K.navAdmin(actif)}</div>`; K.brancherNavAdmin(); };
  const ligneOpt = (href, icone, l, v) => `<a class="opt" href="${href}"><span class="ico">${ic(icone)}</span><span class="l">${esc(l)}</span><span class="v">${esc(v || "")}</span><span class="chev">${S.chev()}</span></a>`;
  const charger = async () => { try { await K.chargerAdmin(); } catch (e) { erreur(e); } };
  const nomP = pid => (K.progs.find(p => p.id === pid) || K.archives.find(p => p.id === pid) || { nom: pid || "—" }).nom;

  /* ================= STATISTIQUES ================= */
  async function stats() {
    await charger();
    const P = K.progs, C = K.cartes, k = moisCle(), t0 = new Date(auj() + "T00:00:00").getTime();
    const actifs = P.filter(p => K.etat(p) === "actif").length, essais = P.filter(p => K.etat(p) === "essai").length, imp = P.filter(p => K.etat(p) === "impaye").length;
    const creesMois = C.filter(c => moisCle(ms(c.createdAt)) === k).length;
    const visMois = C.reduce((s, c) => s + ((c.vm && c.vm[k]) || 0), 0);
    let visJour = 0; C.forEach(c => (c.hist || []).forEach(h => { if (h.a === "visite" && ms(h.t) >= t0) visJour++; }));
    const parP = {}; C.forEach(c => { parP[c.pid] = (parP[c.pid] || 0) + ((c.vm && c.vm[k]) || 0); });
    const top = Object.entries(parP).filter(([pid, n]) => n > 0 && P.some(p => p.id === pid)).sort((a, b) => b[1] - a[1]).slice(0, 5), max = top.length ? top[0][1] : 1;
    const du = K.paiements.filter(x => !x.paye && !x.annule).reduce((s, x) => s + (x.montant || 0), 0);
    const tuile = (n, l, c) => `<div class="stat${c ? " " + c : ""}"><b>${n}</b><span>${esc(l)}</span></div>`;
    ecran(`<div class="titre-page"><h1>Statistiques</h1><p>${esc(nomMois(k))} · tous les commerces</p></div>
      <div class="page" style="gap:12px">
        <div class="stat-grille">${tuile(actifs, "Commerces actifs")}${tuile(C.length, "Cartes créées")}${tuile(visJour, "Visites aujourd’hui", "vert")}${tuile(visMois, "Visites ce mois")}${tuile("+" + creesMois, "Nouvelles cartes ce mois")}${tuile(P.length, "Commerces au total")}</div>
        <a class="carte" href="#/admin/abonnements" style="text-decoration:none;display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Abonnements</h3>${S.chev()}</div>
          <div class="kv"><span class="muted">En essai</span><b>${essais}</b></div><div class="kv"><span class="muted">Impayés</span><b class="${imp ? "danger" : ""}">${imp} · ${dh(du)}</b></div></a>
        <div class="carte"><h3 style="margin-bottom:10px">Top commerces (visites ce mois)</h3>
          ${top.length ? top.map(([pid, n], i) => `<a class="barre-stat" href="#/admin/c/${esc(pid)}"><span class="r">${i + 1}</span><span style="flex:1;min-width:0"><b>${esc(nomP(pid))}</b><i style="width:${Math.max(6, Math.round(n / max * 100))}%"></i></span><b>${n}</b></a>`).join("") : `<div class="vide">Pas encore de visite ce mois.</div>`}</div>
        ${ligneOpt("#/admin/journal", "history", "Journal d’activité", "")}
      </div>`, "stats");
  }

  /* ================= PLUS ================= */
  function plus() {
    const F = K.faceAdmin;
    ecran(`<div class="titre-page"><h1>Plus</h1><p>Espace NFC WORK</p></div>
      <div class="page" style="gap:12px">
        <div class="carte menu"><div class="sect">GESTION</div>
          ${ligneOpt("#/admin/clients", "users", "Clients de tous les commerces", String(K.cartes.length || ""))}
          ${ligneOpt("#/admin/abonnements", "cash", "Abonnements", "")}
          ${ligneOpt("#/admin/plaques", "qrcode", "Plaques", "")}
          ${ligneOpt("#/admin/journal", "history", "Journal d’activité", "")}
          <button class="opt" id="p-notif"><span class="ico">${ic("bell")}</span><span class="l">Notifier tous les gérants</span><span class="chev">${S.chev()}</span></button></div>
        <div class="carte menu"><div class="sect">VENTES</div>
          ${ligneOpt("#/admin/ventes", "receipt", "Carnet des ventes", "")}
          ${ligneOpt("#/admin/docs", "file-invoice", "Devis et factures", "")}
          ${ligneOpt("#/admin/produits", "package", "Catalogue des produits", "")}
          ${ligneOpt("#/admin/entreprise", "id", "Mon entreprise", "")}</div>
        <div class="carte menu"><div class="sect">COMPTE · ${esc(K.user.email)}</div>
          ${F.dispo() ? `<button class="opt" id="p-face"><span class="ico">${ic("face-id")}</span><span class="l">Face ID</span><span class="v">${F.actif() ? "activé" : "désactivé"}</span><span class="chev">${S.chev()}</span></button>` : ""}
          <button class="opt" id="p-code"><span class="ico">${ic("key")}</span><span class="l">Changer le code admin</span><span class="chev">${S.chev()}</span></button>
          <a class="opt" href="../espace/"><span class="ico">${ic("world")}</span><span class="l">Ouvrir l’Espace client (site)</span><span class="chev">${S.chev()}</span></a>
          <button class="opt" id="p-dx"><span class="ico">${ic("logout")}</span><span class="l danger" style="font-weight:700">Se déconnecter</span></button></div>
      </div>`, "plus");
    $("#p-notif").onclick = () => notifierGerants();
    if ($("#p-face")) $("#p-face").onclick = async () => {
      if (F.actif()) { if (await confirmer("Désactiver Face ID ?", "L’espace NFC WORK s’ouvrira avec le code admin.", "Désactiver")) { F.desactiver(); plus(); } }
      else if (await F.activer()) plus();
    };
    $("#p-code").onclick = async () => { if (await confirmer("Changer le code admin ?", "Vous allez choisir un nouveau code à 4 chiffres (secours de Face ID).", "Continuer")) K.nouveauCodeAdmin().catch(erreur); };
    $("#p-dx").onclick = () => K.seDeconnecter();
  }

  /* ================= NOTIFICATIONS AUX GÉRANTS ================= */
  function notifierGerants(email, titre0, texte0) {
    const f = feuille(`<h2>${email ? "Notifier le gérant" : "Notifier tous les gérants"}</h2>
      ${email ? `<p class="muted" style="margin:0;font-size:13.5px">${esc(email)}</p>` : `<p class="muted" style="margin:0;font-size:13.5px">Notification sur les téléphones des gérants qui ont l’app Kiffy.</p>`}
      <label class="champ">Titre<input id="n-t" maxlength="60" value="${esc(titre0 || "NFC WORK")}"></label>
      <label class="champ">Message<textarea id="n-x" rows="4" maxlength="240" placeholder="Nouveauté : …">${esc(texte0 || "")}</textarea></label>
      <p class="err" id="n-e"></p><button class="btn-noir moyen" id="n-go">${ic("send", 18)} Envoyer</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
    $("#n-go", f).onclick = async () => {
      const t = $("#n-t", f).value.trim(), x = $("#n-x", f).value.trim(), b = $("#n-go", f);
      if (!x) { $("#n-e", f).textContent = "Écrivez le message."; return; }
      if (!email && !(await confirmer("Envoyer à tous les gérants ?", x, "Envoyer"))) return;
      b.disabled = true;
      try { const r = await appel("kiffyNotifGerants", { titre: t, texte: x, email: email || "" }); f.remove(); toast(r.appareils ? `Envoyé : ${r.envoyes}/${r.appareils} téléphone(s), ${r.gerants} gérant(s)` : "Aucun téléphone de gérant enregistré (l’app n’est pas encore ouverte).", true); }
      catch (e) { erreur(e); b.disabled = false; }
    };
  }

  /* ================= ABONNEMENTS ================= */
  function echeance(p) {
    if (p.kiffy && p.kiffy.resilie) return "abonnement résilié";
    if (p.arch || p.actif === false) return "";
    if (p.essai && p.expire && p.expire >= auj()) return "fin d’essai le " + jour(p.expire);
    const imp = K.impayes(p.id); if (imp.length) return "en retard : " + imp.map(x => x.libelle || x.mois).join(", ");
    if (!p.kiffy) return "";
    if (p.kiffy.prochaine && p.kiffy.prochaine >= auj()) return `le ${jour(p.kiffy.prochaine)} · ${p.kiffy.mensuel || K.TARIF.mensuel} DH`;
    const debut = moisCle(ms(p.kiffy.cree) || ms(p.createdAt) || Date.now());
    let pro = moisPlus(moisCle(), 1);
    if (p.kiffy.formule === "offre" && moisPlus(debut, K.TARIF.moisOfferts) > pro) pro = moisPlus(debut, K.TARIF.moisOfferts);
    return `1er ${nomMois(pro).toLowerCase()} ${pro.slice(0, 4)} · ${p.kiffy.mensuel || K.TARIF.mensuel} DH`;
  }
  function rappel(p, du) {
    const imp = K.impayes(p.id), montant = imp.reduce((s, x) => s + (x.montant || 0), 0) || (du && du.montant) || 0;
    const texte = `Bonjour, votre abonnement Kiffy (${imp.map(x => x.libelle || x.mois).join(", ") || "ce mois"}) de ${dh(montant)} est en attente de paiement. Merci de régulariser auprès de NFC WORK.`;
    const wa = telWa(p.telCommerce);
    const f = feuille(`<h2>Rappel · ${esc(p.nom)}</h2><div class="modele">${esc(texte)}</div>
      <button class="btn-noir moyen" id="r-app">${ic("bell", 18)} Notification dans l’app</button>
      ${wa ? `<a class="btn-vert" id="r-wa" href="https://wa.me/${wa}?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">${ic("whatsapp", 20)} WhatsApp au commerce</a>` : `<div class="muted" style="font-size:12.5px">Pas de téléphone du commerce : ajoutez-le dans « Modifier la carte ».</div>`}
      <button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
    $("#r-app", f).onclick = async () => {
      try { const r = await appel("kiffyNotifGerants", { titre: "Abonnement Kiffy", texte, email: p.ownerEmail }); K.journal("rappel", `Rappel d’impayé (${dh(montant)}) · ${r.envoyes} téléphone(s)`, p); toast(r.appareils ? "Rappel envoyé" : "Le gérant n’a pas encore l’app : utilisez WhatsApp.", true); }
      catch (e) { erreur(e); }
    };
    if ($("#r-wa", f)) $("#r-wa", f).addEventListener("click", () => K.journal("rappel", `Rappel d’impayé WhatsApp (${dh(montant)})`, p));
  }
  // abonnement d'un commerce : prix, début, prochaine échéance, résiliation (tout est tracé dans le journal)
  function abonnementReglages(p, apres) {
    const k = p.kiffy || {}, debut = ms(k.cree) ? new Date(ms(k.cree)).toLocaleDateString("fr-CA", { timeZone: "Africa/Casablanca" }) : "";
    const f = feuille(`<h2>Abonnement · ${esc(p.nom)}</h2>
      <label class="champ">Prix mensuel (DH)<input id="ab-px" type="number" inputmode="decimal" min="0" step="0.01" value="${k.mensuel || K.TARIF.mensuel}"></label>
      <label class="kv" style="font-size:13px"><span>Appliquer aussi aux échéances non payées</span><input type="checkbox" id="ab-ap" checked style="width:22px;height:22px"></label>
      <div class="grille2"><label class="champ">Date de début<input id="ab-deb" type="date" value="${esc(debut)}"></label><label class="champ">Prochaine échéance<input id="ab-pro" type="date" value="${esc(k.prochaine || "")}"></label></div>
      <div class="muted" style="font-size:12px">Prochaine échéance vide = automatique (le 1er de chaque mois). Une date choisie décale la prochaine facture.</div>
      <label class="champ">Motif (facultatif)<input id="ab-m" maxlength="160"></label>
      <button class="btn-noir moyen" id="ab-ok">Enregistrer</button>
      <button class="btn-clair${k.resilie ? "" : " danger"}" id="ab-res" style="padding:12px">${k.resilie ? "Réactiver l’abonnement" : "Résilier l’abonnement"}</button>
      <button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
    const avant = `prix ${dh(k.mensuel || K.TARIF.mensuel)}/mois · début ${debut || "—"} · échéance ${k.prochaine || "auto"}`;
    $("#ab-ok", f).onclick = async () => {
      const px = arrondi(parseFloat($("#ab-px", f).value) || 0), deb = $("#ab-deb", f).value, pro = $("#ab-pro", f).value, m = $("#ab-m", f).value.trim();
      if (!(px >= 0)) return toast("Prix invalide.");
      const maj = { "kiffy.mensuel": px, "kiffy.prochaine": pro || FV.delete(), maj: FV.serverTimestamp() };
      if (deb) maj["kiffy.cree"] = K.TS.fromDate(new Date(deb + "T12:00:00"));
      try {
        await db.doc("fidProgrammes/" + p.id).update(maj);
        let n = 0;
        if ($("#ab-ap", f).checked && px !== (k.mensuel || K.TARIF.mensuel)) for (const x of K.paiements.filter(y => y.pid === p.id && !y.paye && !y.annule && y.mois !== "installation")) { await db.doc("kiffyPaiements/" + x.id).update({ montant: px }); n++; }
        K.journal("abonnement", "Abonnement modifié" + (n ? ` (${n} échéance(s) non payée(s) mises à jour)` : ""), p, { avant, apres: `prix ${dh(px)}/mois · début ${deb || "—"} · échéance ${pro || "auto"}`, motif: m });
        f.remove(); toast("Abonnement enregistré"); apres && apres();
      } catch (e) { erreur(e); }
    };
    $("#ab-res", f).onclick = async () => {
      const res = !k.resilie, m = $("#ab-m", f).value.trim();
      if (!(await confirmer(res ? "Résilier l’abonnement ?" : "Réactiver l’abonnement ?", res ? "Plus aucune facture mensuelle et le commerce passe en pause. Les cartes des clients restent." : "Les factures mensuelles reprennent et le commerce est réactivé.", res ? "Résilier" : "Réactiver", res))) return;
      try {
        await db.doc("fidProgrammes/" + p.id).update({ "kiffy.resilie": res, "kiffy.resilieLe": res ? FV.serverTimestamp() : FV.delete(), actif: !res, maj: FV.serverTimestamp() });
        K.journal("abonnement", res ? "Abonnement résilié" : "Abonnement réactivé", p, { avant: res ? "actif" : "résilié", apres: res ? "résilié" : "actif", motif: m });
        f.remove(); toast(res ? "Abonnement résilié" : "Abonnement réactivé"); apres && apres();
      } catch (e) { erreur(e); }
    };
  }
  function paiementAbo(x, p, apres) {
    if (!x) return;
    let mode = x.mode || "Espèces";
    const jourPaye = ms(x.payeLe) ? new Date(ms(x.payeLe)).toLocaleDateString("fr-CA", { timeZone: "Africa/Casablanca" }) : auj();
    const f = feuille(`<h2>${esc(x.libelle || x.mois)} · ${esc(p.nom)}</h2>${x.annule ? `<div class="pause">Échéance annulée${x.motif ? " : " + esc(x.motif) : ""}</div>` : ""}
      <label class="champ">Libellé<input id="pa-l" maxlength="60" value="${esc(x.libelle || x.mois)}"></label><label class="champ">Montant (DH)<input id="pa-m" type="number" inputmode="decimal" min="0" step="0.01" value="${x.montant || 0}"></label>
      <div class="kv"><span>Payé</span><button class="inter${x.paye ? " on" : ""}" id="pa-p" aria-label="Payé"></button></div>
      <div id="pa-pz" ${x.paye ? "" : "hidden"}><label class="champ">Payé le<input id="pa-d" type="date" value="${esc(jourPaye)}"></label><div class="choix" id="pa-mo" style="margin-top:8px">${MODES.map(m => `<button data-m="${m}" class="${m === mode ? "on" : ""}">${m}</button>`).join("")}</div></div>
      <label class="champ">Notes<input id="pa-n" maxlength="160" value="${esc(x.notes || "")}"></label><label class="champ">Motif (facultatif)<input id="pa-mf" maxlength="160"></label>
      <button class="btn-noir moyen" id="pa-ok">Enregistrer</button>
      <button class="btn-clair${x.annule ? "" : " danger"}" id="pa-an" style="padding:12px">${x.annule ? "Rétablir cette échéance" : "Annuler cette échéance (erreur)"}</button><button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
    let paye = !!x.paye;
    $("#pa-p", f).onclick = e => { paye = !paye; e.target.classList.toggle("on", paye); $("#pa-pz", f).hidden = !paye; };
    $$("#pa-mo [data-m]", f).forEach(b => (b.onclick = () => { mode = b.dataset.m; $$("#pa-mo [data-m]", f).forEach(y => y.classList.toggle("on", y === b)); }));
    const lib = y => `${y.libelle || y.mois} · ${dh(y.montant)} · ${y.annule ? "annulée" : y.paye ? "payé" + (y.mode ? " (" + y.mode + ")" : "") : "à payer"}`;
    $("#pa-ok", f).onclick = async () => {
      const y = { libelle: $("#pa-l", f).value.trim() || x.libelle || x.mois, montant: arrondi(parseFloat($("#pa-m", f).value) || 0), paye, notes: $("#pa-n", f).value.trim() };
      const maj = { ...y, mode: paye ? mode : FV.delete(), payeLe: paye ? K.TS.fromDate(new Date(($("#pa-d", f).value || auj()) + "T12:00:00")) : FV.delete(), par: paye ? K.user.email : FV.delete(), maj: FV.serverTimestamp() };
      try { await db.doc("kiffyPaiements/" + x.id).update(maj); K.journal("abonnement", `Échéance corrigée · ${y.libelle}`, p, { avant: lib(x), apres: lib({ ...x, ...y, mode }), motif: $("#pa-mf", f).value.trim() }); f.remove(); toast("Échéance enregistrée"); apres && apres(); } catch (e) { erreur(e); }
    };
    $("#pa-an", f).onclick = async () => {
      const an = !x.annule, m = $("#pa-mf", f).value.trim();
      if (an && !(await confirmer("Annuler cette échéance ?", "Elle n’est plus due (gardée dans l’historique, marquée « Annulé »).", "Annuler l’échéance", true))) return;
      try { await db.doc("kiffyPaiements/" + x.id).update({ annule: an, motif: an ? m || "Erreur" : FV.delete(), maj: FV.serverTimestamp() }); K.journal("abonnement", `Échéance ${an ? "annulée" : "rétablie"} · ${x.libelle || x.mois}`, p, { avant: lib(x), apres: lib({ ...x, annule: an }), motif: m }); f.remove(); toast(an ? "Échéance annulée" : "Échéance rétablie"); apres && apres(); } catch (e) { erreur(e); }
    };
  }
  let filtreAb = "tous";
  async function abonnements() {
    await charger();
    const nb = k => K.progs.filter(p => k === "tous" || K.etat(p) === k).length;
    const L = K.progs.filter(p => filtreAb === "tous" || K.etat(p) === filtreAb).sort((a, b) => ["impaye", "essai", "actif", "pause"].indexOf(K.etat(a)) - ["impaye", "essai", "actif", "pause"].indexOf(K.etat(b)) || String(a.nom).localeCompare(String(b.nom)));
    const du = K.paiements.filter(x => !x.paye && !x.annule), totalDu = du.reduce((s, x) => s + (x.montant || 0), 0);
    ecran(`${haut("Abonnements", "#/admin/plus")}
      <div class="page" style="gap:12px">
        <div class="ca"><div class="t">Reste à encaisser (abonnements)</div><div class="m">${dh(totalDu).replace(" DH", "")} <span>DH</span></div>
          <div class="g"><div><b>${nb("actif")}</b><span>Actifs</span></div><div><b>${nb("essai")}</b><span>En essai</span></div><div class="rouge"><b>${nb("impaye")}</b><span>Impayés</span></div></div></div>
        <div class="puces">${[["tous", "Tous"], ["impaye", "Impayés"], ["essai", "Essai"], ["actif", "Actifs"], ["pause", "En pause"]].map(([k, t]) => `<button class="puce${filtreAb === k ? " on" : ""}" data-f="${k}">${t} · ${nb(k)}</button>`).join("")}</div>
        ${filtreAb === "impaye" && nb("impaye") ? `<button class="btn-noir moyen" id="ab-tous">${ic("bell", 18)} Rappeler tous les impayés</button>` : ""}
        <div class="carte liste">${L.length ? L.map(p => { const imp = K.impayes(p.id), m = imp.reduce((s, x) => s + (x.montant || 0), 0); return `<div class="ligne"><a href="#/admin/c/${esc(p.id)}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;text-decoration:none;color:inherit"><span class="tuile" style="background:${esc(p.couleur || "#16C172")};color:${clair(p.couleur) ? "#0A0A0A" : "#FFFFFF"}">${logoHTML(p)}</span><span class="txt"><b>${esc(p.nom)}</b><span>${esc(echeance(p) || "—")}${m ? " · " + dh(m) : ""}</span></span></a>${K.statut(p)}${imp.length ? `<button class="lien" data-r="${esc(p.id)}" style="margin-left:8px">Rappeler</button>` : ""}</div>`; }).join("") : `<div class="vide">Aucun commerce.</div>`}</div>
      </div>`, "plus");
    $$("[data-f]").forEach(b => (b.onclick = () => { filtreAb = b.dataset.f; abonnements(); }));
    $$("[data-r]").forEach(b => (b.onclick = () => rappel(K.progs.find(p => p.id === b.dataset.r))));
    if ($("#ab-tous")) $("#ab-tous").onclick = async () => {
      const Ls = K.progs.filter(p => K.etat(p) === "impaye" && p.ownerEmail);
      if (!(await confirmer(`Rappeler ${Ls.length} commerce(s) ?`, "Une notification part sur le téléphone de chaque gérant concerné.", "Envoyer les rappels"))) return;
      let n = 0;
      for (const p of Ls) { const imp = K.impayes(p.id), m = imp.reduce((s, x) => s + (x.montant || 0), 0); try { const r = await appel("kiffyNotifGerants", { titre: "Abonnement Kiffy", texte: `Bonjour, votre abonnement Kiffy (${imp.map(x => x.libelle || x.mois).join(", ")}) de ${dh(m)} est en attente de paiement. Merci de régulariser auprès de NFC WORK.`, email: p.ownerEmail }); n += r.envoyes ? 1 : 0; } catch (e) {} }
      toast(`${n}/${Ls.length} rappel(s) reçus sur un téléphone`, true);
    };
  }

  /* ================= MESSAGE WALLET AUX CLIENTS D'UN COMMERCE ================= */
  function messageClients(p) {
    const n = K.cartes.filter(c => c.pid === p.id).length;
    const f = feuille(`<h2>Message aux clients</h2><p class="muted" style="margin:0;font-size:13.5px">${esc(p.nom)} · ${n} client(s) · Apple Wallet et Google Wallet</p>
      <label class="champ">Titre<input id="mc-t" maxlength="60" placeholder="Ce week-end"></label><label class="champ">Message<textarea id="mc-x" rows="3" maxlength="300"></textarea></label>
      <p class="err" id="mc-e"></p><button class="btn-noir moyen" id="mc-go">${ic("send", 18)} Envoyer</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
    $("#mc-go", f).onclick = async () => {
      const t = $("#mc-t", f).value.trim(), x = $("#mc-x", f).value.trim(), b = $("#mc-go", f);
      if (!t && !x) { $("#mc-e", f).textContent = "Écrivez un titre ou un message."; return; }
      if (!(await confirmer("Envoyer ?", `${n} clients de ${p.nom} recevront ce message dans leur Wallet.`, "Envoyer"))) return;
      b.disabled = true;
      try {
        const tok = await K.user.getIdToken(), h = { "Content-Type": "application/json", Authorization: "Bearer " + tok }, corps = JSON.stringify({ pid: p.id, titre: t, texte: x });
        const [oa, og] = await Promise.all([K.APPLE_WS ? fetch(K.APPLE_WS + "/annonce", { method: "POST", headers: h, body: corps }).then(r => r.ok).catch(() => false) : false, K.WALLET ? fetch(K.WALLET + "/google/message", { method: "POST", headers: h, body: corps }).then(r => r.ok).catch(() => false) : false]);
        if (!oa && !og) throw new Error("Envoi impossible. Réessayez.");
        f.remove(); toast("Message envoyé", true);
      } catch (e) { $("#mc-e", f).textContent = e.message; b.disabled = false; }
    };
  }

  /* ================= CLIENTS (tous les commerces) ================= */
  let rechCli = "";
  async function clients(pid) {
    await charger();
    const q = sansAccent(rechCli), qd = rechCli.replace(/\D/g, "");
    const base = K.cartes.filter(c => !pid || c.pid === pid);
    const L = base.filter(c => !q || sansAccent(c.nom).includes(q) || (qd.length >= 3 && String(c.tel || "").replace(/\D/g, "").includes(qd)) || (!pid && sansAccent(nomP(c.pid)).includes(q)))
      .sort((a, b) => ms(b.lastAt) - ms(a.lastAt) || ms(b.createdAt) - ms(a.createdAt));
    const p = pid ? K.progs.find(x => x.id === pid) || K.archives.find(x => x.id === pid) : null;
    ecran(`${haut(p ? "Clients · " + p.nom : "Clients", p ? "#/admin/c/" + encodeURIComponent(pid) : "#/admin/plus", `<button class="lien" id="cl-csv">${ic("download", 16)} CSV</button>`)}
      <div class="page" style="gap:12px">
        <label class="recherche">${S.loupe}<input id="cq" placeholder="${pid ? "Nom ou téléphone" : "Nom, téléphone ou commerce"}" value="${esc(rechCli)}" autocomplete="off"></label>
        <div class="muted" style="font-size:12.5px;padding:0 4px">${L.length} carte(s)${pid ? "" : ` · ${new Set(L.map(c => c.pid)).size} commerce(s)`}</div>
        <div class="carte liste">${L.length ? L.slice(0, 250).map(c => { const pp = K.progs.find(x => x.id === c.pid) || {}; return `<button class="ligne" data-c="${esc(c.id)}"><span class="av">${esc(initiale(c.nom))}</span><span class="txt"><b>${esc(c.nom)}</b><span>${pid ? "" : esc(nomP(c.pid)) + " · "}${c.points || 0}/${pp.objectif ? objectif(pp) : "?"} · ${esc(c.tel || "")}</span></span>${S.chev()}</button>`; }).join("") : `<div class="vide">Aucun client.</div>`}</div>
      </div>`, "plus");
    $("#cq").oninput = e => { rechCli = e.target.value; const pos = e.target.selectionStart; clients(pid).then(() => { const r = $("#cq"); r.focus(); r.setSelectionRange(pos, pos); }); };
    $$("[data-c]").forEach(b => (b.onclick = () => ficheCarte(K.cartes.find(c => c.id === b.dataset.c), () => clients(pid))));
    $("#cl-csv").onclick = () => K.csv([["Client", "Téléphone", "Commerce", "Points", "Visites au total", "Cadeaux", "Inscrit le", "Dernière visite"],
      ...L.map(c => [c.nom, c.tel, nomP(c.pid), c.points || 0, c.total || 0, c.recompenses || 0, ms(c.createdAt) ? new Date(ms(c.createdAt)).toLocaleDateString("fr-FR") : "", ms(c.lastAt) ? new Date(ms(c.lastAt)).toLocaleDateString("fr-FR") : ""])], `Kiffy-Clients${p ? "-" + p.id : ""}-${auj()}.csv`);
  }
  function ficheCarte(c, apres) {
    if (!c) return;
    const p = K.progs.find(x => x.id === c.pid) || K.archives.find(x => x.id === c.pid) || { nom: c.pid };
    const wa = telWa(c.tel);
    const f = feuille(`<h2>${esc(c.nom)}</h2><p class="muted" style="margin:0;font-size:13.5px">${esc(p.nom)}${c.tel ? " · " + esc(c.tel) : ""}</p>
      <div class="mini-stats"><div><b>${c.points || 0}${p.objectif ? "/" + objectif(p) : ""}</b><span>Points</span></div><div><b>${c.total || 0}</b><span>Visites</span></div><div><b>${c.recompenses || 0}</b><span>Cadeaux</span></div></div>
      <div class="carte"><h3>Historique</h3>${(c.hist || []).length ? c.hist.slice(0, 10).map(h => `<div class="histo"><span>${h.a === "visite" ? `+${h.n} visite` : h.a === "cadeau" ? "Cadeau offert" : h.a === "ajust" ? `${h.n > 0 ? "+" : ""}${h.n} (${esc(h.motif || "")})` : "-1 point"}${h.e ? " · " + esc(h.e) : ""}</span><span class="q">${esc(quand(ms(h.t)))}</span></div>`).join("") : `<div class="vide" style="padding:8px 0">Aucune visite.</div>`}</div>
      <div class="actions-g"><button class="btn-clair" id="fc-plus">${ic("plus", 16)} Ajouter des points</button><button class="btn-clair" id="fc-moins">${ic("minus", 16)} Retirer</button></div>
      ${wa ? `<a class="btn-clair" style="padding:12px;text-decoration:none" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ic("whatsapp", 18)} WhatsApp</a>` : ""}
      <a class="btn-clair" style="padding:12px;text-decoration:none" href="#/admin/c/${esc(c.pid)}">${ic("building-store", 18)} Voir le commerce</a>
      <button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
    $$("a[href^='#']", f).forEach(a => a.addEventListener("click", () => f.remove()));
    const ajuster = signe => {
      const g = feuille(`<h2>${signe > 0 ? "Ajouter" : "Retirer"} des points</h2><p class="muted" style="margin:0;font-size:13.5px">${esc(c.nom)} · ${c.points || 0} point(s) aujourd’hui</p>
        <label class="champ">Nombre de points<input id="aj-n" type="number" inputmode="numeric" min="1" max="1000" value="1"></label>
        <label class="champ">Motif (obligatoire, tracé)<input id="aj-m" maxlength="120" placeholder="${signe > 0 ? "Visite oubliée le 12/11" : "Erreur de saisie"}"></label>
        <p class="err" id="aj-e"></p><button class="btn-noir moyen" id="aj-ok">Valider</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
      $("#aj-ok", g).onclick = async () => {
        const n = parseInt($("#aj-n", g).value, 10), m = $("#aj-m", g).value.trim();
        if (!(n >= 1)) return ($("#aj-e", g).textContent = "Nombre invalide.");
        if (m.length < 3) return ($("#aj-e", g).textContent = "Écrivez le motif.");
        if (!(await confirmer(`${signe > 0 ? "Ajouter" : "Retirer"} ${n} point(s) ?`, `${c.nom} · motif : ${m}`, "Confirmer"))) return;
        try {
          const r = await appel("kiffyAjuster", { cid: c.id, n: signe * n, motif: m });
          if (K.WALLET) fetch(K.WALLET + "/google/sync?c=" + encodeURIComponent(c.id), { mode: "no-cors" }).catch(() => {});
          g.remove(); f.remove(); toast(`${c.nom} : ${r.points} point(s)`); await K.chargerAdmin(true).catch(() => {}); apres && apres();
        } catch (e) { $("#aj-e", g).textContent = e.message || "Échec."; }
      };
    };
    $("#fc-plus", f).onclick = () => ajuster(1);
    $("#fc-moins", f).onclick = () => ajuster(-1);
  }

  /* ================= JOURNAL D'ACTIVITÉ ================= */
  let filtreJ = "tous", rechJ = "";
  async function journal() {
    let L = [];
    try { L = (await db.collection("kiffyJournal").orderBy("t", "desc").limit(400).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { erreur(e); }
    const R = { admin: ["Admin", "noir"], gerant: ["Gérant", "menthe"], employe: ["Employé", "jaune"], client: ["Client", "orange"], systeme: ["Système", ""] };
    const q = sansAccent(rechJ);
    const V = L.filter(x => (filtreJ === "tous" || x.role === filtreJ) && (!q || sansAccent([x.qui, x.commerce, x.detail, x.action, x.avant, x.apres, x.motif].join(" ")).includes(q)));
    const ICO = { visite: "plus", cadeau: "gift", retirer: "minus", points: "refresh", reglages: "pencil", design: "palette", message: "send", notification: "bell", pin: "key", equipe: "users", acces: "mail", "mot-de-passe": "key", plaque: "qrcode", creation: "building-store", suppression: "trash", pause: "player-pause", reactivation: "player-play", essai: "calendar", encaissement: "cash", rappel: "bell", vente: "receipt", document: "file-invoice", inscription: "user-plus", restauration: "refresh" };
    ecran(`${haut("Journal d’activité", "#/admin/plus")}
      <div class="page" style="gap:12px">
        <label class="recherche">${S.loupe}<input id="jq" placeholder="Commerce, personne, action…" value="${esc(rechJ)}" autocomplete="off"></label>
        <div class="puces">${[["tous", "Tout"], ["admin", "Admin"], ["gerant", "Gérants"], ["employe", "Employés"], ["client", "Clients"]].map(([k, t]) => `<button class="puce${filtreJ === k ? " on" : ""}" data-f="${k}">${t}</button>`).join("")}</div>
        <div class="carte liste">${V.length ? V.slice(0, 300).map(x => `<div class="ligne" style="align-items:flex-start"><span class="av" style="width:36px;height:36px">${ic(ICO[x.action] || "history", 18)}</span><span class="txt"><b style="white-space:normal">${esc(x.detail || x.action)}</b>${x.avant || x.apres ? `<span class="avant-apres"><s>${esc(x.avant || "—")}</s> → ${esc(x.apres || "—")}</span>` : ""}${x.motif ? `<span class="avant-apres">Motif : ${esc(x.motif)}</span>` : ""}<span>${esc([x.qui, x.commerce].filter(Boolean).join(" · "))}</span><span style="display:block;font-size:11.5px;color:#8A938E">${esc(quand(ms(x.t)))}</span></span><span class="tag ${(R[x.role] || R.systeme)[1]}">${(R[x.role] || R.systeme)[0]}</span></div>`).join("") : `<div class="vide">Rien pour l’instant.</div>`}</div>
      </div>`, "plus");
    $$("[data-f]").forEach(b => (b.onclick = () => { filtreJ = b.dataset.f; journal(); }));
    $("#jq").oninput = e => { rechJ = e.target.value; const pos = e.target.selectionStart; journal().then(() => { const r = $("#jq"); r.focus(); r.setSelectionRange(pos, pos); }); };
  }

  /* ================= MON ENTREPRISE ================= */
  let E = null;
  const ENT_DEF = { nom: "NFC WORK", adresse: "", tel: K.WHATSAPP ? "+" + K.WHATSAPP : "", email: "nfcworkmacontact@gmail.com", site: "nfcwork.ma", ae: "", ifisc: "", ice: "", cin: "", rib: "", mention: "", validite: 30 };
  async function entrepriseDoc() { if (E) return E; try { const d = await db.doc("kiffyEntreprise/moi").get(); E = { ...ENT_DEF, ...(d.exists ? d.data() : {}) }; } catch (e) { E = { ...ENT_DEF }; } return E; }
  const fiscal = e => !!(e.ice || e.ifisc || e.ae);
  async function entreprise() {
    const e = await entrepriseDoc();
    const ch = (k, l, ph, type) => `<label class="champ">${esc(l)}<input data-k="${k}" ${type ? `type="${type}"` : ""} value="${esc(e[k] || "")}" placeholder="${esc(ph || "")}" autocomplete="off"></label>`;
    ecran(`${haut("Mon entreprise", "#/admin/plus")}
      <div class="page" style="gap:12px">
        <section class="section"><b>Sur les devis et factures</b>${ch("nom", "Nom", "NFC WORK")}${ch("adresse", "Adresse", "Rue, ville")}<div class="grille2">${ch("tel", "Téléphone", "+212…", "tel")}${ch("email", "E-mail", "", "email")}</div>${ch("site", "Site", "nfcwork.ma")}
          <label class="champ">Validité des devis (jours)<input data-k="validite" type="number" inputmode="numeric" min="1" max="365" value="${esc(e.validite || 30)}"></label></section>
        <section class="section"><b>Identifiants fiscaux <span>(à remplir plus tard)</span></b>
          <div class="grille2">${ch("ae", "N° auto-entrepreneur")}${ch("ifisc", "IF")}</div><div class="grille2">${ch("ice", "ICE")}${ch("cin", "CIN")}</div>${ch("rib", "RIB")}
          <label class="champ">Mention légale libre<textarea data-k="mention" rows="2" maxlength="300">${esc(e.mention || "")}</textarea></label>
          <div class="info-vert">${ic("file-invoice", 20)}<span>${fiscal(e) ? "Identifiants présents : les ventes payées donnent une <b>Facture</b> (F-…)." : "Sans ICE, IF ni n° d’auto-entrepreneur, « Convertir en facture » donne un <b>Reçu</b> (R-…), sans numéro fiscal."}</span></div></section>
        <button class="btn-noir" id="ent-ok">Enregistrer</button>
      </div>`, "plus");
    $("#ent-ok").onclick = async () => {
      const d = {}; $$("[data-k]").forEach(i => { d[i.dataset.k] = i.dataset.k === "validite" ? Math.max(1, Math.min(365, parseInt(i.value, 10) || 30)) : i.value.trim().slice(0, 300); });
      try { await db.doc("kiffyEntreprise/moi").set({ ...d, maj: FV.serverTimestamp() }, { merge: true }); E = { ...ENT_DEF, ...d }; K.journal("entreprise", "Infos de l’entreprise modifiées"); toast("Enregistré"); entreprise(); } catch (x) { erreur(x); }
    };
  }

  /* ================= CATALOGUE DES PRODUITS ================= */
  const PROD_DEF = [["Kiffy installation", 299], ["Kiffy abonnement mensuel", 149], ["Carte de visite NFC", 99], ["Plaque avis Google NFC", 99], ["Menu digital", 199], ["Plaque Wi-Fi NFC", 79], ["Autre", 0]];
  let produitsCache = null;
  async function produitsListe(force) {
    if (produitsCache && !force) return produitsCache;
    const s = await db.collection("kiffyProduits").get();
    if (s.empty) {   // premier lancement : le catalogue de départ (modifiable)
      const b = db.batch(); PROD_DEF.forEach(([nom, prix], i) => b.set(db.collection("kiffyProduits").doc(), { nom, prix, ordre: i, actif: true, cree: FV.serverTimestamp() })); await b.commit();
      return produitsListe(true);
    }
    produitsCache = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || String(a.nom).localeCompare(String(b.nom)));
    return produitsCache;
  }
  async function produits() {
    let L = []; try { L = await produitsListe(true); } catch (e) { erreur(e); }
    ecran(`${haut("Catalogue des produits", "#/admin/plus")}
      <div class="page" style="gap:12px">
        <div class="carte liste">${L.map(x => `<button class="ligne" data-p="${esc(x.id)}" style="${x.actif === false ? "opacity:.5" : ""}"><span class="av">${ic("package", 18)}</span><span class="txt"><b>${esc(x.nom)}</b><span>${x.actif === false ? "masqué" : "prix par défaut"}</span></span><b>${dh(x.prix)}</b></button>`).join("")}</div>
        <button class="btn-noir moyen" id="pr-add">${ic("plus", 18)} Ajouter un produit</button>
      </div>`, "plus");
    const editer = x => {
      const f = feuille(`<h2>${x ? "Modifier le produit" : "Nouveau produit"}</h2><label class="champ">Nom<input id="pn" maxlength="80" value="${esc(x ? x.nom : "")}"></label><label class="champ">Prix par défaut (DH)<input id="pp" type="number" inputmode="decimal" min="0" step="0.01" value="${x ? x.prix : ""}"></label>
        ${x ? `<div class="kv"><span>Proposé dans les ventes</span><button class="inter${x.actif !== false ? " on" : ""}" id="pa"></button></div>` : ""}
        <button class="btn-noir moyen" id="p-ok">Enregistrer</button><button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
      let actif = !x || x.actif !== false;
      if ($("#pa", f)) $("#pa", f).onclick = e => { actif = !actif; e.target.classList.toggle("on", actif); };
      $("#p-ok", f).onclick = async () => {
        const nom = $("#pn", f).value.trim(), prix = Math.max(0, parseFloat($("#pp", f).value) || 0);
        if (!nom) return toast("Écrivez le nom.");
        try { if (x) await db.doc("kiffyProduits/" + x.id).update({ nom, prix, actif }); else await db.collection("kiffyProduits").add({ nom, prix, actif: true, ordre: L.length, cree: FV.serverTimestamp() }); produitsCache = null; f.remove(); toast("Enregistré"); produits(); } catch (e) { erreur(e); }
      };
    };
    $$("[data-p]").forEach(b => (b.onclick = () => editer(L.find(x => x.id === b.dataset.p))));
    $("#pr-add").onclick = () => editer(null);
  }

  /* ================= CARNET DES VENTES ================= */
  const STATUTS = { "Prospect": "", "Devis envoyé": "jaune", "Confirmé": "menthe", "Payé": "vert", "Partiellement payé": "orange", "Annulé": "rouge" };
  const MODES = ["Espèces", "Virement", "Chèque", "Carte", "Autre"];
  const tagStatut = s => `<span class="tag ${STATUTS[s] || ""}"${STATUTS[s] === "" ? ' style="background:#EEF2EF;color:#5B665F"' : ""}>${esc(s)}</span>`;
  const arrondi = n => Math.round((+n || 0) * 100) / 100;
  const sousTotalDe = lignes => (lignes || []).reduce((s, l) => s + (+l.qte || 0) * (+l.prix || 0), 0);
  const remiseDe = (st, r) => !r || !(+r.valeur > 0) ? 0 : Math.min(st, r.mode === "DH" ? +r.valeur : st * Math.min(100, +r.valeur) / 100);
  const calcul = (lignes, remise) => { const st = arrondi(sousTotalDe(lignes)), rm = arrondi(remiseDe(st, remise)); return { sousTotal: st, remiseDH: rm, total: arrondi(st - rm) }; };
  const libRemise = r => !r || !(+r.valeur > 0) ? "" : r.mode === "DH" ? dh(r.valeur) : `${r.valeur} %`;
  // statut qui suit les paiements (sans toucher Prospect, Devis envoyé, Annulé)
  const statutAuto = (st, total, paye) => ["Confirmé", "Payé", "Partiellement payé"].includes(st) && total > 0 ? (paye >= total - 0.001 ? "Payé" : paye > 0 ? "Partiellement payé" : "Confirmé") : st;
  const resume = v => [`client ${[(v.client || {}).nom, (v.client || {}).commerce].filter(Boolean).join(", ")}`, `produits ${(v.lignes || []).map(l => `${l.qte}× ${l.produit} à ${dh(l.prix)}`).join(" + ")}`, libRemise(v.remise) && `remise ${libRemise(v.remise)}`, `total ${dh(v.total)}`, `date ${v.date}`, `statut ${v.statut}`].filter(Boolean).join(" · ");
  // avant / après pour le journal : seulement ce qui a changé
  const diffVente = (a, b) => {
    const F = [["client", x => [(x.client || {}).nom, (x.client || {}).commerce, (x.client || {}).tel, (x.client || {}).ville].filter(Boolean).join(", ")], ["produits", x => (x.lignes || []).map(l => `${l.qte}× ${l.produit} à ${dh(l.prix)}`).join(" + ")],
      ["remise", x => libRemise(x.remise) || "aucune"], ["total", x => dh(x.total)], ["date", x => x.date || ""], ["statut", x => x.statut || ""], ["notes", x => x.notes || ""]];
    const av = [], ap = []; F.forEach(([n, f]) => { const u = f(a), w = f(b); if (u !== w) { av.push(`${n} : ${u || "—"}`); ap.push(`${n} : ${w || "—"}`); } });
    return { avant: av.join(" · "), apres: ap.join(" · ") };
  };
  const payeDe = v => (v.paiements || []).reduce((s, x) => s + (+x.montant || 0), 0);
  const resteDe = v => Math.max(0, (v.total || 0) - payeDe(v));
  const compte = v => !["Prospect", "Annulé"].includes(v.statut);
  let ventesCache = null;
  async function ventesListe(force) {
    if (ventesCache && !force) return ventesCache;
    ventesCache = (await db.collection("kiffyVentes").get()).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || ms(b.cree) - ms(a.cree));
    return ventesCache;
  }
  let filtreV = "tous", moisV = "", rechV = "";
  async function ventes() {
    let V = []; try { V = await ventesListe(true); } catch (e) { erreur(e); }
    const m = moisActuel(), ok = V.filter(compte);
    const encaisse = V.reduce((s, v) => s + (v.paiements || []).filter(x => moisDe(x.date) === m).reduce((a, x) => a + (+x.montant || 0), 0), 0);
    const reste = ok.reduce((s, v) => s + (v.statut === "Devis envoyé" ? 0 : resteDe(v)), 0);
    const duMois = ok.filter(v => moisDe(v.date) === m && v.statut !== "Devis envoyé");
    const impayes = ok.filter(v => v.statut !== "Devis envoyé" && resteDe(v) > 0);
    const top = {}; duMois.forEach(v => (v.lignes || []).forEach(l => { top[l.produit] = (top[l.produit] || 0) + (+l.qte || 0); }));
    const topL = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const moisDispo = [...new Set(V.map(v => moisDe(v.date)).filter(Boolean))].sort().reverse();
    const q = sansAccent(rechV);
    const L = V.filter(v => (filtreV === "tous" || (filtreV === "impayes" ? compte(v) && v.statut !== "Devis envoyé" && resteDe(v) > 0 : v.statut === filtreV)) && (!moisV || moisDe(v.date) === moisV)
      && (!q || sansAccent([v.client && v.client.nom, v.client && v.client.commerce, v.client && v.client.ville, (v.lignes || []).map(l => l.produit).join(" ")].join(" ")).includes(q)));
    ecran(`<div class="titre-page" style="display:flex;justify-content:space-between;align-items:flex-end"><div><h1>Ventes</h1><p>${esc(nomMois(m.replace("-", "")))} ${m.slice(0, 4)}</p></div><a class="btn-noir moyen" href="#/admin/vente/nouvelle" style="width:auto;padding:10px 14px;text-decoration:none">${ic("plus", 18)} Vente</a></div>
      <div class="page" style="gap:12px">
        <div class="ca"><div class="t">Encaissé ce mois</div><div class="m">${dh(encaisse).replace(" DH", "")} <span>DH</span></div>
          <div class="g"><div><b>${dh(reste).replace(" DH", "")}</b><span>Reste à encaisser</span></div><div><b>${duMois.length}</b><span>Ventes ce mois</span></div><div class="rouge"><b>${impayes.length}</b><span>Impayés</span></div></div></div>
        ${topL.length ? `<div class="carte"><h3 style="margin-bottom:6px">Top produits ce mois</h3>${topL.map(([n, x]) => `<div class="kv" style="padding:4px 0"><span>${esc(n)}</span><b>× ${x}</b></div>`).join("")}</div>` : ""}
        <div style="display:flex;gap:8px"><label class="recherche" style="flex:1">${S.loupe}<input id="vq" placeholder="Client, commerce, produit" value="${esc(rechV)}" autocomplete="off"></label>
          <select id="vm" class="select-mois"><option value="">Tous les mois</option>${moisDispo.map(x => `<option value="${x}"${x === moisV ? " selected" : ""}>${esc(nomMois(x.replace("-", "")))} ${x.slice(0, 4)}</option>`).join("")}</select></div>
        <div class="puces">${[["tous", "Toutes"], ["impayes", "Impayés"], ...Object.keys(STATUTS).map(s => [s, s])].map(([k, t]) => `<button class="puce${filtreV === k ? " on" : ""}" data-f="${esc(k)}">${esc(t)}</button>`).join("")}</div>
        <div class="carte liste">${L.length ? L.map(v => `<a class="ligne" href="#/admin/vente/${esc(v.id)}"><span class="av">${esc(initiale(v.client && v.client.nom))}</span><span class="txt"><b>${esc((v.client && v.client.nom) || "Client")}${v.client && v.client.commerce ? " · " + esc(v.client.commerce) : ""}</b><span>${esc(jour(v.date))} · ${esc((v.lignes || []).map(l => (l.qte > 1 ? l.qte + "× " : "") + l.produit).join(", ").slice(0, 60))}</span></span><span style="text-align:right"><b style="display:block;font-size:14px">${dh(v.total)}</b>${tagStatut(v.statut)}</span></a>`).join("") : `<div class="vide">${V.length ? "Aucune vente ne correspond." : "Pas encore de vente : touchez « + Vente »."}</div>`}</div>
        <button class="btn-clair" id="v-csv" style="padding:12px">${ic("download", 16)} Exporter en CSV</button>
      </div>`, "ventes");
    $$("[data-f]").forEach(b => (b.onclick = () => { filtreV = b.dataset.f; ventes(); }));
    $("#vm").onchange = e => { moisV = e.target.value; ventes(); };
    $("#vq").oninput = e => { rechV = e.target.value; const pos = e.target.selectionStart; ventes().then(() => { const r = $("#vq"); r.focus(); r.setSelectionRange(pos, pos); }); };
    $("#v-csv").onclick = () => K.csv([["Date", "Client", "Commerce", "Téléphone", "Ville", "Produits", "Total (DH)", "Payé (DH)", "Reste (DH)", "Statut", "Mode de paiement", "Notes"],
      ...L.map(v => [v.date, v.client && v.client.nom, v.client && v.client.commerce, v.client && v.client.tel, v.client && v.client.ville, (v.lignes || []).map(l => `${l.qte}× ${l.produit} (${l.prix})`).join(" + "), v.total || 0, payeDe(v), resteDe(v), v.statut, v.mode || "", v.notes || ""])], `NFC WORK-Ventes-${moisV || "tout"}-${auj()}.csv`);
  }

  // ajouter une vente en 20 secondes ; la modifier à tout moment (même payée) ; corriger un devis (même numéro) ou une facture (annuler et corriger)
  async function formVente(id, mode, docId) {
    let ex = null, doc = null;
    const [prods, V] = await Promise.all([produitsListe().catch(() => []), ventesListe(true).catch(() => [])]);
    if (id) { ex = V.find(v => v.id === id); if (!ex) return aller("#/admin/ventes"); }
    if (docId) { try { const d = await db.doc("kiffyDocs/" + docId).get(); doc = d.exists ? { id: d.id, ...d.data() } : null; } catch (e) { erreur(e); } if (!doc || doc.statut !== "emis") { toast("Document introuvable ou déjà annulé."); return aller("#/admin/vente/" + id); } }
    const base = doc || ex;
    const s = base ? JSON.parse(JSON.stringify({ client: base.client || {}, lignes: base.lignes || [], remise: base.remise || { mode: "%", valeur: 0 }, date: (ex && ex.date) || base.date, statut: ex ? ex.statut : "Confirmé", notes: (ex && ex.notes) || "" }))
      : { client: { nom: "", commerce: "", tel: "", ville: "" }, lignes: [], remise: { mode: "%", valeur: 0 }, date: auj(), statut: "Confirmé", notes: "" };
    let paye = ex ? payeDe(ex) : 0, modeP = (ex && ex.mode) || "Espèces";
    const nomDoc = doc ? { devis: "devis", facture: "facture", recu: "reçu" }[doc.type] + " " + doc.numero : "";
    const titre = mode === "corriger" ? "Corriger la " + nomDoc.replace(/^reçu/, "le reçu") : mode === "devis" ? "Modifier le " + nomDoc : ex ? "Modifier la vente" : "Nouvelle vente";
    const clientsConnus = {}; V.forEach(v => { if (v.client && v.client.nom) clientsConnus[v.client.nom] = clientsConnus[v.client.nom] || v.client; });
    app.innerHTML = `<div class="ecran" style="padding-bottom:40px">${haut(titre, ex ? "#/admin/vente/" + esc(ex.id) : "#/admin/ventes")}
      <div class="page" style="gap:12px">
        ${mode === "corriger" ? `<div class="info-vert">${ic("file-invoice", 20)}<span>La ${esc(nomDoc)} sera <b>annulée</b> (gardée avec le motif) et remplacée par un nouveau document au <b>numéro suivant</b>.</span></div>` : ""}
        ${mode === "devis" ? `<div class="info-vert">${ic("file-text", 20)}<span>Le devis garde son numéro <b>${esc(doc.numero)}</b>. La vente est mise à jour aussi.</span></div>` : ""}
        <section class="section"><b>Client</b>
          <label class="champ">Nom<input id="v-nom" list="v-cl" maxlength="80" value="${esc(s.client.nom)}" placeholder="Karim Benali" autocomplete="off"></label><datalist id="v-cl">${Object.keys(clientsConnus).map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
          <div class="grille2"><label class="champ">Commerce<input id="v-com" maxlength="80" value="${esc(s.client.commerce)}" placeholder="Café Atlas"></label><label class="champ">Téléphone<input id="v-tel" type="tel" maxlength="20" value="${esc(s.client.tel)}" placeholder="06…"></label></div>
          <label class="champ">Ville<input id="v-ville" maxlength="40" value="${esc(s.client.ville)}" placeholder="Kénitra"></label></section>
        <section class="section"><b>Produits</b><div class="choix" id="v-pr">${prods.filter(x => x.actif !== false).map(x => `<button data-p="${esc(x.id)}">${esc(x.nom)}</button>`).join("")}</div><div id="v-lignes"></div>
          <div class="grille2" style="align-items:end"><label class="champ">Remise<input id="v-rem" type="number" inputmode="decimal" min="0" step="0.01" value="${+s.remise.valeur || 0}"></label><div class="seg" id="v-remm"><button data-r="%">%</button><button data-r="DH">DH</button></div></div>
          <div class="kv"><span class="muted">Sous-total</span><b id="v-st"></b></div><div class="kv"><span class="muted">Remise</span><b id="v-rd"></b></div>
          <div class="kv" style="font-size:17px;padding-top:4px"><span>Total</span><b id="v-tot"></b></div></section>
        <section class="section"><b>Statut et paiement</b>
          <label class="champ">Date<input id="v-date" type="date" value="${esc(s.date)}"></label>
          ${mode === "corriger" ? "" : `<div class="choix" id="v-stat">${Object.keys(STATUTS).map(x => `<button data-s="${esc(x)}">${esc(x)}</button>`).join("")}</div>`}
          ${ex ? `<div class="muted" style="font-size:12.5px">Payé : ${dh(paye)} · les paiements se modifient depuis la fiche de la vente.</div>` : `<div class="grille2" style="align-items:end"><label class="champ">Montant payé (DH)<input id="v-paye" type="number" inputmode="decimal" min="0" step="0.01" value="0"></label><div class="choix"><button id="v-rien">Rien</button><button id="v-tout">Tout</button></div></div>
          <div class="choix" id="v-mode">${MODES.map(x => `<button data-m="${x}">${x}</button>`).join("")}</div>`}
          <div class="muted" style="font-size:12.5px">Reste à payer : <b id="v-reste"></b></div>
          <label class="champ">Notes<textarea id="v-notes" rows="2" maxlength="600">${esc(s.notes)}</textarea></label></section>
        ${ex ? `<label class="champ">Motif ${mode === "corriger" ? "de l’annulation (obligatoire)" : "de la modification (facultatif)"}<input id="v-motif" maxlength="160" placeholder="${mode === "corriger" ? "Erreur de prix" : "Correction du prix"}"></label>` : ""}
        <p class="err" id="v-err"></p><button class="btn-noir" id="v-ok">${mode === "corriger" ? "Annuler et émettre le document corrigé" : mode === "devis" ? "Enregistrer le devis" : ex ? "Enregistrer les modifications" : "Enregistrer la vente"}</button>
      </div></div>`;
    const calc = () => calcul(s.lignes, s.remise);
    const dessine = () => {
      $("#v-lignes").innerHTML = s.lignes.length ? s.lignes.map((l, i) => `<div class="vente-ligne"><input class="vl-nom" data-i="${i}" value="${esc(l.produit)}" maxlength="80"><div class="qte"><button data-moins="${i}" aria-label="Moins">−</button><b>${l.qte}</b><button data-pl="${i}" aria-label="Plus">+</button></div><input class="vl-prix" data-i="${i}" type="number" inputmode="decimal" min="0" step="0.01" value="${l.prix}"><button class="vl-x" data-x="${i}" aria-label="Retirer">${ic("x", 16)}</button></div>`).join("") : `<div class="muted" style="font-size:13px">Touchez un produit pour l’ajouter.</div>`;
      chiffres();
      $$("#v-stat [data-s]").forEach(b => b.classList.toggle("on", b.dataset.s === s.statut));
      $$("#v-mode [data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === modeP));
      $$("#v-remm [data-r]").forEach(b => b.classList.toggle("on", b.dataset.r === s.remise.mode));
      $$(".qte [data-moins]").forEach(b => (b.onclick = () => { const l = s.lignes[+b.dataset.moins]; l.qte = Math.max(1, l.qte - 1); dessine(); }));
      $$(".qte [data-pl]").forEach(b => (b.onclick = () => { s.lignes[+b.dataset.pl].qte++; dessine(); }));
      $$(".vl-x").forEach(b => (b.onclick = () => { s.lignes.splice(+b.dataset.x, 1); dessine(); }));
      $$(".vl-nom").forEach(i => (i.oninput = () => { s.lignes[+i.dataset.i].produit = i.value; }));
      $$(".vl-prix").forEach(i => (i.oninput = () => { s.lignes[+i.dataset.i].prix = Math.max(0, parseFloat(i.value) || 0); chiffres(); }));
    };
    const chiffres = () => { const c = calc(); $("#v-st").textContent = dh(c.sousTotal); $("#v-rd").textContent = c.remiseDH ? "− " + dh(c.remiseDH) : "—"; $("#v-tot").textContent = dh(c.total); $("#v-reste").textContent = dh(Math.max(0, c.total - paye)); };
    $$("#v-pr [data-p]").forEach(b => (b.onclick = () => { const x = prods.find(p => p.id === b.dataset.p), l = s.lignes.find(y => y.produit === x.nom); if (l) l.qte++; else s.lignes.push({ produit: x.nom, qte: 1, prix: +x.prix || 0 }); dessine(); }));
    $$("#v-stat [data-s]").forEach(b => (b.onclick = () => { s.statut = b.dataset.s; dessine(); }));
    $$("#v-mode [data-m]").forEach(b => (b.onclick = () => { modeP = b.dataset.m; dessine(); }));
    $$("#v-remm [data-r]").forEach(b => (b.onclick = () => { s.remise.mode = b.dataset.r; dessine(); }));
    $("#v-rem").oninput = e => { s.remise.valeur = Math.max(0, parseFloat(e.target.value) || 0); chiffres(); };
    if ($("#v-paye")) {
      const majPaye = v => { paye = Math.max(0, v); $("#v-paye").value = paye; s.statut = statutAuto(s.statut, calc().total, paye); dessine(); };
      $("#v-paye").oninput = e => { paye = Math.max(0, parseFloat(e.target.value) || 0); s.statut = statutAuto(s.statut, calc().total, paye); dessine(); };
      $("#v-rien").onclick = () => majPaye(0); $("#v-tout").onclick = () => majPaye(calc().total);
    }
    $("#v-nom").oninput = e => { const c = clientsConnus[e.target.value]; if (c) { if (!$("#v-com").value) $("#v-com").value = c.commerce || ""; if (!$("#v-tel").value) $("#v-tel").value = c.tel || ""; if (!$("#v-ville").value) $("#v-ville").value = c.ville || ""; } };
    dessine();
    $("#v-ok").onclick = async () => {
      const client = { nom: $("#v-nom").value.trim().slice(0, 80), commerce: $("#v-com").value.trim().slice(0, 80), tel: $("#v-tel").value.trim().slice(0, 20), ville: $("#v-ville").value.trim().slice(0, 40) };
      const lignes = s.lignes.map(l => ({ produit: String(l.produit || "").trim().slice(0, 80) || "Produit", qte: Math.max(1, parseInt(l.qte, 10) || 1), prix: arrondi(Math.max(0, +l.prix || 0)) }));
      const motif = $("#v-motif") ? $("#v-motif").value.trim() : "";
      if (!client.nom) return ($("#v-err").textContent = "Écrivez le nom du client.");
      if (!lignes.length) return ($("#v-err").textContent = "Ajoutez au moins un produit.");
      if (mode === "corriger" && motif.length < 3) return ($("#v-err").textContent = "Écrivez le motif de l’annulation.");
      const remise = { mode: s.remise.mode === "DH" ? "DH" : "%", valeur: arrondi(+s.remise.valeur || 0) }, c = calcul(lignes, remise), date = $("#v-date").value || auj(), b = $("#v-ok"); b.disabled = true;
      const data = { client, cle: cleClient(client), lignes, remise, sousTotal: c.sousTotal, total: c.total, date, statut: s.statut, notes: $("#v-notes").value.trim(), maj: FV.serverTimestamp() };
      try {
        if (!ex) {
          const p = Math.min(paye, c.total);
          Object.assign(data, { statut: statutAuto(s.statut, c.total, p), paiements: p > 0 ? [{ montant: p, date, mode: modeP }] : [], paye: p, mode: p > 0 ? modeP : "", cree: FV.serverTimestamp() });
          const ref = await db.collection("kiffyVentes").add(data);
          K.journal("vente", `Nouvelle vente · ${client.nom} · ${dh(c.total)} · ${data.statut}`); ventesCache = null; toast("Vente enregistrée"); return aller("#/admin/vente/" + ref.id);
        }
        data.paye = payeDe(ex); data.statut = statutAuto(s.statut, c.total, data.paye);
        const apres = { ...ex, ...data }, d0 = diffVente(ex, apres);
        await db.doc("kiffyVentes/" + ex.id).update(data); ventesCache = null;
        if (d0.avant || d0.apres) K.journal("vente", `Vente modifiée · ${client.nom}`, null, { ...d0, motif });
        // le devis ouvert suit la vente (même numéro)
        const devis = mode === "devis" ? doc : mode === "corriger" ? null : (await db.collection("kiffyDocs").where("venteId", "==", ex.id).get()).docs.map(x => ({ id: x.id, ...x.data() })).find(x => x.type === "devis" && x.statut === "emis");
        if (devis) {
          await db.doc("kiffyDocs/" + devis.id).update({ client, lignes, remise, sousTotal: c.sousTotal, total: c.total, modifieLe: FV.serverTimestamp() });
          K.journal("document", `Devis ${devis.numero} modifié (même numéro)`, null, { avant: `total ${dh(devis.total)}`, apres: `total ${dh(c.total)}`, motif });
        }
        if (mode === "corriger") {
          const nv = await emettre(doc.type, { id: ex.id, ...apres, paiements: ex.paiements || [], mode: ex.mode || "" }, doc, motif);
          if (!nv) { b.disabled = false; return; }
          aller("#/admin/vente/" + ex.id); setTimeout(() => ouvrirDoc(nv), 900); return;
        }
        toast(mode === "devis" ? `Devis ${doc.numero} enregistré` : "Modifications enregistrées"); aller("#/admin/vente/" + ex.id);
      } catch (e) { erreur(e); b.disabled = false; }
    };
  }

  async function ficheVente(id) {
    let v = null; try { const d = await db.doc("kiffyVentes/" + id).get(); v = d.exists ? { id: d.id, ...d.data() } : null; } catch (e) { erreur(e); }
    if (!v) return aller("#/admin/ventes");
    const docs = (await db.collection("kiffyDocs").where("venteId", "==", id).get().catch(() => ({ docs: [] }))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.cree) - ms(a.cree));
    const paye = payeDe(v), reste = resteDe(v), c = v.client || {}, wa = telWa(c.tel), cc = calcul(v.lignes, v.remise);
    const devisOuvert = docs.find(d => d.type === "devis" && d.statut === "emis");
    const nomType = { devis: "Devis", facture: "Facture", recu: "Reçu" };
    ecran(`${haut("Vente", "#/admin/ventes", `<a class="lien" href="#/admin/vente/${esc(id)}/modifier">${ic("pencil", 14)} Modifier</a>`)}
      <div class="page" style="gap:12px">
        <div class="carte" style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><b style="font-size:18px">${esc(c.nom || "Client")}</b><div class="muted" style="font-size:13px">${esc([c.commerce, c.ville].filter(Boolean).join(" · "))}${c.tel ? " · " + esc(c.tel) : ""}</div></div>${tagStatut(v.statut)}</div>
          <div class="muted" style="font-size:12.5px">${esc(jour(v.date))}</div>
          <div class="actions-g">${wa ? `<a class="btn-clair" style="text-decoration:none" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ic("whatsapp", 16)} WhatsApp</a>` : ""}<a class="btn-clair" style="text-decoration:none" href="#/admin/vclient/${esc(v.cle || cleClient(c))}">${ic("history", 16)} Fiche client</a></div></div>
        <div class="carte">${(v.lignes || []).map(l => `<div class="histo"><span>${l.qte} × ${esc(l.produit)} <span class="muted">(${dh(l.prix)})</span></span><span>${dh(l.qte * l.prix)}</span></div>`).join("")}
          ${cc.remiseDH ? `<div class="kv" style="padding-top:8px"><span class="muted">Sous-total</span><b>${dh(cc.sousTotal)}</b></div><div class="kv"><span class="muted">Remise ${esc(libRemise(v.remise))}</span><b>− ${dh(cc.remiseDH)}</b></div>` : ""}
          <div class="kv" style="padding-top:10px;font-size:16px"><span>Total</span><b>${dh(v.total)}</b></div><div class="kv"><span class="muted">Payé</span><b style="color:#0E8A51">${dh(paye)}</b></div><div class="kv"><span class="muted">Reste à payer</span><b class="${reste ? "danger" : ""}">${dh(reste)}</b></div></div>
        <div class="carte"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Paiements</h3>${v.statut !== "Annulé" ? `<button class="lien" id="vp-add">+ Ajouter</button>` : ""}</div>
          ${(v.paiements || []).length ? v.paiements.map((x, i) => `<button class="histo" data-pi="${i}" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;color:inherit;text-align:left"><span>${esc(jour(x.date))} · ${esc(x.mode || "")} ${ic("pencil", 12)}</span><b>${dh(x.montant)}</b></button>`).join("") : `<div class="vide" style="padding:8px 0">Aucun paiement.</div>`}</div>
        <div class="carte"><h3 style="margin-bottom:8px">Statut</h3><div class="choix" id="vs">${Object.keys(STATUTS).map(x => `<button data-s="${esc(x)}" class="${x === v.statut ? "on" : ""}">${esc(x)}</button>`).join("")}</div></div>
        <div class="carte"><h3 style="margin-bottom:6px">Documents</h3>
          ${docs.length ? docs.map(d => `<button class="ligne" data-d="${esc(d.id)}"><span class="av">${ic(d.type === "devis" ? "file-text" : "file-invoice", 18)}</span><span class="txt"><b>${esc(nomType[d.type])} ${esc(d.numero)}</b><span>${esc(jour(d.date))} · ${dh(d.total)}${d.statut === "annule" ? " · annulé" + (d.remplaceePar ? " → " + esc(d.remplaceePar) : "") : d.statut === "converti" ? " · converti en " + esc(d.convertiEn || "facture") : ""}</span></span>${S.chev()}</button>`).join("") : `<div class="muted" style="font-size:13px;padding-bottom:6px">Aucun document.</div>`}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
            ${v.statut !== "Annulé" ? `<button class="btn-clair" id="vd-devis" style="padding:11px">${ic("file-text", 16)} ${devisOuvert ? "Modifier le devis " + esc(devisOuvert.numero) : "Créer un devis"}</button>` : ""}
            ${v.statut !== "Annulé" && v.statut !== "Prospect" ? `<button class="btn-noir moyen" id="vd-fact">${ic("file-invoice", 18)} ${devisOuvert ? "Convertir le devis en facture" : "Convertir en facture"}</button>` : ""}
            ${paye > 0 ? `<button class="btn-clair" id="vd-recu" style="padding:11px">${ic("receipt", 16)} Reçu de paiement</button>` : ""}</div></div>
        ${v.notes ? `<div class="carte"><h3>Notes</h3><p style="margin:6px 0 0;font-size:14px;white-space:pre-wrap">${esc(v.notes)}</p></div>` : ""}
        <div class="actions-g">${v.statut !== "Annulé" ? `<button class="btn-clair danger" id="v-ann" style="padding:11px">Annuler la vente</button>` : ""}<button class="btn-clair danger" id="v-sup" style="padding:11px">${ic("trash", 16)} Supprimer</button></div>
      </div>`, "ventes");
    const recharger = () => { ventesCache = null; ficheVente(id); };
    const majPaiements = async (P2, detail, avant, apres, motif) => {
      const tot = arrondi(P2.reduce((s, x) => s + (+x.montant || 0), 0)), st = statutAuto(v.statut, v.total, tot);
      await db.doc("kiffyVentes/" + id).update({ paiements: P2, paye: tot, mode: P2.length ? P2[P2.length - 1].mode : "", statut: st, maj: FV.serverTimestamp() });
      K.journal("encaissement", `${detail} · ${c.nom}`, null, { avant, apres, motif });
    };
    const motifFeuille = (titre, texte, bouton, danger) => new Promise(ok => {
      const f = feuille(`<h2>${esc(titre)}</h2>${texte ? `<p class="muted" style="margin:0;font-size:13.5px">${esc(texte)}</p>` : ""}<label class="champ">Motif (facultatif)<input id="mf" maxlength="160"></label>
        <button class="btn-noir moyen${danger ? " danger" : ""}" id="mf-ok">${esc(bouton)}</button><button class="btn-clair" data-fermer style="padding:12px">Retour</button>`, { surFermer: () => ok(null) });
      $("#mf-ok", f).onclick = () => { const m = $("#mf", f).value.trim(); f.remove(); ok(m); };
    });
    $$("#vs [data-s]").forEach(b => (b.onclick = async () => {
      const st = b.dataset.s; if (st === v.statut) return;
      const m = st === "Annulé" ? await motifFeuille("Annuler la vente ?", "Elle reste dans le carnet, marquée « Annulé ».", "Annuler la vente", true) : "";
      if (m === null) return;
      try { await db.doc("kiffyVentes/" + id).update({ statut: st, maj: FV.serverTimestamp() }); K.journal("vente", `Statut de la vente ${c.nom}`, null, { avant: v.statut, apres: st, motif: m }); recharger(); } catch (e) { erreur(e); }
    }));
    if ($("#v-ann")) $("#v-ann").onclick = () => $('#vs [data-s="Annulé"]').click();
    $("#v-sup").onclick = async () => {
      const emis = docs.filter(d => d.type !== "devis" && d.statut === "emis");
      if (emis.length) return toast(`${emis.map(d => d.numero).join(", ")} : annulez d’abord ce document (une facture ne se supprime pas).`, true);
      const m = await motifFeuille("Supprimer la vente ?", `${c.nom} · ${dh(v.total)}. Elle disparaît du carnet et des totaux${devisOuvert ? " ; le devis " + devisOuvert.numero + " est annulé" : ""}. Impossible d’annuler.`, "Supprimer définitivement", true);
      if (m === null) return;
      try {
        for (const d of docs.filter(x => x.type === "devis" && x.statut === "emis")) await db.doc("kiffyDocs/" + d.id).update({ statut: "annule", annuleLe: FV.serverTimestamp(), motifAnnulation: "Vente supprimée" + (m ? " : " + m : "") });
        await db.doc("kiffyVentes/" + id).delete();
        K.journal("vente", `Vente supprimée · ${c.nom}`, null, { avant: resume(v), apres: "supprimée", motif: m }); ventesCache = null; toast("Vente supprimée"); aller("#/admin/ventes");
      } catch (e) { erreur(e); }
    };
    const feuillePaiement = (x, i) => {
      let mode = (x && x.mode) || v.mode || "Espèces";
      const f = feuille(`<h2>${x ? "Modifier le paiement" : "Ajouter un paiement"}</h2><label class="champ">Montant (DH)<input id="pm" type="number" inputmode="decimal" min="0" step="0.01" value="${x ? x.montant : reste}"></label><label class="champ">Date<input id="pd" type="date" value="${x ? esc(x.date) : auj()}"></label>
        <div class="choix" id="pmo">${MODES.map(m => `<button data-m="${m}" class="${m === mode ? "on" : ""}">${m}</button>`).join("")}</div>${x ? `<label class="champ">Motif (facultatif)<input id="pmm" maxlength="160"></label>` : ""}
        <button class="btn-noir moyen" id="pm-ok">Enregistrer</button>${x ? `<button class="btn-clair danger" id="pm-del" style="padding:12px">${ic("trash", 16)} Supprimer ce paiement</button>` : ""}<button class="btn-clair" data-fermer style="padding:12px">Annuler</button>`);
      $$("#pmo [data-m]", f).forEach(b => (b.onclick = () => { mode = b.dataset.m; $$("#pmo [data-m]", f).forEach(y => y.classList.toggle("on", y === b)); }));
      const lib = y => `${dh(y.montant)} le ${jour(y.date)} (${y.mode})`;
      $("#pm-ok", f).onclick = async () => {
        const m = arrondi(parseFloat($("#pm", f).value) || 0); if (!(m > 0)) return toast("Montant invalide.");
        const y = { montant: m, date: $("#pd", f).value || auj(), mode }, P2 = [...(v.paiements || [])];
        if (x) P2[i] = y; else P2.push(y);
        try { await majPaiements(P2, x ? "Paiement modifié" : `Paiement ${dh(m)} (${mode})`, x ? lib(x) : "", lib(y), $("#pmm", f) ? $("#pmm", f).value.trim() : ""); f.remove(); toast(x ? "Paiement modifié" : "Paiement enregistré"); recharger(); } catch (e) { erreur(e); }
      };
      if ($("#pm-del", f)) $("#pm-del", f).onclick = async () => {
        if (!(await confirmer("Supprimer ce paiement ?", `${lib(x)}. Le reste à payer sera recalculé.`, "Supprimer", true))) return;
        const P2 = (v.paiements || []).filter((_, k) => k !== i);
        try { await majPaiements(P2, "Paiement supprimé", lib(x), "supprimé", $("#pmm", f) ? $("#pmm", f).value.trim() : ""); f.remove(); toast("Paiement supprimé"); recharger(); } catch (e) { erreur(e); }
      };
    };
    if ($("#vp-add")) $("#vp-add").onclick = () => feuillePaiement(null);
    $$("[data-pi]").forEach(b => (b.onclick = () => feuillePaiement(v.paiements[+b.dataset.pi], +b.dataset.pi)));
    $$("[data-d]").forEach(b => (b.onclick = () => ouvrirDoc(docs.find(d => d.id === b.dataset.d), recharger)));
    if ($("#vd-devis")) $("#vd-devis").onclick = async () => {
      if (devisOuvert) return aller(`#/admin/vente/${id}/devis/${devisOuvert.id}`);
      emettre("devis", v).then(d => { if (d) { if (v.statut === "Prospect") db.doc("kiffyVentes/" + id).update({ statut: "Devis envoyé" }).catch(() => {}); ouvrirDoc(d, recharger); recharger(); } });
    };
    if ($("#vd-fact")) $("#vd-fact").onclick = async () => {
      const e = await entrepriseDoc();
      const lib = fiscal(e) ? "une facture (F-…)" : "un reçu (R-…), car l’ICE, l’IF et le n° d’auto-entrepreneur ne sont pas encore remplis (Mon entreprise)";
      if (!(await confirmer("Émettre le document ?", `Cette vente donne ${lib}. Une fois émis, il ne se modifie plus (correction = « Annuler et corriger »).`, "Émettre"))) return;
      const d = await emettre("facture", v); if (!d) return;
      if (devisOuvert) await db.doc("kiffyDocs/" + devisOuvert.id).update({ statut: "converti", convertiEn: d.numero }).catch(erreur);
      ouvrirDoc(d, recharger); recharger();
    };
    if ($("#vd-recu")) $("#vd-recu").onclick = async () => { const d = await emettre("recu", v); if (d) { ouvrirDoc(d, recharger); recharger(); } };
  }

  // fiche client : tout l'historique des ventes (même téléphone, sinon même nom)
  async function ficheClientVente(cle) {
    let V = []; try { V = await ventesListe(true); } catch (e) { erreur(e); }
    const L = V.filter(v => (v.cle || cleClient(v.client || {})) === cle);
    if (!L.length) return aller("#/admin/ventes");
    const c = L[0].client || {}, ok = L.filter(compte), wa = telWa(c.tel);
    ecran(`${haut("Fiche client", "#/admin/ventes")}
      <div class="page" style="gap:12px">
        <div class="carte"><b style="font-size:18px">${esc(c.nom)}</b><div class="muted" style="font-size:13px">${esc([c.commerce, c.ville, c.tel].filter(Boolean).join(" · "))}</div>
          ${wa ? `<div class="actions-g" style="margin-top:10px"><a class="btn-clair" style="text-decoration:none" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ic("whatsapp", 16)} WhatsApp</a><a class="btn-clair" style="text-decoration:none" href="tel:${esc(c.tel)}">Appeler</a></div>` : ""}</div>
        <div class="mini-stats"><div><b>${dh(ok.reduce((s, v) => s + (v.total || 0), 0)).replace(" DH", "")}</b><span>Total (DH)</span></div><div><b>${dh(ok.reduce((s, v) => s + payeDe(v), 0)).replace(" DH", "")}</b><span>Payé</span></div><div><b>${dh(ok.reduce((s, v) => s + (v.statut === "Devis envoyé" ? 0 : resteDe(v)), 0)).replace(" DH", "")}</b><span>Reste</span></div></div>
        <div class="carte liste">${L.map(v => `<a class="ligne" href="#/admin/vente/${esc(v.id)}"><span class="txt"><b>${esc((v.lignes || []).map(l => (l.qte > 1 ? l.qte + "× " : "") + l.produit).join(", "))}</b><span>${esc(jour(v.date))}</span></span><span style="text-align:right"><b style="display:block;font-size:14px">${dh(v.total)}</b>${tagStatut(v.statut)}</span></a>`).join("")}</div>
        <a class="btn-noir moyen" href="#/admin/vente/nouvelle" style="text-decoration:none">${ic("plus", 18)} Nouvelle vente</a>
      </div>`, "ventes");
  }

  /* ================= DEVIS / FACTURES / REÇUS ================= */
  // numérotation continue par année : D-2026-001, F-2026-001, R-2026-001 (transaction : jamais deux fois le même numéro)
  // correction d'une facture / d'un reçu : l'ancien est annulé (gardé, avec le motif) dans la MÊME transaction que l'émission du nouveau
  async function emettre(type, v, ancien, motif) {
    const e = await entrepriseDoc();
    if (ancien) type = ancien.type; else if (type === "facture" && !fiscal(e)) type = "recu";
    const an = new Date().getFullYear(), pre = { devis: "D", facture: "F", recu: "R" }[type];
    const cref = db.doc(`kiffyCompteurs/${type}-${an}`), dref = db.collection("kiffyDocs").doc(), aref = ancien ? db.doc("kiffyDocs/" + ancien.id) : null;
    const paye = payeDe(v), date = auj(), c = calcul(v.lignes, v.remise);
    const validite = type === "devis" ? new Date(Date.now() + (e.validite || 30) * 864e5).toLocaleDateString("fr-CA", { timeZone: "Africa/Casablanca" }) : "";
    const entr = { nom: e.nom, adresse: e.adresse, tel: e.tel, email: e.email, site: e.site, ae: e.ae, ifisc: e.ifisc, ice: e.ice, cin: e.cin, rib: e.rib, mention: e.mention };
    try {
      const doc = await db.runTransaction(async t => {
        const cs = await t.get(cref), av = aref ? await t.get(aref) : null;
        if (aref && (!av.exists || av.data().statut !== "emis")) throw new Error("Ce document a déjà été annulé.");
        const n = (cs.exists ? cs.data().n || 0 : 0) + 1, numero = `${pre}-${an}-${String(n).padStart(3, "0")}`;
        const d = { type, numero, venteId: v.id, date, validite, client: v.client || {}, lignes: v.lignes || [], remise: v.remise || null, sousTotal: c.sousTotal, total: c.total,
          paye: type === "devis" ? 0 : paye, reste: type === "devis" ? c.total : Math.max(0, c.total - paye), mode: v.mode || "", paiements: type === "devis" ? [] : v.paiements || [],
          entreprise: entr, statut: "emis", cree: FV.serverTimestamp(), ...(ancien ? { remplace: ancien.numero } : {}) };
        t.set(cref, { n, maj: FV.serverTimestamp() }); t.set(dref, d);
        if (aref) t.update(aref, { statut: "annule", annuleLe: FV.serverTimestamp(), motifAnnulation: motif || "Correction", remplaceePar: numero });
        return { id: dref.id, ...d, cree: Date.now() };
      });
      const nom = { devis: "Devis", facture: "Facture", recu: "Reçu" }[type];
      if (ancien) K.journal("document", `${nom} ${ancien.numero} annulé(e) et corrigé(e) par ${doc.numero} · ${(v.client || {}).nom || ""}`, null, { avant: `${ancien.numero} · ${dh(ancien.total)}`, apres: `${doc.numero} · ${dh(doc.total)}`, motif });
      else K.journal("document", `${nom} ${doc.numero} · ${(v.client || {}).nom || ""} · ${dh(doc.total)}`);
      toast(ancien ? `${ancien.numero} annulé · ${doc.numero} émis` : `${doc.numero} créé`);
      return doc;
    } catch (x) { erreur(x); return null; }
  }
  function ouvrirDoc(d, apres) {
    if (!d) return;
    const nom = { devis: "Devis", facture: "Facture", recu: "Reçu" }[d.type], fichierNom = `${d.numero}.pdf`, c = d.client || {}, wa = telWa(c.tel);
    const texte = `Bonjour ${String(c.nom || "").split(" ")[0]}, voici ${d.type === "devis" ? "votre devis" : d.type === "facture" ? "votre facture" : "votre reçu"} ${d.numero} de ${dh(d.total)} · ${(d.entreprise && d.entreprise.nom) || "NFC WORK"}.`;
    const ouvert = d.statut === "emis";
    const f = feuille(`<h2>${esc(nom)} ${esc(d.numero)}</h2><p class="muted" style="margin:0;font-size:13.5px">${esc(c.nom || "")} · ${dh(d.total)} · ${esc(jour(d.date))}${d.remplace ? " · remplace " + esc(d.remplace) : ""}</p>
      ${d.statut === "annule" ? `<div class="pause">Annulé${d.motifAnnulation ? " : " + esc(d.motifAnnulation) : ""}${d.remplaceePar ? ` · remplacé par <b>${esc(d.remplaceePar)}</b>` : ""}</div>` : ""}
      <button class="btn-noir moyen" id="dc-pdf">${ic("share", 18)} Partager le PDF (WhatsApp, mail…)</button>
      <button class="btn-clair" id="dc-dl" style="padding:12px">${ic("download", 16)} Télécharger</button>
      <div class="actions-g">${wa ? `<a class="btn-clair" style="text-decoration:none" href="https://wa.me/${wa}?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">${ic("whatsapp", 16)} WhatsApp</a>` : ""}<a class="btn-clair" style="text-decoration:none" href="mailto:?subject=${encodeURIComponent(nom + " " + d.numero)}&body=${encodeURIComponent(texte + "\n\nLe PDF est en pièce jointe.")}">${ic("mail", 16)} E-mail</a></div>
      ${ouvert && d.type === "devis" ? `<button class="btn-clair" id="dc-mod" style="padding:12px">${ic("pencil", 16)} Modifier le devis (même numéro)</button>` : ""}
      ${ouvert && d.type !== "devis" ? `<button class="btn-clair" id="dc-cor" style="padding:12px">${ic("refresh", 16)} Annuler et corriger</button>` : ""}
      ${ouvert ? `<button class="btn-clair danger" id="dc-ann" style="padding:12px">Annuler ${d.type === "devis" ? "le devis" : "sans corriger"}</button>` : ""}
      <button class="btn-clair" data-fermer style="padding:12px">Fermer</button>`);
    const faire = async partager => { try { toast("Préparation du PDF…"); const blob = await pdf(d); await K.fichier(fichierNom, blob, `${nom} ${d.numero}`, partager); } catch (e) { erreur(e); } };
    $("#dc-pdf", f).onclick = () => faire(true);
    $("#dc-dl", f).onclick = () => faire(false);
    if ($("#dc-mod", f)) $("#dc-mod", f).onclick = () => { f.remove(); aller(`#/admin/vente/${d.venteId}/devis/${d.id}`); };
    if ($("#dc-cor", f)) $("#dc-cor", f).onclick = () => { f.remove(); aller(`#/admin/vente/${d.venteId}/corriger/${d.id}`); };
    if ($("#dc-ann", f)) $("#dc-ann", f).onclick = async () => {
      const g = feuille(`<h2>Annuler ${esc(d.numero)} ?</h2><p class="muted" style="margin:0;font-size:13.5px">Le document reste dans le registre, marqué « annulé » avec le motif.${d.type === "devis" ? "" : " Pour le remplacer, utilisez plutôt « Annuler et corriger »."}</p>
        <label class="champ">Motif<input id="am" maxlength="160" placeholder="Erreur de prix"></label><button class="btn-noir moyen danger" id="am-ok">Annuler le document</button><button class="btn-clair" data-fermer style="padding:12px">Retour</button>`);
      $("#am-ok", g).onclick = async () => {
        const m = $("#am", g).value.trim(); if (m.length < 3) return toast("Écrivez le motif.");
        try { await db.doc("kiffyDocs/" + d.id).update({ statut: "annule", annuleLe: FV.serverTimestamp(), motifAnnulation: m }); K.journal("document", `${nom} ${d.numero} annulé`, null, { avant: "émis", apres: "annulé", motif: m }); g.remove(); f.remove(); toast(`${d.numero} annulé`); apres && apres(); } catch (e) { erreur(e); }
      };
    };
  }
  let filtreD = "tous";
  async function docs() {
    let L = []; try { L = (await db.collection("kiffyDocs").get()).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.numero).localeCompare(String(a.numero)) || ms(b.cree) - ms(a.cree)); } catch (e) { erreur(e); }
    const V = L.filter(d => filtreD === "tous" || d.type === filtreD);
    const nomType = { devis: "Devis", facture: "Facture", recu: "Reçu" };
    ecran(`${haut("Devis et factures", "#/admin/plus")}
      <div class="page" style="gap:12px">
        <div class="puces">${[["tous", "Tous"], ["devis", "Devis"], ["facture", "Factures"], ["recu", "Reçus"]].map(([k, t]) => `<button class="puce${filtreD === k ? " on" : ""}" data-f="${k}">${t} · ${k === "tous" ? L.length : L.filter(d => d.type === k).length}</button>`).join("")}</div>
        <div class="carte liste">${V.length ? V.map(d => `<button class="ligne" data-d="${esc(d.id)}"><span class="av">${ic(d.type === "devis" ? "file-text" : "file-invoice", 18)}</span><span class="txt"><b>${esc(nomType[d.type])} ${esc(d.numero)}</b><span>${esc((d.client || {}).nom || "")} · ${esc(jour(d.date))}</span></span><span style="text-align:right"><b style="display:block;font-size:14px">${dh(d.total)}</b>${d.statut === "annule" ? `<span class="tag rouge">Annulé${d.remplaceePar ? " → " + esc(d.remplaceePar) : ""}</span>` : d.statut === "converti" ? `<span class="tag menthe">Converti</span>` : `<span class="tag" style="background:#EEF2EF;color:#5B665F">Émis</span>`}</span></button>`).join("") : `<div class="vide">Aucun document. Ils se créent depuis une vente.</div>`}</div>
        <button class="btn-clair" id="d-csv" style="padding:12px">${ic("download", 16)} Registre en CSV</button>
      </div>`, "plus");
    $$("[data-f]").forEach(b => (b.onclick = () => { filtreD = b.dataset.f; docs(); }));
    $$("[data-d]").forEach(b => (b.onclick = () => ouvrirDoc(L.find(d => d.id === b.dataset.d), docs)));
    $("#d-csv").onclick = () => K.csv([["Numéro", "Type", "Date", "Client", "Commerce", "Total (DH)", "Payé (DH)", "Statut", "Motif d’annulation"], ...V.map(d => [d.numero, nomType[d.type], d.date, (d.client || {}).nom, (d.client || {}).commerce, d.total, d.paye, d.statut, d.motifAnnulation || ""])], `NFC WORK-Documents-${auj()}.csv`);
  }

  // PDF au design Kiffy / NFC WORK (A4, français)
  let logoPdf = null;
  // logo réduit (500 px) sur fond blanc, en JPEG : un PDF léger (~30 Ko) à envoyer sur WhatsApp
  const imageData = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => { const w = Math.min(500, i.naturalWidth), h = Math.round(i.naturalHeight * w / i.naturalWidth), c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(i, 0, 0, w, h); ok({ data: c.toDataURL("image/jpeg", 0.9), w, h }); }; i.onerror = ko; i.src = src; });
  const latin = t => String(t == null ? "" : t).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[  ]/g, " ").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
  async function pdf(d) {
    await K.chargerJs("vendor/jspdf.umd.min.js");
    if (!logoPdf) logoPdf = await imageData("../assets/img/logo-nfcwork-full.png").catch(() => null);
    // règle de marque : toujours « NFC WORK » (même si « Mon entreprise » a été rempli autrement) ; nfcwork.ma et l'e-mail ne bougent pas
    const marque = t => String(t || "").replace(/\bnfc[ -]?work\b(?!\.[a-z])/gi, "NFC WORK");
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" }), e0 = d.entreprise || {}, c = d.client || {};
    const e = { ...e0, nom: marque(e0.nom), mention: marque(e0.mention), adresse: marque(e0.adresse) };
    const V = [22, 193, 114], N = [10, 10, 10], G = [91, 102, 95], L = [230, 236, 232];
    const T = (t, x, y, o) => doc.text(latin(t), x, y, o);
    const titre = { devis: "DEVIS", facture: "FACTURE", recu: "REÇU" }[d.type];
    doc.setFillColor(...V); doc.rect(0, 0, 210, 6, "F");
    if (logoPdf) doc.addImage(logoPdf.data, "JPEG", 15, 15, 56, 56 * logoPdf.h / logoPdf.w);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...G);
    let y = 30; [e.nom, e.adresse, [e.tel, e.email].filter(Boolean).join(" · "), e.site].filter(Boolean).forEach(l => { T(l, 15, y); y += 4.6; });
    doc.setTextColor(...N); doc.setFont("helvetica", "bold"); doc.setFontSize(24); T(titre, 195, 22, { align: "right" });
    doc.setFontSize(10.5); T("N° " + d.numero, 195, 30, { align: "right" });
    if (d.remplace) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...G); T(`Remplace ${d.remplace} (annulé)`, 195, 46, { align: "right" }); doc.setFont("helvetica", "bold"); doc.setTextColor(...N); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...G);
    T("Date : " + new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR"), 195, 36, { align: "right" });
    if (d.type === "devis" && d.validite) T("Valable jusqu'au " + new Date(d.validite + "T12:00:00").toLocaleDateString("fr-FR"), 195, 41, { align: "right" });
    // client
    y = Math.max(y + 6, 54);
    doc.setFillColor(244, 247, 245); doc.roundedRect(15, y, 90, 30, 3, 3, "F");
    doc.setTextColor(...G); doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); T(d.type === "devis" ? "DEVIS POUR" : "CLIENT", 20, y + 7);
    doc.setTextColor(...N); doc.setFontSize(11); T(c.nom || "", 20, y + 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...G);
    [c.commerce, [c.tel, c.ville].filter(Boolean).join(" · ")].filter(Boolean).forEach((l, i) => T(l, 20, y + 19 + i * 5));
    // lignes
    y += 42;
    doc.setFillColor(230, 248, 238); doc.rect(15, y, 180, 9, "F");
    doc.setTextColor(...N); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    T("Désignation", 19, y + 6); T("Qté", 122, y + 6, { align: "right" }); T("Prix unitaire", 155, y + 6, { align: "right" }); T("Total", 191, y + 6, { align: "right" });
    y += 9; doc.setFont("helvetica", "normal");
    (d.lignes || []).forEach(l => {
      const lignesTxt = doc.splitTextToSize(latin(l.produit), 92), h = Math.max(9, lignesTxt.length * 4.6 + 4);
      if (y + h > 250) { doc.addPage(); y = 20; }
      doc.text(lignesTxt, 19, y + 6); T(String(l.qte), 122, y + 6, { align: "right" }); T(dh(l.prix), 155, y + 6, { align: "right" }); T(dh(l.qte * l.prix), 191, y + 6, { align: "right" });
      y += h; doc.setDrawColor(...L); doc.line(15, y, 195, y);
    });
    // totaux
    y += 6; const tot = (lib, val, gras, coul) => { doc.setFont("helvetica", gras ? "bold" : "normal"); doc.setFontSize(gras ? 12 : 10); doc.setTextColor(...(coul || N)); T(lib, 150, y, { align: "right" }); T(val, 191, y, { align: "right" }); y += gras ? 8 : 6; };
    const cr = calcul(d.lignes, d.remise), avecRemise = cr.remiseDH > 0;
    doc.setFillColor(244, 247, 245); doc.roundedRect(110, y - 5, 85, (d.type === "devis" ? 12 : 26) + (avecRemise ? 12 : 0), 3, 3, "F");
    if (avecRemise) { tot("Sous-total", dh(cr.sousTotal), false); tot("Remise " + latin(libRemise(d.remise)), "- " + dh(cr.remiseDH), false); }
    tot("Total", dh(d.total), true);
    if (d.type !== "devis") { tot("Payé", dh(d.paye), false, [14, 138, 81]); tot("Reste à payer", dh(d.reste), false, d.reste > 0 ? [192, 38, 45] : N); }
    y += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...G);
    if (d.type !== "devis" && (d.paiements || []).length) { T("Paiement : " + d.paiements.map(p => `${dh(p.montant)} le ${new Date(p.date + "T12:00:00").toLocaleDateString("fr-FR")} (${p.mode})`).join(" · "), 15, y); y += 6; }
    else if (d.mode) { T("Mode de paiement : " + d.mode, 15, y); y += 6; }
    if (d.type === "devis") { T("Devis valable " + Math.round((new Date(d.validite) - new Date(d.date)) / 864e5) + " jours. Bon pour accord : date et signature du client.", 15, y); y += 6; }
    // pied : identifiants, RIB, mention
    const pied = [[e.ice && "ICE : " + e.ice, e.ifisc && "IF : " + e.ifisc, e.ae && "N° auto-entrepreneur : " + e.ae, e.cin && "CIN : " + e.cin].filter(Boolean).join(" · "), e.rib && "RIB : " + e.rib, e.mention].filter(Boolean);
    let yp = 278 - pied.length * 4.4;
    doc.setDrawColor(...L); doc.line(15, yp - 4, 195, yp - 4); doc.setFontSize(8.5); doc.setTextColor(...G);
    pied.forEach(l => { doc.text(doc.splitTextToSize(latin(l), 180), 105, yp, { align: "center" }); yp += 4.4; });
    doc.setTextColor(...V); doc.setFont("helvetica", "bold"); T("Merci pour votre confiance · Kiffy par NFC WORK", 105, 287, { align: "center" });
    if (d.statut === "annule") { doc.setTextColor(192, 38, 45); doc.setFontSize(64); doc.text("ANNULÉ", 105, 160, { align: "center", angle: 30 }); }
    return doc.output("blob");
  }

  /* ---------------- routes « #/admin/… » gérées ici ---------------- */
  return {
    echeance, rappel, messageClients, abonnementReglages, paiementAbo,
    route(r) {
      const [a, b, c] = r;
      switch (a) {
        case "stats": stats(); return true;
        case "plus": plus(); return true;
        case "abonnements": abonnements(); return true;
        case "clients": clients(b || ""); return true;
        case "journal": journal(); return true;
        case "entreprise": entreprise(); return true;
        case "produits": produits(); return true;
        case "ventes": ventes(); return true;
        case "vente": if (b === "nouvelle") formVente(); else if (c === "modifier") formVente(b); else if (c === "devis" || c === "corriger") formVente(b, c, r[3]); else ficheVente(b); return true;
        case "vclient": ficheClientVente(b); return true;
        case "docs": docs(); return true;
        default: return false;
      }
    }
  };
};
