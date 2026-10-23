import { describe, expect, it } from 'vitest';
import { beamCageContinuityAlternatives, beamContinuityAlternatives } from '../beam-continuity-alternatives';
import { syntheticBeamContext } from '../../design/__tests__/helpers';
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';

const reinforcement = (count: number, diameter: number): ProvidedReinforcement => ({ regions: {
  topStart: { count, diameter }, topEnd: { count, diameter },
  topStartLayers: [{ count, diameter, row: 0 }], topEndLayers: [{ count, diameter, row: 0 }],
  bottomSpan: { count: 3, diameter: 16 }, stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 },
} });
const contexts = () => [syntheticBeamContext(), syntheticBeamContext({ elementId: 2 })] as const;

describe('paired top continuity patterns', () => {
  it('offers balanced bottom rows and one extra row with the same steel for a crowded joint', () => {
    const ctx = contexts(), current = [reinforcement(6, 16), reinforcement(6, 16)];
    for (const c of ctx) {
      c.material.longDiametersMm = [16];
      c.stations = { comboResults: [{ stations: [
        { t: 0, my: -300, vz: 0 }, { t: 0.5, my: 300, vz: 0 }, { t: 1, my: -300, vz: 0 },
      ] }] } as never;
    }
    const before = structuredClone(current);
    for (const face of ['bottom'] as const) {
      const proposals = [...beamContinuityAlternatives(ctx, current, face, 'demand')];
      const packed = proposals[0].layers, balanced = proposals[1].layers;
      expect(packed.map(l => l.count)).toEqual([6, 3]);
      expect(balanced.map(l => l.count)).toEqual([5, 4]);
      expect(proposals[2].layers.map(l => l.count)).toEqual([3, 3, 3]);
      expect(new Set(proposals.map(p => JSON.stringify(p.layers))).size).toBe(proposals.length);
      for (const p of proposals) {
        expect(p.layers.every(l => l.count >= 2 && l.count <= 6 && l.diameter === 16)).toBe(true);
        for (const r of p.reinforcement) expect(r.regions!.bottomSpanLayers)
          .toEqual(p.layers);
      }
    }
    expect(current).toEqual(before);
  });

  it('seeds from forces instead of ratcheting up the retained steel, and requires force data', () => {
    const ctx = contexts(), current = [reinforcement(6, 16), reinforcement(6, 16)];
    for (const c of ctx) {
      c.material.longDiametersMm = [16];
      c.stations = { comboResults: [{ stations: [
        { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
      ] }] } as never;
    }
    for (const r of current) r.regions!.bottomSpan = { count: 5, diameter: 16 };
    const before = structuredClone(current);
    const proposals = [...beamCageContinuityAlternatives(ctx, current, 'all', 'demand')];
    expect(proposals).toHaveLength(12);
    expect([proposals[0].layers[0].count, proposals[0].bottomLayers![0].count]).toEqual([4, 3]);
    expect(new Set(proposals.map(p => p.layers[0].count))).toEqual(new Set([3, 4, 5]));
    expect(new Set(proposals.map(p => p.bottomLayers![0].count))).toEqual(new Set([2, 3, 4]));
    expect(current).toEqual(before);
    for (const r of current) {
      r.regions!.topStartLayers![0].count++;
      r.regions!.topEndLayers![0].count++;
    }
    expect([...beamCageContinuityAlternatives(ctx, current, 'all', 'demand')].map(p => p.layers))
      .toEqual(proposals.map(p => p.layers));
    ctx[1].stations = undefined;
    expect([...beamCageContinuityAlternatives(ctx, current, 'all', 'demand')]).toEqual([]);
  });

  it('offers different catalog diameters on opposite faces without mixing a face or reducing its area seed', () => {
    const ctx = contexts(), current = [reinforcement(7, 12), reinforcement(8, 10)];
    for (const c of ctx) c.material.longDiametersMm = [12, 16];
    const before = structuredClone(current);
    const proposals = [...beamCageContinuityAlternatives(ctx, current, 'mixed')];
    expect(proposals).toHaveLength(8);
    expect(proposals.slice(0, 2).map(p => [p.layers[0].diameter, p.bottomLayers![0].diameter]))
      .toEqual([[16, 12], [12, 16]]);
    expect(new Set(proposals.map(p => `${p.layers[0].diameter}/${p.bottomLayers![0].diameter}`)))
      .toEqual(new Set(['12/16', '16/12']));
    for (const p of proposals) {
      expect(p.layers.reduce((a, l) => a + l.count * l.diameter ** 2, 0)).toBeGreaterThanOrEqual(7 * 12 ** 2);
      expect(p.bottomLayers!.reduce((a, l) => a + l.count * l.diameter ** 2, 0)).toBeGreaterThanOrEqual(3 * 16 ** 2);
      for (const r of p.reinforcement) {
        expect(r.regions!.topStartLayers).toEqual(p.layers);
        expect(r.regions!.topEndLayers).toEqual(p.layers);
        expect(r.regions!.bottomSpanLayers).toEqual(p.bottomLayers);
        expect(r.regions!.preserveBottomRows).toBe(true);
      }
    }
    expect(current).toEqual(before);
    ctx[1].material.longDiametersMm = [16];
    expect([...beamCageContinuityAlternatives(ctx, current, 'mixed')]).toEqual([]);
  });

  it('tries independent top and bottom areas in one common cage diameter without changing end intent', () => {
    const ctx = contexts(), current = [reinforcement(7, 12), reinforcement(8, 10)];
    ctx[1].material.longDiametersMm = [16];
    current[0].regions!.bottomSpan = { count: 5, diameter: 16 };
    current[0].regions!.bottomGroups = [{ layers: [{ count: 5, diameter: 16, row: 0 }], anchorageStart: 'hook' }];
    const before = structuredClone(current);
    const candidates = [...beamCageContinuityAlternatives(ctx, current)];
    expect(candidates.map(p => [p.layers[0].count, p.bottomLayers![0].count])).toEqual([
      [4, 5], [4, 6], [5, 5], [5, 6],
    ]);
    for (const p of candidates) p.reinforcement.forEach((r, i) => {
      expect(r.regions!.topStart).toEqual({ count: p.layers[0].count, diameter: 16 });
      expect(r.regions!.bottomSpan).toEqual({ count: p.bottomLayers![0].count, diameter: 16 });
      expect(r.regions!.bottomGroups?.[0].anchorageStart).toBe(before[i].regions!.bottomGroups?.[0].anchorageStart);
      expect(r.regions!.preserveBottomRows).toBe(true);
      expect(r.regions!.stirrupsSupport).toEqual(before[i].regions!.stirrupsSupport);
    });
    expect(current).toEqual(before);
    current[0].regions!.bottomGroups!.push({ layers: [{ count: 2, diameter: 12, row: 0 }] });
    expect([...beamCageContinuityAlternatives(ctx, current)]).toEqual([]);
  });

  it('offers a common catalog family absent from both original designs, with a bounded count/row search', () => {
    const ctx = contexts(), current = [reinforcement(7, 12), reinforcement(8, 10)];
    ctx[1].material.longDiametersMm = [16];
    const candidates = [...beamContinuityAlternatives(ctx, current, 'top', 'catalog')];
    expect(candidates.map(p => p.layers)).toEqual([
      [{ row: 0, count: 4, diameter: 16 }], [{ row: 0, count: 5, diameter: 16 }],
    ]);
    for (const p of candidates) for (const r of p.reinforcement) {
      expect(r.regions!.bottomSpan).toEqual(current[0].regions!.bottomSpan);
      expect(r.regions!.topStartLayers).toEqual(r.regions!.topEndLayers);
    }
    ctx[0].material.longDiametersMm = [12];
    expect([...beamContinuityAlternatives(ctx, current, 'top', 'catalog')]).toEqual([]);
  });

  it('preserves each member’s bottom end treatments and top/transverse steel when harmonizing the bottom', () => {
    const current = [reinforcement(4, 12), reinforcement(3, 16)];
    current[0].regions!.bottomGroups = [{ layers: [{ count: 3, diameter: 16, row: 0 }], anchorageStart: 'hook' }];
    current[1].regions!.bottomSpan = { count: 4, diameter: 12 };
    const before = structuredClone(current);
    const proposals = [...beamContinuityAlternatives(contexts(), current, 'bottom')];
    expect(proposals).toHaveLength(2);
    for (const proposal of proposals) proposal.reinforcement.forEach((r, i) => {
      expect(r.regions!.bottomSpanLayers).toEqual(proposal.layers);
      expect(r.regions!.topStart).toEqual(before[i].regions!.topStart);
      expect(r.regions!.stirrupsSupport).toEqual(before[i].regions!.stirrupsSupport);
      expect(r.regions!.preserveBottomRows).toBe(true);
      expect(r.regions!.bottomGroups?.[0].anchorageStart).toBe(before[i].regions!.bottomGroups?.[0].anchorageStart);
    });
    expect(current).toEqual(before);
    current[0].regions!.bottomGroups!.push({ layers: [{ count: 2, diameter: 12, row: 0 }] });
    expect([...beamContinuityAlternatives(contexts(), current, 'bottom')]).toEqual([]);
  });

  it('offers both existing families on both ends of both beams, without changing bottom or transverse steel', () => {
    const current = [reinforcement(4, 12), reinforcement(3, 16)] as const;
    const before = structuredClone(current);
    const alternatives = [...beamContinuityAlternatives(contexts(), current)];
    expect(alternatives).toHaveLength(2);
    expect(alternatives.map(a => a.layers)).toEqual([
      [{ count: 4, diameter: 12, row: 0 }], [{ count: 3, diameter: 16, row: 0 }],
    ]);
    for (const alternative of alternatives) for (const r of alternative.reinforcement) {
      expect(r.regions!.topStartLayers).toEqual(alternative.layers);
      expect(r.regions!.topEndLayers).toEqual(alternative.layers);
      expect(r.regions!.bottomSpan).toEqual(before[0].regions!.bottomSpan);
      expect(r.regions!.stirrupsSupport).toEqual(before[0].regions!.stirrupsSupport);
    }
    alternatives[0].reinforcement[0].regions!.topStartLayers![0].count = 99;
    expect(current).toEqual(before);
    expect(alternatives[0].reinforcement[1].regions!.topStartLayers![0].count).toBe(4);
  });

  it('intersects both project catalogs and checks fit in the receiving section', () => {
    const [a, b] = contexts();
    b.material = { ...b.material, longDiametersMm: [16] };
    const current = [reinforcement(4, 12), reinforcement(3, 16)] as const;
    expect([...beamContinuityAlternatives([a, b], current)].map(p => p.layers[0].diameter)).toEqual([16]);
    b.axes = { ...b.axes, bFlex: 0.08 };
    expect([...beamContinuityAlternatives([a, b], current)]).toEqual([]);
  });

  it.each(['curtailment', 'groups', 'span', 'mixed', 'fractional'] as const)('does not reinterpret unsupported %s intent', mode => {
    const [a, b] = contexts(), current = [reinforcement(4, 12), reinforcement(4, 12)] as const;
    if (mode === 'curtailment') current[0].regions!.continuity = { topStartIntoSpan: false };
    if (mode === 'groups') current[0].regions!.topStartGroups = [{ layers: [{ count: 4, diameter: 12, row: 0 }] }];
    if (mode === 'span') a.span = { elements: [1, 2], representative: 1 } as never;
    if (mode === 'mixed' || mode === 'fractional') for (const r of current) {
      const layers = mode === 'mixed' ? [{ count: 2, diameter: 12, row: 0 }, { count: 2, diameter: 16, row: 1 }]
        : [{ count: 2.5, diameter: 12, row: 0 }];
      r.regions!.topStartLayers = layers; r.regions!.topEndLayers = layers;
    }
    expect([...beamContinuityAlternatives([a, b], current)]).toEqual([]);
  });
});
