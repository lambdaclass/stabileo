import { describe, expect, it } from 'vitest';
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';
import { syntheticBeamContext } from '../../design/__tests__/helpers';
import { beamStirrupContinuityAlternatives } from '../beam-stirrup-alternatives';

const reinforcement = (diameter: number): ProvidedReinforcement => ({ regions: {
  topStart: { count: 4, diameter: 16 }, topEnd: { count: 4, diameter: 16 },
  bottomSpan: { count: 7, diameter: 12 }, preserveBottomRows: true,
  bottomGroups: [{ layers: [{ row: 0, count: 4, diameter: 12 }, { row: 1, count: 3, diameter: 12 }],
    anchorageStart: 'hook', anchorageEnd: 'hook' }],
  stirrupsSupport: { diameter, legs: 4, spacing: 0.075 },
  stirrupsSpan: { diameter, legs: 2, spacing: 0.15 },
} });
const contexts = () => [syntheticBeamContext(), syntheticBeamContext({ elementId: 2 })];

describe('transverse continuity alternatives', () => {
  it('aligns different cages using common allowed diameters without weakening transverse steel', () => {
    const ctx = contexts(), current = [reinforcement(6), reinforcement(10)];
    for (const c of ctx) c.material.stirrupDiametersMm = [6, 8, 10, 12];
    const before = structuredClone(current);
    const proposals = [...beamStirrupContinuityAlternatives(ctx, current)];
    expect(proposals.map(p => p.stirrupDiameterMm)).toEqual([10, 12]);
    for (const p of proposals) {
      expect(p.layers).toEqual([]);
      for (const [i, r] of p.reinforcement.entries()) {
        for (const key of ['stirrupsSupport', 'stirrupsSpan'] as const) {
          const old = current[i].regions![key]!, next = r.regions![key]!;
          expect(next).toEqual({ ...old, diameter: p.stirrupDiameterMm });
          expect(next.legs * next.diameter ** 2 / next.spacing)
            .toBeGreaterThanOrEqual(old.legs * old.diameter ** 2 / old.spacing);
        }
        const { stirrupsSupport: _a, stirrupsSpan: _b, ...remaining } = r.regions!;
        const { stirrupsSupport: _c, stirrupsSpan: _d, ...original } = current[i].regions!;
        expect(remaining).toEqual(original);
      }
    }
    expect(current).toEqual(before);
    ctx[1].material.stirrupDiametersMm = [8, 10];
    expect([...beamStirrupContinuityAlternatives(ctx, current)].map(p => p.stirrupDiameterMm)).toEqual([10]);
  });

  it('resolves legacy stirrups without leaving a larger fallback cage behind', () => {
    const ctx = contexts(), current = [reinforcement(6), reinforcement(10)];
    delete current[0].regions!.stirrupsSupport;
    delete current[0].regions!.stirrupsSpan;
    current[0].stirrups = { diameter: 12, legs: 2, spacing: 0.125 };
    for (const c of ctx) c.material.stirrupDiametersMm = [6, 8, 10, 12];
    const proposals = [...beamStirrupContinuityAlternatives(ctx, current)];
    expect(proposals.map(p => p.stirrupDiameterMm)).toEqual([12, 10]);
    expect(proposals[0].stirrupDiameterMm).toBe(12);
    expect(proposals[0].reinforcement[0].regions!.stirrupsSupport).toEqual(current[0].stirrups);
    expect(proposals[0].reinforcement[1].regions!.stirrupsSpan).toEqual({ diameter: 12, legs: 2, spacing: 0.15 });
    expect(proposals[1].reinforcement[0].stirrups).toEqual({ diameter: 10, legs: 2, spacing: 0.075 });
  });

  it('compensates a smaller diameter on the spacing grid without widening any existing zone', () => {
    const ctx = contexts(), current = [reinforcement(6), reinforcement(10)];
    for (const c of ctx) c.material.stirrupDiametersMm = [6, 8, 10, 12];
    for (const [i, r] of current.entries()) for (const key of ['stirrupsSupport', 'stirrupsSpan'] as const)
      r.regions![key]!.spacing = i ? 0.275 : 0.175;
    const proposals = [...beamStirrupContinuityAlternatives(ctx, current)];
    expect(proposals.map(p => p.stirrupDiameterMm)).toEqual([10, 8, 6, 12]);
    expect(proposals[1].reinforcement[1].regions!.stirrupsSupport!.spacing).toBe(0.175);
    expect(proposals[2].reinforcement[1].regions!.stirrupsSupport!.spacing).toBe(0.075);
    for (const p of proposals) for (const [i, r] of p.reinforcement.entries())
      for (const key of ['stirrupsSupport', 'stirrupsSpan'] as const) {
        const old = current[i].regions![key]!, next = r.regions![key]!;
        expect(next.spacing).toBeLessThanOrEqual(old.spacing);
        expect(next.legs * next.diameter ** 2 / next.spacing)
          .toBeGreaterThanOrEqual(old.legs * old.diameter ** 2 / old.spacing);
      }
  });

  it.each(['uniform', 'catalog', 'span', 'continuity', 'missing', 'zeroSpacing', 'nanDiameter', 'oneLeg'] as const)(
    'does not propose an unsuitable or unneeded change (%s)', reason => {
      const ctx = contexts(), current = [reinforcement(6), reinforcement(10)];
      if (reason === 'uniform') current[0] = reinforcement(10);
      if (reason === 'catalog') ctx[0].material.stirrupDiametersMm = [6, 8];
      if (reason === 'span') ctx[0].span = { elements: [1, 2], representative: 1 } as never;
      if (reason === 'continuity') current[0].regions!.continuity = {} as never;
      if (reason === 'missing') delete current[0].regions!.stirrupsSpan;
      if (reason === 'zeroSpacing') current[0].regions!.stirrupsSpan!.spacing = 0;
      if (reason === 'nanDiameter') current[0].regions!.stirrupsSpan!.diameter = NaN;
      if (reason === 'oneLeg') current[0].regions!.stirrupsSpan!.legs = 1;
      expect([...beamStirrupContinuityAlternatives(ctx, current)]).toEqual([]);
    });
});
