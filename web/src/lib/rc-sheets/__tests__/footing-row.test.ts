/**
 * The footing family against hand calculations: the soil pressure under a centred and an
 * eccentric base (with part of it lifting), the moment and shear at the column face, punching at
 * d/2, the band of a rectangular footing, the anchorage of short cantilevers, the dowels, and the
 * codes that design no footings.
 */
import { describe, it, expect } from 'vitest';
import { footingRow, aciFootingRow, uncoveredFootingRow } from '../footing-row';
import { atBase, fieldOf, serviceBearing } from '../footing-mechanics';
import { bandShare, meshArea, meshSpan } from '../footing-mesh';
import { makeFmt } from '../format';
import { barArea } from '../bars';
import type { FootingAdopted, FootingContext, FootingDemand } from '../footing-types';

const fmt = makeFmt('.');
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.055, sizing: 'full', diameters: [10, 12, 16, 20, 25], preferred: { x: 12, y: 12 }, columnBars: { count: 8, dia: 16, tension: false } };

function demand(over: Partial<FootingDemand> = {}): FootingDemand {
  return {
    key: 'footing:n1', name: 'C1', nodeId: 1, at: { x: 0, y: 0, z: 0 }, column: { b: 0.4, h: 0.4 },
    service: { combo: 'D + L', N: 800, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
    combos: [{ combo: '1.2D+1.6L', N: 1100, Mx: 0, My: 0, Vx: 0, Vy: 0 }],
    soil: { name: 'S', allowable: 200 }, ...over,
  };
}

const square = (B: number, h: number, dia = 12, s = 0.15): FootingAdopted => ({ B, L: B, h, ex: 0, ey: 0, x: { dia, spacing: s }, y: { dia, spacing: s }, dowels: { count: 8, dia: 16 } });

describe('the soil under a rigid base', () => {
  it('is N/A with the resultant at the centre', () => {
    const f = fieldOf({ B: 2, L: 2, xc: 0, yc: 0, b: 0.4, h: 0.4 }, { combo: 'k', N: 800, Mx: 0, My: 0, Vx: 0, Vy: 0 }, 0.5);
    expect(f.qMax).toBeCloseTo(200, 6);
    expect(f.contact).toBe(1);
  });

  it('lifts a quarter of the base when the resultant leaves the kern at B/4: qmax = 2N/(3·L·(B/2 − e))', () => {
    const f = fieldOf({ B: 2, L: 2, xc: 0, yc: 0, b: 0.4, h: 0.4 }, { combo: 'k', N: 500, Mx: 0, My: 250, Vx: 0, Vy: 0 }, 0);
    expect(f.qMax).toBeCloseTo((2 * 500) / (3 * 2 * 0.5), -1);
    expect(f.contact).toBeCloseTo(0.75, 1);
  });

  it('takes the shear at the support down to the base and the column off the centroid', () => {
    const r = atBase({ N: 100, Mx: 10, My: 20, Vx: 5, Vy: 4 }, { xc: 0.3, yc: -0.2 }, 1.5);
    expect(r.my).toBeCloseTo(20 + 1.5 * 5 + 100 * 0.3, 9);
    expect(r.mx).toBeCloseTo(-(10 - 1.5 * 4 - 100 * -0.2), 9);
  });

  it('adds the footing and the fill to the service load', () => {
    const s = serviceBearing({ B: 2, L: 2, xc: 0, yc: 0, b: 0.4, h: 0.4 }, { combo: 's', N: 800, Mx: 0, My: 0, Vx: 0, Vy: 0 }, 0.5, 1.5, 18);
    expect(s.weight).toBeCloseTo((25 * 0.5 + 18 * 1.0) * 4, 9);
    expect(s.qMean).toBeCloseTo((800 + s.weight) / 4, 9);
  });
});

describe('a centred square footing', () => {
  const a = square(2.2, 0.5, 12, 0.12);
  const r = footingRow(demand(), ctx, a, fmt);
  const qu = 1100 / 2.2 ** 2, c = (2.2 - 0.4) / 2;

  it('reads the moment at the column face over the whole width (§13.2.6.6, §13.2.7.1)', () => {
    expect(r.x!.mu).toBeCloseTo((qu * 2.2 * c ** 2) / 2, 0);
    expect(r.y!.mu).toBeCloseTo(r.x!.mu, 6);
  });

  it('reads one-way shear d from the face and checks it against 0,17·√f′c·b·d (§13.2.6.2)', () => {
    const d = r.x!.d;
    expect(r.x!.vu).toBeCloseTo(qu * 2.2 * (c - d), 0);
    expect(r.x!.phiVc).toBeCloseTo(0.75 * 0.17 * 5 * 2.2 * d * 1000, 3);
  });

  it('punches at d/2 with the soil inside the perimeter taken off, λs = 1', () => {
    const d = r.layers.d, side = 0.4 + d;
    const vu = (1100 - qu * side * side) / (4 * side * d) / 1000;
    expect(r.punching!.vu).toBeCloseTo(vu, 2);
    expect(r.punching!.phiVc).toBeCloseTo(0.75 * 0.33 * 5, 6);
  });

  it('puts the lower layer along the longer side with d = h − c − db/2', () => {
    expect(r.layers.lower).toBe('x');
    expect(r.layers.dx).toBeCloseTo(0.5 - 0.055 - 0.006, 9);
    expect(r.layers.dy).toBeCloseTo(0.5 - 0.055 - 0.012 - 0.006, 9);
  });

  it('asks 0,0018·b·h at least (§8.6.1.1) and lays the bars within the cover', () => {
    expect(r.x!.asMin).toBeCloseTo(0.0018 * 0.5 * 2.2 * 1e4, 6);
    const span = meshSpan('x', a, a.x, 0.055);
    expect(span.positions[0]).toBeCloseTo(-1.1 + 0.055 + 0.006, 9);
    expect(Math.max(...span.positions.slice(1).map((p, i) => p - span.positions[i]!))).toBeLessThanOrEqual(0.12 + 1e-9);
  });

  it('develops the dowels in compression into the depth over the mesh (§25.4.9)', () => {
    expect(r.dowels!.ldc).toBeCloseTo((0.24 * 420) / 5 * 16 / 1000, 6);
    expect(r.dowels!.available).toBeCloseTo(0.5 - 0.055 - 0.024, 9);
    expect(r.status).toBe('ok');
  });
});

describe('the proposal', () => {
  it('reaches the least plan the soil takes, 10 cm at a time, and a thickness that holds', () => {
    const r = footingRow(demand(), ctx, undefined, fmt);
    expect(r.sizing).toMatchObject({ from: 'loads', reached: true });
    expect(r.bearing!.ok).toBe(true);
    expect(r.status).toBe('ok');
    const smaller = footingRow(demand(), ctx, { ...r.adopted, B: r.B - 0.1, L: r.L - 0.1 }, fmt);
    expect(smaller.bearing!.ok).toBe(false);
    const thinner = footingRow(demand(), ctx, { ...r.adopted, h: r.h - 0.05 }, fmt);
    expect(thinner.status).toBe('fail');
  });

  it('keeps the modelled footing as the least it may be, or as it is', () => {
    const big = demand({ footing: { id: 1, name: 'Z1', B: 3, L: 3, h: 0.6, ex: 0, ey: 0, cover: 0.05, founding: -1.2 } });
    const min = footingRow(big, { ...ctx, sizing: 'minimum' }, undefined, fmt);
    expect([min.B, min.L, min.h]).toEqual([3, 3, 0.6]);
    const small = demand({ footing: { id: 1, name: 'Z1', B: 1, L: 1, h: 0.4, ex: 0, ey: 0, cover: 0.05, founding: -1.2 } });
    expect(footingRow(small, { ...ctx, sizing: 'minimum' }, undefined, fmt).B).toBeGreaterThan(1);
    const kept = footingRow(small, { ...ctx, sizing: 'reinforce' }, undefined, fmt);
    expect([kept.B, kept.L, kept.h, kept.sizing.from]).toEqual([1, 1, 0.4, 'model']);
    expect(kept.status).toBe('fail');
  });

  it('holds a column at a property line there as the plan grows', () => {
    const r = footingRow(demand({ footing: { id: 1, name: 'Z1', B: 0, L: 0, h: 0.5, ex: 0, ey: 0, cover: 0.05, founding: -1, anchor: [1, 0] } }), ctx, undefined, fmt);
    expect(r.ex).toBeCloseTo(-(r.B / 2 - 0.2), 9);
    expect(r.punching!.position).not.toBe('interior');
  });
});

describe('a rectangular footing', () => {
  it('puts 2/(β + 1) of the short bars in a band as wide as the short side (§13.3.3.3)', () => {
    const r = footingRow(demand({ column: { b: 0.3, h: 0.6 } }), ctx, { B: 2, L: 3, h: 0.55, ex: 0, ey: 0, x: { dia: 12, spacing: 0.1, outer: 0.2 }, y: { dia: 12, spacing: 0.15 }, dowels: { count: 8, dia: 16 } }, fmt);
    expect(r.x!.band!.share).toBeCloseTo(2 / (1.5 + 1), 9);
    expect(bandShare(2, 3)).toBeCloseTo(0.8, 9);
    const span = meshArea('x', r.adopted, r.adopted.x, 0.055);
    expect(r.x!.band!.asProvided).toBeCloseTo(span.band, 9);
    expect(span.band).toBeGreaterThan(0.8 * span.area - barArea(12));
    expect(r.y!.band).toBeUndefined();
    expect(r.verifications.some((v) => v.label === 'rcSheets.v.footBandX')).toBe(true);
  });
});

describe('anchorage', () => {
  it('hooks the bars when ld does not fit between the face and the end, and fails when ldh does not either', () => {
    const tight = footingRow(demand({ service: { combo: 's', N: 150, Mx: 0, My: 0, Vx: 0, Vy: 0 }, combos: [{ combo: 'u', N: 210, Mx: 0, My: 0, Vx: 0, Vy: 0 }] }), ctx, square(1.0, 0.5, 20, 0.15), fmt);
    expect(tight.x!.anchorage.hooked).toBe(true);
    expect(tight.x!.anchorage.available).toBeCloseTo(0.3 - 0.055, 9);
    expect(tight.x!.anchorage.ok).toBe(tight.x!.anchorage.ld <= 0.245 + 1e-9);
  });
});

describe('what a row says it cannot do', () => {
  it('asks for the soil when the project states none, and designs nothing', () => {
    const r = footingRow(demand({ soil: null }), ctx, undefined, fmt);
    expect(r.status).toBe('none');
    expect(r.verifications.map((v) => v.label)).toEqual(['rcSheets.v.footNoSoil']);
  });

  it('leaves combined and turned footings out with a line', () => {
    const r = footingRow(demand({ footing: { id: 1, name: 'Z1', B: 2, L: 4, h: 0.5, ex: 0, ey: 0, cover: 0.05, founding: -1, outOfScope: 'kind' } }), ctx, undefined, fmt);
    expect(r.status).toBe('none');
    expect(r.verifications[0]!.label).toBe('rcSheets.v.footOut.kind');
  });

  it('under a code with no footings reads the soil and says the rest is not covered', () => {
    const r = uncoveredFootingRow(demand(), ctx, undefined, fmt);
    expect(r.status).toBe('none');
    expect(r.uncovered).toBe(true);
    expect(r.verifications.map((v) => v.label)).toEqual(['rcSheets.v.footBearing', 'rcSheets.v.footContact', 'rcSheets.v.footCodeOut']);
    expect(r.bearing!.ok).toBe(true);
    expect(r.adopted.x.dia).toBe(0);
  });
});

describe('ACI 318-19', () => {
  it('reads one-way shear with ρw (Table 22.5.5.1(c), λs = 1) where CIRSOC takes 0,17·√f′c', () => {
    const a = square(2.2, 0.5);
    const aci = aciFootingRow(demand(), ctx, a, fmt), cir = footingRow(demand(), ctx, a, fmt);
    const rho = aci.x!.asProvided * 1e-4 / (2.2 * aci.x!.d);
    expect(aci.x!.phiVc).toBeCloseTo(0.75 * 0.66 * Math.cbrt(rho) * 5 * 2.2 * aci.x!.d * 1000, 3);
    expect(aci.x!.mu).toBeCloseTo(cir.x!.mu, 9);
    expect(aci.punching!.phiVc).toBeCloseTo(cir.punching!.phiVc, 9);
  });
});
