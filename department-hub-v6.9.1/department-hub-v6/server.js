'use strict';
const P = require('./purge');
const express = require('express'), path = require('path'), bcrypt = require('bcryptjs');
const C = require('./core');
const W = require('./work');
const M = require('./mail');
const M_name = u => u.name;
const M_mount = app => require('./mail')(app);
const short = t => String(t || '').replace(/\s+/g, ' ').slice(0, 140);
const { db, L, audit, nowIso, getSetting, setSetting, approveStep, reworkStep, MODULES, fail, wrap, num, flag, auth, pub, loadUser, levelFor, canEdit, deptScope, editScope, scopeSql, ensureLookup, genInstances, genSoon, stepRows, createEntry, completeStep } = C;
const { todayStr, addDays, diffDays, weekRange, monthRange, nowStr } = L;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const uidT = id => 'Help' + String(id).padStart(6, '0');
const uidR = id => 'REC' + String(id).padStart(6, '0');
const msgCount = (type, col) => `(SELECT COUNT(*) FROM messages m WHERE m.ref_type='${type}' AND m.ref_id=${col})`;
const inList = ids => ids.map(() => '?').join(',');
const csvNums = s => String(s || '').split(',').map(Number).filter(Boolean);

/* ================= AUTH & META ================= */

// ---- password check that does NOT freeze the site when many people sign in at once ----
// New hashes use Node's built-in scrypt (runs on background threads). Old bcrypt hashes still work and are upgraded on first sign-in.
const crypto = require('crypto');
// at most 2 password checks run at once, so a rush of sign-ins queues up instead of eating all the CPU
let _pwBusy = 0; const _pwQ = [];
const _pwSlot = () => new Promise(go => { const run = () => { _pwBusy++; go(); }; _pwBusy < 2 ? run() : _pwQ.push(run); });
const _pwDone = () => { _pwBusy--; const n = _pwQ.shift(); if (n) n(); };
const scryptRaw = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
const scryptAsync = async (pw, salt) => { await _pwSlot(); try { return await scryptRaw(pw, salt); } finally { _pwDone(); } };
async function hashPw(pw) { const salt = crypto.randomBytes(16); return 'scrypt$' + salt.toString('base64') + '$' + (await scryptAsync(String(pw), salt)).toString('base64'); }
async function checkPw(pw, stored) {
  pw = String(pw || '');
  if (String(stored).startsWith('scrypt$')) { const [, s, h] = stored.split('$'); const k = await scryptAsync(pw, Buffer.from(s, 'base64')); const want = Buffer.from(h, 'base64'); return k.length === want.length && crypto.timingSafeEqual(k, want); }
  await _pwSlot(); try { return await new Promise((res, rej) => bcrypt.compare(pw, stored, (e, ok) => e ? rej(e) : res(ok))); } finally { _pwDone(); }
}
app.post('/api/login', wrap(async req => {
  const key = String(req.body.login || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=? OR lower(emp_code)=?').get(key, key);
  const who = { label: key || '(blank)' };
  const pwOk = u ? await checkPw(req.body.password, u.password_hash) : false;
  if (!u || !pwOk) { audit(who, 'Sign-in failed', u ? { id: u.id, email: u.email, name: u.name } : null, u ? 'Wrong password' : 'Unknown user'); fail(401, 'Wrong ID or password'); }
  if (!u.active) { audit(who, 'Sign-in failed', u, 'Account is switched off'); fail(401, 'This account is switched off. Please ask your admin.'); }
  if (u.expires_at && u.expires_at <= nowIso()) { audit(who, 'Sign-in failed', u, 'Account has expired'); fail(401, 'This account has expired. Please ask your admin.'); }
  if (!String(u.password_hash).startsWith('scrypt$')) { try { db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await hashPw(req.body.password), u.id); } catch {} }
  audit(u, 'Signed in');
  return { token: L.sign({ id: u.id }), user: pub(loadUser(u.id)) };
}));
const lookups = kind => db.prepare('SELECT id,name FROM lookups WHERE kind=? ORDER BY name').all(kind);
app.get('/api/me', auth, wrap(req => {
  const e = {}; MODULES.forEach(m => e[m] = editScope(req.user, m));
  return { user: pub(req.user), editable: e };
}));
app.post('/api/me/password', auth, wrap(async req => {
  if (!(await checkPw(req.body.old, req.user.password_hash))) fail(400, 'Current password is wrong');
  if (String(req.body.new || '').length < 6) fail(400, 'New password must be at least 6 characters');
  db.prepare('UPDATE users SET password_hash=?, must_change_pw=0 WHERE id=?').run(await hashPw(req.body.new), req.user.id);
  audit(req.user, 'Password changed', req.user);
  return { ok: true };
}));
app.get('/api/meta', auth, wrap(() => ({
  departments: db.prepare('SELECT d.*, u.name hod_name FROM departments d LEFT JOIN users u ON u.id=d.hod_id ORDER BY d.name').all(),
  users: db.prepare('SELECT id,name,emp_code,email,notify_email,phone,role,dept_id,active,expires_at FROM users ORDER BY name').all(),
  categories: lookups('category'), issueTypes: lookups('issue_type'),
})));
app.get('/api/badges', auth, wrap(req => {
  const u = req.user, today = todayStr();
  const review = db.prepare("SELECT COUNT(*) n FROM tickets WHERE status='review' AND reviewer_id=?").get(u.id).n
    + db.prepare("SELECT COUNT(*) n FROM del_tasks WHERE status='under_review' AND created_by=?").get(u.id).n
    + db.prepare("SELECT COUNT(*) n FROM entry_steps WHERE status='review' AND reviewer_id=?").get(u.id).n;
  const overdue = db.prepare("SELECT COUNT(*) n FROM tickets WHERE doer_id=? AND status IN ('open','in_progress') AND due_date<?").get(u.id, today).n
    + db.prepare("SELECT COUNT(*) n FROM rec_instances i JOIN rec_tasks t ON t.id=i.task_id WHERE t.doer_id=? AND t.active=1 AND i.status='pending' AND i.due_date<?").get(u.id, today).n
    + db.prepare("SELECT COUNT(*) n FROM del_tasks WHERE assigned_to=? AND status IN ('not_started','in_progress') AND due_date<?").get(u.id, today).n;
  return { review, overdue };
}));

/* ================= ADMIN: departments, users, access ================= */
const isMgr = u => u.role === 'admin' || u.role === 'hod';
function setHod(deptId, hodId) {
  const old = db.prepare('SELECT hod_id FROM departments WHERE id=?').get(deptId);
  if (old && old.hod_id && old.hod_id !== hodId) db.prepare("UPDATE users SET role='member' WHERE id=? AND role='hod'").run(old.hod_id);
  db.prepare('UPDATE departments SET hod_id=? WHERE id=?').run(hodId, deptId);
  if (hodId) db.prepare("UPDATE users SET role='hod', dept_id=? WHERE id=? AND role IN ('member','hod')").run(deptId, hodId);
}
app.post('/api/departments', auth, wrap(req => {
  if (req.user.role !== 'admin') fail(403, 'Only the admin can add departments');
  const name = String(req.body.name || '').trim(); if (!name) fail(400, 'Department name is required');
  try { const id = db.prepare('INSERT INTO departments(name) VALUES(?)').run(name).lastInsertRowid; if (req.body.hod_id) setHod(id, num(req.body.hod_id)); return { id }; }
  catch (e) { if (/UNIQUE/.test(e.message)) fail(400, 'That department already exists'); throw e; }
}));
app.put('/api/departments/:id', auth, wrap(req => {
  if (req.user.role !== 'admin') fail(403, 'Only the admin can edit departments');
  const id = num(req.params.id);
  if (req.body.name) db.prepare('UPDATE departments SET name=? WHERE id=?').run(String(req.body.name).trim(), id);
  if ('hod_id' in req.body) { const nid = num(req.body.hod_id); setHod(id, nid); const nu = nid ? db.prepare('SELECT id,email,name FROM users WHERE id=?').get(nid) : null; audit(req.user, 'HOD changed', nu, ((db.prepare('SELECT name FROM departments WHERE id=?').get(id) || {}).name || '') + (nu ? '' : ' – HOD removed')); }
  return { ok: true };
}));
app.delete('/api/departments/:id', auth, wrap(req => {
  if (req.user.role !== 'admin') fail(403, 'Only the admin can delete departments');
  const id = num(req.params.id);
  if (db.prepare('SELECT COUNT(*) n FROM users WHERE dept_id=?').get(id).n) fail(400, 'Move or deactivate the users of this department first');
  db.prepare('DELETE FROM departments WHERE id=?').run(id); db.prepare('DELETE FROM access WHERE dept_id=?').run(id); return { ok: true };
}));

app.post('/api/users', auth, wrap(req => {
  const u = req.user, b = req.body;
  if (!isMgr(u)) fail(403, 'Only the admin or a HOD can add users');
  const name = String(b.name || '').trim(); if (!name) fail(400, 'Name is required');
  let role = ['admin', 'hod', 'member', 'pc'].includes(b.role) ? b.role : 'member', dept = num(b.dept_id);
  if (u.role === 'hod') { role = 'member'; dept = u.dept_id; }
  if (role === 'admin' && u.role !== 'admin') fail(403, 'Only the admin can create admins');
  const emp = String(b.emp_code || '').trim() || null, email = String(b.email || '').trim().toLowerCase() || null;
  if (b.password && String(b.password).length < 6) fail(400, 'Password must be at least 6 characters');
  try {
    const id = db.prepare('INSERT INTO users(emp_code,name,email,password_hash,role,dept_id,must_change_pw) VALUES(?,?,?,?,?,?,?)').run(emp, name, email, bcrypt.hashSync(String(b.password || 'welcome123'), 10), role, dept, flag(b.must_change_pw)).lastInsertRowid;
    if (role === 'hod' && dept) setHod(dept, id);
    audit(u, 'User created', { id, email, name }, `Role: ${role}`);
    return { id };
  } catch (e) { if (/UNIQUE/.test(e.message)) fail(400, 'Employee code or email already exists'); throw e; }
}));

