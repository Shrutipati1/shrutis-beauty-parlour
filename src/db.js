'use strict';
/**
 * SQLite layer built on Node's built-in `node:sqlite` driver (no native builds).
 * One connection, WAL mode, foreign keys on. All queries in the app use
 * parameter binding (`?` placeholders) to avoid SQL injection.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'salon.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT 'Salon Owner',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Hair',
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  duration    INTEGER NOT NULL DEFAULT 30,
  image       TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL DEFAULT '',
  visits     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reference      TEXT NOT NULL UNIQUE,
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  service_id     INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_name   TEXT NOT NULL,
  price          INTEGER NOT NULL DEFAULT 0,
  duration       INTEGER NOT NULL DEFAULT 30,
  appt_date      TEXT NOT NULL,
  appt_time      TEXT NOT NULL,
  message        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'confirmed',
  reminder_24h   INTEGER NOT NULL DEFAULT 0,
  reminder_2h    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(appt_date);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_lock
  ON appointments(appt_date, appt_time)
  WHERE status IN ('confirmed','pending');

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  rating     INTEGER NOT NULL DEFAULT 5,
  body       TEXT NOT NULL,
  is_sample  INTEGER NOT NULL DEFAULT 0,
  published  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'Salon',
  image_url  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL,
  recipient      TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'booking_confirmation',
  status         TEXT NOT NULL DEFAULT 'sent',
  detail         TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/* ---------- helpers ---------- */
const get = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

module.exports = { db, get, all, run, transaction, DB_PATH };