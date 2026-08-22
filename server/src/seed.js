/** Demo data: one school, an admin, a teacher, a roster and a week of blooms. */
import { nanoid } from 'nanoid';
import { batch, get, ready, run } from './lib/db.js';
import { hashPassword } from './lib/auth.js';
import { BLOOM_FOR_SCORE } from './lib/standards.js';

const NAMES = ['Ava', 'Mateo', 'Zuri', 'Kai', 'Noor', 'Diego', 'Lena', 'Amari', 'Rosie', 'Theo'];
const FURS = ['#8b7fd4', '#f2994a', '#56ccf2', '#eb5757', '#6fcf97', '#bb6bd9'];
const HATS = ['none', 'pirate', 'party', 'crown'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

await ready();

const schoolId = nanoid();
const adminId = nanoid();
const teacherId = nanoid();
const roomId = nanoid();

const statements = [
  { sql: 'DELETE FROM schools', args: [] },   // cascades through the whole tree
  { sql: "INSERT INTO schools (id, name, state) VALUES (?, 'Sunnybrook Early Learning', 'NJ')",
    args: [schoolId] },
  { sql: `INSERT INTO users (id, school_id, email, password_hash, full_name, role)
          VALUES (?, ?, 'admin@sunnybrook.test', ?, 'Dana Ruiz', 'admin')`,
    args: [adminId, schoolId, hashPassword('password123')] },
  { sql: `INSERT INTO users (id, school_id, email, password_hash, full_name, role)
          VALUES (?, ?, 'teacher@sunnybrook.test', ?, 'Sam Okafor', 'teacher')`,
    args: [teacherId, schoolId, hashPassword('password123')] },
  { sql: "INSERT INTO classrooms (id, school_id, teacher_id, name) VALUES (?, ?, ?, 'Butterfly Room')",
    args: [roomId, schoolId, teacherId] },
];

for (const name of NAMES) {
  const sid = nanoid();
  const fur = pick(FURS);
  const hat = pick(HATS);
  statements.push({
    sql: `INSERT INTO students (id, classroom_id, school_id, first_name, last_initial, fur_color, hat)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [sid, roomId, schoolId, name, name[0], fur, hat],
  });
  for (let d = 6; d >= 0; d--) {
    if (Math.random() < 0.15) continue;   // absences
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - d);
    const score = pick([5, 4, 4, 4, 3, 3, 2, 1]);
    statements.push({
      sql: `INSERT INTO checkins
              (id, student_id, classroom_id, school_id, mood_score, bloom, fur_color, hat, checkin_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [nanoid(), sid, roomId, schoolId, score,
             BLOOM_FOR_SCORE[score], fur, hat, date.toISOString().slice(0, 10)],
    });
  }
}

// Foreign keys are enforced per-connection in libSQL; the delete-then-insert
// order inside one atomic batch keeps referential integrity regardless.
await run('PRAGMA foreign_keys = ON');
await batch(statements);

const { n } = await get('SELECT COUNT(*) AS n FROM checkins');
console.log(`Seeded Sunnybrook Early Learning (NJ): ${NAMES.length} children, ${n} check-ins.`);
console.log('  admin@sunnybrook.test / password123');
console.log('  teacher@sunnybrook.test / password123');
