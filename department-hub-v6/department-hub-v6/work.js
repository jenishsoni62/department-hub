'use strict';
// One place that turns tickets, recurring tasks, delegation tasks and process steps into the same
// "work item" shape, applies who-may-see-what, and does the maths for the dashboard and the MIS report.
const { db, L, MODULES, getSetting } = require('./core');
const { todayStr, addDays, fmtDate, parseD } = L;

const TMAP = { open: 'not_started', in_progress: 'in_progress', hold: 'hold', review: 'under_review', done: 'completed', not_done: 'not_done', archived: 'archived' };
const OPEN = ['not_started', 'in_progress', 'hold', 'under_review'];
const d10 = s => s ? String(s).slice(0, 10) : null;
const dOf = ms => ms ? fmtDate(new Date(ms)) : null;
const round1 = n => Math.round(n * 10) / 10;

function loadWork(u, { from = null, to = null, carried = false } = {}) {
  const today = todayStr(), rows = [];
  const dept = Object.fromEntries(db.prepare('SELECT id,dept_id FROM users').all().map(x => [x.id, x.dept_id]));
  for (const t of db.prepare('SELECT id,dept_id,created_by,doer_id,status,due_date,closed_at,rework FROM tickets').all()) {
    const closed = t.status === 'done' ? d10(t.closed_at) : null;
    rows.push({ mod: 'tickets', id: t.id, dept: t.dept_id, doer: t.doer_id, creator: t.created_by, due: t.due_date, b: TMAP[t.status], closed, ontime: closed ? closed <= t.due_date : null, rework: t.rework || 0 });
  }
  // recurring: narrow in SQL because this table can be big
  const rargs = [], rw = ["(t.active=1 OR i.status='done')"];
  rw.push('i.due_date<=?'); rargs.push(to || today);
  if (from) { rw.push(carried ? "(i.due_date>=? OR i.status='pending')" : 'i.due_date>=?'); rargs.push(from); }
  for (const r of db.prepare(`SELECT i.id,i.due_date,i.status,i.done_at,t.dept_id,t.doer_id,t.created_by FROM rec_instances i JOIN rec_tasks t ON t.id=i.task_id WHERE ${rw.join(' AND ')}`).all(...rargs)) {
    const closed = r.status === 'done' ? d10(r.done_at) : null;
    rows.push({ mod: 'recurring', id: r.id, dept: r.dept_id, doer: r.doer_id, creator: r.created_by, due: r.due_date, b: r.status === 'pending' ? 'not_started' : r.status === 'done' ? 'completed' : 'not_done', closed, ontime: closed ? closed <= r.due_date : null, rework: 0 });
  }
  for (const x of db.prepare('SELECT x.id,x.board_id,x.status,x.due_date,x.closed_at,x.rework,x.assigned_to,x.created_by,b.dept_id FROM del_tasks x JOIN boards b ON b.id=x.board_id').all()) {
    const closed = x.status === 'done' ? d10(x.closed_at) : null;
    rows.push({ mod: 'delegation', id: x.id, board: x.board_id, dept: x.dept_id || dept[x.assigned_to] || null, doer: x.assigned_to, creator: x.created_by, due: x.due_date, b: x.status === 'done' ? 'completed' : x.status, closed, ontime: closed && x.due_date ? closed <= x.due_date : (closed ? true : null), rework: x.rework || 0 });
  }
  for (const s of db.prepare("SELECT es.id,es.status,es.planned_at,es.actual_at,es.doer_id,es.rework,e.created_by,p.dept_id,p.id pid FROM entry_steps es JOIN entries e ON e.id=es.entry_id JOIN processes p ON p.id=e.process_id WHERE es.planned_at IS NOT NULL AND es.status<>'skipped'").all()) {
    const done = s.status === 'done';
    rows.push({ mod: 'process', id: s.id, pid: s.pid, dept: s.dept_id, doer: s.doer_id, creator: s.created_by, due: dOf(s.planned_at), b: done ? 'completed' : s.status === 'review' ? 'under_review' : 'not_started', closed: done ? dOf(s.actual_at) : null, ontime: done ? s.actual_at <= s.planned_at : null, rework: s.rework || 0 });
  }
  if (from || to) return rows.filter(r => r.due && (!to || r.due <= to) && ((!from || r.due >= from) || (carried && OPEN.includes(r.b))));
  return rows;
}

