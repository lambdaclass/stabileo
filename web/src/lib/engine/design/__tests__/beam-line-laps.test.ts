/**
 * A lap carries what one of its bars carries.
 *
 * Inside a lap the force passes from one bar to the other: the section there has one bar's worth of
 * steel per pair. Before, a bar cut with a lap read both halves at the lap: 8Ø10 where 4Ø10 carry
 * the moment, twice the flexural steel (unconservative) and a row that "did not fit".
 */
import { describe, it, expect } from 'vitest';
import { areaAt, barsCarrying, lineLaps, membersFromLine, type LineMember } from '../beam-line';
import type { BeamLineReinforcement } from '../../../design-contract/beam-line';

const line: BeamLineReinforcement = {
  version: 1, members: [1], lengths: [5],
  bars: [
    { id: 'a', face: 'bottom', row: 0, count: 4, diameter: 10, from: 0, to: 3, role: 'main' },
    { id: 'b', face: 'bottom', row: 0, count: 4, diameter: 10, from: 2, to: 5, role: 'main' },
    { id: 't', face: 'top', row: 0, count: 2, diameter: 10, from: 0, to: 5, role: 'mounting' },
  ],
  stirrups: [{ id: 'z', from: 0, to: 5, diameter: 6, legs: 2, spacing: 0.2 }],
};

describe('a lap drawn in a beam line', () => {
  it('is found where one bar ends inside the other, with its length', () => {
    expect(lineLaps(line)).toEqual([{ face: 'bottom', row: 0, a: 'a', b: 'b', from: 2, to: 3, length: 1, diameterMm: 10, count: 4 }]);
  });

  it('carries one bar per pair inside it, and both bars only outside it', () => {
    expect(barsCarrying(line, 'bottom', 2.5).map((b) => b.id)).toEqual(['b']);
    expect(barsCarrying(line, 'bottom', 1).map((b) => b.id)).toEqual(['a']);
    // 4Ø10 = 4 · π · 1² / 4 = 3,1416 cm², not twice that.
    expect(areaAt(line, 'bottom', 2.5)).toBeCloseTo(4 * Math.PI / 4, 6);
  });

  it('projects 4Ø10 at the span, not 8Ø10', () => {
    const m: LineMember = { id: 1, L: 5, tStart: 0.25, tEnd: 0.25, faceStart: 0.2, faceEnd: 0.2 };
    const r = membersFromLine(line, [m]).get(1)!;
    expect(r.regions!.bottomSpan).toEqual({ count: 4, diameter: 10 });
  });
});
