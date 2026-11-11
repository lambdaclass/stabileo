export const LIVES = 3;
export const LEVEL_UP = 5;
export const MAX_LEVEL = 7;
export const TIME_BONUS_WINDOW_MS = 20_000;
export const MAX_TIME_BONUS = 50;

export interface GameState {
  phase: 'playing' | 'answered' | 'over';
  /** 0-based. */
  level: number;
  score: number;
  streak: number;
  lives: number;
  correctInLevel: number;
  round: number;
  answered: number;
  correct: number;
  bestStreak: number;
  last: Outcome | null;
}

export interface Outcome {
  correct: boolean;
  points: number;
  levelUp: boolean;
  /** What the points are made of: the level base, the streak multiplier it was scaled by and the time bonus. */
  base: number;
  multiplier: number;
  speed: number;
}

export function newGame(): GameState {
  return { phase: 'playing', level: 0, score: 0, streak: 0, lives: LIVES, correctInLevel: 0, round: 0, answered: 0, correct: 0, bestStreak: 0, last: null };
}

export function multiplier(streak: number): number {
  return 1 + Math.min(streak, 4) * 0.25;
}

export function timeBonus(elapsedMs: number): number {
  return Math.max(0, Math.round(MAX_TIME_BONUS * (1 - elapsedMs / TIME_BONUS_WINDOW_MS)));
}

export function basePoints(level: number): number {
  return 100 + 25 * level;
}

export function answer(s: GameState, correct: boolean, elapsedMs: number): GameState {
  if (s.phase !== 'playing') return s;
  const answered = s.answered + 1;
  if (!correct) {
    const lives = s.lives - 1;
    return { ...s, phase: lives <= 0 ? 'over' : 'answered', lives, streak: 0, answered, last: { correct: false, points: 0, levelUp: false, base: 0, multiplier: 1, speed: 0 } };
  }
  const base = basePoints(s.level), mult = multiplier(s.streak), speed = timeBonus(elapsedMs);
  const points = Math.round(base * mult) + speed;
  const levelUp = s.correctInLevel + 1 >= LEVEL_UP && s.level < MAX_LEVEL - 1;
  return {
    ...s,
    phase: 'answered',
    score: s.score + points,
    streak: s.streak + 1,
    answered,
    correct: s.correct + 1,
    bestStreak: Math.max(s.bestStreak, s.streak + 1),
    correctInLevel: levelUp ? 0 : s.correctInLevel + 1,
    level: levelUp ? s.level + 1 : s.level,
    last: { correct: true, points, levelUp, base, multiplier: mult, speed },
  };
}

export function nextRound(s: GameState): GameState {
  return s.phase === 'answered' ? { ...s, phase: 'playing', round: s.round + 1, last: null } : s;
}

const BEST_KEY = 'stabileo.diagramGame.best';

export function readBest(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

/** Returns the best score after recording `score`. */
export function recordBest(score: number): number {
  const best = Math.max(readBest(), score);
  try {
    globalThis.localStorage?.setItem(BEST_KEY, String(best));
  } catch {
    return best;
  }
  return best;
}
