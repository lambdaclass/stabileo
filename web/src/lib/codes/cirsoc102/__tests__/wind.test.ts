import { describe, it, expect } from 'vitest';
import { teAllAt, teAt } from '../../../i18n/engine-text';
import {
  CP_SIDE_WALL, CP_WINDWARD_WALL, EXPOSURE_CONSTANTS, G_RIGID, KD,
  applyMinimumWindLoad, classifyEnclosure, computeWindPressures, cpLeewardWall,
  groundElevationFactor, internalPressureCoefficient, roofCp, velocityPressure,
  velocityPressureExposureCoefficient, type WindProject,
} from '../wind';

/**
 * Table 1.13-1 as printed in CIRSOC 102-2025, p. 79.
 * [z, K_z(B), K_z(C), K_z(D)]
 */
const TABLE_1_13_1: Array<[number, number, number, number]> = [
  [0, 0.59, 0.87, 1.05], [10, 0.71, 1.00, 1.19], [15, 0.79, 1.08, 1.27],
  [20, 0.85, 1.15, 1.34], [25, 0.90, 1.20, 1.39], [30, 0.95, 1.25, 1.44],
  [35, 0.99, 1.29, 1.47], [40, 1.02, 1.33, 1.51], [45, 1.05, 1.36, 1.54],
  [50, 1.08, 1.39, 1.57], [60, 1.14, 1.44, 1.62], [70, 1.19, 1.49, 1.66],
  [80, 1.23, 1.53, 1.70], [90, 1.27, 1.56, 1.74], [100, 1.30, 1.60, 1.77],
  [110, 1.34, 1.63, 1.80], [120, 1.37, 1.66, 1.83], [130, 1.40, 1.69, 1.85],
  [140, 1.43, 1.71, 1.88], [150, 1.45, 1.74, 1.90],
];

describe('§1.13.1 — K_z reproduces the published Table 1.13-1', () => {
  // The whole table, to the precision it is printed at. This is the check that says the
  // formula was transcribed correctly rather than plausibly.
  it.each(TABLE_1_13_1)('z = %i m', (z, kb, kc, kd) => {
    expect(velocityPressureExposureCoefficient(z, 'B')).toBeCloseTo(kb, 2);
    expect(velocityPressureExposureCoefficient(z, 'C')).toBeCloseTo(kc, 2);
    expect(velocityPressureExposureCoefficient(z, 'D')).toBeCloseTo(kd, 2);
  });

  it('floors z at 5 m, as the "z < 5 m" row requires', () => {
    // The table's 0–5 m row is a single value, so 0 m, 2 m and 5 m must agree.
    for (const e of ['B', 'C', 'D'] as const) {
      const at5 = velocityPressureExposureCoefficient(5, e);
      expect(velocityPressureExposureCoefficient(0, e)).toBeCloseTo(at5, 12);
      expect(velocityPressureExposureCoefficient(2, e)).toBeCloseTo(at5, 12);
    }
  });

  it('saturates at 2,41 above the gradient height z_g', () => {
    expect(velocityPressureExposureCoefficient(800, 'D')).toBeCloseTo(2.41, 12);
    expect(velocityPressureExposureCoefficient(EXPOSURE_CONSTANTS.C.zg + 1, 'C')).toBeCloseTo(2.41, 12);
  });

  it('refuses to extrapolate above 1000 m instead of guessing', () => {
    expect(velocityPressureExposureCoefficient(1001, 'B')).toBeNaN();
  });

  it('uses the Table 1.9-1 constants', () => {
    expect(EXPOSURE_CONSTANTS.B).toEqual({ alpha: 7.5, zg: 1000 });
    expect(EXPOSURE_CONSTANTS.C).toEqual({ alpha: 9.8, zg: 750 });
    expect(EXPOSURE_CONSTANTS.D).toEqual({ alpha: 11.5, zg: 590 });
  });

  it('increases monotonically with height in every exposure', () => {
    for (const e of ['B', 'C', 'D'] as const) {
      let prev = 0;
      for (let z = 5; z <= 500; z += 5) {
        const k = velocityPressureExposureCoefficient(z, e);
        expect(k).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = k;
      }
    }
  });
});

