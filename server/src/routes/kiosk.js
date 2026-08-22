/**
 * Two routers with deliberately different authorities:
 *
 *   kioskRouter        — authenticated by a device credential. Mounted at
 *                        /api/kiosk. Its whole surface is one classroom's
 *                        roster and recording a check-in on it.
 *   deviceAdminRouter  — authenticated by a staff session. Mounted at
 *                        /api/devices. Mints, lists and revokes boards.
 *
 * They are separate routers rather than one with branching auth so that no
 * handler can be reached by the wrong kind of caller.
 */
import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError, scopedClassroom } from '../lib/scope.js';
import { BLOOM_FOR_SCORE } from '../lib/standards.js';
import {
  KIOSK_COOKIE, mintDevice, publicDevice, requireKiosk, resolveDevice, setKioskCookie,
} from '../lib/kiosk.js';

const today = () => new Date().toISOString().slice(0, 10);

/* ========================= board (device) endpoints ====================== */

export const kioskRouter = Router();

/**
 * Exchange a board link's token for an httpOnly cookie.
 *
 * The point of the exchange is to get the token out of the URL: a link sitting
 * in a wall-mounted board's address bar or history can be read by anyone in
 * the room, and photographed from across it. After claiming, the credential
 * lives only in a cookie the page's own JavaScript cannot read.
 */
kioskRouter.post('/claim', (req, res) => {
  const { token } = z.object({ token: z.string().min(1).max(200) }).parse(req.body);
  const device = resolveDevice(token);
  if (!device) throw new HttpError(401, 'That board link is not valid, has expired, or was revoked.');

  setKioskCookie(res, token, device);
  db.prepare("UPDATE kiosk_devices SET last_seen_at = datetime('now') WHERE id = ?").run(device.id);
  res.json({ device: publicDevice(device) });
});

/** What this board is. Used to render its header and detect an expired link. */
kioskRouter.get('/session', requireKiosk, (req, res) => {
  const classroom = db
    .prepare('SELECT id, name FROM classrooms WHERE id = ?')
    .get(req.device.classroom_id);
  if (!classroom) throw new HttpError(404, 'That classroom no longer exists.');
  const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(req.device.school_id);
  res.json({
    device: publicDevice(req.device),
    classroom,
    schoolName: school?.name ?? '',
  });
});

/** This board's classroom only — the id comes from the credential, never the URL. */
kioskRouter.get('/today', requireKiosk, (req, res) => {
  const date = today();
  const students = db
    .prepare(`SELECT s.id, s.first_name, s.last_initial, s.fur_color, s.hat,
                     c.mood_score, c.bloom
                FROM students s
                LEFT JOIN checkins c
                  ON c.student_id = s.id AND c.checkin_date = @date
               WHERE s.classroom_id = @cid AND s.archived = 0
               ORDER BY s.first_name`)
    .all({ cid: req.device.classroom_id, date });
  res.json({ date, students });
});

kioskRouter.post('/checkins', requireKiosk, (req, res) => {
  const input = z
    .object({
      studentId: z.string(),
      moodScore: z.number().int().min(1).max(5),
      furColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      hat: z.enum(['none', 'pirate', 'party', 'crown']),
    })
    .parse(req.body);

  // The child must be on THIS board's roster. A device credential can never
  // write a check-in for a classroom it is not bound to.
  const student = db
    .prepare('SELECT * FROM students WHERE id = ? AND classroom_id = ? AND archived = 0')
    .get(input.studentId, req.device.classroom_id);
  if (!student) throw new HttpError(404, 'That child is not on this board\'s roster.');

  const date = today();
  const bloom = BLOOM_FOR_SCORE[input.moodScore];

  db.transaction(() => {
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

  res.status(201).json({
    checkin: db.prepare('SELECT * FROM checkins WHERE student_id = ? AND checkin_date = ?')
      .get(student.id, date),
  });
});

/** Unlink this device — clears the cookie without revoking the credential. */
kioskRouter.post('/release', (_req, res) => {
  res.clearCookie(KIOSK_COOKIE);
  res.json({ ok: true });
});

/* ==================== device management (staff session) ================== */

export const deviceAdminRouter = Router();
deviceAdminRouter.use(requireAuth);

deviceAdminRouter.get('/classroom/:classroomId', (req, res) => {
  const classroom = scopedClassroom(req.user, req.params.classroomId);
  const devices = db
    .prepare('SELECT * FROM kiosk_devices WHERE classroom_id = ? ORDER BY created_at DESC')
    .all(classroom.id);
  res.json({ devices: devices.map(publicDevice) });
});

deviceAdminRouter.post('/classroom/:classroomId', (req, res) => {
  const classroom = scopedClassroom(req.user, req.params.classroomId);
  const { label, days } = z
    .object({
      label: z.string().trim().min(1).max(80),
      days: z.number().int().min(1).max(365).default(180),
    })
    .parse(req.body);

  const { device, token } = mintDevice({
    schoolId: classroom.school_id,
    classroomId: classroom.id,
    label,
    createdBy: req.user.id,
    days,
  });
  // `token` is returned exactly once; only its hash was stored.
  res.status(201).json({ device, token });
});

deviceAdminRouter.delete('/:deviceId', (req, res) => {
  const device = db
    .prepare('SELECT * FROM kiosk_devices WHERE id = ? AND school_id = ?')
    .get(req.params.deviceId, req.user.school_id);
  if (!device) throw new HttpError(404, 'Board not found.');
  scopedClassroom(req.user, device.classroom_id);   // same rules as its classroom
  db.prepare("UPDATE kiosk_devices SET revoked_at = datetime('now') WHERE id = ?").run(device.id);
  res.json({ ok: true });
});
