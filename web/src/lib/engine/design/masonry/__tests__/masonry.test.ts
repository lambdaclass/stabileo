/**
 * Masonry walls by INPRES-CIRSOC 103 Parte III and the infill strut, against hand values.
 *
 * A confined wall of solid bricks and mortar I (f'm 2,25, f'v 0,22 MPa from Tablas 2.4/2.5), 4 m
 * by 2,8 m by 180 mm, zone 4, one storey above: its shear [4-5], the tie beam and column forces
 * [4-6], [4-14] against φ·As·fy, the minimum steel [4-10]/[4-18], the column section [4-13] and its
 * end shear [4-20]. A wall with distributed reinforcement: [7-2] to [7-7] and its flexure 7.2.2
 * (the neutral axis integrated independently). A Mainstone strut in a 4,5 m by 2,5 m bay.
 */
import { describe, expect, it } from 'vitest';
import { confinedWallRows, masonryModuli, masonryStrengths, panelLimits, reinforcedWallMn, tieDiameter, tieMinSteel, trussDiagonalWidth, type ConfiningElement } from '../confined-masonry';
import { infillRows, infillStrut } from '../infill-strut';

const tie = (sCritical: number): ConfiningElement => ({ b: 0.18, h: 0.2, bars: 4, barDia: 10, fy: 420, tieDia: 6, sNormal: 0.15, sCritical });
const by = (rows: ReturnType<typeof confinedWallRows>['rows'], key: string) => rows.find((r) => r.titleKey === `check.masonry.${key}`)!;

describe('materials and limits', () => {
  it('Tablas 2.4 and 2.5, Em and Gm, Tabla 4.1', () => {
    expect(masonryStrengths('solidBrick', 'I')).toEqual({ fm: 2.25, fv: 0.22 });
    expect(masonryStrengths('hollowConcrete', 'NA')).toEqual({ fm: 0.52, fv: 0.055 });
    expect(masonryModuli(2.25, 'solidBrick')).toEqual({ Em: 2700, Gm: 540 });
    expect(masonryModuli(1.4, 'hollowCeramic').Gm).toBeCloseTo(168, 9);
    expect(panelLimits(4, 0.18)).toEqual({ area: 20, dim: 5 });
    expect(panelLimits(1, 0.15)).toEqual({ area: 30, dim: 4.5 });
    expect(tieMinSteel(4, 1, 180, 420)).toBeCloseTo(227.143, 3);
    expect(tieMinSteel(2, 0, 180, 420)).toBeCloseTo(107.143, 3);
    expect(tieDiameter('critical', 1, 100)).toBe(6);
    expect(tieDiameter('normal', 2, 250)).toBeCloseTo(10, 9);
    expect(trussDiagonalWidth(3, 4)).toBeCloseTo(0.5, 12);
  });
});

