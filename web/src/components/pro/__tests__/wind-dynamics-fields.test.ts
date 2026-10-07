/**
 * The wind's dynamics as typed (`wind-dynamics-fields.ts`, `ProWindDynamics.svelte`).
 *
 *  · β was a text held from the mount. The dialog stays mounted and sets the dynamics it restores
 *    after the block is built, so the field could read 5 % while the plan used 2 %; a β that did
 *    not read (25 %) stayed in the field while the old one was used, unmarked.
 *  · n₁ and e_R were read with `Number(s.replace(',', '.'))`: e_R "3 m" and "1.234,5" became 0,
 *    and n₁ "0.8 Hz" erased the frequency, so the plan refused the direction.
 *
 * The component is read as source for where the shown β comes from, as
 * `auto-loads-dialog-state.test.ts` does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { betaText, readBeta, readER, readN1 } from '../wind-dynamics-fields';

const block = readFileSync(join(process.cwd(), 'src/components/pro/ProWindDynamics.svelte'), 'utf8');

describe('β', () => {
  it('the field shows the dynamics\' β, not a text set once at the mount', () => {
    expect(block).not.toMatch(/let betaText = \$state\(/);
    expect(block).toMatch(/const betaShown = \$derived\(betaDraft \?\? betaText\(dynamics\.beta\)\)/);
    expect(block).toMatch(/value=\{betaShown\}/);
  });

  it('a β that does not read is marked, and the one in use is kept', () => {
    expect(block).toMatch(/aria-invalid=\{betaInvalid\}/);
    expect(readBeta('25')).toBeNull();
    expect(readBeta('0')).toBeNull();
    expect(readBeta('5 %')).toBeNull();
  });

  it('reads a comma or a point, and shows the fraction as a percentage', () => {
    expect(readBeta('2,5')).toBeCloseTo(0.025, 12);
    expect(readBeta('0.5')).toBeCloseTo(0.005, 12);
    expect(betaText(0.02)).toBe('2');
    expect(betaText(0.005)).toBe('0,5');
  });
});

describe('n₁ and e_R', () => {
  it('are read as the app reads numbers, not with Number()', () => {
    expect(block).not.toMatch(/Number\(s\.replace/);
  });

  it('n₁: blank is none given; text that does not read keeps the frequency there was', () => {
    expect(readN1('0,8', undefined)).toBe(0.8);
    expect(readN1('0.8 Hz', 0.6)).toBe(0.6);
    expect(readN1('0', 0.6)).toBe(0.6);
    expect(readN1('  ', 0.6)).toBeUndefined();
  });

  it('e_R: blank is none given; "3 m" and a grouped thousand do not become 0', () => {
    expect(readER('3 m', 1.5)).toBe(1.5);
    expect(readER('1.234,5', 1.5)).toBe(1234.5);
    expect(readER('-2,5', 0)).toBe(-2.5);
    expect(readER('', 1.5)).toBeUndefined();
  });
});
