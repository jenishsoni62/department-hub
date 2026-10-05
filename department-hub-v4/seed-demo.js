'use strict';
// Optional: fills the app with sample departments, people, tasks and a process so you can explore it.
// Run once with:  npm run demo      (all demo users sign in with password: demo123)
const bcrypt = require('bcryptjs');
const C = require('./core'), L = require('./lib');
const { db } = C;
if (db.prepare('SELECT COUNT(*) n FROM departments').get().n > 1) { console.log('Data already exists – demo data not added.'); process.exit(0); }

const hash = bcrypt.hashSync('demo123', 10);
const dept = n => db.prepare('INSERT INTO departments(name) VALUES(?)').run(n).lastInsertRowid;
const D = { hr: dept('HR'), sales: dept('Sales'), acc: dept('Accounts'), ops: dept('Operations') };
const user = (name, code, role, d) => db.prepare('INSERT INTO users(emp_code,name,email,password_hash,role,dept_id) VALUES(?,?,?,?,?,?)').run(code, name, code.toLowerCase() + '@demo.com', hash, role, d).lastInsertRowid;
const U = {
  hrHod: user('Hema Rao', 'HR01', 'hod', D.hr), hr1: user('Tara Singh', 'HR02', 'member', D.hr),
  slHod: user('Sam Mehta', 'SL01', 'hod', D.sales), sl1: user('Neha Joshi', 'SL02', 'member', D.sales),
  acHod: user('Arun Kumar', 'AC01', 'hod', D.acc), ac1: user('Divya Menon', 'AC02', 'member', D.acc),
  opHod: user('Vikram Das', 'OP01', 'hod', D.ops), op1: user('Ravi Patil', 'OP02', 'member', D.ops),
  pc: user('Priya Nair', 'PC01', 'pc', null),
};
for (const [d, h] of [[D.hr, U.hrHod], [D.sales, U.slHod], [D.acc, U.acHod], [D.ops, U.opHod]]) db.prepare('UPDATE departments SET hod_id=? WHERE id=?').run(h, d);
// HODs give their team access
const grant = (u, d, m, l) => db.prepare('INSERT OR REPLACE INTO access(user_id,dept_id,module,level) VALUES(?,?,?,?)').run(u, d, m, l);
grant(U.hr1, D.hr, '*', 'viewer'); grant(U.hr1, D.hr, 'recurring', 'editor');
grant(U.sl1, D.sales, '*', 'editor'); grant(U.ac1, D.acc, 'recurring', 'viewer');
for (const [d, n] of [['2026-10-02', 'Gandhi Jayanti'], ['2026-10-20', 'Dussehra'], ['2026-11-08', 'Diwali'], ['2026-12-25', 'Christmas']]) db.prepare('INSERT OR IGNORE INTO holidays VALUES(?,?)').run(d, n);

// recurring checklist tasks (started a few days ago so you can see Today / Overdue tabs)
const rec = (d, doer, cat, freq, back, text, prio = 'Medium') => { const s = L.addDays(L.todayStr(), -back);
  db.prepare('INSERT INTO rec_tasks(dept_id,doer_id,category,frequency,start_date,description,priority,created_by,gen_from) VALUES(?,?,?,?,?,?,?,?,?)').run(d, doer, cat, freq, s, text, prio, 1, s); };
rec(D.acc, U.ac1, 'Accounting', 'Daily', 6, 'Daily cash & expense entry', 'High'); rec(D.acc, U.ac1, 'Accounting', 'Weekly', 14, 'Bank reconciliation');
rec(D.ops, U.op1, 'Production', 'Daily', 5, 'Daily production output entry'); rec(D.ops, U.op1, 'Inventory', 'Daily', 5, 'Inventory movement update');
rec(D.hr, U.hr1, 'General', 'Daily', 4, 'Check attendance register'); rec(D.hr, U.hr1, 'Compliance', 'Monthly', 40, 'Upload PF / ESI challan', 'High');
rec(D.sales, U.sl1, 'General', 'Weekly', 10, 'Update CRM pipeline stages');
C.genInstances();
// mark some earlier ones as done so the history looks real
db.prepare("UPDATE rec_instances SET status='done', done_at=due_date||' 10:00:00' WHERE id%3=0 AND due_date<?").run(L.todayStr());

