const APP_VERSION = "0.0.0";
const CACHE_VERSION = APP_VERSION && APP_VERSION.endsWith("-dev")
  ? "dev"
  : APP_VERSION;
const CACHE_NAME = `TaskTrackPomodoro-cache-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icons/app-logo.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-256.png",
  "./assets/icons/icon-384.png",
  "./assets/icons/icon-192-maskable.png",
  "./assets/icons/icon-256-maskable.png",
  "./assets/icons/icon-384-maskable.png",
  "./assets/icons/icon-512-maskable.png",
  "./assets/audio/pomodoro-chime.wav",
  "./assets/audio/long-bell.wav",
  "./assets/audio/beeps.wav"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  const { data } = event || {};
  if (!data || typeof data.type !== "string") {
    return;
  }

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "GET_VERSION") {
    const port = event.ports && event.ports[0] ? event.ports[0] : null;
    const target = port || event.source;
    if (target && typeof target.postMessage === "function") {
      target.postMessage({ type: "VERSION", version: APP_VERSION });
    }
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestURL = new URL(event.request.url);

  if (requestURL.origin !== self.location.origin) {
    return;
  }

  const isHTMLRequest =
    requestURL.pathname === "/" || requestURL.pathname.endsWith(".html");
  const isVersionRequest = /\/assets\/version\.json$/.test(requestURL.pathname);

  if (isVersionRequest) {
    event.respondWith(
      fetch(event.request.clone())
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone))
            );
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const networkFetch = () =>
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const responseClone = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
        );
        return response;
      })
      .catch(() => null);

  if (isHTMLRequest) {
    event.respondWith(
      networkFetch().then((response) => {
        if (response) {
          return response;
        }
        return caches.match(event.request).then((cached) => cached || caches.match("./index.html"));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        event.waitUntil(networkFetch());
        return cachedResponse;
      }

      return networkFetch().then((response) => {
        if (response) {
          return response;
        }
        return caches.match("./index.html");
      });
    })
  );
});
