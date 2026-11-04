/**
 * How `runOtherCode` keeps one reading per member over its demands: a check the engine left out
 * at one demand stays named whatever the other demands read, and the member never passes for it.
 */
import { describe, it, expect } from 'vitest';
import { runOtherCode } from '../run';
import type { MemberContext, OtherCode } from '../types';

const demand = (k: number) => ({ category: 'My+' as const, value: 1, absValue: 1, comboId: k, comboName: `C${k}`, stationT: 0, stationX: 0, forces: { t: 0, x: 0, n: 0, vy: 0, vz: 0, my: 1, mz: 0, torsion: 0 } });
const ctx = { elementId: 7, demands: [demand(1), demand(2)] } as unknown as MemberContext;

/** A checker that reads 0,5 with one check left out at the first demand, and 0,8 with none at the second. */
const fake: OtherCode = {
  id: 'ec3', family: 'steel', labelKey: '', coverageKey: '',
  member: () => ({ data: { elementId: 7 } }),
  forces: (_c, d) => ({ elementId: 7, k: d.comboId }),
  // As the engine's checkers do: each result under the id of the member row it read.
  run: (input) => (input.forces as Array<{ elementId: number; k: number }>).map((f) => ({ elementId: f.elementId, k: f.k })),
  read: (r) => (r.k === 1
    ? { ratio: 0.5, governing: 'g', pass: true, unevaluated: ['otherCodes.check.ec3Interaction'] }
    : { ratio: 0.8, governing: 'g', pass: true, unevaluated: [] }),
};

describe('runOtherCode keeps what was left out', () => {
  it('the worst ratio governs, and the unevaluated check of another demand stays with it', () => {
    const row = runOtherCode(fake, [ctx]).rows[0]!;
    expect(row.status).toBe('checked');
    if (row.status !== 'checked') return;
    expect(row.reading.ratio).toBe(0.8);
    expect(row.comboName).toBe('C2');
    expect(row.reading.unevaluated).toEqual(['otherCodes.check.ec3Interaction']);
    expect(row.reading.pass).toBe(false);
  });
});
