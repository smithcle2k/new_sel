/**
 * Database access via libSQL.
 *
 * The app runs on serverless functions, where the filesystem is read-only and
 * per-instance, so an on-disk SQLite file is not an option: it cannot be
 * written, and anything in /tmp would differ between concurrent invocations.
 * libSQL keeps the SQLite dialect — every query, upsert and `datetime()`
 * modifier here is unchanged — while the storage lives remotely.
 *
 * `DATABASE_URL` selects where:
 *   file:./server/data/my-day-buddy.db   local development and tests
 *   libsql://<db>-<org>.turso.io         deployed (with DATABASE_AUTH_TOKEN)
 *
 * Everything is async. There is no synchronous escape hatch over a network
 * connection, so callers must await.
 */
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STANDARDS, SUPPORTED_STATES } from './standards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Local default: a file beside the server. Only ever reached off-platform,
  // so creating the directory here is safe.
  const dir = path.join(__dirname, '..', '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return `file:${path.join(dir, 'my-day-buddy.db')}`;
}

const url = resolveUrl();

if (url.startsWith('libsql://') && !process.env.DATABASE_AUTH_TOKEN) {
  throw new Error(
    'DATABASE_AUTH_TOKEN is not set, but DATABASE_URL points at libsql://. Create one with ' +
    '`turso db tokens create <database>` and add it to the environment, then redeploy.',
  );
}
if (process.env.NODE_ENV === 'production' && url.startsWith('file:')) {
  throw new Error(
    'DATABASE_URL is a file: path in production. Serverless filesystems are read-only and ' +
    'per-instance, so the database must be remote — set DATABASE_URL to your libsql:// URL.',
  );
}

export const db = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/* ------------------------------ query helpers ---------------------------- */

/** All rows, as plain objects. */
export async function all(sql, args = {}) {
  const rs = await db.execute({ sql, args });
  return rs.rows.map((r) => ({ ...r }));
}

/** First row, or undefined — mirrors the shape handlers already expect. */
export async function get(sql, args = {}) {
  const rows = await all(sql, args);
  return rows[0];
}

/** A write. Returns the driver result (rowsAffected, lastInsertRowid). */
export const run = (sql, args = {}) => db.execute({ sql, args });

/**
 * An atomic group of writes. `batch` is one round trip and rolls back as a
 * unit, which is what every transaction in this app needs — none of them read
 * a value mid-transaction to decide the next write.
 */
export const batch = (statements) => db.batch(statements, 'write');

/* --------------------------------- schema -------------------------------- */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schools (
     id           TEXT PRIMARY KEY,
     name         TEXT NOT NULL,
     state        TEXT NOT NULL,
     created_at   TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS users (
     id            TEXT PRIMARY KEY,
     school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
     email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     full_name     TEXT NOT NULL,
     role          TEXT NOT NULL CHECK (role IN ('admin','teacher')),
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id)`,
  `CREATE TABLE IF NOT EXISTS invites (
     id          TEXT PRIMARY KEY,
     school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
     email       TEXT NOT NULL COLLATE NOCASE,
     token       TEXT NOT NULL UNIQUE,
     role        TEXT NOT NULL CHECK (role IN ('admin','teacher')),
     invited_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     accepted_at TEXT,
     expires_at  TEXT NOT NULL,
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_invites_school ON invites(school_id)`,
  `CREATE TABLE IF NOT EXISTS classrooms (
     id         TEXT PRIMARY KEY,
     school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
     teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name       TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classrooms_school ON classrooms(school_id)`,
  `CREATE TABLE IF NOT EXISTS students (
     id           TEXT PRIMARY KEY,
     classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
     school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
     first_name   TEXT NOT NULL,
     last_initial TEXT NOT NULL DEFAULT '',
     fur_color    TEXT NOT NULL DEFAULT '#8b7fd4',
     hat          TEXT NOT NULL DEFAULT 'none' CHECK (hat IN ('none','pirate','party','crown')),
     archived     INTEGER NOT NULL DEFAULT 0,
     created_at   TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_students_classroom ON students(classroom_id)`,
  `CREATE TABLE IF NOT EXISTS checkins (
     id           TEXT PRIMARY KEY,
     student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
     classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
     school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
     mood_score   INTEGER NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
     bloom        TEXT NOT NULL,
     fur_color    TEXT NOT NULL,
     hat          TEXT NOT NULL,
     checkin_date TEXT NOT NULL,
     created_at   TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (student_id, checkin_date)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_checkins_classroom_date ON checkins(classroom_id, checkin_date)`,
  // Device-scoped kiosk credentials. A wall-mounted board must not hold a
  // staff session; it holds this instead, bound to one classroom. Only the
  // SHA-256 of the token is stored.
  `CREATE TABLE IF NOT EXISTS kiosk_devices (
     id           TEXT PRIMARY KEY,
     school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
     classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
     label        TEXT NOT NULL,
     token_hash   TEXT NOT NULL UNIQUE,
     created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at   TEXT NOT NULL,
     revoked_at   TEXT,
     last_seen_at TEXT,
     created_at   TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_kiosk_classroom ON kiosk_devices(classroom_id)`,
  // The compliance engine's lookup table: reference data, re-synced from
  // lib/standards.js so citations stay authoritative.
  `CREATE TABLE IF NOT EXISTS state_standards (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     state         TEXT NOT NULL,
     mood_score    INTEGER NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
     standard_code TEXT NOT NULL,
     domain        TEXT NOT NULL,
     indicator     TEXT NOT NULL,
     UNIQUE (state, mood_score, standard_code)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_standards_lookup ON state_standards(state, mood_score)`,
];

/** Re-sync the standards catalog (idempotent). */
export async function syncStandards() {
  const statements = [];
  for (const { code: state } of SUPPORTED_STATES) {
    for (const [score, rows] of Object.entries(STANDARDS[state])) {
      for (const r of rows) {
        statements.push({
          sql: `INSERT INTO state_standards (state, mood_score, standard_code, domain, indicator)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (state, mood_score, standard_code)
                DO UPDATE SET domain = excluded.domain, indicator = excluded.indicator`,
          args: [state, Number(score), r.code, r.domain, r.indicator],
        });
      }
    }
  }
  await batch(statements);
  const row = await get('SELECT COUNT(*) AS n FROM state_standards');
  return Number(row.n);
}

/**
 * Create the schema and load the catalog.
 *
 * Memoised per instance: a serverless function may cold-start at any time, and
 * this must run before the first query without running on every request. The
 * DDL is all `IF NOT EXISTS` and the catalog sync is an upsert, so concurrent
 * instances racing here is harmless.
 */
let readyPromise = null;

export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      for (const stmt of SCHEMA) await db.execute(stmt);
      await syncStandards();
    })().catch((err) => {
      readyPromise = null;   // let the next request retry rather than wedging
      throw err;
    });
  }
  return readyPromise;
}
