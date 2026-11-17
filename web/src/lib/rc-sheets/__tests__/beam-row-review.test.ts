import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type SectionEnv } from '../beam-row';
import { makeFmt } from '../format';
import type { BeamAdopted } from '../types';

const fmt = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const sec = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const demand = (o: Partial<BeamDemand> = {}): BeamDemand => ({
  key: 'beam:1:0', name: 'V1', length: 5, b: 0.3, h: 0.6,
  start: sec(0, 0, 80), span: sec(2.5, 60, 0), end: sec(5, 0, 80),
  negAny: { value: 80 }, nNegAny: 0, vu: { value: 120 }, nAtV: 0, tu: { value: 25 }, combos: [], ...o,
});
const bars = (dia: number): BeamAdopted => ({ bottom: [{ count: 3, dia: 16 }], top: [{ count: 4, dia: 16 }], stirrups: { dia, legs: 2, spacing: 0.1 }, torsionLong: { count: 6, dia: 12 } });
const perLeg = (r: ReturnType<typeof beamRow>) => r.verifications.find((v) => v.label === 'rcSheets.v.stirrupsVT')!.demand;

describe('a beam under torsion', () => {
  it('reads Aoh and its torsion steel with the stirrup it holds, not the one the context assumes', () => {
    const thin = beamRow(demand(), ctx, bars(8), fmt), thick = beamRow(demand(), ctx, bars(12), fmt);
    const al = (r: ReturnType<typeof beamRow>) => parseFloat(r.verifications.find((v) => v.label === 'rcSheets.v.al')!.demand!);
    expect(al(thick)).toBeGreaterThan(al(thin));
    expect(parseFloat(perLeg(thick)!)).toBeGreaterThan(parseFloat(perLeg(thin)!));
  });

  it('writes its flange formula without words of one language', () => {
    const r = beamRow(demand({ flange: { bf: 1.2, hf: 0.12 } }), ctx, undefined, fmt);
    const f = r.steps.flatMap((g) => g.steps).find((s) => s.label === 'rcSheets.s.flange')!;
    expect(f.formula).not.toMatch(/Tabla|Table/);
  });
});
