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
const stepAct = (s, can, now) => s.status === 'pending' && s.planned_at && can(s) ? `<span class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn green xs" data-act="stepDone" data-id="${s.id}">${ic('check', 13)} Done</button>${menu([['Skip (not applicable)', 'stepDone', { id: s.id, skip: 1 }]])}</span>` : '';
async function processView(id) {
  const st = qs('proc-' + id, { view: 'table', status: '', q: '', page: 1 });
  const [p, e] = await Promise.all([api('/processes/' + id), api(`/processes/${id}/entries?status=${st.status}&q=${encodeURIComponent(st.q)}&page=${st.page}`)]);
  title(p.name); const now = Date.now(), k = p.kpi, can = s => !isPC() && (s.doer_id === S.user.id || p.can_edit);
  const head = `<div class="page-h"><div><h2>${esc(p.name)} ${badge(p.type, 'blue')}</h2><p>${esc(p.description || '')} <span class="muted sm">· ${esc(p.dept_name || '')} · PC: ${esc(p.pc_name || '—')}</span></p></div><span class="sp"></span>
    ${p.can_edit || (p.steps[0] && p.steps[0].doer_id === S.user.id) ? `<button class="btn green" data-act="entryNew" data-id="${id}">${ic('plus', 16)} New entry</button><a class="btn" href="#/import?type=fms_entries&process=${id}">${ic('upload', 16)} Bulk create from file</a><a class="btn" href="#/import?type=fms_done&process=${id}">${ic('check', 16)} Bulk done from file</a>` : ''}${p.can_edit ? `<a class="btn" href="#/fms/edit/${id}">${ic('edit', 16)} Edit process</a>` : ''}</div>
  <div class="grid g4" style="margin-bottom:14px">${[['Entries', k.total, '#2563eb'], ['Running', k.running, '#f59e0b'], ['Completed', k.completed, '#10b981'], ['Overdue steps', k.overdue, '#ef4444'], ['On-time rate', k.onTimePct == null ? '—' : k.onTimePct + '%', '#6366f1']].map(x => `<div class="card kpi" style="--c:${x[2]}"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('')}</div>
  <div class="filters"><div class="seg"><button class="${st.view === 'table' ? 'on' : ''}" data-act="setq" data-page="proc-${id}" data-key="view" data-val="table">Table view</button><button class="${st.view === 'cards' ? 'on' : ''}" data-act="setq" data-page="proc-${id}" data-key="view" data-val="cards">Sheet view</button></div>
    <select data-change="setq" data-page="proc-${id}" data-key="status">${optHtml([{ v: 'running', l: 'Running' }, { v: 'completed', l: 'Completed' }], st.status, 'All entries')}</select>${searchBox('proc-' + id, st.q, 'Search entry, customer…')}</div>`;
  if (!e.entries.length) return head + `<div class="card empty">${ic('flow', 34)}<h3>No entries yet</h3><p>Add an entry, or bring many in from Excel with “Bulk create from file”.</p></div>`;
  const foot = pager('proc-' + id, 'page', st.page, e.total, 50);
  if (st.view === 'cards') {
    return head + e.entries.map(en => { const done = en.steps.filter(s => s.status !== 'pending').length, cur = en.steps.find(s => s.status === 'pending'), late = cur && cur.planned_at && cur.planned_at < now;
      return `<details class="entry"><summary><div><b class="id">${esc(en.uid)}</b> &nbsp;<b>${esc(en.title)}</b> <span class="badge">Step 0 · Inquiry received</span><div class="row" style="margin-top:8px"><div class="progress"><i style="width:${Math.round(done / en.steps.length * 100)}%"></i></div><span class="muted sm">${done} / ${en.steps.length} steps · ${Math.round(done / en.steps.length * 100)}%</span></div></div>
        <div>${cur ? `<span class="step-chip ${late ? 'late' : 'cur'}">Step ${cur.step_no} · ${esc(cur.name)}${late ? ' · late' : ''}</span>` : badge('Completed', 'green')}</div></summary>
        <div class="fields">${p.fields.map(f => `<div><small>${esc(f.label)}</small>${esc(en.data[f.key] ?? '—')}</div>`).join('')}<div><small>Started</small>${fmtMs(en.started_at)}</div></div>
        <div class="steps">${en.steps.map(s => `<div class="st"><span class="step-n" style="${s.status === 'done' ? 'background:var(--green)' : s.status === 'pending' ? '' : 'background:#94a3b8'}">${s.step_no}</span><b>${esc(s.name)}</b><span>${esc(s.doer_name || '—')}</span><span class="muted sm">Planned<br>${fmtMs(s.planned_at)}</span><span class="muted sm">Actual<br>${fmtMs(s.actual_at)}</span><span>${stBadge(s.status)} ${stepDelay(s, now)} ${stepAct(s, can, now)}</span></div>`).join('')}</div></details>`; }).join('') + `<div class="card flush">${foot || ''}</div>`;
  }
  const fields = p.fields.slice(0, 3), n = p.steps.length;
  const h1 = `<tr><th rowspan="2">#</th><th rowspan="2">Entry UID</th><th rowspan="2">Title</th>${fields.map(f => `<th rowspan="2">${esc(f.label)}</th>`).join('')}${p.steps.map(s => `<th class="grp" colspan="4">Step ${s.step_no} · ${esc(s.name)}</th>`).join('')}<th rowspan="2">Overall</th></tr>`;
  const h2 = `<tr>${p.steps.map(() => '<th>Doer</th><th>Planned</th><th>Actual</th><th>Status</th>').join('')}</tr>`;
  const rows = e.entries.map((en, i) => `<tr><td>${(st.page - 1) * 50 + i + 1}</td><td class="id">${esc(en.uid)}</td><td><b>${esc(en.title)}</b></td>${fields.map(f => `<td>${esc(en.data[f.key] ?? '—')}</td>`).join('')}${p.steps.map(ps => { const s = en.steps.find(x => x.step_no === ps.step_no); if (!s) return '<td colspan="4"></td>';
      return `<td>${esc(s.doer_name || '—')}</td><td class="nowrap">${fmtMs(s.planned_at)}</td><td class="nowrap">${fmtMs(s.actual_at)}</td><td class="nowrap">${stBadge(s.status)} ${stepDelay(s, now)} ${stepAct(s, can, now)}</td>`; }).join('')}<td>${stBadge(en.status)}</td></tr>`).join('');
  return head + `<div class="tbl-wrap"><table class="tbl fms"><thead>${h1}${h2}</thead><tbody>${rows}</tbody></table>${foot}</div>`;
}
ACT.stepDone = async d => {
  const r = await ask({ title: d.skip ? 'Skip this step' : 'Complete this step', fields: [{ name: 'remarks', label: 'Remarks (optional)', type: 'textarea' }], ok: d.skip ? 'Skip step' : 'Mark done' }); if (!r) return;
  await api(`/fms/steps/${d.id}/complete`, { method: 'POST', body: { remarks: r.remarks, status: d.skip ? 'skipped' : 'done' } }); toast('Step updated', 'ok'); refreshBadges(); route();
};
ACT.entryNew = async d => {
  const p = await api('/processes/' + d.id);
  const r = await ask({ title: 'New entry – ' + p.name, text: 'Step 0 · Inquiry received', fields: [{ name: 'title', label: 'Entry title / Customer name', required: true }, ...p.fields.map(f => ({ name: f.key, label: f.label, type: f.type === 'select' ? 'select' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text', options: (f.options || []).map(o => ({ v: o, l: o })), blank: 'Select' }))], ok: 'Create entry' }); if (!r) return;
  const { title: t, ...data } = r; const x = await api(`/processes/${d.id}/entries`, { method: 'POST', body: { title: t, data } }); toast('Created ' + x.uid, 'ok'); route();
};
async function fmsTasks(scope) {
  title(scope === 'my' ? 'My Process Task' : 'Team Process Task');
  const key = 'fms-' + scope, st = qs(key, { range: 'today', q: '' });
  const d = await api(`/fms/my-tasks?scope=${scope}&range=${st.range}&q=${encodeURIComponent(st.q)}`), c = d.counts, now = Date.now();
  const rows = d.rows.map((r, i) => `<tr class="${r.planned_at < now ? 'over' : ''}"><td>${i + 1}</td><td><a href="#/fms/${r.process_id}">${esc(r.process_name)}</a></td><td class="id">${esc(r.uid)}</td><td>${esc(r.title)}</td><td><a href="#/fms/${r.process_id}">Step ${r.step_no} / ${esc(r.step_name)}</a></td><td>${esc(r.doer_name || '—')}</td><td class="nowrap">${fmtMs(r.planned_at)}</td>
    <td>${r.planned_at < now ? badge(dur(now - r.planned_at) + ' late', 'red') : '<span class="muted">On time</span>'}</td><td>${badge(r.planned_at < now ? 'Overdue' : 'Running', r.planned_at < now ? 'red' : 'amber')}</td><td class="noexp">${isPC() ? '' : `<button class="btn green xs" data-act="stepDone" data-id="${r.id}">${ic('check', 13)} Done</button>`}</td></tr>`);
  return `<div class="page-h"><div><h2>${scope === 'my' ? 'My Process Task' : 'Team Process Task'}</h2><p>The step each entry is currently waiting on.</p></div><span class="sp"></span>${exportBtn('process-tasks')}</div>
  ${pills(key, 'range', [['today', 'Today', c.today], ['overdue', 'Overdue', c.overdue], ['week', 'This Week', c.week], ['nextweek', 'Next Week', c.nextweek], ['lastweek', 'Last Week', c.lastweek], ['all', 'All']], st.range)}<div class="filters">${searchBox(key, st.q, 'Search process, entry, step…')}</div>
  ${table('process-tasks', ['#', 'Process', 'Entry UID', 'Entry title', 'Current step', 'Doer', 'Planned', 'Delay', 'Status', '!Action'], rows, { emptyTitle: 'No process tasks', empty: 'Nothing waiting in this tab.' })}`;
}
/* process builder */
const fieldRow = (f = {}) => `<div class="frow fld"><input class="f-label" placeholder="Field name (e.g. Customer email)" value="${esc(f.label || '')}"><select class="f-type">${optHtml([{ v: 'text', l: 'Text' }, { v: 'number', l: 'Number' }, { v: 'date', l: 'Date' }, { v: 'select', l: 'Dropdown' }], f.type || 'text')}</select><input class="f-opts" placeholder="Dropdown options, comma separated" value="${esc((f.options || []).join(', '))}"><button type="button" class="btn xs danger" data-act="rowDel">${ic('x', 14)}</button></div>`;
const stepRow = (s = {}) => `<div class="frow srow"><span class="step-n"></span><input class="s-name" placeholder="Step name (e.g. Meeting)" value="${esc(s.name || '')}" required><select class="s-doer">${userOpts(s.doer_id || '', 'Doer…')}</select><input class="s-tat" type="number" min="1" value="${s.tat || 1}" title="Time allowed"><select class="s-unit">${optHtml([{ v: 'minutes', l: 'minutes' }, { v: 'hours', l: 'hours' }, { v: 'days', l: 'days' }], s.unit || 'days')}</select><span class="row" style="flex-wrap:nowrap;gap:3px"><button type="button" class="btn xs" data-act="rowUp">↑</button><button type="button" class="btn xs" data-act="rowDown">↓</button><button type="button" class="btn xs danger" data-act="rowDel">${ic('x', 14)}</button></span></div>`;
const renumber = () => $$('#steps .srow').forEach((r, i) => r.querySelector('.step-n').textContent = i + 1);
async function processForm(id) {
  const p = id ? await api('/processes/' + id) : null, locked = p && p.entry_count > 0;
  title(p ? 'Edit Process' : 'Create Process');
  const eds = S.editable.fms === 'all' ? null : S.editable.fms;
  setTimeout(renumber, 0);
  return `<div class="page-h"><div><h2>${p ? 'Edit process' : 'Create process'}</h2><p>Define the entry form (step 0) and the steps each entry moves through.</p></div></div>
  <form class="card" data-form="process" style="max-width:980px"><input type="hidden" name="id" value="${p ? p.id : ''}"><div class="form">
    <label class="f"><span class="req">Process name</span><input name="name" required value="${esc(p ? p.name : '')}" placeholder="e.g. Order to Delivery"></label>
    <label class="f"><span>Entry ID prefix <small>(max 5 letters)</small></span><input name="prefix" maxlength="5" value="${esc(p ? p.prefix : '')}" placeholder="OTD" ${p ? 'disabled' : ''}></label>
    <label class="f"><span>Process type</span><select name="type">${optHtml(FTYPES.map(x => ({ v: x, l: x })), p ? p.type : 'Straight')}</select></label>
    <label class="f"><span class="req">Department</span><select name="dept_id" required ${p ? 'disabled' : ''}>${deptOpts(p ? p.dept_id : '', 'Select department', eds)}</select></label>
    <label class="f"><span>Process coordinator (PC)</span><select name="pc_id">${userOpts(p ? p.pc_id : S.user.id, 'Me')}</select></label>
    <label class="f" style="grid-column:1/-1"><span>Description</span><textarea name="description" style="min-height:60px">${esc(p ? p.description || '' : '')}</textarea></label></div>
    ${locked ? `<div class="notice" style="margin-top:16px">This process already has ${p.entry_count} entries, so its form fields and steps are locked. You can still rename it or change the coordinator.</div>
      <h3 style="margin:18px 0 8px">Steps</h3>${p.steps.map(s => `<div class="row" style="padding:4px 0"><span class="step-n">${s.step_no}</span><b>${esc(s.name)}</b><span class="muted">${esc(s.doer_name || '—')} · ${s.tat} ${s.unit}</span></div>`).join('')}`
    : `<h3 style="margin:22px 0 4px">Step 0 · Entry form fields</h3><p class="muted sm" style="margin:0 0 10px">What you capture when a new entry starts (customer, product, price…).</p><div id="fields">${(p ? p.fields : [{ label: 'Customer email' }, { label: 'Product name' }]).map(fieldRow).join('')}</div><button type="button" class="btn xs" data-act="addField">${ic('plus', 14)} Add field</button>
      <h3 style="margin:22px 0 4px">Steps</h3><p class="muted sm" style="margin:0 0 10px">Each step gets a doer and a time allowed (TAT). The planned time of a step starts when the previous step is completed.</p><div id="steps">${(p ? p.steps : [{}, {}]).map(stepRow).join('')}</div><button type="button" class="btn xs" data-act="addStep">${ic('plus', 14)} Add step</button>`}
    <div class="modal-actions"><a class="btn" href="#/fms${p ? '/' + p.id : ''}">Cancel</a><button class="btn primary">${p ? 'Save changes' : 'Create process'}</button></div></form>`;
}
ACT.addField = () => $('#fields').insertAdjacentHTML('beforeend', fieldRow());
ACT.addStep = () => { $('#steps').insertAdjacentHTML('beforeend', stepRow()); renumber(); };
ACT.rowDel = (d, el) => { el.closest('.frow').remove(); renumber(); };
ACT.rowUp = (d, el) => { const r = el.closest('.frow'); if (r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling); renumber(); };
ACT.rowDown = (d, el) => { const r = el.closest('.frow'); if (r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r); renumber(); };
FORM.process = async (o, fm) => {
  const body = { name: o.name, prefix: o.prefix, type: o.type, dept_id: o.dept_id, pc_id: o.pc_id, description: o.description };
  if ($('#steps')) {
    body.fields = $$('#fields .fld').map(r => ({ label: $('.f-label', r).value, type: $('.f-type', r).value, options: $('.f-opts', r).value }));
    body.steps = $$('#steps .srow').map(r => ({ name: $('.s-name', r).value, doer_id: $('.s-doer', r).value, tat: $('.s-tat', r).value, unit: $('.s-unit', r).value }));
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
  return `<div class="page-h"><div><h2>Import Center</h2><p>Bring in the data you already keep in Google Sheets or Excel. Upload a file, match the columns, done.</p></div></div>
  <div class="notice blue" style="margin-bottom:16px"><b>Coming from Google Sheets?</b> Open the sheet → File → Download → Microsoft Excel (.xlsx), then upload it here. Your own column names are fine — you will match them in the next step.</div>
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
  return `<div class="page-h"><div><h2>Holiday Calendar</h2><p>Daily recurring tasks are not generated on these dates (or on Sundays).</p></div></div>
  ${isAdmin() ? `<form class="filters" data-form="holiday"><input type="date" name="date" required><input name="name" placeholder="Holiday name (e.g. Diwali)" required style="min-width:240px"><button class="btn primary">${ic('plus', 16)} Add holiday</button></form>` : ''}
  ${list.length ? Object.keys(by).sort().map(m => { const [y, mo] = m.split('-'); return `<div class="card" style="margin-bottom:12px"><h3 style="margin-bottom:8px">${MON[+mo - 1]} ${y}</h3>${by[m].map(h => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><span class="badge blue" style="min-width:92px;justify-content:center">${fmtD(h.date)}</span><b style="flex:1">${esc(h.name)}</b>${isAdmin() ? `<button class="btn xs danger" data-act="holDel" data-date="${h.date}">${ic('trash', 14)}</button>` : ''}</div>`).join('')}</div>`; }).join('') : `<div class="card empty">${ic('cal', 34)}<h3>No holidays added</h3><p>${isAdmin() ? 'Add your company holidays above.' : 'Your admin has not added any holidays yet.'}</p></div>`}`;
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
PAGES.admin = async parts => parts[1] === 'departments' ? deptsPage() : parts[1] === 'access' ? accessPage() : parts[1] === 'user' ? userEditor(parts[2]) : parts[1] === 'log' ? logPage() : usersPage();
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
  if (!$('#uf-name').disabled) body.profile = { name: $('#uf-name').value, emp_code: $('#uf-code').value, expires_at: toIso($('#uf-exp').value) || null, must_change_pw: $('#uf-mcp').checked, ...($('#uf-pw').value ? { password: $('#uf-pw').value } : {}),
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
