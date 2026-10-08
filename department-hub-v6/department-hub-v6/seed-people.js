'use strict';
// Loads the real Head Office people (people.json) with departments, HODs and Process Co-ordination (view-only) users.
// Safe to run many times: existing e-mails / departments are skipped. Default password for everyone: welcome123 (must be changed at first login).
const bcrypt = require('bcryptjs');
const C = require('./core');
const { db } = C;
const people = require('./people.json');
const hash = bcrypt.hashSync('welcome123', 10);
let nd = 0, nu = 0, nh = 0;
const deptId = n => {
  let r = db.prepare('SELECT id FROM departments WHERE lower(name)=lower(?)').get(n);
  if (!r) { r = { id: db.prepare('INSERT INTO departments(name) VALUES(?)').run(n).lastInsertRowid }; nd++; }
  return r.id;
};
for (const p of people) {
  const d = deptId(p.dept), role = p.role === 'pc' ? 'pc' : (p.hod ? 'hod' : 'member');
  let u = p.email ? db.prepare('SELECT id FROM users WHERE email=?').get(p.email) : db.prepare('SELECT id FROM users WHERE name=? AND dept_id=?').get(p.name, d);
  if (!u) {
    u = { id: db.prepare('INSERT INTO users(name,email,password_hash,role,dept_id,must_change_pw) VALUES(?,?,?,?,?,1)').run(p.name, p.email, hash, role, role === 'pc' ? null : d).lastInsertRowid };
    nu++;
  }
  else if (p.move) db.prepare('UPDATE users SET dept_id=?, role=? WHERE id=?').run(d, role, u.id);
  if (p.hod) { db.prepare('UPDATE departments SET hod_id=? WHERE id=?').run(u.id, d); nh++; }
}
console.log(`People loaded: ${nu} new users, ${nd} new departments, ${nh} HODs set. Default password: welcome123`);
// Departments that should have no HOD (Management = directors only)
for (const n of ['Management']) {
  const d = db.prepare('SELECT id,hod_id FROM departments WHERE lower(name)=lower(?)').get(n);
  if (d && d.hod_id) { db.prepare("UPDATE users SET role='member' WHERE id=? AND role='hod'").run(d.hod_id); db.prepare('UPDATE departments SET hod_id=NULL WHERE id=?').run(d.id); }
}
