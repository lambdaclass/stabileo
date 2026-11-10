import { describe, it, expect, vi, afterEach } from 'vitest';
import { answer, newGame, nextRound, readBest, recordBest, basePoints, multiplier, timeBonus, LIVES, LEVEL_UP, MAX_LEVEL, MAX_TIME_BONUS, TIME_BONUS_WINDOW_MS, type GameState } from '../scoring';

const SLOW = TIME_BONUS_WINDOW_MS * 2;

function play(s: GameState, results: boolean[], elapsed = SLOW): GameState {
  for (const ok of results) s = nextRound(answer(s, ok, elapsed));
  return s;
}

describe('scoring', () => {
  it('a correct answer scores the level base, the streak multiplier and the time bonus', () => {
    const first = answer(newGame(), true, 0);
    expect(first.phase).toBe('answered');
    expect(first.score).toBe(basePoints(0) + MAX_TIME_BONUS);
    expect(first.streak).toBe(1);
    const second = answer(nextRound(first), true, SLOW);
    expect(second.last!.points).toBe(Math.round(basePoints(0) * multiplier(1)));
    expect(second.score).toBe(first.score + second.last!.points);
  });

  it('the time bonus falls to zero over its window', () => {
    expect(timeBonus(0)).toBe(MAX_TIME_BONUS);
    expect(timeBonus(TIME_BONUS_WINDOW_MS / 2)).toBe(Math.round(MAX_TIME_BONUS / 2));
    expect(timeBonus(TIME_BONUS_WINDOW_MS)).toBe(0);
    expect(timeBonus(SLOW)).toBe(0);
  });

  it('the multiplier grows with the streak and stops growing', () => {
    expect(multiplier(0)).toBe(1);
    expect(multiplier(2)).toBe(1.5);
    expect(multiplier(4)).toBe(2);
    expect(multiplier(40)).toBe(2);
  });

  it('a wrong answer costs a life and the streak, and scores nothing', () => {
    const s = answer(play(newGame(), [true, true]), false, 0);
    expect(s.lives).toBe(LIVES - 1);
    expect(s.streak).toBe(0);
    expect(s.last).toEqual({ correct: false, points: 0, levelUp: false });
    expect(s.score).toBe(play(newGame(), [true, true]).score);
  });

  it(`the game ends on the ${LIVES}th mistake and takes no further answer`, () => {
    let s = play(newGame(), [false, false]);
    expect(s.phase).toBe('playing');
    s = answer(s, false, 0);
    expect(s.phase).toBe('over');
    expect(s.lives).toBe(0);
    expect(answer(s, true, 0)).toBe(s);
    expect(nextRound(s)).toBe(s);
  });

  it(`${LEVEL_UP} correct answers in a level move up one, and mistakes do not reset that count`, () => {
    let s = play(newGame(), [true, false, true, true, true]);
    expect(s.level).toBe(0);
    s = answer(s, true, SLOW);
    expect(s.last!.levelUp).toBe(true);
    expect(s.level).toBe(1);
    expect(s.correctInLevel).toBe(0);
  });

  it('the last level is the ceiling', () => {
    const s = play(newGame(), Array(LEVEL_UP * (MAX_LEVEL + 2)).fill(true));
    expect(s.level).toBe(MAX_LEVEL - 1);
  });

  it('only an answered round moves to the next one', () => {
    const s = newGame();
    expect(nextRound(s)).toBe(s);
    expect(nextRound(answer(s, true, 0)).round).toBe(1);
  });
});

describe('best score', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is kept in local storage and only ever goes up', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    expect(readBest()).toBe(0);
    expect(recordBest(420)).toBe(420);
    expect(recordBest(100)).toBe(420);
    expect(readBest()).toBe(420);
  });

  it('a storage that throws reads as no record and still reports the score', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(readBest()).toBe(0);
    expect(recordBest(300)).toBe(300);
  });

  it('works with no storage at all', () => {
    expect(readBest()).toBe(0);
    expect(recordBest(50)).toBe(50);
  });
});
