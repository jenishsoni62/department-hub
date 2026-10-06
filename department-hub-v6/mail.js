'use strict';
// E-mail: daily reminder digest + instant notifications.
// Sends through ordinary SMTP (Gmail, Outlook, your own mail server) or through the Brevo HTTPS API
// (use Brevo when the host blocks SMTP ports, e.g. free Render plans).
const nodemailer = require('nodemailer');
const C = require('./core');
const { db, L, audit, fail, wrap, auth, getSetting, setSetting, weeklyOff, holidaySet } = C;

const S = (k, d = '') => getSetting(k, d);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEYS = ['mail_provider', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'mail_from_name', 'mail_from_email', 'brevo_key', 'app_url', 'reminder_hour', 'reminders_on', 'event_mail_on', 'skip_rh'];

function config() {
  const c = {}; KEYS.forEach(k => c[k] = S(k, '')); return c;
}
const configured = c => c.mail_provider === 'brevo' ? !!(c.brevo_key && c.mail_from_email) : c.mail_provider === 'smtp' ? !!(c.smtp_host && c.mail_from_email) : false;
const addressOf = u => (u && (u.notify_email || u.email) || '').trim();

function log(to, subject, kind, status, error) {
  try { db.prepare('INSERT INTO email_log(at,to_addr,subject,kind,status,error) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(), to, subject, kind || 'other', status, error ? String(error).slice(0, 300) : null); db.prepare('DELETE FROM email_log WHERE id < (SELECT MAX(id) FROM email_log) - 5000').run(); } catch (e) { console.error('mail log failed:', e.message); }
}

// one message at a time, so bursts do not hit provider rate limits
let chain = Promise.resolve();
function sendMail({ to, subject, html, text, kind }) {
  const job = chain.then(() => deliver({ to, subject, html, text, kind }));
  chain = job.catch(() => { });
  return job;
}
async function deliver({ to, subject, html, text, kind }) {
  const c = config();
  if (!configured(c)) { log(to, subject, kind, 'skipped', 'E-mail is not set up yet'); return { ok: false, error: 'E-mail is not set up yet (Admin → Settings → E-mail).' }; }
  const from = c.mail_from_name ? `"${String(c.mail_from_name).replace(/"/g, '')}" <${c.mail_from_email}>` : c.mail_from_email;
  try {
    if (c.mail_provider === 'brevo') {
      const r = await fetch(S('brevo_url', '') || 'https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': c.brevo_key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: c.mail_from_name || undefined, email: c.mail_from_email }, to: [{ email: to }], subject, htmlContent: html, textContent: text }) });
      if (!r.ok) throw new Error('Brevo said: ' + ((await r.text()).slice(0, 200) || r.status));
    } else {
      const tr = nodemailer.createTransport({ host: c.smtp_host, port: Number(c.smtp_port) || 587, secure: c.smtp_secure === '1', auth: c.smtp_user ? { user: c.smtp_user, pass: c.smtp_pass } : undefined, tls: { rejectUnauthorized: S('smtp_strict_tls', '1') !== '0' }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
      await tr.sendMail({ from, to, subject, html, text });
    }
    log(to, subject, kind, 'sent'); return { ok: true };
  } catch (e) { log(to, subject, kind, 'failed', e.message); return { ok: false, error: e.message }; }
}

