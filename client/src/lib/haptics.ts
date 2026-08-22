/**
 * Tactile feedback. `navigator.vibrate` is unsupported on iOS and may be
 * disabled by the user, so every call is guarded and failure is silent.
 */

const canVibrate = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function safeVibrate(pattern: number | number[]) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* the device declined; the visuals and audio still carry the feedback */
  }
}

/** A short confirmation tick for taps. */
export const tapHaptic = () => safeVibrate(18);

/**
 * The vine slider: each mood gets a distinguishable pattern, so the child's
 * hand feels the scale as well as seeing it.
 */
export function moodHaptic(score: number) {
  switch (score) {
    case 5: return safeVibrate([26, 40, 26, 40, 40]); // bright triple
    case 4: return safeVibrate([22, 45, 22]);         // cheerful double
    case 3: return safeVibrate(30);                   // single neutral tick
    case 2: return safeVibrate([60, 70, 60]);         // slow, sleepy
    default: return safeVibrate(110);                 // one long, heavy buzz
  }
}

/** A low continuous rumble while the watering can is held down. */
export function startRumble(): () => void {
  if (!canVibrate()) return () => {};
  // Vibration cannot truly loop, so re-arm a long pattern on an interval.
  const pattern = [200, 60];
  safeVibrate(pattern);
  const id = window.setInterval(() => safeVibrate(pattern), 260);
  return () => {
    window.clearInterval(id);
    safeVibrate(0);
  };
}

export const celebrateHaptic = () => safeVibrate([40, 60, 40, 60, 120]);
