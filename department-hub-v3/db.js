'use strict';
// Uses the SQLite that is built into Node.js (node:sqlite) – nothing to compile, works on Node 22.13+ / 24 on Windows, Mac and Linux.
const { DatabaseSync } = require('node:sqlite'), path = require('path'), bcrypt = require('bcryptjs');
const { DATA } = require('./lib');

const raw = new DatabaseSync(path.join(DATA, 'hub.db'));
raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Small wrapper so the rest of the code can use  db.prepare(sql).run/get/all(...params)  and  db.transaction(fn)
const cache = new Map();
let depth = 0;
const db = {
  exec: sql => raw.exec(sql),
  prepare(sql) {
    let st = cache.get(sql); if (!st) { st = raw.prepare(sql); cache.set(sql, st); }
    return { run: (...a) => st.run(...a), get: (...a) => st.get(...a), all: (...a) => st.all(...a) };
  },
  transaction: fn => (...args) => {
    const name = 'sp' + depth;
    raw.exec(depth === 0 ? 'BEGIN' : 'SAVEPOINT ' + name); depth++;
    try { const r = fn(...args); depth--; raw.exec(depth === 0 ? 'COMMIT' : 'RELEASE ' + name); return r; }
    catch (e) { depth--; raw.exec(depth === 0 ? 'ROLLBACK' : 'ROLLBACK TO ' + name + '; RELEASE ' + name); throw e; }
  },
};

db.exec(`
CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, hod_id INTEGER);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, emp_code TEXT UNIQUE, name TEXT NOT NULL, email TEXT UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', dept_id INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS access(user_id INTEGER, dept_id INTEGER, module TEXT, level TEXT, PRIMARY KEY(user_id, dept_id, module));
CREATE TABLE IF NOT EXISTS lookups(id INTEGER PRIMARY KEY, kind TEXT, name TEXT, UNIQUE(kind, name));
CREATE TABLE IF NOT EXISTS holidays(date TEXT PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, ref_type TEXT, ref_id INTEGER, user_id INTEGER, text TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS ix_msg ON messages(ref_type, ref_id);

CREATE TABLE IF NOT EXISTS tickets(
  id INTEGER PRIMARY KEY, dept_id INTEGER, created_by INTEGER, doer_id INTEGER, prev_doer_id INTEGER, issue_type TEXT, reviewer_id INTEGER,
  due_date TEXT, description TEXT, priority TEXT DEFAULT 'Medium', needs_proof INTEGER DEFAULT 0, status TEXT DEFAULT 'open', rework INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')), closed_at TEXT);
CREATE INDEX IF NOT EXISTS ix_tk ON tickets(doer_id, status);

CREATE TABLE IF NOT EXISTS rec_tasks(
  id INTEGER PRIMARY KEY, dept_id INTEGER, doer_id INTEGER, category TEXT, frequency TEXT, start_date TEXT, end_date TEXT, description TEXT,
  performer TEXT DEFAULT 'doer', on_time INTEGER DEFAULT 0, needs_proof INTEGER DEFAULT 0, reviewer_id INTEGER, priority TEXT DEFAULT 'Medium',
  active INTEGER DEFAULT 1, created_by INTEGER, gen_from TEXT, last_gen TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS rec_instances(
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL, due_date TEXT NOT NULL, status TEXT DEFAULT 'pending', done_at TEXT, remarks TEXT, UNIQUE(task_id, due_date));
CREATE INDEX IF NOT EXISTS ix_ri ON rec_instances(due_date, status);

CREATE TABLE IF NOT EXISTS boards(
  id INTEGER PRIMARY KEY, name TEXT, color TEXT DEFAULT '#2563eb', icon TEXT DEFAULT '📋', dept_id INTEGER, sharing TEXT DEFAULT 'private',
  start_date TEXT, end_date TEXT, owner_id INTEGER, archived INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS board_members(board_id INTEGER, user_id INTEGER, level TEXT DEFAULT 'editor', PRIMARY KEY(board_id, user_id));
CREATE TABLE IF NOT EXISTS del_tasks(
  id INTEGER PRIMARY KEY, board_id INTEGER, title TEXT, description TEXT, assigned_to INTEGER, created_by INTEGER, due_date TEXT, priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'not_started', rework INTEGER DEFAULT 0, req_date TEXT, req_reason TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), closed_at TEXT);
CREATE INDEX IF NOT EXISTS ix_dt ON del_tasks(board_id, status);

CREATE TABLE IF NOT EXISTS processes(
  id INTEGER PRIMARY KEY, name TEXT, prefix TEXT, description TEXT, type TEXT DEFAULT 'Straight', dept_id INTEGER, pc_id INTEGER,
  fields TEXT DEFAULT '[]', next_seq INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS process_steps(id INTEGER PRIMARY KEY, process_id INTEGER, step_no INTEGER, name TEXT, doer_id INTEGER, tat INTEGER DEFAULT 1, unit TEXT DEFAULT 'days');
CREATE TABLE IF NOT EXISTS entries(
  id INTEGER PRIMARY KEY, process_id INTEGER, uid TEXT UNIQUE, title TEXT, data TEXT DEFAULT '{}', status TEXT DEFAULT 'running', started_at INTEGER, created_by INTEGER);
CREATE TABLE IF NOT EXISTS entry_steps(
  id INTEGER PRIMARY KEY, entry_id INTEGER, step_no INTEGER, name TEXT, doer_id INTEGER, tat_ms INTEGER, planned_at INTEGER, actual_at INTEGER,
  status TEXT DEFAULT 'pending', remarks TEXT, UNIQUE(entry_id, step_no));
CREATE INDEX IF NOT EXISTS ix_es ON entry_steps(doer_id, status);
`);

// first run: create the single admin account
if (!db.prepare('SELECT COUNT(*) n FROM users').get().n) {
  db.prepare("INSERT INTO users(emp_code,name,email,password_hash,role) VALUES('ADMIN','Administrator','admin@example.com',?,'admin')")
    .run(bcrypt.hashSync('admin123', 10));
  for (const n of ['Management']) db.prepare('INSERT OR IGNORE INTO departments(name) VALUES(?)').run(n);
  for (const n of ['General', 'Accounts', 'Operations', 'Compliance']) db.prepare("INSERT OR IGNORE INTO lookups(kind,name) VALUES('category',?)").run(n);
  for (const n of ['IT Support', 'Maintenance', 'HR Query', 'Website Down Issue', 'Other']) db.prepare("INSERT OR IGNORE INTO lookups(kind,name) VALUES('issue_type',?)").run(n);
  console.log('First run: created admin account  →  login: admin@example.com  /  password: admin123');
}
module.exports = db;
