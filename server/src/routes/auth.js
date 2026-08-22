import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { batch, get, all, run } from '../lib/db.js';
import { h } from '../lib/async.js';
import { STATE_CODES, SUPPORTED_STATES } from '../lib/standards.js';
import {
  AUTH_COOKIE, hashPassword, issueToken, optionalAuth, requireAdmin, requireAuth,
  setAuthCookie, verifyPassword,
} from '../lib/auth.js';
import { HttpError } from '../lib/scope.js';

export const authRouter = Router();

const publicUser = (u) => ({
  id: u.id, email: u.email, fullName: u.full_name, role: u.role, schoolId: u.school_id,
});

const schoolOf = (id) => get('SELECT id, name, state FROM schools WHERE id = ?', [id]);

const registerSchema = z.object({
  schoolName: z.string().trim().min(2).max(120),
  state: z.enum(STATE_CODES),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

/** Register a school and its first administrator, atomically. */
authRouter.post('/register-school', h(async (req, res) => {
  const input = registerSchema.parse(req.body);
  if (await get('SELECT 1 AS x FROM users WHERE email = ?', [input.email])) {
    throw new HttpError(409, 'An account with that email already exists.');
  }

  const schoolId = nanoid();
  const userId = nanoid();
  await batch([
    { sql: 'INSERT INTO schools (id, name, state) VALUES (?, ?, ?)',
      args: [schoolId, input.schoolName, input.state] },
    { sql: `INSERT INTO users (id, school_id, email, password_hash, full_name, role)
            VALUES (?, ?, ?, ?, ?, 'admin')`,
      args: [userId, schoolId, input.email, hashPassword(input.password), input.fullName] },
  ]);

  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  setAuthCookie(res, issueToken(user));
  res.status(201).json({ user: publicUser(user), school: await schoolOf(schoolId) });
}));

authRouter.post('/login', h(async (req, res) => {
  const { email, password } = z
    .object({ email: z.string().trim().email(), password: z.string().min(1) })
    .parse(req.body);
  const user = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'That email and password do not match.');
  }
  setAuthCookie(res, issueToken(user));
  res.json({ user: publicUser(user), school: await schoolOf(user.school_id) });
}));

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
});

/** Session probe. Always 200: `user` is null when nobody is signed in. */
authRouter.get('/me', optionalAuth, h(async (req, res) => {
  if (!req.user) return res.json({ user: null, school: null });
  res.json({ user: publicUser(req.user), school: await schoolOf(req.user.school_id) });
}));

authRouter.get('/states', (_req, res) => res.json({ states: SUPPORTED_STATES }));

/* ---------------------------- teacher invites ---------------------------- */

authRouter.get('/invites', requireAuth, requireAdmin, h(async (req, res) => {
  const invites = await all(
    `SELECT id, email, role, token, accepted_at, expires_at, created_at
       FROM invites WHERE school_id = ? ORDER BY created_at DESC`,
    [req.user.school_id],
  );
  res.json({ invites });
}));

authRouter.post('/invites', requireAuth, requireAdmin, h(async (req, res) => {
  const { email, role } = z
    .object({ email: z.string().trim().email(), role: z.enum(['teacher', 'admin']).default('teacher') })
    .parse(req.body);
  if (await get('SELECT 1 AS x FROM users WHERE email = ?', [email])) {
    throw new HttpError(409, 'That person already has an account.');
  }
  const id = nanoid();
  const token = nanoid(32);
  await run(
    `INSERT INTO invites (id, school_id, email, token, role, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+14 days'))`,
    [id, req.user.school_id, email, token, role, req.user.id],
  );
  res.status(201).json({
    invite: await get('SELECT id, email, role, token, expires_at FROM invites WHERE id = ?', [id]),
  });
}));

authRouter.get('/invites/:token', h(async (req, res) => {
  const invite = await get(
    `SELECT i.email, i.role, i.accepted_at, i.expires_at, s.name AS school_name
       FROM invites i JOIN schools s ON s.id = i.school_id
      WHERE i.token = ?`,
    [req.params.token],
  );
  if (!invite) throw new HttpError(404, 'That invitation link is not valid.');
  if (invite.accepted_at) throw new HttpError(410, 'That invitation has already been used.');
  res.json({ invite });
}));

/** Accept an invite: creates the teacher inside the inviting school only. */
authRouter.post('/invites/:token/accept', h(async (req, res) => {
  const { fullName, password } = z
    .object({ fullName: z.string().trim().min(2).max(120), password: z.string().min(8).max(200) })
    .parse(req.body);

  const invite = await get('SELECT * FROM invites WHERE token = ?', [req.params.token]);
  if (!invite) throw new HttpError(404, 'That invitation link is not valid.');
  if (invite.accepted_at) throw new HttpError(410, 'That invitation has already been used.');
  if (new Date(`${invite.expires_at}Z`) < new Date()) {
    throw new HttpError(410, 'That invitation has expired.');
  }
  if (await get('SELECT 1 AS x FROM users WHERE email = ?', [invite.email])) {
    throw new HttpError(409, 'An account with that email already exists.');
  }

  const userId = nanoid();
  await batch([
    { sql: `INSERT INTO users (id, school_id, email, password_hash, full_name, role)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [userId, invite.school_id, invite.email, hashPassword(password), fullName, invite.role] },
    { sql: "UPDATE invites SET accepted_at = datetime('now') WHERE id = ?", args: [invite.id] },
  ]);

  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  setAuthCookie(res, issueToken(user));
  res.status(201).json({ user: publicUser(user), school: await schoolOf(user.school_id) });
}));

/* --------------------------- school-wide staff --------------------------- */

authRouter.get('/staff', requireAuth, requireAdmin, h(async (req, res) => {
  const staff = await all(
    `SELECT id, email, full_name, role, created_at FROM users
      WHERE school_id = ? ORDER BY role, full_name`,
    [req.user.school_id],
  );
  res.json({ staff });
}));

authRouter.patch('/school', requireAuth, requireAdmin, h(async (req, res) => {
  const { name, state } = z
    .object({ name: z.string().trim().min(2).max(120).optional(), state: z.enum(STATE_CODES).optional() })
    .parse(req.body);
  if (name) await run('UPDATE schools SET name = ? WHERE id = ?', [name, req.user.school_id]);
  if (state) await run('UPDATE schools SET state = ? WHERE id = ?', [state, req.user.school_id]);
  res.json({ school: await schoolOf(req.user.school_id) });
}));
