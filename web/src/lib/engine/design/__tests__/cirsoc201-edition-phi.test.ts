/**
 * The design paths compute φ by CIRSOC 201-2025 Tabla 21.2.2, which is the edition their check
 * rows are labelled with; the CIRSOC FLEX calculator keeps the 2005 ramp it is validated against.
 *
 * Tabla 21.2.2, ties: φ = 0,65 up to εty, 0,65 + 0,25·(εt − εty)/0,003 in the transition and 0,90
 * from εty + 0,003, with εty = fy/Es (21.2.2.1). ADN 500: εty = 0,0025, so the transition ends at
 * 0,0055. The 2005 ramp ran from εy to 0,005 instead: at εt = 0,004 it gives 0,80 against 0,775.
 */
import { describe, it, expect } from 'vitest';
import {
  verifyProvidedReinforcement, computeColumnCapacity, computeColumnLayout,
  type ElementStationResult, type StationForces,
} from '../../station-design-forces';
import { flangedCapacity } from '../../codes/argentina/cirsoc201-capacity';
import { generateInteractionDiagram } from '../../codes/argentina/interaction-diagram';
import { columnInteraction } from '../column-interaction';
import { concreteCheckRows } from '../check-rows';
import { CIRSOC201_DESIGN_EDITION } from '../../codes/argentina/cirsoc201-basis';
import type { DesignAxes } from '../design-axes';
import type { MemberContext } from '../member-context';
import type { ProvidedReinforcement } from '../../../store/model.svelte';

const st = (t: number, my: number): StationForces => ({ t, x: t * 6, n: 0, vy: 0, vz: 0, my, mz: 0, torsion: 0 });
const stations = (list: StationForces[]): ElementStationResult => ({
  elementId: 1, length: 6, stationTs: list.map((s) => s.t), comboResults: [{ comboId: 1, comboName: 'C1', stations: list }],
});

/*
 * A T beam whose block leaves the flange: bw 0,30, h 0,35, flange bf 0,60 × hf 0,05, 4Ø25 in one
 * row, cover 0,025, stirrups Ø8, H-25, ADN 500.
 *   d = 0,35 − 0,025 − 0,008 − 0,0125 = 0,3045 m; As = 4·π·0,025²/4 = 19,635 cm².
 *   T = As·fy = 981,75 kN; overhangs Cf = 0,85·25 000·(0,60 − 0,30)·0,05 = 318,75 kN;
 *   web Cw = T − Cf = 663,0 kN → a = Cw/(0,85·25 000·0,30) = 0,1040 m > hf;
 *   c = a/0,85; εt = 0,003·(d − c)/c = 0,00447 (yields, and inside the 2025 transition).
 *   Mn = Cf·(d − hf/2) + Cw·(d − a/2); φMn = φ(εt)·Mn.
 */
describe('a T beam out of its flange, ADN 500', () => {
  const fc = 25, fy = 500, bw = 0.30, h = 0.35, bf = 0.6, hf = 0.05, cover = 0.025;
  const d = h - cover - 0.008 - 0.0125;
  const As = 4 * Math.PI * 0.025 ** 2 / 4;
  const T = As * fy * 1000;
  const Cf = 0.85 * fc * 1000 * (bf - bw) * hf;
  const Cw = T - Cf;
  const a = Cw / (0.85 * fc * 1000 * bw);
  const c = a / 0.85;
  const et = 0.003 * (d - c) / c;
  const Mn = Cf * (d - hf / 2) + Cw * (d - a / 2);
  const phi25 = 0.65 + 0.25 * (et - 0.0025) / 0.003;
  const phi05 = 0.65 + 0.25 * (et - 0.0025) / (0.005 - 0.0025);

  it('the hand case is in the transition zone of both editions', () => {
    expect(a).toBeGreaterThan(hf);
    expect(et).toBeGreaterThan(0.0025);
    expect(et).toBeLessThan(0.005);
    expect(phi25).toBeCloseTo(0.8138, 3);
  });

  it('flangedCapacity takes the edition: 2025 on request, 2005 by default for the calculator', () => {
    const params = { fc, fy, h, cover, stirrupDia: 8 } as never;
    // effectiveDepth subtracts half a Ø16, so h is given as d + cover + stirrup + 0,008.
    const p25 = flangedCapacity({ ...(params as object), h: d + cover + 0.008 + 0.008 } as never, { bf, hf, bw }, As * 1e4, '2025');
    expect(p25.withinFlange).toBe(false);
    expect(p25.epsilonT).toBeCloseTo(et, 6);
    expect(p25.phi).toBeCloseTo(phi25, 6);
    expect(p25.phiMn).toBeCloseTo(phi25 * Mn, 2);
    const p05 = flangedCapacity({ ...(params as object), h: d + cover + 0.008 + 0.008 } as never, { bf, hf, bw }, As * 1e4);
    expect(p05.phi).toBeCloseTo(phi05, 6);
  });

  it('the beam verifier\'s sagging check computes φMn by Tabla 21.2.2', () => {
    const axes: DesignAxes = {
      flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
      bFlex: bw, hFlex: h, biaxial: false,
      sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
    };
    const reinf: ProvidedReinforcement = {
      regions: {
        bottomSpan: { count: 4, diameter: 25 },
        stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.15 },
      },
    };
    const res = verifyProvidedReinforcement(
      1, 'beam', reinf, undefined, { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
      { b: bw, h, fc, fy, cover, stirrupDia: 8, flange: { bf, hf } },
      stations([st(0, 20), st(0.25, 100), st(0.5, 150), st(0.75, 100), st(1, 20)]), undefined, { axes },
    );
    const bottom = res.checks.find((x) => x.category.startsWith('Bottom Span'))!;
    expect(bottom.description).toContain('d=30.4cm');
    expect(bottom.capacity!).toBeCloseTo(phi25 * Mn, 0);
    // And the row says which edition that was.
    const row = concreteCheckRows(res).find((r) => r.title.startsWith('Bottom Span'))!;
    expect(row.edition).toBe('2025');
    expect(CIRSOC201_DESIGN_EDITION).toBe('2025');
  });
});

