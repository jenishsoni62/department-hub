'use strict';
// Loads / removes a clearly-labelled DEMO for the Marketing department: recurring checklist tasks, a delegation board and an FMS process,
// for the 11 Marketing people already in the system. Everything is tagged "DEMO" so it can be removed in one click. All dates are relative to today.
const C = require('./core'), L = require('./lib'), { db } = C;
const TAG = 'Marketing DEMO', BOARD = 'Marketing Delegation (DEMO)', PROC = 'Marketing - New Job Request (DEMO)';
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const PEOPLE = [ // email, on-time chance, late chance (demo only)
  ['yashvi@eurobondacp.com', .95, .04], ['marketing@eurobondacp.com', .92, .05], ['marketing1@eurobondacp.com', .85, .10], ['seo@eurobondacp.com', .90, .07],
  ['marketing3@eurobondacp.com', .78, .14], ['graphics@eurobondacp.com', .88, .08], ['events@eurobondacp.com', .70, .18], ['graphics1@eurobondacp.com', .83, .10],
  ['sem@eurobondacp.com', .93, .05], ['edits@eurobondacp.com', .75, .15], ['marketingintern@eurobondacp.com', .60, .22]];
const REC = [['Review team daily work plan', 'Check brand mentions & respond', 'Check branding material stock at depots', 'Check website keyword rankings', 'Update dealer lead sheet', 'Clear design request queue', 'Event logistics checklist', 'Update print artwork tracker', 'Check ad spend & CPC', 'Update video edit queue', 'Competitor ads & price watch'],
  ['Weekly marketing review meeting', 'Weekly newsletter draft', 'Event vendor follow-up', 'Publish 2 SEO blogs', 'Send catalogue to new dealers', 'Weekly social media creatives', 'Venue & vendor confirmation', 'Weekly catalogue / brochure revision', 'Weekly campaign report', 'Publish 1 reel / video', 'Social media calendar check'],
  ['Monthly marketing budget review', 'Monthly PR / press coverage report', 'Monthly dealer-board branding audit', 'Monthly SEO performance report', 'Monthly dealer enquiry analysis', 'Monthly template library update', 'Monthly event expense reconciliation', 'Monthly brand asset folder clean-up', 'Monthly Google Ads budget reset', 'Monthly video archive backup', 'Monthly market research summary']];
const DEL = [['Approve Diwali campaign plan', 'Finalise annual marketing calendar 2027', 'Sign off Q3 agency invoices', 'Approve trade-fair participation list', 'Review dealer-meet budget', 'Brand guideline refresh approval'],
  ['Write press release - new fire-rated ACP', 'Draft Diwali greeting mailer', 'Update company profile deck', 'Coordinate magazine ad copy', 'Collect dealer testimonials', 'Prepare Q3 PR coverage summary'],
  ['Book stall for Nov building-materials expo', 'Dealer-board refresh - Surat', 'Finalise gift hamper vendor', 'Plan Nagpur dealer meet venue', 'Signage proofs - Pune depot', 'Collect expo visitor-pass quotes'],
  ['Fix website meta titles (top 20 pages)', 'Publish product-page FAQ schema', 'Backlink outreach - 10 sites', 'Google Business profile update - depots', 'Keyword plan for ACP cladding', 'Core Web Vitals report'],
  ['Send catalogue pack to new dealers', 'Update dealer database', 'Collect Diwali scheme acknowledgments', 'Dealer feedback call list', 'Sample kit dispatch tracker', 'Enquiry follow-up report'],
  ['Diwali social media creatives', 'Depot signage artwork - Pune', 'Standee design - expo', 'WhatsApp broadcast banner', 'Newsletter header redesign', 'Instagram carousel - ACP colours'],
  ['Nagpur dealer-meet logistics', 'Expo stall furniture booking', 'Gift hamper packing schedule', 'Event photographer booking', 'Guest list confirmation', 'Event expense statement'],
  ['Product catalogue 2026 reprint files', 'Brochure - sample kit', 'Corporate calendar 2027 design', 'Trade magazine ad layout', 'Dealer certificate template', 'Price-list layout update'],
  ['Festive Google Ads campaign setup', 'Meta ads lead-form test', 'Weekly CPC optimisation report', 'Remarketing audience build', 'Landing page A/B test', 'Monthly ad-spend reconciliation'],
  ['ACP installation reel - edit', 'Factory tour video - final cut', 'Customer testimonial video', 'Diwali greeting animation', 'YouTube thumbnails - 5 videos', 'Expo teaser video'],
  ['Competitor price comparison sheet', 'Market research - ACP demand 5 cities', 'Social media calendar entry - Nov', 'Collect dealer contact updates', 'Photo archive tagging', 'Weekly analytics snapshot']];
