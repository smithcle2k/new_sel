/**
 * Device-scoped kiosk credentials.
 *
 * A board left on a wall overnight must not carry a teacher's session. This
 * module issues a credential bound to a single classroom whose entire
 * authority is: read that room's roster, and record a check-in for a child on
 * it. It cannot reach another classroom, the compliance reports, the staff
 * list, or anything else — and it lives under its own cookie name, so it is
 * structurally incapable of satisfying `requireAuth`.
 *
 * Storage: only the SHA-256 of the token is persisted. The tokens are 43
 * characters of `nanoid` entropy (~256 bits), so a fast digest is the right
 * choice here — a password KDF would buy nothing against an unguessable
 * secret and would cost a stretch on every board request.
 */
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { get, run } from './db.js';

export const KIOSK_COOKIE = 'mdb_kiosk';

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

/** Mint a device credential. The plaintext is returned once and never stored. */
export async function mintDevice({ schoolId, classroomId, label, createdBy, days }) {
  const raw = nanoid(43);
  const id = nanoid();
  await run(
    `INSERT INTO kiosk_devices
       (id, school_id, classroom_id, label, token_hash, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`,
    [id, schoolId, classroomId, label, hashToken(raw), createdBy, `+${days} days`],
  );

  const device = await get('SELECT * FROM kiosk_devices WHERE id = ?', [id]);
  return { device: publicDevice(device), token: raw };
}

/** Devices never expose their hash, and cannot expose their token. */
export const publicDevice = (d) => ({
  id: d.id,
  label: d.label,
  classroomId: d.classroom_id,
  expiresAt: d.expires_at,
  revokedAt: d.revoked_at,
  lastSeenAt: d.last_seen_at,
  createdAt: d.created_at,
});

const isExpired = (device) => new Date(`${device.expires_at}Z`) <= new Date();

/**
 * Resolve a raw token to a live device, or null. Revocation and expiry are
 * checked here on every request, so revoking a lost board takes effect on its
 * very next call rather than whenever some token would have expired.
 */
export async function resolveDevice(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const device = await get('SELECT * FROM kiosk_devices WHERE token_hash = ?', [hashToken(raw)]);
  if (!device || device.revoked_at || isExpired(device)) return null;
  return device;
}

export function setKioskCookie(res, raw, device) {
  const maxAge = Math.max(0, new Date(`${device.expires_at}Z`).getTime() - Date.now());
  res.cookie(KIOSK_COOKIE, raw, {
    httpOnly: true,                 // the board's own JS can never read it
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  });
}

/**
 * Gate for every board endpoint. Attaches `req.device` — never `req.user`, so
 * no staff-only handler can ever be reached with a board credential even if
 * one were mounted on the wrong router by mistake.
 */
export async function requireKiosk(req, res, next) {
  try {
    const device = await resolveDevice(req.cookies?.[KIOSK_COOKIE]);
    if (!device) {
      res.clearCookie(KIOSK_COOKIE);
      return res.status(401).json({ error: 'This board is not linked. Ask a teacher for a new board link.' });
    }
    await run("UPDATE kiosk_devices SET last_seen_at = datetime('now') WHERE id = ?", [device.id]);
    req.device = device;
    next();
  } catch (err) {
    next(err);
  }
}
