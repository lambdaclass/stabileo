/**
 * The rest of the numbers nobody computed: Bresler's 999 and its φPn0 fallbacks, the 1.5 of
 * every layout issue and the 99 of a row where no bar fits, a hook asked for that reads as a
 * near-limit pass, the special elements and the masonry exemption that read ok with nothing to
 * check against, and the legacy torsion check's units.
 */
import { describe, expect, it } from 'vitest';
import {
  verifyProvidedReinforcement, computeBiaxialCapacity, computeColumnCapacity,
  type BarInstance, type ElementStationResult, type StationForces,
} from '../../station-design-forces';
import { concreteCheckRows } from '../check-rows';
import type { DesignAxes } from '../design-axes';
import type { ProvidedReinforcement } from '../../../store/model.svelte';
import { checkBiaxial, checkTorsion } from '../../codes/argentina/cirsoc201';
import { deriveCompressionDevelopment } from '../../../codes/cirsoc201/anchorage';
import { corbelDesign } from '../special/corbel';
import { couplingBeamDesign } from '../special/coupling-beam';
import { beamOpeningDesign } from '../special/beam-opening';
import { confinedWallRows } from '../masonry/confined-masonry';

const st = (t: number, over: Partial<StationForces> = {}): StationForces => ({
  t, x: t * 6, n: 0, vy: 0, vz: 0, my: 0, mz: 0, torsion: 0, ...over,
});
const stationResult = (stations: StationForces[]): ElementStationResult => ({
  elementId: 1, length: 6, stationTs: stations.map((s) => s.t),
  comboResults: [{ comboId: 1, comboName: 'C1', stations }],
});
const AXES: DesignAxes = {
  flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
  bFlex: 0.3, hFlex: 0.6, biaxial: false,
  sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
};

describe('Bresler: no 999, no squash load standing in for a moment capacity', () => {
  it('without a bar layout, tension with two moments is not evaluated (was 999, a pass)', () => {
    const r = computeBiaxialCapacity(12, 0.3, 0.3, 25, 420, 0.04, 8, -50, 30, 30);
    console.log('BIAX-TENSION', r.ratio, r.status, r.evaluated);
    expect(r.evaluated).toBe(false);
    expect(r.ratio).toBe(0);
    expect(r.status).toBe('fail');
  });

  it('an axis with no capacity at its eccentricity leaves the section none (was φPn0)', () => {
    const r = computeBiaxialCapacity(0, 0.3, 0.3, 25, 420, 0.04, 8, 100, 50, 50);
    console.log('BIAX-ZERO', r.phiPnx, r.phiPny, r.phiPn, r.ratio, r.status);
    expect(r.phiPn).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.status).toBe('fail');
  });

  it('a uniaxial section with no axial capacity is 0, not 999', () => {
    const bars: BarInstance[] = [[0.06, 0.06], [0.24, 0.06], [0.06, 0.24], [0.24, 0.24]].map(([x, y], i) => ({ face: y! < 0.15 ? 'bottom' : 'top', row: 0, index: i, diameter: 16, x: x!, y: y! }));
    const r = computeColumnCapacity(0, 0.3, 0.3, 1e-5, 420, 0.04, 8, 0.05, 0, bars);
    console.log('UNI', r.phiPn, r.ratio, r.status);
    expect(r.ratio).toBe(0);
    expect(r.status).toBe('fail');
  });

  it('the legacy check: tension is not read as compression, and a zero capacity is not φPn0', () => {
    const P = { fc: 25, fy: 420, cover: 0.04, b: 0.3, h: 0.3, stirrupDia: 8 };
    const t = checkBiaxial(P, -50, 30, 30, 12, '2025');
    console.log('LEGACY-T', t.ratio, t.status);
    expect(t.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(t.status).toBe('fail');
    const z = checkBiaxial(P, 100, 50, 50, 0, '2025');
    console.log('LEGACY-Z', z.phiPn, z.ratio, z.status);
    expect(z.phiPn).toBe(0);
    expect(z.status).toBe('fail');
  });
});

