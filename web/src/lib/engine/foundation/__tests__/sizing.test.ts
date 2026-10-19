/**
 * Sizing by hand. An isolated footing under 0,40 m, 1000 kN service and 1400 kN factored, on
 * 200 kPa: the plan grows until (1000 + 25·t·B²)/B² ≤ 200, the thickness until shear and punching
 * hold. Minimum mode never goes under the size it is given; reinforce and a locked size leave it.
 */
import { describe, it, expect } from 'vitest';
import { sizeFooting } from '../sizing';
import { designGeneralFooting } from '../general-footing';
import { newFooting, type Footing } from '../../../model/footing';

const OPTS = { cover: 0.05, foundingElevation: -1.5, soilProfileId: 1 };
const base = (over: Partial<Footing> = {}): Footing => ({ ...newFooting(1, 1, 'Z1', OPTS), B: 1, L: 1, thickness: 0.3, ...over });
const input = (footing: Footing) => ({
  footing, nodes: new Map([[1, { x: 0, y: 0 }]]),
  reactions: new Map([[1, {
    factored: [{ combinationId: 1, combinationName: '1,2D+1,6L', fz: 1400, mx: 0, my: 0 }],
    cases: [{ caseId: 1, caseType: 'D', fz: 1000, mx: 0, my: 0 }],
  }]]),
  columnAt: () => ({ elementId: 5, b: 0.4, h: 0.4 }), fc: 25, fy: 420, allowable: 200,
  barDiameterMm: { x: 16, y: 16 }, edition: '2025' as const,
});

describe('sizing a footing', () => {
  it('grows from a small start until bearing, shear and punching hold', () => {
    const r = sizeFooting({ ...input(base()), mode: 'minimum' });
    expect(r.reached).toBe(true);
    const f = { ...base(), ...r.size };
    expect((1000 + 25 * f.thickness * f.B * f.L) / (f.B * f.L)).toBeLessThanOrEqual(200 + 1e-6);
    const d = designGeneralFooting({ ...input(f) });
    if ('refused' in d) throw new Error(d.refused);
    expect(d.utilization).toBeLessThanOrEqual(1);
    // One step less of plan would not bear.
    const B = f.B - 0.1;
    expect((1000 + 25 * f.thickness * B * B) / (B * B)).toBeGreaterThan(200);
  });

  it('never goes under the size it is given in minimum mode', () => {
    const r = sizeFooting({ ...input(base({ B: 3.5, L: 3.5, thickness: 0.8 })), mode: 'minimum' });
    expect(r.reached).toBe(true);
    expect(r.size).toEqual({});
  });

  it('starts over from the pre-size in full mode, which may shrink it', () => {
    const r = sizeFooting({ ...input(base({ B: 3.5, L: 3.5, thickness: 0.8 })), mode: 'full' });
    expect(r.reached).toBe(true);
    expect(r.size.B!).toBeLessThan(3.5);
  });

  it('leaves a locked size and the reinforce mode alone', () => {
    expect(sizeFooting({ ...input(base({ locked: { dimensions: true } })), mode: 'full' }).reason).toBe('locked');
    expect(sizeFooting({ ...input(base()), mode: 'reinforce' }).size).toEqual({});
  });

  it('keeps a footing at a property line against it as it grows', () => {
    const r = sizeFooting({ ...input(base({ anchor: [1, 0] })), mode: 'minimum' });
    const f = { ...base(), ...r.size };
    // Column face at the footing's +B edge: centroid at −(B/2 − 0,20) from the column.
    expect(f.eccentricityB).toBeCloseTo(-(f.B / 2 - 0.2), 9);
  });
});
