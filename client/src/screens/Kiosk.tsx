import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Raccoon } from '../components/Raccoon';
import { FlowerGlyph } from '../components/Flower';
import { api, type TodayStudent } from '../lib/api';
import { kioskSource } from '../lib/kiosk-source';
import { playPop, unlockAudio } from '../lib/audio';
import { tapHaptic } from '../lib/haptics';

/**
 * The kiosk roster. A board sits on this screen all morning; each child taps
 * their own buddy to begin. Children who already checked in show their bloom
 * instead, so nobody double-enters and everyone can see the class filling up.
 *
 * Works identically on a linked board and in a teacher's preview — the source
 * decides which credential is in play.
 */
export function Kiosk() {
  const { classroomId } = useParams();      // absent on a linked board
  const navigate = useNavigate();
  const source = useMemo(() => kioskSource(classroomId), [classroomId]);

  const [classroomName, setClassroomName] = useState<string>('');
  const [students, setStudents] = useState<TodayStudent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    source.loadToday()
      .then((d) => { if (alive) { setClassroomName(d.classroomName); setStudents(d.students); } })
      .catch((e) => {
        if (!alive) return;
        // A board whose credential was revoked or expired goes back to the
        // link screen; there is no sign-in for it to fall back to.
        if (source.mode === 'board' && e.status === 401) {
          navigate('/board/link', { replace: true, state: { expired: true } });
          return;
        }
        setError(e.message);
      });
    return () => { alive = false; };
  }, [source, navigate]);

  const open = (id: string) => {
    unlockAudio();   // the first tap of the day unlocks WebAudio for the flow
    playPop();
    tapHaptic();
    navigate(source.checkInPath(id));
  };

  /** Unlink this board: clears the device cookie and returns to the link screen. */
  const release = async () => {
    await api.post('/kiosk/release').catch(() => undefined);
    navigate('/board/link');
  };

  const done = students.filter((s) => s.mood_score !== null).length;

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="display" style={{ fontSize: '1.7rem' }}>
          {classroomName || 'Classroom'}
        </h1>
        <span className="muted">{done} of {students.length} checked in today</span>
        <div className="spacer" />
        {source.mode === 'staff' ? (
          <button className="clay-btn clay-btn--paper" onClick={() => navigate('/dashboard')}>
            Teacher view
          </button>
        ) : (
          /* A board holds no staff session, so there is nothing here to
             navigate *into* — only the option to unlink the device. */
          <button className="clay-btn clay-btn--paper" onClick={release}>
            Unlink this board
          </button>
        )}
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
