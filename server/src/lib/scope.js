/**
 * Tenant isolation ("row-level security") layer.
 *
 * libSQL has no native RLS, so isolation is enforced here instead: no route
 * handler builds a query against classrooms, students or check-ins directly.
 * It resolves the resource through one of these guards first, and every guard
 * filters on the caller's own `school_id` — and, for teachers, on their own
 * `teacher_id`. A teacher therefore cannot read or write another teacher's
 * classroom, and nobody can reach across schools, even with a guessed id.
 *
 * Each guard returns the row, or throws an `HttpError` the error middleware
 * renders as 403/404. Missing and forbidden both surface as 404 to avoid
 * leaking the existence of another tenant's records.
 */
import { all, get } from './db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Resolve a classroom the caller is allowed to act on. */
export async function scopedClassroom(user, classroomId) {
  const row = await get(
    'SELECT * FROM classrooms WHERE id = ? AND school_id = ?',
    [classroomId, user.school_id],
  );
  if (!row) throw new HttpError(404, 'Classroom not found.');
  // Admins see the whole school; teachers only their own rooms.
  if (user.role !== 'admin' && row.teacher_id !== user.id) {
    throw new HttpError(404, 'Classroom not found.');
  }
  return row;
}

/** Resolve a student, via the classroom guard so the same rules apply. */
export async function scopedStudent(user, studentId) {
  const row = await get(
    'SELECT * FROM students WHERE id = ? AND school_id = ?',
    [studentId, user.school_id],
  );
  if (!row) throw new HttpError(404, 'Student not found.');
  await scopedClassroom(user, row.classroom_id);
  return row;
}

/** Every classroom the caller may list. */
export async function visibleClassrooms(user) {
  const base = `SELECT c.*, u.full_name AS teacher_name,
                       (SELECT COUNT(*) FROM students s
                         WHERE s.classroom_id = c.id AND s.archived = 0) AS student_count
                  FROM classrooms c
                  JOIN users u ON u.id = c.teacher_id
                 WHERE c.school_id = ?`;
  if (user.role === 'admin') {
    return all(`${base} ORDER BY c.name`, [user.school_id]);
  }
  return all(`${base} AND c.teacher_id = ? ORDER BY c.name`, [user.school_id, user.id]);
}
