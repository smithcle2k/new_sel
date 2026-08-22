import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { syncStandards } from './lib/db.js';
import { HttpError } from './lib/scope.js';
import { authRouter } from './routes/auth.js';
import { classroomRouter } from './routes/classrooms.js';
import { checkinRouter } from './routes/checkins.js';
import { reportRouter } from './routes/reports.js';

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/classrooms', classroomRouter);
app.use('/api/checkins', checkinRouter);
app.use('/api/reports', reportRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

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

const count = syncStandards();
app.listen(PORT, () => {
  console.log(`My Day Buddy API listening on http://localhost:${PORT}`);
  console.log(`Compliance engine ready: ${count} state indicator mappings loaded.`);
});
