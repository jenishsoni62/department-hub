'use strict';
/* Pages: Dashboard · Help tickets · Recurring tasks · Delegation · Review */
CHG.setq = (v, el, d) => { const st = Q[d.page] = Q[d.page] || {}; st[d.key] = v; st.page = 1; route(); };
const PRIORITIES = ['High', 'Medium', 'Low'].map(x => ({ v: x, l: x }));
const FREQS = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'Once'].map(x => ({ v: x, l: x }));

/* ======================= DASHBOARD ======================= */
const BK = [['not_started', 'Not Started', '#94a3b8'], ['in_progress', 'In Progress', '#f59e0b'], ['hold', 'On Hold', '#8b5cf6'], ['under_review', 'Under Review', '#6366f1'], ['completed', 'Completed', '#10b981'], ['not_done', 'Not Done', '#ef4444'], ['archived', 'Archived', '#cbd5e1']];
PAGES.dashboard = async () => {
  title('Dashboard');
  const st = qs('dash', { dept: '', period: 'all', view: (mgr() || isPC()) ? 'team' : 'my' });
  const [d, ov] = await Promise.all([api(`/dashboard?view=${st.view}&period=${st.period}&dept=${st.dept}`), (mgr() || isPC()) ? api('/overview') : null]), T = d.totals;
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const dot = (c, t) => `<span class="muted sm"><span style="color:${c}">●</span> ${t}</span>`;
  const overview = ov && !ov.none ? `<div class="page-h"><div><h2>${greet}, <span style="color:var(--brand)">${esc(S.user.name.split(' ')[0])}</span></h2><p>Here's what's happening ${ov.scope === 'dept' ? 'in your department' : 'across your workspace'} today.</p></div><span class="sp"></span><span class="badge">📅 ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    <div class="grid g3" style="margin-bottom:14px"><div class="card kpi" style="--c:#2563eb"><span>Departments</span><strong>${ov.departments}</strong><small>${dot('#10b981', 'Active ' + ov.departments)} &nbsp; ${dot('#94a3b8', 'Inactive 0')}</small></div>
      <div class="card kpi" style="--c:#10b981"><span>Users</span><strong>${ov.users.total}</strong><small>${dot('#10b981', 'Active ' + ov.users.active)} &nbsp; ${dot('#94a3b8', 'Inactive ' + ov.users.inactive)}</small></div>
      <div class="card kpi" style="--c:#f59e0b"><span>Help tickets</span><strong>${ov.tickets.total}</strong><small>${dot('#f59e0b', 'Open ' + ov.tickets.open)} &nbsp; ${dot('#3b82f6', 'In progress ' + ov.tickets.in_progress)} &nbsp; ${dot('#10b981', 'Closed ' + ov.tickets.closed)}</small></div></div>
    <div class="row" style="margin-bottom:16px">${isPC() ? '' : '<a class="btn" href="#/tickets/create">' + ic('life', 15) + ' New help ticket</a>'}${mgr() ? '<a class="btn" href="#/admin/users">' + ic('users', 15) + ' Add user</a>' : ''}${isAdmin() ? '<a class="btn" href="#/admin/departments">Departments</a>' : ''}${mgr() ? '<a class="btn" href="#/admin/access">' + ic('shield', 15) + ' Permissions</a>' : ''}<a class="btn" href="#/holidays">Holidays</a>${isAdmin() ? '<a class="btn" href="#/admin/settings">Settings</a>' : ''}<a class="btn" href="#/report">${ic('chart', 15)} MIS Report</a></div>
    <div class="grid g2" style="margin-bottom:22px"><div class="card flush"><div class="mod-h" style="padding:16px 18px 4px"><h3>Recent users</h3>${mgr() ? '<a class="sm" href="#/admin/users">View all</a>' : ''}</div><p class="muted sm" style="margin:0;padding:0 18px 8px">Latest people added to the workspace.</p>
      ${table('recent-users', ['Name', 'Email', 'Status'], ov.recent_users.map(u => `<tr><td>${avatar(u.name, 'sm')} <b>${esc(u.name)}</b></td><td>${esc(u.email || '—')}</td><td>${u.active ? badge('Active', 'green') : badge('Inactive')}</td></tr>`), { emptyTitle: 'No users yet' })}</div>
      <div class="card"><div class="mod-h"><h3>Workspace overview</h3></div><p class="muted sm" style="margin:0 0 6px">What your team is using right now.</p>${[['Users (active)', ov.utilisation.users, ov.users.total || 1, '#2563eb'], ['FMS workflows', ov.utilisation.fms, Math.max(ov.utilisation.fms, 1), '#10b981'], ['Recurring tasks', ov.utilisation.recurring, Math.max(ov.utilisation.recurring, 1), '#f59e0b'], ['Delegation boards', ov.utilisation.boards, Math.max(ov.utilisation.boards, 1), '#8b5cf6'], ['Help tickets', ov.utilisation.tickets, Math.max(ov.utilisation.tickets, 1), '#ef4444']].map(([l, n, m, c]) => `<div class="bar-row" style="grid-template-columns:130px 1fr 40px"><span>${l}</span><div class="bar"><i style="width:${Math.round(n / m * 100)}%;background:${c}"></i></div><b>${n}</b></div>`).join('')}</div></div>` : '';
  const kpis = [['Total tasks', T.total, '#2563eb', 'All tasks in period'], ['Open', T.open, '#f59e0b', 'Live across selected period'], ['Overdue', T.overdue, '#ef4444', 'Open and past due date'], ['Rework', T.rework, '#8b5cf6', 'Sent back for rework'], ['Not done', T.not_done, '#64748b', 'Explicitly marked not done'], ['Closed', T.closed, '#10b981', 'Completed & closed']];
  const mods = [['tickets', 'Help Tickets', '#/tickets/assigned'], ['recurring', 'Recurring Tasks', '#/recurring/my'], ['delegation', 'Delegation Tasks', '#/delegation/my'], ['process', 'Process Tasks', '#/fms/my']];
  return `${overview}<div class="page-h"><div><h2>Task Management Dashboard</h2><p>Real-time overview of tickets, recurring checklists, delegation and process work.</p></div><span class="sp"></span>
    <select data-change="setq" data-page="dash" data-key="dept">${deptOpts(st.dept, 'All departments')}</select>
    ${pills('dash', 'period', [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All']], st.period)}
    <div class="seg"><button class="${st.view === 'team' ? 'on' : ''}" data-act="setq" data-page="dash" data-key="view" data-val="team">Team view</button><button class="${st.view === 'my' ? 'on' : ''}" data-act="setq" data-page="dash" data-key="view" data-val="my">My view</button></div></div>
  <div class="grid g4" style="margin-bottom:16px">${kpis.map(k => `<div class="card kpi" style="--c:${k[2]}"><span>${k[0]}</span><strong>${k[1]}</strong><small>${k[3]}</small></div>`).join('')}</div>
  <h3 style="margin:22px 0 10px">Status overview</h3>
  <div class="grid g2" style="margin-bottom:16px">${mods.map(([k, l, link]) => { const m = d.modules[k]; return `<div class="card"><div class="mod-h"><h3>${l}</h3><span class="muted sm">${m.total} task${m.total === 1 ? '' : 's'}${m.overdue ? ` · <b style="color:var(--red)">${m.overdue} overdue</b>` : ''}</span></div>
      ${m.total ? BK.filter(b => m.buckets[b[0]]).map(b => `<div class="bar-row"><span>${b[1]}</span><div class="bar"><i style="width:${Math.round(m.buckets[b[0]] / m.total * 100)}%;background:${b[2]}"></i></div><b>${m.buckets[b[0]]}</b></div>`).join('') : '<p class="muted">No tasks in this period.</p>'}
      <a class="sm" href="${link}">Open ${l.toLowerCase()} →</a></div>`; }).join('')}</div>
  <div class="grid g2">
    <div class="card"><h3 style="margin-bottom:8px">My overdue work</h3>${d.myOverdue.length ? d.myOverdue.map(o => `<a href="${o.link}" class="row" style="padding:9px 0;border-bottom:1px solid var(--line);color:inherit;flex-wrap:nowrap"><span class="badge blue">${o.type}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.title)}</span><span class="badge red">${o.days}d late</span></a>`).join('') : '<div class="empty" style="padding:24px">🎉 Nothing overdue. Nice work!</div>'}</div>
    ${st.view === 'team' && d.byDept.length ? `<div class="card flush"><div style="padding:16px 18px 6px"><h3>Department performance</h3></div>${table('dept-performance', ['Department', 'Total', 'Open', 'Overdue', 'Closed', 'Completion'], d.byDept.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${x.total}</td><td>${x.open}</td><td>${x.overdue ? badge(x.overdue, 'red') : 0}</td><td>${x.closed}</td><td style="min-width:130px"><div class="bar"><i style="width:${x.total ? Math.round(x.closed / x.total * 100) : 0}%;background:#10b981"></i></div><span class="muted sm">${x.total ? Math.round(x.closed / x.total * 100) : 0}%</span></td></tr>`))}</div>` : ''}
  </div>`;
};

/* ======================= HELP TICKETS ======================= */
PAGES.tickets = async parts => {
  const scope = parts[1] || 'assigned';
  if (scope === 'create') return ticketForm();
  title(scope === 'team' ? 'Team Help Tickets' : 'My Help Tickets');
  const st = qs('tickets', { state: 'open', dept: '', q: '' });
  const d = await api(`/tickets?scope=${scope}&state=${st.state}&dept=${st.dept}&q=${encodeURIComponent(st.q || '')}`), c = d.counts;
  const tabs = scope === 'team' ? '' : `<div class="pills">${[['assigned', 'Assigned to me'], ['created', 'Created by me'], ['unassigned', 'Unassigned'], ['transfer', 'Transferred to other']].map(([k, l]) => `<a class="pill${scope === k ? ' on' : ''}" href="#/tickets/${k}">${l}</a>`).join('')}</div>`;
  const rows = d.rows.map(t => `<tr class="${t.delay_days ? 'over' : ''}"><td class="id">${t.uid}</td><td class="nowrap">${fmtD(t.created_at)}</td><td>${delayBadge(t.delay_days, t.late_days)}</td><td class="nowrap">${fmtD(t.due_date)}</td><td>${esc(t.issue_type || '—')}</td>
    <td><div class="desc" title="${esc(t.description)}">${esc(t.description)}</div>${t.rework ? `<span class="badge purple">Rework ×${t.rework}</span>` : ''}</td><td>${msgBtn('ticket', t.id, t.msgs)}</td>
    <td>${esc(t.created_by_name)}<br><span class="muted sm">${esc(t.dept_name)}</span></td><td>${doerCell(t)}</td><td>${stBadge(t.status)}</td><td class="noexp">${ticketActions(t)}</td></tr>`);
  return `<div class="page-h"><div><h2>Help Ticket – ${scope === 'team' ? 'Team' : 'My Help'}</h2><p>${scope === 'team' ? 'Tickets across the departments you can access.' : 'Raise, track and close help requests.'}</p></div><span class="sp"></span>${exportBtn('tickets')}${isPC() ? '' : `<a class="btn green" href="#/tickets/create">${ic('plus', 16)} Create ticket</a>`}</div>
  ${tabs}${pills('tickets', 'state', [['open', 'Open Tickets', c.open], ['in_progress', 'In Progress', c.in_progress], ['overdue', 'Overdue', c.overdue], ['closed', 'Closed Tickets', c.closed], ['archive', 'Archive', c.archive], ['hold', 'Hold', c.hold], ['not_done', 'Not Done', c.not_done]], st.state, 'sub')}
  <div class="filters"><select data-change="setq" data-page="tickets" data-key="dept">${deptOpts(st.dept, 'All departments')}</select>${searchBox('tickets', st.q, 'Search ticket, description, person…')}</div>
  ${table('tickets', ['Ticket ID', 'Created', 'Delay', 'Due date', 'Issue type', 'Description', 'Msg', 'Created by', 'Doer', 'Status', '!Actions'], rows, { emptyTitle: 'No tickets here', empty: 'Nothing matches this tab right now.' })}`;
};
const doerCell = t => t.doer_id ? `${avatar(t.doer_name, 'sm')} ${esc(t.doer_name)}` :
  (canEditDept('tickets', t.dept_id) && !isPC() ? `<select data-change="tkAssign" data-id="${t.id}"><option value="">Assign doer…</option>${userOpts('', null, u => u.dept_id === t.dept_id || u.role === 'hod')}</select>` : badge('Unassigned', 'amber'));
function ticketActions(t) {
  if (isPC()) return '';
  const me = S.user.id, doer = t.doer_id === me, mg = canEditDept('tickets', t.dept_id), creator = t.created_by === me, id = t.id;
  const live = ['open', 'in_progress'].includes(t.status); let main = '';
  if (live && (doer || mg)) main = `<button class="btn green xs" data-act="tk" data-a="done" data-id="${id}" data-proof="${t.needs_proof}">${ic('check', 14)} Done</button>`;
  if (t.status === 'review' && (t.reviewer_id === me || mg)) main = `<button class="btn green xs" data-act="tk" data-a="approve" data-id="${id}">Approve</button>`;
  return `<div class="row" style="flex-wrap:nowrap">${main}${menu([
    live && t.status === 'open' && (doer || mg) && ['Start work', 'tk', { a: 'start', id }], (live || t.status === 'hold') && t.status !== 'hold' && (doer || mg) && ['Put on hold', 'tk', { a: 'hold', id }],
    t.status === 'hold' && (doer || mg) && ['Resume', 'tk', { a: 'start', id }], live && (doer || mg) && ['Mark not done', 'tk', { a: 'not_done', id }], t.status === 'review' && (t.reviewer_id === me || mg) && ['Send back for rework', 'tk', { a: 'rework', id }],
    (live || t.status === 'hold') && (doer || mg) && ['Transfer to someone else', 'tk', { a: 'transfer', id }], ['done', 'not_done'].includes(t.status) && (creator || mg) && ['Archive', 'tk', { a: 'archive', id }], ['done', 'not_done', 'archived'].includes(t.status) && (creator || mg) && ['Re-open', 'tk', { a: 'reopen', id }]])}</div>`;
}
ACT.tk = async d => {
  const body = { action: d.a };
  if (d.a === 'done' && d.proof === '1') { const r = await ask({ title: 'Proof required', text: 'This ticket needs proof before it can be closed.', fields: [{ name: 'remarks', label: 'Note or link to proof', type: 'textarea', required: true }], ok: 'Mark done' }); if (!r) return; body.remarks = r.remarks; }
  if (d.a === 'transfer') { const r = await ask({ title: 'Transfer ticket', fields: [{ name: 'doer_id', label: 'New doer', type: 'select', required: true, options: S.meta.users.filter(u => u.active).map(u => ({ v: u.id, l: u.name })), blank: 'Select person' }], ok: 'Transfer' }); if (!r) return; body.doer_id = r.doer_id; }
  if (d.a === 'rework') { const r = await ask({ title: 'Send back for rework', fields: [{ name: 'note', label: 'What needs fixing? (optional)', type: 'textarea' }], ok: 'Send back' }); if (!r) return; if (r.note) await api(`/messages/ticket/${d.id}`, { method: 'POST', body: { text: 'Rework: ' + r.note } }); }
  await api('/tickets/' + d.id, { method: 'PATCH', body }); toast('Ticket updated', 'ok'); refreshBadges(); route();
};
CHG.tkAssign = async (v, el, d) => { if (!v) return; await api('/tickets/' + d.id, { method: 'PATCH', body: { action: 'assign', doer_id: v } }); toast('Doer assigned', 'ok'); route(); };
function ticketForm() {
  title('Create Help Ticket');
  return `<div class="page-h"><div><h2>Create Help Ticket</h2><p>Raise a help ticket and route it to the right doer.</p></div></div>
  <form class="card" data-form="ticket" style="max-width:900px">
    <div class="switch-row" style="margin-bottom:18px"><label class="check"><input type="checkbox" id="multi" data-change="tkMulti"><span><b>Create this ticket for multiple doers</b><br><span class="muted sm">Turn on to send the same ticket to several doers at once — each doer gets their own copy.</span></span></label></div>
    <div class="form">
      <label class="f"><span class="req">Doer department</span><select name="dept_id" required data-change="tkDept">${deptOpts('', 'Select department')}</select></label>
      <label class="f" id="doer1"><span>Doer</span><select name="doer_id" id="doersel"><option value="">I don't know (HOD will assign)</option></select></label>
      <div class="f hide" id="doerMulti"><span style="font-weight:600;font-size:13px">Doers</span><div class="people" id="doerChecks"><span class="muted">Choose a department first</span></div></div>
      <label class="f"><span>Department head</span><input id="hodname" readonly placeholder="Filled automatically"></label>
      <label class="f"><span class="req">Task type</span><input name="issue_type" list="itl" required placeholder="Choose or type a new one"><datalist id="itl">${S.meta.issueTypes.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist></label>
      <label class="f"><span>Select reviewer</span><select name="reviewer_id">${userOpts('', 'No reviewer')}</select></label>
      <label class="f"><span class="req">Due date</span><input type="date" name="due_date" required min="${todayISO()}"></label>
      <label class="f"><span class="req">Priority</span><select name="priority">${optHtml(PRIORITIES, 'Medium')}</select></label>
      <label class="f" style="grid-column:1/-1"><span class="req">Task description</span><textarea name="description" required placeholder="Describe the issue or request clearly"></textarea></label>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" name="needs_proof"> Proof document / note must be added to complete this task</label>
    </div>
    <div class="modal-actions"><a class="btn" href="#/tickets/assigned">Cancel</a><button class="btn primary">Submit ticket</button></div></form>`;
}
const doersFor = dept => { const l = S.meta.users.filter(u => u.active && (u.dept_id === Number(dept))); return l.length ? l : S.meta.users.filter(u => u.active); };
CHG.tkDept = v => {
  const dp = S.meta.departments.find(x => x.id === Number(v)); $('#hodname').value = dp && dp.hod_name ? dp.hod_name : '';
  const l = v ? doersFor(v) : []; $('#doersel').innerHTML = `<option value="">I don't know (HOD will assign)</option>` + l.map(u => `<option value="${u.id}">${esc(u.name)}${u.emp_code ? ' – ' + esc(u.emp_code) : ''}</option>`).join('');
  $('#doerChecks').innerHTML = l.length ? l.map(u => `<label class="check"><input type="checkbox" name="doer_ids" value="${u.id}"> ${esc(u.name)}</label>`).join('') : '<span class="muted">Choose a department first</span>';
};
CHG.tkMulti = (v, el) => { $('#doer1').classList.toggle('hide', el.checked); $('#doerMulti').classList.toggle('hide', !el.checked); };
FORM.ticket = async o => {
  const multi = $('#multi').checked; const body = { ...o, needs_proof: !!o.needs_proof };
  if (multi) { body.doer_ids = arr(o.doer_ids); if (!body.doer_ids.length) throw new Error('Pick at least one doer'); }
  const r = await api('/tickets', { method: 'POST', body }); toast(`${r.ids.length} ticket${r.ids.length > 1 ? 's' : ''} created`, 'ok'); refreshBadges(); location.hash = '#/tickets/created';
};

/* ======================= RECURRING (CHECKLIST) ======================= */
PAGES.recurring = async parts => parts[1] === 'create' ? recForm() : recList(parts[1] === 'team' ? 'team' : 'my');
async function recList(scope) {
  title(scope === 'my' ? 'My Recurring' : 'Team Recurring');
  const key = 'rec-' + scope, st = qs(key, { range: 'today', dept: '', category: '', frequency: '', q: '', date: '', page: 1 });
  const d = await api(`/recurring?scope=${scope}&range=${st.range}&page=${st.page}&dept=${st.dept}&category=${encodeURIComponent(st.category)}&frequency=${st.frequency}&q=${encodeURIComponent(st.q)}&date=${st.date}`), c = d.counts;
  const tabs = [['today', 'Today', c.today], ['overdue', 'Overdue', c.overdue], ['week', 'This Week', c.week], ['nextweek', 'Next Week', c.nextweek], ['lastweek', 'Last Week', c.lastweek], ['unique', 'Unique Task', c.unique], ['notdone', 'Not Done', c.notdone]];
  if (scope === 'team') tabs.push(['all', 'All', c.all]);
  const sel = new Set(String(st.dept).split(',').filter(Boolean));
  const deptPick = scope === 'team' ? `<details class="menu"><summary class="btn" style="font-weight:500">${sel.size ? sel.size + ' department(s)' : 'All departments'} ▾</summary><div class="menu-pop" style="min-width:230px;max-height:300px;overflow:auto;padding:10px">${S.meta.departments.map(x => `<label class="check" style="padding:4px 2px"><input type="checkbox" class="dsel" value="${x.id}" ${sel.has(String(x.id)) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}<button class="btn primary xs" style="margin-top:8px" data-act="deptApply" data-key="${key}">Apply</button></div></details>` : '';
  let body;
  if (d.kind === 'templates') {
    body = table('recurring-tasks', ['Task ID', 'Description', 'Category', 'Frequency', 'Doer', 'Starts', 'Ends', 'Priority', 'Status', '!Actions'], d.rows.map(r => `<tr><td class="id">${r.uid}</td><td><div class="desc">${esc(r.description)}</div></td><td>${esc(r.category || '—')}</td><td>${badge(r.frequency, 'blue')}</td><td>${esc(r.doer_name || '—')}<br><span class="muted sm">${esc(r.dept_name || '')}</span></td><td class="nowrap">${fmtD(r.start_date)}</td><td class="nowrap">${fmtD(r.end_date)}</td><td>${prio(r.priority)}</td><td>${r.active ? badge('Active', 'green') : badge('Stopped')}</td>
      <td class="noexp">${canEditDept('recurring', r.dept_id) ? menu([['Edit', 'recEdit', { id: r.id }], r.active ? ['Stop this task', 'recStop', { id: r.id }, 'danger'] : null]) : ''}</td></tr>`), { emptyTitle: 'No recurring tasks yet', empty: 'Create one, or import many from Excel.' });
  } else {
    body = table('recurring', ['Task ID', 'Description', 'Category', 'Frequency', ...(scope === 'team' ? ['Doer'] : []), 'Task date', 'Delay', 'Status', 'Msg', '!Action'], d.rows.map(r => `<tr class="${r.delay_days ? 'over' : ''}"><td class="id">${r.uid}</td><td><div class="desc" title="${esc(r.description)}">${esc(r.description)}</div>${r.remarks ? `<div class="muted sm">Note: ${esc(r.remarks)}</div>` : ''}</td><td>${esc(r.category || '—')}</td><td>${badge(r.frequency, 'blue')}</td>${scope === 'team' ? `<td>${esc(r.doer_name || '—')}<br><span class="muted sm">${esc(r.dept_name || '')}</span></td>` : ''}
      <td class="nowrap">${fmtD(r.due_date)}</td><td>${delayBadge(r.delay_days, r.late_days)}</td><td>${stBadge(r.status)}</td><td>${msgBtn('recurring', r.id, r.msgs)}</td><td class="noexp">${recActions(r)}</td></tr>`),
      { foot: pager(key, 'page', st.page, d.total || 0), emptyTitle: 'All clear', empty: 'No tasks in this tab.' });
  }
  return `<div class="page-h"><div><h2>${scope === 'my' ? 'My Recurring' : 'Team Recurring'}</h2><p>Daily, weekly and monthly checklist work, generated automatically.</p></div><span class="sp"></span>${exportBtn(d.kind === 'templates' ? 'recurring-tasks' : 'recurring')}${(mgr() || hasEdit('recurring')) ? `<a class="btn" href="#/import?type=recurring">${ic('upload', 16)} Import</a><a class="btn green" href="#/recurring/create">${ic('plus', 16)} Create</a>` : ''}</div>
  ${pills(key, 'range', tabs, st.range)}
  <div class="filters">${deptPick}<select data-change="setq" data-page="${key}" data-key="category">${lookOpts(S.meta.categories, st.category, 'All categories')}</select><select data-change="setq" data-page="${key}" data-key="frequency">${optHtml(FREQS, st.frequency, 'All frequencies')}</select>
    <input type="date" value="${esc(st.date)}" data-change="setq" data-page="${key}" data-key="date" title="Task date">${searchBox(key, st.q, 'Search description or ID…')}${st.date || st.category || st.frequency || st.dept || st.q ? `<button class="btn" data-act="clearq" data-page="${key}">Clear filters</button>` : ''}</div>${body}`;
}
ACT.deptApply = d => { const st = Q[d.key]; st.dept = $$('.dsel:checked').map(x => x.value).join(','); st.page = 1; route(); };
ACT.clearq = d => { Object.assign(Q[d.page], { dept: '', category: '', frequency: '', q: '', date: '', page: 1 }); route(); };
function recActions(r) {
  if (isPC()) return ''; const ok = r.doer_id === S.user.id || canEditDept('recurring', r.dept_id); if (!ok) return '';
  if (r.status === 'pending') return `<div class="row" style="flex-wrap:nowrap"><button class="btn green xs" data-act="rec" data-a="done" data-id="${r.id}" data-proof="${r.needs_proof}">${ic('check', 14)} Mark as Done</button>${menu([['Mark not done', 'rec', { a: 'not_done', id: r.id }]])}</div>`;
  return menu([['Undo (back to pending)', 'rec', { a: 'undo', id: r.id }]]);
}
ACT.rec = async d => {
  const body = { action: d.a };
  if (d.a === 'not_done' || (d.a === 'done' && d.proof === '1')) { const r = await ask({ title: d.a === 'done' ? 'Proof required' : 'Why was it not done?', fields: [{ name: 'remarks', label: d.a === 'done' ? 'Note or link to proof' : 'Reason', type: 'textarea', required: true }], ok: d.a === 'done' ? 'Mark done' : 'Save' }); if (!r) return; body.remarks = r.remarks; }
  await api('/recurring/instances/' + d.id, { method: 'PATCH', body }); toast('Updated', 'ok'); refreshBadges(); route();
};
ACT.recEdit = async d => {
  const t = (await api('/recurring?scope=team&range=unique')).rows.find(x => String(x.id) === d.id); if (!t) return;
  const r = await ask({ title: 'Edit recurring task ' + t.uid, fields: [{ name: 'description', label: 'Description', type: 'textarea', value: t.description, required: true }, { name: 'doer_id', label: 'Doer', type: 'select', value: t.doer_id, options: S.meta.users.filter(u => u.active).map(u => ({ v: u.id, l: u.name })) }, { name: 'category', label: 'Category', value: t.category }, { name: 'priority', label: 'Priority', type: 'select', value: t.priority, options: PRIORITIES }, { name: 'end_date', label: 'End date (optional)', type: 'date', value: t.end_date }] });
  if (!r) return; await api('/recurring/templates/' + d.id, { method: 'PATCH', body: r }); toast('Saved', 'ok'); route();
};
ACT.recStop = async d => { if (!(await confirmBox('Stop this recurring task?', 'No new tasks will be created. Existing ones stay as they are.', 'Stop task'))) return; await api('/recurring/templates/' + d.id, { method: 'PATCH', body: { active: false } }); route(); };
let recTpl = [];
async function recForm() {
  title('Create Recurring Task');
  recTpl = (await api('/recurring?scope=team&range=unique')).rows;
  const eds = S.editable.recurring === 'all' ? null : S.editable.recurring;
  return `<div class="page-h"><div><h2>Create Recurring Task</h2><p>Set up a task that repeats on its own — assign it to one doer.</p></div></div>
  <form class="card" data-form="recurring" style="max-width:900px"><div class="form">
    <label class="f" style="grid-column:1/-1"><span>Inherit task <small>(optional – copy settings from an existing task)</small></span><select data-change="recInherit"><option value="">Start from scratch</option>${recTpl.map(t => `<option value="${t.id}">${esc(t.uid)} · ${esc(t.description.slice(0, 60))}</option>`).join('')}</select></label>
    <label class="f"><span class="req">Doer department</span><select name="dept_id" required data-change="recDept">${deptOpts('', 'Select department', eds)}</select></label>
    <label class="f"><span class="req">Doer</span><select name="doer_id" id="recdoer" required><option value="">Choose department first</option></select></label>
    <label class="f"><span>Category</span><input name="category" list="catl" placeholder="Choose or type new"><datalist id="catl">${S.meta.categories.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist></label>
    <label class="f"><span class="req">Task frequency</span><select name="frequency" required>${optHtml(FREQS, 'Daily')}</select></label>
    <label class="f"><span class="req">Start date</span><input type="date" name="start_date" required value="${todayISO()}"></label>
    <label class="f"><span>End date</span><input type="date" name="end_date"></label>
    <div class="notice blue" style="grid-column:1/-1">The start date decides the repeat day — e.g. a <b>Monthly</b> task starting on the 5th repeats on the 5th of every month. Daily tasks skip Sundays and the holidays in your Holiday Calendar.</div>
    <label class="f" style="grid-column:1/-1"><span class="req">Task description</span><textarea name="description" required></textarea></label>
    <div class="f" style="grid-column:1/-1"><span style="font-weight:600;font-size:13px">Who can perform the task?</span><div class="row"><label class="check"><input type="radio" name="performer" value="deo"> Data entry operator only</label><label class="check"><input type="radio" name="performer" value="doer" checked> Assigned doer only</label></div></div>
    <label class="check"><input type="checkbox" name="on_time"> Check if task submission on time</label><label class="check"><input type="checkbox" name="needs_proof"> Check if this task needs document proof</label>
    <label class="f"><span>Select reviewer</span><select name="reviewer_id">${userOpts('', 'No reviewer')}</select></label>
    <label class="f"><span class="req">Priority</span><select name="priority">${optHtml(PRIORITIES, 'Medium')}</select></label>
  </div><div class="modal-actions"><a class="btn" href="#/recurring/my">Cancel</a><button class="btn primary">Create task</button></div></form>`;
}
CHG.recDept = v => { $('#recdoer').innerHTML = '<option value="">Select doer</option>' + (v ? doersFor(v) : []).map(u => `<option value="${u.id}">${esc(u.name)}${u.emp_code ? ' – ' + esc(u.emp_code) : ''}</option>`).join(''); };
CHG.recInherit = v => {
  const t = recTpl.find(x => String(x.id) === v); if (!t) return; const f = $('form[data-form="recurring"]');
  f.dept_id.value = t.dept_id; CHG.recDept(t.dept_id); f.doer_id.value = t.doer_id; f.category.value = t.category || ''; f.frequency.value = t.frequency; f.description.value = t.description; f.priority.value = t.priority || 'Medium'; f.reviewer_id.value = t.reviewer_id || '';
  f.needs_proof.checked = !!t.needs_proof; f.on_time.checked = !!t.on_time;
};
FORM.recurring = async o => { const r = await api('/recurring', { method: 'POST', body: { ...o, on_time: !!o.on_time, needs_proof: !!o.needs_proof } }); toast(`Created ${r.uid}`, 'ok'); location.hash = '#/recurring/team'; };

/* ======================= DELEGATION ======================= */
PAGES.delegation = async parts => (parts[1] === 'my' || parts[1] === 'team') ? delTasks(parts[1]) : boardsPage();
const COLORS = ['#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a', '#0d9488', '#0891b2', '#475569', '#0f172a'];
const ICONS = ['📋', '📊', '📈', '🎯', '🚀', '🔥', '⭐', '🏆', '📌', '📁', '🛠️', '⚙️', '🧩', '📦', '🏗️', '💡', '🧾', '🛒'];
async function boardsPage() {
  title('Delegation Board');
  const st = qs('board', { id: '', status: 'not_started', q: '', archived: '0' });
  const boards = await api('/boards?archived=' + st.archived);
  const head = `<div class="page-h"><div><h2>Delegation Board</h2><p>Create boards, delegate tasks and track progress across your team.</p></div><span class="sp"></span>
    <div class="seg"><button class="${st.archived === '0' ? 'on' : ''}" data-act="setq" data-page="board" data-key="archived" data-val="0">Active</button><button class="${st.archived === '1' ? 'on' : ''}" data-act="setq" data-page="board" data-key="archived" data-val="1">Archived</button></div>
    ${isPC() ? '' : `<a class="btn" href="#/import?type=delegation">${ic('upload', 16)} Import</a><button class="btn green" data-act="boardNew">${ic('plus', 16)} Create board</button>`}</div>`;
  if (!boards.length) return head + `<div class="card empty">${ic('users', 34)}<h3>No boards yet</h3><p>Create your first board to start delegating tasks.</p></div>`;
  const cur = boards.find(b => String(b.id) === String(st.id)) || boards[0]; st.id = cur.id;
  const d = await api(`/delegation/tasks?scope=board&board=${cur.id}&status=${st.status}&q=${encodeURIComponent(st.q)}`), c = d.counts;
  const ownerEdit = isAdmin() || cur.owner_id === S.user.id || (role() === 'hod' && cur.dept_id === S.user.dept_id);
  const rows = d.rows.map(t => `<tr class="${t.delay_days ? 'over' : ''}"><td class="id">#${t.id}</td><td><b>${esc(t.title)}</b>${t.revisions ? ` ${badge('Date moved ×' + t.revisions, 'amber')}` : ''}${t.description ? `<div class="muted sm desc">${esc(t.description)}</div>` : ''}</td><td>${avatar(t.assigned_name, 'sm')} ${esc(t.assigned_name || '—')}</td><td class="nowrap">${fmtD(t.created_at)}</td>
    <td class="nowrap">${fmtD(t.due_date)} ${t.req_date ? `<br><span class="badge amber" title="${esc(t.req_reason || '')}">Change requested → ${fmtD(t.req_date)}</span>` : ''}</td><td>${delayBadge(t.delay_days)}</td><td>${prio(t.priority)}</td><td>${msgBtn('delegation', t.id, t.msgs)}</td><td class="noexp">${delActions(t)}</td></tr>`);
  return head + `<div class="boards">${boards.map(b => `<button class="bt${b.id === cur.id ? ' on' : ''}" style="--bc:${esc(b.color)}" data-act="setq" data-page="board" data-key="id" data-val="${b.id}">${esc(b.icon)} ${esc(b.name)} <span class="badge">${(b.counts.not_started || 0) + (b.counts.in_progress || 0) + (b.counts.under_review || 0) + (b.counts.hold || 0)}</span></button>`).join('')}</div>
  <div class="card" style="margin-bottom:14px"><div class="row" style="flex-wrap:nowrap"><div class="bicon" style="background:${esc(cur.color)}">${esc(cur.icon)}</div><div style="flex:1;min-width:0"><h3>${esc(cur.name)}</h3><div class="muted sm">${(c.not_started || 0) + (c.in_progress || 0) + (c.hold || 0)} open · ${c.under_review || 0} in review · ${c.done || 0} done · ${cur.members.length} member${cur.members.length === 1 ? '' : 's'}${cur.dept_name ? ' · ' + esc(cur.dept_name) : ''}${cur.end_date ? ' · ends ' + fmtD(cur.end_date) : ''}</div></div>
    <div class="row" style="gap:0">${cur.members.slice(0, 6).map(m => avatar(m.name, 'sm')).join('')}</div>${ownerEdit ? `<button class="btn xs" data-act="boardEdit" data-id="${cur.id}">${ic('edit', 14)} Edit</button>` : ''}</div></div>
  ${pills('board', 'status', [['not_started', 'Not Started', c.not_started || 0], ['in_progress', 'In Progress', c.in_progress || 0], ['under_review', 'Under Review', c.under_review || 0], ['done', 'Done', c.done || 0], ['hold', 'Hold', c.hold || 0]], st.status, 'sub')}
  <div class="filters">${searchBox('board', st.q, 'Search tasks…')}<span class="sp" style="flex:1"></span>${exportBtn('board-tasks')}${cur.my_level === 'editor' && !isPC() ? `<button class="btn green" data-act="delAdd" data-board="${cur.id}">${ic('plus', 16)} Add new task</button>` : ''}</div>
  ${table('board-tasks', ['Task ID', 'Task', 'Assigned to', 'Created', 'Due date', 'Delay', 'Priority', 'Msg', '!Action'], rows, { emptyTitle: 'No tasks in this status', empty: 'Tasks you add to this board will show up here.' })}`;
}
function delActions(t) {
  if (!t.can_act) return ''; const me = S.user.id, mine = t.assigned_to === me, id = t.id; let main = '';
  if (t.status === 'under_review' && t.can_manage) main = `<button class="btn green xs" data-act="del" data-a="approve" data-id="${id}">Approve</button>`;
  else if (t.status !== 'done' && t.status !== 'under_review') main = `<button class="btn green xs" data-act="del" data-a="done" data-id="${id}">${ic('check', 14)} Mark as Done</button>`;
  return `<div class="row" style="flex-wrap:nowrap">${main}${menu([
    ['not_started', 'in_progress', 'hold'].includes(t.status) && t.status !== 'in_progress' && ['In progress', 'del', { a: 'status', s: 'in_progress', id }], ['not_started', 'in_progress'].includes(t.status) && ['Put on hold', 'del', { a: 'status', s: 'hold', id }], t.status === 'hold' && ['Resume (not started)', 'del', { a: 'status', s: 'not_started', id }],
    t.status === 'under_review' && t.can_manage && ['Send back for rework', 'del', { a: 'rework', id }], mine && t.status !== 'done' && ['Request date change', 'delDate', { id }], t.req_date && t.can_manage && [`Approve new date (${fmtD(t.req_date)})`, 'del', { a: 'approve_date', id }], t.req_date && t.can_manage && ['Reject date change', 'del', { a: 'reject_date', id }],
    t.can_manage && ['Edit task', 'delEdit', { id, t: t.title, d: t.description || '', due: t.due_date || '', to: t.assigned_to, p: t.priority }], t.can_manage && ['Delete task', 'del', { a: 'delete', id }, 'danger']])}</div>`;
}
ACT.del = async d => {
  if (d.a === 'delete' && !(await confirmBox('Delete this task?', 'This cannot be undone.', 'Delete'))) return;
  const body = d.a === 'status' ? { action: 'status', status: d.s } : { action: d.a };
  if (d.a === 'rework') { const r = await ask({ title: 'Send back for rework', fields: [{ name: 'note', label: 'What needs fixing? (optional)', type: 'textarea' }], ok: 'Send back' }); if (!r) return; if (r.note) await api(`/messages/delegation/${d.id}`, { method: 'POST', body: { text: 'Rework: ' + r.note } }); }
  await api('/delegation/tasks/' + d.id, { method: 'PATCH', body }); toast('Updated', 'ok'); refreshBadges(); route();
};
ACT.delDate = async d => { const r = await ask({ title: 'Request date change', text: 'The person who delegated this task will approve or reject.', fields: [{ name: 'date', label: 'New due date', type: 'date', required: true, min: todayISO() }, { name: 'reason', label: 'Reason', type: 'textarea' }], ok: 'Send request' }); if (!r) return; await api('/delegation/tasks/' + d.id, { method: 'PATCH', body: { action: 'request_date', ...r } }); toast('Request sent', 'ok'); route(); };
ACT.delEdit = async d => {
  const r = await ask({ title: 'Edit task', fields: [{ name: 'title', label: 'Task', value: d.t, required: true }, { name: 'description', label: 'Details', type: 'textarea', value: d.d }, { name: 'assigned_to', label: 'Assigned to', type: 'select', value: d.to, options: S.meta.users.filter(u => u.active).map(u => ({ v: u.id, l: u.name })) }, { name: 'due_date', label: 'Due date', type: 'date', value: d.due }, { name: 'priority', label: 'Priority', type: 'select', value: d.p, options: PRIORITIES }] });
  if (!r) return; await api('/delegation/tasks/' + d.id, { method: 'PATCH', body: { action: 'edit', ...r } }); route();
};
ACT.delAdd = async d => {
  const r = await ask({ title: 'Add new task', fields: [{ name: 'title', label: 'Task', required: true }, { name: 'description', label: 'Details', type: 'textarea' }, { name: 'assigned_to', label: 'Assign to', type: 'select', value: S.user.id, options: S.meta.users.filter(u => u.active).map(u => ({ v: u.id, l: u.name })) }, { name: 'due_date', label: 'Due date', type: 'date', min: todayISO() }, { name: 'priority', label: 'Priority', type: 'select', value: 'Medium', options: PRIORITIES }], ok: 'Add task' });
  if (!r) return; await api('/delegation/tasks', { method: 'POST', body: { board_id: d.board, ...r } }); toast('Task added', 'ok'); route();
};
async function delTasks(scope) {
  title(scope === 'my' ? 'My Delegation Tasks' : 'Team Delegation Tasks');
  const key = 'del-' + scope, st = qs(key, { status: 'not_started', q: '' });
  const d = await api(`/delegation/tasks?scope=${scope}&status=${st.status}&q=${encodeURIComponent(st.q)}`), c = d.counts;
  const rows = d.rows.map(t => `<tr class="${t.delay_days ? 'over' : ''}"><td class="id">#${t.id}</td><td class="nowrap">${fmtD(t.due_date)}${t.req_date ? `<br><span class="badge amber">Change requested</span>` : ''}</td><td>${delayBadge(t.delay_days)}</td><td>${stBadge(t.status)}</td><td><b>${esc(t.title)}</b></td><td><span class="badge" style="background:${esc(t.board_color)}22;color:${esc(t.board_color)}">${esc(t.board_icon)} ${esc(t.board_name)}</span></td>
    <td>${esc(t.created_by_name || '—')}</td>${scope === 'team' ? `<td>${esc(t.assigned_name || '—')}</td>` : ''}<td>${msgBtn('delegation', t.id, t.msgs)}</td><td class="noexp">${delActions(t)}</td></tr>`);
  return `<div class="page-h"><div><h2>Delegation – ${scope === 'my' ? 'My Delegation Tasks' : 'Team Tasks'}</h2><p>${scope === 'my' ? 'Tasks assigned to you across all boards.' : 'Tasks on boards you can see.'}</p></div><span class="sp"></span>${exportBtn('delegation')}</div>
  ${pills(key, 'status', [['not_started', 'Open', c.not_started || 0], ['in_progress', 'In Progress', c.in_progress || 0], ['done', 'Closed', c.done || 0], ['hold', 'Hold', c.hold || 0], ['under_review', 'Under Review', c.under_review || 0]], st.status)}
  <div class="filters">${searchBox(key, st.q, 'Search tasks…')}</div>
  ${table('delegation', ['Task ID', 'Due date', 'Delay', 'Status', 'Task', 'Board', 'Created by', ...(scope === 'team' ? ['Assigned to'] : []), 'Msg', '!Action'], rows, { emptyTitle: 'No tasks here', empty: 'Nothing in this status.' })}`;
}
/* board create / edit */
const boardModal = (b, people) => {
  const mem = new Set((b ? b.members : []).map(m => m.user_id));
  openModal(`<h3>${b ? 'Edit board' : 'Add new board'}</h3><form data-form="board"><input type="hidden" name="id" value="${b ? b.id : ''}">
    <label class="f" style="margin-bottom:12px"><span class="req">Board name</span><input name="name" required value="${esc(b ? b.name : '')}"></label>
    <div class="f" style="margin-bottom:12px"><span style="font-weight:600;font-size:13px">Color</span><div class="swatches">${COLORS.map((c, i) => `<input type="radio" name="color" id="col${i}" value="${c}" ${(b ? b.color : COLORS[0]) === c ? 'checked' : ''}><label for="col${i}" style="--c:${c}"></label>`).join('')}</div></div>
    <div class="f" style="margin-bottom:12px"><span style="font-weight:600;font-size:13px">Icon</span><div class="swatches icons">${ICONS.map((c, i) => `<input type="radio" name="icon" id="ico${i}" value="${c}" ${(b ? b.icon : ICONS[0]) === c ? 'checked' : ''}><label for="ico${i}">${c}</label>`).join('')}</div></div>
    <div class="f" style="margin-bottom:12px"><span style="font-weight:600;font-size:13px">Sharing</span><div class="row"><label class="check"><input type="radio" name="sharing" value="specific" data-change="boardShare" ${!b || b.sharing === 'specific' ? 'checked' : ''}> Specific people</label><label class="check"><input type="radio" name="sharing" value="private" data-change="boardShare" ${b && b.sharing === 'private' ? 'checked' : ''}> Private (only you)</label></div></div>
    <div class="f${b && b.sharing === 'private' ? ' hide' : ''}" id="boardPeople" style="margin-bottom:12px"><span style="font-weight:600;font-size:13px">Members</span><div class="people">${S.meta.users.filter(u => u.active && u.id !== (b ? b.owner_id : S.user.id)).map(u => `<label class="check"><input type="checkbox" name="members" value="${u.id}" ${mem.has(u.id) ? 'checked' : ''}> ${esc(u.name)}<span class="muted sm">${esc(u.emp_code || '')}</span></label>`).join('')}</div></div>
    <div class="form" style="grid-template-columns:1fr 1fr;gap:12px"><label class="f"><span>Start date</span><input type="date" name="start_date" value="${esc(b ? b.start_date || '' : '')}"></label><label class="f"><span>End date</span><input type="date" name="end_date" value="${esc(b ? b.end_date || '' : '')}"></label>
    <label class="f full" style="grid-column:1/-1"><span>Department (optional – lets that HOD see this board)</span><select name="dept_id" ${b ? 'disabled' : ''}>${deptOpts(b ? b.dept_id : '', 'None')}</select></label></div>
    ${b ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="archived" ${b.archived ? 'checked' : ''}> Archive this board</label>` : ''}
    <div class="modal-actions"><button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn green">${b ? 'Save board' : 'Create board'}</button></div></form>`, true);
};
ACT.boardNew = () => boardModal(null);
ACT.boardEdit = async d => { const b = (await api('/boards?archived=0')).concat(await api('/boards?archived=1')).find(x => String(x.id) === d.id); boardModal(b); };
CHG.boardShare = v => $('#boardPeople').classList.toggle('hide', v === 'private');
FORM.board = async o => {
  const body = { ...o, members: arr(o.members) };
  if (o.id) { body.archived = !!o.archived; delete body.dept_id; await api('/boards/' + o.id, { method: 'PATCH', body }); } else { const r = await api('/boards', { method: 'POST', body }); Q.board = { ...(Q.board || {}), id: r.id, status: 'not_started' }; }
  closeModal(); toast('Board saved', 'ok'); route();
};

/* ======================= REVIEW ======================= */
PAGES.review = async () => {
  title('Review'); const d = await api('/review');
  const tk = d.tickets.map(t => `<tr><td class="id">${t.uid}</td><td>${stBadge('review')}</td><td><div class="desc">${esc(t.description)}</div></td><td>${esc(t.doer_name || '—')}</td><td class="nowrap">${fmtD(t.due_date)}</td><td>${msgBtn('ticket', t.id, t.msgs)}</td><td><div class="row" style="flex-wrap:nowrap"><button class="btn green xs" data-act="tk" data-a="approve" data-id="${t.id}">Approve</button><button class="btn xs" data-act="tk" data-a="rework" data-id="${t.id}">Rework</button></div></td></tr>`);
  const dl = d.delegation.map(t => `<tr><td class="id">#${t.id}</td><td>${stBadge('under_review')}</td><td><b>${esc(t.title)}</b><div class="muted sm">${esc(t.board_name)}</div></td><td>${esc(t.assigned_name || '—')}</td><td class="nowrap">${fmtD(t.due_date)}</td><td>${msgBtn('delegation', t.id, t.msgs)}</td><td><div class="row" style="flex-wrap:nowrap"><button class="btn green xs" data-act="del" data-a="approve" data-id="${t.id}">Approve</button><button class="btn xs" data-act="del" data-a="rework" data-id="${t.id}">Rework</button></div></td></tr>`);
  return `<div class="page-h"><div><h2>Review</h2><p>Work that others have finished and that is waiting for your approval.</p></div></div>
  <h3 style="margin:6px 0 10px">Help tickets (${tk.length})</h3>${table('review-tickets', ['ID', 'Status', 'Description', 'Done by', 'Due', 'Msg', '!Action'], tk, { emptyTitle: 'No tickets to review', empty: 'You are all caught up.' })}
  <h3 style="margin:24px 0 10px">Delegation tasks (${dl.length})</h3>${table('review-delegation', ['ID', 'Status', 'Task', 'Done by', 'Due', 'Msg', '!Action'], dl, { emptyTitle: 'No delegated tasks to review', empty: 'You are all caught up.' })}
  <h3 style="margin:24px 0 10px">Process steps (${d.steps.length})</h3>${table('review-steps', ['Entry', 'Status', 'Step', 'Submitted by', 'Submitted', '!Action'], d.steps.map(s => `<tr><td class="id">${esc(s.uid)}</td><td>${stBadge('review')}</td><td><b>${esc(s.title)}</b><div class="muted sm">${esc(s.process_name)} · Step ${s.step_no}: ${esc(s.step_name)}</div></td><td>${esc(s.doer_name || '—')}</td><td class="nowrap">${fmtMs(s.actual_at)}</td><td><div class="row" style="flex-wrap:nowrap"><button class="btn green xs" data-act="stepRev" data-a="approve" data-id="${s.id}">Approve</button><button class="btn xs" data-act="stepRev" data-a="rework" data-id="${s.id}">Rework</button></div></td></tr>`), { emptyTitle: 'No process steps to review', empty: 'You are all caught up.' })}`;
};
