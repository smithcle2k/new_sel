/** Thin fetch wrapper. Cookies carry the session, so every call is credentialed. */

export class ApiError extends Error {
  status: number;
  details?: { path: string; message: string }[];
  constructor(status: number, message: string, details?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let payload: any = {};
    try { payload = await res.json(); } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, payload.error || `Request failed (${res.status}).`, payload.details);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/* --------------------------------- types --------------------------------- */

export type Role = 'admin' | 'teacher';
export type HatId = 'none' | 'pirate' | 'party' | 'crown';
export type BloomId = 'sunflower' | 'sprout' | 'bluebell';

export interface User { id: string; email: string; fullName: string; role: Role; schoolId: string; }
export interface School { id: string; name: string; state: string; }
export interface StateOption { code: string; name: string; framework: string; }

export interface Classroom {
  id: string; name: string; teacher_id: string; school_id: string;
  teacher_name?: string; student_count?: number;
}

export interface Student {
  id: string; first_name: string; last_initial: string;
  fur_color: string; hat: HatId; classroom_id?: string;
}

export interface TodayStudent extends Student {
  mood_score: number | null;
  bloom: BloomId | null;
}

export interface ComplianceRow {
  date: string; student_id: string; first_name: string; last_initial: string;
  mood_score: number; mood_label: string; bloom: BloomId; state: string;
  standard_code: string | null; domain: string | null; indicator: string | null;
}

export interface MeadowChild extends Student {
  averageMood: number | null;
  blooms: { checkin_date: string; mood_score: number; bloom: BloomId }[];
}

export interface StaffMember {
  id: string; email: string; full_name: string; role: Role; created_at: string;
}

export interface Invite {
  id: string; email: string; role: Role; token: string;
  accepted_at: string | null; expires_at: string; created_at?: string;
}
