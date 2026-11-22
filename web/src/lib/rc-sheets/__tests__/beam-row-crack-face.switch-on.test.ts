/**
 * Crack control reads the faces in tension (§24.3.2): a beam that only hogs, as a strap beam does
 * from its footing to its partner, is not held to it on its bottom face, whose bars are in
 * compression however far apart they stand.
 */
import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { makeFmt } from '../format';

const fmt = makeFmt('.');
const column: BeamEnd = { kind: 'column', half: 0.2 };
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.055, stirrupDia: 8, diameters: [12, 16, 20], torsion: 'equilibrium' as const };
const sec = (x: number, neg: number): SectionEnv => ({ x, pos: { value: 0 }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });

describe('a beam that only hogs', () => {
  it('checks crack control on its top face only', () => {
    const L = 6, M = (x: number) => (x <= 0.6 ? 300 * x / 0.6 : 300 * (L - x) / (L - 0.6));
    const env = Array.from({ length: 31 }, (_, i) => { const x = (i * L) / 30; return { x, pos: 0, neg: M(x), v: 56 }; });
    const d: BeamDemand = {
      key: 'strap:a', name: 'VC', length: L, b: 0.4, h: 0.75, start: sec(0.2, M(0.2)), span: sec(0.6, 300), end: sec(L - 0.2, M(L - 0.2)),
      negAny: { value: 300 }, nNegAny: 0, vu: { value: 56 }, nAtV: 0, tu: { value: 0 }, combos: [], env,
      supportHalf: { start: 0.2, end: 0.2 }, ends: { start: { ...column, corner: true }, end: column },
    };
    const r = beamRow(d, ctx as never, { ...beamRow(d, ctx as never, undefined, fmt).adopted, bottom: [{ count: 2, dia: 12 }] }, fmt);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.crack')?.ok).toBe(true);
  });
});