describe('confined masonry', () => {
  const wall = { kind: 'simple' as const, unit: 'solidBrick' as const, mortar: 'I' as const, zone: 4 as const, storiesAbove: 1, L: 4, t: 0.18, H: 2.8, edges: 'twoHorizontal' as const, nMin: 150, vu: 120, beam: tie(0.1), column: tie(0.08), muOut: 5 };

  it('shear, tie forces, steel, sections and the end shear of the columns', () => {
    const r = confinedWallRows(wall);
    expect(r.fo).toBeCloseTo(0.20833, 4);
    expect(by(r.rows, 'shear').capacity).toBeCloseTo(174.72, 2);
    expect(by(r.rows, 'shear').status).toBe('ok');
    expect(r.nuv).toBe(120);
    expect(by(r.rows, 'beamAxial').capacity).toBeCloseTo(118.752, 2);
    expect(by(r.rows, 'beamAxial').status).toBe('fail');
    expect(r.nuc).toBeCloseTo(105, 9);
    expect(by(r.rows, 'columnAxial').ratio).toBeCloseTo(0.884, 3);
    expect(by(r.rows, 'columnSteel').inputs.find((x) => x.symbol === 'As,min')!.value).toBeCloseTo(227.143, 2);
    expect(by(r.rows, 'columnSection').ratio).toBeCloseTo(1, 3); // bc = t governs; Bc 36 000 ≥ 30 000 mm²
    expect(by(r.rows, 'columnShear').capacity).toBeCloseTo(47.501, 2);
    expect(by(r.rows, 'columnShear').status).toBe('fail');
    expect(r.lc).toBeCloseTo(0.6, 9);
    expect(by(r.rows, 'columnTiesCritical').status).toBe('fail'); // one layer Ø6 is not twice the normal zone's
    expect(by(r.rows, 'outOfPlane').capacity).toBeCloseTo(5.809, 3);
    expect(by(r.rows, 'length').demand).toBeCloseTo(1.5, 9);
    expect(by(r.rows, 'panelArea').demand).toBeCloseTo(11.2, 9);
  });

  it('a long panel needs a column or a mid-height beam; armada asks for bed joint steel', () => {
    const r = confinedWallRows({ ...wall, kind: 'armada', Lo: 6, Ho: 2.8, joint: { bars: 2, barDia: 6, spacing: 0.6 } });
    expect(by(r.rows, 'columnSpacing').status).toBe('fail'); // 6 > 2·2,8 = 5,6
    expect(by(r.rows, 'panelDim').status).toBe('fail');
    const j = by(r.rows, 'jointSteel');
    expect(j.demand).toBeCloseTo((2 * Math.PI * 9) / 0.5, 2);
    expect(j.status).toBe('fail');
  });
});

describe('distributed reinforcement', () => {
  const ahm = (2 * Math.PI * 9) / 0.4 / 1e6; // 2 Ø6 every 400 mm, m²/m
  const wall = { kind: 'reforzada' as const, unit: 'hollowConcrete' as const, fm: 2.25, fv: 0.22, zone: 4 as const, storiesAbove: 0, L: 4, t: 0.18, H: 2.8, edges: 'threeOrMore' as const, nMin: 150, vu: 150, mu: 300,
    distributed: { ahm, avm: 100e-6, fy: 420, hn: 6, sh: 0.4, sv: 0.6 } };

  it('[7-2] to [7-7] and the spacing', () => {
    const r = confinedWallRows(wall);
    expect(by(r.rows, 'shear').capacity).toBeCloseTo(0.8 * 237.504, 2);
    expect(by(r.rows, 'verticalSteel').demand).toBeCloseTo(0.775 * 141.372, 2);
    expect(by(r.rows, 'verticalSteel').status).toBe('fail');
    expect(by(r.rows, 'rhoH').status).toBe('fail');
    expect(by(r.rows, 'rhoV').ratio).toBeCloseTo(0.0007 / (100 / 180000), 3);
    expect(by(r.rows, 'barSpacing').status).toBe('ok');
    expect(by(r.rows, 'length').demand).toBeCloseTo(1.077, 3); // H/2,6
  });

  it('flexure with axial load, neutral axis by compatibility', () => {
    expect(reinforcedWallMn(4, 0.18, 2.25, 100e-6, 420, 150, 'hollowConcrete')).toBeCloseTo(502.45, 0);
    const r = confinedWallRows(wall);
    expect(by(r.rows, 'flexure').capacity).toBeCloseTo(0.9 * 502.45, 0);
  });
});

describe('infill strut', () => {
  it('Mainstone width, stiffness and crushing', () => {
    const s = infillStrut({ hcol: 3, hinf: 2.5, linf: 4.5, t: 0.18, Em: 2700, Ec: 25000, Icol: 0.3 ** 4 / 12 });
    expect(s.lambda1).toBeCloseTo(1.2505, 4);
    expect(s.width).toBeCloseTo(0.53086, 4);
    expect(s.axialStiffness).toBeCloseTo(50117.9, 0);
    const rows = infillRows({ strut: s, t: 0.18, strength: 2.25, demand: 180 });
    expect(rows[0]!.capacity).toBeCloseTo(214.998, 2);
    expect(rows[0]!.code).toBe('fema-356');
  });
});
