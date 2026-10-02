/**
 * A slender column is designed for at least M2,min (§6.6.4.5.4, ACI 318-19 6.6.4.5.4).
 *
 * Mc = δns·max(M2, M2,min), M2,min = Pu·(15 mm + 0.03·h), about each axis separately. The
 * verifier multiplied the analysis moment by δns, so a column with no end moment was magnified
 * from zero and passed as pure compression: a pin-ended 6 m 30×30 at 680 kN, δns ≈ 5.3, which
 * the report's `checkSlender` failed. Both paths now read `slenderMinimumMoment`.
 */
import { describe, it, expect } from 'vitest';
import { verifyProvidedReinforcement, type ElementStationResult } from '../station-design-forces';
import type { ProvidedReinforcement } from '../../store/model.svelte';
import { checkSlender } from '../codes/argentina/cirsoc201';
import { buildAllMemberContexts } from '../design/member-context';
import type { StationForces } from '../station-forces';

const section = { b: 0.3, h: 0.3, fc: 25, fy: 420, cover: 0.04, stirrupDia: 8 };
const reinf: ProvidedReinforcement = {
  column: { cornerDia: 16, faceDia: 16, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
  stirrups: { diameter: 8, legs: 2, spacing: 0.15 },
};
const AXES = {
  flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
  bFlex: 0.3, hFlex: 0.3, biaxial: false,
  sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
} as never;
const st = (t: number, n: number, my: number) => ({ t, x: t * 6, n, vy: 0, vz: 0, my, mz: 0, torsion: 0 }) as StationForces;
const stations = (n: number, my: number): ElementStationResult => ({
  elementId: 1, length: 6, stationTs: [0, 0.5, 1],
  comboResults: [{ comboId: 1, comboName: 'U1', stations: [st(0, n, my), st(0.5, n, my), st(1, n, my)] }],
});

function model() {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 6 }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
    sections: new Map([[1, { id: 1, name: 'C30', b: 0.3, h: 0.3, a: 0.09, iy: 0.3 ** 4 / 12, iz: 0.3 ** 4 / 12 }]]),
    materials: new Map([[1, { id: 1, name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25 }]]),
    supports: new Map([[1, { nodeId: 1, type: 'pinned3d' }], [2, { nodeId: 2, type: 'pinned3d' }]]),
  };
}

describe('a slender column reaches the verifier with M2,min (§6.6.4.5.4)', () => {
  it('a 6 m 30x30 column at Pu = 680 kN with no end moment', () => {
    const Nu = 680;
    const ctx = buildAllMemberContexts(model() as never, { stations: new Map([[1, stations(-Nu, 0)]]) }).get(1)!;
    const delta = ctx.slenderDeltaNs;
    const slender = checkSlender({ fc: 25, fy: 420, cover: 0.04, b: 0.3, h: 0.3, stirrupDia: 8 }, Nu, 0, 6, { M1: 0, M2: 0, psiA: 20, psiB: 20 });
    // What the code asks the section to carry: Mc = δns·max(M2, M2,min).
    const withMin = verifyProvidedReinforcement(1, 'column', reinf, undefined,
      { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } }, section,
      stations(-Nu, Nu * (0.015 + 0.03 * 0.3)), undefined, { axes: AXES, slenderDeltaNs: delta });
    const asRun = verifyProvidedReinforcement(1, 'column', reinf, undefined,
      { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } }, section,
      stations(-Nu, 0), undefined, { axes: AXES, slenderDeltaNs: delta });
    const pm = (r: typeof asRun) => r.checks.find((c) => /P-M/.test(c.category))!;
    expect(delta).toBeGreaterThan(1.5);
    // The report's path asks for the magnified minimum.
    expect(slender.Mc).toBeCloseTo(delta * Nu * (0.015 + 0.03 * 0.3), 6);
    expect(pm(withMin).ratio).toBeGreaterThan(1);
    // The verifier the design run uses: should agree with the M2,min case.
    expect(pm(asRun).ratio).toBeGreaterThan(1);
    expect(pm(asRun).description).toMatch(/M2,min/);
  });
});
