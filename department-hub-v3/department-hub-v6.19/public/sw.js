// Minimal service worker: lets phones offer “Add to Home screen”. Data always comes live from the server.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', e => { let d = {}; try { d = e.data.json(); } catch { d = { title: 'Department Hub', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Department Hub', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || '#/dashboard' }, tag: d.url || undefined })); });
self.addEventListener('notificationclick', e => { e.notification.close(); const url = new URL(e.notification.data && e.notification.data.url || '#/dashboard', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs[0]; if (c) { c.focus(); return c.navigate(url); } return self.clients.openWindow(url); })); });
