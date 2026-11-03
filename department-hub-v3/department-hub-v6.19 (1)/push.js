'use strict';
// In-app (web push) notifications: work on Android Chrome and on iPhone once the site is added to the Home Screen.
const webpush = require('web-push');
const C = require('./core');
const { db, auth, wrap, fail, getSetting, setSetting } = C;
db.exec('CREATE TABLE IF NOT EXISTS push_subs(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT, auth TEXT, ua TEXT, created TEXT)');
function keys() {
  let pub = getSetting('vapid_pub', ''), pri = getSetting('vapid_pri', '');
  if (!pub || !pri) { const k = webpush.generateVAPIDKeys(); pub = k.publicKey; pri = k.privateKey; setSetting('vapid_pub', pub); setSetting('vapid_pri', pri); }
  return { pub, pri };
}
let ready = false;
function init() { if (ready) return; const k = keys(); webpush.setVapidDetails('mailto:' + (process.env.PUSH_CONTACT || 'admin@example.com'), k.pub, k.pri); ready = true; }
async function toUser(userId, title, body, path) {
  try {
    if (!userId) return 0; init();
    const subs = db.prepare('SELECT * FROM push_subs WHERE user_id=?').all(userId); let n = 0;
    const payload = JSON.stringify({ title, body: body || '', url: path || '#/dashboard' });
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 }); n++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE id=?').run(s.id); else console.error('push failed:', e.statusCode || e.message); }
    }
    return n;
  } catch (e) { console.error('push error:', e.message); return 0; }
}
module.exports = function mount(app) {
  app.get('/api/push/key', auth, wrap(() => { init(); return { key: keys().pub }; }));
  app.get('/api/push/status', auth, wrap(req => ({ devices: db.prepare('SELECT COUNT(*) n FROM push_subs WHERE user_id=?').get(req.user.id).n })));
  app.post('/api/push/subscribe', auth, wrap(req => {
    const s = req.body.subscription || {}, k = s.keys || {}; if (!s.endpoint || !k.p256dh || !k.auth) fail(400, 'Invalid subscription');
    db.prepare('INSERT INTO push_subs(user_id,endpoint,p256dh,auth,ua,created) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth').run(req.user.id, s.endpoint, k.p256dh, k.auth, String(req.headers['user-agent'] || '').slice(0, 200), new Date().toISOString());
    return { ok: true };
  }));
  app.post('/api/push/unsubscribe', auth, wrap(req => { if (req.body.endpoint) db.prepare('DELETE FROM push_subs WHERE user_id=? AND endpoint=?').run(req.user.id, req.body.endpoint); else db.prepare('DELETE FROM push_subs WHERE user_id=?').run(req.user.id); return { ok: true }; }));
  app.post('/api/push/test', auth, wrap(async req => { const n = await toUser(req.user.id, 'Department Hub', 'Notifications are working on this device. 🎉', '#/dashboard'); if (!n) fail(400, 'No device is registered yet – tap “Turn on notifications” first'); return { ok: true, sent: n }; }));
};
module.exports.toUser = toUser;
