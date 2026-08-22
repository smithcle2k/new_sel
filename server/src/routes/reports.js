/**
 * Reporting & compliance export.
 *
 * Raw check-in scores are never stored with a standard code attached — the
 * mapping is resolved at read time by joining `checkins` to `state_standards`
 * on the *school's current home state*. If a school corrects its state, or a
 * citation is revised in the catalog, every historical report re-renders
 * against the authoritative mapping with no data migration.
 */
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { scopedClassroom } from '../lib/scope.js';
import { MOODS } from '../lib/standards.js';

export const reportRouter = Router();
reportRouter.use(requireAuth);

const MOOD_LABEL = Object.fromEntries(MOODS.map((m) => [m.score, m.label]));
const isoDay = (d) => d.toISOString().slice(0, 10);

function rangeFrom(query) {
  const { from, to, days } = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      days: z.coerce.number().int().min(1).max(180).default(7),
    })
    .parse(query);
  if (from && to) return { from, to };
  const end = to ? new Date(to + 'T00:00:00Z') : new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: from || isoDay(start), to: isoDay(end) };
}

/**
 * The compliance table: one row per check-in, joined to every state indicator
 * that score evidences. Rows fan out 1:N over indicators.
 */
reportRouter.get('/classroom/:id/compliance', (req, res) => {
  const classroom = scopedClassroom(req.user, req.params.id);
  const { from, to } = rangeFrom(req.query);

  const rows = db
    .prepare(`
      SELECT c.checkin_date              AS date,
             s.id                        AS student_id,
             s.first_name                AS first_name,
             s.last_initial              AS last_initial,
             c.mood_score                AS mood_score,
             c.bloom                     AS bloom,
             sch.state                   AS state,
             st.standard_code            AS standard_code,
             st.domain                   AS domain,
             st.indicator                AS indicator
        FROM checkins c
        JOIN students s   ON s.id  = c.student_id
        JOIN schools  sch ON sch.id = c.school_id
        LEFT JOIN state_standards st
               ON st.state = sch.state AND st.mood_score = c.mood_score
       WHERE c.classroom_id = @cid
         AND c.school_id    = @sid          -- tenant guard, belt and braces
         AND c.checkin_date BETWEEN @from AND @to
       ORDER BY c.checkin_date DESC, s.first_name, st.standard_code
    `)
    .all({ cid: classroom.id, sid: req.user.school_id, from, to });

  res.json({
    classroom,
    range: { from, to },
    rows: rows.map((r) => ({ ...r, mood_label: MOOD_LABEL[r.mood_score] })),
  });
});

/** Same data as CSV, for an administrator's compliance binder. */
reportRouter.get('/classroom/:id/compliance.csv', (req, res) => {
  const classroom = scopedClassroom(req.user, req.params.id);
  const { from, to } = rangeFrom(req.query);
  const rows = db
    .prepare(`
      SELECT c.checkin_date AS date, s.first_name, s.last_initial, c.mood_score,
             sch.state, st.standard_code, st.domain, st.indicator
        FROM checkins c
        JOIN students s   ON s.id   = c.student_id
        JOIN schools  sch ON sch.id = c.school_id
        LEFT JOIN state_standards st
               ON st.state = sch.state AND st.mood_score = c.mood_score
       WHERE c.classroom_id = @cid AND c.school_id = @sid
         AND c.checkin_date BETWEEN @from AND @to
       ORDER BY c.checkin_date DESC, s.first_name, st.standard_code
    `)
    .all({ cid: classroom.id, sid: req.user.school_id, from, to });

  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Date', 'Child', 'Mood Score', 'Mood', 'State', 'Standard Code', 'Domain', 'Indicator'];
  const body = rows.map((r) => [
    r.date, `${r.first_name} ${r.last_initial}`.trim(), r.mood_score,
    MOOD_LABEL[r.mood_score], r.state, r.standard_code, r.domain, r.indicator,
  ].map(esc).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="compliance-${classroom.name.replace(/[^\w-]+/g, '_')}-${from}_${to}.csv"`);
  res.send([header.join(','), ...body].join('\n'));
});

/** The Classroom Meadow: every child's week of blooms, plus their companion. */
reportRouter.get('/classroom/:id/meadow', (req, res) => {
  const classroom = scopedClassroom(req.user, req.params.id);
  const { from, to } = rangeFrom(req.query);

  const students = db
    .prepare(`SELECT id, first_name, last_initial, fur_color, hat
                FROM students WHERE classroom_id = ? AND archived = 0
                ORDER BY first_name`)
    .all(classroom.id);

  const checkins = db
    .prepare(`SELECT student_id, checkin_date, mood_score, bloom
                FROM checkins
               WHERE classroom_id = @cid AND checkin_date BETWEEN @from AND @to
               ORDER BY checkin_date`)
    .all({ cid: classroom.id, from, to });

  const byStudent = new Map(students.map((s) => [s.id, { ...s, blooms: [] }]));
  for (const c of checkins) byStudent.get(c.student_id)?.blooms.push(c);

  const meadow = [...byStudent.values()].map((s) => {
    const scores = s.blooms.map((b) => b.mood_score);
    return {
      ...s,
      averageMood: scores.length
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
        : null,
    };
  });

  res.json({ classroom, range: { from, to }, meadow });
});

/** Per-child trend for the detail drawer. */
reportRouter.get('/student/:studentId/history', (req, res) => {
  const student = db
    .prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .get(req.params.studentId, req.user.school_id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  scopedClassroom(req.user, student.classroom_id);
  const { from, to } = rangeFrom(req.query);

  const history = db
    .prepare(`
      SELECT c.checkin_date AS date, c.mood_score, c.bloom,
             st.standard_code, st.domain, st.indicator
        FROM checkins c
        JOIN schools sch ON sch.id = c.school_id
        LEFT JOIN state_standards st
               ON st.state = sch.state AND st.mood_score = c.mood_score
       WHERE c.student_id = ? AND c.checkin_date BETWEEN ? AND ?
       ORDER BY c.checkin_date DESC, st.standard_code
    `)
    .all(student.id, from, to);

  res.json({ student, range: { from, to }, history });
});
