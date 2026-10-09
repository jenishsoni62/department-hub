'use strict';
// Optional housekeeping: removes COMPLETED work older than N days (setting "purge_days", 0 = never).
// Only finished items are removed. Pending, overdue and running work is never touched.
const { db, L, audit, getSetting, setSetting } = require('./core');

function purgeOld(days) {
  days = Math.floor(Number(days));
  if (!(days >= 7)) return null;
  const cut = L.addDays(L.todayStr(), -days), cutMs = new Date(cut + 'T00:00:00').getTime(), out = { recurring: 0, tickets: 0, delegation: 0, process: 0 };
  db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE ref_type='recurring' AND ref_id IN (SELECT id FROM rec_instances WHERE status='done' AND substr(done_at,1,10)<?)").run(cut);
    out.recurring = Number(db.prepare("DELETE FROM rec_instances WHERE status='done' AND done_at IS NOT NULL AND substr(done_at,1,10)<?").run(cut).changes);
    db.prepare("DELETE FROM messages WHERE ref_type='ticket' AND ref_id IN (SELECT id FROM tickets WHERE status='done' AND closed_at IS NOT NULL AND substr(closed_at,1,10)<?)").run(cut);
    out.tickets = Number(db.prepare("DELETE FROM tickets WHERE status='done' AND closed_at IS NOT NULL AND substr(closed_at,1,10)<?").run(cut).changes);
    db.prepare("DELETE FROM messages WHERE ref_type='delegation' AND ref_id IN (SELECT id FROM del_tasks WHERE status='done' AND closed_at IS NOT NULL AND substr(closed_at,1,10)<?)").run(cut);
    out.delegation = Number(db.prepare("DELETE FROM del_tasks WHERE status='done' AND closed_at IS NOT NULL AND substr(closed_at,1,10)<?").run(cut).changes);
    const ids = "SELECT e.id FROM entries e WHERE e.status='completed' AND (SELECT MAX(actual_at) FROM entry_steps s WHERE s.entry_id=e.id) < ?";
    db.prepare(`DELETE FROM entry_steps WHERE entry_id IN (${ids})`).run(cutMs);
    out.process = Number(db.prepare(`DELETE FROM entries WHERE id IN (SELECT e.id FROM entries e WHERE e.status='completed' AND NOT EXISTS (SELECT 1 FROM entry_steps s WHERE s.entry_id=e.id))`).run().changes);
  })();
  return out;
}
// Runs at most once a day (called at start-up and every hour).
function purgeIfDue() {
  const days = Number(getSetting('purge_days', '0')); if (!(days >= 7)) return null;
  const today = L.todayStr(); if (getSetting('purge_last', '') === today) return null;
  const r = purgeOld(days); setSetting('purge_last', today);
  const n = r ? r.recurring + r.tickets + r.delegation + r.process : 0;
  if (n) audit({ label: 'System' }, 'Old completed work removed', null, `Older than ${days} days: ${r.recurring} checklist, ${r.tickets} ticket, ${r.delegation} delegation, ${r.process} process`);
  return r;
}
module.exports = { purgeOld, purgeIfDue };
