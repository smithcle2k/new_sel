import { motion } from 'framer-motion';
import type { BloomId } from '../lib/api';

/**
 * The variable reward. Which flower a child grows is decided by the mood they
 * reported, so the garden becomes a week-long record they can read at a glance.
 */

export interface FlowerProps {
  bloom: BloomId;
  size?: number;
  animated?: boolean;
  /** Plays the burst-open growth on mount. */
  grow?: boolean;
}

const STROKE = '#2b2338';

export function Flower({ bloom, size = 150, animated = true, grow = false }: FlowerProps) {
  const idle =
    bloom === 'sunflower' ? { y: [0, -7, 0], rotate: [0, 2.5, -2.5, 0] }   // bright bounce
    : bloom === 'sprout'  ? { rotate: [0, 5, -5, 0] }                        // soft sway
    : { rotate: [0, 3, -1, 0], y: [0, 2, 0] };                               // cozy nod

  const duration = bloom === 'sunflower' ? 1.5 : bloom === 'sprout' ? 3.4 : 4;

  return (
    <motion.svg
      viewBox="0 0 120 160"
      width={size}
      height={size * (160 / 120)}
      role="img"
      aria-label={`${bloom} bloom`}
      style={{ overflow: 'visible', display: 'block', transformOrigin: '60px 158px' }}
      initial={grow ? { scale: 0, y: 26 } : false}
      animate={animated ? { scale: 1, y: 0, ...idle } : { scale: 1, y: 0 }}
      transition={animated
        ? { scale: { type: 'spring', stiffness: 240, damping: 11 },
            default: { duration, repeat: Infinity, ease: 'easeInOut' } }
        : { duration: 0.2 }}
    >
      {/* stem */}
      <path d="M 60 158 Q 56 120 60 92" fill="none" stroke={STROKE} strokeWidth="11" strokeLinecap="round" />
      <path d="M 60 158 Q 56 120 60 92" fill="none" stroke="#4faa2e" strokeWidth="6" strokeLinecap="round" />
      {/* leaves */}
      <path d="M 58 126 Q 34 118 30 134 Q 48 142 58 126 Z" fill="#7ed957" stroke={STROKE} strokeWidth="4" strokeLinejoin="round" />
      <path d="M 62 112 Q 86 104 90 120 Q 72 128 62 112 Z" fill="#7ed957" stroke={STROKE} strokeWidth="4" strokeLinejoin="round" />

      {bloom === 'sunflower' && (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <ellipse
              key={i}
              cx="60" cy="46" rx="9" ry="24"
              fill="#ffc93c" stroke={STROKE} strokeWidth="3.5"
              transform={`rotate(${i * 30} 60 70)`}
            />
          ))}
          <circle cx="60" cy="70" r="21" fill="#8b5a2b" stroke={STROKE} strokeWidth="4.5" />
          <circle cx="53" cy="66" r="3.6" fill="#fffaf2" stroke={STROKE} strokeWidth="2" />
          <circle cx="67" cy="66" r="3.6" fill="#fffaf2" stroke={STROKE} strokeWidth="2" />
          <circle cx="53" cy="67" r="1.7" fill={STROKE} />
          <circle cx="67" cy="67" r="1.7" fill={STROKE} />
          <path d="M 52 76 Q 60 84 68 76" fill="none" stroke={STROKE} strokeWidth="3.4" strokeLinecap="round" />
        </g>
      )}

      {bloom === 'sprout' && (
        <g>
          <path d="M 60 96 Q 30 86 26 60 Q 56 58 60 92 Z" fill="#8fd694" stroke={STROKE} strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M 60 96 Q 90 86 94 60 Q 64 58 60 92 Z" fill="#7ed957" stroke={STROKE} strokeWidth="4.5" strokeLinejoin="round" />
          <circle cx="55" cy="78" r="2.6" fill={STROKE} />
          <circle cx="66" cy="78" r="2.6" fill={STROKE} />
          <path d="M 54 86 Q 60 90 67 86" fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {bloom === 'bluebell' && (
        <g transform="rotate(10 60 92)">
          <path d="M 44 66 Q 60 44 76 66 Q 80 92 60 100 Q 40 92 44 66 Z"
                fill="#7f9cf5" stroke={STROKE} strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M 44 84 Q 52 96 60 92 Q 68 96 76 84" fill="#9db4ff" stroke={STROKE} strokeWidth="4" strokeLinejoin="round" />
          {/* eyes closed — it is resting */}
          <path d="M 51 76 Q 55 80 59 76" fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
          <path d="M 62 76 Q 66 80 70 76" fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
          <circle cx="60" cy="102" r="4" fill="#ffd166" stroke={STROKE} strokeWidth="3" />
        </g>
      )}
    </motion.svg>
  );
}

/** A tiny non-animating bloom for meadow rows and roster tiles. */
export function FlowerGlyph({ bloom, size = 34 }: { bloom: BloomId; size?: number }) {
  return <Flower bloom={bloom} size={size} animated={false} />;
}
