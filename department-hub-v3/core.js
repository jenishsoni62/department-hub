'use strict';
const db = require('./db'), L = require('./lib');
const { todayStr, addDays, parseD, fmtDate } = L;

const MODULES = ['tickets', 'recurring', 'delegation', 'fms'];
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const wrap = fn => (req, res) => {
  try { const r = fn(req, res); if (r !== undefined && !res.headersSent) res.json(r); }
  catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.message || 'Server error' }); }
};
const num = v => (v === '' || v == null || Number.isNaN(Number(v))) ? null : Number(v);
const flag = v => (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') ? 1 : 0;

// ---------- authentication ----------
function loadUser(id) {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id);
  if (u) u.grants = db.prepare('SELECT dept_id,module,level FROM access WHERE user_id=?').all(u.id);
  return u;
}
function auth(req, res, next) {
  const p = L.verify((req.headers.authorization || '').replace(/^Bearer /, ''));
  const u = p && loadUser(p.id);
  if (!u) return res.status(401).json({ error: 'Please sign in again' });
  req.user = u; next();
}
const pub = u => ({ id: u.id, name: u.name, emp_code: u.emp_code, email: u.email, role: u.role, dept_id: u.dept_id, grants: u.grants || [] });

// ---------- permissions ----------
// Admin: editor everywhere. HOD: editor on own department. Process-coordination (pc): viewer everywhere.
// Team members: only what the HOD has granted (viewer / editor per department + module).
function levelFor(u, deptId, module) {
  if (u.role === 'admin') return 'editor';
  if (u.role === 'hod' && deptId != null && u.dept_id === deptId) return 'editor';
  if (u.role === 'pc') return 'viewer';
  let best = null;
  for (const g of u.grants || []) if (g.dept_id === deptId && (g.module === '*' || g.module === module)) { if (g.level === 'editor') return 'editor'; best = 'viewer'; }
  return best;
}
const canEdit = (u, d, m) => levelFor(u, d, m) === 'editor';
const canSee = (u, d, m) => !!levelFor(u, d, m);
function deptScope(u, module) {                       // null = every department
  if (u.role === 'admin' || u.role === 'pc') return null;
  const s = new Set(); if (u.role === 'hod' && u.dept_id) s.add(u.dept_id);
  for (const g of u.grants || []) if (g.module === '*' || g.module === module) s.add(g.dept_id);
  return [...s];
}
function editScope(u, m) {
  if (u.role === 'admin') return 'all'; if (u.role === 'pc') return [];
  const s = new Set(); if (u.role === 'hod' && u.dept_id) s.add(u.dept_id);
  for (const g of u.grants || []) if (g.level === 'editor' && (g.module === '*' || g.module === m)) s.add(g.dept_id);
  return [...s];
}
function scopeSql(u, module, deptCol, ownCols) {      // SQL fragment for "rows this person may see"
  const ds = deptScope(u, module); if (ds === null) return ['1=1', []];
  const parts = ownCols.map(c => `${c}=?`), args = ownCols.map(() => u.id);
  if (ds.length) { parts.push(`${deptCol} IN (${ds.map(() => '?').join(',')})`); args.push(...ds); }
  return ['(' + parts.join(' OR ') + ')', args];
}
function ensureLookup(kind, name) { if (name) db.prepare('INSERT OR IGNORE INTO lookups(kind,name) VALUES(?,?)').run(kind, String(name).trim()); }

