import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const TOKEN_TTL = '12h';
export const AUTH_COOKIE = 'mdb_session';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production.');
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
export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  const user = db
    .prepare('SELECT id, school_id, email, full_name, role FROM users WHERE id = ?')
    .get(claims.sub);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  req.user = user;
  next();
}

/**
 * Attaches `req.user` when a valid session exists, but never rejects. Used by
 * the session probe, so a signed-out visitor is an ordinary 200 rather than a
 * 401 the browser logs as a console error on every cold load.
 */
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const claims = jwt.verify(token, JWT_SECRET);
      req.user = db
        .prepare('SELECT id, school_id, email, full_name, role FROM users WHERE id = ?')
        .get(claims.sub) || undefined;
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
