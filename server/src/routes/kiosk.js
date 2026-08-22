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
import { all, batch, get, run } from '../lib/db.js';
import { h } from '../lib/async.js';
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
kioskRouter.post('/claim', h(async (req, res) => {
  const { token } = z.object({ token: z.string().min(1).max(200) }).parse(req.body);
  const device = await resolveDevice(token);
  if (!device) throw new HttpError(401, 'That board link is not valid, has expired, or was revoked.');

  setKioskCookie(res, token, device);
  await run("UPDATE kiosk_devices SET last_seen_at = datetime('now') WHERE id = ?", [device.id]);
  res.json({ device: publicDevice(device) });
}));

/** What this board is. Used to render its header and detect an expired link. */
kioskRouter.get('/session', requireKiosk, h(async (req, res) => {
  const classroom = await get('SELECT id, name FROM classrooms WHERE id = ?', [req.device.classroom_id]);
  if (!classroom) throw new HttpError(404, 'That classroom no longer exists.');
  const school = await get('SELECT name FROM schools WHERE id = ?', [req.device.school_id]);
  res.json({
    device: publicDevice(req.device),
    classroom,
    schoolName: school?.name ?? '',
  });
}));

/** This board's classroom only — the id comes from the credential, never the URL. */
kioskRouter.get('/today', requireKiosk, h(async (req, res) => {
  const date = today();
  const students = await all(
    `SELECT s.id, s.first_name, s.last_initial, s.fur_color, s.hat,
            c.mood_score, c.bloom
       FROM students s
       LEFT JOIN checkins c
         ON c.student_id = s.id AND c.checkin_date = ?
      WHERE s.classroom_id = ? AND s.archived = 0
      ORDER BY s.first_name`,
    [date, req.device.classroom_id],
  );
  res.json({ date, students });
}));

kioskRouter.post('/checkins', requireKiosk, h(async (req, res) => {
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
  const student = await get(
    'SELECT * FROM students WHERE id = ? AND classroom_id = ? AND archived = 0',
    [input.studentId, req.device.classroom_id],
  );
  if (!student) throw new HttpError(404, 'That child is not on this board\'s roster.');

  const date = today();
  const bloom = BLOOM_FOR_SCORE[input.moodScore];

  await batch([
    { sql: 'UPDATE students SET fur_color = ?, hat = ? WHERE id = ?',
      args: [input.furColor, input.hat, student.id] },
    { sql: `INSERT INTO checkins
              (id, student_id, classroom_id, school_id, mood_score, bloom, fur_color, hat, checkin_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (student_id, checkin_date) DO UPDATE SET
              mood_score = excluded.mood_score, bloom = excluded.bloom,
              fur_color  = excluded.fur_color,  hat   = excluded.hat,
              created_at = datetime('now')`,
      args: [nanoid(), student.id, student.classroom_id, student.school_id,
             input.moodScore, bloom, input.furColor, input.hat, date] },
  ]);

  res.status(201).json({
    checkin: await get('SELECT * FROM checkins WHERE student_id = ? AND checkin_date = ?',
      [student.id, date]),
  });
}));

/** Unlink this device — clears the cookie without revoking the credential. */
kioskRouter.post('/release', (_req, res) => {
  res.clearCookie(KIOSK_COOKIE);
  res.json({ ok: true });
});

/* ==================== device management (staff session) ================== */

export const deviceAdminRouter = Router();
deviceAdminRouter.use(requireAuth);

deviceAdminRouter.get('/classroom/:classroomId', h(async (req, res) => {
  const classroom = await scopedClassroom(req.user, req.params.classroomId);
  const devices = await all(
    'SELECT * FROM kiosk_devices WHERE classroom_id = ? ORDER BY created_at DESC', [classroom.id],
  );
  res.json({ devices: devices.map(publicDevice) });
}));

deviceAdminRouter.post('/classroom/:classroomId', h(async (req, res) => {
  const classroom = await scopedClassroom(req.user, req.params.classroomId);
  const { label, days } = z
    .object({
      label: z.string().trim().min(1).max(80),
      days: z.number().int().min(1).max(365).default(180),
    })
    .parse(req.body);

  const { device, token } = await mintDevice({
    schoolId: classroom.school_id,
    classroomId: classroom.id,
    label,
    createdBy: req.user.id,
    days,
  });
  // `token` is returned exactly once; only its hash was stored.
  res.status(201).json({ device, token });
}));

deviceAdminRouter.delete('/:deviceId', h(async (req, res) => {
  const device = await get('SELECT * FROM kiosk_devices WHERE id = ? AND school_id = ?',
    [req.params.deviceId, req.user.school_id]);
  if (!device) throw new HttpError(404, 'Board not found.');
  await scopedClassroom(req.user, device.classroom_id);   // same rules as its classroom
  await run("UPDATE kiosk_devices SET revoked_at = datetime('now') WHERE id = ?", [device.id]);
  res.json({ ok: true });
}));
