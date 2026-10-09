'use strict';
/* Pages: FMS processes · Import center · Holidays · Lookups · Admin (users, departments, access) · Profile */

/* ======================= FMS / PROCESSES ======================= */
const FTYPES = ['Straight', 'Primary', 'Direct', 'Staggered', 'Loop'];
PAGES.fms = async parts => {
  const sub = parts[1];
  if (!sub) return processList();
  if (sub === 'my' || sub === 'team') return fmsTasks(sub);
  if (sub === 'new') return processForm(null);
  if (sub === 'edit') return processForm(parts[2]);
  return processView(sub);
};
async function processList() {
  title('All Processes');
  const list = await api('/processes');
  const rows = list.map((p, i) => { const k = p.kpi, mx = Math.max(1, ...k.bottleneck.map(b => b.avg_delay_hrs));
    return `<tr><td>${i + 1}</td><td><a class="id" href="#/fms/${p.id}">${esc(p.name)}</a> ${badge(p.type, 'blue')}<div class="muted sm">${esc(p.prefix)}-… · ${esc(p.dept_name || '')}</div></td><td><div class="desc">${esc(p.description || '—')}</div></td><td>${esc(p.pc_name || '—')}</td>
      <td><b>${k.running}</b> running · ${k.completed} done${k.overdue ? `<br>${badge(k.overdue + ' overdue', 'red')}` : ''}</td>
      <td>${k.onTimePct == null ? '<span class="muted">—</span>' : `<div class="ring" style="--p:${k.onTimePct}" title="${k.onTimePct}% of steps finished on time"><span>${k.onTimePct}%</span></div>`}</td>
      <td>${k.bottleneck.some(b => b.avg_delay_hrs) ? `<div class="mini">${k.bottleneck.map(b => `<i style="height:${Math.max(3, b.avg_delay_hrs / mx * 42)}px" title="Step ${b.step_no} ${esc(b.name)}: avg delay ${b.avg_delay_hrs}h"></i>`).join('')}</div>` : '<span class="muted">No delays</span>'}</td>
      <td class="nowrap">${fmtTS(p.updated_at)}</td><td class="noexp"><div class="row" style="flex-wrap:nowrap"><a class="btn xs" href="#/fms/${p.id}">Open</a>${p.can_edit ? `<a class="btn xs" href="#/fms/edit/${p.id}">Edit</a>` : ''}</div></td></tr>`; });
  return `<div class="page-h"><div><h2>Processes</h2><p>Every flow with its entries, steps, doers and delays.</p></div><span class="sp"></span>${(mgr() || hasEdit('fms')) ? `<a class="btn green" href="#/fms/new">${ic('plus', 16)} Create process</a>` : ''}</div>
  ${table('processes', ['#', 'Process', 'Description', 'Process coordinator', 'Entries', 'On-time', 'Bottleneck (avg delay per step)', 'Last edited', '!Actions'], rows, { emptyTitle: 'No processes yet', empty: 'Create a process to start tracking entries step by step.' })}`;
}
const stepDelay = (s, now) => s.status === 'done' && s.actual_at > s.planned_at ? `<span class="badge amber">+${dur(s.actual_at - s.planned_at)}</span>` : s.status === 'pending' && s.planned_at && s.planned_at < now ? `<span class="badge red">${dur(now - s.planned_at)} late</span>` : '';
const stepAct = s => s.status === 'review' ? (s.can_review ? `<span class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn green xs" data-act="stepRev" data-a="approve" data-id="${s.id}">Approve</button><button class="btn xs" data-act="stepRev" data-a="rework" data-id="${s.id}">Rework</button></span>` : '')
  : s.can_update ? `<span class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn green xs" data-act="stepDone" data-id="${s.id}" data-ck="${esc(JSON.stringify(s.checklist || []))}" data-rev="${esc(s.reviewer_name || '')}">${ic('check', 13)} Done</button>${menu([['Skip (not applicable)', 'stepDone', { id: s.id, skip: 1 }]])}</span>` : '';
async function processView(id) {
  const st = qs('proc-' + id, { view: 'table', status: '', q: '', page: 1 });
  const [p, e] = await Promise.all([api('/processes/' + id), api(`/processes/${id}/entries?status=${st.status}&q=${encodeURIComponent(st.q)}&page=${st.page}`)]);
  title(p.name); const now = Date.now(), k = p.kpi, can = s => !isPC() && (s.doer_id === S.user.id || p.can_edit);
  const head = `<div class="page-h"><div><h2>${esc(p.name)} ${badge(p.type, 'blue')}</h2><p>${esc(p.description || '')} <span class="muted sm">· ${esc(p.dept_name || '')} · PC: ${esc(p.pc_name || '—')} · Steps updated by: <b>${({ owner: 'Process owner', deo: 'Data entry operator', step_owner: 'Step owner' })[p.updater] || 'Step owner'}</b> · Graph: ${esc(p.graph_period || 'weekly')}</span></p></div><span class="sp"></span>
    ${p.can_edit || (p.steps[0] && p.steps[0].doer_id === S.user.id) ? `<button class="btn green" data-act="entryNew" data-id="${id}">${ic('plus', 16)} New entry</button><a class="btn" href="#/import?type=fms_entries&process=${id}">${ic('upload', 16)} Bulk create from file</a><a class="btn" href="#/import?type=fms_done&process=${id}">${ic('check', 16)} Bulk done from file</a>` : ''}${p.can_edit ? `<a class="btn" href="#/fms/edit/${id}">${ic('edit', 16)} Edit process</a>` : ''}</div>
  <div class="grid g4" style="margin-bottom:14px">${[['Entries', k.total, '#2563eb'], ['Running', k.running, '#f59e0b'], ['Completed', k.completed, '#10b981'], ['Overdue steps', k.overdue, '#ef4444'], ['On-time rate', k.onTimePct == null ? '—' : k.onTimePct + '%', '#6366f1']].map(x => `<div class="card kpi" style="--c:${x[2]}"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('')}</div>
  <div class="filters"><div class="seg"><button class="${st.view === 'table' ? 'on' : ''}" data-act="setq" data-page="proc-${id}" data-key="view" data-val="table">Table view</button><button class="${st.view === 'cards' ? 'on' : ''}" data-act="setq" data-page="proc-${id}" data-key="view" data-val="cards">Sheet view</button></div>
    <select data-change="setq" data-page="proc-${id}" data-key="status">${optHtml([{ v: 'running', l: 'Running' }, { v: 'completed', l: 'Completed' }], st.status, 'All entries')}</select>${searchBox('proc-' + id, st.q, 'Search entry, customer…')}</div>`;
  if (!e.entries.length) return head + `<div class="card empty">${ic('flow', 34)}<h3>No entries yet</h3><p>Add an entry, or bring many in from Excel with “Bulk create from file”.</p></div>`;
  const foot = pager('proc-' + id, 'page', st.page, e.total, 50);
  if (st.view === 'cards') {
    return head + e.entries.map(en => { const done = en.steps.filter(s => s.status !== 'pending' && s.status !== 'review').length, cur = en.steps.find(s => s.status === 'pending' || s.status === 'review'), late = cur && cur.planned_at && cur.planned_at < now;
      return `<details class="entry"><summary><div><b class="id">${esc(en.uid)}</b> &nbsp;<b>${esc(en.title)}</b> <span class="badge">Step 0 · Inquiry received</span><div class="row" style="margin-top:8px"><div class="progress"><i style="width:${Math.round(done / en.steps.length * 100)}%"></i></div><span class="muted sm">${done} / ${en.steps.length} steps · ${Math.round(done / en.steps.length * 100)}%</span></div></div>
        <div>${cur ? `<span class="step-chip ${late ? 'late' : 'cur'}">Step ${cur.step_no} · ${esc(cur.name)}${late ? ' · late' : ''}</span>` : badge('Completed', 'green')}</div></summary>
        <div class="fields">${p.fields.map(f => `<div><small>${esc(f.label)}</small>${fv(f, en.data[f.key])}</div>`).join('')}<div><small>Started</small>${fmtMs(en.started_at)}</div></div>
        <div class="steps">${en.steps.map(s => `<div class="st"><span class="step-n" style="${s.status === 'done' ? 'background:var(--green)' : s.status === 'pending' ? '' : 'background:#94a3b8'}">${s.step_no}</span><b>${esc(s.name)}${s.reviewer_name ? `<div class="muted sm" style="font-weight:400">Reviewer: ${esc(s.reviewer_name)}</div>` : ''}</b><span>${esc(s.doer_name || '—')}</span><span class="muted sm">Planned<br>${fmtMs(s.planned_at)}</span><span class="muted sm">Actual<br>${fmtMs(s.actual_at)}</span><span>${stBadge(s.status)} ${stepDelay(s, now)} ${stepAct(s, can, now)}</span></div>`).join('')}</div></details>`; }).join('') + `<div class="card flush">${foot || ''}</div>`;
  }
  const fields = p.fields.slice(0, 3), n = p.steps.length;
  const h1 = `<tr><th rowspan="2">#</th><th rowspan="2">Entry UID</th><th rowspan="2">Title</th>${fields.map(f => `<th rowspan="2">${esc(f.label)}</th>`).join('')}${p.steps.map(s => `<th class="grp" colspan="4">Step ${s.step_no} · ${esc(s.name)}</th>`).join('')}<th rowspan="2">Overall</th></tr>`;
  const h2 = `<tr>${p.steps.map(() => '<th>Doer</th><th>Planned</th><th>Actual</th><th>Status</th>').join('')}</tr>`;
  const rows = e.entries.map((en, i) => `<tr><td>${(st.page - 1) * 50 + i + 1}</td><td class="id">${esc(en.uid)}</td><td><b>${esc(en.title)}</b></td>${fields.map(f => `<td>${fv(f, en.data[f.key])}</td>`).join('')}${p.steps.map(ps => { const s = en.steps.find(x => x.step_no === ps.step_no); if (!s) return '<td colspan="4"></td>';
      return `<td>${esc(s.doer_name || '—')}</td><td class="nowrap">${fmtMs(s.planned_at)}</td><td class="nowrap">${fmtMs(s.actual_at)}</td><td class="nowrap">${stBadge(s.status)} ${stepDelay(s, now)} ${stepAct(s, can, now)}</td>`; }).join('')}<td>${stBadge(en.status)}</td></tr>`).join('');
  return head + `<div class="tbl-wrap"><table class="tbl fms"><thead>${h1}${h2}</thead><tbody>${rows}</tbody></table>${foot}</div>`;
}
ACT.stepDone = d => new Promise(resolve => {
  const ck = d.ck ? JSON.parse(d.ck) : [], skip = !!d.skip;
  openModal(`<h3>${skip ? 'Skip this step' : 'Complete this step'}</h3>${!skip && d.rev ? `<div class="notice blue" style="margin-bottom:12px">This step goes to <b>${esc(d.rev)}</b> for review before the next step starts.</div>` : ''}<form id="sdf">
    ${!skip && ck.length ? `<div class="f" style="margin-bottom:12px"><span style="font-weight:600;font-size:13px">Checklist</span>${ck.map((c, i) => `<label class="check"><input type="checkbox" name="ck" value="${i}"> ${esc(c.text)}${c.required ? ' <span class="badge red">required</span>' : ''}</label>`).join('')}</div>` : ''}
    <label class="f"><span>Remarks (optional)</span><textarea name="remarks"></textarea></label>
    <div class="modal-actions"><button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">${skip ? 'Skip step' : d.rev ? 'Submit for review' : 'Mark done'}</button></div></form>`);
  $('#sdf').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.target); safe(async () => {
    const r = await api(`/fms/steps/${d.id}/complete`, { method: 'POST', body: { remarks: fd.get('remarks'), status: skip ? 'skipped' : 'done', checks: fd.getAll('ck').map(Number) } });
    closeModal(); toast(r.status === 'review' ? 'Sent for review' : 'Step updated', 'ok'); refreshBadges(); route(); resolve(); }); });
});
ACT.stepRev = async d => {
  let note; if (d.a === 'rework') { const r = await ask({ title: 'Send back for rework', fields: [{ name: 'note', label: 'What needs fixing?', type: 'textarea' }], ok: 'Send back' }); if (!r) return; note = r.note; }
  await api(`/fms/steps/${d.id}/review`, { method: 'POST', body: { action: d.a, note } }); toast(d.a === 'approve' ? 'Approved – next step started' : 'Sent back to the doer', 'ok'); refreshBadges(); route();
};
ACT.entryNew = async d => {
  const p = await api('/processes/' + d.id), tp = { text: 'text', textarea: 'textarea', number: 'number', date: 'date', datetime: 'datetime-local', select: 'select', checkbox: 'checkbox' };
  const r = await ask({ title: 'New entry – ' + p.name, text: 'Step 0 · Inquiry received', fields: [{ name: 'title', label: 'Entry title / Customer name', required: true }, ...p.fields.map(f => ({ name: f.key, label: f.label, required: f.required, type: tp[f.type] || 'text', options: (f.options || []).map(o => ({ v: o, l: o })), blank: 'Select' }))], ok: 'Create entry' }); if (!r) return;
  const { title: t, ...raw } = r, data = {}; p.fields.forEach(f => { const v = raw[f.key]; if (f.type === 'checkbox') { if (v) data[f.key] = 'Yes'; } else if (v) data[f.key] = v; });
  const x = await api(`/processes/${d.id}/entries`, { method: 'POST', body: { title: t, data } }); toast('Created ' + x.uid, 'ok'); route();
};
async function fmsTasks(scope) {
  title(scope === 'my' ? 'My Process Task' : 'Team Process Task');
  const key = 'fms-' + scope, st = qs(key, { range: 'today', q: '' });
  const d = await api(`/fms/my-tasks?scope=${scope}&range=${st.range}&q=${encodeURIComponent(st.q)}`), c = d.counts, now = Date.now();
  const rows = d.rows.map((r, i) => `<tr class="${r.planned_at < now ? 'over' : ''}"><td>${i + 1}</td><td><a href="#/fms/${r.process_id}">${esc(r.process_name)}</a></td><td class="id">${esc(r.uid)}</td><td>${esc(r.title)}</td><td><a href="#/fms/${r.process_id}">Step ${r.step_no} / ${esc(r.step_name)}</a></td><td>${esc(r.doer_name || '—')}</td><td class="nowrap">${fmtMs(r.planned_at)}</td>
    <td>${r.planned_at < now ? badge(dur(now - r.planned_at) + ' late', 'red') : '<span class="muted">On time</span>'}</td><td>${badge(r.planned_at < now ? 'Overdue' : 'Running', r.planned_at < now ? 'red' : 'amber')}</td><td class="noexp">${stepAct({ ...r, status: 'pending', can_update: r.can_update })}</td></tr>`);
  return `<div class="page-h"><div><h2>${scope === 'my' ? 'My Process Task' : 'Team Process Task'}</h2><p>The step each entry is currently waiting on.</p></div><span class="sp"></span>${exportBtn('process-tasks')}</div>
  ${pills(key, 'range', [['today', 'Today', c.today], ['overdue', 'Overdue', c.overdue], ['week', 'This Week', c.week], ['nextweek', 'Next Week', c.nextweek], ['lastweek', 'Last Week', c.lastweek], ['all', 'All']], st.range)}<div class="filters">${searchBox(key, st.q, 'Search process, entry, step…')}</div>
  ${table('process-tasks', ['#', 'Process', 'Entry UID', 'Entry title', 'Current step', 'Doer', 'Planned', 'Delay', 'Status', '!Action'], rows, { emptyTitle: 'No process tasks', empty: 'Nothing waiting in this tab.' })}`;
}
/* process builder */
const FT = [['text', 'Text'], ['textarea', 'Long text'], ['number', 'Number'], ['date', 'Date'], ['datetime', 'Date & time'], ['select', 'Dropdown'], ['checkbox', 'Checkbox']];
const fieldRow = (f = {}) => `<div class="frow fld"><input class="f-label" placeholder="Field name (e.g. Customer email)" value="${esc(f.label || '')}"><select class="f-type">${optHtml(FT.map(([v, l]) => ({ v, l })), f.type || 'text')}</select><input class="f-opts" placeholder="Dropdown options, comma separated" value="${esc((f.options || []).join(', '))}"><label class="check"><input type="checkbox" class="f-req" ${f.required ? 'checked' : ''}> Required</label><button type="button" class="btn xs danger" data-act="rowDel">${ic('x', 14)}</button></div>`;
const stepRow = (s = {}) => { const du = S.meta.users.find(u => u.id === Number(s.doer_id)), dept = du ? du.dept_id : '';
  return `<div class="srow2"><div class="row sr-top"><span class="drag" draggable="true" title="Drag to reorder">⋮⋮</span><span class="step-n"></span><input class="s-name" placeholder="Step name (e.g. Meeting)" value="${esc(s.name || '')}" required>
    <select class="s-dept" data-change="stepDept">${deptOpts(dept, 'Department…')}</select><select class="s-doer">${userOpts(s.doer_id || '', 'Doer…', u => !dept || u.dept_id === dept)}</select><select class="s-rev">${userOpts(s.reviewer_id || '', 'No reviewer')}</select></div>
    <div class="row sr-bot"><span class="muted sm">Plan by</span><select class="s-unit" data-change="stepUnit">${optHtml([{ v: 'minutes', l: 'Minutes' }, { v: 'hours', l: 'Hours' }, { v: 'days', l: 'Days' }, { v: 'workdays', l: 'Working days (by closing time)' }], s.unit || 'days')}</select><span class="muted sm">TAT</span><input class="s-tat" type="number" min="0" value="${s.tat ?? 1}" style="width:80px"><span class="wd" style="${s.unit === 'workdays' ? '' : 'display:none'}"><span class="muted sm">by</span> <input class="s-due" type="time" value="${esc(s.due_time || '18:00')}"></span>
    <button type="button" class="btn xs" data-act="stepCk">Checklist (<b class="ckn">${(s.checklist || []).length}</b>)</button><input type="hidden" class="s-ck" value="${esc(JSON.stringify(s.checklist || []))}"><span class="sp" style="flex:1"></span>
    <button type="button" class="btn xs" data-act="rowUp">↑</button><button type="button" class="btn xs" data-act="rowDown">↓</button><button type="button" class="btn xs danger" data-act="rowDel">${ic('x', 14)}</button></div></div>`; };
