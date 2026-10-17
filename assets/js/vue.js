/* NFCWORK — compteur de visites (1 par appareil et par jour), lu dans l'Espace.
   Firestore stats/<type>-<nom>-<AAAAMM>  { n }  — règle : seulement +1 à la fois (voir l'Espace). */
window.NFCW_VUE = function (type, nom) {
  try {
    if (!nom || /[?&]apercu/.test(location.search) || localStorage.getItem("nfcwork-admin") === "1") return;
    const d = new Date(), mois = String(d.getFullYear() * 100 + d.getMonth() + 1), jour = d.toISOString().slice(0, 10);
    const cle = "nfcw-vue-" + type + "-" + nom;
    if (localStorage.getItem(cle) === jour) return;
    localStorage.setItem(cle, jour);
    const P = "projects/nfcwork-espace/databases/(default)/documents";
    fetch("https://firestore.googleapis.com/v1/" + P + ":commit?key=AIzaSyDFJGerneuM-Og0Hs9IKIcFqVbLlS9Yqjc", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ writes: [{ transform: { document: P + "/stats/" + type + "-" + nom + "-" + mois, fieldTransforms: [{ fieldPath: "n", increment: { integerValue: "1" } }] } }] })
    }).catch(() => {});
  } catch (e) {}
};
