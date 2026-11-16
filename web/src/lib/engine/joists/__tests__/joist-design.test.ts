/**
 * A joist panel by hand. 5 m span, joists every 0,50 m, ceramic blocks 0,12 m (0,85 kN/m²), 0,05 m
 * topping; sagging peaks at 12 kN·m/m and nothing hogs (simple both ends); qu = 8 kPa; superimposed
 * dead 1,5 and live 2 kPa. Example joist «12»: Mu = 18, Mcr = 9 kN·m, EI 2100/900/160 kN·m², Vu 22 kN.
 *   M = 12·0,50 = 6 kN·m → 6/18 = 0,333.  V = 8·0,50·5/2 = 10 kN → 10/22 = 0,455.
 *   Own weight 0,85 + 25·0,05 + 0,17/0,50 = 2,44 kPa → 1,22 kN/m; dead 0,75, live 1,00 kN/m.
 *   Ma = 2,97·25/8 = 9,28 > Mcr: cracked floor, EI 900.
 *   Unpropped: 5·1,22·5⁴/(384·160) = 0,06205 m on the joist alone; after, 5·1,75·625/(384·900) =
 *   0,01582 m; permanent = 0,06205 + 5·0,75·625/(384·900) = 0,06883 m, ×2 = 0,13767 m long term.
 *   Propped: everything on the floor, 5·2,97·625/(384·900) = 0,02686 m.
 */
import { describe, it, expect } from 'vitest';
import { designJoistPanel, equalizeWithin, proposeJoistSystem, siteNegatives, type JoistPanelInput, type JoistSystem } from '../joist-design';
import { BLOCK_DEFAULTS, EXAMPLE_JOISTS, sheetFromGeometry } from '../library';

const rows = Array.from({ length: 11 }, (_, i) => ({ at: i * 0.5, m: 12 * 4 * (i / 10) * (1 - i / 10) }));
const panel: JoistPanelInput = { panelId: 'L1', span: 5, width: 4, rows, qu: 8, superDead: 1.5, live: 2, fc: 25, fy: 420, cover: 0.02 };
const system = (over: Partial<JoistSystem> = {}): JoistSystem => ({
  typeId: 'ex-v12', multiplicity: 1, spacing: 0.5, block: BLOCK_DEFAULTS.ceramic, topping: 0.05, direction: 'x',
  propped: false, ends: { start: 'auto', end: 'auto' }, ...over,
});
const v12 = EXAMPLE_JOISTS.find((t) => t.id === 'ex-v12')!.sheet!;

describe('a joist panel', () => {
  it('flexure and shear against the sheet', () => {
    const r = designJoistPanel(panel, system(), v12);
    expect(r.ends).toEqual({ start: 'simple', end: 'simple' });
    expect(r.mPos).toBeCloseTo(6, 9);
    expect(r.utilization.flexure).toBeCloseTo(1 / 3, 9);
    expect(r.vu).toBeCloseTo(10, 9);
    expect(r.utilization.shear).toBeCloseTo(10 / 22, 9);
  });

  it('deflects by its construction: unpropped the joist alone takes its own weight', () => {
    const r = designJoistPanel(panel, system(), v12);
    expect(r.deflection.selfOnJoist).toBeCloseTo(0.062052, 5);
    expect(r.deflection.afterOnFloor).toBeCloseTo(0.015825, 5);
    expect(r.deflection.longTerm).toBeCloseTo(0.137668, 5);
    expect(r.errors).toContain('J003');
    const p = designJoistPanel(panel, system({ propped: true }), v12);
    expect(p.deflection.selfOnJoist).toBe(0);
    expect(p.deflection.afterOnFloor).toBeCloseTo(0.026855, 5);
  });

  it('a hogging end takes site negatives a quarter span and 40·db long', () => {
    const hogging = { ...panel, rows: rows.map((r, i) => (i === 0 ? { ...r, m: -8 } : r)) };
    const r = designJoistPanel(hogging, system(), v12);
    expect(r.ends.start).toBe('continuous');
    // 8·0,5 = 4 kN·m; d = 0,17 − 0,02 − 0,006 = 0,144: As = 4/(0,81·0,144·420 000) = 81,6 mm² → 1Ø12 (113).
    expect(r.negatives.start).toEqual({ count: 1, diameter: 12, length: 1.73 });
    expect(siteNegatives(4, 0.144, 420, 5)).toEqual({ count: 1, diameter: 12, length: 1.73 });
  });

  it('proposes a type that carries it, and names the error when there is none', () => {
    const heavy = { ...panel, rows: rows.map((r) => ({ ...r, m: r.m * 6 })) };
    const s = proposeJoistSystem(heavy, { ...system(), propped: true }, EXAMPLE_JOISTS);
    const r = designJoistPanel(heavy, s, EXAMPLE_JOISTS.find((t) => t.id === s.typeId)!.sheet);
    expect(r.utilization.flexure).toBeLessThanOrEqual(1);
    expect(designJoistPanel(panel, system(), undefined).errors).toContain('J005');
  });

  it('equalizes within a tolerance', () => {
    const m = equalizeWithin([{ key: 'a', value: 100 }, { key: 'b', value: 104 }, { key: 'c', value: 130 }], 0.05);
    expect([m.get('a'), m.get('b'), m.get('c')]).toEqual([104, 104, 130]);
  });

  it('reads a sheet from a joist geometry', () => {
    const s = sheetFromGeometry({ height: 0.12, floorHeight: 0.17, steelArea: 120, steelFy: 1500, steelDepth: 0.10, webWidth: 0.10, selfWeight: 0.18, bearing: 0.10, maxSpan: 6 }, { fc: 25, spacing: 0.5, topping: 0.05, Ec: 25000 });
    // d = 0,17 − (0,12 − 0,10) = 0,15; a = 120e−6·1500/(0,85·25·0,5) = 0,01694; φMn = 0,9·0,18·1000·(0,15 − 0,00847) = 22,93.
    expect(s.muPos).toBeCloseTo(22.93, 1);
    expect(s.eiCracked).toBeLessThan(s.eiGross);
  });
});
