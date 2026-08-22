/**
 * Vercel serverless entry point.
 *
 * Named as a catch-all so Vercel routes every /api/* request here on its own,
 * with the original path intact. That avoids depending on a rewrite to map the
 * API onto a single function, which would leave route matching at the mercy of
 * how the platform rewrites `req.url`.
 *
 * There is no port and no persistent process here — which is exactly why the
 * database lives in libSQL rather than on local disk. The app is built once
 * per warm instance and reused across invocations; the schema check inside it
 * is memoised, so it costs one round trip per cold start and nothing after.
 */
import { createApp } from '../server/src/app.js';

export default createApp();
