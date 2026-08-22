import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Invite, type StaffMember, type StateOption } from '../lib/api';
import { useAuth } from '../lib/auth-context';

/**
 * Administrator-only: school profile, staff and teacher invitations.
 *
 * Invite links are surfaced here for the administrator to copy and send
 * themselves — the app deliberately does not send mail on their behalf.
 */
export function AdminView() {
  const { school, refresh } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, i, st] = await Promise.all([
        api.get<{ staff: StaffMember[] }>('/auth/staff'),
        api.get<{ invites: Invite[] }>('/auth/invites'),
        api.get<{ states: StateOption[] }>('/auth/states'),
      ]);
      setStaff(s.staff);
      setInvites(i.invites);
      setStates(st.states);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await api.post('/auth/invites', { email, role: 'teacher' });
      setEmail('');
      setNotice('Invitation created. Copy its link below and send it to the teacher.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const changeState = async (state: string) => {
    setNotice(null);
    try {
      await api.patch('/auth/school', { state });
      await refresh();
      // Reports re-join against the new state immediately; no data is rewritten.
      setNotice('Home state updated. All reports now cite the new state\'s standards.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const linkFor = (t: string) => `${window.location.origin}/invite/${t}`;

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert--good">{notice}</div>}

      <div className="clay" style={{ padding: '1.6rem' }}>
        <h2 className="display" style={{ marginBottom: '0.8rem' }}>School profile</h2>
        <label className="field" style={{ maxWidth: 420 }}>
          <span>Home state — this drives every compliance citation</span>
          <select value={school?.state ?? ''} onChange={(e) => changeState(e.target.value)}>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name} — {s.framework}</option>)}
          </select>
        </label>
      </div>

      <div className="clay" style={{ padding: '1.6rem' }}>
        <h2 className="display" style={{ marginBottom: '0.8rem' }}>Invite a teacher</h2>
        <form className="row" onSubmit={invite}>
          <input
            type="email" value={email} required placeholder="teacher@school.org"
            onChange={(e) => setEmail(e.target.value)}
            style={{
              flex: 1, minWidth: 240, fontWeight: 700, fontSize: '1rem', padding: '0.75em 1em',
              border: '4px solid var(--ink)', borderRadius: 'var(--radius-sm)', color: 'var(--ink)',
            }}
          />
          <button className="clay-btn clay-btn--grass">Send invitation</button>
        </form>

        {invites.length > 0 && (
          <div className="table-wrap" style={{ marginTop: '1.2rem' }}>
            <table>
              <thead>
                <tr><th>Email</th><th>Role</th><th>Status</th><th>Invitation link</th></tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 800 }}>{i.email}</td>
                    <td>{i.role}</td>
                    <td>{i.accepted_at ? 'Accepted' : `Pending until ${i.expires_at.slice(0, 10)}`}</td>
                    <td>
                      {i.accepted_at ? <span className="muted">—</span> : (
                        <button
                          className="clay-btn clay-btn--paper"
                          style={{ fontSize: '0.8rem', padding: '0.4em 0.8em' }}
                          onClick={() => {
                            void navigator.clipboard?.writeText(linkFor(i.token));
                            setNotice('Invitation link copied to your clipboard.');
                          }}
                        >
                          Copy link
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="clay" style={{ padding: '1.6rem' }}>
        <h2 className="display" style={{ marginBottom: '0.8rem' }}>Staff</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 800 }}>{m.full_name}</td>
                  <td>{m.email}</td>
                  <td><span className="code-chip">{m.role}</span></td>
                  <td className="muted">{m.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
