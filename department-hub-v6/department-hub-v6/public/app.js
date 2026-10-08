'use strict';
/* =====================================================================
   Department Hub – front end core: state, API, UI helpers, shell, router
   Pages live in pages-work.js and pages-admin.js
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = x => x == null ? [] : [].concat(x);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtD = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
const h12 = hm => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtTS = s => s ? fmtD(s) + ' ' + h12(String(s).slice(11, 16)) : '—';
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtMs = ms => { if (!ms) return '—'; const d = new Date(ms); return fmtD(isoLocal(d)) + ' ' + h12(`${d.getHours()}:${d.getMinutes()}`); };
const dur = ms => { ms = Math.abs(ms); const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const todayISO = () => isoLocal(new Date());
const PALETTE = ['#2563eb', '#0f9d6b', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#4f46e5'];
const colorOf = s => PALETTE[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials = n => String(n || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const avatar = (n, cls = '') => `<span class="avatar ${cls}" style="background:${colorOf(n)}" title="${esc(n)}">${esc(initials(n))}</span>`;

const IC = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  life: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  flow: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>', chev: '<polyline points="6 9 12 15 18 9"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>', msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
};
const ic = (n, s) => `<svg class="ic" viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ''}>${IC[n] || ''}</svg>`;

/* ---------- state & API ---------- */
const S = { token: localStorage.getItem('hub_token'), user: null, editable: {}, meta: null, badges: { review: 0, overdue: 0 }, open: {} };
const Q = {};                                           // remembered filters per page
const qs = (page, def) => Q[page] = Q[page] || { ...def };
const PAGES = {}, ACT = {}, FORM = {}, CHG = {}, INP = {};

