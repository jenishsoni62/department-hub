'use strict';
// Loads the real Head Office people (people.json) with departments, HODs and Process Co-ordination (view-only) users.
// Safe to run many times: existing e-mails / departments are skipped. Default password for everyone: welcome123 (must be changed at first login).
const bcrypt = require('bcryptjs');
const C = require('./core');
const { db } = C;
const people = require('./people.json');
const PEOPLE_VERSION = 'depot-1';          // bump when people.json changes; the load then runs once, so later manual edits are never undone
if (C.getSetting('people_version', '') === PEOPLE_VERSION) { console.log('People already loaded – skipped.'); module.exports = {}; return; }
const hash = bcrypt.hashSync('welcome123', 10);
let nd = 0, nu = 0, nh = 0;
const deptId = n => {
  let r = db.prepare('SELECT id FROM departments WHERE lower(name)=lower(?)').get(n);
  if (!r) { r = { id: db.prepare('INSERT INTO departments(name) VALUES(?)').run(n).lastInsertRowid }; nd++; }
  return r.id;
};
for (const p of people) {
  const d = deptId(p.dept), role = p.role === 'pc' ? 'pc' : p.role === 'admin' ? 'admin' : (p.hod ? 'hod' : 'member');
  let u = p.email ? db.prepare('SELECT id FROM users WHERE email=?').get(p.email) : (p.code && db.prepare('SELECT id FROM users WHERE emp_code=?').get(p.code)) || db.prepare('SELECT id FROM users WHERE name=? AND (dept_id=? OR ?=1)').get(p.name, d, p.move ? 1 : 0);
  if (!u) {
    u = { id: db.prepare('INSERT INTO users(emp_code,name,email,password_hash,role,dept_id,must_change_pw,designation) VALUES(?,?,?,?,?,?,1,?)').run(p.code || null, p.name, p.email, hash, role, role === 'pc' ? null : d, p.designation || null).lastInsertRowid };
    nu++;
  }
  else if (p.move) db.prepare('UPDATE users SET dept_id=?, role=?, designation=COALESCE(?,designation) WHERE id=?').run(d, role, p.designation || null, u.id);
  else if (p.designation) db.prepare('UPDATE users SET designation=? WHERE id=? AND designation IS NULL').run(p.designation, u.id);
  if (role === 'admin') db.prepare('UPDATE departments SET hod_id=NULL WHERE hod_id=?').run(u.id);
  if (p.hod && role === 'hod') { db.prepare('UPDATE departments SET hod_id=? WHERE id=?').run(u.id, d); nh++; }
}
console.log(`People loaded: ${nu} new users, ${nd} new departments, ${nh} HODs set. Default password: welcome123`);
// Departments that should have no HOD (Management = directors only)
for (const n of ['Management']) {
  const d = db.prepare('SELECT id,hod_id FROM departments WHERE lower(name)=lower(?)').get(n);
  if (d && d.hod_id) { db.prepare("UPDATE users SET role='member' WHERE id=? AND role='hod'").run(d.hod_id); db.prepare('UPDATE departments SET hod_id=NULL WHERE id=?').run(d.id); }
}

// Merge the old per-city depot departments into the single 'Depot' department (only the empty ones are removed)
for (const d of db.prepare("SELECT id FROM departments WHERE name LIKE '% Depot' AND lower(name)<>'depot'").all()) {
  const used = ['users', 'tickets', 'rec_tasks', 'boards', 'processes'].some(t => { try { return db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE dept_id=?`).get(d.id).n > 0; } catch { return false; } });
  if (!used) { try { db.prepare('DELETE FROM access WHERE dept_id=?').run(d.id); db.prepare('DELETE FROM departments WHERE id=?').run(d.id); } catch (e) { } }
}
C.setSetting('people_version', PEOPLE_VERSION);
