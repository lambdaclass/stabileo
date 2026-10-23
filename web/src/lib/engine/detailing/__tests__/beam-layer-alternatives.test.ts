import { describe, expect, it } from 'vitest';
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';
import { syntheticBeamContext } from '../../design/__tests__/helpers';
import { beamLayerAlternatives } from '../beam-layer-alternatives';

function cage(counts = [4, 2]): ProvidedReinforcement {
  return { regions: {
    bottomSpan: { count: counts.reduce((a, b) => a + b, 0), diameter: 16 },
    bottomSpanLayers: counts.map((count, row) => ({ count, row, diameter: 16 })),
    topStart: { count: 2, diameter: 12 }, topEnd: { count: 2, diameter: 12 },
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 },
    stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
  } };
}

describe('repairs starting from existing beam layers', () => {
  it('offers the certified populations themselves before changing them', () => {
    const ctx = syntheticBeamContext(), input = cage();
    const before = JSON.stringify(input);
    const [proposal] = [...beamLayerAlternatives(ctx, input, true)];
    expect(proposal.counts).toEqual([4, 2]);
    expect(proposal.reinforcement).toEqual({ ...input, regions: { ...input.regions, preserveBottomRows: true } });
    expect(JSON.stringify(input)).toBe(before);
    expect([...beamLayerAlternatives(ctx, proposal.reinforcement, true)]).toEqual([]);
    expect([...beamLayerAlternatives(ctx, cage([2, 4]), true)]).toEqual([]);
    expect([...beamLayerAlternatives({ ...ctx, span: {} as never }, input, true)]).toEqual([]);
  });

  it('preserves authoritative groups, cutoffs and hooks in a placement-only proposal', () => {
    const input = cage();
    input.regions!.bottomGroups = [{ layers: input.regions!.bottomSpanLayers!,
      continueStart: false, extensionStart: 0.4, anchorageEnd: 'hook' }];
    const [proposal] = [...beamLayerAlternatives(syntheticBeamContext(), input, true)];
    expect(proposal.reinforcement.regions!.bottomGroups).toEqual(input.regions!.bottomGroups);
    expect(proposal.reinforcement.regions!.bottomSpanLayers).toEqual(input.regions!.bottomSpanLayers);
    input.regions!.bottomGroups.push({ layers: [{ count: 2, row: 0, diameter: 12 }] });
    expect([...beamLayerAlternatives(syntheticBeamContext(), input, true)]).toEqual([]);
  });

  it('preserves steel, diameters, regions and the input while offering different seats', () => {
    const input = cage();
    const before = JSON.stringify(input);
    const alternatives = [...beamLayerAlternatives(syntheticBeamContext(), input)];
    expect(alternatives.map(a => a.counts)).toEqual([[3, 3]]);
    const changed = alternatives[0].reinforcement;
    expect(changed.regions!.bottomSpan).toEqual(input.regions!.bottomSpan);
    expect(changed.regions!.topStart).toEqual(input.regions!.topStart);
    expect(changed.regions!.stirrupsSupport).toEqual(input.regions!.stirrupsSupport);
    changed.regions!.bottomSpanLayers![0].count = 99;
    expect(JSON.stringify(input)).toBe(before);
  });

  it('updates the authoritative group without losing curtailment or hook treatments', () => {
    const input = cage();
    const group = { layers: input.regions!.bottomSpanLayers!, continueStart: false, continueEnd: true,
      extensionStart: 0.4, extensionEnd: 0.7, anchorageEnd: 'hook' as const };
    input.regions!.bottomGroups = [group];
    const [a] = [...beamLayerAlternatives(syntheticBeamContext(), input)];
    expect(a.reinforcement.regions!.bottomGroups![0]).toEqual({ ...group,
      layers: [{ count: 3, row: 0, diameter: 16 }, { count: 3, row: 1, diameter: 16 }],
    });
    expect(a.reinforcement.regions!.bottomSpanLayers).toEqual(a.reinforcement.regions!.bottomGroups![0].layers);
    expect(input.regions!.bottomGroups[0]).toEqual(group);
  });

  it('enumerates all one-bar adjacent transfers within the finite row bounds', () => {
    const ctx = syntheticBeamContext();
    // For this width and Ø16 the existing enumerator permits six bars per row.
    for (let x = 2; x <= 6; x++) for (let y = 2; y <= 6; y++) for (let z = 2; z <= 6; z++) {
      const original = [x, y, z];
      const expected: number[][] = [];
      for (let a = 2; a <= 6; a++) for (let b = 2; b <= 6; b++) for (let c = 2; c <= 6; c++) {
        const delta = [a - x, b - y, c - z];
        if (a + b + c !== x + y + z || delta.reduce((n, d) => n + Math.abs(d), 0) !== 2) continue;
        if (a < b || b < c) continue;
        if (delta[0] && delta[2]) continue; // Only neighboring rows in this operator.
        expected.push([a, b, c]);
      }
      const actual = [...beamLayerAlternatives(ctx, cage(original))].map(a => a.counts);
      expect(actual.map(String).sort(), original.join(',')).toEqual(expected.map(String).sort());
    }
  });

  it('leaves unsupported group, diameter and span arrangements untouched', () => {
    const ctx = syntheticBeamContext();
    const input = cage();
    input.regions!.bottomGroups = [{ layers: input.regions!.bottomSpanLayers! }, { layers: [{ count: 2, row: 0, diameter: 12 }] }];
    expect([...beamLayerAlternatives(ctx, input)]).toEqual([]);
    expect([...beamLayerAlternatives({ ...ctx, span: {} as never }, cage())]).toEqual([]);
    expect([...beamLayerAlternatives({ ...ctx, material: { ...ctx.material, longDiametersMm: [12] } }, cage())]).toEqual([]);
    const mixed = cage();
    mixed.regions!.bottomSpanLayers![1].diameter = 12;
    expect([...beamLayerAlternatives(ctx, mixed)]).toEqual([]);
  });
});