/*
 * The column editor's interaction plot of a rectangle, against the rectangular verification at the
 * same axial load: 0,30 × 0,50, 6Ø20 (a bar mid-face top and bottom), H-25, ADN 500, cover 0,03,
 * ties Ø8. Every plotted point inside the 2025 transition (εty < εt < εty + 0,003) must carry the
 * moment the verifier finds there; a 2005 φ on the plot misses it by up to 3 %.
 */
describe('the interaction plot of a rectangular column', () => {
  it('matches the rectangular verification in the transition zone', () => {
    const b = 0.3, h = 0.5, fc = 25, fy = 500, cover = 0.03;
    const r: ProvidedReinforcement = {
      column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 0, nRight: 0 },
      stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
    };
    const ctx = {
      section: { b, h }, material: { fc, fy, cover, stirrupDia: 8 },
      slenderDeltaNs: 1, slenderDeltaS: 1, stations: undefined, shape: undefined,
    } as unknown as MemberContext;
    const plot = columnInteraction(ctx, r)!;
    const lay = computeColumnLayout(6, 20, b, h, cover, 8, r.column);
    const AsCm2 = 6 * 3.142;
    const dt = h - Math.min(...lay.bars.map((q) => q.y));
    const cap = 0.65 * 0.8 * (0.85 * fc * 1000 * (b * h - AsCm2 * 1e-4) + fy * 1000 * AsCm2 * 1e-4);
    let inTransition = 0;
    for (const p of plot.overDepth) {
      if (p.P <= 50 || p.P >= 0.95 * cap) continue;
      const v = computeColumnCapacity(AsCm2, b, h, fc, fy, cover, 8, p.P, 1, lay.bars, 'z');
      const c = v.cNeutral!;
      const et = 0.003 * (dt - c) / c;
      if (et <= 0.0025 || et >= 0.0055) continue;
      inTransition++;
      expect(p.M / v.phiMn, `P = ${p.P.toFixed(1)} kN, εt = ${et.toFixed(5)}`).toBeCloseTo(1, 2);
    }
    expect(inTransition).toBeGreaterThanOrEqual(2);
  });
});

/*
 * The verification detail's diagram of a rectangular column (two faces of steel, the displaced
 * concrete not deducted, as that diagram is built): 0,30 × 0,50, 6Ø20 (9,425 cm² a face) at
 * 0,05 from each face, H-25, ADN 500. At a plotted c: a = 0,85·c, Cc = 0,85·25 000·0,30·a,
 * εs' = 0,003·(c − 0,05)/c, εt = 0,003·(0,45 − c)/c, stresses within ±fy;
 * Mn = Cc·(h/2 − a/2) + As'·fs'·(h/2 − d') + As·fs·(d − h/2), and φ by Tabla 21.2.2.
 */
