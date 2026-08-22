import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { clampScore, moodFor } from '../lib/moods';

/**
 * The Winding Vine check-in control.
 *
 * Implemented as a pointer-captured custom control rather than an <input
 * type=range> so the entire 130-200px band is live. On a wall-mounted
 * smartboard a child's hand lands imprecisely and often drifts off the element
 * mid-drag; `setPointerCapture` keeps every subsequent move routed here, so
 * there are no dead zones and no dropped drags.
 *
 * The five leaf stops and the knob are positioned by measuring the rendered
 * path with `getPointAtLength` rather than by re-deriving the curve in JS.
 * Hand-computed approximations drift off a bezier; measuring the real geometry
 * means the knob always rides exactly on the vine, at any screen size.
 *
 * Keyboard access is preserved via the slider role for teachers testing setup.
 */

export interface VineSliderProps {
  value: number;              // 1..5
  onChange: (score: number) => void;
  /** Fired only when the snapped score actually changes — the audio/haptic trigger. */
  onSettle?: (score: number) => void;
}

/** A pronounced S-wave. Authored in a 0..100 box that is stretched to fit. */
const VINE_PATH = 'M 6 50 C 24 -14, 38 114, 52 50 C 64 -6, 80 106, 94 50';

const STOPS = [1, 2, 3, 4, 5];

export function VineSlider({ value, onChange, onSettle }: VineSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const lastScore = useRef(value);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);

  // Measure the five stops directly off the rendered geometry.
  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    setPoints(STOPS.map((_, i) => {
      const p = path.getPointAtLength((i / (STOPS.length - 1)) * total);
      return { x: p.x, y: p.y };
    }));
  }, []);

  // Re-measure if the board is rotated or the window resized.
  useEffect(() => {
    const onResize = () => {
      const path = pathRef.current;
      if (!path) return;
      const total = path.getTotalLength();
      setPoints(STOPS.map((_, i) => {
        const p = path.getPointAtLength((i / (STOPS.length - 1)) * total);
        return { x: p.x, y: p.y };
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const scoreFromEvent = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    // Inset matches the path's own 6%..94% span, so both extremes are reachable.
    const inset = rect.width * 0.06;
    const usable = Math.max(rect.width - inset * 2, 1);
    const ratio = (clientX - rect.left - inset) / usable;
    return clampScore(1 + Math.min(1, Math.max(0, ratio)) * 4);
  }, [value]);

  const apply = useCallback((clientX: number) => {
    const next = scoreFromEvent(clientX);
    if (next !== lastScore.current) {
      lastScore.current = next;
      onChange(next);
      onSettle?.(next);
    }
  }, [scoreFromEvent, onChange, onSettle]);

  const handleDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    apply(ev.clientX);
  };

  const handleMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
    apply(ev.clientX);
  };

  const handleUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
  };

  const handleKey = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? 1
      : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -1 : 0;
    if (!delta) return;
    ev.preventDefault();
    const next = clampScore(value + delta);
    if (next !== value) {
      lastScore.current = next;
      onChange(next);
      onSettle?.(next);
    }
  };

  const mood = moodFor(value);
  const knob = points[value - 1];
  const droop = value <= 2;   // leaves wilt when the child is tired or sad

  return (
    <div
      ref={ref}
      className="vine"
      role="slider"
      aria-label="How are you feeling today?"
      aria-valuemin={1}
      aria-valuemax={5}
      aria-valuenow={value}
      aria-valuetext={mood.label}
      tabIndex={0}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onKeyDown={handleKey}
    >
      {/* viewBox is stretched to the band, so 1 unit = 1% of the box on each
          axis and measured path points convert straight to percentages. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {/* the channel: a thick dark under-stroke reads as a carved groove */}
        <path ref={pathRef} d={VINE_PATH}
              fill="none" stroke="#2b2338" strokeWidth="30" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
        <path d={VINE_PATH}
              fill="none" stroke="#4faa2e" strokeWidth="23" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
        <path d={VINE_PATH}
              fill="none" stroke="#7ed957" strokeWidth="13" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Leaves are HTML so they keep their shape in the stretched box. */}
      {points.map((p, i) => {
        const reached = STOPS[i] <= value;
        return (
          <motion.div
            key={STOPS[i]}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: 'clamp(18px, 2.4vw, 28px)',
              height: 'clamp(30px, 4vw, 46px)',
              marginLeft: 'calc(clamp(18px, 2.4vw, 28px) / -2)',
              marginTop: 'calc(clamp(30px, 4vw, 46px) / -2)',
              borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
              border: '4px solid #2b2338',
              pointerEvents: 'none',
            }}
            animate={{
              backgroundColor: reached ? '#9ff07a' : '#cfe8c2',
              rotate: droop ? 66 : 16,
              y: droop ? 12 : 0,
              opacity: droop && !reached ? 0.55 : 1,
            }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: i * 0.03 }}
          />
        );
      })}

      {/* the knob: a big berry the child's whole fingertip can own */}
      {knob && (
        <motion.div
          className="vine__knob"
          animate={{ left: `${knob.x}%`, top: `${knob.y}%`, backgroundColor: mood.color }}
          transition={{ type: 'spring', stiffness: 480, damping: 24 }}
          style={{
            position: 'absolute',
            width: 'clamp(74px, 10vw, 108px)',
            aspectRatio: '1',
            borderRadius: '50%',
            border: '5px solid #2b2338',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.6), transparent 58%)',
          }}
        />
      )}
    </div>
  );
}
