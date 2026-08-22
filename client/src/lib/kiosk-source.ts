import { api, type TodayStudent } from './api';

/**
 * The kiosk screens run under two different credentials:
 *
 *  - **board**: a wall-mounted device holding its own classroom-scoped token.
 *    The classroom is implied by the credential and never appears in a URL.
 *  - **staff**: a teacher previewing the flow from their own dashboard, on
 *    their own signed-in machine, with the classroom in the URL.
 *
 * Rather than branch inside the screens, each mode supplies the same small
 * interface. The screens then have no idea which credential is in play.
 */

export type KioskMode = 'board' | 'staff';

export interface KioskSource {
  mode: KioskMode;
  loadToday(): Promise<{ classroomName: string; students: TodayStudent[] }>;
  submitCheckin(payload: {
    studentId: string; moodScore: number; furColor: string; hat: string;
  }): Promise<void>;
  /** Where the flow returns to when a child finishes. */
  rosterPath: string;
  checkInPath(studentId: string): string;
}

function boardSource(): KioskSource {
  return {
    mode: 'board',
    async loadToday() {
      const [session, today] = await Promise.all([
        api.get<{ classroom: { name: string } }>('/kiosk/session'),
        api.get<{ students: TodayStudent[] }>('/kiosk/today'),
      ]);
      return { classroomName: session.classroom.name, students: today.students };
    },
    submitCheckin: (payload) => api.post('/kiosk/checkins', payload).then(() => undefined),
    rosterPath: '/board',
    checkInPath: (id) => `/board/check-in/${id}`,
  };
}

function staffSource(classroomId: string): KioskSource {
  return {
    mode: 'staff',
    async loadToday() {
      const d = await api.get<{ classroom: { name: string }; students: TodayStudent[] }>(
        `/checkins/classroom/${classroomId}/today`,
      );
      return { classroomName: d.classroom.name, students: d.students };
    },
    submitCheckin: (payload) => api.post('/checkins', payload).then(() => undefined),
    rosterPath: `/kiosk/${classroomId}`,
    checkInPath: (id) => `/kiosk/${classroomId}/check-in/${id}`,
  };
}

/** `classroomId` present means a staff preview; absent means a linked board. */
export const kioskSource = (classroomId?: string): KioskSource =>
  classroomId ? staffSource(classroomId) : boardSource();

export interface DeviceRow {
  id: string;
  label: string;
  classroomId: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}
