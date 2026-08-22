import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Raccoon } from '../components/Raccoon';
import { FlowerGlyph } from '../components/Flower';
import { api, type Classroom, type TodayStudent } from '../lib/api';
import { playPop, unlockAudio } from '../lib/audio';
import { tapHaptic } from '../lib/haptics';

/**
 * The kiosk roster. A teacher leaves this open on the smartboard all morning;
 * each child taps their own buddy to begin. Children who already checked in
 * show their bloom instead, so nobody double-enters and everyone can see the
 * class filling up.
 */
export function Kiosk() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<TodayStudent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ classroom: Classroom; students: TodayStudent[] }>(
      `/checkins/classroom/${classroomId}/today`,
    )
      .then((d) => { if (alive) { setClassroom(d.classroom); setStudents(d.students); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [classroomId]);

  const open = (id: string) => {
    unlockAudio();   // the first tap of the day unlocks WebAudio for the flow
    playPop();
    tapHaptic();
    navigate(`/kiosk/${classroomId}/check-in/${id}`);
  };

  const done = students.filter((s) => s.mood_score !== null).length;

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="display" style={{ fontSize: '1.7rem' }}>
          {classroom?.name ?? 'Classroom'}
        </h1>
        <span className="muted">{done} of {students.length} checked in today</span>
        <div className="spacer" />
        <button className="clay-btn clay-btn--paper" onClick={() => navigate('/dashboard')}>
          Teacher view
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {!error && students.length === 0 && (
        <div className="clay" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 className="display">No children on this roster yet</h2>
          <p className="muted">Add children from the teacher dashboard to start checking in.</p>
        </div>
      )}

      <div className="child-grid">
        {students.map((s) => (
          <button
            key={s.id}
            className="child-tile"
            data-done={s.mood_score !== null}
            onClick={() => open(s.id)}
          >
            <Raccoon furColor={s.fur_color} hat={s.hat} score={s.mood_score ?? 4} size={128} animated={false} />
            <span className="child-tile__name">{s.first_name}</span>
            {s.bloom
              ? <FlowerGlyph bloom={s.bloom} size={30} />
              : <span className="muted" aria-hidden="true">•</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
