'use strict';
// Smart import of whole Google-Sheet / Excel workbooks:  Checklist (Task List + Doer List + Master + Holiday List),
// Delegation (Doer List + Master) and FMS (What / Who / How / When rows + Planned / Actual / Status blocks).
// Upload → detect → preview what will be created → import.
const multer = require('multer'), XLSX = require('xlsx'), bcrypt = require('bcryptjs');
const C = require('./core');
const { db, L, audit, fail, wrap, num, auth, canEdit, genInstances, setSetting, getSetting, plannedAt } = C;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const txt = v => v instanceof Date ? (isNaN(v) ? '' : L.fmtDate(v)) : String(v ?? '').replace(/\s+/g, ' ').trim();
const FREQ = { d: 'Daily', daily: 'Daily', w: 'Weekly', weekly: 'Weekly', f: 'Fortnightly', fortnightly: 'Fortnightly', m: 'Monthly', monthly: 'Monthly', q: 'Quarterly', quarterly: 'Quarterly', h: 'Half-yearly', halfyearly: 'Half-yearly', y: 'Yearly', a: 'Yearly', yearly: 'Yearly', annually: 'Yearly', o: 'Once', once: 'Once' };
const nice = s => String(s).replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').replace(/^new\s*-\s*/i, '').replace(/\s*sheet\s*v?\d+(\.\d+)*$/i, '').replace(/\s+v?\d+(\.\d+)*$/i, '').trim()
  .split(' ').map(w => /^(fms|mis|pms|hr|it)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// date / date-time cells → { ms, date, dateOnly }
function dt(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    const sec = v.getHours() * 3600 + v.getMinutes() * 60 + v.getSeconds(), dateOnly = sec < 120 || sec > 86400 - 120;
    const date = dateOnly ? L.fmtDate(new Date(v.getTime() + 12 * 36e5)) : L.fmtDate(v);
    return { date, dateOnly, ms: dateOnly ? new Date(date + 'T00:00:00').getTime() : Math.round(v.getTime() / 1000) * 1000 };
  }
  const r = L.parseDateTime(v); return r ? { date: r.date, ms: r.ms, dateOnly: !/\d:\d/.test(String(v)) } : null;
}
const readBook = buf => XLSX.read(buf, { type: 'buffer', cellDates: true });
const sheetOf = (wb, n) => wb.SheetNames.find(x => norm(x) === norm(n));
const grid = (wb, n, blank = false) => { const s = sheetOf(wb, n); return s ? XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: null, blankrows: blank }) : null; };
// find the header row (within the first 8 rows) that contains all the wanted column names
function table(rows, need) {
  if (!rows) return null;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const h = rows[i].map(norm);
    if (need.every(n => h.some(x => x === norm(n) || x.startsWith(norm(n))))) {
      const pos = (...names) => { for (const n of names) { let j = h.findIndex(x => x === norm(n)); if (j < 0) j = h.findIndex(x => x.startsWith(norm(n))); if (j >= 0) return j; } return -1; };
      return { at: i, rows: rows.slice(i + 1), get: (r, ...names) => { const j = pos(...names); return j >= 0 ? r[j] : null; } };
    }
  }
  return null;
}

/* ---------------- detection ---------------- */
function detect(wb) {
  if (sheetOf(wb, 'Task List') && sheetOf(wb, 'Doer List')) return 'checklist';
  const m = table(grid(wb, 'Master'), ['task id', 'name', 'task']);
  if (m && sheetOf(wb, 'Doer List') && grid(wb, 'Master')[m.at].some(h => /latest\s*revision/i.test(String(h || '')))) return 'delegation';
  const f = grid(wb, 'FMS', true);
  if (f && f.slice(0, 10).some(r => norm(r[0]) === 'what') && f.slice(0, 10).some(r => norm(r[0]) === 'who')) return 'fms';
  return null;
}

