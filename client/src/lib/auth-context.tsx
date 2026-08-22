import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type School, type User } from './api';

interface AuthValue {
  user: User | null;
  school: School | null;
  loading: boolean;
  setSession: (s: { user: User; school: School }) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      // Always 200; `user` is null when there is no session.
      const me = await api.get<{ user: User | null; school: School | null }>('/auth/me');
      setUser(me.user);
      setSchool(me.school);
    } catch {
      setUser(null);
      setSchool(null);   // network failure — treat as signed out
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const value = useMemo<AuthValue>(() => ({
    user, school, loading,
    setSession: ({ user: u, school: s }) => { setUser(u); setSchool(s); setLoading(false); },
    refresh,
    logout: async () => {
      await api.post('/auth/logout');
      setUser(null);
      setSchool(null);
    },
  }), [user, school, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
