/* NFCWORK — adresse du serveur Wallet (Cloudflare Worker, voir /wallet/worker.js).
   Vide = boutons Wallet cachés. Exemple : "https://nfcwork-wallet.nfcwork.workers.dev" */
window.NFCW_WALLET = "https://nfcwork-wallet.nfcworkmacontact.workers.dev";

/* Service Apple Wallet (Firebase Functions, voir /functions) : mises à jour et messages vers les iPhones.
   Vide = pas d'envoi Apple. */
window.NFCW_APPLE_WS = "https://europe-west1-nfcwork-espace.cloudfunctions.net/apple";
