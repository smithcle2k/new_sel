import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Raccoon } from '../components/Raccoon';
import { FlowerGlyph } from '../components/Flower';
import { api, type Classroom, type MeadowChild } from '../lib/api';
import { moodFor } from '../lib/moods';

/**
 * The Classroom Meadow: the whole class's week growing side by side. It reads
 * as one shared garden rather than a chart, which is what makes it safe to
 * project in the room — a child sees flowers, a teacher sees a trend line.
 */
export function MeadowView({ classroom }: { classroom: Classroom }) {
  const [children, setChildren] = useState<MeadowChild[]>([]);
  const [selected, setSelected] = useState<MeadowChild | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ meadow: MeadowChild[] }>(`/reports/classroom/${classroom.id}/meadow?days=7`)
      .then((d) => alive && setChildren(d.meadow))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [classroom.id]);

  if (loading) return <p className="muted">Growing the meadow…</p>;
  if (error) return <div className="alert">{error}</div>;

  return (
    <>
      <div className="meadow">
        {children.length === 0 && (
          <p className="display" style={{ fontSize: '1.3rem' }}>
            No children in this classroom yet.
          </p>
        )}

        {children.map((child, i) => (
          <motion.button
            key={child.id}
            className="meadow__plot"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 240, damping: 20 }}
            onClick={() => setSelected(child)}
          >
            <div className="meadow__row">
              {child.blooms.length === 0
                ? <span className="muted" style={{ fontSize: '0.85rem' }}>not planted</span>
                : child.blooms.map((b) => (
                    <FlowerGlyph key={b.checkin_date} bloom={b.bloom} size={30} />
                  ))}
            </div>
            <span className="meadow__name">{child.first_name}</span>
          </motion.button>
        ))}
      </div>

      {selected && (
        <div className="popover-scrim" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <motion.div
            className="popover"
            initial={{ scale: 0.7, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <Raccoon
                furColor={selected.fur_color}
                hat={selected.hat}
                score={Math.round(selected.averageMood ?? 4)}
                size={190}
              />
            </div>
            <h2 className="display" style={{ fontSize: '1.7rem' }}>
              Hi, I'm {selected.first_name}'s buddy!
            </h2>
            <p className="muted">
              {selected.averageMood === null
                ? 'No check-ins yet this week.'
                : <>This week averaged <strong>{moodFor(Math.round(selected.averageMood)).label}</strong>
                   {' '}({selected.averageMood.toFixed(1)} of 5) across {selected.blooms.length} check-ins.</>}
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              {selected.blooms.map((b) => (
                <div key={b.checkin_date} style={{ textAlign: 'center' }}>
                  <FlowerGlyph bloom={b.bloom} size={30} />
                  <div className="muted" style={{ fontSize: '0.72rem' }}>{b.checkin_date.slice(5)}</div>
                </div>
              ))}
            </div>
            <button className="clay-btn clay-btn--block clay-btn--grape" style={{ marginTop: '1.2rem' }}
                    onClick={() => setSelected(null)}>
              Close
            </button>
          </motion.div>
        </div>
      )}
    </>
  );
}
