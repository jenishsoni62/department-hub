'use strict';
const db = require('./db'), L = require('./lib');
const { todayStr, addDays, parseD, fmtDate } = L;

const MODULES = ['tickets', 'recurring', 'delegation', 'fms'];
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const wrap = fn => (req, res) => {
  const bad = e => { if (!e.status) console.error(e); if (!res.headersSent) res.status(e.status || 500).json({ error: e.message || 'Server error' }); };
  try {
    const r = fn(req, res);
    if (r && typeof r.then === 'function') r.then(v => { if (v !== undefined && !res.headersSent) res.json(v); }).catch(bad);   // async handlers
    else if (r !== undefined && !res.headersSent) res.json(r);
  } catch (e) { bad(e); }
};
const num = v => (v === '' || v == null || Number.isNaN(Number(v))) ? null : Number(v);
const flag = v => (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') ? 1 : 0;

// ---------- authentication ----------
const nowIso = () => new Date().toISOString();
function loadUser(id) {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id);
  if (!u || (u.expires_at && u.expires_at <= nowIso())) return undefined;          // switched off or account expired
  u.grants = db.prepare('SELECT dept_id,module,level,expires_at FROM access WHERE user_id=?').all(u.id)
    .filter(g => !g.expires_at || g.expires_at > nowIso()).map(g => ({ dept_id: g.dept_id, module: g.module, level: g.level }));
  return u;
}
// Activity log: who did what (never stores passwords)
function audit(by, event, target, details) {
  try {
    db.prepare('INSERT INTO audit_log(at,by_id,by_label,event,target_id,target_label,details) VALUES(?,?,?,?,?,?,?)')
      .run(nowIso(), by && by.id ? by.id : null, by ? (by.email || by.name || by.label || 'system') : 'system', event, target && target.id ? target.id : null, target ? (target.email || target.name || null) : null, details ? String(details).slice(0, 500) : null);
    db.prepare('DELETE FROM audit_log WHERE id < (SELECT MAX(id) FROM audit_log) - 20000').run();
  } catch (e) { console.error('audit failed:', e.message); }
}
function auth(req, res, next) {
  const p = L.verify((req.headers.authorization || '').replace(/^Bearer /, ''));
  const u = p && loadUser(p.id);
  if (!u) return res.status(401).json({ error: 'Please sign in again' });
  if (u.must_change_pw && !/^\/api\/me(\/password)?$/.test(req.originalUrl.split('?')[0])) return res.status(403).json({ error: 'Please choose a new password first' });
  req.user = u; next();
}
const pub = u => ({ id: u.id, name: u.name, emp_code: u.emp_code, email: u.email, role: u.role, dept_id: u.dept_id, must_change_pw: !!u.must_change_pw, grants: u.grants || [] });

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
const WEEKLY_OFF = [0];                               // default: Sunday is skipped for Daily tasks
const getSetting = (k, d) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k, String(v));
const dim = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
function occurrences(t, from, to, holidays, off = WEEKLY_OFF) {
  const out = [], start = parseD(t.start_date), end = parseD(to), last = t.end_date ? parseD(t.end_date) : null;
  const d = parseD(from > t.start_date ? from : t.start_date);
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    if (last && d > last) break;
    const s = fmtDate(d), dom = Math.min(start.getDate(), dim(d));
    const monthsApart = (d.getFullYear() * 12 + d.getMonth()) - (start.getFullYear() * 12 + start.getMonth());
    let ok;
    switch (t.frequency) {
      case 'Daily': ok = !off.includes(d.getDay()) && !holidays.has(s); break;
      case 'Weekly': ok = d.getDay() === start.getDay(); break;
      case 'Fortnightly': ok = d.getDay() === start.getDay() && Math.round((d - start) / 864e5 / 7) % 2 === 0; break;
      case 'Monthly': ok = d.getDate() === dom; break;
      case 'Quarterly': ok = d.getDate() === dom && monthsApart % 3 === 0; break;
      case 'Half-yearly': ok = d.getDate() === dom && monthsApart % 6 === 0; break;
      case 'Yearly': ok = d.getMonth() === start.getMonth() && d.getDate() === dom; break;
      default: ok = s === t.start_date;
    }
    if (ok && d >= start) out.push(s);
  }
  return out;
}
// Page loads call genSoon(): it only does the work if it has not run in the last minute (creating/importing tasks always call genInstances directly).
let _genAt = 0;
function genSoon() { if (Date.now() - _genAt < 60000) return; _genAt = Date.now(); genInstances(); }
function genInstances(horizon = 14) {
  const today = todayStr(), to = addDays(today, horizon);
  const holidays = holidaySet();
  const off = String(getSetting('weekly_off', '0')).split(',').filter(x => x !== '').map(Number);
  const tasks = db.prepare('SELECT * FROM rec_tasks WHERE active=1').all();
  const ins = db.prepare('INSERT OR IGNORE INTO rec_instances(task_id,due_date) VALUES(?,?)');
  const upd = db.prepare('UPDATE rec_tasks SET last_gen=? WHERE id=?');
  db.transaction(() => {
    for (const t of tasks) {
      if (t.last_gen && t.last_gen >= to) continue;
      const from = t.last_gen ? addDays(t.last_gen, 0) : (t.gen_from || t.start_date);
      for (const s of occurrences(t, from, to, holidays, off)) ins.run(t.id, s);
      upd.run(to, t.id);
    }
  })();
}