describe('§1.12 — ground-elevation factor K_e', () => {
  it('is 1,0 at sea level', () => {
    expect(groundElevationFactor(0)).toBeCloseTo(1.0, 12);
  });

  it('matches the printed expression at altitude', () => {
    // A site at 750 m: e^(-0,000119 * 750) = e^(-0,08925) = 0,914617
    expect(groundElevationFactor(750)).toBeCloseTo(Math.exp(-0.000119 * 750), 12);
    expect(groundElevationFactor(750)).toBeCloseTo(0.9146, 4);
  });

  it('is always below 1, so the conservative K_e = 1,00 of note 1 is never unsafe', () => {
    for (const alt of [100, 500, 1000, 3000]) {
      expect(groundElevationFactor(alt)).toBeLessThan(1.0);
    }
  });
});

describe('§1.6 Table 1.6-1 — directionality', () => {
  it('gives 0,85 for buildings', () => {
    expect(KD.building).toBe(0.85);
  });

  it('transcribes the other structure types', () => {
    expect(KD.chimneySquare).toBe(0.90);
    expect(KD.chimneyHexagonal).toBe(0.95);
    expect(KD.chimneyRound).toBe(1.00);
    expect(KD.latticeTowerTriangularOrRect).toBe(0.85);
    expect(KD.latticeTowerOther).toBe(0.95);
  });
});

describe('§1.10 / Table 1.11-1 — enclosure and internal pressure', () => {
  it('classifies an open building at A0 >= 0,8 Ag', () => {
    expect(classifyEnclosure({ a0: 80, ag: 100, a0i: 5, agi: 300 })).toBe('open');
  });

  it('classifies an enclosed building at A0 <= min(0,01 Ag, 0,4 m²)', () => {
    // Ag = 100 -> 0,01 Ag = 1 m², so the 0,4 m² limit governs.
    expect(classifyEnclosure({ a0: 0.3, ag: 100, a0i: 20, agi: 300 })).toBe('enclosed');
  });

  it('classifies partially enclosed when the three criteria hold together', () => {
    // A0 > 1,10 A0i, A0 > 0,4 m², A0i/Agi <= 0,20
    expect(classifyEnclosure({ a0: 20, ag: 100, a0i: 10, agi: 300 })).toBe('partiallyEnclosed');
  });

  it('falls through to partially open when nothing else fits', () => {
    // A0 = 5 is not > 1,10 * 20 = 22, and 5 > 0,4, so it is neither enclosed nor
    // partially enclosed nor open.
    expect(classifyEnclosure({ a0: 5, ag: 100, a0i: 20, agi: 300 })).toBe('partiallyOpen');
  });

  it('gives the Table 1.11-1 (GC_pi) magnitudes', () => {
    expect(internalPressureCoefficient('open')).toBe(0);
    expect(internalPressureCoefficient('partiallyOpen')).toBe(0.18);
    expect(internalPressureCoefficient('enclosed')).toBe(0.18);
    expect(internalPressureCoefficient('partiallyEnclosed')).toBe(0.55);
  });
});

