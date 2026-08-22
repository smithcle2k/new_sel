import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../lib/db.js';
import { h } from '../lib/async.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError, scopedClassroom, scopedStudent, visibleClassrooms } from '../lib/scope.js';

export const classroomRouter = Router();
classroomRouter.use(requireAuth);

const HATS = ['none', 'pirate', 'party', 'crown'];

classroomRouter.get('/', h(async (req, res) => {
  res.json({ classrooms: await visibleClassrooms(req.user) });
}));

classroomRouter.post('/', h(async (req, res) => {
  const { name, teacherId } = z
    .object({ name: z.string().trim().min(1).max(80), teacherId: z.string().optional() })
    .parse(req.body);

  // Only an admin may hand a room to somebody else; a teacher always owns their own.
  let owner = req.user.id;
  if (teacherId && teacherId !== req.user.id) {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Only administrators can assign classrooms.');
    const t = await get('SELECT id FROM users WHERE id = ? AND school_id = ?',
      [teacherId, req.user.school_id]);
    if (!t) throw new HttpError(404, 'Teacher not found in this school.');
    owner = teacherId;
  }

  const id = nanoid();
  await run('INSERT INTO classrooms (id, school_id, teacher_id, name) VALUES (?, ?, ?, ?)',
    [id, req.user.school_id, owner, name]);
  res.status(201).json({ classroom: await scopedClassroom(req.user, id) });
}));

classroomRouter.patch('/:id', h(async (req, res) => {
  await scopedClassroom(req.user, req.params.id);
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
  await run('UPDATE classrooms SET name = ? WHERE id = ?', [name, req.params.id]);
  res.json({ classroom: await scopedClassroom(req.user, req.params.id) });
}));

classroomRouter.delete('/:id', h(async (req, res) => {
  await scopedClassroom(req.user, req.params.id);
  await run('DELETE FROM classrooms WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* -------------------------------- roster -------------------------------- */

classroomRouter.get('/:id/students', h(async (req, res) => {
  const classroom = await scopedClassroom(req.user, req.params.id);
  const students = await all(
    `SELECT id, first_name, last_initial, fur_color, hat, created_at
       FROM students WHERE classroom_id = ? AND archived = 0
       ORDER BY first_name`,
    [classroom.id],
  );
  res.json({ classroom, students });
}));

const studentSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastInitial: z.string().trim().max(2).default(''),
  furColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b7fd4'),
  hat: z.enum(HATS).default('none'),
});

classroomRouter.post('/:id/students', h(async (req, res) => {
  const classroom = await scopedClassroom(req.user, req.params.id);
  const input = studentSchema.parse(req.body);
  const id = nanoid();
  await run(
    `INSERT INTO students (id, classroom_id, school_id, first_name, last_initial, fur_color, hat)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, classroom.id, classroom.school_id, input.firstName, input.lastInitial, input.furColor, input.hat],
  );
  res.status(201).json({ student: await get('SELECT * FROM students WHERE id = ?', [id]) });
}));

classroomRouter.patch('/students/:studentId', h(async (req, res) => {
  const student = await scopedStudent(req.user, req.params.studentId);
  const input = studentSchema.partial().parse(req.body);
  const fields = {
    first_name: input.firstName, last_initial: input.lastInitial,
    fur_color: input.furColor, hat: input.hat,
  };
  for (const [col, val] of Object.entries(fields)) {
    if (val !== undefined) await run(`UPDATE students SET ${col} = ? WHERE id = ?`, [val, student.id]);
  }
  res.json({ student: await get('SELECT * FROM students WHERE id = ?', [student.id]) });
}));

classroomRouter.delete('/students/:studentId', h(async (req, res) => {
  const student = await scopedStudent(req.user, req.params.studentId);
  await run('UPDATE students SET archived = 1 WHERE id = ?', [student.id]);
  res.json({ ok: true });
}));