async function api(path, { method = 'GET', body, form, raw } = {}) {
  const headers = {}; if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let payload; if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch('/api' + path, { method, headers, body: payload });
  if (raw) return r;
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token && path !== '/login') { logout(); throw new Error(j.error || 'Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
function toast(msg, kind) { const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2600); }
const safe = async fn => { try { return await fn(); } catch (e) { toast(e.message, 'err'); } };
const role = () => S.user.role, isAdmin = () => role() === 'admin', isPC = () => role() === 'pc', mgr = () => role() === 'admin' || role() === 'hod';
const hasEdit = m => S.editable[m] === 'all' || (S.editable[m] || []).length > 0;
const canEditDept = (m, d) => S.editable[m] === 'all' || (S.editable[m] || []).includes(Number(d));

/* ---------- html helpers ---------- */
const optHtml = (list, sel, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') + list.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(sel ?? '') ? ' selected' : ''}>${esc(o.l)}</option>`).join('');
const deptOpts = (sel, blank, only) => optHtml(S.meta.departments.filter(d => !only || only.includes(d.id)).map(d => ({ v: d.id, l: d.name })), sel, blank);
const userOpts = (sel, blank, filter) => optHtml(S.meta.users.filter(u => u.active && (!filter || filter(u))).map(u => ({ v: u.id, l: u.name + (u.emp_code ? ' – ' + u.emp_code : '') })), sel, blank);
const lookOpts = (list, sel, blank) => optHtml(list.map(x => ({ v: x.name, l: x.name })), sel, blank);
const badge = (t, c = '') => `<span class="badge ${c}">${esc(t)}</span>`;
const ST = { not_started: ['Not Started', ''], open: ['Open', 'blue'], pending: ['Pending', 'blue'], in_progress: ['In Progress', 'amber'], hold: ['On Hold', 'purple'], review: ['Under Review', 'indigo'], under_review: ['Under Review', 'indigo'], done: ['Completed', 'green'], completed: ['Completed', 'green'], not_done: ['Not Done', 'red'], archived: ['Archived', ''], running: ['Running', 'amber'], skipped: ['Skipped', ''] };
const stBadge = k => { const s = ST[k] || [k, '']; return badge(s[0], s[1]); };
const delayBadge = (days, late) => days > 0 ? badge(`${days} day${days > 1 ? 's' : ''} overdue`, 'red') : late > 0 ? badge(`Late ${late}d`, 'amber') : '<span class="muted">—</span>';
const prio = p => badge(p || 'Medium', p === 'High' ? 'red' : p === 'Low' ? '' : 'amber');
const pills = (page, key, items, cur, cls = '') => `<div class="pills ${cls}">${items.map(([v, l, n]) => `<button class="pill${String(cur) === String(v) ? ' on' : ''}" data-act="setq" data-page="${page}" data-key="${key}" data-val="${esc(v)}">${esc(l)}${n != null ? ` <b>${n}</b>` : ''}</button>`).join('')}</div>`;
const msgBtn = (type, id, n) => `<button class="msgbtn" data-act="msgs" data-type="${type}" data-id="${id}" title="Messages">${ic('msg', 15)}${n ? `<i>${n}</i>` : ''}</button>`;
const menu = items => { const its = items.filter(Boolean); return its.length ? `<details class="menu"><summary>⋯</summary><div class="menu-pop">${its.map(([l, a, d, cls]) => `<button class="${cls || ''}" data-act="${a}" ${Object.entries(d || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${esc(l)}</button>`).join('')}</div></details>` : ''; };
const dataAttrs = d => Object.entries(d).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
const table = (name, heads, rows, opt = {}) => rows.length
  ? `<div class="tbl-wrap"><table class="tbl${opt.cls ? ' ' + opt.cls : ''}" data-name="${esc(name)}"><thead><tr>${heads.map(x => `<th${x.startsWith('!') ? ' class="noexp"' : ''}>${esc(x.replace(/^!/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${opt.foot || ''}</div>`
  : `<div class="card empty">${ic('file', 34)}<h3>${esc(opt.emptyTitle || 'Nothing here yet')}</h3><p>${opt.empty || ''}</p>${opt.emptyAction || ''}</div>`;
const pager = (page, key, pageNo, total, per = 100) => total > per ? `<div class="tbl-foot"><span>Showing ${(pageNo - 1) * per + 1}–${Math.min(total, pageNo * per)} of ${total}</span><span class="row"><button class="btn xs" ${pageNo <= 1 ? 'disabled' : ''} data-act="setq" data-page="${page}" data-key="${key}" data-val="${pageNo - 1}" data-keep-page="1">‹ Prev</button><button class="btn xs" ${pageNo * per >= total ? 'disabled' : ''} data-act="setq" data-page="${page}" data-key="${key}" data-val="${pageNo + 1}" data-keep-page="1">Next ›</button></span></div>` : '';
const exportBtn = name => `<button class="btn" data-act="export" data-name="${esc(name)}">${ic('download', 16)} Export</button>`;
const searchBox = (page, val, ph = 'Search…') => `<input type="search" placeholder="${esc(ph)}" value="${esc(val)}" data-keep="${page}-q" data-input="setq" data-page="${page}" data-key="q">`;
const fv = (f, v) => v == null || v === '' ? '—' : f.type === 'datetime' ? esc(fmtMs(Date.parse(v))) : f.type === 'date' ? esc(fmtD(v)) : esc(v);
const title = t => { const e = $('#ptitle'); if (e) e.textContent = t; document.title = t + ' · Department Hub'; };
const loading = () => '<div class="empty muted">Loading…</div>';

/* ---------- modal ---------- */
let onModalClose = null;
function labelTables() {
  $$('table.tbl').forEach(t => {
    if (t.classList.contains('fms') || t.classList.contains('matrix') || t.dataset.keep) { const w = t.closest('.tbl-wrap'); if (w) w.classList.add('keep'); return; }
    const heads = $$('thead th', t).map(th => th.textContent.trim());
    $$('tbody tr', t).forEach(tr => [...tr.children].forEach((td, i) => { if (!td.dataset.label) td.dataset.label = td.classList.contains('noexp') ? '' : (heads[i] || ''); }));
  });
}
function openModal(html, wide, lock) {
  closeModal();
  const el = document.createElement('div'); el.className = 'scrim'; el.id = 'modal';
  el.innerHTML = `<div class="modal${wide ? ' wide' : ''}">${html}</div>`;
  if (lock) el.dataset.lock = '1';
  el.addEventListener('mousedown', e => { if (e.target === el && !lock) closeModal(); });
  document.body.appendChild(el); labelTables();
  const f = el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select'); if (f) f.focus();
}
function closeModal() { const el = $('#modal'); if (el) el.remove(); const f = onModalClose; onModalClose = null; if (f) f(); }
const fieldHtml = f => {
  if (f.type === 'checkbox') return `<label class="check" style="margin-bottom:12px"><input type="checkbox" name="${f.name}"${f.required ? ' required' : ''}> ${esc(f.label)}</label>`;
  const req = f.required ? ' required' : '', cls = f.required ? ' class="req"' : '';
  const input = f.type === 'textarea' ? `<textarea name="${f.name}"${req} placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`
    : f.type === 'select' ? `<select name="${f.name}"${req}>${optHtml(f.options || [], f.value, f.blank)}</select>`
    : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value || '')}"${req} placeholder="${esc(f.placeholder || '')}"${f.min ? ` min="${f.min}"` : ''}>`;
  return `<label class="f"><span${cls}>${esc(f.label)}</span>${input}</label>`;
};
function ask({ title: t, text, fields, ok = 'Save' }) {
  return new Promise(resolve => {
    openModal(`<h3>${esc(t)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ''}<form id="askf">${fields.map(fieldHtml).join('')}<div class="modal-actions"><button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">${esc(ok)}</button></div></form>`);
    onModalClose = () => resolve(null);
    $('#askf').addEventListener('submit', e => { e.preventDefault(); const o = Object.fromEntries(new FormData(e.target)); onModalClose = null; closeModal(); resolve(o); });
  });
}
const confirmBox = (t, text, ok = 'Confirm') => ask({ title: t, text, fields: [], ok }).then(r => !!r);

/* ---------- shell ---------- */
const menuDef = () => [
  { k: 'dash', l: 'Dashboard', i: 'grid', h: '#/dashboard' },
  { k: 'mis', l: 'MIS Report', i: 'chart', h: '#/report' },
  { k: 'tk', l: 'Help Ticket', i: 'life', items: [!isPC() && ['Create', '#/tickets/create'], ['My Help Tickets', '#/tickets/assigned'], ['Team Help Tickets', '#/tickets/team'], mgr() && ['Issue Types', '#/lookups/issue_type']] },
  { k: 'rec', l: 'Recurring Task', i: 'repeat', items: [(mgr() || hasEdit('recurring')) && ['Create', '#/recurring/create'], ['My Recurring', '#/recurring/my'], ['Team Recurring', '#/recurring/team'], mgr() && ['Category', '#/lookups/category']] },
  { k: 'del', l: 'Delegation', i: 'users', items: [['Boards', '#/delegation'], ['My Task', '#/delegation/my'], ['Team Task', '#/delegation/team']] },
  { k: 'fms', l: 'Process (FMS)', i: 'flow', items: [['My Process Task', '#/fms/my'], ['Team Process Task', '#/fms/team'], ['All Processes', '#/fms'], (mgr() || hasEdit('fms')) && ['Create Process', '#/fms/new']] },
  { k: 'rev', l: 'Review', i: 'eye', h: '#/review', badge: S.badges.review },
  { k: 'hol', l: 'Holiday Calendar', i: 'cal', h: '#/holidays' },
  !isPC() && { k: 'imp', l: 'Import Center', i: 'upload', h: '#/import' },
  mgr() && { k: 'adm', l: 'Admin', i: 'shield', items: [['Users', '#/admin/users'], isAdmin() && ['Departments', '#/admin/departments'], ['Team Access', '#/admin/access'], isAdmin() && ['Activity Log', '#/admin/log'], isAdmin() && ['Settings', '#/admin/settings'], isAdmin() && ['E-mail log', '#/admin/maillog']] },
].filter(Boolean);
function sideHtml() {
  const cur = location.hash || '#/dashboard';
  const on = h => cur === h || cur.startsWith(h + '/') || cur.startsWith(h + '?');
  return `<div class="brand"><b>H</b> Department Hub</div><nav class="nav">${menuDef().map(m => {
    if (m.h) return `<a href="${m.h}" class="${on(m.h) ? 'on' : ''}">${ic(m.i)}<span>${m.l}</span>${m.badge ? `<span class="dot">${m.badge}</span>` : ''}</a>`;
    const items = m.items.filter(Boolean), active = items.some(x => on(x[1]));
    return `<details class="grp" data-k="${m.k}"${(S.open[m.k] ?? active) ? ' open' : ''}><summary>${ic(m.i)}<span>${m.l}</span>${ic('chev', 15).replace('class="ic"', 'class="ic chev"')}</summary><div class="sub">${items.map(x => `<a href="${x[1]}" class="${cur === x[1] || (x[1] !== '#/delegation' && cur.startsWith(x[1] + '/')) ? 'on' : ''}">${x[0]}</a>`).join('')}</div></details>`;
  }).join('')}</nav>`;
}
function bnavHtml() {
  const cur = location.hash || '#/dashboard', items = [['#/dashboard', 'grid', 'Home'], ['#/recurring/my', 'repeat', 'Tasks'], ['#/tickets/assigned', 'life', 'Tickets'], ['#/delegation/my', 'users', 'Delegation']];
  return items.map(([h, i, l]) => `<a href="${h}" class="${cur === h || cur.startsWith(h.split('/').slice(0, 2).join('/') + '/') ? 'on' : ''}">${ic(i, 22)}<span>${l}</span></a>`).join('') + `<button data-act="burger">${ic('menu', 22)}<span>More</span></button>`;
}
function shell() {
  const u = S.user, n = S.badges.review + S.badges.overdue;
  $('#root').innerHTML = `<div class="app"><aside class="side" id="side"></aside><div class="content"><header class="top">
    <button class="ibtn burger" data-act="burger" aria-label="Menu">${ic('menu', 22)}</button><h3 id="ptitle">Department Hub</h3><span class="sp"></span>
    <a class="ibtn" href="${S.badges.review ? '#/review' : '#/dashboard'}" title="${S.badges.review} to review · ${S.badges.overdue} overdue">${ic('bell', 21)}${n ? `<i>${n}</i>` : ''}</a>
    <details class="menu"><summary class="who" style="border:0;padding:0">${avatar(u.name)}<span><b>${esc(u.name)}</b><br><span class="muted sm">${{ admin: 'Admin', hod: 'HOD', pc: 'Process Coordination (view only)', member: 'Team member' }[u.role]}</span></span></summary>
    <div class="menu-pop"><a href="#/profile">My profile & password</a><button data-act="logout">Sign out</button></div></details>
  </header><main id="main"></main></div></div><nav class="bnav" id="bnav"></nav>`;
}

/* ---------- router ---------- */
let routeSeq = 0, lastKey = '';
async function route() {
  if (!S.token) return loginView();
  if (!S.user) { try { await loadSession(); } catch { return loginView(); } }
  if (S.user.must_change_pw) return forcePw();
  if (!$('#main')) shell();
  const seq = ++routeSeq, raw = location.hash.replace(/^#\/?/, '') || 'dashboard', [path, q] = raw.split('?'), parts = path.split('/');
  $('#side').innerHTML = sideHtml(); $('#side').classList.remove('open');
  const main = $('#main'), a = document.activeElement, keep = a && a.dataset && a.dataset.keep ? { k: a.dataset.keep, pos: a.selectionStart } : null;
  const same = lastKey === path, scroll = main.scrollTop; lastKey = path;
  if (!same) main.innerHTML = loading();
  let html;
  try { html = PAGES[parts[0]] ? await PAGES[parts[0]](parts, new URLSearchParams(q || '')) : '<div class="card empty"><h3>Page not found</h3></div>'; }
  catch (e) { html = `<div class="card empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p></div>`; }
  if (seq !== routeSeq) return;
  main.innerHTML = html; main.scrollTop = same ? scroll : 0; labelTables(); { const b = $('#bnav'); if (b) b.innerHTML = bnavHtml(); }
  if (keep) { const el = $(`[data-keep="${keep.k}"]`); if (el) { el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch { } } }
}
const refresh = () => route();
async function refreshBadges() { try { S.badges = await api('/badges'); const s = $('#side'); if (s) s.innerHTML = sideHtml(); } catch { } }
async function loadMeta() { S.meta = await api('/meta'); }
async function loadSession() { const me = await api('/me'); S.user = me.user; S.editable = me.editable; if (S.user.must_change_pw) return; await Promise.all([loadMeta(), refreshBadges()]); }
function forcePw() {
  $('#root').innerHTML = '<div class="login"></div>';
  openModal(`<h3>Choose a new password</h3><p class="muted">Your admin asked you to set your own password before you continue.</p><form id="fpw"><label class="f" style="margin-bottom:12px"><span>Current (temporary) password</span><input type="password" name="old" required></label><label class="f"><span>New password (min 6 characters)</span><input type="password" name="new" minlength="6" required></label><div class="modal-actions"><button type="button" class="btn" data-act="logout">Sign out</button><button class="btn primary">Save password</button></div></form>`, false, true);
  $('#fpw').addEventListener('submit', e => { e.preventDefault(); safe(async () => { await api('/me/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); S.user = null; toast('Password saved', 'ok'); route(); }); });
}
function logout() { localStorage.removeItem('hub_token'); S.token = null; S.user = null; $('#root').innerHTML = ''; loginView(); }
function loginView() {
  $('#root').innerHTML = `<div class="login"><form class="box" data-form="login"><div class="brand"><b>H</b> Department Hub</div>
    <h2 style="margin-bottom:4px">Welcome back</h2><p class="muted" style="margin:0 0 20px">Sign in with your email or employee code.</p>
    <label class="f" style="margin-bottom:14px"><span>Email or Employee code</span><input name="login" autocomplete="username" required autofocus></label>
    <label class="f" style="margin-bottom:20px"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Sign in</button></form></div>`;
}
function boot() { window.addEventListener('hashchange', route); route(); }

/* ---------- global event delegation ---------- */
const formObj = fm => { const o = {}; new FormData(fm).forEach((v, k) => { o[k] = k in o ? [].concat(o[k], v) : v; }); return o; };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  $$('details.menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
  if (!el) return;
  const f = ACT[el.dataset.act]; if (!f) return;
  e.preventDefault(); $$('details.menu[open]').forEach(d => d.open = false);
  safe(() => f(el.dataset, el, e));
});
document.addEventListener('submit', e => { const fm = e.target.closest('form[data-form]'); if (!fm) return; e.preventDefault(); const f = FORM[fm.dataset.form]; if (f) safe(() => f(formObj(fm), fm)); });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && CHG[el.dataset.change]) safe(() => CHG[el.dataset.change](el.value, el, el.dataset)); });
let inpTimer; document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (!el || !INP[el.dataset.input]) return; clearTimeout(inpTimer); inpTimer = setTimeout(() => safe(() => INP[el.dataset.input](el.value, el, el.dataset)), 320); });
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details.grp')) S.open[e.target.dataset.k] = e.target.open; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal[data-lock]')) closeModal(); });

ACT.closeModal = () => closeModal();
ACT.burger = () => $('#side').classList.toggle('open');
ACT.logout = () => logout();
ACT.setq = d => { const st = Q[d.page] = Q[d.page] || {}; st[d.key] = d.val; if (!d.keepPage) st.page = 1; route(); };
INP.setq = (v, el, d) => { const st = Q[d.page] = Q[d.page] || {}; st[d.key] = v; st.page = 1; route(); };
FORM.login = async o => { const r = await api('/login', { method: 'POST', body: o }); S.token = r.token; localStorage.setItem('hub_token', r.token); S.user = null; location.hash = '#/dashboard'; route(); };
ACT.export = d => {
  const t = $(`table[data-name="${d.name}"]`); if (!t) return;
  const keep = $$('th', t).map((th, i) => th.classList.contains('noexp') ? -1 : i).filter(i => i >= 0);
  const esc2 = s => '"' + String(s).replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"';
  const lines = [$$('th', t).filter((_, i) => keep.includes(i)).map(th => esc2(th.textContent)).join(',')];
  $$('tbody tr', t).forEach(tr => lines.push($$('td', tr).filter((_, i) => keep.includes(i)).map(td => esc2(td.textContent)).join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' })); a.download = d.name + '-' + todayISO() + '.csv'; a.click();
};
ACT.msgs = async d => {
  const draw = async () => {
    const list = await api(`/messages/${d.type}/${d.id}`);
    openModal(`<h3>Messages</h3><div class="thread">${list.length ? list.map(m => `<div class="bubble"><b>${esc(m.user_name || 'User')}</b><small>${fmtTS(m.created_at)}</small><div>${esc(m.text)}</div></div>`).join('') : '<p class="muted">No messages yet. Start the conversation below.</p>'}</div>
      <form id="msgf" class="row" style="flex-wrap:nowrap"><input name="text" style="flex:1" placeholder="Write a message…" autocomplete="off" required><button class="btn primary">Send</button></form>
      <div class="modal-actions"><button class="btn" data-act="closeModal">Close</button></div>`);
    $('#msgf').addEventListener('submit', async e => { e.preventDefault(); const text = new FormData(e.target).get('text'); await safe(async () => { await api(`/messages/${d.type}/${d.id}`, { method: 'POST', body: { text } }); await draw(); }); });
    const t = $('.thread'); if (t) t.scrollTop = t.scrollHeight;
  };
  await draw();
};