describe('Fig. 2.4-1 — external pressure coefficients', () => {
  it('gives the printed wall values', () => {
    expect(CP_WINDWARD_WALL).toBe(0.8);
    expect(CP_SIDE_WALL).toBe(-0.7);
    expect(cpLeewardWall(0.5)).toBe(-0.5);
    expect(cpLeewardWall(1)).toBe(-0.5);
    expect(cpLeewardWall(2)).toBeCloseTo(-0.3, 12);
    expect(cpLeewardWall(4)).toBe(-0.2);
    expect(cpLeewardWall(10)).toBe(-0.2);
  });

  it('interpolates the leeward wall between printed values, per note 2', () => {
    expect(cpLeewardWall(1.5)).toBeCloseTo(-0.4, 12);
    expect(cpLeewardWall(3)).toBeCloseTo(-0.25, 12);
  });

  it('returns both signs where the roof table lists two values, per note 3', () => {
    const r = roofCp(0.25, 20);
    expect(r.windward).toContain(-0.3);
    expect(r.windward).toContain(0.2);
    expect(r.leeward).toEqual([-0.6]);
  });

  it('gives the h/L >= 1 windward values, which are the most negative', () => {
    const low = roofCp(0.25, 10).windward[0];
    const high = roofCp(1.0, 10).windward[0];
    expect(high).toBeLessThan(low);
    expect(high).toBe(-1.3);
  });

  it('uses C_p = 0,8 above 80°, per the footnote', () => {
    expect(roofCp(0.5, 85).windward).toEqual([0.8]);
  });

  it('declares slopes below 10° unsupported rather than approximating', () => {
    const r = roofCp(0.5, 5);
    expect(r.windward).toEqual([]);
    expect(r.unsupported?.key).toBe('loads.cirsoc102.unsupported.shallowRoofParallelRidge');
    // Rendered, so the assertion also proves the key is translated in both locales.
    expect(teAt(r.unsupported!, 'es')).toMatch(/distancia horizontal desde el borde/);
    expect(teAt(r.unsupported!, 'en')).toMatch(/horizontal distance from the windward edge/);
  });
});

// ─── End-to-end ──────────────────────────────────────────────────

const project = (over: Partial<WindProject> = {}): WindProject => ({
  basicSpeed: 45, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: true,
  structureKind: 'building', enclosure: 'enclosed', meanRoofHeight: 10,
  L: 30, B: 20, roofSlopeDeg: 20, rigid: true, ...over,
});

