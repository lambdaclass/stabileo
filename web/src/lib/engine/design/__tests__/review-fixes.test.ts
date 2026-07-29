/**
 * Regression tests for the PR #78 review fixes (station-design-forces.ts):
 *
 *  1. Column uniaxial P-M capacity used the WRONG bending depth for My-governed
 *     rectangular columns (capAxis inverted) — false passes up to ~2.2x.
 *  2. The regional beam verifier silently skipped opposite-sign demand
 *     (hogging in span / sagging at supports) — coverage regression vs the
 *     pre-regional sweep.
 *  3. Shear capacity received the axial force with the solver's sign
 *     convention (+ = tension) while expecting + = compression — compression
 *     weakened and tension strengthened, both inverted.
 *  4. Column tie checks used the primary-axis effective depth for BOTH shear
 *     axes — the secondary axis was over/under-estimated when b != h.
 */
import { describe, expect, it } from 'vitest';
import {
  verifyProvidedReinforcement,
  computeShearCapacity,
  type ElementStationResult,
  type StationForces,
} from '../../station-design-forces';
import type { DesignAxes } from '../design-axes';
import type { ProvidedReinforcement } from '../../../store/model.svelte';

// ─── Shared builders ─────────────────────────────────────────

function st(t: number, over: Partial<StationForces> = {}): StationForces {
  return {
    t, x: t * 6,
    n: 0, vy: 0, vz: 0, my: 0, mz: 0, torsion: 0,
    ...over,
  };
}

function stationResult(stations: StationForces[]): ElementStationResult {
  return {
    elementId: 1, length: 6, stationTs: stations.map(s => s.t),
    comboResults: [{ comboId: 1, comboName: 'C1', stations }],
  };
}

const MY_AXES: DesignAxes = {
  flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
  bFlex: 0.6, hFlex: 0.3, biaxial: false,
  sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
};

// ─── 1. Column P-M axis (blocker) ────────────────────────────

