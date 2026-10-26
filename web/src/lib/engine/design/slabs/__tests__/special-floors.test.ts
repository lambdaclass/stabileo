/**
 * Special slabs and foundations against hand values: a ribbed slab's limits (8.8.1, 8.8.3) and
 * stiffness, a rib's steel, a drop panel's limits (8.2.4) and two-way shear at both critical
 * sections (22.6.4.1, 22.6.5.2), a hollow-core plank and a composite deck against what their makers
 * declare, a pile through its strata, and the soil pressure and lift-off under a mat on springs.
 */
import { describe, expect, it } from 'vitest';
import { flexuralSteel, ribSection, ribbedProperties, ribbedRules, ribDesign } from '../ribbed';
import { dropPanelRules, headPunching, twoWayVc } from '../drop-panels';
import { deckSlabCheck, plankCheck } from '../precast-floors';
import { matPressures, matRows, pileRows } from '../../../foundation/geotech';

const waffle = { h: 0.35, c: 0.05, spacingX: 0.7, ribBottom: 0.12, filler: 'removable' as const };

describe('ribbed slabs', () => {
  it('the limits of 8.8.1 and 8.8.3, by hand', () => {
    const rows = ribbedRules(waffle);
    expect(rows.map((r) => r.clause)).toEqual(['8.8.1.2', '8.8.1.3', '8.8.1.4', '8.8.3.1']);
    expect(rows.map((r) => r.ratio)).toEqual([0.833, 0.833, 0.773, 1]);
  });

  it('a rib with its share of topping: inertia and the solid thickness of equal stiffness', () => {
    expect(ribSection(waffle, 0.7).I).toBeCloseTo(8.2077e-4, 7);
    const p = ribbedProperties(waffle);
    expect(p.hEq).toBeCloseTo(0.2414, 3);
    expect(p.volume).toBeCloseTo(0.05 + 0.036 / 0.7, 9);
  });

  it('the steel for a moment, by hand; a rib too narrow for its shear fails', () => {
    expect(flexuralSteel(20, 0.7, 0.32, 25, 420)! * 1e4).toBeCloseTo(1.666, 2);
    const d = ribDesign(waffle, { mPos: 30, mNeg: 20, v: 400 }, { fc: 25, fy: 420, cover: 0.025, barDia: 12 });
    expect(d.rows.find((r) => r.clause === '8.8.1.5')!.status).toBe('fail');
    expect(d.asPos).toBeGreaterThan(0);
  });
});

describe('drop panels and capitals', () => {
  it('8.2.4: a quarter of the slab below it, a sixth of the span each way', () => {
    const rows = dropPanelRules({ bx: 2, by: 2, depth: 0.06 }, 0.2, { x: 6, y: 6 });
    expect(rows.map((r) => r.status)).toEqual(['ok', 'nearLimit', 'nearLimit']);
    expect(rows[0]!.ratio).toBeCloseTo(0.833, 3);
  });

  it('two-way shear at the column with the drop, and outside the drop with the slab alone', () => {
    const rows = headPunching({ Vu: 600, qu: 0, slabH: 0.2, cover: 0.025, barDia: 12, fc: 25, column: { b: 0.4, h: 0.4 }, drop: { bx: 2, by: 2, depth: 0.06 }, position: 'interior' });
    const [inner, outer] = rows;
    expect(inner!.clause).toBe('22.6.4.1(a)');
    expect(inner!.ratio).toBeCloseTo(0.8725, 2);
    expect(outer!.clause).toBe('22.6.4.1(b)');
    expect(outer!.ratio).toBeCloseTo(0.4964, 2);
    expect(twoWayVc(25, 0.163, 8.652, 2, 2).vc).toBeCloseTo(1.1428, 3);
  });

  it('a capital moves the inner section out; an edge column is not evaluated', () => {
    const plain = headPunching({ Vu: 600, qu: 0, slabH: 0.2, cover: 0.025, barDia: 12, fc: 25, column: { b: 0.4, h: 0.4 }, position: 'interior' })[0]!;
    const cap = headPunching({ Vu: 600, qu: 0, slabH: 0.2, cover: 0.025, barDia: 12, fc: 25, column: { b: 0.4, h: 0.4, capital: 0.8 }, position: 'interior' })[0]!;
    expect(cap.ratio!).toBeLessThan(plain.ratio!);
    expect(headPunching({ Vu: 600, qu: 0, slabH: 0.2, cover: 0.025, barDia: 12, fc: 25, column: { b: 0.4, h: 0.4 }, position: 'edge' })[0]!.status).toBe('unsupported');
  });
});

describe('precast and composite floors', () => {
  it('a hollow-core plank against its declared strengths', () => {
    const rows = plankCheck({ name: 'P', depth: 0.2, width: 1.2, selfWeight: 3, phiMn: 150, phiVn: 120 }, 8, { superDead: 1.5, live: 3 });
    expect(rows[0]!.demand).toBeCloseTo(97.92, 2);
    expect(rows[1]!.demand).toBeCloseTo(48.96, 2);
  });

  it('a composite deck: as formwork, then composite by the yield method', () => {
    const rows = deckSlabCheck({ name: 'D', hr: 0.075, t: 0.0009, as: 0.0012, ycg: 0.0375, fy: 280, ribWidth: 0.15, ribSpacing: 0.3, weight: 0.12, phiMnDeck: 8 }, 0.14, 25, 3, { superDead: 1, live: 3 });
    expect(rows[0]!.demand).toBeCloseTo(5.421, 2);
    expect(rows[1]!.capacity).toBeCloseTo(0.9 * 0.0012 * 280000 * (0.1025 - 0.0079059), 1);
    expect(rows[3]!.status).toBe('unsupported');
  });
});

describe('piles and mats', () => {
  const strata = [{ name: 'A', thickness: 5, shaftFrictionKPa: 20, tipResistanceKPa: 0 }, { name: 'B', thickness: 10, shaftFrictionKPa: 40, tipResistanceKPa: 1500 }];

  it('a pile through two strata, and its section', () => {
    const rows = pileRows(strata, { diameter: 0.5, length: 10 }, { service: 400, factored: 600 }, { fc: 25, fy: 420, as: 0.01 * (Math.PI * 0.25) / 4 });
    expect(rows[0]!.capacity).toBeCloseTo(765.76, 1);
    expect(rows[1]!.capacity).toBeCloseTo(0.52 * 4955.5, 0);
    // Longer than the strata: no capacity is claimed.
    expect(pileRows(strata, { diameter: 0.5, length: 20 }, { service: 400, factored: 600 }, { fc: 25, fy: 420, as: 0.002 })[0]!.status).toBe('unsupported');
  });

  it('the soil under a mat: pressure from each spring, and where it lifts', () => {
    const ps = matPressures(new Map([[1, 100], [2, -10]]), new Map([[1, 1], [2, 2]]));
    expect(ps.map((p) => p.q)).toEqual([100, -5]);
    const rows = matRows(ps, 150, 'U1');
    expect(rows[0]!.ratio).toBeCloseTo(0.667, 3);
    expect(rows[1]!.status).toBe('fail');
  });
});
