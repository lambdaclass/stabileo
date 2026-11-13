/**
 * TS 500:2000 §6.2.6 (Denk. 6.3–6.10) and TBDY 2018 §4.4.4.1 (Denk. 4.11, 4.12), with TS 498 Madde 7
 * (snow is a live load) and 9.1 (Pk + W/2 or W + Pk/2).
 */
import { describe, it, expect } from 'vitest';
import { ts500Service, ts500Strength } from '../ts500-combinations';
import type { CombinationInputs } from '../../cirsoc101/combinations';

const present = (over: Partial<CombinationInputs['present']> = {}): CombinationInputs =>
  ({ present: { L: true, Lr: false, S: false, R: false, W: false, E: false, F: false, H: false, ...over } });
const labels = (ci: CombinationInputs) => ts500Strength(ci).combinations.map((c) => c.label);

describe('TS 500 §6.2.6 and TBDY §4.4.4', () => {
  it('gravity only', () => {
    expect(labels(present())).toEqual(['1.4 D + 1.6 L']);
  });
  it('wind: 6.5, the same without the live load, and 6.6', () => {
    expect(labels(present({ W: true }))).toEqual(['1.4 D + 1.6 L', '1.0 D + 1.3 L + 1.3 W', '1.0 D + 1.3 W', '0.9 D + 1.3 W']);
  });
  it('earthquake: G + Q + 0,2 S + E and 0,9 G + H + E', () => {
    expect(labels(present({ E: true, S: true, H: true }))).toEqual([
      '1.4 D + 1.6 L + 1.6 S', '1.0 D + 1.0 L + 0.2 S + 1.0 E', '1.0 D + 1.0 E', '0.9 D + 1.0 H + 1.0 E',
      '1.4 D + 1.6 L + 1.6 S + 1.6 H', '0.9 D + 1.6 H',
    ]);
  });
  it('snow with wind: Pk + W/2 and W + Pk/2, and roof live or snow', () => {
    const l = labels(present({ W: true, S: true, Lr: true }));
    expect(l).toContain('1.4 D + 1.6 L + 1.6 Lr');
    expect(l).toContain('1.4 D + 1.6 L + 1.6 S');
    expect(l).toContain('1.0 D + 1.3 L + 1.3 S + 0.65 W');
    expect(l).toContain('1.0 D + 1.3 L + 1.3 W + 0.65 S');
    expect(l).toContain('1.0 D + 1.3 L + 1.3 Lr + 1.3 W');
    expect(l.some((x) => x.includes('Lr') && x.includes(' S'))).toBe(false);
  });
  it('temperature (6.4) and fluid at 1,4 where there is live load (6.2.6 e)', () => {
    const l = labels(present({ T: true, F: true }));
    expect(l).toEqual(['1.4 D + 1.6 L + 1.4 F', '1.0 D + 1.2 L + 1.2 T + 1.4 F']);
  });
  it('service: every factor 1,0, no earthquake', () => {
    const s = ts500Service(present({ W: true, E: true, S: true }));
    expect(s.every((c) => c.purpose === 'service')).toBe(true);
    expect(s.map((c) => c.label)).toEqual(['1.0 D + 1.0 L + 1.0 S', '1.0 D + 1.0 L + 1.0 S + 0.5 W', '1.0 D + 1.0 L + 1.0 W + 0.5 S', '1.0 D + 1.0 W']);
  });
});
