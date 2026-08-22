import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Raccoon } from '../components/Raccoon';
import { api, type School, type StateOption, type User } from '../lib/api';
import { useAuth } from '../lib/auth-context';

type Session = { user: User; school: School };

function AuthShell({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="center-page">
      <div className="clay" style={{ padding: 'clamp(1.5rem, 4vw, 2.6rem)', width: 'min(560px, 100%)' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: '0.6rem' }}>
          <Raccoon furColor="#8b7fd4" hat="crown" score={5} size={140} />
        </div>
        <h1 className="display" style={{ fontSize: '2rem', textAlign: 'center' }}>{title}</h1>
        {subtitle && <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------- login --------------------------------- */

export function Login() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.post<Session>('/auth/login', { email, password }));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="My Day Buddy" subtitle="Sign in to your classroom">
      <form onSubmit={submit}>
        {error && <div className="alert">{error}</div>}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} autoComplete="username" required
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} autoComplete="current-password" required
                 onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="clay-btn clay-btn--block clay-btn--grape" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginBottom: 0 }}>
        <Link to="/register" className="muted">Register a new school</Link>
      </p>
    </AuthShell>
  );
}

/* ---------------------------- school registration ------------------------ */

export function RegisterSchool() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [states, setStates] = useState<StateOption[]>([]);
  const [form, setForm] = useState({
    schoolName: '', state: 'NY', fullName: '', email: '', password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ states: StateOption[] }>('/auth/states')
      .then((d) => setStates(d.states))
      .catch(() => setError('Could not load the list of supported states.'));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.post<Session>('/auth/register-school', form));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chosen = states.find((s) => s.code === form.state);

  return (
    <AuthShell title="Register your school" subtitle="You will become its administrator">
      <form onSubmit={submit}>
        {error && <div className="alert">{error}</div>}
        <label className="field">
          <span>School name</span>
          <input value={form.schoolName} required minLength={2} onChange={set('schoolName')} />
        </label>
        <label className="field">
          <span>Home state</span>
          <select value={form.state} onChange={set('state')}>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
        {/* The state choice is what wires this school to its compliance codes. */}
        {chosen && (
          <p className="muted" style={{ marginTop: '-0.6rem' }}>
            Reports will cite <strong>{chosen.framework}</strong>.
          </p>
        )}
        <label className="field">
          <span>Your name</span>
          <input value={form.fullName} required minLength={2} onChange={set('fullName')} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} required autoComplete="username" onChange={set('email')} />
        </label>
        <label className="field">
          <span>Password (8+ characters)</span>
          <input type="password" value={form.password} required minLength={8}
                 autoComplete="new-password" onChange={set('password')} />
        </label>
        <button className="clay-btn clay-btn--block clay-btn--grass" disabled={busy}>
          {busy ? 'Creating…' : 'Create school'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginBottom: 0 }}>
        <Link to="/login" className="muted">I already have an account</Link>
      </p>
    </AuthShell>
  );
}

/* ------------------------------ invite accept ---------------------------- */

export function AcceptInvite() {
  const { token } = useParams();
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{ email: string; role: string; school_name: string } | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ invite: any }>(`/auth/invites/${token}`)
      .then((d) => setInvite(d.invite))
      .catch((e) => setError(e.message));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.post<Session>(`/auth/invites/${token}/accept`, { fullName, password }));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !invite) {
    return (
      <AuthShell title="Invitation problem">
        <div className="alert">{error}</div>
        <Link to="/login" className="clay-btn clay-btn--block" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  if (!invite) return <AuthShell title="Checking your invitation…">{null}</AuthShell>;

  return (
    <AuthShell title={`Join ${invite.school_name}`} subtitle={`Invited as ${invite.role} · ${invite.email}`}>
      <form onSubmit={submit}>
        {error && <div className="alert">{error}</div>}
        <label className="field">
          <span>Your name</span>
          <input value={fullName} required minLength={2} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          <span>Choose a password (8+ characters)</span>
          <input type="password" value={password} required minLength={8}
                 autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="clay-btn clay-btn--block clay-btn--grass" disabled={busy}>
          {busy ? 'Joining…' : 'Join the school'}
        </button>
      </form>
    </AuthShell>
  );
}
