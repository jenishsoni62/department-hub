'use strict';
// Excel / CSV import: upload → preview with auto-matched columns → confirm mapping → import
const multer = require('multer'), XLSX = require('xlsx'), bcrypt = require('bcryptjs');
const C = require('./core');
const { db, L, audit, fail, wrap, num, flag, auth, canEdit, ensureLookup, genInstances, stepRows, createEntry, completeStep } = C;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const FREQ = { daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', quarterly: 'Quarterly', halfyearly: 'Half-yearly', biannual: 'Half-yearly', yearly: 'Yearly', annually: 'Yearly', once: 'Once', onetime: 'Once', d: 'Daily', w: 'Weekly', f: 'Fortnightly', m: 'Monthly', q: 'Quarterly', h: 'Half-yearly', y: 'Yearly', o: 'Once' };
const PRIO = { high: 'High', medium: 'Medium', low: 'Low', urgent: 'High', normal: 'Medium' };

function cell(v) {
  if (v instanceof Date) {
    const sec = v.getHours() * 3600 + v.getMinutes() * 60 + v.getSeconds();
    if (sec < 120 || sec > 86400 - 120) return L.fmtDate(new Date(v.getTime() + 12 * 36e5));   // date only (absorbs SheetJS timezone drift)
    return L.fmtDate(v) + ' ' + L.pad(v.getHours()) + ':' + L.pad(v.getMinutes());
  }
  return String(v ?? '').trim();
}
function readSheet(buf, name) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.includes(name) ? name : wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).map(r => r.map(cell)).filter(r => r.some(x => x !== ''));
  return { rows, sheets: wb.SheetNames };
}
function lookupMaps() {
  const users = db.prepare('SELECT id,name,emp_code,email,dept_id,role FROM users WHERE active=1').all(), depts = db.prepare('SELECT id,name FROM departments').all();
  const uMap = new Map(), dMap = new Map();
  users.forEach(u => { [u.emp_code, u.email, u.name].forEach(k => k && uMap.set(String(k).toLowerCase().trim(), u)); });
  depts.forEach(d => dMap.set(d.name.toLowerCase().trim(), d));
  return { user: s => uMap.get(String(s || '').toLowerCase().trim()), dept: s => dMap.get(String(s || '').toLowerCase().trim()) };
}
const f = (key, label, required, aliases = []) => ({ key, label, required: !!required, aliases });

