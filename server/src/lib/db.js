import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STANDARDS, SUPPORTED_STATES } from './standards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'my-day-buddy.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  state        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','teacher')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);

CREATE TABLE IF NOT EXISTS invites (
  id          TEXT PRIMARY KEY,
  school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email       TEXT NOT NULL COLLATE NOCASE,
  token       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('admin','teacher')),
  invited_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invites_school ON invites(school_id);

CREATE TABLE IF NOT EXISTS classrooms (
  id         TEXT PRIMARY KEY,
  school_id  TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_school ON classrooms(school_id);

CREATE TABLE IF NOT EXISTS students (
  id           TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  school_id    TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL,
  last_initial TEXT NOT NULL DEFAULT '',
  fur_color    TEXT NOT NULL DEFAULT '#8b7fd4',
  hat          TEXT NOT NULL DEFAULT 'none' CHECK (hat IN ('none','pirate','party','crown')),
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_classroom ON students(classroom_id);

CREATE TABLE IF NOT EXISTS checkins (
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
);
CREATE INDEX IF NOT EXISTS idx_checkins_classroom_date ON checkins(classroom_id, checkin_date);

-- Device-scoped kiosk credentials.
--
-- A wall-mounted board must not hold a staff session: that session can read
-- every classroom the teacher owns, the compliance tables and the staff list,
-- and it sits on an unattended screen overnight. A kiosk device instead holds
-- its own credential, bound to exactly one classroom, which grants nothing but
-- that room's roster and the ability to record a check-in.
--
-- Only the SHA-256 of the token is stored. The plaintext is shown once, at
-- mint time, and is never recoverable from the database.
CREATE TABLE IF NOT EXISTS kiosk_devices (
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
);
CREATE INDEX IF NOT EXISTS idx_kiosk_classroom ON kiosk_devices(classroom_id);

-- The compliance engine's lookup table. Reference data, seeded from
-- lib/standards.js and re-synced on every boot so citations stay authoritative.
CREATE TABLE IF NOT EXISTS state_standards (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  state         TEXT NOT NULL,
  mood_score    INTEGER NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
  standard_code TEXT NOT NULL,
  domain        TEXT NOT NULL,
  indicator     TEXT NOT NULL,
  UNIQUE (state, mood_score, standard_code)
);
CREATE INDEX IF NOT EXISTS idx_standards_lookup ON state_standards(state, mood_score);
`);

/** Re-sync the standards catalog into the database (idempotent). */
export function syncStandards() {
  const upsert = db.prepare(`
    INSERT INTO state_standards (state, mood_score, standard_code, domain, indicator)
    VALUES (@state, @mood_score, @standard_code, @domain, @indicator)
    ON CONFLICT (state, mood_score, standard_code)
    DO UPDATE SET domain = excluded.domain, indicator = excluded.indicator
  `);
  const run = db.transaction(() => {
    for (const { code: state } of SUPPORTED_STATES) {
      for (const [score, rows] of Object.entries(STANDARDS[state])) {
        for (const r of rows) {
          upsert.run({
            state,
            mood_score: Number(score),
            standard_code: r.code,
            domain: r.domain,
            indicator: r.indicator,
          });
        }
      }
    }
  });
  run();
  return db.prepare('SELECT COUNT(*) AS n FROM state_standards').get().n;
}
