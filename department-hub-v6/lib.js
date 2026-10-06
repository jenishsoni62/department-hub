'use strict';
// Dates, schedules and e-mails follow this time zone (set TZ yourself to override).
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });

// ---- signing key (generated once, stored next to the database) ----
const keyFile = path.join(DATA, 'secret.key');
let SECRET;
if (fs.existsSync(keyFile)) SECRET = fs.readFileSync(keyFile, 'utf8');
else { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(keyFile, SECRET); }
const b64 = s => Buffer.from(s).toString('base64url');
const mac = body => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
function sign(p) { const body = b64(JSON.stringify({ ...p, exp: Date.now() + 7 * 864e5 })); return body + '.' + mac(body); }
function verify(t) {
  if (!t || !t.includes('.')) return null;
  const [body, sig] = t.split('.'); const ok = mac(body);
  if (!sig || sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

// ---- dates (all local time, stored as YYYY-MM-DD) ----
const pad = (n, l = 2) => String(n).padStart(l, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => fmtDate(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return fmtDate(d); };
const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / 864e5);
const nowStr = () => { const d = new Date(); return fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
function weekRange(off = 0) {
  const t = parseD(todayStr()); const dow = (t.getDay() + 6) % 7;
  const s = new Date(t); s.setDate(t.getDate() - dow + off * 7);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return [fmtDate(s), fmtDate(e)];
}
function monthRange() { const t = new Date(); return [fmtDate(new Date(t.getFullYear(), t.getMonth(), 1)), fmtDate(new Date(t.getFullYear(), t.getMonth() + 1, 0))]; }
const dayBounds = s => [parseD(s).getTime(), parseD(addDays(s, 1)).getTime() - 1];

// ---- flexible date reading for Excel imports ----
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDateTime(v) {           // returns {date:'YYYY-MM-DD', ms} or null
  let s = String(v ?? '').trim(); if (!s) return null;
  let y, mo, d, m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3})[A-Za-z]*[ ,\-]+(\d{4})/))) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = +m[3]; }
  else if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {            // Excel serial number
    const dt = new Date(Math.round((+s - 25569) * 864e5)); y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else return null;
  if (!mo || mo > 12 || d > 31) return null;
  let hh = 0, mm = 0, ss = 0;
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (t) { hh = +t[1]; mm = +t[2]; ss = +(t[3] || 0); if (t[4]) { const pm = /pm/i.test(t[4]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; } }
  const dt = new Date(y, mo - 1, d, hh, mm, ss);
  return { date: fmtDate(dt), ms: dt.getTime() };
}
const parseDateOnly = v => { const r = parseDateTime(v); return r ? r.date : null; };

module.exports = { DATA, sign, verify, pad, fmtDate, parseD, todayStr, addDays, diffDays, nowStr, weekRange, monthRange, dayBounds, parseDateTime, parseDateOnly };
