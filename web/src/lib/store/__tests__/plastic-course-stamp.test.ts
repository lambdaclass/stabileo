import { describe, it, expect } from 'vitest';
import { stampOf } from '../plastic-course.svelte';

const run = (hinges: Array<{ elementId: number; x: number }>, factors: number[]) =>
  ({ collapseFactor: factors[factors.length - 1], hinges, steps: factors.map((loadFactor) => ({ loadFactor })) });

describe('the plastic course ties a mechanism check to its own run', () => {
  it('two runs with the same λc and counts but other hinges stamp apart', () => {
    const a = run([{ elementId: 1, x: 0 }, { elementId: 2, x: 3 }], [1.2, 1.5]);
    const b = run([{ elementId: 3, x: 0 }, { elementId: 2, x: 1 }], [1.2, 1.5]);
    expect(stampOf(a)).not.toBe(stampOf(b));
  });
  it('a moment sign flipped for drawing keeps the stamp', () => {
    const a = { collapseFactor: 2, steps: [{ loadFactor: 2 }], hinges: [{ elementId: 1, end: 'start', moment: 5, loadFactor: 2, step: 0 }] };
    expect(stampOf(a)).toBe(stampOf({ ...a, hinges: [{ ...a.hinges[0], moment: -5 }] }));
  });
  it('the same λc reached through other events stamps apart; a copy of the same run does not', () => {
    const a = run([{ elementId: 1, x: 0 }], [1.1, 2]);
    expect(stampOf(a)).not.toBe(stampOf(run([{ elementId: 1, x: 0 }], [1.3, 2])));
    expect(stampOf(a)).toBe(stampOf({ ...a, hinges: [...a.hinges], steps: [...a.steps] }));
  });
});
