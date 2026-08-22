import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AcceptInvite, Login, RegisterSchool } from './screens/Auth';
import { Dashboard } from './screens/Dashboard';
import { Kiosk } from './screens/Kiosk';
import { CheckInFlow } from './screens/CheckInFlow';
import { BoardLink } from './screens/BoardLink';
import { useAuth } from './lib/auth-context';

/** Gate for staff routes. Board routes are NOT wrapped in this: a wall-mounted
 *  board authenticates with its own classroom-scoped device credential and
 *  never holds a staff session. */
function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="center-page">
        <h2 className="display">Waking up your buddy…</h2>
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterSchool />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />

      {/* Board routes carry a device credential, never a staff session, so
          they deliberately sit outside <Protected>. */}
      <Route path="/board/link" element={<BoardLink />} />
      <Route path="/board/link/:token" element={<BoardLink />} />
      <Route path="/board" element={<Kiosk />} />
      <Route path="/board/check-in/:studentId" element={<CheckInFlow />} />

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/kiosk/:classroomId" element={<Protected><Kiosk /></Protected>} />
      <Route
        path="/kiosk/:classroomId/check-in/:studentId"
        element={<Protected><CheckInFlow /></Protected>}
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
