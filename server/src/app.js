/**
 * Builds the Express app without binding a port.
 *
 * Kept separate from `index.js` so the same app can be exported as a
 * serverless function (see `api/index.js`), where there is no port to listen
 * on and the platform invokes the handler directly.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { ready } from './lib/db.js';
import { HttpError } from './lib/scope.js';
import { authRouter } from './routes/auth.js';
import { classroomRouter } from './routes/classrooms.js';
import { checkinRouter } from './routes/checkins.js';
import { reportRouter } from './routes/reports.js';
import { deviceAdminRouter, kioskRouter } from './routes/kiosk.js';

export function createApp() {
  const app = express();

  // In production the client is served from the same origin, so CORS is only
  // needed for the split dev servers.
  const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  /**
   * Ensure the schema exists before any handler touches the database. On a
   * long-running server this resolves once at boot; on a serverless function
   * it resolves once per cold instance and is a no-op thereafter.
   */
  app.use('/api', (_req, _res, next) => { ready().then(() => next(), next); });

  app.use('/api/auth', authRouter);
  app.use('/api/classrooms', classroomRouter);
  app.use('/api/checkins', checkinRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/kiosk', kioskRouter);
  app.use('/api/devices', deviceAdminRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Central error renderer: validation -> 400, guard failures -> their status.
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Please check the highlighted fields.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our end.' });
  });

  return app;
}
