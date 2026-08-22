import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Raccoon } from '../components/Raccoon';
import { VineSlider } from '../components/VineSlider';
import { Flower } from '../components/Flower';
import { ProgressBar } from '../components/ProgressBar';
import { api, type HatId, type TodayStudent } from '../lib/api';
import { moodFor } from '../lib/moods';
import {
  playCheer, playMoodTone, playPop, playSparkle, playThud, startWaterSound, unlockAudio,
} from '../lib/audio';
import { celebrateHaptic, moodHaptic, startRumble, tapHaptic } from '../lib/haptics';

/**
 * The child-facing habit loop. Four steps, zero words:
 *   1. Customize  — investment (IKEA / endowment effect), bar opens at 40%
 *   2. Vine       — the emotional input, pre-set to 4 (smart default)
 *   3. Water      — physical effort, held down
 *   4. Bloom      — variable reward, bar completes at 100%
 */

const FUR_COLORS = [
  '#8b7fd4', '#ff6b9d', '#43b3f5', '#7ed957',
  '#ffc93c', '#ff8a5c', '#b0b7c3', '#a9714b',
];

const HATS: Exclude<HatId, 'none'>[] = ['pirate', 'party', 'crown'];

type Step = 1 | 2 | 3 | 4;
const PROGRESS: Record<Step, number> = { 1: 40, 2: 60, 3: 80, 4: 100 };

/* ------------------------------ hat previews ----------------------------- */