/* ---------------- parsing ---------------- */
function parseChecklist(wb) {
  const out = { doers: [], tasks: [], holidays: [], history: [], settings: {} };
  const D = table(grid(wb, 'Doer List'), ['name', 'department']);
  if (D) for (const r of D.rows) { const name = txt(D.get(r, 'name')); if (name) out.doers.push({ name, dept: txt(D.get(r, 'department')), email: txt(D.get(r, 'email address', 'email')).toLowerCase(), phone: txt(D.get(r, 'extention number', 'extension number', 'extension')) }); }
  const T = table(grid(wb, 'Task List'), ['task', 'doer name', 'frequency']);
  if (T) for (const r of T.rows) {
    const task = txt(T.get(r, 'task')); if (!task) continue;
    const fr = txt(T.get(r, 'frequency')), start = dt(T.get(r, 'day/date', 'day date', 'date', 'start'));
    out.tasks.push({ task, doer: txt(T.get(r, 'doer name', 'doer')), dept: txt(T.get(r, 'department')), freqRaw: fr, freq: FREQ[norm(fr)] || null, start: start ? start.date : null });
  }
  const H = table(grid(wb, 'Holiday List'), ['date', 'holiday']);
  if (H) for (const r of H.rows) { const d = dt(H.get(r, 'date')); const name = txt(H.get(r, 'holiday')); if (d && name) out.holidays.push({ date: d.date, name, kind: /^r/i.test(txt(H.get(r, 'type'))) ? 'RH' : 'GH' }); }
  const M = table(grid(wb, 'Master'), ['name', 'task', 'planned']);
  if (M) for (const r of M.rows) {
    const name = txt(M.get(r, 'name')), task = txt(M.get(r, 'task')), pl = dt(M.get(r, 'planned')); if (!name || !task || !pl) continue;
    const act = dt(M.get(r, 'actual')), st = txt(M.get(r, 'status'));
    out.history.push({ name, task, planned: pl.date, actual: act, done: /^done$/i.test(st) || !!act });
  }
  const S = grid(wb, 'Setup Sheet');
  if (S) S.forEach((r, ri) => r.forEach((c, ci) => {
    const k = txt(c).toLowerCase(), next = r.slice(ci + 1).find(v => v != null && v !== '');
    if (k.startsWith('time of day') && next != null) { const n = Number(next); if (n >= 0 && n <= 23) out.settings.reminder_hour = n; }
    if (k.startsWith('skip sundays')) { const v = next != null ? next : (S[ri + 1] || []).find(x => /^(yes|no|true|false)$/i.test(txt(x))); if (v != null) out.settings.skip_sundays = /yes|true/i.test(txt(v)); }
  }));
  return out;
}
function parseDelegation(wb) {
  const out = { doers: [], tasks: [] };
  const D = table(grid(wb, 'Doer List'), ['name']);
  if (D) for (const r of D.rows) { const name = txt(D.get(r, 'name')); if (name) out.doers.push({ name, phone: txt(D.get(r, 'number', 'phone')).replace(/\.0$/, ''), email: txt(D.get(r, 'email')).toLowerCase() }); }
  const M = table(grid(wb, 'Master'), ['task id', 'name', 'task']);
  if (M) for (const r of M.rows) {
    const task = txt(M.get(r, 'task')); if (!task) continue;
    const label = txt(M.get(r, 'name')), first = dt(M.get(r, 'first date')), latest = dt(M.get(r, 'latest revision')), r1 = dt(M.get(r, 'revision 1')), r2 = dt(M.get(r, 'revision 2'));
    out.tasks.push({ ext: txt(M.get(r, 'task id')), label, person: label.split(' - ')[0].trim(), task, first: first && first.date, r1: r1 && r1.date, r2: r2 && r2.date, due: (latest || first || {}).date || null, revisions: Number(M.get(r, 'total revisions')) || 0, done: /^(completed|done|closed)$/i.test(txt(M.get(r, 'status'))) });
  }
  return out;
}
const timeOf = v => { if (v instanceof Date) return L.pad(v.getHours()) + ':' + L.pad(v.getMinutes()); const m = String(v ?? '').match(/(\d{1,2}):(\d{2})/); return m ? L.pad(+m[1]) + ':' + m[2] : null; };
function parseFms(wb) {
  const g = grid(wb, 'FMS', true), at = k => g.slice(0, 12).findIndex(r => norm(r[0]) === k);
  const rWhat = at('what'), rWho = at('who'), rHow = at('how'), rWhen = at('when');
  let rHdr = -1; for (let i = Math.max(rWhen, 0) + 1; i < Math.min(g.length, 14); i++) if (g[i].some(v => norm(v) === 'planned')) { rHdr = i; break; }
  if (rWhat < 0 || rHdr < 0) fail(400, 'This FMS sheet does not look like the standard layout (What / Who / How / When rows, then Planned / Actual / Status columns).');
  const hdr = g[rHdr], planned = hdr.map((v, i) => norm(v) === 'planned' ? i : -1).filter(i => i >= 0), firstP = planned[0];
  const fields = []; for (let j = 1; j < firstP; j++) { const label = txt(hdr[j]); if (label) fields.push({ col: j, label }); }
  const steps = planned.map(c => {
    const when = txt(g[rWhen][c]), m = when.match(/(\d{1,2}):(\d{2})\s*\(\s*\+?\s*(\d+)\s*days?\s*\)/i);
    return { col: c, name: txt(g[rWhat][c]) || 'Step', who: txt(g[rWho][c]), how: txt(g[rHow] ? g[rHow][c] : ''), when, due_time: m ? L.pad(+m[1]) + ':' + m[2] : null, tat: m ? +m[3] : 1 };
  });
  const rows = [];
  for (let i = rHdr + 1; i < g.length; i++) {
    const r = g[i]; if (!r.some(v => v != null && v !== '')) continue;
    const ts = dt(r[0]), vals = fields.map(f => r[f.col]); if (!ts && !vals.some(v => v != null && v !== '')) continue;
    rows.push({ ts, vals, steps: steps.map(s => ({ planned: snap(dt(r[s.col])), actual: dt(r[s.col + 1]), status: txt(r[s.col + 2]) })) });
  }
  const cfg = {}, C0 = grid(wb, 'Config');
  if (C0) for (const r of C0) { const k = norm(r[1]); if (k.startsWith('openingtime')) cfg.open = timeOf(r[0]); if (k.startsWith('closingtime')) cfg.close = timeOf(r[0]); if (k.startsWith('workingdays')) cfg.days = txt(r[0]); }
  return { fields, steps, rows, cfg };
}
const guessType = label => /date|time/i.test(label) ? 'date' : /quantity|qty|\bkg\b|sqm|price|amount|weight|rate|value|total/i.test(label) ? 'number' : 'text';
const snap = d => d && !d.dateOnly ? { ...d, ms: Math.round(d.ms / 6e4) * 6e4 } : d;
const hhmm = v => L.pad(v.getHours()) + ':' + L.pad(v.getMinutes());
const cellVal = (v, type) => { if (v == null || v === '') return ''; if (v instanceof Date) { const d = dt(v); return type === 'date' || d.dateOnly ? d.date : d.date + ' ' + hhmm(v); } return typeof v === 'number' ? String(Math.round(v * 1e4) / 1e4) : String(v).trim(); };