// ---------- FMS (process) helpers ----------
const tatMs = (tat, unit) => Math.max(1, Number(tat) || 1) * ({ minutes: 6e4, hours: 36e5, days: 864e5 }[unit] || 864e5);
const weeklyOff = () => String(getSetting('weekly_off', '0')).split(',').filter(x => x !== '').map(Number);
const holidaySet = () => new Set(db.prepare(getSetting('skip_rh', '0') === '1' ? 'SELECT date FROM holidays' : "SELECT date FROM holidays WHERE kind IS NULL OR kind<>'RH'").all().map(h => h.date));
// When is a step due?  "minutes/hours/days" = plain elapsed time.  "workdays" = N working days later (skipping weekly-off days and
// holidays) at a fixed time of day, e.g.  "By 18:00 (+2 days)".
function plannedAt(baseMs, r) {
  if (r.unit === 'workdays') {
    const off = weeklyOff(), hol = holidaySet(), ok = d => !off.includes(d.getDay()) && !hol.has(fmtDate(d));
    const d = new Date(baseMs); d.setHours(0, 0, 0, 0); let n = Math.max(0, Number(r.tat) || 0);
    while (n > 0) { d.setDate(d.getDate() + 1); if (ok(d)) n--; }
    for (let g = 0; !ok(d) && g < 14; g++) d.setDate(d.getDate() + 1);
    const [h, m] = String(r.due_time || '18:00').split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d.getTime();
  }
  return baseMs + (r.tat_ms || tatMs(r.tat, r.unit));
}
const stepRows = pid => db.prepare('SELECT s.*, u.name doer_name, r.name reviewer_name FROM process_steps s LEFT JOIN users u ON u.id=s.doer_id LEFT JOIN users r ON r.id=s.reviewer_id WHERE process_id=? ORDER BY step_no').all(pid);
function createEntry(proc, steps, { title, data, started_at }, userId) {
  const seq = db.prepare('SELECT next_seq FROM processes WHERE id=?').get(proc.id).next_seq;
  db.prepare('UPDATE processes SET next_seq=next_seq+1 WHERE id=?').run(proc.id);
  const uid = `${proc.prefix || 'FMS'}-${String(seq).padStart(6, '0')}`;
  const start = started_at || Date.now();
  const r = db.prepare('INSERT INTO entries(process_id,uid,title,data,started_at,created_by) VALUES(?,?,?,?,?,?)').run(proc.id, uid, title || uid, JSON.stringify(data || {}), start, userId);
  const ins = db.prepare('INSERT INTO entry_steps(entry_id,step_no,name,doer_id,reviewer_id,tat_ms,unit,tat,due_time,planned_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  steps.forEach((s, i) => { const unit = s.unit || 'days', ms = tatMs(s.tat, unit); ins.run(r.lastInsertRowid, s.step_no, s.name, s.doer_id, s.reviewer_id || null, ms, unit, s.tat || 1, s.due_time || null, i === 0 ? plannedAt(start, { unit, tat: s.tat, due_time: s.due_time, tat_ms: ms }) : null); });
  return { id: r.lastInsertRowid, uid };
}
// move an entry forward: record the step result and start the clock of the next step
function advance(es, status, recordedAt, nextFrom, remarks, checks) {
  db.prepare('UPDATE entry_steps SET status=?, actual_at=?, remarks=COALESCE(?,remarks), checks=COALESCE(?,checks) WHERE id=?').run(status, recordedAt, remarks || null, checks || null, es.id);
  const next = db.prepare("SELECT * FROM entry_steps WHERE entry_id=? AND step_no>? AND status='pending' ORDER BY step_no LIMIT 1").get(es.entry_id, es.step_no);
  if (next) db.prepare('UPDATE entry_steps SET planned_at=? WHERE id=?').run(plannedAt(nextFrom, { unit: next.unit || 'days', tat: next.tat, due_time: next.due_time, tat_ms: next.tat_ms }), next.id);
  if (!db.prepare("SELECT COUNT(*) n FROM entry_steps WHERE entry_id=? AND status IN ('pending','review')").get(es.entry_id).n) db.prepare("UPDATE entries SET status='completed' WHERE id=?").run(es.entry_id);
}
function completeStep(es, actualAt, remarks, status = 'done', checks = null) {
  const cur = db.prepare("SELECT MIN(step_no) m FROM entry_steps WHERE entry_id=? AND status IN ('pending','review')").get(es.entry_id).m;
  if (es.status !== 'pending') fail(400, 'This step is already closed');
  if (cur !== es.step_no) fail(400, 'Complete the earlier steps first');
  if (status === 'done' && es.reviewer_id) {            // a reviewer must approve before the next step starts
    db.prepare("UPDATE entry_steps SET status='review', actual_at=?, remarks=?, checks=? WHERE id=?").run(actualAt, remarks || null, checks, es.id); return 'review';
  }
  advance(es, status, actualAt, actualAt, remarks, checks); return status;
}
function approveStep(es, at) { if (es.status !== 'review') fail(400, 'This step is not waiting for review'); advance(es, 'done', es.actual_at, at, null, null); }
function reworkStep(es, note) { if (es.status !== 'review') fail(400, 'This step is not waiting for review'); db.prepare("UPDATE entry_steps SET status='pending', actual_at=NULL, rework=rework+1, remarks=COALESCE(?,remarks) WHERE id=?").run(note || null, es.id); }

module.exports = { db, L, audit, nowIso, getSetting, setSetting, plannedAt, tatMs, weeklyOff, holidaySet, approveStep, reworkStep, MODULES, fail, wrap, num, flag, auth, pub, loadUser, levelFor, canEdit, canSee, deptScope, editScope, scopeSql,
  ensureLookup, genInstances, genSoon, occurrences, tatMs, stepRows, createEntry, completeStep };