const renumber = () => $$('#steps .srow2').forEach((r, i) => r.querySelector('.step-n').textContent = i + 1);
async function processForm(id) {
  const p = id ? await api('/processes/' + id) : null, locked = p && p.entry_count > 0;
  title(p ? 'Edit Process' : 'Create Process');
  const eds = S.editable.fms === 'all' ? null : S.editable.fms;
  setTimeout(renumber, 0);
  return `<div class="page-h"><div><h2>${p ? 'Edit process' : 'Create process'}</h2><p>Basic details, the entry form (step 0) and the steps each entry moves through.</p></div></div>
  <form class="card" data-form="process" style="max-width:1000px"><input type="hidden" name="id" value="${p ? p.id : ''}"><h3 style="margin-bottom:12px">Basic details</h3><div class="form">
    <label class="f"><span class="req">Process name</span><input name="name" required value="${esc(p ? p.name : '')}" placeholder="e.g. Order to Delivery FMS"></label>
    <label class="f"><span>Entry ID prefix <small>(max 5 letters)</small></span><input name="prefix" maxlength="5" value="${esc(p ? p.prefix : '')}" placeholder="OTD" ${p ? 'disabled' : ''}></label>
    <label class="f"><span class="req">Department</span><select name="dept_id" required ${p ? 'disabled' : ''}>${deptOpts(p ? p.dept_id : '', 'Select department', eds)}</select></label>
    <label class="f"><span>Process owner / coordinator (PC)</span><select name="pc_id">${userOpts(p ? p.pc_id : S.user.id, 'Me')}</select></label>
    <label class="f full" style="grid-column:1/-1"><span>Description</span><textarea name="description" style="min-height:60px">${esc(p ? p.description || '' : '')}</textarea></label>
    <div class="f"><span style="font-weight:600;font-size:13px">Process type</span><div class="radios">${FTYPES.map(x => `<label class="check"><input type="radio" name="type" value="${x}" ${(p ? p.type : 'Straight') === x ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>
    <label class="f"><span>Select time for graph</span><select name="graph_period">${optHtml(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map(x => ({ v: x, l: x[0].toUpperCase() + x.slice(1) })), p ? p.graph_period : 'weekly')}</select><small>On-time % and bottleneck chart look at this window.</small></label>
    <div class="f" style="grid-column:1/-1"><span style="font-weight:600;font-size:13px">Who can update the step status and step checklists?</span><div class="radios">${[['owner', 'Process owner'], ['deo', 'Data entry operator (editors of this department)'], ['step_owner', 'Step owner (the doer)']].map(([v, l]) => `<label class="check"><input type="radio" name="updater" value="${v}" ${(p ? p.updater : 'step_owner') === v ? 'checked' : ''}> ${l}</label>`).join('')}</div></div></div>
    ${locked ? `<div class="notice" style="margin-top:16px">This process already has ${p.entry_count} entries, so its form fields and steps are locked. You can still change the details above.</div>
      <h3 style="margin:18px 0 8px">Steps</h3>${p.steps.map(s => `<div class="row" style="padding:5px 0;border-bottom:1px dashed var(--line)"><span class="step-n">${s.step_no}</span><b>${esc(s.name)}</b><span class="muted">${esc(s.doer_name || '—')} · ${s.unit === 'workdays' ? `+${s.tat} working days by ${esc(s.due_time || '18:00')}` : s.tat + ' ' + s.unit}${s.reviewer_name ? ' · reviewer ' + esc(s.reviewer_name) : ''}${(s.checklist || []).length ? ' · ' + s.checklist.length + ' checklist items' : ''}</span></div>`).join('')}`
    : `<h3 style="margin:24px 0 4px">Step 0 · Entry form fields</h3><p class="muted sm" style="margin:0 0 10px">What you capture when a new entry starts (customer, product, price…). Mark a field <b>Required</b> to make it compulsory.</p><div id="fields">${(p ? p.fields : [{ label: 'Customer email', required: true }, { label: 'Product name' }]).map(fieldRow).join('')}</div><button type="button" class="btn xs" data-act="addField">${ic('plus', 14)} Add field</button>
      <h3 style="margin:24px 0 4px">Steps</h3><p class="muted sm" style="margin:0 0 10px">Add all the steps an entry must go through. Each step has a doer, an optional reviewer and a time allowed (TAT). A step's clock starts when the previous step is completed (or approved, if it has a reviewer). Drag ⋮⋮ to reorder.</p><div id="steps">${(p ? p.steps : [{}, {}]).map(stepRow).join('')}</div><button type="button" class="btn xs" data-act="addStep">${ic('plus', 14)} Add another step</button>`}
    <div class="modal-actions"><a class="btn" href="#/fms${p ? '/' + p.id : ''}">Cancel</a><button class="btn primary">${p ? 'Save changes' : 'Save & continue'}</button></div></form>`;
}
ACT.addField = () => $('#fields').insertAdjacentHTML('beforeend', fieldRow());
ACT.addStep = () => { $('#steps').insertAdjacentHTML('beforeend', stepRow()); renumber(); };
ACT.rowDel = (d, el) => { el.closest('.frow, .srow2').remove(); renumber(); };
ACT.rowUp = (d, el) => { const r = el.closest('.srow2'); if (r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling); renumber(); };
ACT.rowDown = (d, el) => { const r = el.closest('.srow2'); if (r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r); renumber(); };
CHG.stepUnit = (v, el) => { const r = el.closest('.srow2'); $('.wd', r).style.display = v === 'workdays' ? '' : 'none'; };
CHG.stepDept = (v, el) => { const row = el.closest('.srow2'), sel = $('.s-doer', row), cur = sel.value; sel.innerHTML = userOpts(cur, 'Doer…', u => !v || u.dept_id === Number(v)); };
ACT.stepCk = (d, el) => {
  const row = el.closest('.srow2'), cur = JSON.parse($('.s-ck', row).value || '[]');
  ask({ title: 'Step checklist', text: 'One item per line. End a line with * to make it compulsory before the step can be completed.', fields: [{ name: 't', label: 'Checklist items', type: 'textarea', value: cur.map(c => c.text + (c.required ? ' *' : '')).join('\n') }], ok: 'Save checklist' })
    .then(r => { if (!r) return; const items = r.t.split('\n').map(x => x.trim()).filter(Boolean).map(x => ({ text: x.replace(/\s*\*$/, ''), required: /\*$/.test(x) })); $('.s-ck', row).value = JSON.stringify(items); $('.ckn', row).textContent = items.length; });
};
let dragEl = null;
document.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('.srow2'); if (r && e.target.classList.contains('drag')) { dragEl = r; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'step'); } catch { } r.classList.add('dragging'); } });
document.addEventListener('dragover', e => { if (!dragEl) return; const r = e.target.closest('.srow2'); if (r && r !== dragEl && r.parentNode === dragEl.parentNode) { e.preventDefault(); const b = r.getBoundingClientRect(); r.parentNode.insertBefore(dragEl, (e.clientY - b.top) > b.height / 2 ? r.nextSibling : r); } });
document.addEventListener('dragend', () => { if (dragEl) { dragEl.classList.remove('dragging'); dragEl = null; renumber(); } });
FORM.process = async (o, fm) => {
  const body = { name: o.name, prefix: o.prefix, type: o.type, dept_id: o.dept_id, pc_id: o.pc_id, description: o.description, updater: o.updater, graph_period: o.graph_period };
  if ($('#steps')) {
    body.fields = $$('#fields .fld').map(r => ({ label: $('.f-label', r).value, type: $('.f-type', r).value, options: $('.f-opts', r).value, required: $('.f-req', r).checked }));
    body.steps = $$('#steps .srow2').map(r => ({ name: $('.s-name', r).value, doer_id: $('.s-doer', r).value, reviewer_id: $('.s-rev', r).value, tat: $('.s-tat', r).value, unit: $('.s-unit', r).value, due_time: $('.s-unit', r).value === 'workdays' ? $('.s-due', r).value : null, checklist: JSON.parse($('.s-ck', r).value || '[]') }));
    if (body.steps.some(s => !s.doer_id)) throw new Error('Choose a doer for every step');
  }
  const r = o.id ? await api('/processes/' + o.id, { method: 'PUT', body }) : await api('/processes', { method: 'POST', body });
  toast('Process saved', 'ok'); location.hash = '#/fms/' + (o.id || r.id);
};

/* ======================= IMPORT CENTER ======================= */
const IMP = { type: '', process: '', file: null, pv: null, map: {}, types: [], procs: [] };
PAGES.import = async (parts, params) => {
  title('Import Center'); const d = await api('/import/types'); IMP.types = d.types; IMP.procs = d.processes;
  IMP.type = params.get('type') || ''; IMP.process = params.get('process') || ''; IMP.file = null; IMP.pv = null;
  const t = IMP.types.find(x => x.key === IMP.type);
  WB.file = null; WB.pv = null;
  return `<div class="page-h"><div><h2>Import Center</h2><p>Bring in the data you already keep in Google Sheets or Excel. Upload a file, check the preview, done.</p></div></div>
  ${(isAdmin() || role() === 'hod') ? wbCard() : ''}
  <div class="notice blue" style="margin-bottom:16px"><b>Coming from Google Sheets?</b> Open the sheet → File → Download → Microsoft Excel (.xlsx), then upload it here. Your own column names are fine — you will match them in the next step.</div>
  <h3 style="margin:6px 0 4px">Or import one list at a time</h3><p class="muted" style="margin:0 0 12px">For any other sheet — you match the columns yourself.</p>
  <h3 style="margin-bottom:10px">1 · What are you importing?</h3><div class="typecards">${IMP.types.map(x => `<button class="tc${x.key === IMP.type ? ' on' : ''}" data-act="impType" data-type="${x.key}"><b>${esc(x.label)}</b><span>${esc(x.desc)}</span></button>`).join('')}</div>
  ${t ? `<h3 style="margin:24px 0 10px">2 · Upload your file</h3><div class="card">
    ${t.needsProcess ? `<label class="f" style="max-width:360px;margin-bottom:14px"><span class="req">Process</span><select data-change="impProc">${optHtml(IMP.procs.map(p => ({ v: p.id, l: p.name })), IMP.process, 'Select a process')}</select></label>` : ''}
    ${t.needsProcess && !IMP.process ? '<p class="muted">Choose a process to continue.</p>' : `<div class="row" style="margin-bottom:12px"><button class="btn" data-act="impTemplate">${ic('download', 16)} Download Excel template</button><span class="muted sm">Optional – shows the columns we understand. Your own sheet works too.</span></div>
    <div class="drop" id="drop"><div style="margin-bottom:8px">${ic('upload', 30)}</div><b>Drop your Excel / CSV file here</b><div class="muted sm" style="margin:4px 0 12px">.xlsx, .xls or .csv · up to 25 MB</div><input type="file" id="impfile" accept=".xlsx,.xls,.csv" data-change="impFile"></div>`}
    <div id="imp2"></div></div>` : ''}`;
};
ACT.impType = d => { location.hash = `#/import?type=${d.type}`; };
CHG.impProc = v => { location.hash = `#/import?type=${IMP.type}${v ? '&process=' + v : ''}`; };
ACT.impTemplate = async () => {
  const r = await api(`/import/${IMP.type}/template?process_id=${IMP.process}`, { raw: true });
  if (!r.ok) throw new Error((await r.json()).error || 'Could not build the template');
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = IMP.type + '-template.xlsx'; a.click();
};
const impForm = extra => { const f = new FormData(); f.append('file', IMP.file); Object.entries(extra || {}).forEach(([k, v]) => f.append(k, v)); return f; };
async function impPreview(sheet) {
  $('#imp2').innerHTML = '<p class="muted">Reading your file…</p>';
  IMP.pv = await api(`/import/${IMP.type}/preview?process_id=${IMP.process}`, { method: 'POST', form: impForm({ sheet: sheet || '' }) });
  IMP.sheet = sheet || IMP.pv.sheets[0]; IMP.map = { ...IMP.pv.mapping }; renderMapping();
}
function renderMapping() {
  const pv = IMP.pv, miss = pv.fields.filter(f => f.required && !(IMP.map[f.key] >= 0));
  $('#imp2').innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><h3 style="margin-bottom:4px">3 · Match your columns</h3><p class="muted" style="margin:0 0 12px"><b>${pv.total}</b> data rows found in <b>${esc(IMP.file.name)}</b>.
    ${pv.sheets.length > 1 ? ` Tab: <select data-change="impSheet">${optHtml(pv.sheets.map(s => ({ v: s, l: s })), IMP.sheet)}</select>` : ''}</p>
    <div class="tbl-wrap"><table class="tbl" style="min-width:560px"><thead><tr><th>What we need</th><th>Column in your file</th><th>Sample from your file</th></tr></thead><tbody>${pv.fields.map(f => { const i = IMP.map[f.key], ok = i >= 0;
      return `<tr><td><b>${esc(f.label)}</b> ${f.required ? '<span class="badge red">required</span>' : '<span class="muted sm">optional</span>'}</td><td><select data-change="impMap" data-key="${f.key}"><option value="-1">— Not in my file —</option>${pv.headers.map((h, j) => `<option value="${j}"${j === i ? ' selected' : ''}>${esc(h || 'Column ' + (j + 1))}</option>`).join('')}</select></td><td class="muted sm">${ok ? esc(pv.sample.map(r => r[i]).filter(Boolean).slice(0, 3).join(' · ')) || '—' : '—'}</td></tr>`; }).join('')}</tbody></table></div>
    ${miss.length ? `<div class="notice" style="margin-top:12px">Still to match: ${miss.map(f => `<b>${esc(f.label)}</b>`).join(', ')}</div>` : ''}
    <div class="modal-actions"><button class="btn primary" data-act="impGo" ${miss.length ? 'disabled' : ''}>Import ${pv.total} rows</button></div>`;
}
CHG.impFile = async (v, el) => { IMP.file = el.files[0]; if (IMP.file) await impPreview(); };
CHG.impSheet = v => impPreview(v);
CHG.impMap = (v, el, d) => { IMP.map[d.key] = Number(v); renderMapping(); };
document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('#drop')) { e.preventDefault(); $('#drop').classList.add('over'); } });
document.addEventListener('dragleave', e => { const z = $('#drop'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => { if (e.target.closest && e.target.closest('#drop')) { e.preventDefault(); $('#drop').classList.remove('over'); IMP.file = e.dataTransfer.files[0]; if (IMP.file) safe(() => impPreview()); } });
ACT.impGo = async () => {
  const btn = $('[data-act="impGo"]'); btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const r = await api(`/import/${IMP.type}/commit?process_id=${IMP.process}`, { method: 'POST', form: impForm({ mapping: JSON.stringify(IMP.map), sheet: IMP.sheet || '' }) });
    refreshBadges(); loadMeta();
    $('#imp2').innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><div class="row" style="margin-bottom:12px"><div class="kpi card" style="--c:#10b981;min-width:180px"><span>Imported</span><strong>${r.created}</strong><small>of ${r.total} rows</small></div><div class="kpi card" style="--c:${r.errors.length ? '#ef4444' : '#94a3b8'};min-width:180px"><span>Skipped with errors</span><strong>${r.errors.length}</strong><small>fix and re-upload just those rows</small></div></div>
      ${r.errors.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th>Row in file</th><th>What went wrong</th></tr></thead><tbody>${r.errors.map(x => `<tr><td>${x.row}</td><td>${esc(x.message)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="notice blue">All rows were imported successfully. 🎉</div>'}
      <div class="modal-actions"><a class="btn" href="#/import?type=${IMP.type}${IMP.process ? '&process=' + IMP.process : ''}">Import another file</a></div>`;
  } catch (e) { btn.disabled = false; btn.textContent = 'Import ' + IMP.pv.total + ' rows'; throw e; }
};

/* ======================= HOLIDAYS & LOOKUPS ======================= */
PAGES.holidays = async () => {
  title('Holiday Calendar'); const list = await api('/holidays'), by = {};
  list.forEach(h => (by[h.date.slice(0, 7)] = by[h.date.slice(0, 7)] || []).push(h));
  return `<div class="page-h"><div><h2>Holiday Calendar</h2><p>Daily recurring tasks are not created on company holidays (or on your weekly-off days). Restricted (optional) holidays are shown but do not block tasks unless you switch that on in Settings.</p></div></div>
  ${isAdmin() ? `<form class="filters" data-form="holiday"><input type="date" name="date" required><input name="name" placeholder="Holiday name (e.g. Diwali)" required style="min-width:240px"><select name="kind"><option value="GH">Company / gazetted holiday</option><option value="RH">Restricted (optional) holiday</option></select><button class="btn primary">${ic('plus', 16)} Add holiday</button></form>` : ''}
  ${list.length ? Object.keys(by).sort().map(m => { const [y, mo] = m.split('-'); return `<div class="card" style="margin-bottom:12px"><h3 style="margin-bottom:8px">${MON[+mo - 1]} ${y}</h3>${by[m].map(h => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><span class="badge blue" style="min-width:92px;justify-content:center">${fmtD(h.date)}</span><b style="flex:1">${esc(h.name)} ${h.kind === 'RH' ? badge('Restricted', 'amber') : ''}</b>${isAdmin() ? `<button class="btn xs danger" data-act="holDel" data-date="${h.date}">${ic('trash', 14)}</button>` : ''}</div>`).join('')}</div>`; }).join('') : `<div class="card empty">${ic('cal', 34)}<h3>No holidays added</h3><p>${isAdmin() ? 'Add your company holidays above.' : 'Your admin has not added any holidays yet.'}</p></div>`}`;
};
FORM.holiday = async o => { await api('/holidays', { method: 'POST', body: o }); toast('Holiday added', 'ok'); route(); };
ACT.holDel = async d => { await api('/holidays/' + d.date, { method: 'DELETE' }); route(); };
PAGES.lookups = async parts => {
  const kind = parts[1], label = kind === 'category' ? 'Recurring task categories' : 'Help ticket issue types'; title(label);
  const list = await api('/lookups/' + kind);
  return `<div class="page-h"><div><h2>${label}</h2><p>These appear as dropdown choices when people create tasks.</p></div></div>
  <form class="filters" data-form="lookup" data-kind="${kind}"><input type="hidden" name="kind" value="${kind}"><input name="name" placeholder="New name" required style="min-width:260px"><button class="btn primary">${ic('plus', 16)} Add</button></form>
  <div class="card">${list.length ? list.map(x => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><b style="flex:1">${esc(x.name)}</b><button class="btn xs danger" data-act="lookDel" data-id="${x.id}">${ic('trash', 14)}</button></div>`).join('') : '<p class="muted">Nothing yet.</p>'}</div>`;
};
FORM.lookup = async o => { await api('/lookups/' + o.kind, { method: 'POST', body: { name: o.name } }); await loadMeta(); route(); };
ACT.lookDel = async d => { if (!(await confirmBox('Delete this item?', 'Existing tasks keep their value.', 'Delete'))) return; await api('/lookups/' + d.id, { method: 'DELETE' }); await loadMeta(); route(); };

/* ======================= ADMIN ======================= */
PAGES.admin = async parts => parts[1] === 'departments' ? deptsPage() : parts[1] === 'access' ? accessPage() : parts[1] === 'user' ? userEditor(parts[2]) : parts[1] === 'log' ? logPage() : parts[1] === 'settings' ? settingsPage() : parts[1] === 'maillog' ? mailLogPage() : usersPage();
const ROLE_L = { admin: ['Admin', 'purple'], hod: ['HOD', 'blue'], member: ['Team member', ''], pc: ['Process Coordination · view only', 'amber'] };
const dname = id => (S.meta.departments.find(d => d.id === id) || {}).name || '—';
async function usersPage() {
  title('Users'); await loadMeta();
  const st = qs('users', { q: '', dept: '', role: '' });
  let list = S.meta.users.filter(u => isAdmin() || u.dept_id === S.user.dept_id);
  if (st.dept) list = list.filter(u => String(u.dept_id) === st.dept); if (st.role) list = list.filter(u => u.role === st.role);
  if (st.q) list = list.filter(u => (u.name + u.emp_code + u.email).toLowerCase().includes(st.q.toLowerCase()));
  const rows = list.map(u => `<tr><td>${avatar(u.name, 'sm')} <b>${esc(u.name)}</b></td><td>${esc(u.emp_code || '—')}</td><td>${esc(u.email || '—')}</td><td>${badge(ROLE_L[u.role][0], ROLE_L[u.role][1])}</td><td>${esc(dname(u.dept_id))}</td><td>${!u.active ? badge('Inactive') : u.expires_at && Date.parse(u.expires_at) < Date.now() ? badge('Expired', 'red') : badge('Active', 'green')}${u.expires_at && Date.parse(u.expires_at) >= Date.now() ? `<div class="muted sm">until ${fmtMs(Date.parse(u.expires_at))}</div>` : ''}</td><td class="noexp">${u.role === 'admin' && !isAdmin() ? '' : `<a class="btn xs" href="#/admin/user/${u.id}">${ic('edit', 14)} Edit access</a>`}</td></tr>`);
  return `<div class="page-h"><div><h2>Users</h2><p>${isAdmin() ? 'Everyone who can sign in. The admin creates HODs and Process Coordination users.' : 'People in your department.'}</p></div><span class="sp"></span><a class="btn" href="#/import?type=users">${ic('upload', 16)} Import users</a><button class="btn green" data-act="userEdit">${ic('plus', 16)} Add user</button></div>
  <div class="filters">${searchBox('users', st.q, 'Search name, code, email…')}${isAdmin() ? `<select data-change="setq" data-page="users" data-key="dept">${deptOpts(st.dept, 'All departments')}</select><select data-change="setq" data-page="users" data-key="role">${optHtml(Object.entries(ROLE_L).map(([v, l]) => ({ v, l: l[0] })), st.role, 'All roles')}</select>` : ''}</div>
  ${table('users', ['User', 'Employee code', 'Email', 'Role', 'Department', 'Status', '!Actions'], rows, { emptyTitle: 'No users found' })}`;
}
ACT.userEdit = async () => {
  const f = [{ name: 'name', label: 'Full name', required: true }, { name: 'emp_code', label: 'Employee code' }, { name: 'email', label: 'Email (used to sign in)', type: 'email' }];
  if (isAdmin()) f.push({ name: 'role', label: 'Role', type: 'select', value: 'member', options: Object.entries(ROLE_L).map(([v, l]) => ({ v, l: l[0] })) }, { name: 'dept_id', label: 'Department', type: 'select', options: S.meta.departments.map(x => ({ v: x.id, l: x.name })), blank: 'None' });
  f.push({ name: 'password', label: 'Temporary password', placeholder: 'welcome123' }, { name: 'must_change_pw', label: 'Ask to choose a new password at first sign-in', type: 'select', value: '1', options: [{ v: '1', l: 'Yes' }, { v: '0', l: 'No' }] });
  const r = await ask({ title: 'Add user', text: 'After saving you can choose exactly what this person can open.', fields: f, ok: 'Create & set access' }); if (!r) return;
  const x = await api('/users', { method: 'POST', body: r }); await loadMeta(); toast('User created', 'ok'); location.hash = '#/admin/user/' + x.id;
};
async function deptsPage() {
  title('Departments'); await loadMeta();
  const rows = S.meta.departments.map(d => `<tr><td><b>${esc(d.name)}</b></td><td><select data-change="deptHod" data-id="${d.id}">${userOpts(d.hod_id || '', 'No HOD', u => u.role !== 'pc' && u.role !== 'admin')}</select></td><td>${S.meta.users.filter(u => u.dept_id === d.id && u.active).length}</td><td class="noexp"><div class="row"><button class="btn xs" data-act="deptRename" data-id="${d.id}" data-name="${esc(d.name)}">Rename</button><button class="btn xs danger" data-act="deptDel" data-id="${d.id}">Delete</button></div></td></tr>`);
  return `<div class="page-h"><div><h2>Departments</h2><p>Each department has one HOD, who controls access for their own team.</p></div><span class="sp"></span><button class="btn green" data-act="deptNew">${ic('plus', 16)} Add department</button></div>
  ${table('departments', ['Department', 'Head of department (HOD)', 'People', '!Actions'], rows, { emptyTitle: 'No departments' })}`;
}
ACT.deptNew = async () => { const r = await ask({ title: 'Add department', fields: [{ name: 'name', label: 'Department name', required: true }] }); if (!r) return; await api('/departments', { method: 'POST', body: r }); await loadMeta(); route(); };
ACT.deptRename = async d => { const r = await ask({ title: 'Rename department', fields: [{ name: 'name', label: 'Department name', value: d.name, required: true }] }); if (!r) return; await api('/departments/' + d.id, { method: 'PUT', body: r }); await loadMeta(); route(); };
ACT.deptDel = async d => { if (!(await confirmBox('Delete this department?', 'Only possible when no users belong to it.', 'Delete'))) return; await api('/departments/' + d.id, { method: 'DELETE' }); await loadMeta(); route(); };
CHG.deptHod = async (v, el, d) => { await api('/departments/' + d.id, { method: 'PUT', body: { hod_id: v } }); await loadMeta(); toast('HOD updated', 'ok'); route(); };
const MODS4 = ['tickets', 'recurring', 'delegation', 'fms'];
const MOD_L = { tickets: 'Help tickets', recurring: 'Recurring (checklist)', delegation: 'Delegation', fms: 'Process (FMS)' };
const toIso = v => v ? new Date(v).toISOString() : '';
const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso), p2 = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
async function accessPage() {
  title('Team Access'); await loadMeta();
  const st = qs('access', { dept: role() === 'hod' ? String(S.user.dept_id) : '' }); if (role() === 'hod') st.dept = String(S.user.dept_id);
  const head = `<div class="page-h"><div><h2>Team access</h2><p>See who can open what in a department. Click <b>Edit access</b> on a person to change it.</p></div><span class="sp"></span>${isAdmin() ? `<select data-change="setq" data-page="access" data-key="dept">${deptOpts(st.dept, 'Choose a department…')}</select>` : ''}</div>`;
  if (!st.dept) return head + '<div class="card empty"><h3>Choose a department</h3><p>Pick a department to see who can access its data.</p></div>';
  const dept = Number(st.dept), d = S.meta.departments.find(x => x.id === dept), { rows: g } = await api('/access?dept_id=' + dept), map = {};
  g.forEach(r => (map[r.user_id] = map[r.user_id] || []).push(r));
  const people = S.meta.users.filter(u => u.active && u.role === 'member' && (u.dept_id === dept || map[u.id]));
  const addable = S.meta.users.filter(u => u.active && u.role === 'member' && !people.includes(u));
  const cell = (u, m) => { let best = null; (map[u.id] || []).forEach(r => { if ((r.module === '*' || r.module === m) && (!best || r.level === 'editor')) best = r; });
    if (!best) return '<span class="muted">—</span>'; const exp = best.expires_at && Date.parse(best.expires_at) < Date.now();
    return (exp ? badge('Expired', 'red') : badge(best.level === 'editor' ? 'Edit' : 'View', best.level === 'editor' ? 'green' : 'blue')) + (best.expires_at && !exp ? ` <span class="muted sm" title="Until ${esc(fmtMs(Date.parse(best.expires_at)))}">⏱</span>` : ''); };
  return head + `<div class="notice blue" style="margin-bottom:14px"><b>${esc(d.name)}</b> · HOD: ${esc(d.hod_name || 'not assigned')} (full access automatically). Process-Coordination users are always view-only on every department. People can always see and update tasks <b>assigned to them</b>, even without access here.</div>
  <form class="filters" data-form="accessAdd"><select name="user_id" required style="min-width:280px">${optHtml(addable.map(u => ({ v: u.id, l: u.name + (u.emp_code ? ' – ' + u.emp_code : '') + (u.dept_id !== dept ? ' · ' + dname(u.dept_id) : '') })), '', 'Add a person from any department…')}</select><button class="btn primary">${ic('plus', 16)} Add &amp; set access</button></form>
  ${table('access', ['Person', 'Home department', ...MODS4.map(m => MOD_L[m]), '!Actions'], people.map(u => `<tr><td>${avatar(u.name, 'sm')} <b>${esc(u.name)}</b><div class="muted sm">${esc(u.emp_code || '')}</div></td><td>${esc(dname(u.dept_id))}</td>${MODS4.map(m => `<td>${cell(u, m)}</td>`).join('')}<td class="noexp"><a class="btn xs" href="#/admin/user/${u.id}">${ic('edit', 14)} Edit access</a></td></tr>`), { emptyTitle: 'No team members yet', empty: 'Add people above, then choose what each can open.' })}`;
}
FORM.accessAdd = async o => { location.hash = '#/admin/user/' + o.user_id; };

/* ---- Edit access: profile & sign-in + what can this person open? ---- */
async function userEditor(id) {
  title('Edit access'); await loadMeta();
  const d = await api(`/users/${id}/access`), t = d.user, map = {}, now = Date.now();
  d.grants.forEach(g => (g.module === '*' ? MODS4 : [g.module]).forEach(m => { const k = g.dept_id + '_' + m, c = map[k]; if (!c || (g.level === 'editor' && c.level !== 'editor')) map[k] = { level: g.level, expires: g.expires_at }; }));
  const off = t.role === 'admin' || t.role === 'pc', ro = !d.can_profile, adm = isAdmin();
  const note = t.role === 'admin' ? 'Administrators always have full access to everything — no need to tick anything.' : t.role === 'pc' ? 'Process Coordination users are always view-only on everything — no need to tick anything.' : t.role === 'hod' ? 'HODs have full edit access to their own department automatically. Tick rows below only to give access to other departments.' : '';
  const matrix = d.depts.map(dp => `<tr class="sec"><td colspan="5">${esc(dp.name)}</td></tr>` + MODS4.map(m => { const c = map[dp.id + '_' + m] || { level: '', expires: null }, k = dp.id + '_' + m, exp = c.expires && Date.parse(c.expires) < now;
    return `<tr class="grow" data-dept="${dp.id}" data-mod="${m}"><td>${MOD_L[m]}</td>${['', 'viewer', 'editor'].map(v => `<td class="c"><input type="radio" name="g_${k}" value="${v}" ${c.level === v ? 'checked' : ''} ${off ? 'disabled' : ''}></td>`).join('')}<td><div class="row" style="flex-wrap:nowrap;gap:6px"><input type="datetime-local" class="gx" value="${toLocalInput(c.expires)}" ${off ? 'disabled' : ''}>${exp ? '<span class="badge red">expired</span>' : ''}<button type="button" class="xbtn" data-act="rowClearAcc" title="Remove this access" ${off ? 'disabled' : ''}>✕</button></div></td></tr>`; }).join('')).join('');
  const fld = 'style="width:100%"';
  return `<div class="page-h"><a class="btn" href="#/admin/${adm ? 'users' : 'access'}">←</a><div><h2>Edit access</h2><p>${esc(t.name)}${t.email ? ' · ' + esc(t.email) : ''}</p></div></div>
  <div class="card" style="margin-bottom:16px;max-width:980px" id="uedit" data-off="${off ? 1 : 0}" data-id="${t.id}"><h3 style="margin-bottom:14px">Profile &amp; sign-in</h3>
    ${ro ? '<div class="notice" style="margin-bottom:14px">The profile of people from other departments is managed by the admin or their own HOD. You can still set their access to your department below.</div>' : ''}
    <div class="form">
      <label class="f"><span>Full name</span><input id="uf-name" value="${esc(t.name)}" ${ro ? 'disabled' : ''} ${fld}></label>
      <label class="f"><span>Username</span><input value="${esc(t.email || '')}" disabled ${fld}><small>Usernames can't be changed.</small></label>
      <label class="f"><span>New password</span><div class="row" style="flex-wrap:nowrap"><input id="uf-pw" placeholder="leave blank to keep current" autocomplete="new-password" ${ro ? 'disabled' : ''} style="flex:1"><button type="button" class="btn" data-act="genPw" ${ro ? 'disabled' : ''}>Generate</button></div><small>Share it with the person securely — they can change it in My profile.</small></label>
      <label class="f"><span>Role</span><select id="uf-role" ${adm && !d.self && !ro ? '' : 'disabled'} ${fld}>${optHtml(Object.entries({ admin: 'Administrator — full access + admin panels', hod: 'HOD — full access to own department', member: 'Team member — only what is ticked below', pc: 'Process Coordination — view-only everywhere' }).map(([v, l]) => ({ v, l })), t.role)}</select></label>
      <label class="f"><span>Reminder e-mail</span><input id="uf-nemail" type="email" value="${esc(t.notify_email || '')}" placeholder="${esc(t.email || 'name@company.com')}" ${ro ? 'disabled' : ''} ${fld}><small>Daily reminders and instant notifications go here. Leave empty to use the username e-mail.</small></label>
      <label class="f"><span>Phone</span><input id="uf-phone" value="${esc(t.phone || '')}" ${ro ? 'disabled' : ''} ${fld}></label>
      <label class="f"><span>Employee code</span><input id="uf-code" value="${esc(t.emp_code || '')}" ${ro ? 'disabled' : ''} ${fld}></label>
      <label class="f"><span>Home department</span><select id="uf-dept" ${adm && !ro ? '' : 'disabled'} ${fld}>${deptOpts(t.dept_id, 'None')}</select></label>
      <label class="f"><span>Whole account expires (optional)</span><div class="row" style="flex-wrap:nowrap"><input type="datetime-local" id="uf-exp" value="${toLocalInput(t.expires_at)}" ${ro ? 'disabled' : ''} style="flex:1"><button type="button" class="btn" data-act="clrExp" ${ro ? 'disabled' : ''}>Clear</button></div><small>After this moment the login stops working, whatever access is ticked.</small></label>
      <div class="f"><span>Status</span><label class="check"><input type="checkbox" id="uf-active" ${t.active ? 'checked' : ''} ${ro || d.self ? 'disabled' : ''}> Account is active</label><label class="check"><input type="checkbox" id="uf-mcp" ${t.must_change_pw ? 'checked' : ''} ${ro ? 'disabled' : ''}> Ask to choose a new password at first sign-in</label></div>
    </div></div>
  <div class="card ${off ? 'off-card' : ''}" style="max-width:980px"><h3 style="margin-bottom:4px">What can this person open?</h3><p class="muted" style="margin:0 0 12px">${note || 'Choose what this person can see or edit. <b>View</b> = look only · <b>Edit</b> = add and change.'}${role() === 'hod' ? ` You can manage access in <b>${esc(d.depts[0] ? d.depts[0].name : 'your department')}</b>.` : ''}</p>
    ${off ? '' : `<div class="row" style="margin-bottom:12px;gap:8px"><span class="muted sm">Quick set:</span><button type="button" class="pill" data-act="qsAll" data-lv="viewer">Everything · view</button><button type="button" class="pill" data-act="qsAll" data-lv="editor">Everything · edit</button><button type="button" class="pill" data-act="qsClear">Clear all</button><span class="muted sm" style="margin-left:10px">Expire ticked rows in:</span>${[['1 hour', 1], ['1 day', 24], ['7 days', 168], ['30 days', 720], ['Never', 0]].map(([l, h]) => `<button type="button" class="pill" data-act="qsExp" data-h="${h}">${l}</button>`).join('')}</div>`}
    <div class="tbl-wrap ${off ? 'off' : ''}"><table class="tbl matrix" style="min-width:640px"><thead><tr><th>Module</th><th class="c">No access</th><th class="c">View</th><th class="c">Edit</th><th>Access expires (optional)</th></tr></thead><tbody>${matrix}</tbody></table></div>
    <div class="modal-actions"><a class="btn" href="#/admin/${adm ? 'users' : 'access'}">Cancel</a><button class="btn primary" data-act="userSave" data-id="${t.id}">Save changes</button></div></div>`;
}
const GEN = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
ACT.genPw = () => { $('#uf-pw').value = Array.from(crypto.getRandomValues(new Uint32Array(10)), n => GEN[n % GEN.length]).join(''); toast('Password generated — copy it and share it securely', 'ok'); };
ACT.clrExp = () => { $('#uf-exp').value = ''; };
ACT.rowClearAcc = (d, el) => { const tr = el.closest('tr'); tr.querySelector('input[type=radio][value=""]').checked = true; tr.querySelector('.gx').value = ''; };
ACT.qsAll = d => $$('tr.grow').forEach(tr => { const r = tr.querySelector(`input[type=radio][value="${d.lv}"]`); if (r) r.checked = true; });
ACT.qsClear = () => $$('tr.grow').forEach(tr => { tr.querySelector('input[type=radio][value=""]').checked = true; tr.querySelector('.gx').value = ''; });
ACT.qsExp = d => { const h = Number(d.h); $$('tr.grow').forEach(tr => { if (tr.querySelector('input[type=radio]:checked').value) tr.querySelector('.gx').value = h ? toLocalInput(new Date(Date.now() + h * 36e5).toISOString()) : ''; }); };
ACT.userSave = async d => {
  const box = $('#uedit'), body = {};
  if (!$('#uf-name').disabled) body.profile = { name: $('#uf-name').value, emp_code: $('#uf-code').value, notify_email: $('#uf-nemail').value, phone: $('#uf-phone').value, expires_at: toIso($('#uf-exp').value) || null, must_change_pw: $('#uf-mcp').checked, ...($('#uf-pw').value ? { password: $('#uf-pw').value } : {}),
    ...(!$('#uf-active').disabled ? { active: $('#uf-active').checked } : {}), ...(!$('#uf-role').disabled ? { role: $('#uf-role').value, dept_id: $('#uf-dept').value } : {}) };
  if (box.dataset.off !== '1') body.grants = $$('tr.grow').map(tr => ({ dept_id: tr.dataset.dept, module: tr.dataset.mod, level: (tr.querySelector('input[type=radio]:checked') || {}).value, expires_at: toIso(tr.querySelector('.gx').value) || null })).filter(g => g.level);
  await api(`/users/${d.id}/access`, { method: 'PUT', body }); await loadMeta(); toast('Saved', 'ok'); route();
};

/* ---- Activity log ---- */
const EV_COLOR = { 'Signed in': 'green', 'Sign-in failed': 'red', 'User created': 'indigo', 'Access changed': 'amber', 'Setup': 'blue', 'Password reset': 'purple', 'Password changed': 'purple', 'Role changed': 'purple', 'Account deactivated': 'red', 'Account activated': 'green', 'Account expiry changed': 'amber', 'HOD changed': 'blue' };
async function logPage() {
  title('Activity Log'); const st = qs('log', { event: '', q: '' });
  const d = await api(`/audit?event=${encodeURIComponent(st.event)}&q=${encodeURIComponent(st.q)}`);
  return `<div class="page-h"><div><h2>Activity Log</h2><p>Sign-ins, failed attempts and every change to users or access — newest first (last 300 events).</p></div><span class="sp"></span>${exportBtn('activity-log')}</div>
  <div class="filters"><select data-change="setq" data-page="log" data-key="event">${optHtml(d.events.map(e => ({ v: e, l: e })), st.event, 'All events')}</select>${searchBox('log', st.q, 'Search person, event, details…')}</div>
  ${table('activity-log', ['When', 'By', 'Event', 'User', 'Details'], d.rows.map(r => `<tr><td class="nowrap">${fmtMs(Date.parse(r.at))}</td><td>${esc(r.by_label)}</td><td>${badge(r.event, EV_COLOR[r.event] || '')}</td><td>${esc(r.target_label || '')}</td><td class="muted"><div class="desc" style="max-width:520px" title="${esc(r.details || '')}">${esc(r.details || '')}</div></td></tr>`), { emptyTitle: 'Nothing logged yet' })}`;
}

/* ======================= PROFILE ======================= */
PAGES.profile = async () => {
  title('My profile'); const u = S.user;
  return `<div class="page-h"><div><h2>My profile</h2></div></div><div class="grid g2" style="max-width:900px"><div class="card"><div class="row" style="flex-wrap:nowrap">${avatar(u.name)}<div><b>${esc(u.name)}</b><div class="muted sm">${esc(u.email || '')} · ${esc(u.emp_code || '')}</div></div></div><hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><p>${badge(ROLE_L[u.role][0], ROLE_L[u.role][1])} <span class="muted">${esc(dname(u.dept_id))}</span></p></div>
  <form class="card" data-form="password"><h3 style="margin-bottom:12px">Change password</h3><label class="f" style="margin-bottom:12px"><span>Current password</span><input type="password" name="old" required></label><label class="f" style="margin-bottom:12px"><span>New password (min 6 characters)</span><input type="password" name="new" minlength="6" required></label><button class="btn primary">Update password</button></form></div>`;
};
FORM.password = async (o, fm) => { await api('/me/password', { method: 'POST', body: o }); fm.reset(); toast('Password updated', 'ok'); };


/* ======================= MIS REPORT ======================= */
PAGES.report = async () => {
  title('MIS Report');
  const st = qs('report', { period: 'month', from: '', to: '', dept: '', type: '', process: '', carried: '1' });
  const d = await api(`/report?period=${st.period}&from=${st.from}&to=${st.to}&dept=${st.dept}&type=${st.type}&process=${st.process}&carried=${st.carried}`), W = d.workDone, O = d.onTime; window.__rep = d;
  const pts = v => v == null ? '—' : (v > 0 ? '+' : '') + v;
  const col = v => v == null ? '' : v >= 0 ? 'up' : 'down';
  const vs = v => v == null ? '' : `<div class="st ${col(v)}">vs prev ${pts(v)} pts</div>`;
  const card = (label, big, unit, sub, color, extra = '') => `<div class="mcard" style="--c:${color}"><span>${label}</span><div class="big">${big}<small>${unit}</small></div><div class="muted sm">${sub}</div>${extra}</div>`;
  const stat = (gap, ok, bad) => gap == null ? '' : `<div class="st ${gap >= 0 ? 'up' : 'down'}">${gap >= 0 ? ok : bad}</div>`;
  const pct = v => v == null ? '—' : v;
  const bench = (v, who) => card('Benchmark', v, '%', 'Admin-set target', '#7c3aed', isAdmin() ? `<div><a href="#" data-act="benchEdit" class="sm">Edit benchmarks</a></div>` : '');
  const tdp = x => `<td>${x.assigned}</td><td>${x.completed}</td><td>${x.pctDone == null ? '—' : x.pctDone + '%'}</td><td>${x.pctOnTime == null ? '—' : x.pctOnTime + '%'}</td><td>${x.overdue ? badge(x.overdue, 'red') : 0}</td><td>${x.rework || 0}</td>`;
  const heads = ['Assigned', 'Completed', '% done', '% on time', 'Overdue', 'Rework'];
  const per = d.period, none = !W.assigned;
  return `<div class="page-h"><div><h2>MIS Report</h2><p>Work done and work done on time, scored against your benchmark.</p></div><span class="sp"></span><span class="badge ${d.scope.kind === 'all' ? 'purple' : 'blue'}">${ic('eye', 13)} ${esc(d.scope.label)}</span></div>
  <div class="filters" style="align-items:center">${[['week', 'WEEK'], ['month', 'MONTH'], ['quarter', 'QUARTER'], ['ytd', 'YTD']].map(([v, l]) => `<button class="pill${st.period === v ? ' on' : ''}" data-act="setq" data-page="report" data-key="period" data-val="${v}">${l}</button>`).join('')}
    <input type="date" value="${esc(st.from)}" data-change="repRange" data-key="from" title="From"><input type="date" value="${esc(st.to)}" data-change="repRange" data-key="to" title="To">
    <select data-change="setq" data-page="report" data-key="dept">${optHtml(d.deptOptions.map(x => ({ v: x.id, l: x.name })), st.dept, d.scope.kind === 'all' ? 'All departments' : 'All in my scope')}</select>
    <select data-change="setq" data-page="report" data-key="type">${optHtml([{ v: 'tickets', l: 'Help Tickets' }, { v: 'recurring', l: 'Recurring' }, { v: 'delegation', l: 'Delegation' }, { v: 'process', l: 'Process (FMS)' }], st.type, 'Task type: All')}</select>
    <select data-change="setq" data-page="report" data-key="process">${optHtml(d.processOptions.map(x => ({ v: x.id, l: x.name })), st.process, 'Process: All')}</select>
    <button class="pill${st.carried === '1' ? ' on' : ''}" data-act="setq" data-page="report" data-key="carried" data-val="${st.carried === '1' ? '0' : '1'}" title="Include earlier tasks that are still not done">Include carried forward ${st.carried === '1' ? '✓' : ''}</button></div>
  <div class="muted sm" style="margin:-4px 0 6px">${esc(per.label)} · ${fmtD(per.from)} – ${fmtD(per.to)} · compared with ${fmtD(per.prevFrom)} – ${fmtD(per.prevTo)}</div>
  ${none ? `<div class="card empty">${ic('chart', 34)}<h3>No work in this period</h3><p>Nothing matches these filters. Try a wider period or clear the filters.</p></div>` : `
  <div class="sechead"><h3>Work <b>Done</b></h3><span class="muted sm">percentage first · count included · trend vs previous period</span></div>
  <div class="grid g3">${card('Total tasks assigned', W.assigned, 'tasks', 'Current selected period load', '#2563eb')}${card('Total task completed', W.completed, 'tasks', `${pct(W.pctDone)}% of the load`, '#0d9488', vs(W.delta))}${card('% Not completed', pct(W.pctNotDone), '%', `${W.pending} / ${W.assigned} pending`, '#d97706')}
    ${bench(d.bench.done)}${card('Gap vs benchmark', pts(W.gap), 'pts', `${pct(W.pctDone)}% vs ${d.bench.done}% target`, W.gap >= 0 ? '#0f9d6b' : '#dc2626', stat(W.gap, 'Above benchmark', 'Below benchmark'))}${card('Module streak health', `${d.streak.met}/${d.streak.live}`, 'live', d.streak.broken.length ? esc(d.streak.broken.join(' + ')) + ' below benchmark' : 'All live modules on target', d.streak.met === d.streak.live ? '#0f9d6b' : '#9f1239')}</div>
  <div class="sechead"><h3>Work Done <b>On Time</b></h3></div>
  <div class="grid g3">${card('Total task completed', O.completed, 'tasks', 'Work done this selected period', '#2563eb')}${card('Total on time', O.onTime, 'tasks', `${pct(O.pctOnTime)}% of completed`, '#0d9488', vs(O.delta))}${card('% Not on time', pct(O.pctNotOnTime), '%', `${O.completed - O.onTime} / ${O.completed} late`, '#d97706')}
    ${card('Benchmark', d.bench.ontime, '%', 'Admin-set target', '#7c3aed')}${card('Gap vs benchmark', pts(O.gap), 'pts', `${pct(O.pctOnTime)}% vs ${d.bench.ontime}% target`, O.gap >= 0 ? '#0f9d6b' : '#dc2626', stat(O.gap, 'Above benchmark', 'Below benchmark'))}${card('Overdue right now', W.overdue, 'tasks', `${W.rework} with rework`, '#9f1239')}</div>
  ${misStreaks(d)}${misDepts(d, st)}${misLeaders(d, st)}${misTrend(d, st)}
  <div class="sechead"><h3>By <b>module</b></h3><span class="sp" style="flex:1"></span>${exportBtn('mis-by-module')}</div>
  ${table('mis-by-module', ['Module', ...heads, 'On target?'], d.modules.map(m => `<tr><td><b>${esc(m.label)}</b></td>${tdp(m)}<td>${m.assigned ? (m.met ? badge('Yes', 'green') : badge('Below', 'red')) : '<span class="muted">—</span>'}</td></tr>`))}
  <div class="sechead"><h3>By <b>department</b></h3><span class="muted sm">${d.scope.kind === 'dept' ? 'your department and the departments your team works with' : ''}</span><span class="sp" style="flex:1"></span>${exportBtn('mis-by-department')}</div>
  ${table('mis-by-department', ['Department', ...heads], d.byDept.map(x => `<tr><td><b>${esc(x.name)}</b>${S.user.dept_id && String(x.k) === String(S.user.dept_id) ? ' ' + badge('Yours', 'blue') : ''}</td>${tdp(x)}</tr>`))}
  <div class="sechead"><h3>By <b>person</b></h3><span class="muted sm">${role() === 'hod' ? 'people in your department' : ''}</span><span class="sp" style="flex:1"></span>${exportBtn('mis-by-person')}</div>
  ${table('mis-by-person', ['Person', 'Department', ...heads], d.byPerson.map(x => `<tr><td>${avatar(x.name, 'sm')} <a href="#" data-act="why" data-id="${x.k}"><b>${esc(x.name)}</b></a></td><td>${esc(x.dept)}</td>${tdp(x)}</tr>`), { emptyTitle: 'No people to show' })}`}`;
};
CHG.repRange = (v, el, d) => { const q = Q.report = Q.report || {}; q[d.key] = v; if (q.from && q.to) q.period = 'custom'; route(); };
ACT.benchEdit = async () => {
  const s = await api('/settings'); const r = await ask({ title: 'Benchmarks', text: 'The target every score is compared with.', fields: [{ name: 'bench_done', label: 'Work done benchmark (%)', type: 'number', value: s.bench_done, required: true }, { name: 'bench_ontime', label: 'Work done on time benchmark (%)', type: 'number', value: s.bench_ontime, required: true }] }); if (!r) return;
  await api('/settings', { method: 'PUT', body: r }); toast('Benchmarks saved', 'ok'); route();
};

/* ======================= SETTINGS ======================= */
async function settingsPage() {
  title('Settings'); const s = await api('/settings'), days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `<div class="page-h"><div><h2>Settings</h2><p>Targets and calendar rules used across the app.</p></div></div>
  <form class="card" data-form="settings" style="max-width:760px"><div class="form">
    <label class="f"><span>Work done benchmark (%)</span><input type="number" name="bench_done" min="0" max="100" value="${s.bench_done}" required><small>MIS report compares the share of completed work with this target.</small></label>
    <label class="f"><span>Work done on time benchmark (%)</span><input type="number" name="bench_ontime" min="0" max="100" value="${s.bench_ontime}" required></label>
    <label class="f"><span>Financial year starts in</span><select name="fy_start">${optHtml(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ v: i + 1, l: m })), s.fy_start)}</select><small>Decides what “Quarter” and “YTD” mean in the MIS report.</small></label>
    <label class="f"><span>Delete completed work after (days)</span><input type="number" name="purge_days" min="0" step="1" value="${s.purge_days || 0}"><small>0 = keep everything. Example: 30 removes finished checklist tasks, tickets, delegation tasks and FMS jobs 30 days after they were completed. Pending and overdue work is never touched. The MIS report then only shows the last 30 days (and older months disappear from its history), so use this only if you do not need long-term reports. Minimum 7.</small></label>
    <div class="f"><span style="font-weight:600;font-size:13px">Weekly off days</span><div class="radios">${days.map((n, i) => `<label class="check"><input type="checkbox" name="weekly_off" value="${i}" ${s.weekly_off.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</div><small>Daily recurring tasks are not created on these days (or on holidays). Applies to tasks created from now on.</small></div></div>
    <div class="modal-actions"><button class="btn primary">Save settings</button></div></form>${await mailCard()}`;
}
FORM.settings = async o => { await api('/settings', { method: 'PUT', body: { bench_done: o.bench_done, bench_ontime: o.bench_ontime, fy_start: o.fy_start, weekly_off: arr(o.weekly_off), purge_days: o.purge_days } }).then(r => { const p = r && r.purged, n = p ? p.recurring + p.tickets + p.delegation + p.process : 0; toast(n ? `Settings saved – ${n.toLocaleString()} old completed items removed` : 'Settings saved', 'ok'); route(); }); };


/* ======================= SMART WORKBOOK IMPORT ======================= */
const WB = { file: null, pv: null };
const wbCard = () => `<div class="card" style="margin-bottom:22px;border-left:4px solid var(--brand)"><h3 style="margin-bottom:4px">⚡ Import a whole sheet — Checklist · Delegation · FMS</h3>
  <p class="muted" style="margin:0 0 12px">Upload your Google-Sheet workbook exactly as it is (Google Sheets → File → Download → Microsoft Excel). I recognise the layout, show what will be created, and then enter everything: people with their e-mails, tasks, history, holidays and process entries.</p>
  <div class="drop" id="wbdrop"><div style="margin-bottom:8px">${ic('upload', 30)}</div><b>Drop your workbook here</b><div class="muted sm" style="margin:4px 0 12px">.xlsx · up to 60 MB · big sheets take a few seconds</div><input type="file" id="wbfile" accept=".xlsx,.xlsm,.xls" data-change="wbFile"></div><div id="wbout"></div></div>`;
CHG.wbFile = async (v, el) => { WB.file = el.files[0]; if (WB.file) await wbPreview(); };
document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('#wbdrop')) { e.preventDefault(); $('#wbdrop').classList.add('over'); } });
document.addEventListener('dragleave', () => { const z = $('#wbdrop'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => { if (e.target.closest && e.target.closest('#wbdrop')) { e.preventDefault(); $('#wbdrop').classList.remove('over'); WB.file = e.dataTransfer.files[0]; if (WB.file) wbPreview(); } });
async function wbPreview() {
  const out = $('#wbout'); out.innerHTML = '<p class="muted" style="margin-top:14px">Reading <b>' + esc(WB.file.name) + '</b>… large sheets take a few seconds.</p>';
  try { const f = new FormData(); f.append('file', WB.file); WB.pv = await api('/import/workbook/preview', { method: 'POST', form: f }); wbRender(); }
  catch (e) { out.innerHTML = `<div class="notice" style="margin-top:14px"><b>Could not use this file.</b> ${esc(e.message)}</div>`; }
}
const tile = (l, n, sub, c = '#2563eb') => `<div class="mcard" style="--c:${c}"><span>${l}</span><div class="big">${n}</div><div class="muted sm">${sub || ''}</div></div>`;
function wbRender() {
  const pv = WB.pv, out = $('#wbout'), hod = role() === 'hod', warn = (pv.warnings || []).map(w => `<div class="notice" style="margin-top:8px">${esc(w)}</div>`).join('');
  const people = (n, ex) => `<label class="check" style="margin-top:12px"><input type="checkbox" id="wb-people" checked> Create the people I don’t have yet <span class="muted sm">(${n - ex} new · default password <b>welcome123</b>, they must change it at first sign-in)</span></label>`;
  let body = '';
  if (pv.kind === 'checklist') {
    const c = pv.checklist, fr = Object.entries(c.byFreq).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ');
    body = `<div class="grid g3" style="margin:12px 0">${tile('People', c.doers, `${c.doersExisting} already exist · ${c.doersNoEmail} without an e-mail`, '#0d9488')}${tile('Recurring tasks', c.tasks, esc(fr), '#2563eb')}${tile('Departments', c.departments.length, c.departments.map(d => d.name + (d.exists ? '' : ' (new)')).join(', '), '#7c3aed')}
      ${tile('History', c.history.importable, `${c.history.done} done · ${c.history.pending} pending${c.history.future ? ' · ' + c.history.future + ' future rows skipped (created automatically later)' : ''}`, '#d97706')}${tile('Holidays', c.holidays, `${c.gh} company · ${c.rh} restricted`, '#9f1239')}${tile('Reminder time', c.settings.reminder_hour != null ? c.settings.reminder_hour + ':00' : '—', c.settings.reminder_hour != null ? 'read from your Setup sheet' : 'not found in the file', '#4338ca')}</div>
      ${people(c.doers, c.doersExisting)}<label class="check"><input type="checkbox" id="wb-history" checked> Import the task history (done / pending rows from the Master sheet)</label>${hod ? '' : '<label class="check"><input type="checkbox" id="wb-hol" checked> Import the Holiday List</label><label class="check"><input type="checkbox" id="wb-set" checked> Apply the sheet’s settings (reminder time)</label>'}`;
  } else if (pv.kind === 'delegation') {
    const c = pv.delegation;
    body = `<div class="grid g3" style="margin:12px 0">${tile('People', c.doers, `${c.doersExisting} already exist`, '#0d9488')}${tile('Delegated tasks', c.tasks, `${c.done} completed · ${c.open} open`, '#2563eb')}${tile('Revised dates', c.revised, 'tasks whose date moved', '#d97706')}</div>
      <label class="f" style="max-width:420px"><span>Put the tasks on this board</span><input id="wb-board" value="${esc(c.boardName)}"></label>${people(c.doers, c.doersExisting)}<p class="muted sm" style="margin:10px 0 0">Completed tasks are counted as finished on their latest due date, because the sheet does not record when they were closed.</p>`;
  } else {
    const c = pv.fms, depts = S.meta.departments;
    body = `<div class="grid g3" style="margin:12px 0">${tile('Entries', c.entries, `${c.completed} completed · ${c.entries - c.completed} still running`, '#2563eb')}${tile('Steps', c.steps.length, esc(c.steps.map(s => s.name).join(' → ')).slice(0, 110), '#0d9488')}${tile('Form fields', c.fields.length, esc(c.fields.map(f => f.label).join(', ')).slice(0, 110), '#7c3aed')}</div>
      <div class="form"><label class="f"><span>Process name</span><input id="wb-pname" value="${esc(c.name)}"></label>
      ${hod ? '' : `<label class="f"><span>Department</span><select id="wb-dept" data-change="wbDept">${optHtml(depts.map(d => ({ v: d.id, l: d.name })), '', '➕ Create a new department…')}</select></label><label class="f" id="wb-newdept-w"><span>New department name</span><input id="wb-newdept" placeholder="e.g. Production Planning"></label>`}</div>
      <h4 style="margin:16px 0 6px">Who does each step?</h4><div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>In your sheet</th><th>Person here</th></tr></thead><tbody>${c.whos.map((w, i) => `<tr><td><b>${esc(w.text)}</b></td><td><select class="wb-who" data-who="${esc(w.text)}" data-change="wbWho">${optHtml(S.meta.users.filter(u => u.active).map(u => ({ v: u.id, l: u.name })), w.suggested || '', '➕ Create a new person')}</select> <input class="wb-newname" data-for="${esc(w.text)}" value="${esc(w.newName)}" style="${w.suggested ? 'display:none' : ''}" title="Name of the new person"></td></tr>`).join('')}</tbody></table></div>
      <div class="tbl-wrap" style="margin-top:12px"><table class="tbl" style="min-width:520px"><thead><tr><th>#</th><th>Step</th><th>Rule found in your sheet</th></tr></thead><tbody>${c.steps.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.when || '—')} <span class="muted sm">→ +${s.tat} working day${s.tat === 1 ? '' : 's'} by ${esc(s.due_time || '18:00')}</span></td></tr>`).join('')}</tbody></table></div>
      ${hod ? '' : `<label class="check" style="margin-top:12px"><input type="checkbox" id="wb-set" checked> Apply opening / closing time and weekly-off days from your sheet's Config tab${c.config && c.config.close ? ` <span class="muted sm">(${esc(c.config.open || '')}–${esc(c.config.close)})</span>` : ''}</label>`}`;
  }
  const label = { checklist: 'Checklist workbook', delegation: 'Delegation workbook', fms: 'FMS workbook' }[pv.kind];
  out.innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="row"><span class="badge green">✓ Recognised</span><h3 style="margin:0">${label}</h3><span class="muted sm">${esc(WB.file.name)}</span></div>${warn}${body}
    <div class="modal-actions"><button class="btn primary" data-act="wbGo">Import everything</button></div>`;
}
CHG.wbDept = v => { const w = $('#wb-newdept-w'); if (w) w.style.display = v ? 'none' : ''; };
CHG.wbWho = (v, el) => { const n = $(`.wb-newname[data-for="${CSS.escape(el.dataset.who)}"]`); if (n) n.style.display = v ? 'none' : ''; };
ACT.wbGo = async () => {
  const pv = WB.pv, o = {}, chk = id => { const e = $(id); return e ? e.checked : undefined; };
  o.create_users = chk('#wb-people') !== false; if (pv.kind === 'checklist') { o.import_history = chk('#wb-history'); o.import_holidays = chk('#wb-hol'); o.apply_settings = chk('#wb-set'); }
  if (pv.kind === 'delegation') o.board_name = $('#wb-board').value;
  if (pv.kind === 'fms') { o.name = $('#wb-pname').value; o.dept_id = $('#wb-dept') ? $('#wb-dept').value : ''; o.new_dept = $('#wb-newdept') ? $('#wb-newdept').value : ''; o.apply_settings = chk('#wb-set'); o.doers = {}; o.new_names = {};
    $$('.wb-who').forEach(s => { o.doers[s.dataset.who] = s.value || 'new'; }); $$('.wb-newname').forEach(i => { o.new_names[i.dataset.for] = i.value; });
    if (!o.dept_id && !o.new_dept.trim() && role() !== 'hod') throw new Error('Choose a department, or type the name of a new one'); }
  const btn = $('[data-act="wbGo"]'); btn.disabled = true; btn.textContent = 'Importing… please wait';
  try {
    const f = new FormData(); f.append('file', WB.file); f.append('options', JSON.stringify(o));
    const r = await api('/import/workbook/commit', { method: 'POST', form: f }); await loadMeta(); refreshBadges();
    const kv = obj => Object.entries(obj || {}).map(([k, v]) => `<div class="bar-row" style="grid-template-columns:1fr 70px"><span>${esc(k)}</span><b class="right">${esc(v)}</b></div>`).join('');
    const go = r.processId ? `<a class="btn primary" href="#/fms/${r.processId}">Open the process</a>` : r.kind === 'checklist' ? '<a class="btn primary" href="#/recurring/team">See the recurring tasks</a>' : r.boardId ? '<a class="btn primary" href="#/delegation">Open the board</a>' : '';
    $('#wbout').innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="notice blue"><b>All done ✓</b> Your data is in.</div><div class="grid g2" style="margin-top:12px"><div class="card"><h3 style="margin-bottom:6px">Created</h3>${kv(r.created) || '<p class="muted">Nothing new.</p>'}</div><div class="card"><h3 style="margin-bottom:6px">Skipped</h3>${kv(r.skipped) || '<p class="muted">Nothing skipped.</p>'}</div></div>
      ${r.warnings.length ? `<div class="card" style="margin-top:12px"><h3 style="margin-bottom:6px">Things to check</h3>${r.warnings.map(w => `<div class="muted sm" style="padding:3px 0">• ${esc(w)}</div>`).join('')}</div>` : ''}<div class="modal-actions">${go}<a class="btn" href="#/import">Import another</a></div>`;
  } catch (e) { btn.disabled = false; btn.textContent = 'Import everything'; throw e; }
};

/* ======================= E-MAIL (settings, log) ======================= */
async function mailCard() {
  const m = await api('/mail/settings'), hrs = Array.from({ length: 24 }, (_, i) => ({ v: i, l: (i % 12 || 12) + ':00 ' + (i < 12 ? 'AM' : 'PM') }));
  return `<form class="card" data-form="mail" style="max-width:760px;margin-top:18px"><div class="row" style="margin-bottom:6px"><h3 style="margin:0">E-mail reminders</h3>${m.configured ? badge('Ready to send', 'green') : badge('Not set up yet', 'amber')}<span class="sp" style="flex:1"></span><a class="btn xs" href="#/admin/maillog">E-mail log</a></div>
    <p class="muted" style="margin:0 0 14px">Every doer gets <b>one e-mail a day</b> listing what is pending up to the next working day (overdue items first), plus an instant e-mail when work is assigned to them or waits for their review.</p>
    ${m.missing_addresses.length ? `<div class="notice" style="margin-bottom:14px"><b>${m.missing_addresses.length} of ${m.people} people have no e-mail address</b> and will not get reminders: ${esc(m.missing_addresses.slice(0, 8).join(', '))}${m.missing_addresses.length > 8 ? '…' : ''}. Add it under Users → Edit access → “Reminder e-mail”.</div>` : ''}
    <div class="form">
      <label class="f"><span>Send e-mail through</span><select name="mail_provider" data-change="mailProv">${optHtml([{ v: 'smtp', l: 'SMTP — Gmail, Outlook, or your company mail server' }, { v: 'brevo', l: 'Brevo (HTTPS) — works on free hosting where SMTP is blocked' }], m.mail_provider, '— Off —')}</select></label><span></span>
      <div class="f smtp-f" style="grid-column:1/-1;${m.mail_provider === 'smtp' ? '' : 'display:none'}"><div class="form">
        <label class="f"><span>SMTP server</span><input name="smtp_host" value="${esc(m.smtp_host)}" placeholder="smtp.gmail.com"></label><label class="f"><span>Port</span><input name="smtp_port" value="${esc(m.smtp_port || '587')}"></label>
        <label class="f"><span>Username</span><input name="smtp_user" value="${esc(m.smtp_user)}" placeholder="you@company.com" autocomplete="off"></label><label class="f"><span>Password</span><input name="smtp_pass" type="password" placeholder="${m.smtp_pass ? '•••••••• (saved — leave empty to keep)' : 'Gmail: use an App Password'}" autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" name="smtp_secure" ${m.smtp_secure === '1' ? 'checked' : ''}> Use SSL (port 465). Leave off for port 587.</label></div></div>
      <div class="f brevo-f" style="grid-column:1/-1;${m.mail_provider === 'brevo' ? '' : 'display:none'}"><label class="f"><span>Brevo API key</span><input name="brevo_key" type="password" placeholder="${m.brevo_key ? '•••••••• (saved — leave empty to keep)' : 'xkeysib-…'}" autocomplete="new-password"></label></div>
      <label class="f"><span>“From” name</span><input name="mail_from_name" value="${esc(m.mail_from_name)}" placeholder="Eurobond Hub"></label><label class="f"><span>“From” e-mail</span><input name="mail_from_email" type="email" value="${esc(m.mail_from_email)}" placeholder="hub@company.com"></label>
      <label class="f" style="grid-column:1/-1"><span>Address of this website <small>(used for the “Open” buttons in the e-mails)</small></span><input name="app_url" value="${esc(m.app_url || location.origin)}"></label>
      <div class="f"><label class="check"><input type="checkbox" name="reminders_on" ${m.reminders_on === '1' ? 'checked' : ''}> Send the daily reminder</label></div><label class="f"><span>Around what time?</span><select name="reminder_hour">${optHtml(hrs, Number(m.reminder_hour || 15))}</select></label>
      <div class="f"><label class="check"><input type="checkbox" name="event_mail_on" ${m.event_mail_on !== '0' ? 'checked' : ''}> Instant e-mails (new task, review needed, date change)</label></div><div class="f"><label class="check"><input type="checkbox" name="skip_rh" ${m.skip_rh === '1' ? 'checked' : ''}> Restricted holidays also skip daily tasks</label></div>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn primary">Save e-mail settings</button><button type="button" class="btn" data-act="mailTest">Send a test e-mail</button><button type="button" class="btn" data-act="mailPreview">Preview today’s reminders</button><button type="button" class="btn" data-act="mailSend">Send reminders now</button></div>
    <p class="muted sm" style="margin:12px 0 0">Gmail: server <b>smtp.gmail.com</b>, port <b>587</b>, username = your Gmail address, password = a Google <i>App Password</i>. On free Render hosting use <b>Brevo</b>. ${m.last_digest ? 'Last daily reminder: ' + esc(m.last_digest) + '.' : ''} ${m.sent_today} e-mail(s) sent today. The password is stored in the database file — keep that file private.</p></form>`;
}
CHG.mailProv = v => { $('.smtp-f').style.display = v === 'smtp' ? '' : 'none'; $('.brevo-f').style.display = v === 'brevo' ? '' : 'none'; };
FORM.mail = async (o, fm) => {
  const body = { mail_provider: o.mail_provider, smtp_host: o.smtp_host, smtp_port: o.smtp_port, smtp_user: o.smtp_user, smtp_secure: !!o.smtp_secure, mail_from_name: o.mail_from_name, mail_from_email: o.mail_from_email, app_url: o.app_url, reminders_on: !!o.reminders_on, reminder_hour: o.reminder_hour, event_mail_on: !!o.event_mail_on, skip_rh: !!o.skip_rh };
  if (o.smtp_pass) body.smtp_pass = o.smtp_pass; if (o.brevo_key) body.brevo_key = o.brevo_key;
  await api('/mail/settings', { method: 'PUT', body }); toast('E-mail settings saved', 'ok'); route();
};
ACT.mailTest = async () => { const r = await ask({ title: 'Send a test e-mail', fields: [{ name: 'to', label: 'Send it to', type: 'email', value: S.user.email || '', required: true }], ok: 'Send test' }); if (!r) return; toast('Sending…'); const x = await api('/mail/test', { method: 'POST', body: r }); toast('Sent to ' + x.to + ' ✓ — check the inbox', 'ok'); };
ACT.mailPreview = async () => {
  const d = await api('/mail/digest', { method: 'POST', body: { dry: true } });
  openModal(`<h3>Today’s reminders</h3><p class="muted">${d.working_day ? 'These people would get a reminder covering everything pending up to ' + fmtD(d.upto) + '.' : 'Today is a non-working day, so the automatic reminder is skipped. “Send reminders now” still works.'}</p>
    ${d.recipients.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th>Person</th><th>Goes to</th><th>Pending</th><th>Overdue</th></tr></thead><tbody>${d.recipients.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${x.to ? esc(x.to) : badge('no address', 'red')}</td><td>${x.total}</td><td>${x.overdue ? badge(x.overdue, 'red') : 0}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nobody has anything pending. 🎉</p>'}<div class="modal-actions"><button class="btn" data-act="closeModal">Close</button></div>`, true);
};
ACT.mailSend = async () => { if (!(await confirmBox('Send reminders now?', 'Everyone with pending work and an e-mail address gets today’s reminder.', 'Send now'))) return; toast('Sending…'); const r = await api('/mail/digest', { method: 'POST', body: {} }); toast(`Sent ${r.sent}, failed ${r.failed}${r.noAddress.length ? ', no address for ' + r.noAddress.length : ''}`, r.failed ? 'err' : 'ok'); };
async function mailLogPage() {
  title('E-mail log'); const rows = await api('/mail/log');
  return `<div class="page-h"><div><h2>E-mail log</h2><p>The last 200 e-mails the system tried to send.</p></div><span class="sp"></span><a class="btn" href="#/admin/settings">E-mail settings</a>${exportBtn('email-log')}</div>
  ${table('email-log', ['When', 'To', 'Subject', 'Type', 'Result'], rows.map(r => `<tr><td class="nowrap">${fmtMs(Date.parse(r.at))}</td><td>${esc(r.to_addr)}</td><td>${esc(r.subject)}</td><td>${badge(r.kind || '—')}</td><td>${r.status === 'sent' ? badge('Sent', 'green') : r.status === 'failed' ? badge('Failed', 'red') : badge('Skipped', 'amber')}${r.error ? `<div class="muted sm" style="max-width:320px">${esc(r.error)}</div>` : ''}</td></tr>`), { emptyTitle: 'No e-mails yet', empty: 'Once e-mail is set up, every message appears here.' })}`;
}


/* ======================= MIS: streaks · department score · leaderboard · weekly trend ======================= */
const SC = (v, bench) => v == null ? '' : v >= bench ? 'up' : 'down';
const dlt = v => v == null || v === 0 ? '<span class="muted sm">– flat</span>' : `<span class="sm ${v > 0 ? 'up' : 'down'}" style="font-weight:700">${v > 0 ? '▲' : '▼'} ${Math.abs(v)}</span>`;
function spark(vals, bench) {
  const pts = vals.map((v, i) => v == null ? null : [i * (76 / (vals.length - 1 || 1)) + 2, 24 - Math.min(100, v) / 100 * 22]).filter(Boolean);
  if (pts.length < 2) return '<span class="muted sm">– flat</span>';
  return `<svg viewBox="0 0 80 26" width="80" height="26"><line x1="0" x2="80" y1="${24 - bench / 100 * 22}" y2="${24 - bench / 100 * 22}" stroke="#a78bfa" stroke-dasharray="3 3" stroke-width="1"/><polyline fill="none" stroke="#dc2626" stroke-width="1.6" points="${pts.map(q => q.join(',')).join(' ')}"/></svg>`;
}
function misStreaks(d) {
  return `<div class="sechead"><h3>Module-wise <b>strict streak</b> system</h3><span class="muted sm">a week counts only if work done and on-time are both on target</span></div>
  <div class="grid g4">${d.streaks.map(s => `<div class="mcard" style="--c:${s.status === 'on_track' ? '#0f9d6b' : s.status === 'none' ? '#94a3b8' : '#dc2626'}"><span>${esc(s.label)}</span>
    <div class="big">${s.active ? s.current : '—'}<small>${s.active ? 'weeks' : 'no work'}</small></div>
    ${s.active ? `<div class="muted sm">On time <b>${s.onTimePct == null ? '—' : s.onTimePct + '%'}</b> · Benchmark ${d.bench.ontime}% · Best streak ${s.best} wk</div><div class="st ${s.status === 'on_track' ? 'up' : 'down'}">Status: ${s.status === 'on_track' ? 'On track' : 'Broken'}</div>${s.broke && s.status !== 'on_track' ? `<div class="why">Broke because: <b>${s.broke.late} late + ${s.broke.notDone} not done</b> in week ${esc(s.broke.week)}</div>` : ''}` : '<div class="muted sm">Nothing was assigned in the last 10 weeks.</div>'}</div>`).join('')}</div>`;
}
const cellS = (x, b) => !x || !x.assigned ? '<span class="muted">—</span>' : `<b class="${SC(x.pctDone, b)}">${x.pctDone}%</b><div class="muted sm">${x.pctOnTime == null ? '—' : x.pctOnTime}% OT</div>`;
function misDepts(d) {
  const b = d.bench.done, M = ['process', 'tickets', 'recurring', 'delegation'];
  const rows = d.deptMatrix.map(x => `<tr class="drow" data-act="deptOpen" data-k="${x.k}" style="cursor:pointer"><td><b>${esc(x.name)}</b> ${S.user.dept_id && String(x.k) === String(S.user.dept_id) ? badge('Yours', 'blue') : ''}<div class="muted sm">${x.people.length ? 'tap to see people' : ''}</div></td><td>${x.members}</td><td>${x.assigned}</td>${M.map(m => `<td>${cellS(x.mods[m], b)}</td>`).join('')}<td><b class="${SC(x.overall, b)}">${x.overall == null ? '—' : x.overall + '%'}</b><div>${dlt(x.delta)}</div></td><td>${spark(x.trend, b)}</td></tr>`
    + x.people.map(p => `<tr class="prow hide" data-of="${x.k}"><td style="padding-left:28px">${avatar(p.name, 'sm')} <a href="#" data-act="why" data-id="${p.id}">${esc(p.name)}</a></td><td></td><td>${p.assigned}</td><td colspan="4" class="muted sm">${p.pctDone == null ? '—' : p.pctDone + '% done'} · ${p.pctOnTime == null ? '—' : p.pctOnTime + '% on time'}${p.rework ? ' · ' + p.rework + ' rework' : ''}</td><td><b class="${SC(p.overall, b)}">${p.overall == null ? '—' : p.overall + '%'}</b></td><td>${dlt(p.dOverall)}</td></tr>`).join('')).join('');
  return `<div class="sechead"><h3>Score by <b>department</b></h3><span class="muted sm">tap a row to see the people · % done with % on time (OT) underneath</span></div>
  <div class="tbl-wrap"><table class="tbl" data-name="mis-score-by-department" data-keep="1" style="min-width:760px"><thead><tr><th>Department</th><th>Members</th><th>Tasks</th><th>Process</th><th>Help ticket</th><th>Recurring</th><th>Delegation</th><th>Overall</th><th>Trend</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="muted">No data</td></tr>'}</tbody></table></div>`;
}
ACT.deptOpen = (d, el) => { $$(`tr.prow[data-of="${d.k}"]`).forEach(r => r.classList.toggle('hide')); };
function misLeaders(d, st) {
  const tab = st.lb || 'overall', L2 = d.leaders[tab], b = tab === 'ontime' ? d.bench.ontime : d.bench.done;
  const list = (rows, cls, start) => rows.length ? rows.map((p, i) => `<div class="lrow"><span class="rk">#${String(start(i)).padStart(2, '0')}</span>${avatar(p.name, 'sm')}<div class="lname"><a href="#" data-act="why" data-id="${p.id}"><b>${esc(p.name)}</b></a><div class="muted sm">${esc(p.dept)} · ${p.assigned} tasks</div></div><div class="lscore ${cls}">${p.score}<small>%</small></div><div class="ldelta">${dlt(p.delta)}</div></div>`).join('') : '<p class="muted sm">Not enough people to rank.</p>';
  return `<div class="sechead"><h3>Top &amp; bottom <b>performers</b></h3><span class="sp" style="flex:1"></span>${[['overall', 'Overall'], ['done', 'Work done'], ['ontime', 'On time']].map(([k, l]) => `<button class="pill${tab === k ? ' on' : ''}" data-act="setq" data-page="report" data-key="lb" data-val="${k}">${l}</button>`).join('')}</div>
  <div class="grid g2"><div class="card"><div class="muted sm" style="font-weight:700;letter-spacing:.06em">TOP ${L2.top.length}</div><h3 style="margin-bottom:8px">Strongest execution</h3>${list(L2.top, 'up', i => i + 1)}</div>
  <div class="card"><div class="muted sm" style="font-weight:700;letter-spacing:.06em">BOTTOM ${L2.bottom.length}</div><h3 style="margin-bottom:8px">Needs attention</h3>${list(L2.bottom, 'down', i => d.leaders[tab].top.length + (L2.bottom.length - 1 - i) + 1)}</div></div>`;
}
function misTrend(d, st) {
  const m = st.tm || 'overall', key = m === 'ontime' ? 'pctOnTime' : m === 'done' ? 'pctDone' : 'overall', bench = m === 'ontime' ? d.bench.ontime : d.bench.done;
  const W2 = 760, H2 = 260, L0 = 44, R0 = 12, T0 = 16, B0 = 44, n = d.weekly.length, bw = (W2 - L0 - R0) / n, y = v => T0 + (H2 - T0 - B0) * (1 - Math.min(100, v) / 100), x = i => L0 + bw * i + bw / 2;
  const pts = d.weekly.map((w, i) => w[key] == null ? null : [x(i), y(w[key])]).filter(Boolean);
  const bars = d.weekly.map((w, i) => { const v = w[key]; return `<g class="wkbar" data-i="${i}"><rect x="${x(i) - bw * .3}" y="${T0}" width="${bw * .6}" height="${H2 - T0 - B0}" fill="transparent"/>${v == null ? '' : `<rect x="${x(i) - bw * .3}" y="${y(v)}" width="${bw * .6}" height="${Math.max(2, H2 - B0 - y(v))}" rx="4" fill="${v >= bench ? '#bbf7d0' : '#fecaca'}" stroke="${v >= bench ? '#16a34a' : '#ef4444'}"/><text x="${x(i)}" y="${y(v) - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${v >= bench ? '#15803d' : '#b91c1c'}">${Math.round(v)}%</text>`}<text x="${x(i)}" y="${H2 - 24}" text-anchor="middle" font-size="10" fill="#6b7690">${esc(w.week.split('/')[1] ? 'W' + w.week.split('/')[1] : w.week)}</text><text x="${x(i)}" y="${H2 - 11}" text-anchor="middle" font-size="9" fill="#94a3b8">${fmtD(w.from).replace(/ \d{4}$/, '')}</text></g>`; }).join('');
  const grid = [0, 25, 50, 75, 100].map(g => `<line x1="${L0}" x2="${W2 - R0}" y1="${y(g)}" y2="${y(g)}" stroke="#e5e9f2"/><text x="${L0 - 6}" y="${y(g) + 3}" text-anchor="end" font-size="10" fill="#94a3b8">${g}%</text>`).join('');
  const last = [...d.weekly].reverse().find(w => w[key] != null), gap = last ? Math.round(last[key] - bench) : null;
  return `<div class="sechead"><h3>Company-level <b>weekly performance</b></h3><span class="sp" style="flex:1"></span>${[['overall', 'Overall execution'], ['done', 'Work done'], ['ontime', 'On time']].map(([k, l]) => `<button class="pill${m === k ? ' on' : ''}" data-act="setq" data-page="report" data-key="tm" data-val="${k}">${l}</button>`).join('')}</div>
  <div class="card chartcard"><div class="row" style="gap:16px;margin-bottom:4px"><span class="muted sm"><i class="lg" style="background:#bbf7d0;border:1px solid #16a34a"></i>On / above benchmark</span><span class="muted sm"><i class="lg" style="background:#fecaca;border:1px solid #ef4444"></i>Below benchmark</span><span class="muted sm"><i class="lg" style="background:none;border-top:2px solid #2563eb;height:0"></i>Trend</span><span class="muted sm"><i class="lg" style="background:none;border-top:2px dashed #7c3aed;height:0"></i>Benchmark ${bench}%</span></div>
    <div class="chartwrap"><svg viewBox="0 0 ${W2} ${H2}" style="width:100%;min-width:560px;height:auto">${grid}${bars}<line x1="${L0}" x2="${W2 - R0}" y1="${y(bench)}" y2="${y(bench)}" stroke="#7c3aed" stroke-dasharray="6 5" stroke-width="1.6"/><polyline fill="none" stroke="#2563eb" stroke-width="2" points="${pts.map(q => q.join(',')).join(' ')}"/>${pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="3.5" fill="#fff" stroke="#2563eb" stroke-width="2"/>`).join('')}</svg></div>
    ${last ? `<div class="insight ${gap >= 0 ? 'good' : 'bad'}"><b>Latest insight</b> · ${Math.round(last[key])}% — ${Math.abs(gap)} pts ${gap >= 0 ? 'above' : 'below'} benchmark. ${gap >= 0 ? 'Keep it up.' : 'Aim to cross the target.'}</div>` : ''}</div><div id="wktip" class="wktip hide"></div>`;
}
document.addEventListener('mouseover', e => { const g = e.target.closest && e.target.closest('.wkbar'); const tip = $('#wktip'); if (!g || !tip) { if (tip) tip.classList.add('hide'); return; } showWk(g, e.clientX, e.clientY); });
document.addEventListener('click', e => { const g = e.target.closest && e.target.closest('.wkbar'); if (g) showWk(g, e.clientX, e.clientY); });
function showWk(g, cx, cy) {
  const d = window.__rep, tip = $('#wktip'); if (!d || !tip) return; const w = d.weekly[+g.dataset.i];
  tip.innerHTML = `<b>${esc(w.week)} · ${fmtD(w.from)}</b><div class="big2">${w.overall == null ? '—' : w.overall + '%'}</div><table><tr><td>Work assigned</td><td>${w.assigned}</td></tr><tr><td>Completion rate</td><td>${w.pctDone == null ? '—' : w.pctDone + '%'}</td></tr><tr><td>On-time rate</td><td>${w.pctOnTime == null ? '—' : w.pctOnTime + '%'}</td></tr><tr><td>Work done</td><td>${w.completed}</td></tr><tr><td>Done on time</td><td>${w.onTime}</td></tr><tr><td>Work not done</td><td>${w.notDone}</td></tr><tr><td>Late completed</td><td>${w.late}</td></tr></table>`;
  tip.classList.remove('hide'); const r = tip.getBoundingClientRect(); tip.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, cx + 14)) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, cy - 20)) + 'px';
}
ACT.why = async d => {
  const st = qs('report', {}), r = await api(`/report?period=${st.period || 'month'}&from=${st.from || ''}&to=${st.to || ''}&dept=${st.dept || ''}&type=${st.type || ''}&process=${st.process || ''}&carried=${st.carried || '1'}&person=${d.id}`);
  const A = r.workDone, name = (r.byPerson[0] || {}).name || 'This person', fm = (a, b) => `${b ? Math.round(a / b * 1000) / 10 : '—'}%`;
  openModal(`<div class="row" style="margin-bottom:6px">${avatar(name)}<div><h3 style="margin:0">Why ${A.pctDone == null ? '—' : A.pctDone}% / ${A.pctOnTime == null ? '—' : A.pctOnTime}%?</h3><div class="muted sm">${esc(name)} · ${esc(r.period.label)} (${fmD(r.period.from)} – ${fmD(r.period.to)})</div></div></div>
    <div class="grid g2" style="gap:10px;margin:12px 0"><div class="mcard" style="--c:#2563eb"><span>Work done</span><div class="big">${A.pctDone == null ? '—' : A.pctDone}<small>%</small></div><div class="muted sm">${A.completed} completed of ${A.assigned} assigned</div></div><div class="mcard" style="--c:#0d9488"><span>On time</span><div class="big">${A.pctOnTime == null ? '—' : A.pctOnTime}<small>%</small></div><div class="muted sm">${A.onTime} on time of ${A.completed} completed</div></div></div>
    <div class="why-box"><b>How it is worked out</b><div>Tasks assigned: <b>${A.assigned}</b></div><div>Completed: <b>${A.completed}</b> · Not completed: <b>${A.notDone}</b> (${A.overdue} overdue now)</div><div>Completed on time: <b>${A.onTime}</b> · Completed late: <b>${A.late}</b></div><div>Work done = ${A.completed} ÷ ${A.assigned} = <b>${fm(A.completed, A.assigned)}</b> &nbsp; (benchmark ${r.bench.done}%)</div><div>On time = ${A.onTime} ÷ ${A.completed} = <b>${fm(A.onTime, A.completed)}</b> &nbsp; (benchmark ${r.bench.ontime}%)</div></div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl" style="min-width:0"><thead><tr><th>Module</th><th>Assigned</th><th>Done</th><th>% done</th><th>% on time</th></tr></thead><tbody>${r.modules.filter(m => m.assigned).map(m => `<tr><td><b>${esc(m.label)}</b></td><td>${m.assigned}</td><td>${m.completed}</td><td>${m.pctDone}%</td><td>${m.pctOnTime == null ? '—' : m.pctOnTime + '%'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No work in this period.</td></tr>'}</tbody></table></div><div class="modal-actions"><button class="btn" data-act="closeModal">Close</button></div>`, true);
};
const fmD = s => fmtD(s);
