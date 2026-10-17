/**
 * Regression tests for defects found while inventorying the engineering logic computed in
 * TypeScript (docs/verification/TS_ENGINE_LOGIC.md, findings 7, 8 and 9).
 */
import { describe, it, expect } from 'vitest';
import { statusFromRatio } from '../codes/argentina/cirsoc301';
import { ratioToStatus, normalizeWasmRC } from '../design-check-results';
import { checkCrackWidth } from '../codes/argentina/serviceability';
import { autoVerifyFromResults } from '../auto-verify';

describe('a ratio above 1,0 is a failure, never a warning (finding 8)', () => {
  it.each([[1.0, 'ok'], [0.95, 'ok'], [1.0001, 'fail'], [1.04, 'fail'], [1.09, 'fail'], [NaN, 'fail']])(
    'ratio %s', (ratio, status) => {
      expect(statusFromRatio(ratio)).toBe(status);
      expect(ratioToStatus(ratio)).toBe(status);
    });

  it('an engine result that says it did not pass is not shown as passing', () => {
    const [r] = normalizeWasmRC([{ elementId: 1, unityRatio: 0.5, pass: false, unevaluated: ['Shear'] }], 'aci', 'ACI 318', new Map());
    expect(r.status).toBe('fail');
  });
});

describe('crack width uses the SI form of Gergely–Lutz (finding 9)', () => {
  it('matches a hand calculation of the cracked section', () => {
    // 30×50, d = 45, 5 Ø16 = 10,05 cm², Ms = 100 kN·m, H-25, cover 3 cm.
    const As = 5 * 2.011;
    const r = checkCrackWidth(0.30, 0.50, 0.45, As, 100, 0.03, 16, 5, 25);
    const n = 200000 / (4700 * 5);
    const rhoN = (As * 1e-4 / (0.30 * 0.45)) * n;
    const k = Math.sqrt(2 * rhoN + rhoN * rhoN) - rhoN;
    const fs = 100 / (As * 1e-4 * (1 - k / 3) * 0.45) / 1000;
    const dc = 46; // mm
    const A = 2 * dc * 300 / 5; // mm²
    const beta = (0.50 - k * 0.45) / (0.45 - k * 0.45);
    const w = 11e-6 * beta * fs * Math.cbrt(dc * A);
    expect(r.wk).toBeCloseTo(w, 6);
    // An ordinary beam at service cracks about 0,2 mm, not 1,3 mm.
    expect(r.wk).toBeGreaterThan(0.15);
    expect(r.wk).toBeLessThan(0.25);
  });
});

describe('auto-verify checks a member in tension under tension in shear (finding 7)', () => {
  const model = {
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 6, y: 0, z: 3 }]]),
    sections: new Map([[1, { id: 1, name: '30x60', b: 0.3, h: 0.6 }]]),
    materials: new Map([[1, { id: 1, name: 'H-25', fy: 25 }]]),
    supports: new Map(),
  };
  const forces = (n: number) => ({
    elementForces: [{
      elementId: 1, length: 6,
      nStart: n, nEnd: n, vyStart: 0, vyEnd: 0, vzStart: 150, vzEnd: -150,
      myStart: -100, myEnd: -100, mzStart: 0, mzEnd: 0, mxStart: 0, mxEnd: 0,
    }],
  });

  it('tension lowers Vc and compression of the same size raises it', () => {
    const tension = autoVerifyFromResults(forces(400) as never, model as never, null).concrete[0];
    const compression = autoVerifyFromResults(forces(-400) as never, model as never, null).concrete[0];
    expect(tension.shear.phiVc).toBeLessThan(compression.shear.phiVc);
    const none = autoVerifyFromResults(forces(0) as never, model as never, null).concrete[0];
    expect(tension.shear.phiVc).toBeLessThan(none.shear.phiVc);
    expect(compression.shear.phiVc).toBeGreaterThan(none.shear.phiVc);
  });
});

describe('the engine verdict, read exactly (mutants of design-check-results.ts)', () => {
  const read = (r: Record<string, unknown>) => normalizeWasmRC([{ elementId: 1, unityRatio: 0.5, ...r }], 'aci', 'ACI 318', new Map())[0].status;
  it('pass: false alone fails', () => expect(read({ pass: false, unevaluated: [] })).toBe('fail'));
  it('an unevaluated check alone fails', () => expect(read({ pass: true, unevaluated: ['Shear'] })).toBe('fail'));
  it('pass: true with nothing unevaluated reads the ratio', () => {
    expect(read({ pass: true, unevaluated: [] })).toBe('ok');
    expect(read({ pass: true, unevaluated: [], unityRatio: 1.02 })).toBe('fail');
  });
  it('a result with no ratio at all is not a pass', () => {
    expect(normalizeWasmRC([{ elementId: 1 }], 'aci', 'ACI 318', new Map())[0].status).toBe('fail');
  });
});
