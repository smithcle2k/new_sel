import type { BloomId } from './api';

export interface Mood {
  score: number;
  key: string;
  label: string;
  bloom: BloomId;
  color: string;
}

/** Ordered low -> high, matching the left-to-right travel of the vine. */
export const MOODS: Mood[] = [
  { score: 1, key: 'sad_mad',      label: 'Sad / Mad',     bloom: 'bluebell',  color: '#7f9cf5' },
  { score: 2, key: 'tired_sleepy', label: 'Tired / Sleepy', bloom: 'bluebell',  color: '#9c8bd6' },
  { score: 3, key: 'just_okay',    label: 'Just Okay',      bloom: 'sprout',    color: '#8fd694' },
  { score: 4, key: 'happy_good',   label: 'Happy & Good',   bloom: 'sunflower', color: '#ffc93c' },
  { score: 5, key: 'super_happy',  label: 'Super Happy',    bloom: 'sunflower', color: '#ff9d3c' },
];

export const moodFor = (score: number): Mood =>
  MOODS.find((m) => m.score === score) ?? MOODS[3];

export const clampScore = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