function HatIcon({ hat }: { hat: Exclude<HatId, 'none'> }) {
  const s = '#2b2338';
  if (hat === 'pirate') {
    return (
      <svg viewBox="0 0 100 70" aria-hidden="true">
        <path d="M 30 42 Q 50 4 70 42 Z" fill="#403a55" stroke={s} strokeWidth="5" strokeLinejoin="round" />
        <path d="M 8 48 Q 20 24 50 24 Q 80 24 92 48 Q 72 62 50 62 Q 28 62 8 48 Z"
              fill="#2f2b3d" stroke={s} strokeWidth="5" strokeLinejoin="round" />
        <circle cx="50" cy="40" r="9" fill="#fff8e7" stroke={s} strokeWidth="4" />
        <circle cx="47" cy="38" r="2" fill={s} />
        <circle cx="53" cy="38" r="2" fill={s} />
      </svg>
    );
  }
  if (hat === 'party') {
    return (
      <svg viewBox="0 0 100 70" aria-hidden="true">
        <path d="M 50 6 L 74 62 L 26 62 Z" fill="#ff6b9d" stroke={s} strokeWidth="5" strokeLinejoin="round" />
        <path d="M 32 48 Q 50 40 68 48" fill="none" stroke="#43b3f5" strokeWidth="5" strokeLinecap="round" />
        <circle cx="50" cy="6" r="7" fill="#7ed957" stroke={s} strokeWidth="4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 70" aria-hidden="true">
      <path d="M 18 58 L 18 18 L 34 34 L 50 10 L 66 34 L 82 18 L 82 58 Z"
            fill="#ffc93c" stroke={s} strokeWidth="5" strokeLinejoin="round" />
      <circle cx="50" cy="28" r="5" fill="#ff6b9d" stroke={s} strokeWidth="3" />
    </svg>
  );
}

/* -------------------------------- the flow ------------------------------- */

export function CheckInFlow() {
  const { classroomId, studentId } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState<TodayStudent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);

  const [fur, setFur] = useState('#8b7fd4');
  const [hat, setHat] = useState<HatId>('none');
  const [score, setScore] = useState(4);        // the smart default

  const [water, setWater] = useState(0);
  const [pouring, setPouring] = useState(false);
  const [bloomed, setBloomed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs so the pour loop and unmount cleanup can always reach live handles.
  const waterRef = useRef(0);
  const stopWater = useRef<(() => void) | null>(null);
  const stopRumble = useRef<(() => void) | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ students: TodayStudent[] }>(`/checkins/classroom/${classroomId}/today`)
      .then(({ students }) => {
        if (!alive) return;
        const found = students.find((s) => s.id === studentId);
        if (!found) { setLoadError('We could not find that child on this roster.'); return; }
        setStudent(found);
        setFur(found.fur_color);
        setHat(found.hat);
      })
      .catch((e) => alive && setLoadError(e.message));
    return () => { alive = false; };
  }, [classroomId, studentId]);

  // Release audio, haptics and the animation frame no matter how we leave.
  useEffect(() => () => {
    stopWater.current?.();
    stopRumble.current?.();
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
  }, []);

  const mood = moodFor(score);

  /* ------------------------------- step 1 -------------------------------- */

  const pickFur = (c: string) => { unlockAudio(); setFur(c); playPop(); tapHaptic(); };

  const toggleHat = (h: Exclude<HatId, 'none'>) => {
    unlockAudio();
    const next = hat === h ? 'none' : h;
    setHat(next);
    if (next === 'none') playPop(); else { playPop(); playThud(); }
    tapHaptic();
  };

  /* ------------------------------- step 2 -------------------------------- */

  const handleSettle = useCallback((next: number) => {
    unlockAudio();
    playMoodTone(next);
    moodHaptic(next);
  }, []);

  /* ------------------------------- step 3 -------------------------------- */

  const beginPour = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (waterRef.current >= 100 || pouring) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    unlockAudio();
    setPouring(true);
    stopWater.current = startWaterSound();
    stopRumble.current = startRumble();

    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // ~2.2s of sustained holding: long enough to feel like real effort,
      // short enough that a three-year-old's arm does not give out.
      const next = Math.min(100, waterRef.current + dt * 0.045);
      waterRef.current = next;
      setWater(next);
      if (next >= 100) { endPour(); burst(); return; }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
  };

  const endPour = () => {
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    stopWater.current?.(); stopWater.current = null;
    stopRumble.current?.(); stopRumble.current = null;
    setPouring(false);
  };

  const releasePour = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    endPour();
  };

  /* ------------------------------- step 4 -------------------------------- */

  const burst = () => {
    setBloomed(true);
    setStep(4);
    playSparkle();
    celebrateHaptic();
    window.setTimeout(playCheer, 420);

    api.post('/checkins', {
      studentId, moodScore: score, furColor: fur, hat,
    }).catch((e) => setSaveError(e.message));
  };

  const finish = () => navigate(`/kiosk/${classroomId}`);

  /* -------------------------------- render ------------------------------- */

  if (loadError) {
    return (
      <div className="center-page">
        <div className="clay" style={{ padding: '2rem', maxWidth: 460 }}>
          <div className="alert">{loadError}</div>
          <button className="clay-btn clay-btn--block" onClick={() => navigate(`/kiosk/${classroomId}`)}>
            Back to the roster
          </button>
        </div>
      </div>
    );
  }

  if (!student) {
    return <div className="center-page"><h2 className="display">Getting your buddy ready…</h2></div>;
  }

  return (
    <div className="kiosk">
      <ProgressBar percent={PROGRESS[step]} label="Check-in progress" />

      <div className="kiosk__card clay">
        <AnimatePresence mode="wait">
          {/* ------------------------- STEP 1 ------------------------- */}
          {step === 1 && (
            <motion.div
              key="step1"
              className="stack"
              style={{ alignItems: 'center', width: '100%' }}
              initial={{ opacity: 0, x: 70 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -70 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              <Raccoon furColor={fur} hat={hat} score={4} size={260} />

              <div className="swatches">
                {FUR_COLORS.map((c) => (
                  <button
                    key={c}
                    className="swatch"
                    style={{ background: c }}
                    aria-label={`Fur colour ${c}`}
                    aria-pressed={fur === c}
                    onClick={() => pickFur(c)}
                  />
                ))}
              </div>

              <div className="hat-picker">
                {HATS.map((h) => (
                  <button
                    key={h}
                    className="hat-btn"
                    aria-label={`${h} hat`}
                    aria-pressed={hat === h}
                    onClick={() => toggleHat(h)}
                  >
                    <HatIcon hat={h} />
                  </button>
                ))}
              </div>

              <button
                className="clay-btn clay-btn--lg clay-btn--grass"
                onClick={() => { unlockAudio(); tapHaptic(); playPop(); setStep(2); }}
                aria-label="Next"
              >
                ▶
              </button>
            </motion.div>
          )}

          {/* ------------------------- STEP 2 ------------------------- */}
          {step === 2 && (
            <motion.div
              key="step2"
              className="stack"
              style={{ alignItems: 'center', width: '100%' }}
              initial={{ opacity: 0, x: 70 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -70 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              <Raccoon furColor={fur} hat={hat} score={score} size={250} />
              <VineSlider value={score} onChange={setScore} onSettle={handleSettle} />
              <button
                className="clay-btn clay-btn--lg clay-btn--grass"
                onClick={() => { tapHaptic(); playPop(); setStep(3); }}
                aria-label="Plant my seed"
              >
                {/* zero-text: a seed dropping into soil */}
                <svg viewBox="0 0 60 40" width="80" height="52" aria-hidden="true">
                  <ellipse cx="30" cy="12" rx="8" ry="10" fill="#a9714b" stroke="#2b2338" strokeWidth="4" />
                  <path d="M 6 32 h 48" stroke="#7c4f31" strokeWidth="10" strokeLinecap="round" />
                  <path d="M 30 22 v 6" stroke="#2b2338" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          )}

          {/* ------------------------- STEP 3 ------------------------- */}
          {step === 3 && (
            <motion.div
              key="step3"
              className="stack"
              style={{ alignItems: 'center', width: '100%' }}
              initial={{ opacity: 0, x: 70 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -70 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              <div className="garden">
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <div className="soil-patch">
                    {/* the seed, jiggling as it drinks */}
                    <motion.svg
                      viewBox="0 0 60 60" width="90" height="90" aria-hidden="true"
                      animate={pouring ? { scale: [1, 1.12, 1], rotate: [0, -5, 5, 0] } : { scale: 1 }}
                      transition={pouring ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
                    >
                      <ellipse cx="30" cy="34" rx="14" ry="18" fill="#c98a5b" stroke="#2b2338" strokeWidth="5" />
                      <path d="M 30 20 q 6 8 0 16" fill="none" stroke="#7c4f31" strokeWidth="4" strokeLinecap="round" />
                    </motion.svg>

                    {/* the waterfall of droplets */}
                    <AnimatePresence>
                      {pouring && Array.from({ length: 14 }, (_, i) => (
                        <motion.div
                          key={i}
                          className="droplet"
                          style={{
                            left: `${16 + (i * 5.4) % 68}%`,
                            top: 0,
                            width: 13, height: 19,
                            borderRadius: '50% 50% 50% 50% / 62% 62% 38% 38%',
                            background: '#43b3f5',
                            border: '3px solid #2b2338',
                          }}
                          initial={{ y: -30, opacity: 0 }}
                          animate={{ y: 210, opacity: [0, 1, 1, 0] }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.62, repeat: Infinity, delay: i * 0.045, ease: 'easeIn' }}
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  <div className="water-meter" aria-hidden="true">
                    <div className="water-meter__fill" style={{ width: `${water}%` }} />
                  </div>
                </div>

                {/* the watering can: press AND HOLD */}
                <motion.div
                  className="can-btn"
                  role="button"
                  tabIndex={0}
                  aria-label="Press and hold the watering can"
                  data-pouring={pouring}
                  onPointerDown={beginPour}
                  onPointerUp={releasePour}
                  onPointerCancel={releasePour}
                  animate={pouring ? { rotate: [-16, -19, -16] } : { rotate: 0 }}
                  transition={pouring ? { duration: 0.32, repeat: Infinity } : { type: 'spring', stiffness: 300 }}
                >
                  <svg viewBox="0 0 120 100" width="100%" aria-hidden="true">
                    <path d="M 26 34 h 52 a 10 10 0 0 1 10 10 v 32 a 12 12 0 0 1 -12 12 h -48 a 12 12 0 0 1 -12 -12 v -32 a 10 10 0 0 1 10 -10 Z"
                          fill="#43b3f5" stroke="#2b2338" strokeWidth="6" strokeLinejoin="round" />
                    <path d="M 34 34 q 20 -22 40 -2" fill="none" stroke="#2b2338" strokeWidth="8" strokeLinecap="round" />
                    <path d="M 86 44 L 112 26 L 118 38 L 92 58 Z" fill="#2f9fe0" stroke="#2b2338" strokeWidth="6" strokeLinejoin="round" />
                    <ellipse cx="52" cy="52" rx="18" ry="7" fill="rgba(255,255,255,0.45)" />
                  </svg>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ------------------------- STEP 4 ------------------------- */}
          {step === 4 && (
            <motion.div
              key="step4"
              className="stack"
              style={{ alignItems: 'center', width: '100%' }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            >
              <div className="bloom-stage" style={{ position: 'relative' }}>
                {/* star-burst */}
                {Array.from({ length: 14 }, (_, i) => {
                  const angle = (i / 14) * Math.PI * 2;
                  return (
                    <motion.div
                      key={i}
                      className="sparkle"
                      style={{
                        left: '50%', top: '46%', width: 20, height: 20,
                        clipPath: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
                        background: i % 2 ? '#ffd83d' : '#ff6b9d',
                      }}
                      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                      animate={{
                        x: Math.cos(angle) * 210,
                        y: Math.sin(angle) * 190,
                        scale: [0, 1.5, 0],
                        opacity: [1, 1, 0],
                        rotate: 320,
                      }}
                      transition={{ duration: 1.15, delay: 0.04 * i, ease: 'easeOut' }}
                    />
                  );
                })}

                <div className="row" style={{ justifyContent: 'center', gap: '2rem' }}>
                  <Raccoon furColor={fur} hat={hat} score={score} size={200} />
                  {bloomed && <Flower bloom={mood.bloom} size={170} grow />}
                </div>
              </div>

              {saveError && <div className="alert">{saveError}</div>}

              <button
                className="clay-btn clay-btn--lg clay-btn--berry"
                onClick={() => { tapHaptic(); finish(); }}
                aria-label="Done"
              >
                ✓
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
