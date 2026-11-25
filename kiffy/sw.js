/* Kiffy — service worker (portée /kiffy/) : l'app s'ouvre même avec un réseau faible.
   Toujours le réseau d'abord (les nouveautés arrivent tout de suite), la copie en cache si hors ligne.
   Firebase / Google / le Worker Wallet ne passent jamais par ce cache. */
const CACHE = "kiffy-v2";
const COQUE = ["./", "index.html", "kiffy.css?v=2", "kiffy.js?v=2", "manifest.webmanifest", "icones/kiffy-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(COQUE.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => /^kiffy-v\d+$/.test(x) && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then(res => { if (res.ok) { const copie = res.clone(); caches.open(CACHE).then(c => c.put(req, copie)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
