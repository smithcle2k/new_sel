import { motion } from 'framer-motion';
import type { HatId } from '../lib/api';

/**
 * The Raccoon Companion.
 *
 * One vector rig whose face and body are driven entirely by `score` (1..5), so
 * the child sees their own drag reflected frame-by-frame rather than switching
 * between canned faces. Every morph target below is authored on the same
 * 200x200 grid, which keeps path interpolation stable.
 */

export interface RaccoonProps {
  furColor: string;
  hat: HatId;
  /** 1..5. Drives expression, body scale, tilt and posture. */
  score?: number;
  size?: number;
  /** Idle breathing loop — off for small roster thumbnails. */
  animated?: boolean;
  className?: string;
}

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 18, mass: 0.7 };
const HAT_SPRING = { type: 'spring' as const, stiffness: 520, damping: 12, mass: 0.8 };

/** Shade a hex colour by `amt` (-1..1) for the moulded-clay shading. */
function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Per-score expression targets. */
function expression(score: number) {
  switch (score) {
    case 5:
      return {
        mouth: 'M 78 118 Q 100 146 122 118 Q 100 132 78 118 Z',
        browL: 'M 72 74 Q 80 68 89 72',
        browR: 'M 111 72 Q 120 68 128 74',
        bodyScale: 1.09, tilt: 0, headY: -4, blush: 1, stars: 1, lidY: 0, mouthFill: '#7a3d52',
      };
    case 4:
      return {
        mouth: 'M 82 116 Q 100 132 118 116 Q 100 124 82 116 Z',
        browL: 'M 72 76 Q 80 72 89 75',
        browR: 'M 111 75 Q 120 72 128 76',
        bodyScale: 1.0, tilt: 0, headY: 0, blush: 0.45, stars: 0, lidY: 0, mouthFill: '#7a3d52',
      };
    case 3:
      return {
        mouth: 'M 84 122 Q 100 122 116 122 Q 100 123 84 122 Z',
        browL: 'M 72 78 Q 80 77 89 78',
        browR: 'M 111 78 Q 120 77 128 78',
        bodyScale: 0.95, tilt: 0, headY: 2, blush: 0, stars: 0, lidY: 0, mouthFill: '#6b3547',
      };
    case 2:
      return {
        mouth: 'M 86 124 Q 100 118 114 124 Q 100 121 86 124 Z',
        browL: 'M 72 80 Q 80 79 89 81',
        browR: 'M 111 81 Q 120 79 128 80',
        bodyScale: 0.93, tilt: -8, headY: 5, blush: 0, stars: 0, lidY: 7, mouthFill: '#6b3547',
      };
    default:
      return {
        mouth: 'M 82 130 Q 100 108 118 130 Q 100 118 82 130 Z',
        browL: 'M 70 70 Q 80 76 90 82',   // angry inward diagonals
        browR: 'M 130 70 Q 120 76 110 82',
        bodyScale: 0.9, tilt: 0, headY: 8, blush: 0, stars: 0, lidY: 0, mouthFill: '#6b3547',
      };
  }
}

/* --------------------------------- hats ---------------------------------- */

