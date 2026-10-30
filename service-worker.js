/* =========================================================
   NFCWORK — SERVICE WORKER (application installable)
   - Pages HTML, CSS, JS : réseau d'abord (les mises à jour s'affichent),
     copie en cache si pas de connexion.
   - Images : cache, puis mise à jour en arrière-plan.
   Après une grosse modification, change VERSION (ex. "v2").
   ========================================================= */
const VERSION = "v64";
const CACHE = "nfcwork-" + VERSION;
const CORE = [
  "./", "index.html", "espace/pos.html", "espace/pos.js", "espace/config.js", "assets/img/logo-nfcwork.png", "assets/img/logo-nfcwork-blanc.png", "manifest.json"
];

self.addEventListener("install", e => {
  // cache: "reload" = toujours la version du serveur, jamais une vieille copie du navigateur
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => /^nfcwork-v\d+$/.test(k) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // Seulement les fichiers du site (pas WhatsApp, Google Sheets, polices...)
  // 🧾 caisse hors connexion : la bibliothèque Firebase (gstatic) est gardée en cache
  if (req.method === "GET" && url.host === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(res => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(x => x.put(req, copy)); } return res; })));
    return;
  }
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // vidéos (écran TV) : le navigateur et la page TV s'en occupent
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return;

  if (req.mode === "navigate" || /\.(html|css|js|json)$/.test(url.pathname)) {
    // HTML, CSS, JS : réseau d'abord (HTML et JS restent toujours à la même version)
    e.respondWith(
      fetch(req, { cache: "no-cache" })   // toujours vérifier auprès du serveur : les nouveautés s'affichent tout de suite
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
