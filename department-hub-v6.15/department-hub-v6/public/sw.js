// Minimal service worker: lets phones offer “Add to Home screen”. Data always comes live from the server.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
