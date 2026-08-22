/* Service worker MoonSport
   Deux caches séparés :
   - la coquille de l'application, rafraîchie à chaque nouvelle version ;
   - les pages du programme, mises en cache au premier affichage seulement
     (32 images, 16 Mo : les précharger toutes à l'installation serait brutal).

   Rien de ce qui touche au compte ne passe par le cache : /api reste toujours
   servi par le réseau, sans quoi une session expirée paraîtrait valide. */
const VERSION = "v1";
const SHELL   = `moonsport-shell-${VERSION}`;
const PAGES   = "moonsport-pages";

const COQUILLE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon-32.png",
  "/favicon-16.png",
  "/apple-touch-icon.png",
  "/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(COQUILLE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // une ressource manquante ne doit pas bloquer l'installation
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n.startsWith("moonsport-shell-") && n !== SHELL)
            .map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "maj") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Google Fonts et compagnie
  if (url.pathname.startsWith("/api/")) return;         // session et données : jamais de cache

  /* Les pages du programme ne changent pas : cache d'abord, réseau au besoin. */
  if (url.pathname.startsWith("/prog/")) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copie = res.clone(); caches.open(PAGES).then(c => c.put(req, copie)); }
        return res;
      }))
    );
    return;
  }

  /* Le reste : réseau d'abord pour toujours avoir la dernière version,
     cache en secours quand la connexion manque — à la salle notamment. */
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copie = res.clone(); caches.open(SHELL).then(c => c.put(req, copie)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("/")))
  );
});
