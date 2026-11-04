/**
 * No check row carries a ratio nobody computed.
 *
 * The anchorage rows of the CIRSOC 201 verifier read 1.5 when they failed and 0.98 when a hook
 * was asked, whatever the lengths; the torsion row of the code check read 1.00 because its
 * capacity was set to the demand. A fixed number in the ratio column reads as a result: 0.98 is
 * «near the limit» and 1.00 is «at the limit, passes».
 */
import { describe, expect, it } from 'vitest';
import {
  verifyProvidedReinforcement, requiredLd, requiredLdh,
  type ElementStationResult, type StationForces,
} from '../../station-design-forces';
import { concreteCheckRows, elementOutcome } from '../check-rows';
import type { DesignAxes } from '../design-axes';
import type { ProvidedReinforcement } from '../../../store/model.svelte';
import { checkTorsion } from '../../codes/argentina/cirsoc201';
import { checkTorsion2025 } from '../../../codes/cirsoc201/torsion';

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
const SECTION = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
// A light sagging span: every strength check passes, so the anchorage rows are the only issue.
const STATIONS = [st(0, { my: -20, vz: 30 }), st(0.25, { my: 10, vz: 15 }), st(0.5, { my: 30, vz: 0 }), st(0.75, { my: 10, vz: -15 }), st(1, { my: -20, vz: -30 })];

const withBottom = (group: Record<string, unknown>): ProvidedReinforcement => ({
  regions: {
    bottomSpanLayers: [{ count: 3, diameter: 20, row: 0 }], bottomSpan: { count: 3, diameter: 20 },
    bottomGroups: [{ layers: [{ count: 3, diameter: 20, row: 0 }], label: 'all', continueStart: true, continueEnd: true, ...group }],
    topStart: { count: 3, diameter: 12 }, topEnd: { count: 3, diameter: 12 },
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
  },
} as never);

const verify = (r: ProvidedReinforcement) => verifyProvidedReinforcement(
  1, 'beam', r, undefined, { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
  SECTION, stationResult(STATIONS), undefined, { axes: AXES },
);
const anchorage = (r: ProvidedReinforcement) => verify(r).checks.filter((c) => c.category === 'Anchorage');

describe('anchorage rows: required over available, never a fixed number', () => {
  const ldh = requiredLdh(20, 25, 420);

  it('a straight bar that anchors only hooked: ℓd/ℓ,disp as provided, the hook asked, and no pass until it is there', () => {
    const v = verify(withBottom({ extensionStart: 0.5, extensionEnd: 2 }));
    const start = v.checks.filter((c) => c.category === 'Anchorage').find((c) => c.anchorHook?.toward === 'start')!;
    // Kept at 'warn' in the verifier so the design can still complete it with the hook.
    expect(start.status).toBe('warn');
    expect(start.ratio).not.toBe(0.98);
    expect([requiredLd(20, 25, 420, { favourableSpacing: true }), requiredLd(20, 25, 420)].some((x) => Math.abs(start.demand! - x) < 1e-3)).toBe(true);
    expect(start.capacity).toBe(0.5);
    expect(start.ratio).toBeCloseTo(start.demand! / 0.5, 2);
    expect(start.ratio).toBeGreaterThan(1);
    // The hook is within reach: ℓdh ≤ ℓ,disp.
    expect(ldh).toBeLessThan(0.5);
    // As provided the bars are straight: the member and the contract row do not pass.
    expect(v.overallStatus).toBe('fail');
    const row = concreteCheckRows(v).find((c) => c.title === 'Anchorage' && c.ratio === start.ratio)!;
    expect(row.status).toBe('fail');
  });

  it('an anchorage that is short even hooked: ratio is the adopted length over the available one', () => {
    const straight = anchorage(withBottom({ extensionStart: 0.2, extensionEnd: 2 }))[0]!;
    // Straight bars: the required length is the straight ℓd of the bars (Tabla 25.4.2.3).
    const ld = requiredLd(20, 25, 420, { favourableSpacing: true });
    const ldOther = requiredLd(20, 25, 420);
    expect(straight.status).toBe('fail');
    expect(straight.ratio).not.toBe(1.5);
    expect([ld, ldOther].some((x) => Math.abs(straight.demand! - x) < 1e-3)).toBe(true);
    expect(straight.capacity).toBe(0.2);
    expect(straight.ratio).toBeCloseTo(straight.demand! / 0.2, 2);
    const hooked = anchorage(withBottom({ extensionStart: 0.2, extensionEnd: 2, anchorageStart: 'hook' }))[0]!;
    expect(hooked.status).toBe('fail');
    expect(hooked.ratio).toBeCloseTo(ldh / 0.2, 3);
  });

  it('no length into the region: not evaluated, no ratio, and never a pass', () => {
    const r = withBottom({ extensionStart: 0, extensionEnd: 2 });
    const v = verify(r);
    const row = v.checks.find((c) => c.category === 'Anchorage')!;
    expect(row.limiting).toBe('unsupportedCheck');
    expect(row.status).toBe('fail');
    const contract = concreteCheckRows(v).find((c) => c.title === 'Anchorage')!;
    expect(contract.ratio).toBeNull();
    expect(contract.status).toBe('unsupported');
    expect(contract.clause).toBe('25.4.2');
    expect(elementOutcome(1, 'concrete', 'cirsoc-201', concreteCheckRows(v)).status).not.toBe('ok');
  });
});

describe('the torsion row of the code check states the section, not the demand twice', () => {
  // 30×60 H-25: the meshed beam's case, Tu = 7,56 kN·m with a modest shear.
  const P = { fc: 25, fy: 420, cover: 0.025, b: 0.3, h: 0.6, stirrupDia: 8 };

  it('φTn is the torque §22.7.7.1 admits with the coexisting Vu; the ratio is Tu over it', () => {
    const r = checkTorsion(P, 7.56, 40, '2025');
    expect(r.neglect).toBe(false);
    expect(r.phiTn).not.toBe(7.56);
    expect(r.ratio).not.toBe(1);
    expect(r.ratio).toBeCloseTo(7.56 / r.phiTn, 9);
    expect(r.status).toBe('ok');
    // At φTn the section ratio of the shared §22.7 module is exactly 1.
    const at = checkTorsion2025({ b: 0.3, h: 0.6, d: 0.6 - 0.025 - 0.008 - 0.008, cover: 0.025, stirrupDiaMm: 8, fc: 25, fy: 420, fyt: 420, Vu: 40, Tu: r.phiTn });
    expect(at.sectionRatio).toBeCloseTo(1, 6);
  });

  it('a torque past the section limit fails with a ratio above 1', () => {
    const r = checkTorsion(P, 120, 40, '2025');
    expect(r.ratio).toBeGreaterThan(1);
    expect(r.status).toBe('fail');
  });
});
