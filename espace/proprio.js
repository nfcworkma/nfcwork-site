/* NFCWORK — mode commerçant pour pages.js et tv.js
   Le client modifie seulement ce que NFCWORK a coché dans sa fiche (clients/<id>.acces).
   NFCW_PROPRIO(db, user, "pages"|"tvs", "editPages"|"editTv") → liste des slugs autorisés, ou null */
window.NFCW_PROPRIO = async function (db, u, cle, droit) {
  try {
    if (!u || !u.emailVerified) return null;
    const s = await db.collection("clients").where("email", "==", (u.email || "").toLowerCase()).get();
    const ac = s.docs.length ? s.docs[0].data().acces : null;
    if (!ac || !ac[droit] || !(ac[cle] || []).length) return null;
    document.body.classList.add("proprio");
    const st = document.createElement("style");
    st.textContent = "body.proprio [data-adm]{display:none!important}";
    document.head.appendChild(st);
    return ac[cle].slice();
  } catch (e) { console.error(e); return null; }
};
window.NFCW_REFUS = function (app) {
  app.innerHTML = `<div class="empty"><h3>Accès réservé</h3><p>Demandez à NFCWORK d’activer la modification pour votre compte.</p><a class="btn" href="./">Retour à mon espace</a></div>`;
};
