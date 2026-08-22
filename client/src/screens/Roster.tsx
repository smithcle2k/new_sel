import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Raccoon } from '../components/Raccoon';
import { api, type Classroom, type HatId, type Student } from '../lib/api';

const FURS = ['#8b7fd4', '#ff6b9d', '#43b3f5', '#7ed957', '#ffc93c', '#ff8a5c', '#b0b7c3', '#a9714b'];
const HATS: HatId[] = ['none', 'pirate', 'party', 'crown'];

/** Roster management: register children and pre-set their companion. */
export function RosterView({ classroom, onChanged }: { classroom: Classroom; onChanged: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastInitial: '', furColor: FURS[0], hat: 'none' as HatId });

  const load = useCallback(async () => {
    try {
      const { students: list } = await api.get<{ students: Student[] }>(`/classrooms/${classroom.id}/students`);
      setStudents(list);
    } catch (e: any) {
      setError(e.message);
    }
  }, [classroom.id]);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/classrooms/${classroom.id}/students`, form);
      setForm({ ...form, firstName: '', lastInitial: '' });
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const remove = async (s: Student) => {
    if (!window.confirm(`Remove ${s.first_name} from ${classroom.name}? Their past check-ins stay in reports.`)) return;
    try {
      await api.del(`/classrooms/students/${s.id}`);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const cycleHat = async (s: Student) => {
    const next = HATS[(HATS.indexOf(s.hat) + 1) % HATS.length];
    try {
      await api.patch(`/classrooms/students/${s.id}`, { hat: next });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}

      <form className="topbar" style={{ marginBottom: 0, alignItems: 'flex-end' }} onSubmit={add}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>First name</span>
          <input value={form.firstName} required
                 onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </label>
        <label className="field" style={{ marginBottom: 0, maxWidth: 110 }}>
          <span>Last initial</span>
          <input value={form.lastInitial} maxLength={2}
                 onChange={(e) => setForm({ ...form, lastInitial: e.target.value })} />
        </label>
        <div className="row" style={{ gap: '0.4rem' }}>
          {FURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Fur ${c}`}
              aria-pressed={form.furColor === c}
              onClick={() => setForm({ ...form, furColor: c })}
              style={{
                width: 36, height: 36, borderRadius: '50%', background: c, cursor: 'pointer',
                border: '4px solid var(--ink)',
                transform: form.furColor === c ? 'scale(1.22)' : 'none',
              }}
            />
          ))}
        </div>
        <button className="clay-btn clay-btn--grass">+ Add child</button>
      </form>

      <div className="child-grid">
        {students.map((s) => (
          <div key={s.id} className="child-tile" style={{ cursor: 'default' }}>
            <Raccoon furColor={s.fur_color} hat={s.hat} score={4} size={120} animated={false} />
            <span className="child-tile__name">{s.first_name} {s.last_initial}</span>
            <div className="row" style={{ gap: '0.4rem', justifyContent: 'center' }}>
              <button className="clay-btn clay-btn--paper" style={{ fontSize: '0.8rem', padding: '0.45em 0.8em' }}
                      onClick={() => cycleHat(s)}>
                Hat: {s.hat}
              </button>
              <button className="clay-btn clay-btn--berry" style={{ fontSize: '0.8rem', padding: '0.45em 0.8em' }}
                      onClick={() => remove(s)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {students.length === 0 && <p className="muted">No children registered in this classroom yet.</p>}
      </div>
    </div>
  );
}