describe('§1.13 Eq. (1.13-1) and §2.4.1 Eq. (2.4-1) end to end', () => {
  it('computes q_z by hand agreement', () => {
    // Exposure C, z = 10 m; K_zt = 1; K_d = 0,85; K_e = 1 (sea level).
    // Table 1.13-1 prints K_z = 1,00 at this height, but that is the rounded value: the
    // expression gives 0,99872, so the exact product is 1053,6 N/m² rather than the
    // 1054,9 that the rounded coefficient would give. Using the expression is what note 1
    // to the table directs, and rounding to the table would be a 0,13 % error carried
    // into every pressure.
    const q = velocityPressure(10, project());
    expect(q).toBeCloseTo(0.613 * velocityPressureExposureCoefficient(10, 'C') * 0.85 * 45 * 45, 9);
    expect(q).toBeCloseTo(1053.6, 0);
  });

  it('scales with V squared', () => {
    const a = velocityPressure(10, project({ basicSpeed: 40 }));
    const b = velocityPressure(10, project({ basicSpeed: 80 }));
    expect(b / a).toBeCloseTo(4, 9);
  });

  it('produces both internal-pressure sign cases', () => {
    const r = computeWindPressures(project());
    expect(new Set(r.pressures.map((p) => p.gcpiSign))).toEqual(new Set([1, -1]));
  });

  it('applies p = q G Cp - qi (GCpi) exactly', () => {
    const r = computeWindPressures(project());
    const qh = r.qhNm2;
    const lee = r.pressures.find((p) => p.surface === 'leewardWall' && p.gcpiSign === 1)!;
    // Cp for L/B = 30/20 = 1.5 -> -0.4
    expect(lee.cp).toBeCloseTo(-0.4, 12);
    expect(lee.pNm2).toBeCloseTo(qh * G_RIGID * -0.4 - 0.18 * qh, 9);
  });

  it('evaluates the windward wall with q_z and everything else with q_h', () => {
    const r = computeWindPressures(project({ meanRoofHeight: 40 }));
    const ww = r.pressures.filter((p) => p.surface === 'windwardWall' && p.gcpiSign === 1);
    // Two heights sampled, and the lower one must have the smaller q.
    expect(ww).toHaveLength(2);
    expect(ww[0].qNm2).toBeLessThan(ww[1].qNm2);
    for (const s of r.pressures.filter((p) => p.surface !== 'windwardWall')) {
      expect(s.qNm2).toBeCloseTo(r.qhNm2, 9);
    }
  });

  it('makes a partially enclosed building govern over an enclosed one', () => {
    const enc = computeWindPressures(project({ enclosure: 'enclosed' }));
    const par = computeWindPressures(project({ enclosure: 'partiallyEnclosed' }));
    const worst = (r: typeof enc) => Math.max(...r.pressures.map((p) => Math.abs(p.pNm2)));
    expect(worst(par)).toBeGreaterThan(worst(enc));
  });

  it('refuses to produce pressures for a flexible building', () => {
    const r = computeWindPressures(project({ rigid: false }));
    expect(r.pressures).toEqual([]);
    expect(r.unsupported.map((u) => u.key))
      .toContain('loads.cirsoc102.unsupported.flexibleBuilding');
    expect(teAllAt(r.unsupported, 'es').join(' ')).toMatch(/1\.9\.5/);
    expect(teAllAt(r.unsupported, 'en').join(' ')).toMatch(/1\.9\.5/);
  });

  it('always declares the torsional cases unsupported rather than omitting them silently', () => {
    const r = computeWindPressures(project());
    expect(r.unsupported.map((u) => u.key))
      .toContain('loads.cirsoc102.unsupported.torsionalCases');
    expect(teAllAt(r.unsupported, 'es').join(' ')).toMatch(/torsionales 2 y 4/);
    expect(teAllAt(r.unsupported, 'en').join(' ')).toMatch(/cases 2 and 4/);
  });

  it('records K_zt = 1,0 as an assumption when the site was not surveyed', () => {
    const r = computeWindPressures(project({ kztSurveyed: false }));
    expect(r.factors.kzt.origin).toBe('assumed');
    expect(r.assumptions.map((a) => a.key)).toContain('loads.cirsoc102.assumed.kzt');
    expect(teAllAt(r.assumptions, 'es').join(' ')).toMatch(/relevamiento del sitio/);
    expect(teAllAt(r.assumptions, 'en').join(' ')).toMatch(/without a site survey/);
    const surveyed = computeWindPressures(project({ kztSurveyed: true }));
    expect(surveyed.factors.kzt.origin).toBe('project');
    expect(surveyed.assumptions).toEqual([]);
  });

  it('provenances every factor', () => {
    const r = computeWindPressures(project());
    for (const [name, v] of Object.entries(r.factors)) {
      if (v.origin === 'project') continue;
      expect(v.refs.length, name).toBeGreaterThan(0);
      expect(v.refs.every((x) => x.edition === '2025'), name).toBe(true);
    }
  });
});

describe('§2.1.5 — minimum design wind load', () => {
  it('governs when the computed load is small', () => {
    const r = applyMinimumWindLoad(1000, 100, 50);
    // 750*100 + 400*50 = 95 000 N
    expect(r.minimumN).toBe(95_000);
    expect(r.governedByMinimum).toBe(true);
    expect(r.totalN).toBe(95_000);
  });

  it('does not govern when the computed load is larger', () => {
    const r = applyMinimumWindLoad(200_000, 100, 50);
    expect(r.governedByMinimum).toBe(false);
    expect(r.totalN).toBe(200_000);
  });

  it('applies wall and roof simultaneously, as the article requires', () => {
    const wallOnly = applyMinimumWindLoad(0, 100, 0).minimumN;
    const both = applyMinimumWindLoad(0, 100, 50).minimumN;
    expect(both).toBeGreaterThan(wallOnly);
  });

  it('compares on magnitude, so a suction total is not mistaken for a small one', () => {
    expect(applyMinimumWindLoad(-200_000, 100, 50).governedByMinimum).toBe(false);
  });
});
