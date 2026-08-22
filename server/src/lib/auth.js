import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const TOKEN_TTL = '12h';
export const AUTH_COOKIE = 'mdb_session';

// Fail loudly rather than silently signing sessions with a known dev secret.
// On a serverless platform this surfaces as a function invocation failure, so
// the message has to say exactly what to do about it.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error(
    'JWT_SECRET is not set. Generate one with `openssl rand -base64 48` and add it to the ' +
    "deployment's environment variables, then redeploy.",
  );
}

export const hashPassword = (plain) => bcrypt.hashSync(plain, 12);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

export function issueToken(user) {
  return jwt.sign(
    { sub: user.id, school_id: user.school_id, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function readToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[AUTH_COOKIE] || null;
}

/**
 * Authenticates the request and attaches `req.user`. Every non-public route
 * goes through this, so no handler ever sees an unauthenticated caller.
 */
export async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  try {
    const user = await get(
      'SELECT id, school_id, email, full_name, role FROM users WHERE id = ?', [claims.sub],
    );
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Attaches `req.user` when a valid session exists, but never rejects. Used by
 * the session probe, so a signed-out visitor is an ordinary 200 rather than a
 * 401 the browser logs as a console error on every cold load.
 */
export async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const claims = jwt.verify(token, JWT_SECRET);
      req.user = await get(
        'SELECT id, school_id, email, full_name, role FROM users WHERE id = ?', [claims.sub],
      ) || undefined;
    } catch {
      /* an expired or forged cookie simply means "signed out" here */
    }
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'School administrator access required.' });
  }
  next();
}