describe('column uniaxial P-M uses the correct bending depth', () => {
  // 0.6(b) x 0.3(h) column, 8Ø20, My=200 kN·m bends over h=0.3 (weak axis).
  // Old code checked at depth b=0.6: util 0.68 (false pass). Correct: ~1.5.
  const columnReinf: ProvidedReinforcement = {
    column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
    stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
  };
  const section = { b: 0.6, h: 0.3, fc: 25, fy: 420, cover: 0.04, stirrupDia: 8 };

  function columnCheck(my: number) {
    const res = verifyProvidedReinforcement(
      1, 'column', columnReinf, undefined,
      { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
      section,
      stationResult([st(0, { my, n: -200 }), st(0.5, { my, n: -200 }), st(1, { my, n: -200 })]),
      undefined,
      { axes: MY_AXES, slenderDeltaNs: 1 },
    );
    return res.checks.find(c => c.category.startsWith('Uniaxial P-M') || c.category.startsWith('Biaxial P-M'));
  }

  it('fails a 200 kN·m demand on the weak axis (was a false pass at 0.68)', () => {
    const check = columnCheck(200);
    expect(check).toBeDefined();
    // Correct capacity ≈ 132 kN·m → util ≈ 1.5. Old (wrong) value was ≈ 0.68.
    expect(check!.ratio).toBeGreaterThan(1.4);
    expect(check!.status).toBe('fail');
  });

  it('passes the same demand scaled to the true capacity', () => {
    const check = columnCheck(120);
    expect(check).toBeDefined();
    expect(check!.ratio).toBeLessThan(1.0);
  });
});

// ─── 2. Opposite-sign coverage sweep (high) ──────────────────

describe('opposite-sign demand is checked, not silently skipped', () => {
  const beamSection = { b: 0.3, h: 0.6, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const beamAxes: DesignAxes = {
    ...MY_AXES, bFlex: 0.3, hFlex: 0.6,
  };
  // Support hogging -100, but midspan hogging -120 (cantilever/pattern-load shape).
  const hogStations = [
    st(0, { my: -100, vz: 20 }), st(0.25, { my: -100, vz: 10 }),
    st(0.5, { my: -120, vz: 0 }), st(0.75, { my: -100, vz: -10 }),
    st(1, { my: -100, vz: -20 }),
  ];

  function beamChecks(reinforcement: ProvidedReinforcement, stations: StationForces[]) {
    const res = verifyProvidedReinforcement(
      1, 'beam', reinforcement, undefined,
      { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
      beamSection, stationResult(stations), undefined,
      { axes: beamAxes },
    );
    return res.checks;
  }

  const withTop = (diameter: number): ProvidedReinforcement => ({
    regions: {
      bottomSpan: { count: 2, diameter: 16 },
      topStart: { count: 2, diameter },
      topEnd: { count: 2, diameter },
      stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.15 },
      stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.2 },
    },
  });

  it('span hogging is checked against continuing top steel and fails when undersized', () => {
    const checks = beamChecks(withTop(10), hogStations);
    const topSpan = checks.find(c => c.category.startsWith('Top Span'));
    expect(topSpan, 'a Top Span check must exist').toBeDefined();
    // 2Ø10 top continuing: φMn far below 120 kN·m.
    expect(topSpan!.ratio).toBeGreaterThan(1.0);
    expect(topSpan!.status).toBe('fail');
  });

  it('span hogging with no top steel is an explicit missing-reinforcement failure', () => {
    const bare: ProvidedReinforcement = {
      regions: { bottomSpan: { count: 2, diameter: 16 } },
      stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
    };
    const checks = beamChecks(bare, hogStations);
    const topSpan = checks.find(c => c.category.startsWith('Top Span'));
    expect(topSpan).toBeDefined();
    expect(topSpan!.missingReinforcement).toBe(true);
    expect(topSpan!.ratio).toBe(Number.POSITIVE_INFINITY);
  });

  it('span hogging covered by continuing top steel passes', () => {
    const checks = beamChecks(withTop(25), hogStations);
    const topSpan = checks.find(c => c.category.startsWith('Top Span'));
    expect(topSpan).toBeDefined();
    expect(topSpan!.ratio).toBeLessThan(1.0);
  });

  it('no opposite-sign demand → no opposite-sign check (no noise)', () => {
    const sagOnly = [
      st(0, { my: -100, vz: 20 }), st(0.25, { my: -40, vz: 10 }),
      st(0.5, { my: 80, vz: 0 }), st(0.75, { my: -40, vz: -10 }),
      st(1, { my: -100, vz: -20 }),
    ];
    const checks = beamChecks(withTop(16), sagOnly);
    expect(checks.find(c => c.category.startsWith('Top Span'))).toBeUndefined();
  });

  it('support sagging is checked against continuing bottom steel', () => {
    const sagAtSupports = [
      st(0, { my: 150, vz: 20 }), st(0.25, { my: 40, vz: 10 }),
      st(0.5, { my: 60, vz: 0 }), st(0.75, { my: 40, vz: -10 }),
      st(1, { my: 150, vz: -20 }),
    ];
    const checks = beamChecks({
      regions: {
        bottomSpan: { count: 2, diameter: 12 },
        topStart: { count: 2, diameter: 16 }, topEnd: { count: 2, diameter: 16 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.15 },
      },
    }, sagAtSupports);
    const bottomStart = checks.find(c => c.category.startsWith('Bottom Start'));
    const bottomEnd = checks.find(c => c.category.startsWith('Bottom End'));
    expect(bottomStart, 'Bottom Start check must exist').toBeDefined();
    expect(bottomEnd, 'Bottom End check must exist').toBeDefined();
    // 2Ø12 bottom continuing vs 150 kN·m → fails.
    expect(bottomStart!.status).toBe('fail');
    expect(bottomEnd!.status).toBe('fail');
  });
});

// ─── 3. Shear axial sign (medium-high) ───────────────────────

describe('shear capacity uses compression-positive axial', () => {
  const beamSection = { b: 0.3, h: 0.6, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const beamAxes: DesignAxes = { ...MY_AXES, bFlex: 0.3, hFlex: 0.6 };
  const reinf: ProvidedReinforcement = {
    regions: {
      bottomSpan: { count: 2, diameter: 16 },
      stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
      stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.15 },
    },
  };

  function shearCapacityWithAxial(n: number): number {
    const res = verifyProvidedReinforcement(
      1, 'beam', reinf, undefined,
      { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
      beamSection,
      stationResult([st(0.5, { vz: 100, n })]),
      undefined, { axes: beamAxes },
    );
    const check = res.checks.find(c => c.category.startsWith('Shear Span'));
    expect(check).toBeDefined();
    return check!.capacity;
  }

  it('compression (solver n < 0) increases φVn; tension decreases it', () => {
    const capCompression = shearCapacityWithAxial(-300);
    const capZero = shearCapacityWithAxial(0);
    const capTension = shearCapacityWithAxial(300);
    expect(capCompression).toBeGreaterThan(capZero);
    expect(capTension).toBeLessThan(capZero);
    // Pin the exact CIRSOC shapes (compression enhancement, tension reduction).
    // d comes from the bottom layer centroid: 0.6 - (0.025 + 0.008 + 0.016/2).
    expect(capZero).toBeCloseTo(
      computeShearCapacity(8, 2, 0.15, 0.3, 0.559, 30, 420, 0).phiVn, 1,
    );
  });
});

// ─── 4. Column ties: per-axis effective depth (medium) ──────

describe('column tie checks use the per-axis effective depth', () => {
  const section = { b: 0.6, h: 0.3, fc: 25, fy: 420, cover: 0.04, stirrupDia: 8 };
  const reinf: ProvidedReinforcement = {
    column: { cornerDia: 20, faceDia: 20, nBottom: 0, nTop: 0, nLeft: 0, nRight: 0 },
    stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
  };

  it('secondary-axis ties use d from b, not from h', () => {
    const res = verifyProvidedReinforcement(
      1, 'column', reinf, undefined,
      { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
      section,
      stationResult([st(0.5, { vz: 50, vy: 50, n: -500 })]),
      undefined, { axes: MY_AXES, slenderDeltaNs: 1 },
    );
    const primary = res.checks.find(c => c.category === 'Ties (Vz)');
    const secondary = res.checks.find(c => c.category === 'Ties (Vy)');
    expect(primary).toBeDefined();
    expect(secondary).toBeDefined();
    const dTieFor = (depth: number) => depth - 0.04 - 0.008 - 0.008;
    // Primary (Vz): width b=0.6, depth from h=0.3. Secondary (Vy): width h=0.3,
    // depth from b=0.6 — previously ALSO from h (understated).
    expect(primary!.capacity).toBeCloseTo(
      computeShearCapacity(8, 2, 0.15, 0.6, dTieFor(0.3), 25, 420, 500).phiVn, 1,
    );
    expect(secondary!.capacity).toBeCloseTo(
      computeShearCapacity(8, 2, 0.15, 0.3, dTieFor(0.6), 25, 420, 500).phiVn, 1,
    );
  });
});