function Hat({ hat }: { hat: HatId }) {
  if (hat === 'none') return null;
  const shapes: Record<Exclude<HatId, 'none'>, JSX.Element> = {
    pirate: (
      /* A tricorn: tall crown plus an upswept brim. An earlier shallow-arc
         version read as an eye rather than a hat at thumbnail size. */
      <g>
        <path d="M 66 44 Q 100 -2 134 44 Z" fill="#403a55" stroke="#1c1a26" strokeWidth="4" strokeLinejoin="round" />
        <path d="M 42 50 Q 56 26 100 26 Q 144 26 158 50 Q 132 62 100 62 Q 68 62 42 50 Z"
              fill="#2f2b3d" stroke="#1c1a26" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="100" cy="40" r="8" fill="#fff8e7" stroke="#1c1a26" strokeWidth="3" />
        <circle cx="97" cy="38" r="1.8" fill="#1c1a26" />
        <circle cx="103" cy="38" r="1.8" fill="#1c1a26" />
        <path d="M 96 46 L 104 46" stroke="#1c1a26" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    ),
    party: (
      <g>
        <path d="M 100 2 L 126 50 L 74 50 Z" fill="#ff6b9d" stroke="#1c1a26" strokeWidth="4" strokeLinejoin="round" />
        <path d="M 100 2 L 113 26 L 87 26 Z" fill="#ffd166" stroke="#1c1a26" strokeWidth="3" strokeLinejoin="round" />
        <path d="M 79 40 Q 100 32 121 40" fill="none" stroke="#43b3f5" strokeWidth="5" strokeLinecap="round" />
        <circle cx="100" cy="0" r="8" fill="#7ed957" stroke="#1c1a26" strokeWidth="4" />
      </g>
    ),
    crown: (
      <g>
        <path d="M 58 50 L 58 20 L 79 38 L 100 12 L 121 38 L 142 20 L 142 50 Z"
              fill="#ffc93c" stroke="#1c1a26" strokeWidth="4" strokeLinejoin="round" />
        <rect x="56" y="48" width="88" height="12" rx="6" fill="#ffb020" stroke="#1c1a26" strokeWidth="4" />
        <circle cx="100" cy="30" r="5" fill="#ff6b9d" stroke="#1c1a26" strokeWidth="3" />
        <circle cx="70" cy="30" r="4" fill="#43b3f5" stroke="#1c1a26" strokeWidth="3" />
        <circle cx="130" cy="30" r="4" fill="#43b3f5" stroke="#1c1a26" strokeWidth="3" />
      </g>
    ),
  };
  return (
    <motion.g
      key={hat}
      // Squash-and-stretch: the hat drops in, overshoots, then settles.
      initial={{ y: -110, scaleY: 1.45, scaleX: 0.72, opacity: 0 }}
      animate={{ y: 0, scaleY: 1, scaleX: 1, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      transition={HAT_SPRING}
      style={{ originX: '100px', originY: '60px' }}
    >
      {shapes[hat]}
    </motion.g>
  );
}

/* -------------------------------- raccoon -------------------------------- */

export function Raccoon({
  furColor, hat, score = 4, size = 260, animated = true, className,
}: RaccoonProps) {
  const e = expression(score);
  const dark = shade(furColor, -0.34);
  const light = shade(furColor, 0.3);
  const stroke = '#2b2338';

  return (
    <motion.svg
      className={className}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label="Your raccoon buddy"
      style={{ overflow: 'visible', display: 'block' }}
      animate={{ scale: e.bodyScale, rotate: e.tilt }}
      transition={SPRING}
    >
      <defs>
        <radialGradient id="mdb-fur" cx="38%" cy="28%">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={furColor} />
        </radialGradient>
      </defs>

      {/* ground shadow anchors the toy to a surface */}
      <ellipse cx="100" cy="192" rx="52" ry="9" fill="rgba(43,35,56,0.22)" />

      {/* striped tail, which sways with mood */}
      <motion.g
        style={{ originX: '150px', originY: '160px' }}
        animate={{ rotate: score >= 4 ? [0, 12, -6, 0] : score === 1 ? 22 : 4 }}
        transition={score >= 4 && animated
          ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
          : SPRING}
      >
        <path d="M 142 168 Q 186 158 178 118 Q 174 96 156 96"
              fill="none" stroke={stroke} strokeWidth="22" strokeLinecap="round" />
        <path d="M 142 168 Q 186 158 178 118 Q 174 96 156 96"
              fill="none" stroke={furColor} strokeWidth="14" strokeLinecap="round" />
        <path d="M 168 156 Q 178 148 176 138" fill="none" stroke="#463a52" strokeWidth="13" strokeLinecap="round" />
        <path d="M 176 118 Q 172 106 162 100" fill="none" stroke="#463a52" strokeWidth="13" strokeLinecap="round" />
      </motion.g>

      {/* body — breathes when idle, slumps at score 1 */}
      <motion.g
        animate={animated
          ? { scaleY: score === 1 ? 0.94 : [1, 1.025, 1], y: score === 1 ? 6 : 0 }
          : { scaleY: score === 1 ? 0.94 : 1, y: score === 1 ? 6 : 0 }}
        transition={animated && score !== 1
          ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
          : SPRING}
        style={{ originX: '100px', originY: '186px' }}
      >
        <path d="M 62 186 Q 56 132 100 128 Q 144 132 138 186 Z"
              fill="url(#mdb-fur)" stroke={stroke} strokeWidth="6" strokeLinejoin="round" />
        <ellipse cx="100" cy="166" rx="24" ry="21" fill={light} stroke={stroke} strokeWidth="5" />
        {/* paws */}
        <ellipse cx="66" cy="180" rx="13" ry="11" fill={dark} stroke={stroke} strokeWidth="5" />
        <ellipse cx="134" cy="180" rx="13" ry="11" fill={dark} stroke={stroke} strokeWidth="5" />
      </motion.g>

      {/* head group */}
      <motion.g animate={{ y: e.headY }} transition={SPRING} style={{ originX: '100px', originY: '96px' }}>
        {/* ears */}
        <circle cx="62" cy="58" r="19" fill={furColor} stroke={stroke} strokeWidth="6" />
        <circle cx="138" cy="58" r="19" fill={furColor} stroke={stroke} strokeWidth="6" />
        <circle cx="62" cy="58" r="9" fill={shade(furColor, 0.45)} />
        <circle cx="138" cy="58" r="9" fill={shade(furColor, 0.45)} />

        {/* skull */}
        <ellipse cx="100" cy="94" rx="52" ry="46" fill="url(#mdb-fur)" stroke={stroke} strokeWidth="6" />

        {/* The raccoon's signature bandit mask. Deliberately a FIXED charcoal
            rather than a shade of the chosen fur: derived from the fur it
            vanished on dark colours and the character stopped reading as a
            raccoon at all. The pale brow patches above it are what sell it. */}
        <path d="M 54 88 Q 62 62 84 76 Q 100 86 116 76 Q 138 62 146 88 Q 140 112 118 112 Q 100 114 82 112 Q 60 112 54 88 Z"
              fill="#463a52" />
        <ellipse cx="80" cy="70" rx="15" ry="7" fill={shade(furColor, 0.72)} opacity="0.95" />
        <ellipse cx="120" cy="70" rx="15" ry="7" fill={shade(furColor, 0.72)} opacity="0.95" />

        {/* muzzle */}
        <ellipse cx="100" cy="116" rx="28" ry="21" fill={shade(furColor, 0.62)} stroke={stroke} strokeWidth="5" />

        {/* eyes: whites, pupils, sleepy lids and the score-5 star sparkles */}
        <g>
          <circle cx="82" cy="90" r="13" fill="#fffaf2" stroke={stroke} strokeWidth="4" />
          <circle cx="118" cy="90" r="13" fill="#fffaf2" stroke={stroke} strokeWidth="4" />

          <motion.g animate={{ opacity: e.stars ? 0 : 1 }} transition={{ duration: 0.16 }}>
            <circle cx="82" cy="90" r="6.5" fill={stroke} />
            <circle cx="118" cy="90" r="6.5" fill={stroke} />
            <circle cx="84.5" cy="87.5" r="2.4" fill="#fff" />
            <circle cx="120.5" cy="87.5" r="2.4" fill="#fff" />
          </motion.g>

          {/* star sparkle eyes at Super Happy */}
          <motion.g
            animate={{ opacity: e.stars, scale: e.stars ? 1 : 0.4 }}
            transition={SPRING}
            style={{ originX: '100px', originY: '90px' }}
          >
            <path d="M 82 80 L 85 88 L 93 90 L 85 92 L 82 100 L 79 92 L 71 90 L 79 88 Z" fill="#ffd83d" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M 118 80 L 121 88 L 129 90 L 121 92 L 118 100 L 115 92 L 107 90 L 115 88 Z" fill="#ffd83d" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" />
          </motion.g>

          {/* sleepy half-moon lids drop over the eyes at Tired */}
          <motion.g animate={{ opacity: e.lidY ? 1 : 0 }} transition={{ duration: 0.18 }}>
            <path d="M 69 90 A 13 13 0 0 1 95 90 Z" fill="#463a52" stroke={stroke} strokeWidth="4" strokeLinejoin="round" />
            <path d="M 105 90 A 13 13 0 0 1 131 90 Z" fill="#463a52" stroke={stroke} strokeWidth="4" strokeLinejoin="round" />
          </motion.g>
        </g>

        {/* brows carry most of the emotional read */}
        {/* `d` is set as a real attribute too, so the very first paint has a
            valid path rather than waiting for the animation to supply one. */}
        <motion.path d={e.browL} initial={{ d: e.browL }} animate={{ d: e.browL }} transition={SPRING}
                     fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        <motion.path d={e.browR} initial={{ d: e.browR }} animate={{ d: e.browR }} transition={SPRING}
                     fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />

        {/* blush */}
        <motion.g animate={{ opacity: e.blush }} transition={{ duration: 0.22 }}>
          <ellipse cx="68" cy="108" rx="11" ry="7" fill="#ff8fb8" opacity="0.75" />
          <ellipse cx="132" cy="108" rx="11" ry="7" fill="#ff8fb8" opacity="0.75" />
        </motion.g>

        {/* nose + mouth */}
        <path d="M 92 106 Q 100 100 108 106 Q 100 114 92 106 Z" fill={stroke} />
        <motion.path d={e.mouth} fill={e.mouthFill}
                     initial={{ d: e.mouth, fill: e.mouthFill }}
                     animate={{ d: e.mouth, fill: e.mouthFill }} transition={SPRING}
                     stroke={stroke} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />

        <Hat hat={hat} />
      </motion.g>
    </motion.svg>
  );
}