describe('layout and fit rows state their own numbers', () => {
  it('a row where the bars do not fit: width needed over width available (was count/max, 99 with none)', () => {
    const v = verifyProvidedReinforcement(1, 'beam', {
      regions: {
        bottomSpan: { count: 8, diameter: 25 }, topStart: { count: 2, diameter: 12 }, topEnd: { count: 2, diameter: 12 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
      },
    } as ProvidedReinforcement, undefined, { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
    { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 }, stationResult([st(0), st(0.5, { my: 30 }), st(1)]), undefined, { axes: AXES });
    const fit = v.checks.find((c) => c.limiting === 'barFit')!;
    console.log('FIT', fit.category, fit.ratio, fit.demand, fit.capacity, fit.unit);
    expect(fit.unit).toBe('cm');
    expect(fit.ratio).toBeCloseTo(fit.demand! / fit.capacity!, 2);
    expect(fit.ratio).toBeGreaterThan(1);
  });

  it('a congested column: s,mín over the clear spacing (was 1.5 for every issue)', () => {
    const v = verifyProvidedReinforcement(1, 'column', {
      column: { cornerDia: 32, faceDia: 32, nBottom: 2, nTop: 2, nLeft: 2, nRight: 2 },
      stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
    } as ProvidedReinforcement, undefined, { column: { AsTotal: 0 } },
    { b: 0.25, h: 0.25, fc: 25, fy: 420, cover: 0.03, stirrupDia: 8 }, stationResult([st(0, { n: -300 }), st(1, { n: -300 })]), undefined,
    { axes: { ...AXES, bFlex: 0.25, hFlex: 0.25 } });
    const layout = v.checks.filter((c) => c.category.startsWith('Layout:'));
    console.log('LAYOUT', layout.map((c) => `${c.category}:${c.ratio}:${c.demand}/${c.capacity}`));
    expect(layout.length).toBeGreaterThan(0);
    for (const c of layout) {
      expect(c.ratio).not.toBe(1.5);
      // demand and capacity are printed to 0,1 cm; the ratio is from the unrounded distances.
      if (Number.isFinite(c.ratio)) expect(Math.abs(c.ratio - c.demand! / c.capacity!) / c.ratio).toBeLessThan(0.05);
      expect(c.ratio).toBeGreaterThan(1);
    }
  });
});

describe('top bars into the span develop in compression (§25.4.9), with no hook (§25.4.1.2)', () => {
  const SECTION = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
  const withTop = (extensionEnd: number): ProvidedReinforcement => ({
    regions: {
      bottomSpanLayers: [{ count: 3, diameter: 16, row: 0 }], bottomSpan: { count: 3, diameter: 16 },
      topStartLayers: [{ count: 2, diameter: 16, row: 0 }], topStart: { count: 2, diameter: 16 },
      topStartGroups: [{ layers: [{ count: 2, diameter: 16, row: 0 }], label: 'top', continueStart: true, continueEnd: true, extensionEnd }],
      topEnd: { count: 2, diameter: 16 },
      stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
    },
  } as never);
  const verify = (r: ProvidedReinforcement) => verifyProvidedReinforcement(1, 'beam', r, undefined,
    { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } }, SECTION,
    stationResult([st(0, { my: -20, vz: 30 }), st(0.5, { my: 30 }), st(1, { my: -20, vz: -30 })]), undefined, { axes: AXES });
  const ldc = deriveCompressionDevelopment({ diameterMm: 16, fy: 420, fc: 25, edition: '2025' }).ldcM;

  it('ldc = max(0,24·fy/√f\'c·db; 0,043·fy·db; 200 mm) = 0,24·420/5·16 = 322,6 mm', () => {
    expect(ldc).toBeCloseTo(0.32256, 5);
  });

  it('a top bar with ℓ,disp ≥ ldc is no issue (it asked for a hook that compression cannot use)', () => {
    const rows = verify(withTop(0.5)).checks.filter((c) => c.category === 'Anchorage');
    console.log('TOP-0.5', rows.map((c) => `${c.status}:${c.ratio}:${c.description}`));
    expect(rows).toEqual([]);
  });

  it('short of ldc it fails with ldc/ℓ,disp and names §25.4.9', () => {
    const rows = verify(withTop(0.25)).checks.filter((c) => c.category === 'Anchorage');
    console.log('TOP-0.25', rows.map((c) => `${c.status}:${c.ratio}:${c.description}`));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('fail');
    expect(rows[0]!.ratio).toBeCloseTo(ldc / 0.25, 3);
    expect(rows[0]!.description).toContain('§25.4.9');
    expect(rows[0]!.anchorHook).toBeUndefined();
  });
});

describe('a required area with nothing placed is not verified, and an exemption needs its cap. 7', () => {
  it('corbel, coupling beam and web opening', () => {
    const c = corbelDesign({ bw: 0.3, h: 0.45, d: 0.4, av: 0.15, Vu: 400, Nuc: 80, fc: 30, fy: 420, monolithic: true });
    const primary = c.rows.find((r) => r.titleKey === 'check.corbel.primary')!;
    console.log('CORBEL', primary.status, primary.ratio);
    expect(primary.status).toBe('notVerified');
    const d = couplingBeamDesign({ ln: 1.5, h: 0.8, bw: 0.3, d: 0.74, Vu: 900, fc: 30, fy: 420 });
    const by = (k: string) => d.rows.find((r) => r.titleKey === `check.coupling.${k}`)!;
    console.log('COUPLING', by('diagonal').status, by('mesh').status, by('threshold').status);
    expect(by('diagonal').status).toBe('notVerified');
    expect(by('mesh').status).toBe('notVerified');
    expect(by('threshold').status).toBe('ok'); // a classification, kept
    const o = beamOpeningDesign({ b: 0.3, h: 0.7, cover: 0.025, stirrupDia: 8, barDia: 16, fc: 25, fy: 420, x: 2, lo: 0.6, ho: 0.25, Mu: 150, Vu: 120 });
    const sides = o.rows.find((r) => r.titleKey === 'check.opening.sides')!;
    console.log('OPENING', sides.status);
    expect(sides.status).toBe('notVerified');
  });
});

describe('the legacy torsion check: units, and one section limit', () => {
  /*
   * 30×60, cover 25 mm, stirrup Ø8, H-25, fy 420, Tu = 7,56 kN·m, θ = 45°:
   *   x0 = 0,30 − 2·0,025 − 0,008 = 0,242 m; y0 = 0,60 − 0,058 = 0,542 m
   *   Aoh = 0,131164 m²; ph = 2·(0,242 + 0,542) = 1,568 m; Ao = 0,85·Aoh = 0,1114894 m²
   *   At/s = Tu/(φ·2·Ao·fyt) = 7,56/(0,75·2·0,1114894·420 000) = 1,0763·10⁻⁴ m²/m = 1,076 cm²/m
   *   Al = At/s·ph = 1,0763·10⁻⁴·1,568 = 1,6877·10⁻⁴ m² = 1,688 cm²
   *   vT = Tu·ph/(1,7·Aoh²) = 7,56·1,568/(1,7·0,0172040) = 405,3 kN/m² = 0,405 MPa
   */
  const P = { fc: 25, fy: 420, cover: 0.025, b: 0.3, h: 0.6, stirrupDia: 8 };
  it('At/s in cm²/m and Al in cm², by hand', () => {
    const r = checkTorsion(P, 7.56, 40, '2025');
    console.log('TORSION-UNITS', r.AtOverS, r.AlReq);
    expect(r.AtOverS).toBeCloseTo(1.0763, 3);
    expect(r.AlReq).toBeCloseTo(1.6877, 3);
  });
  it('the section limit is §22.7.7.1(a) alone: a torque past it fails', () => {
    expect(checkTorsion(P, 120, 40, '2025').status).toBe('fail');
    expect(checkTorsion(P, 7.56, 40, '2025').steps.join(' ')).not.toContain('⚠');
  });
});

describe('the masonry exemption from out-of-plane flexure', () => {
  const ahm = (2 * Math.PI * 9) / 0.4 / 1e6;
  const wall = { kind: 'reforzada' as const, unit: 'hollowConcrete' as const, fm: 2.25, fv: 0.22, zone: 4 as const, storiesAbove: 0, L: 4, t: 0.18, H: 2.8, edges: 'threeOrMore' as const, nMin: 150, vu: 150, mu: 300, muOut: 2 };
  const oop = (w: Parameters<typeof confinedWallRows>[0]) => confinedWallRows(w).rows.find((r) => r.titleKey === 'check.masonry.outOfPlane')!;
  it('distributed reinforcement that fails cap. 7, or none: the exemption is not established', () => {
    const failing = oop({ ...wall, distributed: { ahm, avm: 100e-6, fy: 420, hn: 6, sh: 0.4, sv: 0.6 } });
    const missing = oop(wall);
    console.log('MASONRY', failing.status, failing.ratio, missing.status, missing.ratio);
    expect(failing.status).toBe('notVerified');
    expect(missing.status).toBe('notVerified');
    expect(failing.ratio).toBeNull();
  });
  it('distributed reinforcement meeting every cap. 7 row: exempt, with no ratio', () => {
    const r = confinedWallRows({ ...wall, vu: 20, mu: 5, distributed: { ahm: 400e-6, avm: 350e-6, fy: 420, hn: 6, sh: 0.4, sv: 0.4 } });
    const cap7 = r.rows.filter((x) => x.clause?.startsWith('7.'));
    console.log('MASONRY-OK', cap7.map((x) => `${x.titleKey}:${x.status}`));
    expect(cap7.every((x) => x.status === 'ok' || x.status === 'nearLimit')).toBe(true);
    const o = r.rows.find((x) => x.titleKey === 'check.masonry.outOfPlane')!;
    expect(o.status).toBe('ok');
    expect(o.ratio).toBeNull();
  });
});

describe('the contract row of an asked hook', () => {
  it('reads fail, not near the limit', () => {
    const v = verifyProvidedReinforcement(1, 'beam', {
      regions: {
        bottomSpanLayers: [{ count: 3, diameter: 20, row: 0 }], bottomSpan: { count: 3, diameter: 20 },
        bottomGroups: [{ layers: [{ count: 3, diameter: 20, row: 0 }], label: 'all', continueStart: true, continueEnd: true, extensionStart: 0.5, extensionEnd: 2 }],
        topStart: { count: 3, diameter: 12 }, topEnd: { count: 3, diameter: 12 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
      },
    } as never, undefined, { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
    { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 }, stationResult([st(0), st(0.5, { my: 30 }), st(1)]), undefined, { axes: AXES });
    const rows = concreteCheckRows(v).filter((r) => r.title === 'Anchorage');
    console.log('HOOK-ROW', rows.map((r) => `${r.status}:${r.ratio}`), v.overallStatus);
    expect(rows.map((r) => r.status)).toEqual(['fail']);
    expect(v.overallStatus).toBe('fail');
  });
});