// Who may see which work item.
//   admin / process-coordination : everything
//   HOD  : their own department's work  +  work their people do or raise in other departments
//   member: work assigned to / raised by them, plus departments the HOD granted
function makeScope(u, boardIds) {
  if (u.role === 'admin' || u.role === 'pc') return () => true;
  const udept = Object.fromEntries(db.prepare('SELECT id,dept_id FROM users').all().map(x => [x.id, x.dept_id]));
  const granted = {}; MODULES.forEach(m => granted[m] = new Set((u.grants || []).filter(g => g.module === '*' || g.module === m).map(g => g.dept_id)));
  const key = { tickets: 'tickets', recurring: 'recurring', delegation: 'delegation', process: 'fms' };
  return r => {
    if (r.doer === u.id || r.creator === u.id) return true;
    if (u.role === 'hod' && u.dept_id && (r.dept === u.dept_id || udept[r.doer] === u.dept_id || udept[r.creator] === u.dept_id)) return true;
    if (granted[key[r.mod]].has(r.dept)) return true;
    return r.mod === 'delegation' && boardIds && boardIds.has(r.board);
  };
}
const scopeInfo = (u, deptName) => u.role === 'admin' ? { kind: 'all', label: 'All departments' } : u.role === 'pc' ? { kind: 'all', label: 'All departments (view only)' }
  : u.role === 'hod' ? { kind: 'dept', label: `${deptName || 'Your department'} + work your team does with other departments` } : { kind: 'self', label: 'Your own work and the departments you were given access to' };

function agg(rows) {
  const a = rows.filter(r => r.b !== 'archived'), done = a.filter(r => r.b === 'completed'), on = done.filter(r => r.ontime);
  return { assigned: a.length, completed: done.length, pending: a.length - done.length, pctDone: a.length ? round1(done.length / a.length * 100) : null, pctNotDone: a.length ? round1((a.length - done.length) / a.length * 100) : null,
    onTime: on.length, pctOnTime: done.length ? round1(on.length / done.length * 100) : null, pctNotOnTime: done.length ? round1((done.length - on.length) / done.length * 100) : null,
    overall: a.length ? round1(on.length / a.length * 100) : null, late: done.length - on.length, notDone: a.length - done.length,
    overdue: a.filter(r => OPEN.includes(r.b) && r.due && r.due < todayStr()).length, rework: a.filter(r => r.rework > 0).length };
}

// ---- reporting periods (financial year start month is a setting; default April for India) ----
function periodRange(kind, from, to) {
  const today = todayStr(), t = parseD(today), fy = Math.min(12, Math.max(1, Number(getSetting('fy_start', '4')) || 4));
  let a, b, label;
  if (kind === 'week') { [a, b] = L.weekRange(0); label = 'This week'; }
  else if (kind === 'month') { [a, b] = L.monthRange(); label = 'This month'; }
  else if (kind === 'quarter') { const since = (t.getMonth() - (fy - 1) + 12) % 12, off = Math.floor(since / 3) * 3; const s = new Date(t.getFullYear(), t.getMonth() - since + off, 1); a = fmtDate(s); b = fmtDate(new Date(s.getFullYear(), s.getMonth() + 3, 0)); label = 'This quarter'; }
  else if (kind === 'custom' && from && to) { a = from; b = to; label = 'Custom range'; }
  else { let s = new Date(t.getFullYear(), fy - 1, 1); if (s > t) s = new Date(t.getFullYear() - 1, fy - 1, 1); a = fmtDate(s); b = today; label = 'Year to date'; }
  if (b > today) b = today; if (a > b) a = b;
  const len = Math.round((parseD(b) - parseD(a)) / 864e5) + 1, pb = addDays(a, -1), pa = addDays(pb, -(len - 1));
  return { from: a, to: b, label, prevFrom: pa, prevTo: pb };
}

module.exports = { loadWork, makeScope, scopeInfo, agg, periodRange, OPEN, round1 };
