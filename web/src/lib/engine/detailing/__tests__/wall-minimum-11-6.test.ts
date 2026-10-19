/**
 * A wall's minimum distributed reinforcement, CIRSOC 201-2025 §11.6
 * (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-11-tabiques.md):
 *   11.6.1 (:517-520): "Cuando Vu ≤ 0,04·φ·λ·√f´c·Acv en el plano del tabique, ρℓ mínimo y ρt mínimo deben
 *     cumplir con la Tabla 11.6.1."
 *   Tabla 11.6.1 (:555-575), construido en obra, barras conformadas: ≤ 16 mm, fy ≥ 420 → ρℓ 0,0012, ρt 0,0020;
 *     ≤ 16 mm, fy < 420 → 0,0015, 0,0025; > 16 mm, cualquiera → 0,0015, 0,0025.
 *   11.6.2 (:590-608): "Cuando Vu > 0,04·φ·λ·√f´c·Acv … (a) ρℓ debe ser al menos el mayor valor entre el valor
 *     calculado mediante la ecuación (11.6.2) y 0,0025 …; ρℓ ≥ 0,0025 + 0,5·(2,5 − hw/ℓw)·(ρt − 0,0025)
 *     (b) ρt debe ser al menos 0,0025."
 */
import { describe, it, expect } from 'vitest';
import { designWall, minimumWallRatios, type WallDesignInput } from '../wall-design';
import { wallCheckRows } from '../../design/check-rows-families';
import { wallMemberMinimumChecks } from '../../design/wall-minimum-steel';
import { concreteCheckRows } from '../../design/check-rows';

describe('Tabla 11.6.1 by the bars of each direction', () => {
  it('Ø20 verticals and Ø10 horizontals, ADN 420: ρℓ 0,0015 (> 16 mm), ρt 0,0020 (≤ 16 mm)', () => {
    const r = minimumWallRatios(20, 420, '2025', { horizontalDiameterMm: 10 });
    expect([r.rhoL, r.rhoT]).toEqual([0.0015, 0.0020]);
  });
});

/*
 * 3,00 × 3,00 m, t = 0,30 m (two curtains), H-25, ADN 420; verticals Ø8 c/0,25, horizontals Ø10 c/0,15:
 *   ρℓ = 2·(π·0,008²/4)/(0,25·0,30) = 2·0,50265/750 = 0,0013404; ρt = 2·0,78540/450 = 0,0034907.
 *   Acv = 3,00·0,30 = 0,90 m²; 0,04·φ·√f'c·Acv = 0,04·0,75·5·0,90·1000 = 135 kN.
 *   Vu = 100 kN ≤ 135: Tabla 11.6.1, Ø8 and Ø10 ≤ 16 mm, fy 420: ρℓ ≥ 0,0012 ✓ (0,895), ρt ≥ 0,0020 ✓ (0,573).
 *   Vu = 300 kN > 135: 11.6.2, ρt ≥ 0,0025 ✓ (0,716); hw/ℓw = 1:
 *   ρℓ ≥ 0,0025 + 0,5·(2,5 − 1)·(0,0034907 − 0,0025) = 0,0032430 ✗ (0,0013404: 2,4195).
 */
const wall = (vu: number): WallDesignInput => ({
  wallId: 'W', length: 3, height: 3, thickness: 0.3, cover: 0.025, fc: 25, fy: 420, barDiameterMm: 8, edition: '2025',
  pu: 300, muInPlane: 50, vuInPlane: vu, seismicRequired: false,
  provided: { vertical: { diameter: 8, spacing: 0.25 }, horizontal: { diameter: 10, spacing: 0.15 }, curtains: 2 },
});
const minRows = (vu: number) => wallCheckRows(designWall(wall(vu))).filter((r) => r.title.startsWith('Min '));

describe('a wall designed on the floor: 11.6.1 or 11.6.2 by its in-plane shear', () => {
  it('Vu = 100 kN: Tabla 11.6.1 holds, and the rows say 11.6.1', () => {
    expect(minRows(100).map((r) => [r.title, r.clause, r.status])).toEqual([
      ['Min vertical ratio', '11.6.1', 'ok'], ['Min horizontal ratio', '11.6.1', 'ok'],
    ]);
    expect(minRows(100).map((r) => r.ratio)).toEqual([expect.closeTo(0.0012 / 0.0013404, 3), expect.closeTo(0.0020 / 0.0034907, 3)]);
  });

  it('Vu = 300 kN: 11.6.2 by its equation, and the verticals fall short', () => {
    expect(minRows(300).map((r) => [r.title, r.clause, r.status])).toEqual([
      ['Min vertical ratio', '11.6.2', 'fail'], ['Min horizontal ratio', '11.6.2', 'ok'],
    ]);
    expect(minRows(300)[0]!.ratio).toBeCloseTo(2.4194, 2);
    expect(minRows(300)[1]!.ratio).toBeCloseTo(0.0025 / 0.0034907, 3);
  });
});

/*
 * A wall checked as a member (the verifier): 0,20 × 2,00 m, 3,00 m high, H-25, ADN 420; corners Ø10, 6 Ø8 on
 * each long face; Ø8 stirrups c/0,15 as the horizontal bars.
 *   ρℓ = (4·0,78540 + 12·0,50265)/(20·200) = 9,1735/4000 = 0,0022934; ρt = 2·0,50265/(15·20) = 0,0033510.
 *   Acv = 0,40 m²: 0,04·0,75·5·0,40 = 60 kN.
 *   Vu = 50 kN: Tabla 11.6.1 (Ø10, Ø8 ≤ 16, fy 420) → ρℓ ≥ 0,0012 ✓, ρt ≥ 0,0020 ✓.
 *   Vu = 100 kN: 11.6.2 → ρt ≥ 0,0025 ✓; hw/ℓw = 1,5, ρℓ ≥ 0,0025 + 0,5·1,0·(0,0033510 − 0,0025) = 0,0029255 ✗ (1,2756).
 */
describe('a wall checked as a member', () => {
  const rebar = { column: { cornerDia: 10, faceDia: 8, nBottom: 0, nTop: 0, nLeft: 6, nRight: 6 }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } };
  const g = (vu: number) => ({ b: 0.2, h: 2.0, L: 3, fc: 25, fy: 420, vu });
  it('reads Tabla 11.6.1 below the shear threshold and 11.6.2 above it, and the rows name them', () => {
    const low = wallMemberMinimumChecks(rebar, g(50));
    expect(low.map((c) => [c.category, c.status])).toEqual([['Wall ρl (11.6.1)', 'ok'], ['Wall ρt (11.6.1)', 'ok']]);
    expect(low[0]!.provided).toBeCloseTo(0.22934, 4);
    expect(low[1]!.provided).toBeCloseTo(0.33510, 4);
    const high = wallMemberMinimumChecks(rebar, g(100));
    expect(high.map((c) => [c.category, c.status, c.ratio])).toEqual([['Wall ρl (11.6.2)', 'fail', 1.276], ['Wall ρt (11.6.2)', 'ok', 0.746]]);
    const rows = concreteCheckRows({ elementId: 1, elementType: 'wall', hasProvided: true, checks: high, overallStatus: 'fail', worstUtilization: 1.276, checkedAxes: [], strengthCheckCount: 0 } as never);
    expect(rows.map((r) => r.clause)).toEqual(['11.6.2', '11.6.2']);
  });
});
