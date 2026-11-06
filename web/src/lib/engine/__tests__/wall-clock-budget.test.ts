import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertBudget } from './wall-clock-budget';

const file = () => join(mkdtempSync(join(tmpdir(), 'wall-clock-')), 'overruns.jsonl');

describe('a wall-clock budget', () => {
  it('is asserted by default and skipped with NO_WALL_CLOCK=1', () => {
    expect(assertBudget(900, 500, 'x', {})).toBe(true);
    expect(assertBudget(100, 500, 'x', {})).toBe(true);
    expect(assertBudget(900, 500, 'x', { NO_WALL_CLOCK: '1', WALL_CLOCK_REPORT: file() })).toBe(false);
  });

  it('in report mode records an overrun instead of failing, and nothing within budget', () => {
    const report = file();
    expect(assertBudget(100, 500, 'within', { WALL_CLOCK_REPORT: report })).toBe(false);
    expect(existsSync(report)).toBe(false);
    expect(assertBudget(691.4, 275.2, 'fluidity', { WALL_CLOCK_REPORT: report })).toBe(false);
    expect(assertBudget(500, 500, 'equal', { WALL_CLOCK_REPORT: report })).toBe(false);
    expect(readFileSync(report, 'utf8').trim().split('\n').map((l) => JSON.parse(l))).toEqual([
      { what: 'fluidity', measured: 691.4, budget: 275.2 },
      { what: 'equal', measured: 500, budget: 500 },
    ]);
  });

  it('in report mode still asserts a measurement that never completed', () => {
    const report = file();
    expect(assertBudget(NaN, 500, 'broken', { WALL_CLOCK_REPORT: report })).toBe(true);
    expect(assertBudget(Infinity, 500, 'broken', { WALL_CLOCK_REPORT: report })).toBe(true);
    expect(existsSync(report)).toBe(false);
  });
});
