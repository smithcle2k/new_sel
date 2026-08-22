import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AcceptInvite, Login, RegisterSchool } from './screens/Auth';
import { Dashboard } from './screens/Dashboard';
import { Kiosk } from './screens/Kiosk';
import { CheckInFlow } from './screens/CheckInFlow';
import { useAuth } from './lib/auth-context';

/** Gate for every staff route; the kiosk sits behind it too, since a teacher
 *  signs in once in the morning and leaves the board on the roster screen. */
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