const TYPES = {
  users: {
    label: 'Users', desc: 'Add many employees at once (default password: welcome123).',
    fields: () => [f('name', 'Name', 1, ['employeename', 'fullname']), f('emp_code', 'Employee code', 0, ['empcode', 'employeeid', 'empid', 'code']), f('email', 'Email', 0, ['mail', 'emailid']), f('department', 'Department', 0, ['dept']), f('role', 'Role (member/hod/pc)', 0), f('password', 'Password', 0)],
    example: ['Asha Verma', 'EMP101', 'asha@company.com', 'Sales', 'member', ''],
    run(rows, g, u, ctx) {
      const out = ctx.out;
      rows.forEach(r => ctx.row(r, () => {
        if (!(u.role === 'admin' || u.role === 'hod')) fail(403, 'Only admin/HOD can import users');
        const name = g(r, 'name'); if (!name) fail(400, 'Name is missing');
        let dept = g(r, 'department') ? ctx.m.dept(g(r, 'department')) : null; if (g(r, 'department') && !dept) fail(400, `Unknown department “${g(r, 'department')}”`);
        let role = ['member', 'hod', 'pc'].includes(g(r, 'role').toLowerCase()) ? g(r, 'role').toLowerCase() : 'member';
        if (u.role === 'hod') { dept = { id: u.dept_id }; role = 'member'; }
        const email = g(r, 'email').toLowerCase() || null, code = g(r, 'emp_code') || null;
        if (db.prepare('SELECT 1 FROM users WHERE (email IS NOT NULL AND email=?) OR (emp_code IS NOT NULL AND emp_code=?)').get(email, code)) fail(400, 'User already exists (same email / code)');
        const nid = db.prepare('INSERT INTO users(emp_code,name,email,password_hash,role,dept_id) VALUES(?,?,?,?,?,?)').run(code, name, email, bcrypt.hashSync(g(r, 'password') || 'welcome123', 10), role, dept ? dept.id : null).lastInsertRowid;
        audit(u, 'User created', { id: nid, email, name }, 'Excel import');
        out.created++;
      }));
    },
  },
  recurring: {
    label: 'Recurring tasks (Checklist)', desc: 'Create daily / weekly / monthly checklist tasks for your team.',
    fields: () => [f('department', 'Department', 1, ['dept', 'doerdepartment']), f('doer', 'Doer (name / emp code / email)', 1, ['doername', 'assignedto', 'responsible', 'employee', 'empcode', 'name']), f('category', 'Category', 0), f('frequency', 'Frequency', 1, ['freq', 'taskfrequency']),
      f('start_date', 'Start date', 1, ['start', 'from', 'startdate']), f('end_date', 'End date', 0, ['end', 'to', 'till', 'enddate']), f('description', 'Task description', 1, ['task', 'checklist', 'checklistitem', 'activity', 'description']), f('priority', 'Priority', 0), f('reviewer', 'Reviewer', 0, ['checker', 'reviewedby'])],
    example: ['Accounts', 'EMP101', 'Accounting', 'Daily', '2026-10-06', '', 'Daily cash & expense entry', 'Medium', ''],
    run(rows, g, u, ctx) {
      rows.forEach(r => ctx.row(r, () => {
        const dept = ctx.m.dept(g(r, 'department')); if (!dept) fail(400, `Unknown department “${g(r, 'department')}”`);
        if (!canEdit(u, dept.id, 'recurring')) fail(403, `You don't have editor access in ${dept.name}`);
        const doer = ctx.m.user(g(r, 'doer')); if (!doer) fail(400, `Doer “${g(r, 'doer')}” not found`);
        const fr = FREQ[norm(g(r, 'frequency'))]; if (!fr) fail(400, `Unknown frequency “${g(r, 'frequency')}”`);
        const sd = L.parseDateOnly(g(r, 'start_date')); if (!sd) fail(400, `Invalid start date “${g(r, 'start_date')}”`);
        const ed = g(r, 'end_date') ? L.parseDateOnly(g(r, 'end_date')) : null; if (g(r, 'end_date') && !ed) fail(400, 'Invalid end date');
        if (!g(r, 'description')) fail(400, 'Task description is missing');
        const rev = g(r, 'reviewer') ? ctx.m.user(g(r, 'reviewer')) : null;
        db.prepare('INSERT INTO rec_tasks(dept_id,doer_id,category,frequency,start_date,end_date,description,reviewer_id,priority,created_by,gen_from) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(dept.id, doer.id, g(r, 'category') || null, fr, sd, ed, g(r, 'description'), rev ? rev.id : null, PRIO[norm(g(r, 'priority'))] || 'Medium', u.id, sd > L.todayStr() ? sd : L.todayStr());
        ensureLookup('category', g(r, 'category')); ctx.out.created++;
      }));
      genInstances();
    },
  },
  delegation: {
    label: 'Delegation tasks', desc: 'Bring delegated tasks into boards. Missing boards are created for you.',
    fields: () => [f('board', 'Board / Project', 1, ['project', 'boardname', 'group']), f('title', 'Task', 1, ['task', 'taskdescription', 'title']), f('assigned_to', 'Assigned to', 1, ['doer', 'doername', 'responsible', 'assignee']), f('due_date', 'Due date', 0, ['duedate', 'deadline', 'target', 'planned']),
      f('priority', 'Priority', 0), f('description', 'Details', 0, ['remarks', 'notes']), f('status', 'Status', 0)],
    example: ['Production work', 'Prepare weekly output report', 'EMP101', '2026-10-10', 'High', '', 'Not Started'],
    run(rows, g, u, ctx) {
      if (u.role === 'pc') fail(403, 'View-only account');
      const boards = new Map(db.prepare('SELECT * FROM boards').all().map(b => [b.name.toLowerCase(), b]));
      const stMap = { notstarted: 'not_started', open: 'not_started', pending: 'not_started', inprogress: 'in_progress', underreview: 'under_review', done: 'done', completed: 'done', closed: 'done', hold: 'hold', onhold: 'hold' };
      rows.forEach(r => ctx.row(r, () => {
        const bn = g(r, 'board'); if (!bn) fail(400, 'Board is missing'); if (!g(r, 'title')) fail(400, 'Task is missing');
        let b = boards.get(bn.toLowerCase());
        if (!b) { const id = db.prepare('INSERT INTO boards(name,owner_id,sharing) VALUES(?,?,?)').run(bn, u.id, 'specific').lastInsertRowid; db.prepare('INSERT INTO board_members(board_id,user_id,level) VALUES(?,?,?)').run(id, u.id, 'editor'); b = { id, name: bn, owner_id: u.id, dept_id: null }; boards.set(bn.toLowerCase(), b); }
        else if (!(u.role === 'admin' || b.owner_id === u.id || (b.dept_id && canEdit(u, b.dept_id, 'delegation')) || db.prepare("SELECT 1 FROM board_members WHERE board_id=? AND user_id=? AND level='editor'").get(b.id, u.id))) fail(403, `No editor access on board “${bn}”`);
        const to = g(r, 'assigned_to') ? ctx.m.user(g(r, 'assigned_to')) : u; if (!to) fail(400, `Person “${g(r, 'assigned_to')}” not found`);
        const due = g(r, 'due_date') ? L.parseDateOnly(g(r, 'due_date')) : null; if (g(r, 'due_date') && !due) fail(400, `Invalid date “${g(r, 'due_date')}”`);
        const st = stMap[norm(g(r, 'status'))] || 'not_started';
        db.prepare('INSERT INTO del_tasks(board_id,title,description,assigned_to,created_by,due_date,priority,status,closed_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(b.id, g(r, 'title'), g(r, 'description') || null, to.id, u.id, due, PRIO[norm(g(r, 'priority'))] || 'Medium', st, st === 'done' ? L.nowStr() : null);
        db.prepare('INSERT OR IGNORE INTO board_members(board_id,user_id,level) VALUES(?,?,?)').run(b.id, to.id, 'editor'); ctx.out.created++;
      }));
    },
  },
  tickets: {
    label: 'Help tickets', desc: 'Load existing issues / requests as help tickets.',
    fields: () => [f('department', 'Doer department', 1, ['dept']), f('doer', 'Doer', 0, ['assignedto', 'doername', 'responsible']), f('issue_type', 'Issue type', 0, ['tasktype', 'type', 'category']), f('description', 'Description', 1, ['task', 'taskdescription', 'issue']),
      f('due_date', 'Due date', 1, ['duedate', 'deadline']), f('priority', 'Priority', 0), f('reviewer', 'Reviewer', 0)],
    example: ['IT', 'EMP101', 'IT Support', 'Laptop not connecting to WiFi', '2026-10-08', 'Medium', ''],
    run(rows, g, u, ctx) {
      if (u.role === 'pc') fail(403, 'View-only account');
      rows.forEach(r => ctx.row(r, () => {
        const dept = ctx.m.dept(g(r, 'department')); if (!dept) fail(400, `Unknown department “${g(r, 'department')}”`);
        const doer = g(r, 'doer') ? ctx.m.user(g(r, 'doer')) : null; if (g(r, 'doer') && !doer) fail(400, `Doer “${g(r, 'doer')}” not found`);
        const due = L.parseDateOnly(g(r, 'due_date')); if (!due) fail(400, `Invalid due date “${g(r, 'due_date')}”`); if (!g(r, 'description')) fail(400, 'Description is missing');
        const rev = g(r, 'reviewer') ? ctx.m.user(g(r, 'reviewer')) : null;
        db.prepare('INSERT INTO tickets(dept_id,created_by,doer_id,issue_type,reviewer_id,due_date,description,priority) VALUES(?,?,?,?,?,?,?,?)').run(dept.id, u.id, doer ? doer.id : null, g(r, 'issue_type') || null, rev ? rev.id : null, due, g(r, 'description'), PRIO[norm(g(r, 'priority'))] || 'Medium');
        ensureLookup('issue_type', g(r, 'issue_type')); ctx.out.created++;
      }));
    },
  },
  fms_entries: {
    label: 'FMS entries (bulk create)', desc: 'Create many process entries at once, e.g. new orders or enquiries.', needsProcess: true,
    fields: p => [f('title', 'Entry title / Customer name', 0, ['customername', 'name', 'customer', 'title']), ...JSON.parse(p.fields || '[]').map(x => f(x.key, x.label, 0)), f('started_at', 'Start date (optional)', 0, ['startdate', 'date'])],
    example: p => ['Sourav', ...JSON.parse(p.fields || '[]').map(x => x.type === 'date' ? '2026-10-09' : x.type === 'number' ? '100' : 'Sample'), ''],
    run(rows, g, u, ctx) {
      const p = ctx.process, steps = stepRows(p.id), fields = JSON.parse(p.fields || '[]');
      if (!(canEdit(u, p.dept_id, 'fms') || (steps[0] && steps[0].doer_id === u.id))) fail(403, 'You cannot add entries to this process');
      rows.forEach(r => ctx.row(r, () => {
        const data = {}; fields.forEach(x => { let v = g(r, x.key); if (v && x.type === 'date') v = L.parseDateOnly(v) || v; if (v && x.type === 'checkbox') v = /^(y|yes|true|1|x|✓)$/i.test(v) ? 'Yes' : 'No'; if (x.required && !v) fail(400, `“${x.label}” is required`); if (v) data[x.key] = v; });
        const st = g(r, 'started_at') ? L.parseDateTime(g(r, 'started_at')) : null; if (g(r, 'started_at') && !st) fail(400, 'Invalid start date');
        if (!g(r, 'title') && !Object.keys(data).length) fail(400, 'Row is empty');
        createEntry(p, steps, { title: g(r, 'title'), data, started_at: st ? st.ms : null }, u.id); ctx.out.created++;
      }));
    },
  },
  fms_done: {
    label: 'FMS bulk done', desc: 'Mark steps as completed from a sheet (Entry UID + step number).', needsProcess: true,
    fields: () => [f('uid', 'Entry UID', 1, ['entryuid', 'id']), f('step_no', 'Step number', 1, ['step', 'stepno']), f('completed_at', 'Completed on (optional)', 0, ['actual', 'actualdate', 'doneon']), f('remarks', 'Remarks', 0)],
    example: ['OTD-000001', '1', '', 'Done on call'],
    run(rows, g, u, ctx) {
      rows.forEach(r => ctx.row(r, () => {
        const es = db.prepare('SELECT es.*, p.dept_id FROM entry_steps es JOIN entries e ON e.id=es.entry_id JOIN processes p ON p.id=e.process_id WHERE e.uid=? AND e.process_id=? AND es.step_no=?').get(g(r, 'uid'), ctx.process.id, num(g(r, 'step_no')));
        if (!es) fail(400, `Entry ${g(r, 'uid')} step ${g(r, 'step_no')} not found in this process`);
        if (!(es.doer_id === u.id || canEdit(u, es.dept_id, 'fms'))) fail(403, 'Not allowed on this step');
        const t = g(r, 'completed_at') ? L.parseDateTime(g(r, 'completed_at')) : null; if (g(r, 'completed_at') && !t) fail(400, 'Invalid completed-on date');
        completeStep(es, t ? t.ms : Date.now(), g(r, 'remarks')); ctx.out.created++;
      }));
    },
  },
};

module.exports = function mount(app) {
  const prep = req => {
    const type = TYPES[req.params.type]; if (!type) fail(404, 'Unknown import type');
    if (req.user.role === 'pc') fail(403, 'View-only accounts cannot import data');
    let process = null;
    if (type.needsProcess) { process = db.prepare('SELECT * FROM processes WHERE id=?').get(num(req.query.process_id ?? req.body.process_id)); if (!process) fail(400, 'Choose a process first'); }
    return { type, process, fields: type.fields(process) };
  };
  app.get('/api/import/types', auth, wrap(req => ({
    types: Object.entries(TYPES).map(([key, t]) => ({ key, label: t.label, desc: t.desc, needsProcess: !!t.needsProcess })),
    processes: db.prepare('SELECT id,name,dept_id FROM processes ORDER BY name').all().filter(p => canEdit(req.user, p.dept_id, 'fms') || db.prepare('SELECT 1 FROM process_steps WHERE process_id=? AND doer_id=?').get(p.id, req.user.id)),
  })));
  app.get('/api/import/:type/template', auth, wrap((req, res) => {
    const { type, process, fields } = prep(req);
    const ex = typeof type.example === 'function' ? type.example(process) : type.example;
    const ws = XLSX.utils.aoa_to_sheet([fields.map(x => x.label + (x.required ? ' *' : '')), ex]);
    ws['!cols'] = fields.map(() => ({ wch: 24 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-template.xlsx"`);
    res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }));
  app.post('/api/import/:type/preview', auth, upload.single('file'), wrap(req => {
    const { fields } = prep(req); if (!req.file) fail(400, 'Choose a file first');
    let data; try { data = readSheet(req.file.buffer, req.body.sheet); } catch { fail(400, 'Could not read that file. Use .xlsx, .xls or .csv'); }
    if (data.rows.length < 2) fail(400, 'The file needs a header row and at least one data row');
    const headers = data.rows[0], mapping = {};
    fields.forEach(fl => {
      const keys = [fl.key, fl.label, ...fl.aliases].map(norm);
      let i = headers.findIndex(h => keys.includes(norm(h)));
      if (i < 0) i = headers.findIndex(h => norm(h) && keys.some(k => k.length > 3 && (norm(h).includes(k) || k.includes(norm(h)))));
      mapping[fl.key] = i;
    });
    return { fields: fields.map(({ key, label, required }) => ({ key, label, required })), headers, sample: data.rows.slice(1, 6), total: data.rows.length - 1, mapping, sheets: data.sheets };
  }));
  app.post('/api/import/:type/commit', auth, upload.single('file'), wrap(req => {
    const { type, process, fields } = prep(req); if (!req.file) fail(400, 'Choose a file first');
    const map = JSON.parse(req.body.mapping || '{}'), data = readSheet(req.file.buffer, req.body.sheet);
    for (const fl of fields) if (fl.required && !(map[fl.key] >= 0 && map[fl.key] !== '' && map[fl.key] != null)) fail(400, `Please match the “${fl.label}” column`);
    const body = data.rows.slice(1), out = { created: 0, errors: [], total: body.length };
    const g = (r, key) => { const i = map[key]; return (i === '' || i == null || i < 0) ? '' : String(r[i] ?? '').trim(); };
    const ctx = { out, process, m: lookupMaps(), row(r, fn) { try { fn(); } catch (e) { out.errors.push({ row: body.indexOf(r) + 2, message: e.message }); } } };
    db.transaction(() => type.run(body, g, req.user, ctx))();
    out.errors = out.errors.slice(0, 300); return out;
  }));
};