/* ---- edit one person: profile & sign-in + "what can this person open?" ---- */
const MOD_LABEL = { tickets: 'Help tickets', recurring: 'Recurring', delegation: 'Delegation', fms: 'Process (FMS)' };
const lvWord = l => l === 'editor' ? 'edit' : l === 'viewer' ? 'view' : 'no access';
app.get('/api/users/:id/access', auth, wrap(req => {
  const u = req.user, id = num(req.params.id); if (!isMgr(u)) fail(403, 'Only the admin or a HOD can change access');
  const t = db.prepare('SELECT id,emp_code,name,email,notify_email,phone,role,dept_id,active,expires_at,must_change_pw FROM users WHERE id=?').get(id); if (!t) fail(404, 'User not found');
  if (u.role === 'hod' && t.role !== 'member') fail(403, 'You can only manage team members');
  const depts = db.prepare('SELECT id,name FROM departments ORDER BY name').all().filter(d => u.role === 'admin' || d.id === u.dept_id);
  return { user: t, depts, grants: db.prepare('SELECT dept_id,module,level,expires_at FROM access WHERE user_id=?').all(id), can_profile: u.role === 'admin' || t.dept_id === u.dept_id, self: id === u.id };
}));
app.put('/api/users/:id/access', auth, wrap(req => {
  const u = req.user, id = num(req.params.id); if (!isMgr(u)) fail(403, 'Only the admin or a HOD can change access');
  const t = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!t) fail(404, 'User not found');
  if (u.role === 'hod' && t.role !== 'member') fail(403, 'You can only manage team members');
  const p = req.body.profile; let newRole = t.role;
  if (p && typeof p === 'object') {
    if (!(u.role === 'admin' || t.dept_id === u.dept_id)) fail(403, 'You can only edit the profile of people in your own department');
    const name = String(p.name ?? t.name).trim(); if (!name) fail(400, 'Name is required');
    let dept = t.dept_id;
    if (u.role === 'admin') { if (['admin', 'hod', 'member', 'pc'].includes(p.role)) newRole = p.role; if ('dept_id' in p) dept = num(p.dept_id); }
    const active = 'active' in p ? flag(p.active) : t.active;
    if (id === u.id && (newRole !== t.role || !active)) fail(400, 'You cannot demote or switch off your own account');
    const exp = 'expires_at' in p ? (p.expires_at || null) : t.expires_at; if (exp && isNaN(Date.parse(exp))) fail(400, 'That expiry date is not valid');
    const mcp = 'must_change_pw' in p ? flag(p.must_change_pw) : t.must_change_pw, emp = 'emp_code' in p ? (String(p.emp_code || '').trim() || null) : t.emp_code;
    const ne = 'notify_email' in p ? String(p.notify_email || '').trim().toLowerCase() : t.notify_email, ph = 'phone' in p ? (String(p.phone || '').trim() || null) : t.phone;
    if (ne && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ne)) fail(400, 'The reminder e-mail address is not valid');
    try { db.prepare('UPDATE users SET name=?, emp_code=?, role=?, dept_id=?, active=?, expires_at=?, must_change_pw=?, notify_email=?, phone=? WHERE id=?').run(name, emp, newRole, dept, active, exp, mcp, ne || null, ph, id); }
    catch (e) { if (/UNIQUE/.test(e.message)) fail(400, 'That employee code is already used'); throw e; }
    if (newRole === 'hod' && dept && (t.role !== 'hod' || dept !== t.dept_id)) setHod(dept, id);
    if (t.role === 'hod' && newRole !== 'hod') db.prepare('UPDATE departments SET hod_id=NULL WHERE hod_id=?').run(id);
    if (p.password) { if (String(p.password).length < 6) fail(400, 'Password must be at least 6 characters'); db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(p.password), 10), id); audit(u, 'Password reset', t); }
    if (newRole !== t.role) audit(u, 'Role changed', t, `${t.role} → ${newRole}`);
    if (active !== t.active) audit(u, active ? 'Account activated' : 'Account deactivated', t);
    if ((exp || null) !== (t.expires_at || null)) audit(u, 'Account expiry changed', t, exp ? 'Expires ' + exp.slice(0, 16).replace('T', ' ') + ' UTC' : 'Expiry removed');
    const bits = []; if (name !== t.name) bits.push(`name → ${name}`); if (emp !== t.emp_code) bits.push('employee code'); if (mcp !== t.must_change_pw) bits.push(mcp ? 'must choose new password at next sign-in' : 'no forced password change');
    if (bits.length) audit(u, 'Profile changed', t, bits.join('; '));
  }
  if (Array.isArray(req.body.grants) && newRole !== 'admin' && newRole !== 'pc') {
    const all = db.prepare('SELECT id,name FROM departments').all(), names = Object.fromEntries(all.map(d => [d.id, d.name]));
    const allowed = u.role === 'admin' ? all.map(d => d.id) : [u.dept_id], next = [];
    for (const g of req.body.grants) {
      const d = num(g.dept_id); if (!allowed.includes(d)) fail(403, 'You can only change access inside your own department');
      if (!MODULES.includes(g.module) || !['viewer', 'editor'].includes(g.level)) continue;
      if (g.expires_at && isNaN(Date.parse(g.expires_at))) fail(400, 'An access expiry date is not valid');
      next.push({ dept_id: d, module: g.module, level: g.level, expires_at: g.expires_at || null });
    }
    const old = db.prepare('SELECT dept_id,module,level,expires_at FROM access WHERE user_id=?').all(id).filter(g => allowed.includes(g.dept_id));
    const expand = rows => { const m = {}; for (const g of rows) for (const mod of g.module === '*' ? MODULES : [g.module]) { const k = g.dept_id + '|' + mod; if (!m[k] || g.level === 'editor') m[k] = g; } return m; };
    const om = expand(old), nm = expand(next), diff = [];
    for (const k of new Set([...Object.keys(om), ...Object.keys(nm)])) {
      const [d, m] = k.split('|'), o = om[k], n = nm[k], label = `${names[d] || d} · ${MOD_LABEL[m]}`;
      if ((o ? o.level : '') !== (n ? n.level : '')) diff.push(`${label}: ${lvWord(o && o.level)} → ${lvWord(n && n.level)}`);
      else if (o && n && (o.expires_at || null) !== (n.expires_at || null)) diff.push(`${label}: expiry changed`);
    }
    db.transaction(() => {
      db.prepare(`DELETE FROM access WHERE user_id=? AND dept_id IN (${allowed.map(() => '?').join(',')})`).run(id, ...allowed);
      const ins = db.prepare('INSERT OR REPLACE INTO access(user_id,dept_id,module,level,expires_at) VALUES(?,?,?,?,?)');
      next.forEach(g => ins.run(id, g.dept_id, g.module, g.level, g.expires_at));
    })();
    if (diff.length) audit(u, 'Access changed', t, diff.join('; '));
  }
  return { ok: true };
}));
app.get('/api/audit', auth, wrap(req => {
  if (req.user.role !== 'admin') fail(403, 'Only the admin can see the activity log');
  const { event = '', q = '' } = req.query; let rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 3000').all();
  if (event) rows = rows.filter(r => r.event === event);
  if (q) { const s = String(q).toLowerCase(); rows = rows.filter(r => [r.by_label, r.target_label, r.details, r.event].join(' ').toLowerCase().includes(s)); }
  return { rows: rows.slice(0, 300), events: db.prepare('SELECT DISTINCT event FROM audit_log ORDER BY event').all().map(r => r.event) };
}));

app.get('/api/access', auth, wrap(req => {
  const dept = num(req.query.dept_id);
  if (!(req.user.role === 'admin' || (req.user.role === 'hod' && req.user.dept_id === dept))) fail(403, 'Only the admin or this department\'s HOD can manage access');
  return { rows: db.prepare('SELECT a.user_id, a.module, a.level, a.expires_at, u.name, u.emp_code, u.role FROM access a JOIN users u ON u.id=a.user_id WHERE a.dept_id=? AND u.active=1').all(dept) };
}));
app.put('/api/access', auth, wrap(req => {
  const { user_id, module, level } = req.body, dept = num(req.body.dept_id), uid = num(user_id);
  if (!(req.user.role === 'admin' || (req.user.role === 'hod' && req.user.dept_id === dept))) fail(403, 'You can only grant access inside your own department');
  if (!['*', ...MODULES].includes(module)) fail(400, 'Unknown module');
  const t = db.prepare('SELECT role FROM users WHERE id=?').get(uid); if (!t) fail(404, 'User not found');
  if (t.role !== 'member') fail(400, t.role === 'pc' ? 'Process-coordination users are always view-only everywhere' : 'This user already has full access through their role');
  if (!level) db.prepare('DELETE FROM access WHERE user_id=? AND dept_id=? AND module=?').run(uid, dept, module);
  else if (['viewer', 'editor'].includes(level)) db.prepare('INSERT OR REPLACE INTO access(user_id,dept_id,module,level) VALUES(?,?,?,?)').run(uid, dept, module, level);
  else fail(400, 'Level must be viewer or editor');
  audit(req.user, 'Access changed', { id: uid }, `${(db.prepare('SELECT name FROM departments WHERE id=?').get(dept) || {}).name} · ${module}: ${level || 'removed'}`);
  return { ok: true };
}));

app.get('/api/lookups/:kind', auth, wrap(req => lookups(req.params.kind)));
app.post('/api/lookups/:kind', auth, wrap(req => { if (!isMgr(req.user)) fail(403, 'Only admin/HOD can add these'); const n = String(req.body.name || '').trim(); if (!n) fail(400, 'Name is required'); ensureLookup(req.params.kind, n); return { ok: true }; }));
app.delete('/api/lookups/:id', auth, wrap(req => { if (!isMgr(req.user)) fail(403, 'Only admin/HOD can delete these'); db.prepare('DELETE FROM lookups WHERE id=?').run(num(req.params.id)); return { ok: true }; }));
app.get('/api/holidays', auth, wrap(() => db.prepare('SELECT * FROM holidays ORDER BY date').all()));
app.post('/api/holidays', auth, wrap(req => { if (req.user.role !== 'admin') fail(403, 'Only the admin can edit holidays'); const d = L.parseDateOnly(req.body.date); if (!d) fail(400, 'Enter a valid date'); db.prepare('INSERT OR REPLACE INTO holidays(date,name,kind) VALUES(?,?,?)').run(d, String(req.body.name || 'Holiday'), req.body.kind === 'RH' ? 'RH' : 'GH'); return { ok: true }; }));
app.delete('/api/holidays/:date', auth, wrap(req => { if (req.user.role !== 'admin') fail(403, 'Only the admin can edit holidays'); db.prepare('DELETE FROM holidays WHERE date=?').run(req.params.date); return { ok: true }; }));

