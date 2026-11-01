import { describe, it, expect } from 'vitest';
import { stampOf } from '../plastic-course.svelte';

const run = (hinges: Array<{ elementId: number; x: number }>, factors: number[]) =>
  ({ collapseFactor: factors[factors.length - 1], hinges, steps: factors.map((loadFactor) => ({ loadFactor })) });

describe('the plastic course ties a mechanism check to its own run', () => {
  it('two runs with the same λc and counts but other hinges stamp apart', () => {
    const a = run([{ elementId: 1, x: 0 }, { elementId: 2, x: 3 }], [1.2, 1.5]);
    const b = run([{ elementId: 3, x: 0 }, { elementId: 2, x: 1 }], [1.2, 1.5]);
    expect(stampOf(a, 7)).not.toBe(stampOf(b, 7));
  });
  it('the same result on an edited model stamps apart', () => {
    const a = run([{ elementId: 1, x: 0 }], [2]);
    expect(stampOf(a, 7)).not.toBe(stampOf(a, 8));
    expect(stampOf(a, 7)).toBe(stampOf({ ...a, hinges: [...a.hinges], steps: [...a.steps] }, 7));
  });
});