/* ---------------- e-mail layout ---------------- */
const link = path => { const u = S('app_url', '').replace(/\/+$/, ''); return u ? u + '/' + (path || '') : ''; };
function layout(title, intro, sections, cta) {
  const head = 'font-family:Segoe UI,Arial,sans-serif;color:#172033';
  const btn = cta && link(cta.path) ? `<p style="margin:22px 0"><a href="${esc(link(cta.path))}" style="background:#1d5bd6;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(cta.label || 'Open Department Hub')}</a></p>` : '';
  const body = sections.filter(Boolean).join('');
  const html = `<div style="background:#f3f5fa;padding:20px 8px"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;${head}"><div style="background:#0c4bb8;color:#fff;padding:16px 22px;font-size:17px;font-weight:700">Department Hub</div><div style="padding:22px"><h2 style="margin:0 0 6px;font-size:19px">${esc(title)}</h2>${intro ? `<p style="margin:0 0 14px;color:#566079">${intro}</p>` : ''}${body}${btn}<p style="color:#8892a8;font-size:12px;margin:18px 0 0">You get this because you are a doer in Department Hub. Ask your admin to change reminders.</p></div></div></div>`;
  const plain = [title, '', intro && intro.replace(/<[^>]+>/g, ''), '', ...sections.filter(Boolean).map(s => s.replace(/<\/(tr|li|p|h3|div)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')), cta && link(cta.path) ? '\nOpen: ' + link(cta.path) : ''].join('\n');
  return { html, text: plain };
}
const section = (h, rows, more, color = '#1d5bd6') => rows.length ? `<h3 style="margin:18px 0 6px;font-size:14px;color:${color}">${esc(h)} <span style="background:#eef2ff;color:${color};border-radius:99px;padding:1px 8px;font-size:12px">${rows.length + (more || 0)}</span></h3><table style="width:100%;border-collapse:collapse;font-size:13.5px">${rows.map(r => `<tr><td style="padding:6px 8px;border-top:1px solid #e5e9f2">${r}</td></tr>`).join('')}</table>${more ? `<p style="color:#8892a8;font-size:12px;margin:4px 0">…and ${more} more</p>` : ''}` : '';
const fmtD = s => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${+d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]}`; };
const badge = (t, bad) => `<span style="background:${bad ? '#fdecea' : '#fff3e0'};color:${bad ? '#b42318' : '#a85a00'};border-radius:99px;padding:1px 8px;font-size:11.5px;font-weight:600">${esc(t)}</span>`;
const when = (due, today) => !due ? '' : due < today ? badge('overdue · ' + fmtD(due), true) : due === today ? badge('due today') : badge('due ' + fmtD(due));
const cap = (arr, n = 12) => [arr.slice(0, n), Math.max(0, arr.length - n)];

/* ---------------- the daily digest ---------------- */
function nextWorkingDay(from) {
  const off = weeklyOff(), hol = holidaySet(); let d = L.addDays(from, 1);
  for (let i = 0; i < 14; i++) { if (!off.includes(L.parseD(d).getDay()) && !hol.has(d)) return d; d = L.addDays(d, 1); }
  return L.addDays(from, 1);
}
const isWorkingDay = day => !weeklyOff().includes(L.parseD(day).getDay()) && !holidaySet().has(day);
function digestFor(u, today, upto) {
  const endMs = L.dayBounds(upto)[1];
  const rec = db.prepare("SELECT i.due_date, t.description FROM rec_instances i JOIN rec_tasks t ON t.id=i.task_id WHERE t.doer_id=? AND t.active=1 AND i.status='pending' AND i.due_date<=? ORDER BY i.due_date, t.description").all(u.id, upto);
  const tk = db.prepare("SELECT id, description, due_date FROM tickets WHERE doer_id=? AND status IN ('open','in_progress') AND due_date<=? ORDER BY due_date").all(u.id, upto);
  const dl = db.prepare("SELECT x.title, x.due_date, b.name board FROM del_tasks x JOIN boards b ON b.id=x.board_id WHERE x.assigned_to=? AND x.status IN ('not_started','in_progress') AND x.due_date<=? ORDER BY x.due_date").all(u.id, upto);
  const st = db.prepare("SELECT es.name step, es.planned_at, e.uid, e.title, p.name process FROM entry_steps es JOIN entries e ON e.id=es.entry_id JOIN processes p ON p.id=e.process_id WHERE es.doer_id=? AND es.status='pending' AND es.planned_at IS NOT NULL AND es.planned_at<=? ORDER BY es.planned_at").all(u.id, endMs);
  const rv = db.prepare("SELECT COUNT(*) n FROM tickets WHERE status='review' AND reviewer_id=?").get(u.id).n + db.prepare("SELECT COUNT(*) n FROM del_tasks WHERE status='under_review' AND created_by=?").get(u.id).n + db.prepare("SELECT COUNT(*) n FROM entry_steps WHERE status='review' AND reviewer_id=?").get(u.id).n;
  const stDay = ms => L.fmtDate(new Date(ms));
  const overdue = rec.filter(r => r.due_date < today).length + tk.filter(r => r.due_date < today).length + dl.filter(r => r.due_date < today).length + st.filter(r => stDay(r.planned_at) < today).length;
  const total = rec.length + tk.length + dl.length + st.length;
  return { rec, tk, dl, st, rv, overdue, total, stDay };
}
function digestMail(u, d, today, upto) {
  const tomorrow = upto === L.addDays(today, 1) ? 'tomorrow' : fmtD(upto);
  const [r1, rm] = cap(d.rec), [t1, tm] = cap(d.tk), [d1, dm] = cap(d.dl), [s1, sm] = cap(d.st);
  const intro = `Hi ${esc(u.name.split(' ')[0])}, here is what is pending for you up to <b>${esc(tomorrow)}</b>${d.overdue ? ` — <b style="color:#b42318">${d.overdue} already overdue</b>` : ''}.`;
  const secs = [
    section('Checklist tasks', r1.map(r => `${esc(r.description)} ${when(r.due_date, today)}`), rm),
    section('Help tickets', t1.map(r => `${esc(r.description)} ${when(r.due_date, today)}`), tm, '#a85a00'),
    section('Delegation tasks', d1.map(r => `${esc(r.title)} <span style="color:#8892a8">· ${esc(r.board)}</span> ${when(r.due_date, today)}`), dm, '#6d3fd1'),
    section('Process steps', s1.map(r => `${esc(r.title)} — <b>${esc(r.step)}</b> <span style="color:#8892a8">· ${esc(r.process)}</span> ${when(d.stDay(r.planned_at), today)}`), sm, '#0f9d6b'),
    d.rv ? `<p style="margin:16px 0 0"><b>${d.rv}</b> item${d.rv > 1 ? 's are' : ' is'} waiting for your review.</p>` : '',
  ];
  const m = layout(`${d.total} thing${d.total === 1 ? '' : 's'} need your attention`, intro, secs, { path: '#/dashboard', label: 'Open my tasks' });
  return { subject: `Reminder: ${d.total} task${d.total === 1 ? '' : 's'} pending${d.overdue ? ` (${d.overdue} overdue)` : ''} – ${tomorrow}`, ...m };
}
// who gets what, without sending (used for the "preview" button and the real run)
function plan(today = L.todayStr()) {
  const upto = nextWorkingDay(today), out = [];
  for (const u of db.prepare('SELECT id,name,email,notify_email FROM users WHERE active=1').all()) {
    const d = digestFor(u, today, upto), to = addressOf(u);
    if (d.total || d.rv) out.push({ u, to, d, upto, today });
  }
  return out;
}
async function sendDigests({ today = L.todayStr(), force = false } = {}) {
  const res = { sent: 0, failed: 0, noAddress: [], recipients: 0, skippedNonWorking: false };
  if (!force && !isWorkingDay(today)) { res.skippedNonWorking = true; return res; }
  for (const p of plan(today)) {
    res.recipients++;
    if (!p.to) { res.noAddress.push(p.u.name); continue; }
    const m = digestMail(p.u, p.d, p.today, p.upto), r = await sendMail({ to: p.to, kind: 'daily reminder', ...m });
    if (r.ok) res.sent++; else res.failed++;
    if (!r.ok && /not set up/.test(r.error)) break;
  }
  setSetting('last_digest', today); return res;
}

/* ---------------- instant notifications ---------------- */
function notify(userId, subject, lines, cta, kind = 'notification') {
  try {
    if (S('event_mail_on', '1') !== '1' || !userId) return;
    const c = config(); if (!configured(c)) return;
    const u = db.prepare('SELECT id,name,email,notify_email,active FROM users WHERE id=?').get(userId); const to = addressOf(u); if (!u || !u.active || !to) return;
    const m = layout(subject, `Hi ${esc(u.name.split(' ')[0])},`, [`<p style="margin:6px 0;line-height:1.5">${lines.map(esc).join('<br>')}</p>`], cta || { path: '#/dashboard' });
    sendMail({ to, subject, kind, ...m }).catch(() => { });
  } catch (e) { console.error('notify failed:', e.message); }
}

/* ---------------- scheduler ---------------- */
function startScheduler() {
  const tick = async () => {
    try {
      if (S('reminders_on', '0') !== '1' || !configured(config())) return;
      const now = new Date(), today = L.todayStr(), hr = Number(S('reminder_hour', '15'));
      if (S('last_digest', '') === today || now.getHours() < hr || now.getHours() >= hr + 4) return;     // once a day, within 4 hours of the chosen time
      setSetting('last_digest', today);                                                                    // claim the slot first so a slow run is not repeated
      const r = await sendDigests({ today }); console.log(`[reminders] ${today}: sent ${r.sent}, failed ${r.failed}, no address ${r.noAddress.length}`);
    } catch (e) { console.error('[reminders] error:', e.message); }
  };
  setInterval(tick, 60 * 1000); setTimeout(tick, 5000);
}

/* ---------------- routes ---------------- */
module.exports = function mount(app) {
  const admin = req => { if (req.user.role !== 'admin') fail(403, 'Only the admin can change e-mail settings'); };
  app.get('/api/mail/settings', auth, wrap(req => {
    admin(req); const c = config(), users = db.prepare('SELECT name,email,notify_email FROM users WHERE active=1').all();
    return { ...c, smtp_pass: c.smtp_pass ? '********' : '', brevo_key: c.brevo_key ? '********' : '', configured: configured(c), missing_addresses: users.filter(u => !addressOf(u)).map(u => u.name), people: users.length,
      last_digest: S('last_digest', ''), sent_today: db.prepare("SELECT COUNT(*) n FROM email_log WHERE status='sent' AND at>=?").get(new Date(new Date().setHours(0, 0, 0, 0)).toISOString()).n };
  }));
  app.put('/api/mail/settings', auth, wrap(req => {
    admin(req); const b = req.body, ch = [];
    const text = ['mail_provider', 'smtp_host', 'smtp_port', 'smtp_user', 'mail_from_name', 'mail_from_email', 'app_url'];
    for (const k of text) if (k in b) { let v = String(b[k] ?? '').trim(); if (k === 'mail_provider' && !['', 'smtp', 'brevo'].includes(v)) fail(400, 'Choose SMTP or Brevo'); if (k === 'smtp_port' && v && !(Number(v) > 0 && Number(v) < 65536)) fail(400, 'Port must be a number'); if (k === 'mail_from_email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) fail(400, 'Enter a valid “from” e-mail address'); setSetting(k, v); ch.push(k); }
    for (const k of ['smtp_pass', 'brevo_key']) if (k in b && String(b[k]) !== '********' && String(b[k]).trim() !== '') { setSetting(k, String(b[k]).trim()); ch.push(k); }
    if ('smtp_secure' in b) setSetting('smtp_secure', b.smtp_secure ? '1' : '0');
    if ('reminders_on' in b) setSetting('reminders_on', b.reminders_on ? '1' : '0');
    if ('event_mail_on' in b) setSetting('event_mail_on', b.event_mail_on ? '1' : '0');
    if ('skip_rh' in b) setSetting('skip_rh', b.skip_rh ? '1' : '0');
    if ('reminder_hour' in b) { const h = Number(b.reminder_hour); if (!(h >= 0 && h <= 23)) fail(400, 'Reminder hour must be 0–23'); setSetting('reminder_hour', h); }
    audit(req.user, 'Settings changed', null, 'E-mail settings' + (ch.length ? ': ' + ch.filter(k => !/pass|key/.test(k)).join(', ') : '')); return { ok: true };
  }));
  app.post('/api/mail/test', auth, wrap(async req => {
    admin(req); const to = String(req.body.to || addressOf(req.user)).trim(); if (!to) fail(400, 'Type the address to send the test to');
    const m = layout('Test e-mail', 'If you can read this, e-mail from Department Hub works. 🎉', [], { path: '#/dashboard', label: 'Open Department Hub' });
    const r = await sendMail({ to, subject: 'Department Hub – test e-mail', kind: 'test', ...m }); if (!r.ok) fail(400, r.error); return { ok: true, to };
  }));
  app.post('/api/mail/digest', auth, wrap(async req => {
    admin(req);
    if (req.body.dry) { const p = plan(), upto = nextWorkingDay(L.todayStr()); return { dry: true, upto, working_day: isWorkingDay(L.todayStr()), recipients: p.map(x => ({ name: x.u.name, to: x.to || null, total: x.d.total, overdue: x.d.overdue, reviews: x.d.rv })) }; }
    return sendDigests({ force: true });
  }));
  app.get('/api/mail/log', auth, wrap(req => { admin(req); return db.prepare('SELECT * FROM email_log ORDER BY id DESC LIMIT 200').all(); }));
};
module.exports.notify = notify; module.exports.sendMail = sendMail; module.exports.sendDigests = sendDigests; module.exports.plan = plan; module.exports.digestMail = digestMail;
module.exports.startScheduler = startScheduler; module.exports.configured = () => configured(config());