/* ---------------- people / department helpers ---------------- */
function people() {
  const all = db.prepare('SELECT id,name,email,phone,dept_id,notify_email FROM users').all(), byName = new Map(), byEmail = new Map(), byPhone = new Map();
  all.forEach(u => { byName.set(norm(u.name), u); if (u.email) byEmail.set(u.email.toLowerCase(), u); if (u.notify_email) byEmail.set(u.notify_email.toLowerCase(), u); if (u.phone) byPhone.set(String(u.phone).replace(/\D/g, ''), u); });
  return { all, byName, byEmail, byPhone };
}
const guessPerson = (P, text) => { const t = String(text || ''), full = P.byName.get(norm(t)); if (full) return full; const first = norm(t.split(/\s+-\s+|[/,]/)[0]); return first ? (P.all.find(u => norm(u.name) === first) || P.all.find(u => first.length > 2 && norm(u.name).startsWith(first)) || null) : null; };

/* ---------------- preview ---------------- */
function preview(buf, fileName) {
  const wb = readBook(buf), kind = detect(wb);
  if (!kind) fail(400, 'I could not recognise this workbook. It should be your Checklist sheet (Task List + Doer List), Delegation sheet (Doer List + Master) or FMS sheet (What / Who / How / When rows). For other files use the column-matching imports below.');
  const P = people(), depts = new Set(db.prepare('SELECT name FROM departments').all().map(d => norm(d.name))), today = L.todayStr(), horizon = L.addDays(today, 14), out = { kind, fileName, warnings: [] };
  if (kind === 'checklist') {
    const x = parseChecklist(wb), known = new Set(x.doers.map(d => norm(d.name)));
    const extra = [...new Set([...x.tasks.map(t => t.doer), ...x.history.map(h => h.name)].filter(n => n && !known.has(norm(n))))];
    const byFreq = {}; x.tasks.forEach(t => { const k = t.freq || '❓ ' + t.freqRaw; byFreq[k] = (byFreq[k] || 0) + 1; });
    const taskKeys = new Set(x.tasks.map(t => norm(t.doer) + '|' + norm(t.task)));
    const hist = x.history, past = hist.filter(h => h.planned <= horizon);
    out.checklist = { doers: x.doers.length + extra.length, doersExisting: x.doers.filter(d => (d.email && P.byEmail.has(d.email)) || P.byName.has(norm(d.name))).length, doersNoEmail: x.doers.filter(d => !d.email).length + extra.length, extraNames: extra,
      departments: [...new Set([...x.doers.map(d => d.dept), ...x.tasks.map(t => t.dept)].filter(Boolean))].map(n => ({ name: n, exists: depts.has(norm(n)) })),
      tasks: x.tasks.length, byFreq, holidays: x.holidays.length, rh: x.holidays.filter(h => h.kind === 'RH').length, gh: x.holidays.filter(h => h.kind === 'GH').length,
      history: { total: hist.length, importable: past.length, done: past.filter(h => h.done).length, pending: past.filter(h => !h.done).length, future: hist.length - past.length, unmatched: past.filter(h => !taskKeys.has(norm(h.name) + '|' + norm(h.task))).length },
      settings: x.settings, sample: x.tasks.slice(0, 5) };
    if (x.tasks.some(t => !t.freq)) out.warnings.push('Some tasks have a frequency code I do not know – they will be skipped and listed after the import.');
    if (x.tasks.some(t => !t.start)) out.warnings.push('Some tasks have no start date – they will be skipped.');
  } else if (kind === 'delegation') {
    const x = parseDelegation(wb);
    out.delegation = { doers: x.doers.length, doersExisting: x.doers.filter(d => (d.email && P.byEmail.has(d.email)) || P.byName.has(norm(d.name))).length, tasks: x.tasks.length, done: x.tasks.filter(t => t.done).length, open: x.tasks.filter(t => !t.done).length, revised: x.tasks.filter(t => t.revisions > 0).length,
      people: [...new Set(x.tasks.map(t => t.person))], boardName: nice(fileName) || 'Delegation', sample: x.tasks.slice(0, 5) };
  } else {
    const x = parseFms(wb), started = x.rows.filter(r => r.steps.some(s => s.status || s.actual)), fully = x.rows.filter(r => r.steps.every(s => /^done$/i.test(s.status) || s.actual));
    const whos = [...new Set(x.steps.map(s => s.who).filter(Boolean))].map(w => { const g = guessPerson(P, w); const parts = w.split(/\s+-\s+/); return { text: w, suggested: g ? g.id : null, suggestedName: g ? g.name : null, newName: parts[0].trim() || w }; });
    out.fms = { name: nice(fileName) || 'FMS', fields: x.fields.map(f => ({ label: f.label, type: guessType(f.label) })), steps: x.steps.map(s => ({ name: s.name, who: s.who, when: s.when, tat: s.tat, due_time: s.due_time })), entries: x.rows.length, started: started.length, completed: fully.length, whos, config: x.cfg };
  }
  return out;
}