app.get('/api/messages/:type/:id', auth, wrap(req => db.prepare('SELECT m.id,m.text,m.created_at,u.name user_name,m.user_id FROM messages m LEFT JOIN users u ON u.id=m.user_id WHERE ref_type=? AND ref_id=? ORDER BY m.id').all(req.params.type, num(req.params.id))));
app.post('/api/messages/:type/:id', auth, wrap(req => {
  const text = String(req.body.text || '').trim(); if (!text) fail(400, 'Type a message first');
  db.prepare('INSERT INTO messages(ref_type,ref_id,user_id,text) VALUES(?,?,?,?)').run(req.params.type, num(req.params.id), req.user.id, text); return { ok: true };
}));

/* ================= HELP TICKETS ================= */
const TSQL = `SELECT t.*, d.name dept_name, cu.name created_by_name, cu.emp_code created_by_code, du.name doer_name, du.emp_code doer_code, ru.name reviewer_name, h.name hod_name,
  ${msgCount('ticket', 't.id')} msgs FROM tickets t LEFT JOIN departments d ON d.id=t.dept_id LEFT JOIN users cu ON cu.id=t.created_by LEFT JOIN users du ON du.id=t.doer_id
  LEFT JOIN users ru ON ru.id=t.reviewer_id LEFT JOIN users h ON h.id=d.hod_id`;
const OPEN_T = ['open', 'in_progress', 'review'];
function shapeTicket(t, today) {
  t.uid = uidT(t.id);
  const live = [...OPEN_T, 'hold'].includes(t.status);
  t.delay_days = live && t.due_date < today ? diffDays(today, t.due_date) : 0;
  if (t.status === 'done' && t.closed_at && t.closed_at.slice(0, 10) > t.due_date) t.late_days = diffDays(t.closed_at, t.due_date);
  return t;
}
app.get('/api/tickets', auth, wrap(req => {
  const u = req.user, { scope = 'assigned', dept = '', q = '', state = 'open' } = req.query, today = todayStr();
  const where = [], args = [];
  if (scope === 'assigned') { where.push('t.doer_id=?'); args.push(u.id); }
  else if (scope === 'created') { where.push('t.created_by=?'); args.push(u.id); }
  else if (scope === 'transfer') { where.push('t.prev_doer_id=?'); args.push(u.id); }
  else { const [s, a] = scopeSql(u, 'tickets', 't.dept_id', ['t.doer_id', 't.created_by']); where.push(s); args.push(...a); if (scope === 'unassigned') where.push('t.doer_id IS NULL'); }
  const ds = csvNums(dept); if (ds.length) { where.push(`t.dept_id IN (${inList(ds)})`); args.push(...ds); }
  let rows = db.prepare(TSQL + ' WHERE ' + where.join(' AND ') + ' ORDER BY t.id DESC').all(...args).map(t => shapeTicket(t, today));
  if (q) { const s = q.toLowerCase(); rows = rows.filter(t => [t.uid, t.description, t.created_by_name, t.doer_name, t.issue_type].join(' ').toLowerCase().includes(s)); }
  const cats = t => { const c = []; if (OPEN_T.includes(t.status)) c.push('open'); if (t.status === 'in_progress') c.push('in_progress'); if (t.delay_days) c.push('overdue'); if (t.status === 'done') c.push('closed'); if (t.status === 'archived') c.push('archive'); if (t.status === 'hold') c.push('hold'); if (t.status === 'not_done') c.push('not_done'); return c; };
  const counts = { open: 0, in_progress: 0, overdue: 0, closed: 0, archive: 0, hold: 0, not_done: 0 };
  rows.forEach(t => cats(t).forEach(c => counts[c]++));
  return { counts, rows: rows.filter(t => cats(t).includes(state)).slice(0, 500) };
}));
app.post('/api/tickets', auth, wrap(req => {
  const u = req.user, b = req.body; if (u.role === 'pc') fail(403, 'View-only accounts cannot create tickets');
  if (!b.dept_id || !String(b.description || '').trim() || !b.due_date) fail(400, 'Department, description and due date are required');
  const doers = Array.isArray(b.doer_ids) && b.doer_ids.length ? b.doer_ids.map(num) : [num(b.doer_id)];
  const ins = db.prepare('INSERT INTO tickets(dept_id,created_by,doer_id,issue_type,reviewer_id,due_date,description,priority,needs_proof) VALUES(?,?,?,?,?,?,?,?,?)');
  const ids = doers.map(d => ins.run(num(b.dept_id), u.id, d, b.issue_type || null, num(b.reviewer_id), b.due_date, String(b.description).trim(), b.priority || 'Medium', flag(b.needs_proof)).lastInsertRowid);
  ensureLookup('issue_type', b.issue_type);
  doers.forEach(d => { if (d && d !== u.id) M.notify(d, 'New help ticket assigned to you', [`${u.name} raised: ${short(b.description)}`, `Due ${b.due_date}`, b.priority ? 'Priority: ' + b.priority : ''].filter(Boolean), { path: '#/tickets/assigned' }, 'ticket assigned'); });
  return { ids };
}));
app.patch('/api/tickets/:id', auth, wrap(req => {
  const u = req.user, t = db.prepare('SELECT * FROM tickets WHERE id=?').get(num(req.params.id)); if (!t) fail(404, 'Ticket not found');
  if (u.role === 'pc') fail(403, 'View-only account');
  const isDoer = t.doer_id === u.id, isCreator = t.created_by === u.id, isReviewer = t.reviewer_id === u.id, mgr = canEdit(u, t.dept_id, 'tickets');
  const need = ok => { if (!ok) fail(403, 'You are not allowed to do that on this ticket'); };
  const set = (status, extra = '') => db.prepare(`UPDATE tickets SET status=?${extra} WHERE id=?`).run(status, t.id);
  switch (req.body.action) {
    case 'start': need(isDoer || mgr); set('in_progress'); break;
    case 'hold': need(isDoer || mgr); set('hold'); break;
    case 'not_done': need(isDoer || mgr); set('not_done', ",closed_at=datetime('now','localtime')"); break;
    case 'done': need(isDoer || mgr);
      if (t.needs_proof && !String(req.body.remarks || '').trim()) fail(400, 'This ticket needs proof — add a note or link');
      if (req.body.remarks) db.prepare('INSERT INTO messages(ref_type,ref_id,user_id,text) VALUES(?,?,?,?)').run('ticket', t.id, u.id, 'Closing note: ' + req.body.remarks);
      if (t.reviewer_id && t.reviewer_id !== u.id) set('review'); else set('done', ",closed_at=datetime('now','localtime')"); break;
    case 'approve': need(isReviewer || mgr); set('done', ",closed_at=datetime('now','localtime')"); break;
    case 'rework': need(isReviewer || mgr); set('open', ',rework=rework+1'); break;
    case 'archive': need(isCreator || mgr); set('archived'); break;
    case 'reopen': need(isCreator || mgr); set('open', ',closed_at=NULL'); break;
    case 'assign': need(mgr); db.prepare('UPDATE tickets SET doer_id=? WHERE id=?').run(num(req.body.doer_id), t.id); break;
    case 'transfer': need(isDoer || mgr); db.prepare('UPDATE tickets SET prev_doer_id=?, doer_id=? WHERE id=?').run(t.doer_id, num(req.body.doer_id), t.id); break;
    default: fail(400, 'Unknown action');
  }
  { const a = req.body.action, nt = db.prepare('SELECT * FROM tickets WHERE id=?').get(t.id), what = short(t.description), p = { path: '#/tickets/assigned' };
    if (a === 'done' && nt.status === 'review') M.notify(t.reviewer_id, 'A help ticket is ready for your review', [`${u.name} finished: ${what}`], { path: '#/review' }, 'review');
    else if (a === 'approve') M.notify(t.doer_id, 'Your help ticket was approved', [what], p, 'review result');
    else if (a === 'rework') M.notify(t.doer_id, 'A help ticket was sent back for rework', [what], p, 'review result');
    else if (a === 'assign' || a === 'transfer') M.notify(nt.doer_id, 'A help ticket was assigned to you', [what, `Due ${t.due_date}`], p, 'ticket assigned'); }
  return { ok: true };
}));

