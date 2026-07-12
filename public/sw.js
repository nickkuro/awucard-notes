// Minimal service worker -- exists only to satisfy "installable" criteria
// (Add to Home Screen on Android). No offline caching: this app needs a
// live session/API, so every request should just go to the network as normal.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