// help tickets
const tk = (d, by, doer, type, due, text, st = 'open', rev = null) => db.prepare('INSERT INTO tickets(dept_id,created_by,doer_id,issue_type,reviewer_id,due_date,description,priority,status) VALUES(?,?,?,?,?,?,?,?,?)').run(d, by, doer, type, rev, due, text, 'Medium', st);
const t = n => L.addDays(L.todayStr(), n);
tk(D.ops, U.sl1, U.op1, 'Maintenance', t(-3), 'AC in showroom not cooling'); tk(D.ops, U.hr1, U.op1, 'Maintenance', t(2), 'Replace tube lights near reception', 'in_progress');
tk(D.acc, U.sl1, U.ac1, 'Other', t(-1), 'Need invoice copy for order OTD-000003', 'review', U.sl1); tk(D.hr, U.op1, null, 'HR Query', t(4), 'Salary slip for September');
tk(D.acc, U.hr1, U.ac1, 'Other', t(-9), 'Reimbursement query', 'done');

// delegation board
const bid = db.prepare("INSERT INTO boards(name,color,icon,dept_id,sharing,owner_id) VALUES('Production work','#d97706','🏗️',?, 'specific',?)").run(D.ops, U.opHod).lastInsertRowid;
for (const u of [U.opHod, U.op1, U.slHod, U.sl1]) db.prepare('INSERT OR IGNORE INTO board_members VALUES(?,?,?)').run(bid, u, 'editor');
const dt = (title, to, due, st = 'not_started', pr = 'Medium') => db.prepare('INSERT INTO del_tasks(board_id,title,assigned_to,created_by,due_date,priority,status) VALUES(?,?,?,?,?,?,?)').run(bid, title, to, U.opHod, due, pr, st);
dt('Prepare weekly output report', U.op1, t(-2), 'in_progress', 'High'); dt('Audit raw-material stock', U.op1, t(3)); dt('Plan next month shift roster', U.op1, t(7)); dt('Vendor price comparison', U.sl1, t(5), 'not_started');

// FMS process: Order to Delivery
const pid = db.prepare("INSERT INTO processes(name,prefix,description,type,dept_id,pc_id,fields) VALUES('Order to Delivery FMS','OTD','From customer enquiry to dispatch','Straight',?,?,?)")
  .run(D.sales, U.slHod, JSON.stringify([{ key: 'f1', label: 'Customer email', type: 'text' }, { key: 'f2', label: 'City', type: 'text' }, { key: 'f3', label: 'Product', type: 'text' }, { key: 'f4', label: 'Price', type: 'number' }, { key: 'f5', label: 'Order quantity', type: 'number' }])).lastInsertRowid;
[['Meeting', U.sl1, 30, 'minutes'], ['Proposal', U.slHod, 1, 'days'], ['Order confirmation', U.sl1, 4, 'hours'], ['Dispatch', U.op1, 2, 'days']].forEach((s, i) => db.prepare('INSERT INTO process_steps(process_id,step_no,name,doer_id,tat,unit) VALUES(?,?,?,?,?,?)').run(pid, i + 1, s[0], s[1], s[2], s[3]));
const proc = db.prepare('SELECT * FROM processes WHERE id=?').get(pid), steps = C.stepRows(pid), H = 36e5;
const mk = (name, mail, city, prod, price, qty, hoursAgo, doneSteps) => {
  const e = C.createEntry(proc, steps, { title: name, data: { f1: mail, f2: city, f3: prod, f4: price, f5: qty }, started_at: Date.now() - hoursAgo * H }, U.slHod);
  let at = Date.now() - hoursAgo * H;
  for (let i = 0; i < doneSteps; i++) { const es = db.prepare('SELECT * FROM entry_steps WHERE entry_id=? AND step_no=?').get(e.id, i + 1); at = Math.min(Date.now(), es.planned_at + (i === 1 ? 5 * H : -10 * 6e4)); C.completeStep(es, at, 'Done'); }
};
mk('Sourav', 'sourav@mail.com', 'Delhi', 'Type C Charger', 500, 20, 70, 1); mk('Aman', 'aman@mail.com', 'Palam', 'TFT Screen', 10000, 10, 3, 0);
mk('Vikas', 'vikas@mail.com', 'Jaipur', 'iMac', 90000, 2, 200, 3); mk('Tilak', 'tilak@mail.com', 'Pune', 'Keyboard', 1200, 50, 120, 2); mk('Raman', 'raman@mail.com', 'Noida', 'Router', 2500, 15, 400, 4);

console.log('\nDemo data added. Sign in with password  demo123  as any of:');
console.log('  Admin ........ admin@example.com  (password admin123)');
console.log('  HODs ......... hr01@demo.com, sl01@demo.com, ac01@demo.com, op01@demo.com');
console.log('  Team members . hr02@demo.com, sl02@demo.com, ac02@demo.com, op02@demo.com');
console.log('  Process Coordination (view only) ... pc01@demo.com\n');