/* ================= RECURRING (CHECKLIST) ================= */
app.get('/api/recurring', auth, wrap(req => {
  genSoon();
  const u = req.user, { scope = 'my', range = 'today', dept = '', category = '', frequency = '', q = '', date = '' } = req.query;
  const page = Math.max(1, num(req.query.page) || 1), today = todayStr();
  const where = ['t.active=1'], args = [];
  if (scope === 'my') { where.push('t.doer_id=?'); args.push(u.id); } else { const [s, a] = scopeSql(u, 'recurring', 't.dept_id', ['t.doer_id']); where.push(s); args.push(...a); }
  const ds = csvNums(dept); if (ds.length) { where.push(`t.dept_id IN (${inList(ds)})`); args.push(...ds); }
  if (category) { where.push('t.category=?'); args.push(category); }
  if (frequency) { where.push('t.frequency=?'); args.push(frequency); }
  if (q) { where.push("(t.description LIKE ? OR ('REC'||printf('%06d',t.id)) LIKE ?)"); args.push('%' + q + '%', '%' + q + '%'); }
  const [w0, w1] = weekRange(0), [n0, n1] = weekRange(1), [l0, l1] = weekRange(-1);
  const baseWhere = where.join(' AND ');
  const from = ' FROM rec_instances i JOIN rec_tasks t ON t.id=i.task_id LEFT JOIN departments d ON d.id=t.dept_id LEFT JOIN users u ON u.id=t.doer_id WHERE ';
  const c = db.prepare(`SELECT COALESCE(SUM(i.due_date=?),0) today, COALESCE(SUM(i.status='pending' AND i.due_date<?),0) overdue, COALESCE(SUM(i.due_date BETWEEN ? AND ?),0) week,
    COALESCE(SUM(i.due_date BETWEEN ? AND ?),0) nextweek, COALESCE(SUM(i.due_date BETWEEN ? AND ?),0) lastweek, COALESCE(SUM(i.status='not_done'),0) notdone, COALESCE(SUM(i.due_date<=?),0) \"all\"` + from + baseWhere)
    .get(today, today, w0, w1, n0, n1, l0, l1, today, ...args);
  c.unique = db.prepare('SELECT COUNT(*) n FROM rec_tasks t WHERE ' + baseWhere).get(...args).n;
  if (range === 'unique') {
    const rows = db.prepare(`SELECT t.*, d.name dept_name, u.name doer_name FROM rec_tasks t LEFT JOIN departments d ON d.id=t.dept_id LEFT JOIN users u ON u.id=t.doer_id WHERE ${baseWhere} ORDER BY t.id DESC LIMIT 500`).all(...args);
    rows.forEach(r => r.uid = uidR(r.id)); return { counts: c, kind: 'templates', rows };
  }
  const RC = { today: ['i.due_date=?', [today]], overdue: ["i.status='pending' AND i.due_date<?", [today]], week: ['i.due_date BETWEEN ? AND ?', [w0, w1]], nextweek: ['i.due_date BETWEEN ? AND ?', [n0, n1]], lastweek: ['i.due_date BETWEEN ? AND ?', [l0, l1]], notdone: ["i.status='not_done'", []], all: ['i.due_date<=?', [today]] }[range] || ['1=1', []];
  const extra = date ? ' AND i.due_date=?' : '', ex = date ? [date] : [];
  const rows = db.prepare(`SELECT i.id,i.task_id,i.due_date,i.status,i.done_at,i.remarks,t.category,t.frequency,t.description,t.priority,t.needs_proof,t.dept_id,t.doer_id,d.name dept_name,u.name doer_name, ${msgCount('recurring', 'i.id')} msgs`
    + from + baseWhere + ' AND ' + RC[0] + extra + ` ORDER BY i.due_date ${['today', 'week', 'nextweek'].includes(range) ? 'ASC' : 'DESC'}, i.id LIMIT 100 OFFSET ?`).all(...args, ...RC[1], ...ex, (page - 1) * 100);
  rows.forEach(r => {
    r.uid = uidR(r.task_id) + '.' + r.id;
    r.delay_days = r.status === 'pending' && r.due_date < today ? diffDays(today, r.due_date) : 0;
    if (r.status === 'done' && r.done_at && r.done_at.slice(0, 10) > r.due_date) r.late_days = diffDays(r.done_at, r.due_date);
  });
  return { counts: c, kind: 'instances', rows, total: range === 'all' ? c.all : c[range] };
}));
app.post('/api/recurring', auth, wrap(req => {
  const u = req.user, b = req.body, dept = num(b.dept_id);
  if (!canEdit(u, dept, 'recurring')) fail(403, 'You need editor access in this department to create recurring tasks');
  if (!b.description || !b.frequency || !b.start_date || !num(b.doer_id)) fail(400, 'Department, doer, frequency, start date and description are required');
  if (b.end_date && b.end_date < b.start_date) fail(400, 'End date cannot be before the start date');
  const gen = b.start_date > todayStr() ? b.start_date : todayStr();
  const id = db.prepare('INSERT INTO rec_tasks(dept_id,doer_id,category,frequency,start_date,end_date,description,performer,on_time,needs_proof,reviewer_id,priority,created_by,gen_from) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(dept, num(b.doer_id), b.category || null, b.frequency, b.start_date, b.end_date || null, String(b.description).trim(), b.performer || 'doer', flag(b.on_time), flag(b.needs_proof), num(b.reviewer_id), b.priority || 'Medium', u.id, gen).lastInsertRowid;
  ensureLookup('category', b.category); genInstances(); return { id, uid: uidR(id) };
}));
app.patch('/api/recurring/templates/:id', auth, wrap(req => {
  const t = db.prepare('SELECT * FROM rec_tasks WHERE id=?').get(num(req.params.id)); if (!t) fail(404, 'Not found');
  if (!canEdit(req.user, t.dept_id, 'recurring')) fail(403, 'You need editor access to change this');
  const b = req.body;
  db.prepare('UPDATE rec_tasks SET description=?, category=?, priority=?, doer_id=?, reviewer_id=?, end_date=?, active=? WHERE id=?')
    .run(b.description ?? t.description, b.category ?? t.category, b.priority ?? t.priority, 'doer_id' in b ? num(b.doer_id) : t.doer_id, 'reviewer_id' in b ? num(b.reviewer_id) : t.reviewer_id, 'end_date' in b ? (b.end_date || null) : t.end_date, 'active' in b ? flag(b.active) : t.active, t.id);
  return { ok: true };
}));
app.patch('/api/recurring/instances/:id', auth, wrap(req => {
  const u = req.user, i = db.prepare('SELECT i.*, t.doer_id, t.dept_id, t.needs_proof FROM rec_instances i JOIN rec_tasks t ON t.id=i.task_id WHERE i.id=?').get(num(req.params.id));
  if (!i) fail(404, 'Not found'); if (u.role === 'pc') fail(403, 'View-only account');
  if (!(i.doer_id === u.id || canEdit(u, i.dept_id, 'recurring'))) fail(403, 'Only the doer or an editor can update this task');
  const a = req.body.action, remarks = String(req.body.remarks || '').trim();
  if (a === 'done') { if (i.needs_proof && !remarks) fail(400, 'This task needs proof — add a note or link'); db.prepare("UPDATE rec_instances SET status='done', done_at=datetime('now','localtime'), remarks=? WHERE id=?").run(remarks || null, i.id); }
  else if (a === 'not_done') db.prepare("UPDATE rec_instances SET status='not_done', done_at=datetime('now','localtime'), remarks=? WHERE id=?").run(remarks || null, i.id);
  else if (a === 'undo') db.prepare("UPDATE rec_instances SET status='pending', done_at=NULL WHERE id=?").run(i.id);
  else fail(400, 'Unknown action');
  return { ok: true };
}));

/* ================= DELEGATION ================= */
function visibleBoards(u) {
  const all = db.prepare('SELECT b.*, o.name owner_name, d.name dept_name FROM boards b LEFT JOIN users o ON o.id=b.owner_id LEFT JOIN departments d ON d.id=b.dept_id').all();
  const mem = db.prepare('SELECT m.board_id, m.user_id, m.level, x.name FROM board_members m JOIN users x ON x.id=m.user_id').all(), by = {};
  mem.forEach(m => (by[m.board_id] = by[m.board_id] || []).push(m));
  const cnt = {}; db.prepare('SELECT board_id,status,COUNT(*) n FROM del_tasks GROUP BY board_id,status').all().forEach(r => ((cnt[r.board_id] = cnt[r.board_id] || {})[r.status] = r.n));
  return all.filter(b => {
    b.members = by[b.id] || []; b.counts = cnt[b.id] || {};
    const mine = b.members.find(m => m.user_id === u.id);
    let lv = null;
    if (u.role === 'admin' || b.owner_id === u.id) lv = 'editor';
    else { lv = b.dept_id ? levelFor(u, b.dept_id, 'delegation') : (u.role === 'pc' ? 'viewer' : null); if (mine && lv !== 'editor') lv = mine.level === 'editor' && u.role !== 'pc' ? 'editor' : (lv || 'viewer'); }
    b.my_level = lv; return !!lv;
  });
}
app.get('/api/boards', auth, wrap(req => visibleBoards(req.user).filter(b => req.query.archived === '1' ? b.archived : !b.archived)));
app.post('/api/boards', auth, wrap(req => {
  const u = req.user, b = req.body; if (u.role === 'pc') fail(403, 'View-only account'); if (!String(b.name || '').trim()) fail(400, 'Board name is required');
  const id = db.prepare('INSERT INTO boards(name,color,icon,dept_id,sharing,start_date,end_date,owner_id) VALUES(?,?,?,?,?,?,?,?)')
    .run(String(b.name).trim(), b.color || '#2563eb', b.icon || '📋', num(b.dept_id), b.sharing === 'specific' ? 'specific' : 'private', b.start_date || null, b.end_date || null, u.id).lastInsertRowid;
  const add = db.prepare('INSERT OR IGNORE INTO board_members(board_id,user_id,level) VALUES(?,?,?)');
  add.run(id, u.id, 'editor'); if (b.sharing === 'specific') (b.members || []).forEach(m => add.run(id, num(m), 'editor'));
  return { id };
}));
app.patch('/api/boards/:id', auth, wrap(req => {
  const u = req.user, id = num(req.params.id), b = visibleBoards(u).find(x => x.id === id); if (!b) fail(404, 'Board not found');
  if (!(u.role === 'admin' || b.owner_id === u.id || (u.role === 'hod' && b.dept_id === u.dept_id))) fail(403, 'Only the board owner can change it');
  const x = req.body;
  db.prepare('UPDATE boards SET name=?, color=?, icon=?, sharing=?, start_date=?, end_date=?, archived=? WHERE id=?').run(x.name ?? b.name, x.color ?? b.color, x.icon ?? b.icon, x.sharing ?? b.sharing, 'start_date' in x ? (x.start_date || null) : b.start_date, 'end_date' in x ? (x.end_date || null) : b.end_date, 'archived' in x ? flag(x.archived) : b.archived, id);
  if (Array.isArray(x.members)) { db.prepare('DELETE FROM board_members WHERE board_id=? AND user_id<>?').run(id, b.owner_id); const add = db.prepare('INSERT OR IGNORE INTO board_members(board_id,user_id,level) VALUES(?,?,?)'); x.members.forEach(m => add.run(id, num(m), 'editor')); }
  return { ok: true };
}));
const DSQL = `SELECT x.*, b.name board_name, b.color board_color, b.icon board_icon, b.dept_id, au.name assigned_name, cu.name created_by_name, ${msgCount('delegation', 'x.id')} msgs
  FROM del_tasks x JOIN boards b ON b.id=x.board_id LEFT JOIN users au ON au.id=x.assigned_to LEFT JOIN users cu ON cu.id=x.created_by`;
app.get('/api/delegation/tasks', auth, wrap(req => {
  const u = req.user, { scope = 'my', board = '', status = '', q = '' } = req.query, today = todayStr();
  const vis = visibleBoards(u), byId = {}; vis.forEach(b => byId[b.id] = b);
  let rows = db.prepare(DSQL + (scope === 'my' ? ' WHERE x.assigned_to=' + u.id : '') + ' ORDER BY x.id DESC').all();
  rows = rows.filter(t => scope === 'my' ? true : byId[t.board_id] && (scope !== 'board' || String(t.board_id) === String(board)));
  if (q) { const s = q.toLowerCase(); rows = rows.filter(t => ('#' + t.id + ' ' + t.title + ' ' + (t.assigned_name || '')).toLowerCase().includes(s)); }
  const counts = { not_started: 0, in_progress: 0, under_review: 0, done: 0, hold: 0 };
  rows.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  rows.forEach(t => {
    const b = byId[t.board_id];
    t.can_manage = u.role !== 'pc' && (t.created_by === u.id || (b && b.my_level === 'editor'));
    t.can_act = u.role !== 'pc' && (t.can_manage || t.assigned_to === u.id);
    t.delay_days = ['not_started', 'in_progress', 'hold'].includes(t.status) && t.due_date && t.due_date < today ? diffDays(today, t.due_date) : 0;
  });
  return { counts, rows: (status ? rows.filter(t => t.status === status) : rows).slice(0, 500) };
}));
app.post('/api/delegation/tasks', auth, wrap(req => {
  const u = req.user, b = req.body, board = visibleBoards(u).find(x => x.id === num(b.board_id));
  if (!board || board.my_level !== 'editor') fail(403, 'You cannot add tasks to this board');
  if (!String(b.title || '').trim()) fail(400, 'Task title is required');
  const to = num(b.assigned_to) || u.id;
  const id = db.prepare('INSERT INTO del_tasks(board_id,title,description,assigned_to,created_by,due_date,priority) VALUES(?,?,?,?,?,?,?)').run(board.id, String(b.title).trim(), b.description || null, to, u.id, b.due_date || null, b.priority || 'Medium').lastInsertRowid;
  db.prepare('INSERT OR IGNORE INTO board_members(board_id,user_id,level) VALUES(?,?,?)').run(board.id, to, 'editor');
  if (to !== u.id) M.notify(to, 'New task delegated to you', [`${u.name} gave you: ${short(b.title)}`, b.due_date ? 'Due ' + b.due_date : '', 'Board: ' + board.name].filter(Boolean), { path: '#/delegation/my' }, 'task assigned');
  return { id };
}));
app.patch('/api/delegation/tasks/:id', auth, wrap(req => {
  const u = req.user, t = db.prepare('SELECT x.*, b.owner_id, b.dept_id FROM del_tasks x JOIN boards b ON b.id=x.board_id WHERE x.id=?').get(num(req.params.id)); if (!t) fail(404, 'Task not found');
  if (u.role === 'pc') fail(403, 'View-only account');
  const boardLv = (visibleBoards(u).find(b => b.id === t.board_id) || {}).my_level;
  const mgr = t.created_by === u.id || boardLv === 'editor', mine = t.assigned_to === u.id, b = req.body;
  const need = ok => { if (!ok) fail(403, 'You are not allowed to do that on this task'); };
  const set = (status, extra = '') => db.prepare(`UPDATE del_tasks SET status=?${extra} WHERE id=?`).run(status, t.id);
  switch (b.action) {
    case 'status': need(mine || mgr); if (!['not_started', 'in_progress', 'hold'].includes(b.status)) fail(400, 'Bad status'); set(b.status); break;
    case 'done': need(mine || mgr); if (mine && t.created_by !== u.id) set('under_review'); else set('done', ",closed_at=datetime('now','localtime')"); break;
    case 'approve': need(mgr); set('done', ",closed_at=datetime('now','localtime')"); break;
    case 'rework': need(mgr); set('in_progress', ',rework=rework+1'); break;
    case 'request_date': need(mine); if (!b.date) fail(400, 'Pick the new date'); db.prepare('UPDATE del_tasks SET req_date=?, req_reason=? WHERE id=?').run(b.date, b.reason || null, t.id); break;
    case 'approve_date': need(mgr); db.prepare('UPDATE del_tasks SET due_date=req_date, req_date=NULL, req_reason=NULL WHERE id=?').run(t.id); break;
    case 'reject_date': need(mgr); db.prepare('UPDATE del_tasks SET req_date=NULL, req_reason=NULL WHERE id=?').run(t.id); break;
    case 'edit': need(mgr); db.prepare('UPDATE del_tasks SET title=?, description=?, due_date=?, assigned_to=?, priority=? WHERE id=?').run(b.title || t.title, b.description ?? t.description, b.due_date ?? t.due_date, num(b.assigned_to) || t.assigned_to, b.priority || t.priority, t.id); break;
    case 'delete': need(mgr); db.prepare('DELETE FROM del_tasks WHERE id=?').run(t.id); break;
    default: fail(400, 'Unknown action');
  }
  { const a = b.action, nt = db.prepare('SELECT * FROM del_tasks WHERE id=?').get(t.id), what = short(t.title), p = { path: '#/delegation/my' };
    if (a === 'done' && nt && nt.status === 'under_review') M.notify(t.created_by, 'A delegated task is ready for your review', [`${(M_name(u))} finished: ${what}`], { path: '#/review' }, 'review');
    else if (a === 'approve') M.notify(t.assigned_to, 'Your delegated task was approved', [what], p, 'review result');
    else if (a === 'rework') M.notify(t.assigned_to, 'A delegated task was sent back for rework', [what], p, 'review result');
    else if (a === 'request_date') M.notify(t.created_by, 'A new due date was requested', [`${u.name} asked to move “${what}” to ${b.date}`, b.reason ? 'Reason: ' + short(b.reason) : ''].filter(Boolean), { path: '#/delegation/team' }, 'date change');
    else if (a === 'approve_date' || a === 'reject_date') M.notify(t.assigned_to, a === 'approve_date' ? 'Your new due date was approved' : 'Your date-change request was declined', [what], p, 'date change');
    else if (a === 'edit' && nt && nt.assigned_to !== t.assigned_to) M.notify(nt.assigned_to, 'A task was delegated to you', [what, nt.due_date ? 'Due ' + nt.due_date : ''].filter(Boolean), p, 'task assigned'); }
  return { ok: true };
}));

/* ================= REVIEW QUEUE ================= */
app.get('/api/review', auth, wrap(req => {
  const u = req.user;
  const tickets = db.prepare(TSQL + " WHERE t.status='review' AND (t.reviewer_id=? OR t.created_by=?) ORDER BY t.id DESC").all(u.id, u.id).map(t => shapeTicket(t, todayStr()));
  const delegation = db.prepare(DSQL + " WHERE x.status='under_review' AND x.created_by=? ORDER BY x.id DESC").all(u.id);
  const steps = db.prepare(`SELECT es.id, es.step_no, es.name step_name, es.actual_at, es.entry_id, e.uid, e.title, p.name process_name, p.id process_id, du.name doer_name FROM entry_steps es JOIN entries e ON e.id=es.entry_id JOIN processes p ON p.id=e.process_id LEFT JOIN users du ON du.id=es.doer_id WHERE es.status='review' AND es.reviewer_id=? ORDER BY es.actual_at`).all(u.id);
  return { tickets, delegation, steps };
}));

/* ================= FMS / PROCESSES ================= */
const FMS_TYPES = ['Straight', 'Primary', 'Direct', 'Staggered', 'Loop'];
const GRAPH_DAYS = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };
function processKpi(pid, graph) {
  const now = Date.now(), since = GRAPH_DAYS[graph] ? now - GRAPH_DAYS[graph] * 864e5 : 0;
  const ent = db.prepare('SELECT status, COUNT(*) n FROM entries WHERE process_id=? GROUP BY status').all(pid);
  const steps = db.prepare('SELECT es.step_no, es.name, es.status, es.planned_at, es.actual_at FROM entry_steps es JOIN entries e ON e.id=es.entry_id WHERE e.process_id=? ORDER BY es.step_no').all(pid);
  const per = {}; let done = 0, ontime = 0, overdue = 0;
  for (const s of steps) {
    const p = per[s.step_no] = per[s.step_no] || { step_no: s.step_no, name: s.name, done: 0, delay: 0, late: 0 };
    if (s.status === 'done' && s.planned_at && s.actual_at && s.actual_at >= since) { p.done++; done++; if (s.actual_at <= s.planned_at) ontime++; else { p.delay += s.actual_at - s.planned_at; p.late++; } }
    if (s.status === 'pending' && s.planned_at && s.planned_at < now) overdue++;
  }
  return { total: ent.reduce((a, e) => a + e.n, 0), running: (ent.find(e => e.status === 'running') || {}).n || 0, completed: (ent.find(e => e.status === 'completed') || {}).n || 0,
    overdue, onTimePct: done ? Math.round(ontime / done * 100) : null, window: graph || 'weekly', bottleneck: Object.values(per).map(p => ({ step_no: p.step_no, name: p.name, done: p.done, late: p.late, avg_delay_hrs: p.late ? +(p.delay / p.late / 36e5).toFixed(1) : 0 })) };
}
const parseJ = (s, d = []) => { try { return JSON.parse(s || ''); } catch { return d; } };
function visibleProcesses(u) {
  const ds = deptScope(u, 'fms'), mySteps = new Set(db.prepare('SELECT DISTINCT process_id FROM process_steps WHERE doer_id=?').all(u.id).map(r => r.process_id));
  return db.prepare('SELECT p.*, d.name dept_name, pc.name pc_name FROM processes p LEFT JOIN departments d ON d.id=p.dept_id LEFT JOIN users pc ON pc.id=p.pc_id ORDER BY p.name').all()
    .filter(p => ds === null || ds.includes(p.dept_id) || p.pc_id === u.id || mySteps.has(p.id));
}
app.get('/api/processes', auth, wrap(req => visibleProcesses(req.user).map(p => ({ ...p, fields: JSON.parse(p.fields || '[]'), kpi: processKpi(p.id, p.graph_period), can_edit: canEdit(req.user, p.dept_id, 'fms') }))));
app.get('/api/processes/:id', auth, wrap(req => {
  const p = visibleProcesses(req.user).find(x => x.id === num(req.params.id)); if (!p) fail(404, 'Process not found');
  return { ...p, fields: JSON.parse(p.fields || '[]'), steps: stepRows(p.id).map(x => ({ ...x, checklist: parseJ(x.checklist) })), kpi: processKpi(p.id, p.graph_period), can_edit: canEdit(req.user, p.dept_id, 'fms'), entry_count: db.prepare('SELECT COUNT(*) n FROM entries WHERE process_id=?').get(p.id).n };
}));
function saveSteps(pid, steps) {
  db.prepare('DELETE FROM process_steps WHERE process_id=?').run(pid);
  const ins = db.prepare('INSERT INTO process_steps(process_id,step_no,name,doer_id,reviewer_id,tat,unit,checklist,due_time) VALUES(?,?,?,?,?,?,?,?,?)');
  steps.forEach((s, i) => ins.run(pid, i + 1, String(s.name || 'Step ' + (i + 1)).trim(), num(s.doer_id), num(s.reviewer_id), Math.max(s.unit === 'workdays' ? 0 : 1, num(s.tat) ?? 1), ['minutes', 'hours', 'days', 'workdays'].includes(s.unit) ? s.unit : 'days',
    JSON.stringify((Array.isArray(s.checklist) ? s.checklist : []).filter(c => c && String(c.text || '').trim()).map(c => ({ text: String(c.text).trim(), required: !!c.required }))), /^\d{1,2}:\d{2}$/.test(String(s.due_time || '')) ? s.due_time : null));
}
const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'datetime', 'select', 'checkbox'];
function cleanFields(f) { return (Array.isArray(f) ? f : []).filter(x => x && String(x.label || '').trim()).map((x, i) => ({ key: 'f' + (i + 1), label: String(x.label).trim(), type: FIELD_TYPES.includes(x.type) ? x.type : 'text', required: !!x.required, options: x.type === 'select' ? String(x.options || '').split(',').map(s => s.trim()).filter(Boolean) : undefined })); }
const UPDATERS = ['owner', 'deo', 'step_owner'], GRAPHS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
app.post('/api/processes', auth, wrap(req => {
  const b = req.body, dept = num(b.dept_id); if (!canEdit(req.user, dept, 'fms')) fail(403, 'You need editor access in this department to create processes');
  if (!String(b.name || '').trim()) fail(400, 'Process name is required'); if (!Array.isArray(b.steps) || !b.steps.length) fail(400, 'Add at least one step');
  const id = db.prepare('INSERT INTO processes(name,prefix,description,type,dept_id,pc_id,fields,updater,graph_period) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(String(b.name).trim(), String(b.prefix || b.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || 'FMS', b.description || null, FMS_TYPES.includes(b.type) ? b.type : 'Straight', dept, num(b.pc_id) || req.user.id, JSON.stringify(cleanFields(b.fields)), UPDATERS.includes(b.updater) ? b.updater : 'step_owner', GRAPHS.includes(b.graph_period) ? b.graph_period : 'weekly').lastInsertRowid;
  saveSteps(id, b.steps); return { id };
}));
app.put('/api/processes/:id', auth, wrap(req => {
  const p = db.prepare('SELECT * FROM processes WHERE id=?').get(num(req.params.id)); if (!p) fail(404, 'Not found');
  if (!canEdit(req.user, p.dept_id, 'fms')) fail(403, 'You need editor access to change this process');
  const b = req.body, hasEntries = db.prepare('SELECT COUNT(*) n FROM entries WHERE process_id=?').get(p.id).n;
  db.prepare("UPDATE processes SET name=?, description=?, type=?, pc_id=?, updater=?, graph_period=?, updated_at=datetime('now','localtime') WHERE id=?").run(b.name || p.name, b.description ?? p.description, FMS_TYPES.includes(b.type) ? b.type : p.type, num(b.pc_id) || p.pc_id, UPDATERS.includes(b.updater) ? b.updater : p.updater, GRAPHS.includes(b.graph_period) ? b.graph_period : p.graph_period, p.id);
  if (!hasEntries) { if (b.fields) db.prepare('UPDATE processes SET fields=? WHERE id=?').run(JSON.stringify(cleanFields(b.fields)), p.id); if (Array.isArray(b.steps) && b.steps.length) saveSteps(p.id, b.steps); }
  return { ok: true, steps_locked: !!hasEntries };
}));
app.delete('/api/processes/:id', auth, wrap(req => {
  if (req.user.role !== 'admin') fail(403, 'Only the admin can delete a process'); const id = num(req.params.id);
  db.transaction(() => { db.prepare('DELETE FROM entry_steps WHERE entry_id IN (SELECT id FROM entries WHERE process_id=?)').run(id); db.prepare('DELETE FROM entries WHERE process_id=?').run(id); db.prepare('DELETE FROM process_steps WHERE process_id=?').run(id); db.prepare('DELETE FROM processes WHERE id=?').run(id); })();
  return { ok: true };
}));
function canUpdateStep(u, es, p) {                   // who may mark a step done is set per process
  if (u.role === 'pc') return false;
  if (u.role === 'admin' || (u.role === 'hod' && u.dept_id === p.dept_id)) return true;
  const mode = p.updater || 'step_owner';
  if (mode === 'owner') return p.pc_id === u.id;
  if (mode === 'deo') return canEdit(u, p.dept_id, 'fms');
  return es.doer_id === u.id || canEdit(u, p.dept_id, 'fms');
}
const canReviewStep = (u, es, p) => u.role !== 'pc' && (es.reviewer_id === u.id || u.role === 'admin' || (u.role === 'hod' && u.dept_id === p.dept_id));
function checkRequired(fields, data) { for (const f of fields) if (f.required) { const v = data[f.key]; if (v == null || String(v).trim() === '' || v === false) fail(400, `“${f.label}” is required`); } }
app.get('/api/processes/:id/entries', auth, wrap(req => {
  const p = visibleProcesses(req.user).find(x => x.id === num(req.params.id)); if (!p) fail(404, 'Process not found');
  const { status = '', q = '' } = req.query, page = Math.max(1, num(req.query.page) || 1);
  const where = ['e.process_id=?'], args = [p.id];
  if (status) { where.push('e.status=?'); args.push(status); }
  if (q) { where.push('(e.uid LIKE ? OR e.title LIKE ? OR e.data LIKE ?)'); args.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  const total = db.prepare('SELECT COUNT(*) n FROM entries e WHERE ' + where.join(' AND ')).get(...args).n;
  const entries = db.prepare('SELECT e.* FROM entries e WHERE ' + where.join(' AND ') + ' ORDER BY e.id DESC LIMIT 50 OFFSET ?').all(...args, (page - 1) * 50);
  const ids = entries.map(e => e.id), by = {}, sr = stepRows(p.id);
  if (ids.length) db.prepare(`SELECT es.*, u.name doer_name, r.name reviewer_name FROM entry_steps es LEFT JOIN users u ON u.id=es.doer_id LEFT JOIN users r ON r.id=es.reviewer_id WHERE es.entry_id IN (${inList(ids)}) ORDER BY es.step_no`).all(...ids).forEach(s => (by[s.entry_id] = by[s.entry_id] || []).push(s));
  entries.forEach(e => { e.data = JSON.parse(e.data || '{}'); e.steps = (by[e.id] || []).map(s => ({ ...s, can_update: s.status === 'pending' && s.planned_at != null && canUpdateStep(req.user, s, p), can_review: s.status === 'review' && canReviewStep(req.user, s, p), checklist: parseJ((sr.find(x => x.step_no === s.step_no) || {}).checklist) })); });
  return { total, entries, process: { ...p, fields: JSON.parse(p.fields || '[]'), steps: sr.map(x => ({ ...x, checklist: parseJ(x.checklist) })), can_edit: canEdit(req.user, p.dept_id, 'fms') } };
}));
app.post('/api/processes/:id/entries', auth, wrap(req => {
  const p = db.prepare('SELECT * FROM processes WHERE id=?').get(num(req.params.id)); if (!p) fail(404, 'Process not found');
  const steps = stepRows(p.id); if (!steps.length) fail(400, 'This process has no steps');
  if (!(canEdit(req.user, p.dept_id, 'fms') || steps[0].doer_id === req.user.id)) fail(403, 'You cannot add entries to this process');
  const data = req.body.data || {}; checkRequired(JSON.parse(p.fields || '[]'), data);
  return createEntry(p, steps, { title: String(req.body.title || '').trim(), data }, req.user.id);
}));
const stepLabel = entryId => { const e = db.prepare('SELECT e.uid,e.title,p.name pname FROM entries e JOIN processes p ON p.id=e.process_id WHERE e.id=?').get(entryId); return e ? `${e.pname}: ${e.uid} ${e.title}` : 'Process entry'; };
function nextTurn(entryId) {          // tell the next doer it is their turn
  const n = db.prepare("SELECT es.* FROM entry_steps es WHERE es.entry_id=? AND es.status='pending' AND es.planned_at IS NOT NULL ORDER BY step_no LIMIT 1").get(entryId); if (!n) return;
  M.notify(n.doer_id, 'It is your turn on a process step', [`${stepLabel(entryId)}`, `Step ${n.step_no}: ${n.name}`, 'Due ' + new Date(n.planned_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })], { path: '#/fms/my' }, 'process turn');
}
const stepCtx = id => db.prepare('SELECT es.*, p.dept_id, p.updater, p.pc_id, ps.checklist FROM entry_steps es JOIN entries e ON e.id=es.entry_id JOIN processes p ON p.id=e.process_id LEFT JOIN process_steps ps ON ps.process_id=p.id AND ps.step_no=es.step_no WHERE es.id=?').get(id);
app.post('/api/fms/steps/:id/complete', auth, wrap(req => {
  const es = stepCtx(num(req.params.id)); if (!es) fail(404, 'Step not found'); if (req.user.role === 'pc') fail(403, 'View-only account');
  if (!canUpdateStep(req.user, es, es)) fail(403, 'You are not allowed to update this step in this process');
  const skip = req.body.status === 'skipped', ticked = (Array.isArray(req.body.checks) ? req.body.checks : []).map(Number);
  if (!skip) parseJ(es.checklist).forEach((it, i) => { if (it.required && !ticked.includes(i)) fail(400, `Please tick “${it.text}” before completing`); });
  const r = completeStep(es, Date.now(), req.body.remarks, skip ? 'skipped' : 'done', JSON.stringify(ticked));
  if (r === 'review') M.notify(es.reviewer_id, 'A process step is ready for your review', [`${stepLabel(es.entry_id)} – Step ${es.step_no}: ${es.name}`, `Submitted by ${req.user.name}`], { path: '#/review' }, 'review'); else nextTurn(es.entry_id);
  return { ok: true, status: r };
}));
app.post('/api/fms/steps/:id/review', auth, wrap(req => {
  const es = stepCtx(num(req.params.id)); if (!es) fail(404, 'Step not found');
  if (!canReviewStep(req.user, es, es)) fail(403, 'Only the reviewer can do that');
  if (req.body.action === 'approve') { approveStep(es, Date.now()); nextTurn(es.entry_id); } else if (req.body.action === 'rework') { reworkStep(es, req.body.note); M.notify(es.doer_id, 'A process step was sent back for rework', [`${stepLabel(es.entry_id)} – Step ${es.step_no}: ${es.name}`, req.body.note ? 'Note: ' + short(req.body.note) : ''].filter(Boolean), { path: '#/fms/my' }, 'review result'); } else fail(400, 'Unknown action');
  return { ok: true };
}));
app.get('/api/fms/my-tasks', auth, wrap(req => {
  const u = req.user, { scope = 'my', range = 'today', q = '' } = req.query, now = Date.now(), today = todayStr();
  const where = ["es.status='pending'", 'es.planned_at IS NOT NULL'], args = [];
  if (scope === 'my') { where.push('es.doer_id=?'); args.push(u.id); } else { const [s, a] = scopeSql(u, 'fms', 'p.dept_id', ['es.doer_id']); where.push(s); args.push(...a); }
  let rows = db.prepare(`SELECT es.id, es.step_no, es.name step_name, es.planned_at, es.entry_id, es.doer_id, es.reviewer_id, e.uid, e.title, e.started_at, p.name process_name, p.id process_id, p.dept_id, p.updater, p.pc_id, du.name doer_name, ru.name reviewer_name, ps.checklist
    FROM entry_steps es JOIN entries e ON e.id=es.entry_id JOIN processes p ON p.id=e.process_id LEFT JOIN users du ON du.id=es.doer_id LEFT JOIN users ru ON ru.id=es.reviewer_id LEFT JOIN process_steps ps ON ps.process_id=p.id AND ps.step_no=es.step_no WHERE ${where.join(' AND ')} ORDER BY es.planned_at`).all(...args);
  if (q) { const s = q.toLowerCase(); rows = rows.filter(r => (r.uid + r.title + r.process_name + r.step_name).toLowerCase().includes(s)); }
  const bd = d => L.dayBounds(d), rg = { today: bd(today), week: [bd(L.weekRange(0)[0])[0], bd(L.weekRange(0)[1])[1]], nextweek: [bd(L.weekRange(1)[0])[0], bd(L.weekRange(1)[1])[1]], lastweek: [bd(L.weekRange(-1)[0])[0], bd(L.weekRange(-1)[1])[1]] };
  const inR = (r, k) => r.planned_at >= rg[k][0] && r.planned_at <= rg[k][1];
  const counts = { today: rows.filter(r => inR(r, 'today')).length, overdue: rows.filter(r => r.planned_at < now).length, week: rows.filter(r => inR(r, 'week')).length, nextweek: rows.filter(r => inR(r, 'nextweek')).length, lastweek: rows.filter(r => inR(r, 'lastweek')).length };
  rows = (range === 'overdue' ? rows.filter(r => r.planned_at < now) : range === 'all' ? rows : rows.filter(r => inR(r, range))).slice(0, 300);
  rows.forEach(r => { r.can_update = canUpdateStep(u, r, r); r.checklist = parseJ(r.checklist); });
  return { counts, rows };
}));

/* ================= WORK ITEMS: dashboard, MIS report, overview, settings ================= */
const boardIdsOf = u => new Set(visibleBoards(u).map(b => b.id));
app.get('/api/dashboard', auth, wrap(req => {
  genSoon();
  const u = req.user, today = todayStr(), { dept = '', period = 'all' } = req.query, view = req.query.view === 'my' ? 'my' : 'team';
  const range = period === 'today' ? [today, today] : period === 'week' ? weekRange() : period === 'month' ? monthRange() : [null, null];
  const ds = csvNums(dept), scope = view === 'my' ? (r => r.doer === u.id) : W.makeScope(u, boardIdsOf(u));
  // admin / process-coordination see everything, so the counts are done inside the database (fast even with huge history)
  const items = (u.role === 'admin' || u.role === 'pc') && view === 'team'
    ? W.dashGroups(range[0], range[1]).filter(r => r.b && (!ds.length || ds.includes(r.dept)))
    : W.loadWork(u, { from: range[0], to: range[1], mine: view === 'my' }).filter(r => r.b && scope(r) && (!ds.length || ds.includes(r.dept)))
      .map(r => ({ mod: r.mod, dept: r.dept, b: r.b, over: r.due && r.due < today ? 1 : 0, rw: r.rework > 0 ? 1 : 0, n: 1 }));
  const modules = { tickets: { total: 0, buckets: {}, overdue: 0 }, recurring: { total: 0, buckets: {}, overdue: 0 }, delegation: { total: 0, buckets: {}, overdue: 0 }, process: { total: 0, buckets: {}, overdue: 0 } };
  const byDept = {}, totals = { total: 0, open: 0, overdue: 0, not_done: 0, closed: 0, rework: 0 };
  for (const r of items) {
    const m = modules[r.mod], open = W.OPEN.includes(r.b), over = open && r.over, n = r.n;
    m.total += n; m.buckets[r.b] = (m.buckets[r.b] || 0) + n; if (over) m.overdue += n;
    totals.total += n; if (open) totals.open += n; if (over) totals.overdue += n; if (r.b === 'not_done') totals.not_done += n; if (r.b === 'completed') totals.closed += n; if (open && r.rw) totals.rework += n;
    const d = byDept[r.dept || 0] = byDept[r.dept || 0] || { total: 0, open: 0, overdue: 0, closed: 0 };
    d.total += n; if (open) d.open += n; if (over) d.overdue += n; if (r.b === 'completed') d.closed += n;
  }
  const names = Object.fromEntries(db.prepare('SELECT id,name FROM departments').all().map(d => [d.id, d.name]));
  const my = [];
  db.prepare("SELECT id,description,due_date FROM tickets WHERE doer_id=? AND status IN ('open','in_progress') AND due_date<? ORDER BY due_date LIMIT 6").all(u.id, today).forEach(r => my.push({ type: 'Ticket', title: r.description, due: r.due_date, link: '#/tickets/assigned' }));
  db.prepare("SELECT i.id,t.description,i.due_date FROM rec_instances i JOIN rec_tasks t ON t.id=i.task_id WHERE t.doer_id=? AND t.active=1 AND i.status='pending' AND i.due_date<? ORDER BY i.due_date LIMIT 6").all(u.id, today).forEach(r => my.push({ type: 'Recurring', title: r.description, due: r.due_date, link: '#/recurring/my' }));
  db.prepare("SELECT id,title,due_date FROM del_tasks WHERE assigned_to=? AND status IN ('not_started','in_progress') AND due_date<? ORDER BY due_date LIMIT 6").all(u.id, today).forEach(r => my.push({ type: 'Delegation', title: r.title, due: r.due_date, link: '#/delegation/my' }));
  my.sort((a, b) => a.due.localeCompare(b.due));
  return { view, modules, totals, byDept: Object.entries(byDept).map(([id, v]) => ({ dept_id: +id, name: names[id] || 'No department', ...v })).sort((a, b) => b.overdue - a.overdue || b.open - a.open), myOverdue: my.slice(0, 8).map(r => ({ ...r, days: diffDays(today, r.due) })) };
}));
app.get('/api/overview', auth, wrap(req => {
  const u = req.user; if (!isMgr(u) && u.role !== 'pc') return { none: true };
  const mine = u.role === 'hod', dpt = u.dept_id;
  const users = db.prepare('SELECT id,name,email,active,dept_id FROM users ORDER BY id DESC').all().filter(x => !mine || x.dept_id === dpt);
  const rows = W.loadWork(u, { mods: ['tickets'] }).filter(W.makeScope(u, boardIdsOf(u)));
  const tk = rows.filter(r => r.mod === 'tickets' && r.b !== 'archived');
  const procs = db.prepare('SELECT dept_id FROM processes').all().filter(p => !mine || p.dept_id === dpt).length;
  const recs = db.prepare('SELECT dept_id FROM rec_tasks WHERE active=1').all().filter(p => !mine || p.dept_id === dpt).length;
  const depts = db.prepare('SELECT id FROM departments').all().filter(d => !mine || d.id === dpt).length;
  const act = users.filter(x => x.active).length;
  return { scope: mine ? 'dept' : 'all', departments: depts, users: { total: users.length, active: act, inactive: users.length - act },
    tickets: { total: tk.length, open: tk.filter(r => r.b === 'not_started').length, in_progress: tk.filter(r => r.b === 'in_progress').length, closed: tk.filter(r => r.b === 'completed').length },
    recent_users: users.slice(0, 5), utilisation: { users: act, fms: procs, recurring: recs, boards: visibleBoards(u).length, tickets: tk.length } };
}));
app.get('/api/settings', auth, wrap(() => ({ bench_done: Number(getSetting('bench_done', '85')), bench_ontime: Number(getSetting('bench_ontime', '85')), fy_start: Number(getSetting('fy_start', '4')), weekly_off: String(getSetting('weekly_off', '0')).split(',').filter(x => x !== '').map(Number), purge_days: Number(getSetting('purge_days', '0')) })));
app.put('/api/settings', auth, wrap(req => {
  if (req.user.role !== 'admin') fail(403, 'Only the admin can change settings'); const b = req.body, ch = [];
  const pct = (k, v, label) => { const n = Number(v); if (!(n >= 0 && n <= 100)) fail(400, label + ' must be between 0 and 100'); setSetting(k, n); ch.push(`${label} ${n}%`); };
  if ('bench_done' in b) pct('bench_done', b.bench_done, 'Work-done benchmark'); if ('bench_ontime' in b) pct('bench_ontime', b.bench_ontime, 'On-time benchmark');
  if ('fy_start' in b) { const n = Number(b.fy_start); if (!(n >= 1 && n <= 12)) fail(400, 'Choose a month'); setSetting('fy_start', n); ch.push('financial year starts in month ' + n); }
  if (Array.isArray(b.weekly_off)) { setSetting('weekly_off', b.weekly_off.map(Number).filter(n => n >= 0 && n <= 6).join(',')); ch.push('weekly off days'); }
  let purged = null;
  if ('purge_days' in b) {
    const n = Math.floor(Number(b.purge_days) || 0); if (n !== 0 && n < 7) fail(400, 'Choose 0 (never delete) or at least 7 days');
    const was = Number(getSetting('purge_days', '0')); setSetting('purge_days', n); if (n !== was) { ch.push(n ? `completed work is deleted after ${n} days` : 'completed work is kept forever'); setSetting('purge_last', ''); }
    if (n) { purged = P.purgeOld(n); setSetting('purge_last', L.todayStr()); if (purged && n !== was) ch.push(`removed now: ${purged.recurring} checklist, ${purged.tickets} ticket, ${purged.delegation} delegation, ${purged.process} process`); }
  }
  if (ch.length) audit(req.user, 'Settings changed', null, ch.join('; ')); return { ok: true, purged };
}));

// Admin / process-coordination reports cover everything, so the answer is reused for 45 seconds instead of recomputed on every click.
const _rc = new Map();
const reportCache = (req, res, next) => {
  if (req.method !== 'GET' || !(req.user.role === 'admin' || req.user.role === 'pc')) return next();
  const k = req.user.id + '|' + req.originalUrl, hit = _rc.get(k);
  if (hit && Date.now() - hit.t < 45000) return res.json(hit.v);
  const send = res.json.bind(res);
  res.json = body => { if (res.statusCode === 200) { _rc.set(k, { t: Date.now(), v: body }); if (_rc.size > 200) _rc.delete(_rc.keys().next().value); } return send(body); };
  next();
};
app.get('/api/report', auth, reportCache, wrap(req => {
  genSoon();
  const u = req.user, q = req.query, per = W.periodRange(q.period || 'month', q.from, q.to), carried = q.carried === '1';
  const ds = csvNums(q.dept), type = ['tickets', 'recurring', 'delegation', 'process'].includes(q.type) ? q.type : '', pid = num(q.process), person = num(q.person);
  const scope = W.makeScope(u, boardIdsOf(u)), udept = Object.fromEntries(db.prepare('SELECT id,dept_id,name FROM users').all().map(x => [x.id, x]));
  const pick = rows => rows.filter(r => r.b && r.b !== 'archived' && scope(r) && (!ds.length || ds.includes(r.dept)) && (!type || r.mod === type) && (!pid || (r.mod === 'process' && r.pid === pid)) && (!person || r.doer === person));
  const cur = pick(W.loadWork(u, { from: per.from, to: per.to, carried })), prev = pick(W.loadWork(u, { from: per.prevFrom, to: per.prevTo }));
  const A = W.agg(cur), P = W.agg(prev), bench = { done: Number(getSetting('bench_done', '85')), ontime: Number(getSetting('bench_ontime', '85')) };
  const delta = (a, b) => a == null || b == null ? null : W.round1(a - b);
  const names = Object.fromEntries(db.prepare('SELECT id,name FROM departments').all().map(d => [d.id, d.name]));
  const LBL = { tickets: 'Help Tickets', recurring: 'Recurring', delegation: 'Delegation', process: 'Process (FMS)' };
  const modules = Object.keys(LBL).map(m => ({ mod: m, label: LBL[m], ...W.agg(cur.filter(r => r.mod === m)) }));
  modules.forEach(m => { m.met = m.pctDone != null && m.pctDone >= bench.done; });
  const live = modules.filter(m => m.assigned > 0), group = (key, fn) => { const g = {}; cur.forEach(r => { const k = key(r); (g[k] = g[k] || []).push(r); }); return Object.entries(g).map(([k, v]) => ({ k, ...W.agg(v), ...fn(k) })); };
  const byDept = group(r => r.dept || 0, k => ({ name: names[k] || 'No department' })).sort((a, b) => b.assigned - a.assigned);
  let byPerson = group(r => r.doer || 0, k => ({ name: (udept[k] || {}).name || 'Unassigned', dept: names[(udept[k] || {}).dept_id] || '—', dept_id: (udept[k] || {}).dept_id }));
  if (u.role === 'hod') byPerson = byPerson.filter(p => p.dept_id === u.dept_id); else if (u.role === 'member') byPerson = byPerson.filter(p => +p.k === u.id);
  byPerson.sort((a, b) => b.assigned - a.assigned);
  const seen = new Set(cur.map(r => r.dept)), deptName = u.dept_id ? names[u.dept_id] : null, today = todayStr();
  // ---- weekly history (last 10 weeks, same filters) → trend chart, streaks, sparklines
  const isoWeek = ds => { const d = L.parseD(ds); d.setDate(d.getDate() + 4 - (d.getDay() || 7)); const y0 = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}/${Math.ceil(((d - y0) / 864e5 + 1) / 7)}`; };
  const weeks = Array.from({ length: 10 }, (_, i) => { const [a, b] = L.weekRange(i - 9); return { from: a, end: b, label: isoWeek(a) }; });
  const wkRows = pick(W.loadWork(u, { from: weeks[0].from, to: today }));
  const bucket = rows => { const out = weeks.map(() => []); rows.forEach(r => { const i = weeks.findIndex(x => r.due >= x.from && r.due <= x.end); if (i >= 0) out[i].push(r); }); return out; };
  const weekly = bucket(wkRows).map((rs, i) => ({ week: weeks[i].label, from: weeks[i].from, to: weeks[i].end < today ? weeks[i].end : today, ...W.agg(rs) }));
  const metWeek = x => x.assigned > 0 ? (x.pctDone >= bench.done && (x.completed === 0 || x.pctOnTime >= bench.ontime)) : null;
  const streaks = Object.keys(LBL).map(m => {
    const bk = bucket(wkRows.filter(r => r.mod === m)).map((rs, i) => ({ week: weeks[i].label, ...W.agg(rs) })), closed = bk.slice(0, -1), all = bk.filter(x => x.assigned > 0), tot = W.agg(wkRows.filter(r => r.mod === m));
    let curS = 0; for (let i = closed.length - 1; i >= 0; i--) { const v = metWeek(closed[i]); if (v === null) continue; if (v) curS++; else break; }
    let best = 0, run = 0; closed.forEach(x => { const v = metWeek(x); if (v === null) return; run = v ? run + 1 : 0; best = Math.max(best, run); });
    const fail = [...closed].reverse().find(x => metWeek(x) === false);
    return { mod: m, label: LBL[m], active: all.length > 0, current: curS, best, status: !all.length ? 'none' : curS > 0 ? 'on_track' : (fail || metWeek(bk[bk.length - 1]) === false) ? 'broken' : 'on_track', onTimePct: tot.pctOnTime, donePct: tot.pctDone, broke: fail ? { week: fail.week, late: fail.late, notDone: fail.notDone } : null };
  });
  // ---- score by department (department × module), with a sparkline and the people inside
  const prevBy = (rows, keyFn) => { const g = {}; rows.forEach(r => { const k = keyFn(r); (g[k] = g[k] || []).push(r); }); return g; };
  const prevDept = prevBy(prev, r => r.dept || 0), prevPers = prevBy(prev, r => r.doer || 0), curDeptRows = prevBy(cur, r => r.dept || 0);
  const personRows = prevBy(cur, r => r.doer || 0);
  const mkPerson = (id) => { const rs = personRows[id] || [], a = W.agg(rs), pa = W.agg(prevPers[id] || []), usr = udept[id] || {}; return { id: +id, name: usr.name || 'Unassigned', dept: names[usr.dept_id] || '—', dept_id: usr.dept_id || null, ...a, dDone: delta(a.pctDone, pa.pctDone), dOn: delta(a.pctOnTime, pa.pctOnTime), dOverall: delta(a.overall, pa.overall) }; };
  const canSeePerson = p => u.role === 'admin' || u.role === 'pc' || (u.role === 'hod' ? p.dept_id === u.dept_id : p.id === u.id);
  const people = Object.keys(personRows).map(mkPerson).filter(canSeePerson);
  const deptMatrix = Object.entries(curDeptRows).map(([k, rs]) => {
    const A2 = W.agg(rs), pa = W.agg(prevDept[k] || []), mods = {}; Object.keys(LBL).forEach(m => { const x = W.agg(rs.filter(r => r.mod === m)); mods[m] = { assigned: x.assigned, pctDone: x.pctDone, pctOnTime: x.pctOnTime, overall: x.overall }; });
    return { k, name: names[k] || 'No department', members: new Set(rs.map(r => r.doer).filter(Boolean)).size, assigned: A2.assigned, overall: A2.overall, pctDone: A2.pctDone, pctOnTime: A2.pctOnTime, delta: delta(A2.overall, pa.overall), mods,
      trend: bucket(wkRows.filter(r => String(r.dept || 0) === String(k))).map(x => W.agg(x).overall), people: people.filter(p => String(p.dept_id || 0) === String(k)).sort((a, b) => b.assigned - a.assigned) };
  }).sort((a, b) => b.assigned - a.assigned);
  // ---- leaderboard
  const rank = (key, dKey) => { const L2 = people.filter(p => p[key] != null).sort((x, y) => y[key] - x[key] || y.assigned - x.assigned), n = L2.length, mk = p => ({ id: p.id, name: p.name, dept: p.dept, assigned: p.assigned, completed: p.completed, score: p[key], delta: p[dKey] });
    const nt = Math.min(10, Math.ceil(n / 2)), nb = Math.min(10, Math.floor(n / 2)); return { top: L2.slice(0, nt).map(mk), bottom: nb ? L2.slice(-nb).reverse().map(mk) : [] }; };
  const leaders = { overall: rank('overall', 'dOverall'), done: rank('pctDone', 'dDone'), ontime: rank('pctOnTime', 'dOn') };
  return { scope: W.scopeInfo(u, deptName), period: per, carried, bench, workDone: { ...A, prevPct: P.pctDone, delta: delta(A.pctDone, P.pctDone), gap: A.pctDone == null ? null : W.round1(A.pctDone - bench.done) },
    onTime: { ...A, prevPct: P.pctOnTime, delta: delta(A.pctOnTime, P.pctOnTime), gap: A.pctOnTime == null ? null : W.round1(A.pctOnTime - bench.ontime) }, overall: { value: A.overall, prev: P.overall, delta: delta(A.overall, P.overall) },
    streak: { live: live.length, met: live.filter(m => m.met).length, broken: live.filter(m => !m.met).map(m => m.label) }, modules, byDept, byPerson: byPerson.slice(0, 100), weekly, streaks, deptMatrix, leaders,
    deptOptions: [...seen].filter(Boolean).map(id => ({ id, name: names[id] })).sort((a, b) => a.name.localeCompare(b.name)),
    processOptions: visibleProcesses(u).map(p => ({ id: p.id, name: p.name })) };
}));

M_mount(app);
require('./workbook')(app);          // must come before the generic /api/import/:type routes
require('./importer')(app);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 3000;
M.startScheduler();
genInstances();
try { P.purgeIfDue(); } catch (e) { console.error(e); }
setInterval(() => { try { genInstances(); P.purgeIfDue(); db.exec('PRAGMA optimize'); } catch (e) { console.error(e); } }, 60 * 60 * 1000);
try { db.exec('PRAGMA optimize'); } catch {}
app.listen(PORT, () => console.log(`\n  Department Hub is running →  http://localhost:${PORT}\n`));
