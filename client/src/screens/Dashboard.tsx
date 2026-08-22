import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { api, type Classroom } from '../lib/api';
import { MeadowView } from './Meadow';
import { ComplianceView } from './Compliance';
import { RosterView } from './Roster';
import { AdminView } from './Admin';

type Tab = 'meadow' | 'compliance' | 'roster' | 'school';

/**
 * The teacher's home. A classroom picker sits above every tab, because the
 * active classroom is the scope for everything below it — and the API refuses
 * any classroom this teacher does not own, so the picker can only ever offer
 * rooms they are allowed to see.
 */
export function Dashboard() {
  const { user, school, logout } = useAuth();
  const navigate = useNavigate();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('meadow');
  const [error, setError] = useState<string | null>(null);

  const loadClassrooms = useCallback(async () => {
    try {
      const { classrooms: rooms } = await api.get<{ classrooms: Classroom[] }>('/classrooms');
      setClassrooms(rooms);
      setActiveId((prev) => (prev && rooms.some((r) => r.id === prev) ? prev : rooms[0]?.id ?? null));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { void loadClassrooms(); }, [loadClassrooms]);

  const createClassroom = async () => {
    const name = window.prompt('Name this classroom (for example, "Butterfly Room")');
    if (!name?.trim()) return;
    try {
      const { classroom } = await api.post<{ classroom: Classroom }>('/classrooms', { name: name.trim() });
      await loadClassrooms();
      setActiveId(classroom.id);
      setTab('roster');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const active = classrooms.find((c) => c.id === activeId) ?? null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'meadow', label: 'Classroom Meadow' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'roster', label: 'Roster' },
    ...(user?.role === 'admin' ? [{ id: 'school' as Tab, label: 'School & Staff' }] : []),
  ];

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="display" style={{ fontSize: '1.6rem' }}>{school?.name ?? 'My Day Buddy'}</h1>
        <span className="code-chip">{school?.state}</span>
        <div className="spacer" />
        <span className="muted">{user?.fullName} · {user?.role}</span>
        <button className="clay-btn clay-btn--paper" onClick={() => logout().then(() => navigate('/login'))}>
          Sign out
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="topbar">
        <label className="row" style={{ gap: '0.5rem' }}>
          <span style={{ fontFamily: 'var(--font-round)', fontWeight: 800 }}>Classroom</span>
          <select
            value={activeId ?? ''}
            onChange={(e) => setActiveId(e.target.value)}
            style={{
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: '1rem',
              padding: '0.6em 0.9em', border: '4px solid var(--ink)', borderRadius: 'var(--radius-sm)',
              background: '#fff', color: 'var(--ink)',
            }}
          >
            {classrooms.length === 0 && <option value="">No classrooms yet</option>}
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{user?.role === 'admin' ? ` — ${c.teacher_name}` : ''} ({c.student_count})
              </option>
            ))}
          </select>
        </label>
        <button className="clay-btn clay-btn--grass" onClick={createClassroom}>+ Classroom</button>
        <div className="spacer" />
        {active && (
          <button className="clay-btn clay-btn--berry" onClick={() => navigate(`/kiosk/${active.id}`)}>
            ▶ Start check-in kiosk
          </button>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: '1.4rem' }} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} className="tab" role="tab" aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {!active && tab !== 'school' && (
        <div className="clay" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 className="display">Create your first classroom</h2>
          <p className="muted">Then add children to it and open the check-in kiosk.</p>
          <button className="clay-btn clay-btn--grass" onClick={createClassroom}>+ Classroom</button>
        </div>
      )}

      {active && tab === 'meadow' && <MeadowView classroom={active} />}
      {active && tab === 'compliance' && <ComplianceView classroom={active} state={school?.state ?? ''} />}
      {active && tab === 'roster' && <RosterView classroom={active} onChanged={loadClassrooms} />}
      {tab === 'school' && <AdminView />}
    </div>
  );
}