/* ---------------- commit ---------------- */
function commit(u, buf, fileName, o) {
  const wb = readBook(buf), kind = detect(wb); if (!kind) fail(400, 'Unrecognised workbook');
  const hod = u.role === 'hod'; if (!(u.role === 'admin' || hod)) fail(403, 'Only the admin or a HOD can import workbooks');
  const P = people(), res = { kind, created: {}, skipped: {}, warnings: [] }, bump = (o2, k, n = 1) => { o2[k] = (o2[k] || 0) + n; };
  const deptCache = new Map(db.prepare('SELECT id,name FROM departments').all().map(d => [norm(d.name), d.id]));
  const deptId = name => { if (hod) return u.dept_id; const n = String(name || '').trim(); if (!n) return null; let id = deptCache.get(norm(n)); if (!id) { id = db.prepare('INSERT INTO departments(name) VALUES(?)').run(n).lastInsertRowid; deptCache.set(norm(n), id); bump(res.created, 'departments'); } return id; };
  const hash = bcrypt.hashSync(String(o.password || 'welcome123'), 10);
  const addUser = (name, { email, phone, dept } = {}) => {
    let usr = (email && P.byEmail.get(email)) || P.byName.get(norm(name)) || (phone && P.byPhone.get(String(phone).replace(/\D/g, '')));
    if (usr) { bump(res.skipped, 'people (already existed)'); const sets = [], args = []; if (dept && !usr.dept_id) { sets.push('dept_id=?'); args.push(dept); usr.dept_id = dept; } if (email && !usr.email && !usr.notify_email) { sets.push('notify_email=?'); args.push(email); } if (phone && !usr.phone) { sets.push('phone=?'); args.push(String(phone)); } if (sets.length) db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...args, usr.id); return usr; }
    if (o.create_users === false) return null;
    const free = email && !P.byEmail.has(email) ? email : null;
    const id = db.prepare('INSERT INTO users(name,email,notify_email,phone,password_hash,role,dept_id,must_change_pw) VALUES(?,?,?,?,?,?,?,1)').run(name, free, email || null, phone ? String(phone) : null, hash, 'member', dept || null).lastInsertRowid;
    usr = { id, name, email: free, phone, dept_id: dept || null }; P.all.push(usr); P.byName.set(norm(name), usr); if (email) P.byEmail.set(email, usr); if (phone) P.byPhone.set(String(phone).replace(/\D/g, ''), usr);
    audit(u, 'User created', { id, email: free, name }, 'Workbook import'); bump(res.created, 'people'); return usr;
  };
  const today = L.todayStr(), horizon = L.addDays(today, 14);

  db.transaction(() => {
    if (kind === 'checklist') {
      const x = parseChecklist(wb), recMap = new Map();
      for (const d of x.doers) addUser(d.name, { email: d.email, phone: d.phone, dept: deptId(d.dept) });
      for (const t of db.prepare('SELECT id,doer_id,description FROM rec_tasks').all()) recMap.set(t.doer_id + '|' + norm(t.description), t.id);
      const find = n => P.byName.get(norm(n)) || addUser(n, { dept: null });
      for (const t of x.tasks) {
        const usr = find(t.doer); if (!usr) { bump(res.skipped, 'tasks (person not found)'); res.warnings.push(`Task “${t.task}”: person “${t.doer}” not found`); continue; }
        if (!t.freq) { bump(res.skipped, 'tasks (unknown frequency)'); res.warnings.push(`Task “${t.task}”: frequency “${t.freqRaw}” not recognised`); continue; }
        if (!t.start) { bump(res.skipped, 'tasks (no start date)'); res.warnings.push(`Task “${t.task}”: no start date`); continue; }
        const dept = deptId(t.dept) || usr.dept_id || (hod ? u.dept_id : null); if (!dept) { bump(res.skipped, 'tasks (no department)'); continue; }
        if (!canEdit(u, dept, 'recurring')) { bump(res.skipped, 'tasks (no access)'); continue; }
        const key = usr.id + '|' + norm(t.task); if (recMap.has(key)) { bump(res.skipped, 'tasks (already existed)'); continue; }
        const id = db.prepare('INSERT INTO rec_tasks(dept_id,doer_id,category,frequency,start_date,description,priority,created_by,gen_from) VALUES(?,?,?,?,?,?,?,?,?)').run(dept, usr.id, null, t.freq, t.start, t.task, 'Medium', u.id, t.start > today ? t.start : today).lastInsertRowid;
        recMap.set(key, id); bump(res.created, 'recurring tasks');
      }
      if (o.import_history !== false) {
        const ins = db.prepare('INSERT OR IGNORE INTO rec_instances(task_id,due_date,status,done_at) VALUES(?,?,?,?)');
        for (const h of x.history) {
          if (h.planned > horizon) { bump(res.skipped, 'future rows (created automatically later)'); continue; }
          const usr = P.byName.get(norm(h.name)), tid = usr && recMap.get(usr.id + '|' + norm(h.task)); if (!tid) { bump(res.skipped, 'history rows (task not found)'); continue; }
          const doneAt = h.done ? (h.actual ? h.actual.date + ' ' + hhmm(new Date(h.actual.ms)) + ':00' : h.planned + ' 18:00:00') : null;
          const r = ins.run(tid, h.planned, h.done ? 'done' : 'pending', doneAt); if (r.changes) bump(res.created, h.done ? 'history: done' : 'history: pending'); else bump(res.skipped, 'history rows (already existed)');
        }
      }
      if (!hod && o.import_holidays !== false) { const up = db.prepare('INSERT INTO holidays(date,name,kind) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET name=CASE WHEN instr(holidays.name, excluded.name)>0 THEN holidays.name ELSE holidays.name||\' / \'||excluded.name END, kind=CASE WHEN holidays.kind=\'GH\' OR excluded.kind=\'GH\' THEN \'GH\' ELSE \'RH\' END'); x.holidays.forEach(h => { up.run(h.date, h.name, h.kind); bump(res.created, 'holidays'); }); }
      if (!hod && o.apply_settings !== false) { const sets = []; if (x.settings.reminder_hour != null) { setSetting('reminder_hour', x.settings.reminder_hour); sets.push(`reminder time ${x.settings.reminder_hour}:00`); } if (x.settings.skip_sundays) { setSetting('weekly_off', '0'); sets.push('Sunday off'); } if (sets.length) res.created['settings'] = sets.join(', '); }
    } else if (kind === 'delegation') {
      const x = parseDelegation(wb), boardName = String(o.board_name || nice(fileName) || 'Delegation').trim();
      for (const d of x.doers) addUser(d.name, { email: d.email, phone: d.phone, dept: hod ? u.dept_id : null });
      let b = db.prepare('SELECT * FROM boards WHERE lower(name)=lower(?)').get(boardName), bid;
      if (b) { bid = b.id; if (!(u.role === 'admin' || b.owner_id === u.id || (b.dept_id && canEdit(u, b.dept_id, 'delegation')))) fail(403, 'You cannot add tasks to the existing board “' + boardName + '”'); }
      else { bid = db.prepare("INSERT INTO boards(name,color,icon,dept_id,sharing,owner_id) VALUES(?,?,?,?,'specific',?)").run(boardName, '#7c3aed', '📣', hod ? u.dept_id : null, u.id).lastInsertRowid; bump(res.created, 'board'); }
      const addM = db.prepare('INSERT OR IGNORE INTO board_members(board_id,user_id,level) VALUES(?,?,?)'); addM.run(bid, u.id, 'editor');
      const seen = new Set(db.prepare('SELECT ext_id FROM del_tasks WHERE board_id=? AND ext_id IS NOT NULL').all(bid).map(r => r.ext_id));
      for (const t of x.tasks) {
        const usr = P.byName.get(norm(t.person)) || addUser(t.person, { dept: hod ? u.dept_id : null }); if (!usr) { bump(res.skipped, 'tasks (person not found)'); res.warnings.push(`Task “${t.task}”: person “${t.person}” not found`); continue; }
        if (t.ext && seen.has(t.ext)) { bump(res.skipped, 'tasks (already existed)'); continue; }
        addM.run(bid, usr.id, 'editor');
        const note = [t.first && 'First date ' + t.first, t.r1 && 'Revision 1: ' + t.r1, t.r2 && 'Revision 2: ' + t.r2].filter(Boolean).join(' · ');
        db.prepare('INSERT INTO del_tasks(board_id,title,description,assigned_to,created_by,due_date,priority,status,created_at,closed_at,ext_id,revisions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(bid, t.task, note || null, usr.id, u.id, t.due, 'Medium', t.done ? 'done' : 'not_started', (t.first || today) + ' 09:00:00', t.done ? (t.due || today) + ' 18:00:00' : null, t.ext || null, t.revisions);
        if (t.ext) seen.add(t.ext); bump(res.created, t.done ? 'tasks (completed)' : 'tasks (open)');
      }
      res.boardId = bid;
    } else {
      const x = parseFms(wb), name = String(o.name || nice(fileName) || 'FMS').trim(), dept = hod ? u.dept_id : (num(o.dept_id) || deptId(o.new_dept));
      if (!dept) fail(400, 'Choose a department for this process');
      if (!canEdit(u, dept, 'fms')) fail(403, 'You need editor access to the Process module in that department');
      // doers: map each "Who" text to an existing user, or create one
      const map = {}; for (const s of x.steps) {
        if (!s.who || map[s.who] !== undefined) continue; const c = (o.doers || {})[s.who];
        if (c && c !== 'new') { map[s.who] = num(c); continue; }
        const nm = String((o.new_names || {})[s.who] || s.who.split(/\s+-\s+/)[0]).trim() || s.who;
        const usr = (c === 'new' || c === undefined) ? addUser(nm, { dept }) : null; map[s.who] = usr ? usr.id : u.id;
        if (!usr) res.warnings.push(`“${s.who}” was assigned to you because no matching person exists.`);
      }
      let proc = db.prepare('SELECT * FROM processes WHERE lower(name)=lower(?) AND dept_id=?').get(name, dept), pid;
      const fields = x.fields.map((f, i) => ({ key: 'f' + (i + 1), label: f.label, type: guessType(f.label), required: false }));
      if (proc) { pid = proc.id; res.warnings.push('A process with this name already existed – new entries were added to it.'); }
      else {
        const prefix = (name.match(/[A-Za-z0-9]+/g) || ['FMS']).map(w => w[0]).join('').slice(0, 5).toUpperCase() || 'FMS';
        pid = db.prepare('INSERT INTO processes(name,prefix,description,type,dept_id,pc_id,fields,updater,graph_period) VALUES(?,?,?,?,?,?,?,?,?)').run(name, prefix, 'Imported from Excel', 'Straight', dept, u.id, JSON.stringify(fields), 'step_owner', 'weekly').lastInsertRowid;
        x.steps.forEach((s, i) => db.prepare('INSERT INTO process_steps(process_id,step_no,name,doer_id,tat,unit,checklist,due_time) VALUES(?,?,?,?,?,?,?,?)').run(pid, i + 1, s.name, map[s.who] || u.id, s.tat, 'workdays', '[]', s.due_time || (x.cfg && x.cfg.close) || '18:00'));
        bump(res.created, 'process'); proc = db.prepare('SELECT * FROM processes WHERE id=?').get(pid);
      }
      const steps = db.prepare('SELECT * FROM process_steps WHERE process_id=? ORDER BY step_no').all(pid), flds = JSON.parse(proc.fields || '[]');
      const seen = new Set(db.prepare('SELECT ext_key FROM entries WHERE process_id=? AND ext_key IS NOT NULL').all(pid).map(r => r.ext_key));
      const insE = db.prepare('INSERT INTO entries(process_id,uid,title,data,status,started_at,created_by,ext_key) VALUES(?,?,?,?,?,?,?,?)');
      const insS = db.prepare('INSERT INTO entry_steps(entry_id,step_no,name,doer_id,reviewer_id,tat_ms,unit,tat,due_time,planned_at,actual_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      let seq = db.prepare('SELECT next_seq FROM processes WHERE id=?').get(pid).next_seq;
      const titleIdx = (() => { const i = flds.findIndex(f => /\b(no|number|id|code)\b/i.test(f.label)); return i >= 0 ? i : 0; })();
      for (const r of x.rows) {
        const data = {}; flds.forEach((f, i) => { const v = cellVal(r.vals[i], f.type); if (v !== '') data[f.key] = v; });
        const key = JSON.stringify([r.ts && r.ts.ms, ...flds.map(f => data[f.key] || '')]); if (seen.has(key)) { bump(res.skipped, 'entries (already existed)'); continue; }
        seen.add(key);
        const started = (r.ts && r.ts.ms) || (r.steps[0].planned && r.steps[0].planned.ms) || Date.now(), uid = `${proc.prefix || 'FMS'}-${String(seq++).padStart(6, '0')}`;
        const eid = insE.run(pid, uid, data[flds[titleIdx] && flds[titleIdx].key] || uid, JSON.stringify(data), 'running', started, u.id, key).lastInsertRowid;
        let prevAt = started, currentSet = false, open = 0;
        steps.forEach((s, i) => {
          const f = r.steps[i] || {}, done = /^done$/i.test(f.status) || !!(f.actual), planned = f.planned ? f.planned.ms : null;
          let pl = planned, ac = null;
          if (done) { ac = f.actual ? f.actual.ms : (planned || prevAt); if (pl == null) pl = plannedAt(prevAt, { unit: s.unit, tat: s.tat, due_time: s.due_time, tat_ms: 0 }); prevAt = ac; }
          else { open++; if (!currentSet) { currentSet = true; if (pl == null) pl = plannedAt(prevAt, { unit: s.unit, tat: s.tat, due_time: s.due_time, tat_ms: 0 }); } else pl = null; }
          insS.run(eid, s.step_no, s.name, s.doer_id, null, 0, s.unit, s.tat, s.due_time, pl, ac, done ? 'done' : 'pending');
        });
        if (!open) db.prepare("UPDATE entries SET status='completed' WHERE id=?").run(eid);
        bump(res.created, open ? 'entries (running)' : 'entries (completed)');
      }
      db.prepare('UPDATE processes SET next_seq=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(seq, pid);
      if (!hod && o.apply_settings !== false && x.cfg) {
        const sets = []; if (x.cfg.open) { setSetting('open_time', x.cfg.open); sets.push('opening ' + x.cfg.open); } if (x.cfg.close) { setSetting('close_time', x.cfg.close); sets.push('closing ' + x.cfg.close); }
        if (x.cfg.days && /^[01]{7}$/.test(x.cfg.days)) { setSetting('weekly_off', x.cfg.days.split('').map((c, i) => c === '1' ? (i + 1) % 7 : null).filter(v => v != null).join(',')); sets.push('weekly off days'); }
        if (sets.length) res.created['settings'] = sets.join(', ');
      }
      res.processId = pid;
    }
  })();
  genInstances();
  audit(u, 'Data imported', null, `${kind} workbook “${fileName}”: ` + Object.entries(res.created).map(([k, v]) => `${v} ${k}`).join(', '));
  res.warnings = res.warnings.slice(0, 60); return res;
}

module.exports = function mount(app) {
  app.post('/api/import/workbook/preview', auth, upload.single('file'), wrap(req => { if (!req.file) fail(400, 'Choose a file first'); if (!(req.user.role === 'admin' || req.user.role === 'hod')) fail(403, 'Only the admin or a HOD can import workbooks'); try { return preview(req.file.buffer, req.file.originalname); } catch (e) { if (e.status) throw e; console.error(e); fail(400, 'Could not read that file: ' + e.message); } }));
  app.post('/api/import/workbook/commit', auth, upload.single('file'), wrap(req => { if (!req.file) fail(400, 'Choose a file first'); let o = {}; try { o = JSON.parse(req.body.options || '{}'); } catch { } return commit(req.user, req.file.buffer, req.file.originalname, o); }));
};
module.exports.preview = preview; module.exports.commit = commit;
module.exports._t = { parseChecklist, parseDelegation, parseFms, detect, readBook, norm, dt };
