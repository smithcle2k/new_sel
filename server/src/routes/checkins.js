import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { scopedClassroom, scopedStudent } from '../lib/scope.js';
import { BLOOM_FOR_SCORE } from '../lib/standards.js';

export const checkinRouter = Router();
checkinRouter.use(requireAuth);

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Record a child's completed check-in. Re-checking in on the same day
 * replaces that day's entry rather than creating a duplicate row.
 */
checkinRouter.post('/', (req, res) => {
  const input = z
    .object({
      studentId: z.string(),
      moodScore: z.number().int().min(1).max(5),
      furColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      hat: z.enum(['none', 'pirate', 'party', 'crown']),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .parse(req.body);

  const student = scopedStudent(req.user, input.studentId);
  const date = input.date || today();
  const bloom = BLOOM_FOR_SCORE[input.moodScore];

  db.transaction(() => {
    // The customizer choices persist onto the roster so the child's raccoon
    // greets them the same way tomorrow.
    db.prepare('UPDATE students SET fur_color = ?, hat = ? WHERE id = ?')
      .run(input.furColor, input.hat, student.id);
    db.prepare(`INSERT INTO checkins
                  (id, student_id, classroom_id, school_id, mood_score, bloom, fur_color, hat, checkin_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (student_id, checkin_date) DO UPDATE SET
                  mood_score = excluded.mood_score, bloom = excluded.bloom,
                  fur_color  = excluded.fur_color,  hat   = excluded.hat,
                  created_at = datetime('now')`)
      .run(nanoid(), student.id, student.classroom_id, student.school_id,
           input.moodScore, bloom, input.furColor, input.hat, date);
  })();

  const checkin = db
    .prepare('SELECT * FROM checkins WHERE student_id = ? AND checkin_date = ?')
    .get(student.id, date);
  res.status(201).json({ checkin });
});

/** Kiosk roster: who still needs to check in today. */
checkinRouter.get('/classroom/:id/today', (req, res) => {
  const classroom = scopedClassroom(req.user, req.params.id);
  const date = today();
  const students = db
    .prepare(`SELECT s.id, s.first_name, s.last_initial, s.fur_color, s.hat,
                     c.mood_score, c.bloom
                FROM students s
                LEFT JOIN checkins c
                  ON c.student_id = s.id AND c.checkin_date = @date
               WHERE s.classroom_id = @cid AND s.archived = 0
               ORDER BY s.first_name`)
    .all({ cid: classroom.id, date });
  res.json({ classroom, date, students });
});