const STEPS = [['Brief Approval', 0, 1], ['Copy & Content', 1, 2], ['SEO / Keyword Check', 3, 1], ['Design Draft', 5, 3], ['Print-ready Artwork', 7, 1], ['Internal Review', 2, 1], ['Final Approval', 0, 1], ['Publish / Release', 4, 2], ['Result Check', 8, 5]];
const JOBS = ['Diwali Dealer Gift Hamper Branding', 'Product Catalogue 2026 Reprint', 'Depot Signage - Pune', 'Instagram Reel - ACP Installation', 'Dealer Meet Invite Creative - Nagpur', 'Festive Google Ads Campaign', 'Website Banner - Fire-Retardant ACP', 'Expo Standee Set', 'WhatsApp Broadcast - Price Update', 'Trade Magazine Ad - Nov Issue', 'Corporate Calendar 2027', 'Monthly Newsletter', 'Sample Kit Brochure', 'Dealer Board Refresh - Surat'];

function exists() { return !!db.prepare('SELECT 1 FROM boards WHERE name=?').get(BOARD) || !!db.prepare('SELECT 1 FROM rec_tasks WHERE category=?').get(TAG) || !!db.prepare('SELECT 1 FROM processes WHERE name=?').get(PROC); }
function load(adminId) {
  if (exists()) C.fail(400, 'The Marketing demo is already loaded. Remove it first to load it again.');
  const dept = db.prepare("SELECT id FROM departments WHERE name='Marketing'").get(); if (!dept) C.fail(400, 'There is no "Marketing" department yet.');
  const U = PEOPLE.map(p => db.prepare('SELECT id,name FROM users WHERE lower(email)=? AND active=1').get(p[0])); const missing = PEOPLE.filter((p, i) => !U[i]).map(p => p[0]);
  if (missing.length) C.fail(400, 'These Marketing people are not in the system yet: ' + missing.join(', '));
  const R = rng(20261017), today = L.todayStr(), mon = L.addDays(today, -((new Date(today + 'T00:00:00').getDay() + 6) % 7)), start = L.addDays(mon, -28);
  const dayOff = ds => new Date(ds + 'T00:00:00').getDay() === 0, ts = (ds, h, m) => `${ds} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const nextWork = (ds, n) => { let d = ds; while (n > 0) { d = L.addDays(d, 1); if (!dayOff(d)) n--; } return d; };
  for (const [d, n] of [['2026-10-02', 'Gandhi Jayanti'], ['2026-10-20', 'Dussehra']]) db.prepare('INSERT OR IGNORE INTO holidays(date,name,kind) VALUES(?,?,?)').run(d, n, 'GH');
  try {
    // ---- recurring checklist: 3 tasks (Daily / Weekly / Monthly) per person
    const ids = [];
    U.forEach((u, i) => [['Daily', start], ['Weekly', L.addDays(start, i % 6)], ['Monthly', L.addDays(start, 3 + (i % 3))]].forEach(([f, s], k) => {
      while (f === 'Daily' && dayOff(s)) s = L.addDays(s, 1);
      ids.push(db.prepare('INSERT INTO rec_tasks(dept_id,doer_id,category,frequency,start_date,description,priority,created_by,gen_from) VALUES(?,?,?,?,?,?,?,?,?)').run(dept.id, u.id, TAG, f, s, REC[k][i], 'Medium', adminId, s).lastInsertRowid);
    }));
    C.genInstances();
    const ph = ids.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT i.id,i.due_date,t.doer_id FROM rec_instances i JOIN rec_tasks t ON t.id=i.task_id WHERE t.id IN (${ph}) AND i.due_date<=?`).all(...ids, today)) {
      const p = PEOPLE[U.findIndex(u => u.id === r.doer_id)], x = R(); let at = null;
      if (x < p[1]) at = ts(r.due_date, 9 + Math.floor(R() * 9), Math.floor(R() * 60));
      else if (x < p[1] + p[2]) { const q = nextWork(r.due_date, 1 + Math.floor(R() * 3)); if (q <= today) at = ts(q, 9 + Math.floor(R() * 9), Math.floor(R() * 60)); }
      if (at) db.prepare("UPDATE rec_instances SET status='done', done_at=? WHERE id=?").run(at, r.id);
    }
    // ---- delegation: 6 tasks per person; a date moved once = 1 rework (Yellow), twice = 2 reworks (Red)
    const bid = db.prepare("INSERT INTO boards(name,color,icon,dept_id,sharing,owner_id) VALUES(?,?,?,?,?,?)").run(BOARD, '#7c3aed', '📣', dept.id, 'specific', U[0].id).lastInsertRowid;
    U.forEach((u, i) => DEL[i].forEach(title => {
      const p = PEOPLE[i], first = L.addDays(start, Math.floor(R() * 32)); let f = first; while (dayOff(f)) f = L.addDays(f, 1);
      const x = R(), rev = x < p[1] - .2 ? 0 : x < p[1] - .2 + p[2] + .08 ? 1 : 2; let due = f; for (let k = 0; k < rev; k++) due = nextWork(due, 2 + Math.floor(R() * 4));
      const done = due <= today && R() < .88, closed = done ? ts(R() < .85 ? due : nextWork(due, 1), 10 + Math.floor(R() * 8), 0) : null;
      db.prepare("INSERT INTO del_tasks(board_id,title,assigned_to,created_by,due_date,priority,status,rework,closed_at) VALUES(?,?,?,?,?,?,?,?,?)").run(bid, title, u.id, U[0].id, due, 'Medium', done ? 'done' : 'not_started', rev, closed);
    }));
    // ---- FMS: 9 steps, "By 18:00 (+N working days)"
    const pid = db.prepare("INSERT INTO processes(name,prefix,description,type,dept_id,pc_id,fields) VALUES(?,?,?,?,?,?,?)").run(PROC, 'MKT', 'Request to published creative', 'Straight', dept.id, U[0].id, JSON.stringify([{ key: 'f1', label: 'Requested by', type: 'text' }, { key: 'f2', label: 'Quantity', type: 'number' }])).lastInsertRowid;
    STEPS.forEach((s, i) => db.prepare('INSERT INTO process_steps(process_id,step_no,name,doer_id,tat,unit,checklist,due_time) VALUES(?,?,?,?,?,?,?,?)').run(pid, i + 1, s[0], U[s[1]].id, s[2], 'workdays', '[]', '18:00'));
    const proc = db.prepare('SELECT * FROM processes WHERE id=?').get(pid), steps = C.stepRows(pid), nowMs = Date.now();
    JOBS.forEach((job, j) => {
      let created = new Date(L.addDays(start, Math.floor(j * 2.2)) + 'T00:00:00'); created.setHours(10 + Math.floor(R() * 7), Math.floor(R() * 60)); while (created.getDay() === 0) created.setDate(created.getDate() + 1);
      const e = C.createEntry(proc, steps, { title: job, data: { f1: ['Head Office', 'Sales - West', 'Depot - Pune'][j % 3], f2: [10, 50, 100, 500][j % 4] }, started_at: created.getTime() }, U[0].id), stopAt = R() < .3 ? 3 + Math.floor(R() * 5) : 99;
      for (let k = 0; k < steps.length && k < stopAt; k++) {
        const es = db.prepare('SELECT * FROM entry_steps WHERE entry_id=? AND step_no=?').get(e.id, k + 1), p = PEOPLE[STEPS[k][1]], x = R(), prevAt = k ? db.prepare('SELECT actual_at FROM entry_steps WHERE entry_id=? AND step_no=?').get(e.id, k).actual_at : created.getTime();
        let at = x < p[1] ? Math.max(prevAt + 20 * 6e4, es.planned_at - Math.floor(R() * 20) * 36e5) : es.planned_at + (1 + Math.floor(R() * 40)) * 36e5;
        if (at > nowMs) break; C.completeStep(es, at, null);
      }
    });
  } catch (e) { try { remove(); } catch {} throw e; }
  return { ok: true };
}
function remove() {
  db.exec('BEGIN');
  try {
    const rt = db.prepare('SELECT id FROM rec_tasks WHERE category=?').all(TAG).map(x => x.id);
    for (const id of rt) { db.prepare('DELETE FROM rec_instances WHERE task_id=?').run(id); db.prepare('DELETE FROM rec_tasks WHERE id=?').run(id); }
    for (const b of db.prepare('SELECT id FROM boards WHERE name=?').all(BOARD)) { db.prepare('DELETE FROM del_tasks WHERE board_id=?').run(b.id); db.prepare('DELETE FROM board_members WHERE board_id=?').run(b.id); db.prepare('DELETE FROM boards WHERE id=?').run(b.id); }
    for (const p of db.prepare('SELECT id FROM processes WHERE name=?').all(PROC)) {
      for (const e of db.prepare('SELECT id FROM entries WHERE process_id=?').all(p.id)) { db.prepare('DELETE FROM entry_steps WHERE entry_id=?').run(e.id); db.prepare('DELETE FROM entries WHERE id=?').run(e.id); }
      db.prepare('DELETE FROM process_steps WHERE process_id=?').run(p.id); db.prepare('DELETE FROM processes WHERE id=?').run(p.id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true };
}
module.exports = { load, remove, exists };
