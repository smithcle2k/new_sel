/**
 * Browser-synthesized audio. Every sound here is generated with WebAudio
 * oscillator/noise nodes — the app ships no audio files at all, so the kiosk
 * stays instant on a cold cache and works fully offline.
 *
 * Audio contexts start suspended until a user gesture, so `unlock()` is called
 * from the first tap and every play path is a no-op until then.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Call from a real user gesture before the first sound. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

export function setMuted(muted: boolean) {
  const c = ensure();
  if (c && master) master.gain.setTargetAtTime(muted ? 0 : 0.5, c.currentTime, 0.02);
}

type ToneOpts = {
  freq: number;
  start?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  glideTo?: number;
};

function tone({ freq, start = 0, duration = 0.3, type = 'sine', gain = 0.25, glideTo }: ToneOpts) {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);

  // Short attack, exponential tail — reads as a struck/plucked object.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/* --------------------------- interaction sounds -------------------------- */

/** The bubbly pop for fur swatches and hat toggles. */
export function playPop() {
  const c = ensure();
  if (!c) return;
  tone({ freq: 420, glideTo: 900, duration: 0.16, type: 'sine', gain: 0.3 });
  tone({ freq: 840, start: 0.05, duration: 0.12, type: 'triangle', gain: 0.14 });
}

/** A hat landing on the raccoon's head: a soft wooden knock. */
export function playThud() {
  tone({ freq: 190, glideTo: 90, duration: 0.22, type: 'triangle', gain: 0.34 });
}

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0]; // C D E G A

/**
 * The mood voice for the vine slider. Each band has its own instrument so a
 * child hears the difference between the ends of the scale, not just sees it.
 */
export function playMoodTone(score: number) {
  const c = ensure();
  if (!c) return;
  if (score >= 4) {
    // Rising major pentatonic arpeggio — brighter and faster at 5.
    const notes = score === 5 ? PENTATONIC : PENTATONIC.slice(0, 4);
    const step = score === 5 ? 0.055 : 0.075;
    notes.forEach((f, i) =>
      tone({ freq: f, start: i * step, duration: 0.26, type: 'triangle', gain: 0.2 }),
    );
  } else if (score === 3) {
    // Warm, low triangle-wave plucks: a calm guitar.
    tone({ freq: 261.63, duration: 0.5, type: 'triangle', gain: 0.26 });
    tone({ freq: 392.0, start: 0.08, duration: 0.42, type: 'triangle', gain: 0.16 });
  } else {
    // Soft falling cello-ish bass — comforting, never harsh.
    const root = score === 1 ? 174.61 : 196.0;
    tone({ freq: root * 1.5, glideTo: root, duration: 0.75, type: 'sine', gain: 0.3 });
    tone({ freq: root * 0.75, start: 0.1, duration: 0.7, type: 'sine', gain: 0.16 });
  }
}

/* ------------------------------ water & reward --------------------------- */

/** A continuous rushing-water bed: filtered white noise, held while pouring. */
export function startWaterSound(): () => void {
  const c = ensure();
  if (!c || !master) return () => {};

  const frames = Math.floor(c.sampleRate * 2);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const bandpass = c.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1000;
  bandpass.Q.value = 0.7;

  // A slow wobble on the filter keeps it from sounding like flat static.
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 3.2;
  lfoGain.gain.value = 320;
  lfo.connect(lfoGain).connect(bandpass.frequency);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, c.currentTime);
  env.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 0.09);

  noise.connect(bandpass).connect(env).connect(master);
  noise.start();
  lfo.start();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const t = c.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    noise.stop(t + 0.2);
    lfo.stop(t + 0.2);
  };
}

/** The seed bursting open. */
export function playSparkle() {
  [1046.5, 1318.5, 1568.0, 2093.0].forEach((f, i) =>
    tone({ freq: f, start: i * 0.045, duration: 0.34, type: 'sine', gain: 0.2 }),
  );
}

/** The final celebratory chord at 100%. */
export function playCheer() {
  const chord = [523.25, 659.25, 783.99, 1046.5];
  chord.forEach((f, i) => {
    tone({ freq: f, start: i * 0.06, duration: 1.1, type: 'triangle', gain: 0.2 });
    tone({ freq: f * 2, start: 0.3 + i * 0.05, duration: 0.6, type: 'sine', gain: 0.08 });
  });
}