// ---------- recurring task generation ----------
const WEEKLY_OFF = [0];                               // Sunday: skipped for Daily tasks
const dim = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
function occurrences(t, from, to, holidays) {
  const out = [], start = parseD(t.start_date), end = parseD(to), last = t.end_date ? parseD(t.end_date) : null;
  const d = parseD(from > t.start_date ? from : t.start_date);
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    if (last && d > last) break;
    const s = fmtDate(d), dom = Math.min(start.getDate(), dim(d));
    const monthsApart = (d.getFullYear() * 12 + d.getMonth()) - (start.getFullYear() * 12 + start.getMonth());
    let ok;
    switch (t.frequency) {
      case 'Daily': ok = !WEEKLY_OFF.includes(d.getDay()) && !holidays.has(s); break;
      case 'Weekly': ok = d.getDay() === start.getDay(); break;
      case 'Fortnightly': ok = d.getDay() === start.getDay() && Math.round((d - start) / 864e5 / 7) % 2 === 0; break;
      case 'Monthly': ok = d.getDate() === dom; break;
      case 'Quarterly': ok = d.getDate() === dom && monthsApart % 3 === 0; break;
      case 'Yearly': ok = d.getMonth() === start.getMonth() && d.getDate() === dom; break;
      default: ok = s === t.start_date;
    }
    if (ok && d >= start) out.push(s);
  }
  return out;
}
function genInstances(horizon = 14) {
  const today = todayStr(), to = addDays(today, horizon);
  const holidays = new Set(db.prepare('SELECT date FROM holidays').all().map(h => h.date));
  const tasks = db.prepare('SELECT * FROM rec_tasks WHERE active=1').all();
  const ins = db.prepare('INSERT OR IGNORE INTO rec_instances(task_id,due_date) VALUES(?,?)');
  const upd = db.prepare('UPDATE rec_tasks SET last_gen=? WHERE id=?');
  db.transaction(() => {
    for (const t of tasks) {
      if (t.last_gen && t.last_gen >= to) continue;
      const from = t.last_gen ? addDays(t.last_gen, 0) : (t.gen_from || t.start_date);
      for (const s of occurrences(t, from, to, holidays)) ins.run(t.id, s);
      upd.run(to, t.id);
    }
  })();
}

// ---------- FMS (process) helpers ----------
const tatMs = (tat, unit) => Math.max(1, Number(tat) || 1) * ({ minutes: 6e4, hours: 36e5, days: 864e5 }[unit] || 864e5);
const stepRows = pid => db.prepare('SELECT s.*, u.name doer_name FROM process_steps s LEFT JOIN users u ON u.id=s.doer_id WHERE process_id=? ORDER BY step_no').all(pid);
function createEntry(proc, steps, { title, data, started_at }, userId) {
  const seq = db.prepare('SELECT next_seq FROM processes WHERE id=?').get(proc.id).next_seq;
  db.prepare('UPDATE processes SET next_seq=next_seq+1 WHERE id=?').run(proc.id);
  const uid = `${proc.prefix || 'FMS'}-${String(seq).padStart(6, '0')}`;
  const start = started_at || Date.now();
  const r = db.prepare('INSERT INTO entries(process_id,uid,title,data,started_at,created_by) VALUES(?,?,?,?,?,?)').run(proc.id, uid, title || uid, JSON.stringify(data || {}), start, userId);
  const ins = db.prepare('INSERT INTO entry_steps(entry_id,step_no,name,doer_id,tat_ms,planned_at) VALUES(?,?,?,?,?,?)');
  steps.forEach((s, i) => { const ms = tatMs(s.tat, s.unit); ins.run(r.lastInsertRowid, s.step_no, s.name, s.doer_id, ms, i === 0 ? start + ms : null); });
  return { id: r.lastInsertRowid, uid };
}
function completeStep(es, actualAt, remarks, status = 'done') {
  const cur = db.prepare("SELECT MIN(step_no) m FROM entry_steps WHERE entry_id=? AND status='pending'").get(es.entry_id).m;
  if (es.status !== 'pending') fail(400, 'This step is already closed');
  if (cur !== es.step_no) fail(400, 'Complete the earlier steps first');
  db.prepare('UPDATE entry_steps SET status=?, actual_at=?, remarks=? WHERE id=?').run(status, actualAt, remarks || null, es.id);
  const next = db.prepare("SELECT * FROM entry_steps WHERE entry_id=? AND step_no>? AND status='pending' ORDER BY step_no LIMIT 1").get(es.entry_id, es.step_no);
  if (next) db.prepare('UPDATE entry_steps SET planned_at=? WHERE id=?').run(actualAt + next.tat_ms, next.id);
  else db.prepare("UPDATE entries SET status='completed' WHERE id=?").run(es.entry_id);
}

module.exports = { db, L, MODULES, fail, wrap, num, flag, auth, pub, loadUser, levelFor, canEdit, canSee, deptScope, editScope, scopeSql,
  ensureLookup, genInstances, occurrences, tatMs, stepRows, createEntry, completeStep };