describe('the rectangular diagram of the verification detail', () => {
  it('takes φ from Tabla 21.2.2 when asked for 2025', () => {
    const b = 0.3, h = 0.5, fc = 25, fy = 500, dp = 0.05, d = h - dp, As = 3 * Math.PI * 0.02 ** 2 / 4;
    const diag = generateInteractionDiagram({ b, h, fc, fy, cover: dp, AsProv: 2 * As * 1e4, barCount: 6, barDia: 20, nPoints: 80, edition: '2025' });
    let inTransition = 0;
    for (const p of diag.points) {
      const c = p.c;
      const et = 0.003 * (d - c) / c;
      if (et <= 0.0025 || et >= 0.0055) continue;
      inTransition++;
      const a = Math.min(0.85 * c, h);
      const Cc = 0.85 * fc * 1000 * b * a;
      const fsp = Math.max(-fy, Math.min(fy, 200000 * 0.003 * (c - dp) / c)) * 1000;
      const fs = Math.min(fy, 200000 * et) * 1000;
      const Mn = Cc * (h / 2 - a / 2) + As * fsp * (h / 2 - dp) + As * fs * (d - h / 2);
      const phi = 0.65 + 0.25 * (et - 0.0025) / 0.003;
      expect(p.phiMn, `c = ${c.toFixed(4)}`).toBeCloseTo(phi * Mn, 6);
    }
    expect(inTransition).toBeGreaterThanOrEqual(2);
  });
});

/*
 * A beam's provided-bar check of maximum steel, CIRSOC 201-2025 §9.3.3.1: a non-prestressed beam
 * with Pu < 0,10·f'c·Ag "debe ser controlada por tracción de acuerdo con la Tabla 21.2.2"
 * (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md:303-306), εt ≥ εty + 0,003.
 * 0,30 × 0,50, H-25, ADN 500, cover 0,025, stirrups Ø8, 3Ø20 bottom in one row, no top bars:
 *   d = 0,50 − 0,025 − 0,008 − 0,010 = 0,457 m; εty + 0,003 = 0,0025 + 0,003 = 0,0055;
 *   c = 0,003·d/(0,003 + 0,0055) = 0,16129 m; a = β1·c = 0,85·c = 0,13710 m;
 *   As,max = 0,85·f'c·b·a/fy = 0,85·25·0,30·0,13710/500 = 17,48 cm². (εt ≥ 0,005, 2005's limit: 18,57 cm².)
 */
describe('maximum steel of a beam, ADN 500 (9.3.3.1)', () => {
  it('the provided-bar check reads the tension-controlled limit of Tabla 21.2.2, εty + 0,003', () => {
    const b = 0.3, h = 0.5, fc = 25, fy = 500, cover = 0.025;
    const d = h - cover - 0.008 - 0.010;
    const c = 0.003 * d / (0.003 + fy / 200000 + 0.003);
    const asMax = 0.85 * fc * b * 0.85 * c / fy * 1e4;
    expect(asMax).toBeCloseTo(17.48, 2);
    const axes: DesignAxes = {
      flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
      bFlex: b, hFlex: h, biaxial: false,
      sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
    };
    const reinf: ProvidedReinforcement = {
      regions: {
        bottomSpan: { count: 3, diameter: 20 },
        stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.15 },
      },
    };
    const res = verifyProvidedReinforcement(
      1, 'beam', reinf, undefined, { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
      { b, h, fc, fy, cover, stirrupDia: 8 },
      stations([st(0, 20), st(0.25, 60), st(0.5, 80), st(0.75, 60), st(1, 20)]), undefined, { axes },
    );
    const max = res.checks.find((x) => x.category === 'Max steel (span)')!;
    expect(max.required!).toBeCloseTo(asMax, 1);
    expect(max.description).toContain('εt≥5.50‰');
  });
});

/*
 * The clause each concrete row names is the one it evaluated: the specified cover is 20.5.1.3 in
 * CIRSOC 201-2025 (capitulo-20-armadura-de-acero-propiedades-durabilidad-y.md:1204, "20.5.1.3
 * Requisitos para el recubrimiento especificado"), and a wall's minimum steel is computed by the
 * beam path with 9.6.1.2's flexural minimum, not by Table 11.6.1.
 */
describe('the clause of the cover and of a wall\'s minimum steel', () => {
  it('20.5.1.3 and 9.6.1.2', () => {
    const check = (category: string, limiting: string) => ({ category, limiting, status: 'fail', ratio: 1.5, unit: '—', method: 'capacity', tuplesChecked: 0, description: '', demandCategory: null });
    const p = { elementId: 1, elementType: 'wall', hasProvided: true, overallStatus: 'fail', worstUtilization: 1.5, checkedAxes: [], strengthCheckCount: 0,
      checks: [check('Layout: cover', 'cover'), check('Min steel (span)', 'minSteel')] };
    expect(concreteCheckRows(p as never).map((r) => r.clause)).toEqual(['20.5.1.3', '9.6.1.2']);
  });
});
