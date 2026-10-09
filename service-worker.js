/* =========================================================
   NFCWORK — SERVICE WORKER (application installable)
   - Pages HTML, CSS, JS : réseau d'abord (les mises à jour s'affichent),
     copie en cache si pas de connexion.
   - Images : cache, puis mise à jour en arrière-plan.
   Après une grosse modification, change VERSION (ex. "v2").
   ========================================================= */
const VERSION = "v3";
const CACHE = "nfcwork-" + VERSION;
const CORE = [
  "./", "index.html", "produits.html", "commande.html", "contact.html",
  "reclamation.html", "a-propos.html", "faq.html", "conditions.html",
  "assets/css/style.css", "assets/js/config.js", "assets/js/catalog.js",
  "assets/js/i18n.js", "assets/js/app.js", "assets/img/logo.png", "manifest.json"
];

self.addEventListener("install", e => {
  // cache: "reload" = toujours la version du serveur, jamais une vieille copie du navigateur
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("nfcwork-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // Seulement les fichiers du site (pas WhatsApp, Google Sheets, polices...)
  if (req.method !== "GET" || url.origin !== location.origin) return;

  if (req.mode === "navigate" || /\.(html|css|js|json)$/.test(url.pathname)) {
    // HTML, CSS, JS : réseau d'abord (HTML et JS restent toujours à la même version)
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
    return;
  }

  // Images : cache d'abord, mise à jour en arrière-plan
  e.respondWith(
    caches.match(req).then(cached => {
      const fresh = fetch(req)
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
