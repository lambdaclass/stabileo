import { expect, it, vi } from 'vitest';
import { deriveDevelopment, topBarFactor } from '../../codes/cirsoc201/anchorage';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { checkTorsion2025, resolveCage, secondaryShearFace, type TorsionInput } from '../../codes/cirsoc201/torsion';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';
import { renderFicha } from '../../report/memoria/render';
import { concreteCheckRows } from '../design/check-rows';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { autoVerifyFromResults } from '../auto-verify';
import { checkTorsion, prepareElementVerification, sharedTorsionReinforcement, sizeTorsionReinforcement, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { lineFromMembers, membersFromLine } from '../design/beam-line';
import { mirrorReinforcement } from '../design/repeated-frames';
import type { DesignAxes } from '../design/design-axes';
import { computeShearCapacity, extractGoverningDemands, layerCentroid, layersTotalArea, prepareProvidedReinforcementRanker, rankProvidedReinforcement, verifyProvidedReinforcement } from '../station-design-forces';
import { extractForcesAtStation } from '../station-forces';
import type { AnalysisResults, SolverInput } from '../types';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import { computeStationDemands, runCirsocDesign, runUnifiedVerification } from '../verification-service';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import { declaredTestDemands } from './helpers/declared-demands';
import { torsionDemand } from './helpers/manual-interactions';

const section = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const cage = { diameter: 8, spacing: 0.1, legs: 4 };
const fixed = { shear: cage, torsion: { AlProv: 100 } };
const fixedLongitudinal = { column: { barCount: 8, barDia: 16 }, flexure: { AsProv: 8.044, barDia: 16, barCount: 4, bars: '4 Ø16', isDoublyReinforced: false } };
const phi = 0.75;
const legArea = (diameter: number) => Math.PI * (diameter / 2000) ** 2;
const depth = (h: number, diameter: number, longitudinalDiameter = 16) => h - section.cover - diameter / 1000 - longitudinalDiameter / 2000;
const steelStress = section.fy * 1000;
type Edition = '2005' | '2025';

function input(vy: number, torsion: number, edition: Edition, geometry = section, vz = 0): ConcurrentVerificationInput {
  const [demand] = declaredTestDemands([{ comboId: 1, comboName: 'C1',
    forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy, vz, torsion } }]);
  return { ...geometry, edition, elementId: 1, elementType: 'column', demand: demand!.section('My') };
}

function shearCapacity(edition: Edition, width: number, d: number, diameter: number, legs: number, spacing: number) {
  const root = Math.sqrt(section.fc);
  const vcStress = (edition === '2005' ? root / 6 : 0.17 * root) * 1000;
  return phi * d * (vcStress * width + legs * (diameter === 8 ? 0.503 : 0.785) * 1e-4 * steelStress / spacing);
}

for (const [edition, demand] of [['2005', 220.235], ['2025', 222.18]] as const) {
  it(`known wrong result: #2171 published column witness (${edition})`, () => {
    const v = input(demand, 30, edition);
    const capacity = shearCapacity(edition, section.h, depth(section.b, cage.diameter, 12), cage.diameter, 2, cage.spacing);
    for (const out of [verifyElement(v, fixed), prepareElementVerification(v)(fixed)]) {
      expect(out.column?.barDia).toBe(12);
      expect(out.shearSecondary).toMatchObject({ stirrupLegs: 2, status: 'fail' });
      expect(out.shearSecondary?.phiVn).toBeCloseTo(capacity, 10);
      expect(out.shearSecondary?.ratio).toBeCloseTo(demand / capacity, 12);
    }
  });

  it(`known wrong result: #2171 silent overall column pass (${edition})`, () => {
    const geometry = { ...section, b: 0.2, h: 0.4 };
    const capacity = shearCapacity(edition, geometry.h, depth(geometry.b, cage.diameter), cage.diameter, 2, cage.spacing);
    const out = verifyElement(input(capacity * 1.05, 0, edition, geometry), fixed);
    expect({
      overall: out.overallStatus, flexure: out.flexure.status, primary: out.shear.status, column: out.column?.status,
      secondary: out.shearSecondary?.status, ratio: out.shearSecondary?.ratio, torsion: out.torsion,
    }).toEqual({
      overall: 'fail', flexure: 'ok', primary: 'ok', column: 'ok', secondary: 'fail', ratio: expect.closeTo(1.05, 12),
      torsion: undefined,
    });
  });

  it(`known wrong result: #2171 fixed members retain the actual secondary cage and require torsion face evidence (${edition})`, () => {
    const shear = { ...cage, diameter: 10, spacing: 0.1 };
    const d = depth(section.b, shear.diameter);
    const torque = 20;
    const inset = 2 * section.cover + shear.diameter / 1000;
    const ao = 0.85 * (section.b - inset) * (section.h - inset);
    const at = torque / (phi * 2 * ao * steelStress);
    const vcStress = (edition === '2005' ? Math.sqrt(section.fc) / 6 : 0.17 * Math.sqrt(section.fc)) * 1000;
    const capacity = phi * d * (vcStress * section.h + (2 * legArea(shear.diameter) / shear.spacing - 2 * at) * steelStress);
    for (const elementType of ['beam', 'wall', 'column'] as const) for (const factor of [0.999, 1.001]) {
      const v = { ...input(capacity * factor, torque, edition), elementType };
      const reinforcement = { ...fixed, ...fixedLongitudinal, shear };
      const atProvided = at + (capacity - capacity * factor) / (phi * d * 2 * steelStress);
      for (const out of [verifyElement(v, reinforcement), prepareElementVerification(v)(reinforcement)]) {
        expect(out.shearSecondary?.d).toBeCloseTo(d, 12);
        if (elementType === 'column') {
          expect(out.torsion?.AtOverSProv).toBeCloseTo(atProvided * 1e4, 10);
          expect(out.torsion!.reinforcementRatio! > 1).toBe(factor > 1);
        }
        expect(out.torsion).toMatchObject({ status: 'fail', refusal: elementType === 'column'
          ? 'diag.rcTorsionPerimeter' : 'diag.rcTorsionSecondaryFace' });
      }
    }
  });
}

it('known wrong result: #2171 fixed cage uses the declared primary count', () => {
  const geometry = { ...section, b: 0.6, h: 0.3 };
  const shear = { ...cage, legs: 2, spacing: 0.075 };
  const out = verifyElement(input(0, 0, '2025', geometry, 40), { shear });
  expect(out.shear.stirrupLegs).toBe(2);
  expect(out.shear.phiVn).toBeCloseTo(shearCapacity('2025', geometry.b, depth(geometry.h, shear.diameter), shear.diameter, 2, shear.spacing), 10);
  expect(out.shear.status).toBe('fail');
});

it('span torsion sizing leaves primary and secondary shear report steps deferred', () => {
  const value = verifyElement(input(40, 30, '2025'));
  expect(value.torsion).toMatchObject({ neglect: false });
  expect(value.torsion?.refusal).toBeUndefined();
  expect(value.shearSecondary?.refusal).toBeUndefined();
  const primary = vi.spyOn(value.shear, 'steps', 'get');
  const secondary = vi.spyOn(value.shearSecondary!, 'steps', 'get');
  const shared = sharedTorsionReinforcement([value], '2025');
  expect(shared.requirements).toEqual({ AtOverS: value.torsion!.AtOverS, AlReq: value.torsion!.AlReq, index: 0 });
  expect(primary).not.toHaveBeenCalled();
  expect(secondary).not.toHaveBeenCalled();
});

const axes: DesignAxes = { flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy', bFlex: section.b,
  hFlex: section.h, biaxial: false, sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0 };
const longitudinal = { count: 4, diameter: 16 };
function provided(reinforcement: ProvidedReinforcement, member: 'column' | 'beam' | 'wall', vy: number, torque: number,
  options: { circular?: boolean; extracted?: boolean; vz?: number; edition?: Edition; geometry?: typeof section; compression?: number } = {}) {
  const stations = [0, 0.5, 1].map(t => ({ t, x: t * 4, n: -(options.compression ?? 0), my: 0, mz: 0, vy: t === 0.5 ? vy : 0, vz: t === 0.5 ? options.vz ?? 0 : 0,
    torsion: t === 0.5 ? torque : 0 }));
  const layout = { elementId: 1, length: 4, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
  return verifyProvidedReinforcement(1, member, reinforcement, options.extracted ? extractGoverningDemands(layout) : undefined,
    {}, options.geometry ?? section, options.extracted ? undefined : layout,
    undefined, { axes, ...(options.circular ? { shape: { kind: 'circle', D: 0.5 } as const } : {}),
      spacingRule: { edition: options.edition ?? '2005', maxAggregateSizeMm: 0 } });
}

it('known wrong result: #2171 every station uses the weakest member cage', () => {
  const regions = { bottomSpan: longitudinal, topStart: longitudinal, topEnd: longitudinal,
    stirrupsSpan: { ...cage, legs: 2, spacing: 0.075 }, stirrupsSupport: { ...cage, spacing: 0.15 } };
  const secondary = shearCapacity('2005', section.h, depth(section.b, cage.diameter), cage.diameter, 2, 0.15);
  for (const extracted of [false, true]) for (const factor of [0.999, 1.001]) {
    const out = provided({ regions }, 'beam', secondary * factor, 0, { extracted });
    expect(out.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ capacity: +secondary.toFixed(2), ratio: expect.closeTo(factor, 12),
      status: factor > 1 ? 'fail' : 'warn' });
  }
  const torsion = provided({ regions }, 'beam', 0, 40).checks.find(c => c.category === 'Torsion Span (Vz)');
  const inset = 2 * section.cover + cage.diameter / 1000;
  const at = 40 / (phi * 2 * 0.85 * (section.b - inset) * (section.h - inset) * steelStress);
  expect(torsion?.ratio).toBe(+(at / (legArea(cage.diameter) / 0.15)).toFixed(3));
  expect(torsion?.status).toBe('fail');
  const b = section.b, d = depth(section.h, cage.diameter), primary = 150;
  const av = (primary / phi - Math.sqrt(section.fc) / 6 * 1000 * b * d) / (steelStress * d);
  const combined = provided({ regions }, 'beam', 0, 20, { vz: primary }).checks.find(c => c.category === 'Torsion Span (Vz)');
  expect(combined?.ratio).toBe(+((av + at) / (2 * legArea(cage.diameter) / 0.15)).toFixed(3));
  const mixed = provided({ regions: { ...regions, stirrupsSupport: { ...regions.stirrupsSupport, diameter: 10 } } }, 'beam', secondary * 1.001, 0);
  expect(mixed.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ capacity: +secondary.toFixed(2), ratio: 1.001, status: 'fail' });
  const missing = provided({ stirrups: cage, regions: { ...regions, stirrupsSupport: undefined } }, 'beam', 20, 20);
  expect(missing.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ status: 'fail', missingReinforcement: true });
  expect(missing.checks.find(c => c.category === 'Torsion Span (Vz)')).toMatchObject({ status: 'fail', missingReinforcement: true });
});

it('known wrong result: #2171 provided column uses two legs and the actual diameter', () => {
  const stirrups = { ...cage, diameter: 10 };
  const secondary = shearCapacity('2005', section.h, depth(section.b, stirrups.diameter), stirrups.diameter, 2, stirrups.spacing);
  for (const factor of [0.999, 1.001]) {
    const out = provided({ stirrups, longitudinal }, 'column', secondary * factor, 0);
    expect(out.checks.find(c => c.category === 'Ties (Vy)')).toMatchObject({ ratio: expect.closeTo(factor, 12),
      status: factor > 1 ? 'fail' : 'warn' });
  }
});

it('known wrong result: #2171 unresolved secondary legs refuse active shear', () => {
  const stirrups = { ...cage, legs: 1 };
  const small = provided({ stirrups, longitudinal }, 'column', 0.000999, 0);
  expect(small.checks.find(c => c.demandCategory === 'Vy')).toBeUndefined();
  const active = provided({ stirrups, longitudinal }, 'column', 0.001, 0);
  expect(active.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ status: 'fail', limiting: 'unsupportedCheck',
    description: expect.stringMatching(/legs/i) });
});

it('known wrong result: #2171 nonrectangular sections refuse secondary shear', () => {
  const reinforcement = { longitudinal, shaped: longitudinal, stirrups: cage };
  expect(provided(reinforcement, 'column', 0, 0, { circular: true }).checks.find(c => c.demandCategory === 'Vy')).toBeUndefined();
  expect(provided(reinforcement, 'column', 20, 0, { circular: true }).checks.find(c => c.demandCategory === 'Vy')).toMatchObject({
    status: 'fail', limiting: 'unsupportedCheck', description: expect.stringMatching(/rectangular/i),
  });
});

for (const [name, declaration, reason] of [
  ['unknown legs', { secondaryLegs: null }, /legs/i],
  ['unknown shape', { shape: 'unknown' as const }, /closed rectangular/i],
  ['open cage', { closed: false }, /closed rectangular/i],
] as const) {
  it(`known wrong result: #2171 fixed and prepared verifiers refuse ${name}`, () => {
    const reinforcement = { ...fixed, shear: { ...cage, ...declaration } };
    const vu = input(0.001, 0, '2005');
    const small = input(0.000999, 0, '2005');
    for (const out of [verifyElement(vu, reinforcement), prepareElementVerification(vu)(reinforcement)]) {
      expect(out.shearSecondary).toMatchObject({ status: 'fail', ratio: Infinity, refusal: reason });
      expect(out.overallStatus).toBe('fail');
    }
    expect(verifyElement(small, reinforcement).shearSecondary).toBeUndefined();
    expect(verifyElement(input(0, 20, '2005'), reinforcement).torsion).toMatchObject({
      status: 'fail', reinforcementRatio: Infinity, refusal: reason,
    });
  });
}

it('known wrong result: #2171 a declared secondary crosstie supplies a third leg', () => {
  const shear = { ...cage, secondaryLegs: 3 };
  const expected = shearCapacity('2005', section.h, depth(section.b, cage.diameter), cage.diameter, 3, cage.spacing);
  const result = verifyElement(input(expected * 0.8, 0, '2005'), { ...fixed, ...fixedLongitudinal, shear });
  expect(result.shearSecondary).toMatchObject({ phiVn: expect.closeTo(expected, 10), stirrupLegs: 3, status: 'ok' });
});

const torsionInput = { ...section, d: depth(section.h, 8), fyt: section.fy, stirrupDiaMm: 8 };
const torsionThreshold = phi * 0.083 * Math.sqrt(section.fc) * 1000 * (section.b * section.h) ** 2 / (2 * (section.b + section.h));

it('known wrong result: #2171 torsion requires closure with zero secondary shear', () => {
  const unresolved = { ...cage, closed: null };
  const check = (tu: number, stirrup = unresolved as typeof cage & { closed?: boolean | null }) =>
    checkTorsion2025({ ...torsionInput, stirrup, demand: torsionDemand(tu, 0, 0) });
  expect(check(torsionThreshold * 0.999)).toMatchObject({ neglect: true, ratio: 0 });
  expect(check(torsionThreshold)).toMatchObject({ neglect: false, ratio: Infinity, refusal: expect.stringMatching(/closed/i) });
  expect(check(torsionThreshold, { ...cage, closed: true }).ratio).toBeLessThan(1);
});

it('known wrong result: #2171 combined transverse steel uses the secondary minimum', () => {
  const s = { ...section, b: 0.35, h: 0.8, fc: 40, fy: 350, stirrupDia: 6 };
  const stirrup = { diameter: 6, spacing: 0.15, legs: 4 };
  const face = secondaryShearFace(s, resolveCage(s, stirrup), { kind: 'column', diameters: [16], totalAreaCm2: 16.08 });
  const tu = 1.001 * phi * 0.083 * Math.sqrt(s.fc) * 1000 * (s.b * s.h) ** 2 / (2 * (s.b + s.h));
  const inset = 2 * s.cover + stirrup.diameter / 1000;
  const at = tu / (phi * 2 * 0.85 * (s.b - inset) * (s.h - inset) * s.fy * 1000);
  const required = Math.max(2 * at, Math.max(0.062 * Math.sqrt(s.fc), 0.35) * s.h / s.fy);
  const out = checkTorsion2025({ ...s, d: depth(s.h, stirrup.diameter), dSecondary: face, fyt: s.fy,
    stirrupDiaMm: stirrup.diameter, stirrup, demand: torsionDemand(tu, 0, 10) });
  expect(out.transverseRequired).toBeCloseTo(required, 12);
  expect(out.transverseProvided).toBeCloseTo(2 * legArea(stirrup.diameter) / stirrup.spacing, 12);
  expect(out.ratio).toBeCloseTo(required / out.transverseProvided, 12);
});

const model = {
  elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 0.04 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: section.b, h: section.h, a: section.b * section.h,
    iy: section.b * section.h ** 3 / 12, iz: section.h * section.b ** 3 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
};
function planarResultForDesign(raw: AnalysisResults): AnalysisResults3D {
  return { displacements: raw.displacements.map(d => ({ ...d, uy: 0, rx: 0, rz: 0 })),
    reactions: raw.reactions.map(r => ({ nodeId: r.nodeId, fx: r.rx, fz: r.rz, my: r.my, fy: 0, mx: 0, mz: 0 })),
    elementForces: raw.elementForces.map(e => ({ elementId: e.elementId, length: e.length, nStart: e.nStart, nEnd: e.nEnd,
      myStart: e.mStart, myEnd: e.mEnd, vzStart: e.vStart, vzEnd: e.vEnd,
      mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, mxStart: 0, mxEnd: 0,
      qYI: 0, qYJ: 0, qZI: e.qI, qZJ: e.qJ, distributedLoadsY: [], distributedLoadsZ: e.distributedLoads,
      pointLoadsY: [], pointLoadsZ: e.pointLoads, releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    })) } as AnalysisResults3D;
}

const combos = [{ id: 1, name: 'C1', factors: [] }];
for (const nonlinear of [false, true]) {
  it(`known wrong result: #2171 spatial WASM result adapters (nonlinear=${nonlinear})`, () => {
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 220.235, fz: 0, mx: 0, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const { demands } = computeStationDemands(new Map([[1, raw]]), combos, model);
    for (const out of [autoVerifyFromResults(raw, model, null, { edition: '2005' }, demands).concrete[0],
      runUnifiedVerification(raw, model, null, demands, { edition: '2005' })[0],
      runCirsocDesign(raw, model, demands, new Map(), null, { edition: '2005' }).concrete[0]]) {
      const shear = out?.shearSecondary;
      expect(shear?.stirrupLegs).toBe(2);
      expect(shear?.phiVn).toBeCloseTo(shearCapacity('2005', section.h, depth(section.b, 8, out!.column!.barDia), 8, 2, shear!.spacing), 10);
    }
  });

  it(`#2171 planar WASM retains primary shear (nonlinear=${nonlinear})`, () => {
    const solver: SolverInput = { ...model,
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.04, z: 0 }]]),
      sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
      elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 10, my: 20 } }],
    };
    const raw = planarResultForDesign(nonlinear ? solvePDelta(solver).results : solve(solver));
    const planar = { ...model, nodes: new Map([...solver.nodes].map(([id, n]) => [id, { ...n, y: 0 }])) };
    const { demands } = computeStationDemands(new Map([[1, raw]]), combos, planar);
    const opts = { edition: '2005' as const };
    for (const out of [autoVerifyFromResults(raw, planar, null, opts, demands).concrete[0],
      runUnifiedVerification(raw, planar, null, demands, opts)[0],
      runCirsocDesign(raw, planar, demands, new Map(), null, opts).concrete[0]]) {
      expect(out?.shear.Vu).toBeCloseTo(10, 10);
      expect(out?.shear.status).toBe('ok');
      expect(out?.shearSecondary).toBeUndefined();
      expect(out?.torsion).toBeUndefined();
    }
  });
}

for (const member of ['column', 'beam', 'wall'] as const) {
  it(`known wrong result: #2171 ${member} secondary cage follows 2025 leg spacing`, () => {
    const d = depth(section.b, cage.diameter);
    const width = section.h;
    const demand = 40;
    const across = width - 2 * section.cover - cage.diameter / 1000;
    const requiredLegs = 1 + Math.ceil(across / Math.min(d, 0.4));
    for (const [secondaryLegs, spacing, status] of [
      [requiredLegs, d / 2 * 0.999, 'ok'],
      [requiredLegs - 1, d / 2 * 0.999, member === 'column' ? 'ok' : 'fail'],
      [requiredLegs, d / 2 * 1.001, 'fail'],
    ] as const) {
      const stirrups = { ...cage, secondaryLegs, spacing };
      const expected = shearCapacity('2025', width, d, cage.diameter, secondaryLegs, spacing);
      for (const extracted of [false, true]) {
        const out = provided({ stirrups, longitudinal, bottom: longitudinal }, member, demand, 0, { edition: '2025', extracted });
        expect(out.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ capacity: +expected.toFixed(2), status });
      }
      const v = { ...input(demand, 0, '2025'), elementType: member };
      for (const out of [verifyElement(v, { ...fixedLongitudinal, shear: stirrups }), prepareElementVerification(v)({ ...fixedLongitudinal, shear: stirrups })]) {
        expect(out.shearSecondary).toMatchObject({ phiVn: expect.closeTo(expected, 10), status });
      }
    }
  });
}

for (const [edition, compression] of [['2005', 0], ['2005', -120], ['2025', -120]] as const) {
  it(`known wrong result: #2171 provided torsion reserves ${edition} concurrent shear steel at N=${compression}`, () => {
    const stirrups = { ...cage, diameter: 10, legs: 2 };
    const torque = 20;
    const d = depth(section.b, stirrups.diameter);
    const gross = section.b * section.h;
    const axialMPa = compression / (1000 * gross);
    const root = Math.sqrt(section.fc);
    const vc = edition === '2005'
      ? root / 6 * (1 + 0.3 * axialMPa) : 0.17 * root + axialMPa / 6;
    const inset = 2 * section.cover + stirrups.diameter / 1000;
    const at = torque / (phi * 2 * 0.85 * (section.b - inset) * (section.h - inset) * steelStress);
    const av = 2 * legArea(stirrups.diameter) / stirrups.spacing;
    const limit = phi * d * (vc * 1000 * section.h + (av - 2 * at) * steelStress);
    for (const member of ['beam', 'column', 'wall'] as const) for (const extracted of [false, true]) {
      for (const factor of [1.002, 0.998]) {
        const vu = factor * limit;
        const reserve = Math.max(0, vu / phi - vc * 1000 * section.h * d) / (steelStress * d);
        const out = provided({ stirrups, longitudinal, bottom: longitudinal }, member, vu, torque, { edition, compression, extracted });
        const torsion = out.checks.find(c => c.category === (member === 'column' ? 'Torsion ties' : 'Torsion Span (Vz)'));
        expect(torsion).toMatchObject(member === 'column'
          ? { ratio: +((reserve + 2 * at) / av).toFixed(3), status: factor > 1 ? 'fail' : 'warn' }
          : { ratio: Infinity, status: 'fail', description: 'diag.rcTorsionSecondaryFace' });
      }
    }
  });
}

for (const edition of ['2005', '2025'] as const) {
  it(`known wrong result: #2171 ${edition} primary combined minimum at zero secondary shear`, () => {
    const s = { ...section, b: 0.8, h: 0.25, fc: 40, fy: 350, stirrupDia: 6 };
    const root = Math.sqrt(s.fc);
    const tu = 1.01 * phi * 0.083 * root * 1000 * (s.b * s.h) ** 2 / (2 * (s.b + s.h));
    const minimum = (edition === '2005' ? Math.max(root / 16, 0.33) : Math.max(0.062 * root, 0.35)) * s.b / s.fy;
    const maxSpacing = 2 * legArea(s.stirrupDia) / minimum;
    for (const factor of [1.001, 0.999]) {
      const stirrups = { diameter: s.stirrupDia, legs: 2, spacing: maxSpacing * factor };
      const v = input(0, tu, edition, s);
      const reinforcement = { ...fixed, shear: stirrups };
      for (const out of [verifyElement(v, reinforcement), prepareElementVerification(v)(reinforcement)]) {
        expect(out.torsion).toMatchObject({ AtOverSProv: expect.closeTo(legArea(s.stirrupDia) / stirrups.spacing * 1e4, 10),
          reinforcementRatio: expect.closeTo(factor, 12), status: 'fail', refusal: 'diag.rcTorsionPerimeter' });
      }
      const check = provided({ longitudinal, stirrups }, 'column', 0, tu, { edition, geometry: s }).checks.find(c => c.category === 'Torsion ties');
      expect(check).toMatchObject({ ratio: +factor.toFixed(3), status: factor > 1 ? 'fail' : 'warn' });
    }
  });
}

it('known wrong result: #2171 primary torsion depth follows either change in cage diameter', () => {
  const torque = 20;
  const sectionLimit = phi * (0.17 + 0.66) * Math.sqrt(section.fc) * 1000;
  for (const [nominal, actual] of [[16, 6], [6, 16]] as const) {
    const geometry = { ...section, stirrupDia: nominal };
    const stirrups = { diameter: actual, legs: 10, spacing: 0.03 };
    const inset = 2 * section.cover + stirrups.diameter / 1000;
    const b0 = section.b - inset, h0 = section.h - inset;
    const vt = torque * 2 * (b0 + h0) / (1.7 * (b0 * h0) ** 2);
    const d = depth(section.h, stirrups.diameter);
    const limit = Math.sqrt(sectionLimit ** 2 - vt ** 2) * section.b * d;
    for (const member of ['beam', 'column', 'wall'] as const) for (const extracted of [false, true]) {
      for (const edition of ['2005', '2025'] as const) for (const factor of [0.98, 0.998, 1.002]) {
        const vz = limit * factor;
        const evaluatedLimit = edition === '2005' ? phi * (1 / 6 + 0.66) * Math.sqrt(section.fc) * 1000 : sectionLimit;
        const out = provided({ stirrups, longitudinal, bottom: longitudinal }, member, 0, torque, { vz, geometry, extracted, edition });
        const row = out.checks.find(c => c.category === (member === 'column' ? 'Torsion ties' : 'Torsion Span (Vz)'));
        if (edition === '2005' && factor === 0.998) {
          expect(row).toMatchObject({ ratio: Infinity, status: 'fail', description: 'diag.rcTorsionConcrete' });
        } else {
          expect(row).toMatchObject({ ratio: +(Math.hypot(vz / (section.b * d), vt) / evaluatedLimit).toFixed(3), status: factor > 1 ? 'fail' : 'warn' });
        }
      }
    }
  }
});

it('known wrong result: #2171 secondary column shear retains longitudinal steel below the transverse minimum', () => {
  const geometry = { ...section, b: 0.55, h: 0.6 };
  const d = depth(geometry.b, 6);
  const width = geometry.h;
  const root = Math.sqrt(section.fc);
  const sizeFactor = Math.min(1, Math.sqrt(2 / (1 + 0.004 * d * 1000)));
  for (const count of [4, 8]) for (const spacing of [0.25, 0.125]) {
    const rho = +(count * 2.011).toFixed(2) * 1e-4 / (3 * geometry.b * geometry.h);
    const vcMPa = spacing === 0.25 ? 0.66 * sizeFactor * Math.cbrt(rho) * root : 0.17 * root;
    const stirrups = { diameter: 6, spacing, legs: 2, secondaryLegs: 3 };
    const av = stirrups.secondaryLegs * 0.283 * 1e-4;
    const expected = phi * d * (vcMPa * 1000 * width + av / spacing * steelStress);
    const demand = 10;
    for (const extracted of [false, true]) {
      const out = provided({ stirrups, longitudinal: { ...longitudinal, count } }, 'column', demand, 0, { edition: '2025', extracted, geometry });
      expect(out.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({
        capacity: +expected.toFixed(2), ratio: +(demand / expected).toFixed(3), status: 'ok',
      });
    }
  }
});

for (const nonlinear of [false, true]) {
  it(`known wrong result: #2171 solved spatial torsion reserves secondary shear steel (nonlinear=${nonlinear})`, () => {
    const stirrups = { ...cage, diameter: 10 };
    const torque = 20;
    const d = depth(section.b, stirrups.diameter);
    const inset = 2 * section.cover + stirrups.diameter / 1000;
    const at = torque / (phi * 2 * 0.85 * (section.b - inset) * (section.h - inset) * steelStress);
    const av = 2 * legArea(stirrups.diameter) / stirrups.spacing;
    const vc = Math.sqrt(section.fc) / 6 * 1000 * section.h * d;
    const limit = phi * (vc + (av - 2 * at) * steelStress * d);
    const vu = limit * 1.002;
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: vu, fz: 0, mx: 0, my: 0, mz: torque } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const { demands, stations } = computeStationDemands(new Map([[1, raw]]), combos, model);
    for (const extracted of [false, true]) {
      const out = verifyProvidedReinforcement(1, 'column', { stirrups, longitudinal },
        extracted ? demands.get(1) : undefined, {}, section, extracted ? undefined : stations.get(1), undefined,
        { axes, spacingRule: { edition: '2005', maxAggregateSizeMm: 0 } });
      expect(out.checks.find(c => c.category === 'Torsion ties')).toMatchObject({
        demand: torque, ratio: +((2 * at + (vu / phi - vc) / (steelStress * d)) / av).toFixed(3), status: 'fail',
      });
    }
  });
}

it('known wrong result: #2171 fixed and prepared secondary concrete strength and torsion reserve use column steel', () => {
  const geometry = { ...section, b: 0.55, h: 0.6 };
  const d = depth(geometry.b, 6);
  const sizeFactor = Math.sqrt(2 / (1 + 0.004 * d * 1000));
  const demand = 100;
  const torque = 30;
  for (const count of [4, 8]) for (const spacing of [0.25, 0.125]) {
    const shear = { diameter: 6, spacing, legs: 4, secondaryLegs: 3 };
    const as = +(count * 2.011).toFixed(2);
    const rho = as * 1e-4 / (3 * geometry.b * geometry.h);
    const vcStress = (spacing === 0.25 ? 0.66 * sizeFactor * Math.cbrt(rho) : 0.17) * Math.sqrt(geometry.fc) * 1000;
    const vc = vcStress * geometry.h * d;
    const av = 3 * 0.283e-4 / spacing;
    const capacity = phi * (vc + av * steelStress * d);
    const reserve = Math.max(0, demand / phi - vc) / (steelStress * d);
    const outerLeg = legArea(shear.diameter) / spacing;
    const available = Math.max(0, Math.min(outerLeg, (3 * outerLeg - reserve) / 2));
    const v = input(demand, torque, '2025', geometry);
    const reinforcement = { ...fixed, shear, column: { barCount: count, barDia: 16 } };
    for (const out of [verifyElement(v, reinforcement), prepareElementVerification(v)(reinforcement)]) {
      expect(out.shearSecondary).toMatchObject({ phiVc: expect.closeTo(phi * vc, 10), phiVn: expect.closeTo(capacity, 10) });
      expect(out.torsion?.AtOverSProv).toBeCloseTo(available * 1e4, 10);
    }
  }
});

it('known wrong result: #2171 fixed and prepared secondary strength uses the provided Ø32 bars', () => {
  const reinforcement = { ...fixed, column: { barCount: 4, barDia: 32 } };
  const d = 0.251;
  const expected = shearCapacity('2005', section.h, d, cage.diameter, 2, cage.spacing);
  for (const factor of [0.999, 1.001]) {
    const v = input(expected * factor, 0, '2005');
    for (const out of [verifyElement(v, reinforcement), prepareElementVerification(v)(reinforcement)]) {
      expect(out.shearSecondary).toMatchObject({ d: expect.closeTo(d, 12), phiVn: expect.closeTo(expected, 10),
        ratio: expect.closeTo(factor, 12), status: factor < 1 ? 'warn' : 'fail' });
    }
  }
});

it('known wrong result: #2171 station secondary strength uses the provided Ø32 bars', () => {
  const d = 0.251;
  const expected = shearCapacity('2005', section.h, d, cage.diameter, 2, cage.spacing);
  for (const extracted of [false, true]) for (const factor of [0.999, 1.001]) {
    const reinforcement = { stirrups: cage, column: { cornerDia: 32, faceDia: 16, nBottom: 0, nTop: 0, nLeft: 0, nRight: 0 } };
    const out = provided(reinforcement, 'column', expected * factor, 0, { extracted });
    expect(out.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ capacity: +expected.toFixed(2),
      ratio: expect.closeTo(factor, 12), status: factor < 1 ? 'warn' : 'fail' });
  }
});

it('known wrong result: #2171 secondary shear stress under torque uses the provided Ø32 bars', () => {
  const stirrups = { ...cage, spacing: 0.03, secondaryLegs: 6 };
  const torque = 35;
  const b0 = section.b - 2 * section.cover - cage.diameter / 1000;
  const h0 = section.h - 2 * section.cover - cage.diameter / 1000;
  const vt = torque * 2 * (b0 + h0) / (1.7 * (b0 * h0) ** 2);
  const sectionLimit = phi * (0.17 + 0.66) * Math.sqrt(section.fc) * 1000;
  const d = 0.251;
  const shearLimit = section.h * d * Math.sqrt(sectionLimit ** 2 - vt ** 2);
  for (const edition of ['2005', '2025'] as const) for (const factor of [0.98, 0.998, 1.002]) {
    const evaluatedLimit = edition === '2005' ? phi * (1 / 6 + 0.66) * Math.sqrt(section.fc) * 1000 : sectionLimit;
    const vy = shearLimit * factor;
    const vv = vy / (section.h * d);
    const check = input(vy, torque, edition);
    const reinforcement = { ...fixed, shear: stirrups, column: { barCount: 4, barDia: 32 } };
    const phiTn = torque * Math.sqrt(evaluatedLimit ** 2 - vv ** 2) / vt;
    for (const out of [verifyElement(check, reinforcement), prepareElementVerification(check)(reinforcement)]) {
      if (edition === '2005' && factor === 0.998) {
        expect(out.torsion).toMatchObject({ phiTn: 0, status: 'fail', refusal: 'diag.rcTorsionConcrete' });
      } else {
        expect(out.torsion?.phiTn).toBeCloseTo(phiTn, 10);
        expect(out.torsion).toMatchObject({ status: 'fail', refusal: 'diag.rcTorsionPerimeter' });
      }
    }
    for (const extracted of [false, true]) {
      const out = provided({ stirrups, longitudinal: { count: 4, diameter: 32 } }, 'column', vy, torque, { extracted, edition });
      const row = out.checks.find(c => c.category === 'Torsion ties');
      if (edition === '2005' && factor === 0.998) {
        expect(row).toMatchObject({ ratio: Infinity, status: 'fail', description: 'diag.rcTorsionConcrete' });
      } else {
        expect(row).toMatchObject({ ratio: +(Math.hypot(vv, vt) / evaluatedLimit).toFixed(3), status: factor < 1 ? 'warn' : 'fail' });
      }
    }
  }
});

it('known wrong result: #2171 active secondary shear and torsion refuse unknown longitudinal bars', () => {
  for (const extracted of [false, true]) {
    const noBars = provided({ stirrups: cage }, 'column', 20, 20, { extracted });
    const inactive = provided({ stirrups: cage }, 'column', 0, 0, { extracted });
    expect(noBars.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ status: 'fail', limiting: 'unsupportedCheck',
      description: expect.stringMatching(/longitudinal/i) });
    expect(noBars.checks.find(c => c.category === 'Torsion ties')).toMatchObject({ status: 'fail', limiting: 'unsupportedCheck',
      description: expect.stringMatching(/longitudinal/i) });
    expect(inactive.checks.find(c => c.demandCategory === 'Vy')).toBeUndefined();
    expect(inactive.checks.find(c => c.category === 'Torsion ties')).toBeUndefined();
    const known = provided({ stirrups: cage, longitudinal }, 'column', 20, 0, { extracted });
    const capacity = shearCapacity('2005', section.h, 0.259, cage.diameter, 2, cage.spacing);
    expect(known.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ status: 'ok', capacity: +capacity.toFixed(2) });
  }
});

for (const demand of [0.000999, 0.001, 0.005]) {
  it(`known wrong result: #2171 fixed and prepared use the station secondary demand boundary at ${demand} kN`, () => {
    const shear = { ...cage, secondaryLegs: null };
    const v = input(demand, 0, '2005');
    for (const out of [verifyElement(v, { shear }), prepareElementVerification(v)({ shear })]) {
      if (demand < 0.001) expect(out.shearSecondary).toBeUndefined();
      else expect(out.shearSecondary).toMatchObject({ Vu: demand, status: 'fail', ratio: Infinity, refusal: expect.stringMatching(/legs/i) });
    }
    for (const extracted of [false, true]) {
      const out = provided({ stirrups: shear, longitudinal }, 'column', demand, 0, { extracted });
      const secondary = out.checks.find(c => c.demandCategory === 'Vy');
      if (demand < 0.001) expect(secondary).toBeUndefined();
      else expect(secondary).toMatchObject({ status: 'fail', limiting: 'unsupportedCheck', description: expect.stringMatching(/legs/i) });
    }
  });
}

for (const nonlinear of [false, true]) {
  it(`known wrong result: #2171 automatic spatial verification retains 0.005 kN secondary shear (nonlinear=${nonlinear})`, () => {
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0.005, fz: 0, mx: 0, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const { demands } = computeStationDemands(new Map([[1, raw]]), combos, model);
    const opts = { edition: '2005' as const };
    for (const geometry of [model, { ...model, sections: new Map([[1, { ...model.sections.get(1)!, shape: 'circle' as const }]]) }]) {
      for (const out of [autoVerifyFromResults(raw, geometry, null, opts, demands).concrete[0],
        runUnifiedVerification(raw, geometry, null, demands, opts)[0],
        runCirsocDesign(raw, geometry, demands, new Map(), null, opts).concrete[0]]) {
        const shear = out?.shearSecondary;
        expect(shear?.Vu).toBeCloseTo(0.005, 12);
        if (geometry === model) {
          const d = section.b - section.cover - (shear!.stirrupDia / 1000) - out!.column!.barDia / 2000;
          expect(shear?.phiVn).toBeCloseTo(shearCapacity('2005', section.h, d, shear!.stirrupDia, 2, shear!.spacing), 10);
          expect(Number.isFinite(shear?.ratio)).toBe(true);
        } else {
          expect(shear).toMatchObject({ status: 'fail', ratio: Infinity, refusal: expect.stringMatching(/rectangular/i) });
        }
      }
    }
  });
}

it('known wrong result: #2171 primary torsion reserve switches concrete strength at the actual cage minimum', () => {
  const geometry = { ...section, b: 0.45, h: 0.32, stirrupDia: 6 };
  const d = depth(geometry.h, geometry.stirrupDia);
  const rho = fixedLongitudinal.flexure.AsProv * 1e-4 / (geometry.b * d);
  const minimumSpacing = 2 * 0.283e-4 * steelStress / (0.35 * 1000 * geometry.b);
  const torque = 8;
  const inset = 2 * geometry.cover + geometry.stirrupDia / 1000;
  const ao = 0.85 * (geometry.b - inset) * (geometry.h - inset);
  const at = torque / (2 * phi * ao * steelStress);
  for (const belowMinimum of [true, false]) {
    const shear = { diameter: geometry.stirrupDia, legs: 2, spacing: minimumSpacing * (belowMinimum ? 1.001 : 0.999) };
    const vcCoefficient = belowMinimum ? 0.66 * Math.min(1, Math.sqrt(2 / (1 + 4 * d))) * Math.cbrt(rho) : 0.17;
    const vc = vcCoefficient * Math.sqrt(geometry.fc) * 1000 * geometry.b * d;
    const outer = legArea(shear.diameter) / shear.spacing;
    const vuLimit = phi * (vc + 2 * (outer - at) * steelStress * d);
    for (const factor of [1.001, 0.999]) {
      const vu = factor * vuLimit;
      const available = outer - Math.max(0, vu / phi - vc) / (2 * steelStress * d);
      const v = { ...input(0, torque, '2025', geometry, vu), elementType: 'beam' as const };
      const reinforcement = { ...fixed, ...fixedLongitudinal, shear };
      for (const out of [verifyElement(v, reinforcement), prepareElementVerification(v)(reinforcement)]) {
        expect.soft(out.shear.phiVc).toBeCloseTo(phi * vc, 10);
        expect.soft(out.torsion?.AtOverSProv).toBeCloseTo(available * 1e4, 10);
        expect.soft(out.torsion).toMatchObject({ status: 'fail', refusal: 'diag.rcTorsionPerimeter' });
        expect.soft(out.torsion!.reinforcementRatio! > 1).toBe(belowMinimum || factor > 1);
      }
      for (const extracted of [false, true]) {
        const out = provided({ stirrups: shear, bottom: longitudinal }, 'beam', 0, torque, { edition: '2025', geometry, extracted, vz: vu });
        expect.soft(out.checks.find(c => c.category === 'Torsion Span (Vz)')?.status).toBe(belowMinimum || factor > 1 ? 'fail' : 'warn');
      }
    }
  }
});

it('known wrong result: #2171 section torsion refuses secondary shear without resolved lateral depth', () => {
  const declaration = { ...cage, spacing: 0.03, secondaryLegs: 6 };
  const face = secondaryShearFace(section, resolveCage(section, declaration), { kind: 'column', diameters: [32], totalAreaCm2: 32.17 });
  const d = depth(section.b, cage.diameter, 32);
  const x = section.b - 2 * section.cover - cage.diameter / 1000;
  const y = section.h - 2 * section.cover - cage.diameter / 1000;
  const torsionStress = 2 * (x + y) / (1.7 * (x * y) ** 2);
  const limit = phi * (0.17 + 0.66) * Math.sqrt(section.fc) * 1000;
  const torque = 35;
  const vLimit = section.h * d * Math.sqrt(limit ** 2 - (torsionStress * torque) ** 2);
  for (const edition of ['2005', '2025'] as const) for (const factor of [0.999, 1.001]) {
    const coefficient = edition === '2005' ? 1 / 12 : 0.083;
    const threshold = phi * coefficient * Math.sqrt(section.fc) * 1000 * (section.b * section.h) ** 2 / (2 * (section.b + section.h));
    const vy = factor * vLimit;
    const { demand } = input(vy, torque, edition);
    expect.soft(checkTorsion(section, demand, edition)).toMatchObject({ phiTn: 0, status: 'fail', ratio: Infinity,
      refusal: expect.stringMatching(/secondary.*face/i) });
    expect.soft(checkTorsion(section, input(vy, 0.999 * threshold, edition).demand, edition).neglect).toBe(true);
    expect.soft(checkTorsion(section, demand, edition, face)).toMatchObject({
      phiTn: expect.closeTo(Math.sqrt(limit ** 2 - (vy / (section.h * d)) ** 2) / torsionStress, 10),
      status: factor > 1 ? 'fail' : 'ok',
    });
    expect.soft(checkTorsion(section, input(0, torque, edition).demand, edition)).toMatchObject({
      status: 'ok', phiTn: expect.closeTo(limit / torsionStress, 10),
    });
  }
});

it('known wrong result: #2171 a refused secondary face governs regardless of cage order', () => {
  const geometry = { ...section, b: 0.033, h: 0.3, cover: 0.01 };
  const bars = { count: 2, diameter: 32 };
  const narrow = { ...cage, diameter: 6 };
  const wide = { ...cage, diameter: 8 };
  const demand = 0.005;
  const d = geometry.b - geometry.cover - narrow.diameter / 1000 - bars.diameter / 2000;
  const capacity = phi * d * (Math.sqrt(geometry.fc) / 6 * 1000 * geometry.h + 2 * 0.283e-4 * steelStress / narrow.spacing);
  for (const extracted of [false, true]) {
    const secondary = (stirrupsSupport: typeof cage, stirrupsSpan: typeof cage, vy: number) =>
      provided({ regions: { bottomSpan: bars, stirrupsSupport, stirrupsSpan } }, 'beam', vy, 0, { geometry, extracted })
        .checks.find(c => c.demandCategory === 'Vy');
    expect.soft(secondary(narrow, wide, 0.000999)).toBeUndefined();
    expect.soft(secondary(narrow, narrow, demand)).toMatchObject({ capacity: +capacity.toFixed(2), status: 'ok' });
    for (const [first, second] of [[narrow, wide], [wide, narrow]] as const) {
      expect.soft(secondary(first, second, demand)).toMatchObject({ ratio: Infinity, status: 'fail', capacity: 0,
        limiting: 'unsupportedCheck', description: 'Invalid secondary effective depth' });
    }
  }
});

it('known wrong result: #2171 nonzero torsion below 0.01 kN·m is checked at the code threshold', () => {
  for (const side of [0.022, 0.045]) {
    const geometry = { ...section, b: side, h: side, cover: 0.1 * side, stirrupDia: 6 };
    const stirrups = { diameter: geometry.stirrupDia, legs: 2, spacing: side / 10 };
    const threshold = phi * 0.083 * Math.sqrt(geometry.fc) * 1000 * side ** 4 / (4 * side);
    const diameter = 10;
    const bars = { count: 4, diameter };
    const aohSide = side - 2 * geometry.cover - stirrups.diameter / 1000;
    for (const factor of [0, 0.999, 1.001]) {
      const torque = threshold * factor;
      expect(torque).toBeLessThan(0.01);
      for (const extracted of [false, true]) for (const member of ['beam', 'column'] as const) {
        const out = provided({ stirrups, longitudinal: bars, bottom: bars, top: bars }, member, 0, torque, { geometry, extracted, edition: '2025' });
        const row = out.checks.find(c => c.category === (member === 'column' ? 'Torsion ties' : 'Torsion Span (Vz)'));
        if (factor < 1) expect.soft(row).toBeUndefined();
        else {
          const sectionRatio = torque * 4 * aohSide / (1.7 * aohSide ** 4 * phi * (0.17 + 0.66) * Math.sqrt(geometry.fc) * 1000);
          const outerRatio = torque / (phi * 2 * 0.85 * aohSide ** 2 * steelStress) / (legArea(stirrups.diameter) / stirrups.spacing);
          const sRatio = stirrups.spacing / (aohSide / 2);
          expect.soft(row).toMatchObject({ demand: +torque.toPrecision(12), status: 'ok', ratio: +Math.max(sectionRatio, outerRatio, sRatio).toFixed(3) });
        }
      }
    }
  }
});

it('known wrong result: #2171 wall torsion requires evidence of longitudinal steel around its perimeter', () => {
  const stirrups = { ...cage, spacing: 0.06 };
  const threshold = torsionThreshold;
  const clearDepthBetweenBars = section.h - 2 * (section.cover + stirrups.diameter / 1000 + longitudinal.diameter / 2000);
  expect(clearDepthBetweenBars).toBeGreaterThan(0.3);
  const steel = { stirrups, bottom: longitudinal, top: longitudinal };
  for (const extracted of [false, true]) {
    const get = (member: 'beam' | 'wall', torque: number) =>
      provided(steel, member, 0, torque, { extracted, edition: '2025' }).checks.filter(c => c.limiting === 'torsion' || c.limiting === 'unsupportedCheck');
    expect.soft(get('wall', threshold * 0.999)).toEqual([]);
    expect.soft(get('wall', threshold * 1.001)).toContainEqual(expect.objectContaining({
      ratio: Infinity, status: 'fail', limiting: 'unsupportedCheck', description: expect.stringMatching(/perimeter/i),
    }));
    expect.soft(get('beam', threshold * 1.001)).toContainEqual(expect.objectContaining({ status: 'ok', limiting: 'torsion' }));
  }
});

it('known wrong result: #2171 continuous corner bars can carry secondary beam shear without crediting the ties', () => {
  const geometry = { ...section, b: 0.2, h: 0.5, fc: 30, stirrupDia: 6 };
  const stirrups = { diameter: 6, legs: 2, spacing: 0.1 };
  const bars = { diameter: 16, count: 3 };
  const d = 2 * geometry.b / 3;
  const rho = 2.011e-4 / (geometry.h * d);
  const concreteStress = 0.66 * Math.cbrt(rho) * Math.sqrt(geometry.fc) * 1000;
  const minimumThreshold = phi * 0.085 * Math.sqrt(geometry.fc) * 1000 * geometry.h * d;
  for (const extracted of [false, true]) for (const compression of [0, -40]) {
    const phiVc = phi * (concreteStress + compression / (6 * geometry.b * geometry.h)) * geometry.h * d;
    const limit = Math.min(phiVc, minimumThreshold);
    const check = (vy: number, topEnd = bars) => provided(
      { stirrups, regions: { topStart: bars, topEnd, bottomSpan: bars } }, 'beam', vy, 0, { geometry, extracted, compression, edition: '2025' },
    ).checks.find(c => c.demandCategory === 'Vy');
    const utilization = 0.999 * limit / phiVc;
    expect.soft(check(limit * 0.999)).toMatchObject({ status: utilization > 0.9 ? 'warn' : 'ok', capacity: +phiVc.toFixed(2) });
    expect.soft(check(limit * 1.001)).toMatchObject({ status: 'fail' });
    expect.soft(check(0.38, { ...bars, count: 1 })).toMatchObject({ status: 'fail' });
  }
});

for (const nonlinear of [false, true]) {
  it(`#2171 solved spatial torsion below 0.01 kN·m or without wall side bars (nonlinear=${nonlinear})`, () => {
    for (const member of ['beam', 'wall'] as const) {
      const side = 0.045;
      const geometry = member === 'wall' ? section : { ...section, b: side, h: side, cover: 0.1 * side, stirrupDia: 6 };
      const { b, h, fc } = geometry;
      const inertia = member === 'wall' ? model.sections.get(1)! : { a: side ** 2, iy: side ** 4 / 12, iz: side ** 4 / 12, j: 0.1406 * side ** 4 };
      const torque = 1.001 * phi * 0.083 * Math.sqrt(fc) * 1000 * (b * h) ** 2 / (2 * (b + h));
      const verificationModel = { ...model, sections: new Map([[1, { ...inertia, id: 1, name: 'RC', b, h }]]) };
      const solver: SolverInput3D = { ...verificationModel,
        elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: torque } }],
      };
      const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
      const { demands, stations } = computeStationDemands(new Map([[1, raw]]), combos, verificationModel);
      const stirrups = member === 'wall' ? { ...cage, spacing: 0.06 } : { diameter: 6, legs: 2, spacing: side / 10 };
      for (const extracted of [false, true]) {
        const out = verifyProvidedReinforcement(1, member, { stirrups, bottom: longitudinal, top: longitudinal },
          extracted ? demands.get(1) : undefined, {}, geometry, extracted ? undefined : stations.get(1), undefined,
          { axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 0 } });
        expect(out.checkedAxes).toContain('T');
        expect(out.checks.find(c => c.category === 'Torsion Span (Vz)')).toMatchObject({ demand: +torque.toPrecision(12), status: 'ok' });
        if (member === 'wall') expect(out.checks.find(c => c.category === 'Torsion Al Span (Vz)')).toMatchObject({ status: 'fail', ratio: Infinity });
      }
    }
  });
}

for (const nonlinear of [false, true]) {
  it(`#2171 solved spatial torsion uses the concurrent axial force (nonlinear=${nonlinear})`, () => {
    for (const compression of [-90, 90]) for (const factor of [0.999, 1.001]) {
      const torque = torsionThreshold * Math.sqrt(1 + compression / (0.33 * section.b * section.h * Math.sqrt(section.fc) * 1000)) * factor;
      const solver: SolverInput3D = { ...model,
        elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -compression, mx: 0, my: 0, mz: torque } }],
      };
      const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
      const { demands, stations } = computeStationDemands(new Map([[1, raw]]), combos, model);
      const opts = { edition: '2025' as const };
      for (const out of [autoVerifyFromResults(raw, model, null, opts, demands).concrete[0],
        runUnifiedVerification(raw, model, null, demands, opts)[0],
        runCirsocDesign(raw, model, demands, new Map(), null, opts).concrete[0]]) {
        expect.soft(out?.torsion?.Tu).toBeCloseTo(torque, 10);
        expect.soft(out?.torsion?.neglect).toBe(factor < 1);
      }
      for (const extracted of [false, true]) {
        const out = verifyProvidedReinforcement(1, 'column', { stirrups: cage, longitudinal },
          extracted ? demands.get(1) : undefined, {}, section, extracted ? undefined : stations.get(1), undefined,
          { axes, spacingRule: { edition: opts.edition, maxAggregateSizeMm: 0 } });
        const row = out.checks.find(check => check.category === 'Torsion ties');
        if (factor < 1) expect.soft(row).toBeUndefined();
        else expect.soft(row?.demand).toBe(+torque.toPrecision(12));
      }
    }
  });
}

for (const nonlinear of [false, true]) for (const spatial of [false, true]) {
  for (const axis of spatial ? ['primary', 'secondary'] as const : ['primary'] as const) {
    it(`#2296 solved beam checks drawn gaps and sparse zones (spatial=${spatial}, nonlinear=${nonlinear}, axis=${axis})`, () => {
      const primary = axis === 'primary';
      const L = 4;
      const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]);
      const solverModel = { ...model, nodes };
      let raw: AnalysisResults3D;
      if (spatial) {
        const solver: SolverInput3D = { ...solverModel,
          elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
            releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
          supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
          loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: primary ? 0 : 10, fz: primary ? 10 : 0, mx: primary ? 20 : 0, my: 0, mz: 0 } }],
        };
        raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
      } else {
        const solver: SolverInput = { ...solverModel,
          nodes: new Map([...nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
          sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
          elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]),
          loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 10, my: 0 } }],
        };
        raw = planarResultForDesign(nonlinear ? solvePDelta(solver).results : solve(solver));
      }
      const { demands, stations } = computeStationDemands(new Map([[1, raw]]), combos, solverModel);
      const [left, right] = stations.get(1)!.stationTs.filter(t => t > 0.3).slice(0, 2).map(t => t * L);
      const gapStart = (2 * left! + right!) / 3, gapEnd = (left! + 2 * right!) / 3;
      const sparse = { diameter: 10, legs: 2, spacing: 0.25 };
      const check = (from: number, extracted: boolean, interior = false, middle?: typeof sparse) => {
        const reinforcement = membersFromLine({
          version: 1, members: [1], lengths: [L],
          bars: [{ ...longitudinal, id: 'top', face: 'top', row: 0, role: 'main', from: 0, to: L },
            { ...longitudinal, id: 'bottom', face: 'bottom', row: 0, role: 'main', from: 0, to: L }],
          stirrups: interior ? [
            { ...cage, id: 'left', from: 0, to: gapStart },
            ...(middle ? [{ ...middle, id: 'middle', from: gapStart, to: gapEnd }] : []),
            { ...cage, id: 'right', from: gapEnd, to: L },
          ] : [{ ...cage, id: 'cage', from, to: L }],
        }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
        return verifyProvidedReinforcement(1, 'beam', reinforcement, extracted ? demands.get(1) : undefined,
          {}, section, extracted ? undefined : stations.get(1), undefined, { axes, spacingRule: { edition: middle && !primary ? '2005' : '2025', maxAggregateSizeMm: 20 } }).checks;
      };
      for (const extracted of [false, true]) {
        const gap = check(0.4, extracted);
        const filled = check(0, extracted);
        const category = primary ? 'Shear Support (Vz)' : 'Secondary shear (Vy)';
        expect.soft(gap.find(row => row.category === category)).toMatchObject({
          status: 'fail', ratio: Infinity, missingReinforcement: true, stationX: 0,
        });
        expect(filled.find(row => row.category === category)).toMatchObject({ status: 'ok' });
        const interior = check(0, extracted, true);
        expect(interior).toContainEqual(expect.objectContaining({
          demandCategory: primary ? 'Vz' : 'Vy', status: 'fail', description: 'diag.rcShearGap',
        }));
        const sparseRows = check(0, extracted, true, sparse);
        const width = primary ? section.b : section.h;
        const height = primary ? section.h : section.b;
        const sparseCapacity = shearCapacity(primary ? '2025' : '2005', width, depth(height, sparse.diameter),
          sparse.diameter, sparse.legs, sparse.spacing);
        expect.soft(sparseRows.find(row => row.category === (primary ? 'Shear Span (Vz)' : category))).toMatchObject({
          status: 'ok', capacity: +sparseCapacity.toFixed(2),
        });
        if (spatial && primary) {
          expect.soft(sparseRows.find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({ status: 'fail' });
          expect.soft(gap.find(row => row.category === 'Torsion Support (Vz)')).toMatchObject({
            status: 'fail', ratio: Infinity, missingReinforcement: true,
          });
          expect(filled.find(row => row.category === 'Torsion Support (Vz)')?.ratio).toBeLessThan(1);
          expect(interior.find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({
            description: 'diag.rcShearGap', status: 'fail', missingReinforcement: true,
          });
        }
      }
    });
  }
}

it('#2225 active torsion requires the transverse minimum on the wider face', () => {
  const stirrup = { diameter: 6, legs: 2, spacing: 0.15 };
  const minimum = (width: number) => Math.max(0.062 * Math.sqrt(section.fc), 0.35) * width / section.fy;
  const supplied = stirrup.legs * legArea(stirrup.diameter) / stirrup.spacing;
  const check = (spacing: number) => checkTorsion2025({
    ...section, d: 0.561, stirrupDiaMm: 6, fyt: section.fy,
    stirrup: { ...stirrup, spacing }, demand: torsionDemand(6, 0, 0),
  });
  const result = check(stirrup.spacing);
  expect(result.neglect).toBe(false);
  expect(result.refusal).toBeUndefined();
  expect(supplied).toBeGreaterThan(minimum(section.b));
  expect(supplied).toBeLessThan(minimum(section.h));
  expect(check(0.1).ratio).toBeLessThan(1);
  expect.soft(result.transverseRequired, 'The 600 mm face requires 5.00 cm²/m').toBeCloseTo(minimum(section.h), 12);
  expect.soft(result.ratio, 'The 150 mm cage supplies 3.77 cm²/m').toBeGreaterThan(1);
});

it('#2225 the directional minimum governs provided torsion at the activation boundary', () => {
  const stirrups = { diameter: 6, legs: 2, spacing: 0.15 };
  const geometry = { ...section, stirrupDia: stirrups.diameter };
  const minimum = Math.max(0.062 * Math.sqrt(section.fc), 0.35) * section.h / section.fy;
  const area = stirrups.legs * legArea(stirrups.diameter);
  for (const s of [geometry, { ...geometry, b: geometry.h, h: geometry.b }]) {
    const check = (torque: number, spacing: number) => checkTorsion2025({
      ...s, d: depth(s.h, 6), stirrupDiaMm: 6, fyt: s.fy,
      stirrup: { ...stirrups, spacing }, demand: torsionDemand(torque, 0, 0),
    });
    expect.soft(check(torsionThreshold * 0.999, stirrups.spacing)).toMatchObject({ neglect: true, ratio: 0 });
    expect.soft(check(torsionThreshold, stirrups.spacing)).toMatchObject({
      neglect: false, transverseRequired: expect.closeTo(minimum, 12), ratio: expect.closeTo(minimum * stirrups.spacing / area, 12),
    });
    expect.soft(check(torsionThreshold, 0.1).ratio).toBeLessThan(1);
    for (const verify of [verifyElement, (v: ConcurrentVerificationInput, shear: { shear: typeof stirrups }) =>
      prepareElementVerification(v)(shear)]) {
      const v = input(0, torsionThreshold, '2025', s);
      expect.soft(verify(v, { shear: stirrups }).torsion?.reinforcementRatio).toBeCloseTo(minimum * stirrups.spacing / area, 12);
      expect.soft(verify(v, { shear: { ...stirrups, spacing: 0.1 } }).torsion?.reinforcementRatio).toBeLessThan(1);
    }
  }
  for (const extracted of [false, true]) {
    const checks = (spacing: number) => verifyBeamStations(geometry, { top: longitudinal, bottom: longitudinal,
      stirrups: { ...stirrups, spacing } }, 6, [{ name: 'C1', forces: { n: 0, my: 0, vz: 0, torsion: 6 } }], extracted).checks;
    expect.soft(checks(stirrups.spacing).find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({ status: 'fail' });
    expect.soft(checks(0.1).find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({ status: 'ok' });
  }
});

it('#2310 fixed torsion refuses a section limit that overcredits concrete', () => {
  const shear = { diameter: 12, legs: 4, spacing: 0.045 };
  const geometry = { ...section, stirrupDia: shear.diameter };
  const torsion = 47.5;
  const vz = 250;
  const tension = 180;
  const [entry] = declaredTestDemands([{ comboId: 1, comboName: 'C1',
    forces: { t: 0.5, x: 2, n: tension, my: 0, mz: 0, vy: 0, vz, torsion } }]);
  const fixedBars = { AsProv: 8.044, barDia: 16, barCount: 4, bars: 'provided', isDoublyReinforced: false };
  const result = verifyElement({
    ...geometry, elementId: 1, elementType: 'beam', edition: '2025', demand: entry!.section('My'),
  }, { shear, flexure: fixedBars, torsion: { AlProv: 100 } });
  const d = depth(section.h, shear.diameter, fixedBars.barDia);
  const inset = 2 * section.cover + shear.diameter / 1000;
  const aoh = (section.b - inset) * (section.h - inset);
  const perimeter = 2 * (section.b + section.h - 2 * inset);
  const root = Math.sqrt(section.fc);
  const table22551ConcreteStress = 0.17 * root * 1000 - tension / (6 * section.b * section.h);
  const section22771StressLimit = phi * (table22551ConcreteStress + 0.66 * root * 1000);
  const shearStress = vz / (section.b * d);
  const torqueCapacity = Math.sqrt(section22771StressLimit ** 2 - shearStress ** 2) * 1.7 * aoh ** 2 / perimeter;
  expect(torsion).toBeGreaterThan(torqueCapacity);
  expect(result.torsion).toMatchObject({ status: 'fail', ratio: Infinity, refusal: 'diag.rcTorsionConcrete' });
  expect(result.overallStatus).toBe('fail');
  for (const extracted of [false, true]) {
    const station = provided({ stirrups: shear, top: longitudinal, bottom: longitudinal }, 'beam', 0, torsion,
      { extracted, geometry, vz, compression: -tension, edition: '2025' });
    expect(station.checks.find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({
      status: 'fail', limiting: 'unsupportedCheck',
    });
  }
});

it('#2310 fixed torsion refuses unverified primary depth', () => {
  const shear = { diameter: 12, legs: 4, spacing: 0.045 };
  const fixedBars = { AsProv: 16.084, barDia: 32, barCount: 2, bars: 'provided', isDoublyReinforced: false };
  const witness = input(0, 41, '2025', { ...section, stirrupDia: 12 }, 350);
  for (const verify of [() => verifyElement({ ...witness, elementType: 'beam' }, { shear, flexure: fixedBars }),
    () => prepareElementVerification({ ...witness, elementType: 'beam' })({ shear, flexure: fixedBars })]) {
    expect(verify().torsion).toMatchObject({ status: 'fail', ratio: Infinity, refusal: 'diag.rcTorsionDepth' });
  }
  for (const extracted of [false, true]) {
    const column = provided({ stirrups: shear, longitudinal: { count: 8, diameter: 32 } }, 'column', 0, 41,
      { extracted, geometry: { ...section, stirrupDia: 12 }, vz: 350, edition: '2025' });
    expect(column.checks.find(row => row.category === 'Torsion ties')).toMatchObject({
      status: 'fail', limiting: 'unsupportedCheck', ratio: Infinity,
    });
  }
});

it('#2310 beams without verified side bars and a fixed wall with scalar steel refuse longitudinal torsion', () => {
  const shear = { diameter: 8, legs: 4, spacing: 0.06 };
  for (const edition of ['2005', '2025'] as const) for (const extracted of [false, true]) {
    const station = provided({ stirrups: shear, top: longitudinal, bottom: longitudinal }, 'beam', 0, 6, { edition, extracted });
    expect(station.checks.find(row => row.category === 'Torsion Al Span (Vz)')).toMatchObject({
      status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck',
    });
  }
  const witness = { ...input(0, 6, '2025'), elementType: 'wall' as const };
  const fixedResult = verifyElement(witness, { shear, torsion: { AlProv: 100 } });
  expect(fixedResult.torsion).toMatchObject({ status: 'fail', ratio: Infinity, refusal: 'diag.rcTorsionPerimeter' });
});

it('#2310 fixed beams cannot verify longitudinal torsion from scalar area', () => {
  const shear = { diameter: 8, legs: 4, spacing: 0.06 };
  const fixed = { shear, torsion: { AlProv: 100 } };
  for (const edition of ['2005', '2025'] as const) {
    const witness = { ...input(0, 6, edition), elementType: 'beam' as const };
    for (const out of [verifyElement(witness, fixed), prepareElementVerification(witness)(fixed)]) {
      expect.soft(out.torsion).toMatchObject({
        status: 'fail', ratio: Infinity, refusal: 'diag.rcTorsionPerimeter', longitudinalProvision: 'not-checked',
      });
    }
    const inactive = { ...input(0, 0.5, edition), elementType: 'beam' as const };
    expect(verifyElement(inactive, fixed).torsion).toMatchObject({ neglect: true, status: 'ok' });
  }
});

it('#2310 inner bars cannot replace perimeter bars that end before the cut', () => {
  const geometry = { ...section, h: 0.37 };
  const stirrups = { diameter: 8, legs: 4, spacing: 0.06 };
  const outer = { ...longitudinal, row: 0 };
  const inner = { ...longitudinal, row: 1 };
  for (const extracted of [false, true]) {
    const check = (continues: boolean) => {
      const groups = [
        { layers: [outer], continueStart: true, continueEnd: continues },
        { layers: [inner], continueStart: true, continueEnd: true },
      ];
      return verifyBeamStations(geometry, { regions: {
        topStartLayers: [outer, inner], topEndLayers: [outer, inner], bottomSpan: longitudinal,
        topStartGroups: groups, topEndGroups: groups.map(g => ({ ...g, continueStart: g.continueEnd, continueEnd: true })),
        stirrupsSupport: stirrups, stirrupsSpan: stirrups,
      } }, 6, [{ name: 'C1', forces: { n: 0, my: 0, vz: 0, torsion: 6 } }], extracted)
        .checks.find(c => c.category === 'Torsion Al Span (Vz)');
    };
    expect.soft(check(false)).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcTorsionPerimeter' });
    expect(check(true)).toMatchObject({ status: 'ok' });
  }
});

it('#2310 longitudinal torsion accepts verified corner coverage on the short side of the perimeter limit', () => {
  const shear = { diameter: 8, legs: 4, spacing: 0.06 };
  const nominal = 0.3 + 2 * (section.cover + shear.diameter / 1000) + longitudinal.diameter / 1000;
  for (const edition of ['2005', '2025'] as const) for (const extracted of [false, true]) {
    const check = (h: number) => provided({ stirrups: shear, top: longitudinal, bottom: longitudinal }, 'beam', 0, 6,
      { edition, extracted, geometry: { ...section, h } }).checks.find(row => row.category === 'Torsion Al Span (Vz)');
    expect(check(nominal - 1e-6)).toMatchObject({ status: 'ok', limiting: 'torsion' });
    expect(check(nominal + 1e-6)).toMatchObject({ status: 'fail', description: 'diag.rcTorsionPerimeter' });
  }
});

it('#2301 a fixed two-leg cage refuses shear when the detailing requires more legs', () => {
  const witness = input(20, 0, '2025', section, 75);
  const rotated = input(0, 0, '2025', { ...section, b: section.h, h: section.b }, 40);
  const shear = { diameter: 8, legs: 2, spacing: 0.075 };
  for (const verify of [verifyElement, (v: ConcurrentVerificationInput, r: { shear: typeof shear }) => prepareElementVerification(v)(r)]) {
    const original = verify(witness, { shear });
    expect(original.shear).toMatchObject({ stirrupLegs: 2, status: 'ok' });
    expect(original.shear.phiVn).toBeCloseTo(shearCapacity('2025', section.b, depth(section.h, 8), 8, 2, 0.075), 10);
    expect(original.shearSecondary).toMatchObject({ status: 'ok', stirrupLegs: 2 });
    const result = verify(rotated, { shear });
    expect(result.shear).toMatchObject({ status: 'fail', stirrupLegs: 2, refusal: 'diag.rcShearLegs' });
    expect(result.overallStatus).toBe('fail');
    expect(verify(rotated, { shear: { ...shear, legs: 4 } }).shear).toMatchObject({ stirrupLegs: 4, status: 'ok' });
  }
});

function verifyBeamStations(
  geometry: typeof section, rebar: ProvidedReinforcement, L: number,
  groups: Array<{ name: string; forces: { n: number; my: number; vz: number; torsion: number } }>, extracted = false,
) {
  const stationTs = [0, 0.5, 1];
  const comboResults = groups.map(({ name, forces }, i) => ({
    comboId: i + 1, comboName: name,
    stations: stationTs.map(t => ({ t, x: t * L, ...forces, mz: 0, vy: 0 })),
  }));
  const layout = { elementId: 1, length: L, stationTs, comboResults };
  return verifyProvidedReinforcement(1, 'beam', rebar, extracted ? extractGoverningDemands(layout) : undefined, {}, geometry,
    extracted ? undefined : layout, undefined,
    { axes: { ...axes, bFlex: geometry.b, hFlex: geometry.h }, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } });
}

it('#2213 compression in another combination cannot waive the ductility check', () => {
  const geometry = { ...section, h: 0.35, fy: 500 };
  const steel = {
    top: { count: 4, diameter: 25 }, bottom: { count: 2, diameter: 16 },
    stirrups: { diameter: 8, legs: 2, spacing: 0.1 },
  };
  const bending = { name: 'Bending', forces: { n: 0, my: -50, vz: 0, torsion: 0 } };
  const cirsoc201Section9331Threshold = 0.1 * geometry.fc * 1000 * geometry.b * geometry.h;
  for (const extracted of [false, true]) {
    const ductility = (groups: Parameters<typeof verifyBeamStations>[3]) =>
      verifyBeamStations(geometry, steel, 12, groups, extracted).checks.filter(row => row.category.includes('ductility'));
    const expected = expect.arrayContaining([expect.objectContaining({ status: 'fail', comboName: bending.name })]);
    expect(ductility([bending])).toEqual(expected);
    for (const n of [262.499, cirsoc201Section9331Threshold, 262.501, 263]) {
      const compression = { name: 'Compression', forces: { n: -n, my: 0, vz: 0, torsion: 0 } };
      expect.soft(ductility([bending, compression])).toEqual(expected);
      expect.soft(ductility([compression, bending])).toEqual(expected);
    }
    for (const n of [262.499, cirsoc201Section9331Threshold, 262.501]) {
      const concurrent = { ...bending, forces: { ...bending.forces, n: -n } };
      if (n > cirsoc201Section9331Threshold) expect.soft(ductility([concurrent])).toHaveLength(0);
      else expect.soft(ductility([concurrent]).length).toBeGreaterThan(0);
    }
  }
});

function tensionSpacingWitness(axialTension: number, vu: number) {
  const geometry = { ...section, h: 0.5, stirrupDia: 10 };
  const bars = { count: 3, diameter: 20 };
  const stirrups = { diameter: 10, legs: 4, spacing: 0.2 };
  const d = depth(geometry.h, stirrups.diameter, bars.diameter);
  const concreteStress = 0.17 * Math.sqrt(geometry.fc) * 1000 - axialTension / (6 * geometry.b * geometry.h);
  const requiredVs = vu / phi - concreteStress * geometry.b * d;
  const table97622Row2Threshold = 0.33 * Math.sqrt(geometry.fc) * 1000 * geometry.b * d;
  expect(requiredVs).toBeGreaterThan(table97622Row2Threshold);
  expect(stirrups.spacing).toBeGreaterThan(d / 4);
  expect(stirrups.spacing).toBeLessThan(d / 2);
  const check = (n: number) => verifyBeamStations(geometry, { top: bars, bottom: bars, stirrups }, 6,
    [{ name: 'Shear with concurrent axial force', forces: { n, my: 0, vz: vu, torsion: 0 } }]).checks;
  const alongSpacing = (row: ReturnType<typeof check>[number]) => row.category.endsWith('s,max');
  expect(check(0).find(alongSpacing)?.status).not.toBe('fail');
  const tension = check(axialTension);
  expect(tension.find(row => row.demandCategory === 'Vz')?.capacity).toBeGreaterThan(vu);
  expect(tension.find(alongSpacing),
    `Required Vs ${requiredVs.toFixed(2)} kN exceeds ${table97622Row2Threshold.toFixed(2)} kN. Row 2 limits spacing to ${(d * 1000 / 4).toFixed(2)} mm.`,
  ).toMatchObject({ status: 'fail' });
}

it('#2214 concurrent tension requires row 2 stirrup spacing', () => {
  tensionSpacingWitness(450, 210);
});

it('#2271 the spacing row changes before the uncoupled shear threshold', () => {
  const geometry = { ...section, stirrupDia: 12 };
  const bars = { count: 4, diameter: 25 };
  const stirrups = { diameter: 12, legs: 4, secondaryLegs: 4, spacing: 0.2 };
  for (const extracted of [false, true]) {
    const result = verifyBeamStations(geometry, { top: bars, bottom: bars, stirrups }, 6,
      [{ name: 'Tension', forces: { n: 600, my: 1, vz: 250, torsion: 0 } }], extracted);
    expect(result.checks.find(row => row.demandCategory === 'Vz')?.capacity).toBeGreaterThan(250);
    expect.soft(result.checks.find(row => row.category === 'Shear Span (Vz) s,max')).toMatchObject({
      status: 'fail', required: +(depth(geometry.h, stirrups.diameter, bars.diameter) * 100 / 4).toFixed(1), provided: 20,
    });
    expect.soft(result.overallStatus).toBe('fail');
  }
});

it('#2296 primary shear refuses when the selected depth overstates the hogging depth', () => {
  const geometry = { ...section, stirrupDia: 12 };
  const bars = { top: { count: 3, diameter: 32 }, bottom: { count: 3, diameter: 16 } };
  const stirrups = { diameter: 12, legs: 2, spacing: 0.16 };
  const vu = 352;
  const d = depth(geometry.h, stirrups.diameter, bars.top.diameter);
  const capacity = phi * d * (0.17 * Math.sqrt(geometry.fc) * 1000 * geometry.b
    + stirrups.legs * 1.131e-4 * geometry.fy * 1000 / stirrups.spacing);
  expect(vu / capacity).toBeGreaterThan(1);
  for (const extracted of [false, true]) {
    const check = (my: number) => verifyBeamStations(geometry, { ...bars, stirrups }, 4,
      [{ name: 'Support shear', forces: { n: 0, my, vz: vu, torsion: 0 } }], extracted)
      .checks.find(row => row.demandCategory === 'Vz');
    expect(check(-20)).toMatchObject({ capacity: 0, ratio: Infinity, status: 'fail', limiting: 'unsupportedCheck' });
    expect(check(20)).toMatchObject({ capacity: expect.any(Number), status: 'warn' });
  }
});

it('#2300 longitudinal torsion refuses a top layout that varies with a cutoff', () => {
  const L = 4;
  const supportRegion = 0.25;
  const extensionEnd = 0.4;
  const stirrups = { diameter: 8, legs: 2, spacing: 0.075 };
  const face = { count: 3, diameter: 16 };
  const groups = {
    topStartGroups: [{ layers: [{ ...face, row: 0 }], label: 'support' as const, extensionEnd, anchorageEnd: 'hook' as const }],
    topEndGroups: [{ layers: [{ ...face, row: 0 }], label: 'support' as const, continueStart: false }],
  };
  const reinforcement = { stirrups, regions: { regionT: supportRegion, bottomSpan: face, topStart: face, topEnd: face, ...groups } };
  const stationTs = [0, 0.4, 0.7, 1];
  const stations = stationTs.map(t => ({ t, x: t * L, n: 0, my: -15, mz: 0, vy: 0, vz: 0, torsion: 20 }));
  expect(stations[1]!.x).toBeGreaterThan(supportRegion * L + extensionEnd);
  expect(stations[1]!.x).toBeLessThan((1 - supportRegion) * L);
  const layout = { elementId: 1, length: L, stationTs, comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
  for (const extracted of [false, true]) {
    const result = verifyProvidedReinforcement(1, 'beam', reinforcement,
      extracted ? extractGoverningDemands(layout) : undefined, {}, section, extracted ? undefined : layout, undefined,
      { axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } });
    expect(result.checks.find(row => row.category === 'Torsion Al Span (Vz)')).toMatchObject({
      provided: 0, status: 'fail', limiting: 'unsupportedCheck', ratio: Infinity, description: 'diag.rcTorsionCutoff',
    });
  }
});

it('#2300 group cutoffs between sampled support stations block longitudinal torsion', () => {
  const L = 4;
  const geometry = { ...section, h: 0.37 };
  const extension = 0.6;
  const layer = { ...longitudinal, row: 0 };
  const stationTs = [0, 0.25, 0.75, 1];
  const result = { elementId: 1, length: L, stationTs, comboResults: [{
    comboId: 1, comboName: 'active',
    stations: stationTs.map(t => ({ t, x: t * L, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 6 })),
  }] };
  for (const extracted of [false, true]) {
    const check = (length: number) => verifyProvidedReinforcement(1, 'beam', {
      stirrups: { ...cage, spacing: 0.06 },
      regions: {
        regionT: 0.25, bottomSpan: longitudinal, topStart: longitudinal, topEnd: longitudinal,
        topStartGroups: [{ layers: [layer], extensionEnd: length }],
        topEndGroups: [{ layers: [layer], extensionStart: length }],
      },
    }, extracted ? extractGoverningDemands(result) : undefined, {}, geometry, extracted ? undefined : result, undefined,
    { axes: { ...axes, hFlex: geometry.h } }).checks;
    const cutoff = check(extension).find(row => row.category === 'Torsion Al Span (Vz)');
    expect.soft(cutoff).toMatchObject({ status: 'fail', description: 'diag.rcTorsionPerimeter', comboName: 'active' });
    expect(check(2).find(row => row.category === 'Torsion Al Support (Vz)')).toMatchObject({ status: 'ok' });
  }
});

for (const nonlinear of [false, true]) for (const spatial of [false, true]) {
  const checkSolvedGap = () => {
    const L = 6;
    const geometry = { ...section, h: 0.37 };
    const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]);
    const solverModel = { ...model, nodes };
    let raw: AnalysisResults3D;
    if (spatial) {
      const solver: SolverInput3D = { ...solverModel,
        elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 6, my: 0, mz: 0 } }],
      };
      raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    } else {
      const solver: SolverInput = { ...solverModel,
        nodes: new Map([...nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
        sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
        elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
      };
      raw = planarResultForDesign(nonlinear ? solvePDelta(solver).results : solve(solver));
    }
    const { demands, stations } = computeStationDemands(new Map([[1, raw]]), combos, solverModel);
    const [left, right] = stations.get(1)!.stationTs.filter(t => t > 0.3 && t < 0.7).slice(0, 2).map(t => t * L);
    const cutoff = (2 * left! + right!) / 3, restart = (left! + 2 * right!) / 3;
    const check = (to: number, extracted: boolean) => {
      const top = { count: 3, diameter: 16, face: 'top' as const, row: 0, role: 'mounting' as const };
      const reinforcement = membersFromLine({
        version: 1, members: [1], lengths: [L],
        bars: [
          { ...top, id: 'left', from: 0, to },
          ...(to < L ? [{ ...top, id: 'right', from: restart, to: L }] : []),
          { ...top, id: 'inner', row: 1, count: 4, from: 0, to: L },
          { ...top, id: 'mid-inner', row: 2, from: 0.26 * L, to: 0.74 * L },
          { ...top, id: 'bottom', face: 'bottom', from: 0, to: L },
        ],
        stirrups: [{ ...cage, spacing: 0.06, id: 'cage', from: 0, to: L }],
      }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
      return verifyProvidedReinforcement(1, 'beam', reinforcement, extracted ? demands.get(1) : undefined,
        {}, geometry, extracted ? undefined : stations.get(1), undefined, { axes: { ...axes, hFlex: geometry.h } }).checks;
    };
    expect(cutoff).toBeLessThan(restart);
    const longitudinal = (rows: ReturnType<typeof check>) => rows.find(row => row.category === 'Torsion Al Span (Vz)');
    for (const extracted of [false, true]) {
      if (spatial) {
        expect.soft(longitudinal(check(cutoff, extracted))).toMatchObject({
          status: 'fail', ratio: Infinity, description: 'diag.rcTorsionPerimeter',
        });
        expect(longitudinal(check(L, extracted))).toMatchObject({ status: 'ok' });
      } else {
        const rows = check(cutoff, extracted);
        expect(longitudinal(rows)).toBeUndefined();
        expect(rows.find(row => row.category === 'Shear Span (Vz)')).toMatchObject({ status: 'ok' });
      }
    }
  };
  if (spatial) it(`#2310 solved beam corner gap (nonlinear=${nonlinear})`, checkSolvedGap);
  else it(`planar corner gap with zero torsion (nonlinear=${nonlinear})`, checkSolvedGap);
}

function checkReviewBeam(
  geometry: typeof section, reinforcement: ProvidedReinforcement, L: number,
  stations: Array<{ t: number; n: number; my: number; vy: number; vz: number; torsion: number }>,
  extracted: boolean, edition: Edition, modelData?: Parameters<typeof verifyProvidedReinforcement>[7],
) {
  const layout = { elementId: 1, length: L, stationTs: stations.map(s => s.t),
    comboResults: [{ comboId: 1, comboName: 'Review', stations: stations.map(s => ({ ...s, x: s.t * L, mz: 0 })) }] };
  return verifyProvidedReinforcement(1, 'beam', reinforcement, extracted ? extractGoverningDemands(layout) : undefined,
    {}, geometry, extracted ? undefined : layout, modelData,
    { axes: { ...axes, bFlex: geometry.b, hFlex: geometry.h }, spacingRule: { edition, maxAggregateSizeMm: 20 } }).checks;
}

for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  it(`known wrong result: #2338 primary shear uses the actual hoop depth (spatial=${spatial}, nonlinear=${nonlinear})`, () => {
    const L = 4;
    const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]);
    const solverModel = { ...model, nodes };
    const element = model.elements.get(1)!;
    const solveDemand = (force: number) => {
      if (spatial) {
        const solver: SolverInput3D = { ...solverModel,
          elements: new Map([[1, { ...element, releaseMyStart: false, releaseMyEnd: false,
            releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
          supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
          loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0 } }],
        };
        return nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
      }
      const solver: SolverInput = { ...solverModel,
        elements: new Map([[1, { ...element, hingeStart: false, hingeEnd: false }]]),
        nodes: new Map([...nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
        sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -force, my: 0 } }],
      };
      return planarResultForDesign(nonlinear ? solvePDelta(solver).results : solve(solver));
    };

    for (const [nominal, actual] of [[8, 10], [10, 8], [8, 8]] as const) {
      const geometry = { ...section, stirrupDia: nominal };
      const stirrups = { ...cage, diameter: actual, legs: 2 };
      const member = { id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0,
        reinforcement: { top: longitudinal, bottom: longitudinal, stirrups } };
      const drawn = membersFromLine(lineFromMembers([member]), [member]).get(1)!;
      const capacity = +shearCapacity('2025', section.b, depth(section.h, actual),
        actual, stirrups.legs, stirrups.spacing).toFixed(2);
      for (const factor of [0.9, 0.999, 1.001]) {
        const { demands, stations } = computeStationDemands(new Map([[1, solveDemand(capacity * factor)]]), combos, solverModel);
        const status = factor > 1 ? 'fail' : factor > 0.95 ? 'warn' : 'ok';
        const regional = { ...member.reinforcement, regions: { stirrupsSupport: stirrups, stirrupsSpan: stirrups } };
        for (const reinforcement of [member.reinforcement, regional, drawn]) for (const extracted of [false, true]) {
          const args = [1, 'beam', reinforcement, extracted ? demands.get(1) : undefined, {}, geometry,
            extracted ? undefined : stations.get(1), undefined, { axes }] as const;
          for (const result of [verifyProvidedReinforcement(...args), rankProvidedReinforcement(...args).ranking]) {
            for (const region of ['Support', 'Span']) {
              expect.soft(result.checks.find(row => row.category === `Shear ${region} (Vz)`),
                `nominal Ø${nominal}, actual Ø${actual}, factor ${factor}`).toMatchObject({ capacity, ratio: factor, status });
            }
          }
        }
      }
    }
  });
}

it('known wrong result: #2338 drawn stirrup strength at both sides of each zone transition', () => {
  const L = 4;
  const dense = { diameter: 10, legs: 4, spacing: 0.1 };
  const sparse = { diameter: 8, legs: 2, spacing: 0.25 };
  const geometry = { ...section, stirrupDia: dense.diameter };
  const capacity = shearCapacity('2025', geometry.b, depth(geometry.h, sparse.diameter),
    sparse.diameter, sparse.legs, sparse.spacing);
  for (const reverse of [false, true]) for (const extracted of [false, true]) {
    const from = reverse ? 0.60 : 0.32, to = reverse ? 0.68 : 0.40;
    const governingT = reverse ? to : from;
    const check = (cageBetween: typeof sparse, factor: number) => {
      const drawn = membersFromLine({
        version: 1, members: [1], lengths: [L],
        bars: [{ ...longitudinal, id: 'top', face: 'top', row: 0, role: 'main', from: 0, to: L },
          { ...longitudinal, id: 'bottom', face: 'bottom', row: 0, role: 'main', from: 0, to: L }],
        stirrups: [{ ...dense, id: 'start', from: 0, to: from * L },
          { ...cageBetween, id: 'middle', from: from * L, to: to * L },
          { ...dense, id: 'end', from: to * L, to: L }],
      }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
      expect(drawn.regions?.stirrupsSpan).toEqual(dense);
      return checkReviewBeam(geometry, drawn, L, [0, 0.28, 0.5, 0.72, 1].map(t => ({
        t, n: 0, my: 0, vy: 0, vz: capacity * factor + 25 * (reverse ? t - to : from - t), torsion: 0,
      })), extracted, '2025').find(row => row.category === 'Shear Span (Vz)');
    };
    expect(check(dense, 1.01)?.ratio).toBeLessThan(1);
    expect.soft(check(sparse, 0.99)).toMatchObject({ capacity: +capacity.toFixed(2), ratio: 0.99 });
    expect.soft(check(sparse, 1.01)).toMatchObject({
      capacity: +capacity.toFixed(2), ratio: 1.01, status: 'fail', stationX: governingT * L,
    });
  }
});

it('known wrong result: #2338 an interpolated cutoff can govern torsion with passing sampled stations', () => {
  const L = 4;
  const geometry = { ...section, h: 0.37 };
  const transverse = { ...cage, spacing: 0.06 };
  const outside = { ...longitudinal, row: 0 };
  const inside = { ...longitudinal, row: 1 };
  const stations = [0, 1].map(t => ({ t, n: 0, my: t === 0 ? 2 : -10, vy: 0, vz: 10, torsion: 6 }));
  for (const extracted of [false, true]) {
    const check = (bottomLayers: typeof outside[], withCutoff: boolean) => checkReviewBeam(geometry, {
      stirrups: transverse,
      regions: {
        topStartLayers: [outside, inside], topEndLayers: [outside], bottomSpanLayers: bottomLayers,
        topStartGroups: [{ layers: [outside] }, { layers: [inside], ...(withCutoff ? { extensionEnd: 1 } : {}) }],
      },
    }, L, stations, extracted, '2025');
    const sampled = check([outside], false);
    expect(sampled.find(row => row.category === 'Torsion Support (Vz)')?.ratio).toBeLessThan(1);
    expect.soft(check([outside], true).find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({
      status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcTorsionDepth',
    });
    expect.soft(check([outside, inside], true).find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({ status: 'ok' });
  }
});

it('known wrong result: #2338 every credited torsion bar meets the edition diameter rule', () => {
  const geometry = { ...section, b: 0.84, h: 0.37, stirrupDia: 12 };
  for (const edition of ['2005', '2025'] as const) for (const extracted of [false, true]) for (const draw of [false, true]) {
    const spacingAtTen = edition === '2005' ? 0.24 : 0.01 / 0.042;
    const check = (diameter: number, spacing: number, torque = 15) => {
      const bar = { count: 12, diameter };
      const stirrups = { diameter: geometry.stirrupDia, legs: 6, spacing };
      const L = 8;
      const provided = !draw ? { top: bar, bottom: bar, stirrups } : membersFromLine({
        version: 1, members: [1], lengths: [L],
        bars: [{ ...bar, id: 'top', face: 'top', row: 0, role: 'main', from: 0, to: L },
          { ...bar, id: 'bottom', face: 'bottom', row: 0, role: 'main', from: 0, to: L }],
        stirrups: [{ ...stirrups, id: 'hoops', from: 0, to: L }],
      }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
      return checkReviewBeam(geometry, provided, L, [0.2, 0.8].map(t => ({
        t, n: 0, my: 0, vy: 0, vz: 0, torsion: torque,
      })), extracted, edition).find(row => row.category === 'Torsion Al Support (Vz)');
    };
    const developed = draw && edition === '2005'
      ? { status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcTorsionSplice' }
      : { status: 'ok' };
    expect(check(10, spacingAtTen * 0.999)).toMatchObject(developed);
    expect(check(10, spacingAtTen)).toMatchObject(developed);
    expect.soft(check(10, spacingAtTen * 1.001)).toMatchObject({ status: 'fail', description: 'diag.rcTorsionPerimeter' });
    expect.soft(check(8, 0.06)).toMatchObject({ status: 'fail', description: 'diag.rcTorsionPerimeter' });
    expect(check(8, 0.06, 0)).toBeUndefined();
  }
});


it('#2349 torsion capacity reflects the evaluated concrete limit even below failure', () => {
  const shear = { diameter: 12, legs: 4, spacing: 0.045 };
  const geometry = { ...section, stirrupDia: shear.diameter };
  const fixedBars = { AsProv: 8.044, barDia: 16, barCount: 4, bars: 'provided', isDoublyReinforced: false };
  const vz = 250, tension = 180;
  const d = depth(geometry.h, shear.diameter, fixedBars.barDia);
  const inset = 2 * geometry.cover + shear.diameter / 1000;
  const aoh = (geometry.b - inset) * (geometry.h - inset);
  const perimeter = 2 * (geometry.b + geometry.h - 2 * inset);
  const root = Math.sqrt(geometry.fc);
  const concreteStress = 0.17 * root * 1000 - tension / (6 * geometry.b * geometry.h);
  const limit = phi * (concreteStress + 0.66 * root * 1000);
  const capacity = Math.sqrt(limit ** 2 - (vz / (geometry.b * d)) ** 2) * 1.7 * aoh ** 2 / perimeter;
  const torsion = 0.8 * capacity;
  const [entry] = declaredTestDemands([{ comboId: 1, comboName: 'C1',
    forces: { t: 0.5, x: 2, n: tension, my: 0, mz: 0, vy: 0, vz, torsion } }]);
  const demand = entry!.section('My');
  const check = { ...geometry, elementId: 1, elementType: 'beam' as const, edition: '2025' as const, demand };
  const provision = { shear, flexure: fixedBars, torsion: { AlProv: 100 } };
  const direct = checkTorsion(geometry, demand, '2025', undefined, {
    evaluatedShear: { primary: { d, phiVc: phi * concreteStress * geometry.b * d } },
  });
  for (const row of [direct, verifyElement(check, provision).torsion, prepareElementVerification(check)(provision).torsion]) {
    expect.soft(row?.phiTn).toBeCloseTo(capacity, 9);
  }
  expect.soft(direct.ratio).toBeCloseTo(0.8, 12);
  expect(direct.status).toBe('ok');
});

it('#2349 touching drawn bars cannot verify continuous longitudinal torsion steel', () => {
  const L = 4;
  const geometry = { ...section, h: 0.37 };
  const top = { ...longitudinal, face: 'top' as const, row: 0, role: 'main' as const };
  const beam = (split: boolean) => membersFromLine({
    version: 1, members: [1], lengths: [L],
    bars: [
      { ...top, id: 'top', from: 0, to: split ? L / 2 : L },
      ...(split ? [{ ...top, id: 'top-right', from: L / 2, to: L }] : []),
      { ...top, face: 'bottom', id: 'bottom', from: 0, to: L },
    ],
    stirrups: [{ ...cage, spacing: 0.06, id: 'hoops', from: 0, to: L }],
  }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
  for (const extracted of [false, true]) for (const edition of ['2005', '2025'] as const) {
    const check = (split: boolean, torque: number) => checkReviewBeam(geometry, beam(split), L,
      [0.4, 0.6].map(t => ({ t, n: 0, my: 0, vy: 0, vz: 0, torsion: torque })), extracted, edition)
      .find(row => row.category === 'Torsion Al Span (Vz)');
    expect(check(false, 6)).toMatchObject(edition === '2025' ? { status: 'ok' } : {
      status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcTorsionSplice',
    });
    expect(check(true, 0.5)).toBeUndefined();
    expect.soft(check(true, 6)).toMatchObject({
      status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcTorsionSplice',
    });
  }
});


it('#2214 the strictest spacing row can come from a combination below peak shear', () => {
  const geometry = { ...section, stirrupDia: 12 };
  const bars = { count: 4, diameter: 25 };
  const stirrups = { diameter: 12, legs: 4, secondaryLegs: 4, spacing: 0.2 };
  const tension = 600;
  const d = depth(geometry.h, stirrups.diameter, bars.diameter);
  const concreteStress = 0.17 * Math.sqrt(geometry.fc) * 1000 - tension / (6 * geometry.b * geometry.h);
  const transition = phi * (concreteStress + 0.33 * Math.sqrt(geometry.fc) * 1000) * geometry.b * d;
  const combo = (name: string, n: number, vz: number) => ({ name, forces: { n, vz, my: 1, torsion: 0 } });
  for (const extracted of [false, true]) {
    const check = (cage: typeof stirrups, groups: Parameters<typeof verifyBeamStations>[3]) =>
      verifyBeamStations(geometry, { top: bars, bottom: bars, stirrups: cage }, 6, groups, extracted)
        .checks.find(row => row.category === 'Shear Span (Vz) s,max');
    const peak = combo('Compression', -200, 270);
    const below = combo('Tension below threshold', tension, transition - 0.01);
    const above = combo('Tension above threshold', tension, transition + 0.01);
    expect(peak.forces.vz).toBeGreaterThan(above.forces.vz);
    expect(check(stirrups, [peak, below])).toBeUndefined();
    expect(check(stirrups, [peak, above])).toMatchObject({ status: 'fail', comboName: above.name });
    expect(check({ ...stirrups, spacing: d / 4 }, [peak, above])).toBeUndefined();
  }
});

for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  it(`#2271 solved beam spacing uses concurrent axial force (spatial=${spatial}, nonlinear=${nonlinear})`, () => {
    const geometry = { ...section, stirrupDia: 12 };
    const bars = { count: 4, diameter: 25 };
    const stirrups = { diameter: 12, legs: 4, secondaryLegs: 4, spacing: 0.2 };
    const L = 1;
    const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]);
    const structure = { ...model, nodes };
    const checks = (axial: number) => {
      let raw: AnalysisResults3D;
      if (spatial) {
        const input: SolverInput3D = { ...structure,
          elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
            releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
          supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
          loads: [{ type: 'nodal', data: { nodeId: 2, fx: axial, fy: 0, fz: -250, mx: 0, my: 0, mz: 0 } }],
        };
        raw = nonlinear ? solvePDelta3D(input).results : solve3D(input);
      } else {
        const input: SolverInput = { ...structure,
          nodes: new Map([...nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
          sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
          elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]),
          loads: [{ type: 'nodal', data: { nodeId: 2, fx: axial, fz: -250, my: 0 } }],
        };
        raw = planarResultForDesign(nonlinear ? solvePDelta(input).results : solve(input));
      }
      const solved = computeStationDemands(new Map([[1, raw]]), combos, structure);
      return verifyProvidedReinforcement(1, 'beam', { top: bars, bottom: bars, stirrups },
        solved.demands.get(1), {}, geometry, solved.stations.get(1), undefined,
        { axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } }).checks;
    };
    expect(checks(600).find(row => row.category === 'Shear Span (Vz) s,max')).toMatchObject({ status: 'fail' });
    expect(checks(0).find(row => row.category === 'Shear Span (Vz) s,max')).toBeUndefined();
  });
}


it('#2214 fixed beam and wall spacing uses the evaluated concrete contribution', () => {
  const geometry = { ...section, stirrupDia: 12 };
  const shear = { diameter: 12, legs: 4, spacing: 0.2 };
  const flexure = { barDia: 16, barCount: 4, AsProv: 8.044, bars: 'provided', isDoublyReinforced: false };
  const d = depth(geometry.h, shear.diameter, flexure.barDia);
  for (const elementType of ['beam', 'wall'] as const) for (const axial of [0, 600]) {
    const [entry] = declaredTestDemands([{ comboId: 1, comboName: 'Concurrent demand',
      forces: { t: 0, x: 0, n: axial, vz: 250, vy: 0, my: 1, mz: 0, torsion: 0 } }]);
    const check = { ...geometry, elementId: 1, elementType, demand: entry!.section('My'), edition: '2025' as const };
    for (const verify of [(spacing: number) => verifyElement(check, { shear: { ...shear, spacing }, flexure }),
      (spacing: number) => prepareElementVerification(check)({ shear: { ...shear, spacing }, flexure })]) {
      const loose = verify(shear.spacing).shear;
      expect(loose.phiVn).toBeGreaterThan(250);
      expect(loose.refusal).toBe(axial === 0 ? undefined : 'diag.rcShearSpacing');
      expect(verify(d / 4).shear.refusal).toBeUndefined();
    }
  }
});


it('#2349 a curtailed perimeter bar requires development beyond the active cut', () => {
  const L = 8;
  const x = 1.6;
  const geometry = { ...section, h: 0.37 };
  const top = { ...longitudinal, face: 'top' as const, row: 0, role: 'main' as const };
  const ld = deriveDevelopment({ diameterMm: top.diameter, fy: geometry.fy, fc: geometry.fc,
    favourableSpacing: false, edition: '2025', psiT: topBarFactor(geometry.h) }).ldM;
  for (const extracted of [false, true]) {
    const check = (length: number) => {
      const r = membersFromLine({
        version: 1, members: [1], lengths: [L],
        bars: [{ ...top, id: 'top', from: 0, to: x + length },
          { ...top, face: 'bottom', id: 'bottom', from: 0, to: L }],
        stirrups: [{ ...cage, spacing: 0.06, id: 'hoops', from: 0, to: L }],
      }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
      return checkReviewBeam(geometry, r, L, [
        { t: x / L, n: 0, my: 0, vy: 0, vz: 0, torsion: 6 },
      ], extracted, '2025').find(row => row.category === 'Torsion Al Support (Vz)');
    };
    expect(check(ld - 1e-6)).toMatchObject({ status: 'fail', description: 'diag.rcTorsionSplice' });
    expect(check(ld + 1e-6)).toMatchObject({ status: 'ok' });
  }
});

for (const extracted of [false, true]) for (const edition of ['2005', '2025'] as const) {
  it(`#2349 drawn torsion development at a shared joint (extracted=${extracted}, edition=${edition})`, () => {
    const L = 4;
    const geometry = { ...section, h: 0.37 };
    const joint = L;
    const top = { ...longitudinal, face: 'top' as const, row: 0, role: 'main' as const };
    const member = { id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 };
    const ld = deriveDevelopment({ diameterMm: top.diameter, fy: geometry.fy, fc: geometry.fc,
      favourableSpacing: false, edition: '2025', psiT: topBarFactor(geometry.h) }).ldM;
    const checks = (overrun: number, reverse: boolean, torque = 6) => {
      const reinforcement = membersFromLine({
        version: 1, members: [1, 2], lengths: [L, L],
        bars: [
          { ...top, id: 'left', from: 0, to: joint + overrun, hookEnd: true },
          { ...top, id: 'right', from: joint - overrun, to: 2 * L, hookStart: true },
          { ...top, face: 'bottom', id: 'bottom', from: 0, to: 2 * L },
        ],
        stirrups: [{ ...cage, spacing: 0.06, id: 'hoops', from: 0, to: 2 * L }],
      }, [member, { ...member, id: 2 }]);
      return [1, 2].map(id => {
        const drawing = reinforcement.get(id)!;
        const t = (id === 1) !== reverse ? 1 : 0;
        return checkReviewBeam(geometry, reverse ? mirrorReinforcement(drawing) : drawing, L,
          [{ t, n: 0, my: 0, vy: 0, vz: 0, torsion: torque }], extracted, edition)
          .find(row => row.category === 'Torsion Al Support (Vz)');
      });
    };
    for (const reverse of [false, true]) {
      for (const overrun of [0, 0.5e-6]) {
        for (const row of checks(overrun, reverse)) expect.soft(row).toMatchObject({
          status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcTorsionSplice',
        });
      }
      expect(checks(0, reverse, 0.5)).toEqual([undefined, undefined]);
    }
    if (edition === '2025') {
      const developed = (reach: number, compatible: boolean) => {
        const element = model.elements.get(1)!;
        const frame = { ...model, nodes: new Map([0, L, 2 * L].map((x, i) => [i + 1, { id: i + 1, x, y: 0, z: 0 }])),
          elements: new Map([[1, element], [2, { ...element, id: 2, nodeI: 2, nodeJ: 3, materialId: compatible ? 1 : 2 }]]),
        };
        const reinforcement = membersFromLine({
          version: 1, members: [1, 2], lengths: [L, L],
          bars: [
            { ...top, id: 'top', from: 0, to: joint + reach },
            { ...top, face: 'bottom', id: 'bottom', from: 0, to: 2 * L },
          ],
          stirrups: [{ ...cage, spacing: 0.06, id: 'hoops', from: 0, to: 2 * L }],
        }, [member, { ...member, id: 2 }]);
        return checkReviewBeam(geometry, reinforcement.get(1)!, L,
          [{ t: 1, n: 0, my: 0, vy: 0, vz: 0, torsion: 6 }], extracted, edition, frame)
          .find(row => row.category === 'Torsion Al Support (Vz)');
      };
      expect.soft(developed(ld - 1e-6, true)).toMatchObject({ status: 'fail', description: 'diag.rcTorsionSplice' });
      expect(developed(ld + 1e-6, true)).toMatchObject({ status: 'ok' });
      expect.soft(developed(ld + 1e-6, false)).toMatchObject({ status: 'fail', description: 'diag.rcTorsionSplice' });
    }
  });
}

for (const extracted of [false, true]) {
  it(`#2171 drawn secondary shear needs occupied corner bends (extracted=${extracted})`, () => {
    const L = 6;
    const geometry = { ...section, b: 0.2, h: 0.5, fc: 30, stirrupDia: 6 };
    const top = { count: 3, diameter: 16, face: 'top' as const, row: 0, role: 'main' as const };
    const drawing = membersFromLine({
      version: 1, members: [1], lengths: [L],
      bars: [
        { ...top, id: 'seated', from: 0, to: 4 },
        { ...top, id: 'beside', from: 3, to: L },
        { ...top, face: 'bottom', id: 'bottom', from: 0, to: L },
      ],
      stirrups: [{ diameter: 6, legs: 2, spacing: 0.1, id: 'hoops', from: 0, to: L }],
    }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
    for (const reverse of [false, true]) {
      const check = (x: number, vy: number) => checkReviewBeam(geometry, reverse ? mirrorReinforcement(drawing) : drawing, L,
        [{ t: reverse ? 1 - x / L : x / L, n: 0, my: 0, vy, vz: 0, torsion: 0 }], extracted, '2025')
        .find(row => row.demandCategory === 'Vy');
      for (const vy of [-10, 10]) {
        expect(check(2, vy)).toMatchObject({ status: 'ok', description: expect.stringContaining('Concrete-only') });
        expect(check(3.5, vy)).toMatchObject({ status: 'ok', description: expect.stringContaining('Concrete-only') });
        expect.soft(check(5, vy)).toMatchObject({
          status: 'fail', capacity: 0, ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcDrawnCornerSeat',
        });
      }
      expect(check(5, 0)).toBeUndefined();
    }
  });
}

for (const extracted of [false, true]) {
  it(`#2171 concrete-only secondary shear uses the depth to the seated bars (extracted=${extracted})`, () => {
    const L = 6;
    const b = 0.2, h = 0.5, fc = 30, stirrupDia = 6, diameter = 16;
    const { cornerInset, faceInset } = seatedLongitudinalHalfExtents(b, h, 0, stirrupDia, diameter);
    const cover = b / 3 - stirrupDia / 2000 - (cornerInset + faceInset) / 2;
    const geometry = { ...section, b, h, fc, cover, stirrupDia };
    const bar = { count: 2, diameter, row: 0, role: 'main' as const, from: 0, to: L };
    const drawn = membersFromLine({
      version: 1, members: [1], lengths: [L],
      bars: [{ ...bar, id: 'top', face: 'top' }, { ...bar, id: 'bottom', face: 'bottom' }],
      stirrups: [{ diameter: stirrupDia, legs: 2, spacing: 0.1, id: 'hoops', from: 0, to: L }],
    }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
    const actual = b / 2 + seatedLongitudinalHalfExtents(b, h, cover, stirrupDia, diameter).corner.halfAcross;
    const limit = (d: number) => phi * 0.085 * Math.sqrt(fc) * 1000 * h * d;
    const check = (vy: number) => checkReviewBeam(geometry, drawn, L,
      [{ t: 0.5, n: 0, my: 0, vy, vz: 0, torsion: 0 }], extracted, '2025')
      .find(row => row.demandCategory === 'Vy');
    expect(actual).toBeLessThan(2 * b / 3);
    expect(check(limit(actual) * 0.999)).toMatchObject({ status: 'ok', description: expect.stringContaining('Concrete-only') });
    const betweenLimits = (limit(actual) + limit(2 * b / 3)) / 2;
    expect(check(betweenLimits)).toMatchObject({ status: 'fail', ratio: Infinity });
  });
}

for (const nonlinear of [false, true]) {
  it(`#2349 and #2171 drawn joint and lap evidence on solved spatial beams (nonlinear=${nonlinear})`, () => {
    const L = 6;
    const geometry = { ...section, h: 0.37 };
    const element = { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false };
    const structure = {
      ...model,
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }], [3, { id: 3, x: 2 * L, y: 0, z: 0 }]]),
      elements: new Map([[1, { ...element, nodeI: 1, nodeJ: 2 }], [2, { ...element, id: 2, nodeI: 2, nodeJ: 3 }]]),
    };
    const cases = (fy: number, mx: number) => {
      const input: SolverInput3D = { ...structure,
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy, fz: 0, mx, my: 0, mz: 0 } }],
      };
      return computeStationDemands(new Map([[1, nonlinear ? solvePDelta3D(input).results : solve3D(input)]]), combos, structure);
    };
    const ids = [1, 2];
    const members = ids.map(id => ({ id, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }));
    const top = { ...longitudinal, face: 'top' as const, row: 0, role: 'main' as const };
    const bottom = { ...top, id: 'bottom', face: 'bottom' as const, from: 0, to: 2 * L };
    const hoops = [{ ...cage, spacing: 0.06, id: 'hoops', from: 0, to: 2 * L }];
    const layout = (from: number, to: number, stirrups = hoops) => membersFromLine({
      version: 1, members: ids, lengths: [L, L], bars: [
        { ...top, id: 'left', from: 0, to },
        ...(to < 2 * L ? [{ ...top, id: 'right', from, to: 2 * L }] : []),
        bottom,
      ], stirrups,
    }, members);
    const torsion = cases(0, 6), shear = cases(10, 0);
    const lateralGeometry = { ...section, b: 0.2, h: 0.5, fc: 30, stirrupDia: 6 };
    const loose = hoops.map(h => ({ ...h, diameter: 6, legs: 2, spacing: 0.1 }));
    const touching = layout(L, L);
    const continuous = layout(0, 2 * L);
    const lapped = layout(0.9 * L, 1.25 * L, loose);
    const seated = layout(0, 2 * L, loose);
    for (const extracted of [false, true]) {
      const check = (id: number, values: typeof torsion, drawing: typeof touching, geometry: typeof section) =>
        verifyProvidedReinforcement(id, 'beam', drawing.get(id)!, extracted ? values.demands.get(id) : undefined, {}, geometry,
          extracted ? undefined : values.stations.get(id), undefined,
          { axes: { ...axes, bFlex: geometry.b, hFlex: geometry.h }, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } }).checks;
      for (const id of ids) {
        const span = (drawing: typeof touching) => check(id, torsion, drawing, geometry)
          .find(row => row.category === 'Torsion Al Span (Vz)');
        const support = check(id, torsion, touching, geometry).find(row => row.category === 'Torsion Al Support (Vz)');
        expect.soft(support).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcTorsionSplice' });
        expect(span(continuous)).toMatchObject({ status: 'ok' });
      }
      const lateral = (drawing: typeof seated) => check(2, shear, drawing, lateralGeometry).find(row => row.demandCategory === 'Vy');
      expect(lateral(seated)).toMatchObject({ status: 'ok', description: expect.stringContaining('Concrete-only') });
      expect.soft(lateral(lapped)).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcDrawnCornerSeat' });
    }
  });
}


it('#2296 a stirrup gap at the loaded cut is already rejected on main', () => {
  const L = 4;
  const bars = { count: 3, diameter: 16 };
  const hoops = { diameter: 8, legs: 2, spacing: 0.075 };
  const check = (from: number, extracted: boolean) => {
    const provided = membersFromLine({
      version: 1, members: [1], lengths: [L],
      bars: [
        { ...bars, id: 'T', face: 'top', row: 0, role: 'main', from: 0, to: L },
        { ...bars, id: 'B', face: 'bottom', row: 0, role: 'main', from: 0, to: L },
      ],
      stirrups: [{ ...hoops, id: 'S', from, to: L }],
    }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
    return checkReviewBeam(section, provided, L,
      [0, 0.05, 0.1, 1].map(t => ({ t, my: -20, n: 0, vy: 0, vz: t === 0.05 ? 40 : 0, torsion: 0 })),
      extracted, '2025').find(row => row.category === 'Shear Support (Vz)');
  };
  for (const extracted of [false, true]) {
    expect(check(0.4, extracted)).toMatchObject({ demand: 40, stationX: 0.2, status: 'fail', missingReinforcement: true, description: 'diag.rcShearGap' });
    expect(check(0, extracted)).toMatchObject({ demand: 40, status: 'ok' });
  }
});

it('#2355 span shear cannot credit top layers terminated before the loaded cut', () => {
  const L = 4;
  const outer = { count: 3, diameter: 16, row: 0 };
  const inner = { count: 2, diameter: 16, row: 1 };
  const bottom = { count: 3, diameter: 16 };
  const hoops = { diameter: 8, legs: 4, spacing: 0.1 };
  const t = 0.5;
  const check = (extension: number, my: number, extracted: boolean) => {
    const provided: ProvidedReinforcement = {
      stirrups: hoops,
      regions: {
        bottomSpan: bottom,
        topStartGroups: [{ layers: [outer], extensionEnd: extension }, { layers: [inner] }],
        topEndGroups: [{ layers: [outer], extensionStart: extension }, { layers: [inner] }],
      },
    };
    return checkReviewBeam(section, provided, L,
      [0, 0.25, 0.499, t, 0.501, 0.75, 1].map(x => ({ t: x, my, n: 0, vy: 0, vz: x === t ? 429.65 : 0, torsion: 0 })),
      extracted, '2025').find(row => row.category === 'Shear Span (Vz)');
  };
  for (const extracted of [false, true]) {
    expect.soft(check(0.99, -20, extracted)).toMatchObject({ status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck' });
    expect.soft(check(1.01, -20, extracted)).toMatchObject({ capacity: expect.any(Number), status: 'ok' });
    expect.soft(check(0.99, 20, extracted)).toMatchObject({ capacity: expect.any(Number), status: 'ok' });
  }
});

function solvedVerdictBeam(spatial: boolean, nonlinear: boolean, geometry: typeof section, L: number) {
  const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]);
  const element = model.elements.get(1)!;
  const iz = geometry.b * geometry.h ** 3 / 12;
  const a = geometry.b * geometry.h;
  const sec = { ...model.sections.get(1)!, ...geometry, a, iy: iz, iz };
  const solvedModel = { ...model, nodes, sections: new Map([[1, sec]]) };
  const run = (fx: number, fz: number, my: number, load?: { a: number; b: number; q: number }) => {
    if (spatial) {
      const solver: SolverInput3D = {
        ...solvedModel,
        elements: new Map([[1, { ...element, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [
          { type: 'nodal', data: { nodeId: 2, fx, fy: 0, fz, mx: 0, my, mz: 0 } },
          ...(load ? [{ type: 'distributed' as const, data: { elementId: 1, a: load.a, b: load.b, qYI: 0, qYJ: 0, qZI: load.q, qZJ: load.q } }] : []),
        ],
      };
      return nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    }
    const solver: SolverInput = {
      ...solvedModel,
      nodes: new Map([...nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
      elements: new Map([[1, { ...element, hingeStart: false, hingeEnd: false }]]),
      loads: [
        { type: 'nodal', data: { nodeId: 2, fx, fz, my } },
        ...(load ? [{ type: 'distributed' as const, data: { elementId: 1, a: load.a, b: load.b, qI: load.q, qJ: load.q } }] : []),
      ],
    };
    return planarResultForDesign(nonlinear ? solvePDelta(solver).results : solve(solver));
  };
  return { run, solvedModel };
}

for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  const mode = `${spatial ? '3D' : '2D'} ${nonlinear ? 'P-Delta' : 'linear'}`;
  it(`#2213 ${mode} keeps ductility separate from the strength envelope for either bending sign`, () => {
    const geometry = { ...section, h: 0.35, fy: 500 };
    const { run, solvedModel } = solvedVerdictBeam(spatial, nonlinear, geometry, 12);
    const large = { count: 4, diameter: 25 }, small = { count: 2, diameter: 16 };
    const stirrups = { diameter: 8, legs: 2, spacing: 0.1 };
    for (const sign of [-1, 1]) {
      const scenarios = [{ id: 1, name: 'Bending', factors: [] }, { id: 2, name: 'Compression and bending', factors: [] }];
      const { demands, stations } = computeStationDemands(new Map([
        [1, run(0, 0, sign * 50)], [2, run(-263, 0, sign * 170)],
      ]), scenarios, solvedModel);
      const first = stations.get(1)!.comboResults.find(c => c.comboId === 1)!.stations[0]!;
      expect(Math.abs(first.my)).toBeCloseTo(50, 8);
      const top = first.my < 0 ? large : small, bottom = first.my < 0 ? small : large;
      const rowLabel = first.my < 0 ? 'Top Start (My-)' : 'Bottom Span (My+)';
      for (const extracted of [false, true]) {
        const args = [1, 'beam', { top, bottom, stirrups }, extracted ? demands.get(1) : undefined, {}, geometry,
          extracted ? undefined : stations.get(1), undefined, { axes }] as const;
        for (const report of [verifyProvidedReinforcement(...args), rankProvidedReinforcement(...args).ranking]) {
          expect.soft(report.checks.find(row => row.category === rowLabel)?.comboName).toBe('Compression and bending');
          expect.soft(report.checks.find(row => row.category === `${rowLabel} ductility`)).toMatchObject({
            status: 'fail', comboName: 'Bending',
          });
        }
      }
    }
  });

  it(`#2355 ${mode} primary shear refuses a drawn outer-row gap between solved cuts`, () => {
    const L = 4;
    const { run, solvedModel } = solvedVerdictBeam(spatial, nonlinear, section, L);
    const calc = (fz: number) => computeStationDemands(new Map([[1, run(0, fz, 0)]]), combos, solvedModel);
    const isHogging = (result: ReturnType<typeof calc>) => result.stations.get(1)!.comboResults[0]!.stations[0]!.my < 0;
    const up = calc(40);
    const hogging = isHogging(up) ? up : calc(-40);
    expect(isHogging(hogging)).toBe(true);
    const cuts = hogging.stations.get(1)!.stationTs.filter(t => t > 0.25 && t < 0.75);
    const a = cuts[0]! * L, b = cuts[1]! * L;
    const gapStart = (2 * a + b) / 3, gapEnd = (a + 2 * b) / 3;
    const outer = { count: 3, diameter: 16, face: 'top' as const, role: 'main' as const, row: 0 };
    const inner = { ...outer, count: 2, row: 1 };
    const bottom = { ...outer, face: 'bottom' as const };
    const cage = { diameter: 8, legs: 4, spacing: 0.1 };
    const provided = (gap: boolean) => membersFromLine({
      version: 1, members: [1], lengths: [L],
      bars: [
        { ...outer, id: 'outer-start', from: 0, to: gap ? gapStart : L },
        ...(gap ? [{ ...outer, id: 'outer-end', from: gapEnd, to: L }] : []),
        { ...inner, id: 'inner', from: 0, to: L },
        { ...bottom, id: 'bottom', from: 0, to: L },
        { ...inner, face: 'bottom', id: 'bottom-inner', from: 0, to: L },
      ],
      stirrups: [{ ...cage, id: 'cage', from: 0, to: L }],
    }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
    for (const extracted of [false, true]) for (const gap of [false, true]) {
      const args = [1, 'beam', provided(gap), extracted ? hogging.demands.get(1) : undefined, {}, section,
        extracted ? undefined : hogging.stations.get(1), undefined, { axes }] as const;
      for (const report of [verifyProvidedReinforcement(...args), rankProvidedReinforcement(...args).ranking]) {
        const row = report.checks.find(row => row.category === 'Shear Span (Vz)');
        if (gap) {
          expect.soft(row).toMatchObject({ status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcShearCutoff' });
          expect.soft(row?.stationX).toBeGreaterThan(gapStart);
          expect.soft(row?.stationX).toBeLessThan(gapEnd);
        } else {
          expect.soft(row).toMatchObject({ status: 'ok', capacity: expect.any(Number) });
        }
      }
    }
  });
}

for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  it(`#2355 retained outer bars establish hogging shear depth (spatial=${spatial}, nonlinear=${nonlinear})`, () => {
    const L = 4;
    const { run, solvedModel } = solvedVerdictBeam(spatial, nonlinear, section, L);
    const calc = (fz: number) => computeStationDemands(new Map([[1, run(0, fz, 0)]]), combos, solvedModel);
    const up = calc(40);
    const hogging = up.stations.get(1)!.comboResults[0]!.stations[0]!.my < 0 ? up : calc(-40);
    expect(hogging.stations.get(1)!.comboResults[0]!.stations[0]!.my).toBeLessThan(0);
    const outer = { count: 3, diameter: 16, row: 0 };
    const inner = { ...outer, count: 2, row: 1 };
    const bottom = [outer, { ...inner, count: outer.count }];
    const cage = { diameter: 8, legs: 4, spacing: 0.1 };
    const check = (cut: 'inner' | 'outer' | 'both', drawn: boolean, extracted: boolean) => {
      const runs = (layer: typeof outer, isCut: boolean) => isCut ? [
        { ...layer, id: `${layer.row}-start`, from: 0, to: 1.4 },
        { ...layer, id: `${layer.row}-end`, from: 2.6, to: L },
      ] : [{ ...layer, id: `${layer.row}`, from: 0, to: L }];
      const group = (layer: typeof outer, isCut: boolean, end: 'Start' | 'End') => (
        { layers: [layer], ...(isCut ? { [`extension${end}`]: 0.4 } : {}) }
      );
      const outerCut = cut !== 'inner', innerCut = cut !== 'outer';
      const provided: ProvidedReinforcement = drawn ? membersFromLine({
        version: 1, members: [1], lengths: [L],
        bars: [
          ...[...runs(outer, outerCut), ...runs(inner, innerCut)]
            .map(bar => ({ ...bar, face: 'top' as const, role: 'main' as const })),
          ...bottom.map(layer => ({ ...layer, id: `bottom-${layer.row}`, face: 'bottom' as const, role: 'main' as const, from: 0, to: L })),
        ],
        stirrups: [{ ...cage, id: 'cage', from: 0, to: L }],
      }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)! : {
        stirrups: cage,
        regions: {
          bottomSpanLayers: bottom, topStartLayers: [outer, inner], topEndLayers: [outer, inner],
          topStartGroups: [group(outer, outerCut, 'End'), group(inner, innerCut, 'End')],
          topEndGroups: [group(outer, outerCut, 'Start'), group(inner, innerCut, 'Start')],
        },
      };
      const args = [1, 'beam', provided, extracted ? hogging.demands.get(1) : undefined, {}, section,
        extracted ? undefined : hogging.stations.get(1), undefined, { axes }] as const;
      const [id, kind, rebar, ...memberData] = args;
      const prepared = prepareProvidedReinforcementRanker(id, kind, ...memberData);
      return [verifyProvidedReinforcement(...args), rankProvidedReinforcement(...args).ranking, prepared(rebar)]
        .map(report => report.checks.find(row => row.category === 'Shear Span (Vz)'));
    };
    for (const drawn of [false, true]) for (const extracted of [false, true]) {
      for (const supported of check('inner', drawn, extracted)) {
        expect.soft(supported, `drawn=${drawn}, extracted=${extracted}, result=${supported?.description}`).toMatchObject({ status: 'ok', capacity: expect.any(Number) });
      }
      for (const cut of ['outer', 'both'] as const) for (const refused of check(cut, drawn, extracted)) {
        expect.soft(refused).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcShearCutoff' });
      }
    }
  });
}

for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  it(`#2355 row (c) uses the steel present at the hogging span cut (spatial=${spatial}, nonlinear=${nonlinear})`, () => {
    const L = 4;
    const outer = { count: 2, diameter: 16, row: 0 };
    const inner = { ...outer, count: 4, row: 1 };
    const bottom = [{ ...outer, count: 3 }, { ...inner, count: 2 }];
    const hoops = { diameter: 8, legs: 2, spacing: 0.6 };
    const d = section.h - layerCentroid(bottom, section.cover, hoops.diameter);
    const capacity = (layers: typeof bottom) => computeShearCapacity(hoops.diameter, hoops.legs, hoops.spacing,
      section.b, d, section.fc, section.fy, 0,
      { Ag: section.b * section.h, h: section.h, rhoW: layersTotalArea(layers) / (section.b * d * 1e4), edition: '2025' });
    const retained = capacity([outer]), credited = capacity(bottom);
    expect(retained).toMatchObject({ evaluated: true, avBelowMin: true });
    expect(credited).toMatchObject({ evaluated: true, avBelowMin: true });
    expect(retained.phiVn).toBeLessThan(credited.phiVn);
    expect(section.h - layerCentroid([outer, inner], section.cover, hoops.diameter)).toBeLessThan(d);
    expect(section.h - layerCentroid([outer], section.cover, hoops.diameter)).toBeGreaterThan(d);
    const force = (retained.phiVn + credited.phiVn) / 2;
    const { run, solvedModel } = solvedVerdictBeam(spatial, nonlinear, section, L);
    const calc = (fz: number) => computeStationDemands(new Map([[1, run(0, fz, 0)]]), combos, solvedModel);
    const up = calc(force), down = calc(-force);
    const hoggingUp = up.stations.get(1)!.comboResults[0]!.stations[0]!.my < 0;

    const solvedCuts = (hoggingUp ? up : down).stations.get(1)!.stationTs.map(t => t * L);
    expect(solvedCuts.some(x => x > 1.3 && x < 1.5)).toBe(false);

    for (const drawn of [false, true]) for (const extracted of [false, true]) {
      const check = (hogging: boolean, spanForce: number, cut: readonly [number, number]) => {
        const drawnInner = cut[0] === 1 ? inner : { ...inner, count: 1 };
        const input = spanForce === force ? (hogging === hoggingUp ? up : down)
          : calc(hogging === hoggingUp ? spanForce : -spanForce);
        const provided: ProvidedReinforcement = drawn ? membersFromLine({
          version: 1, members: [1], lengths: [L],
          bars: [
            { ...outer, id: 'top', face: 'top', role: 'main', from: 0, to: L },
            { ...drawnInner, id: 'top-start', face: 'top', role: 'main', from: 0, to: cut[0] },
            { ...drawnInner, id: 'top-end', face: 'top', role: 'main', from: cut[1], to: L },
            ...bottom.map(layer => ({ ...layer, id: `bottom-${layer.row}`, face: 'bottom' as const, role: 'main' as const, from: 0, to: L })),
          ],
          stirrups: [{ ...hoops, id: 'stirrups', from: 0, to: L }],
        }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)! : {
          stirrups: hoops,
          regions: {
            bottomSpanLayers: bottom, topStartLayers: [outer, inner], topEndLayers: [outer, inner],
            topStartGroups: [{ layers: [outer] }, { layers: [inner], continueEnd: false }],
            topEndGroups: [{ layers: [outer] }, { layers: [inner], continueStart: false }],
          },
        };
        const args = [1, 'beam', provided, extracted ? input.demands.get(1) : undefined, {}, section,
          extracted ? undefined : input.stations.get(1), undefined, { axes }] as const;
        const [id, kind, rebar, ...memberData] = args;
        return [verifyProvidedReinforcement(...args), rankProvidedReinforcement(...args).ranking,
          prepareProvidedReinforcementRanker(id, kind, ...memberData)(rebar)]
          .map(report => report.checks.find(row => row.category === 'Shear Span (Vz)'));
      };
      for (const [hogging, demand, expected, status] of [
        [true, force, retained, 'fail'],
        [true, retained.phiVn - 1, retained, 'warn'],
        [true, retained.phiVn * 0.9, retained, 'ok'],
        [false, force, credited, 'ok'],
      ] as const) {
        const cutouts = drawn ? [[1, 3], [1.3, 1.5]] as const : [[1, 3]] as const;
        for (const cut of cutouts) {
          const [verified, ...ranked] = check(hogging, demand, cut);
          const context = `drawn=${drawn}, extracted=${extracted}, hogging=${hogging}, demand=${demand}, cut=${cut}`;
          if (drawn && hogging) {
            expect.soft(verified, context).toMatchObject({
              status: 'fail', capacity: 0, ratio: Infinity, description: 'diag.rcShearTensionSteel', limiting: 'unsupportedCheck',
            });
          }
          for (const row of drawn && hogging ? ranked : [verified, ...ranked]) {
            expect.soft(row, context).toMatchObject({ status, capacity: expected.phiVn, ratio: +(demand / expected.phiVn).toFixed(3) });
            if (hogging && cut[0] !== 1) {
              expect.soft(row?.stationX, context).toBeGreaterThan(cut[0]);
              expect.soft(row?.stationX, context).toBeLessThan(cut[1]);
            }
          }
        }
      }
    }
  });
}

const curtailedShearModes = ['station tuples', '2D linear', '2D P-Delta', '3D linear', '3D P-Delta'] as const;

function checkRowCShear(mode: typeof curtailedShearModes[number] | 'continuous layout', curvedTransition = false) {
  const continuous = mode === 'continuous layout';
  const L = 4, left = 0.4, right = 0.6;
  const outer = { count: 2, diameter: 16, row: 0 };
  const inner = { ...outer, count: 4, row: 1 };
  const bottom = [{ ...outer, count: 3 }, { ...inner, count: 2 }];
  const hoops = { diameter: 8, legs: 2, spacing: 0.6 };
  const d = section.h - layerCentroid(bottom, section.cover, hoops.diameter);
  const capacity = (layers: typeof bottom) => computeShearCapacity(hoops.diameter, hoops.legs, hoops.spacing,
    section.b, d, section.fc, section.fy, 0,
    { Ag: section.b * section.h, h: section.h, rhoW: layersTotalArea(layers) / (section.b * d * 1e4), edition: '2025' });
  const retained = capacity([outer]), credited = capacity(bottom);
  expect(retained).toMatchObject({ evaluated: true, avBelowMin: true });
  expect(credited).toMatchObject({ evaluated: true, avBelowMin: true });
  expect(credited.phiVn).toBeGreaterThan(retained.phiVn);
  expect(section.h - layerCentroid([outer, inner], section.cover, hoops.diameter)).toBeLessThan(d);
  expect(section.h - layerCentroid([outer], section.cover, hoops.diameter)).toBeGreaterThan(d);

  const crossingFraction = 0.1;
  const chordFraction = 1 - (1 - crossingFraction) ** 2;
  const lower = retained.phiVn / (1 - crossingFraction);
  const upper = Math.min(credited.phiVn, retained.phiVn / (1 - chordFraction));
  const high = curvedTransition ? lower + 0.25 * (upper - lower)
    : retained.phiVn + 0.48 * (credited.phiVn - retained.phiVn);
  const threshold = -0.001;
  const solver = mode === 'station tuples' || continuous ? undefined
    : solvedVerdictBeam(mode.startsWith('3D'), mode.endsWith('P-Delta'), section, L);
  const solveCuts = (hogging: boolean, force: number) => {
    if (!solver) return;
    const end = 0.5;
    const load = { a: left * L, b: end * L, q: force / ((end - left) * L) };
    const calc = (my: number) => {
      const result = solver.run(0, 0, my, load);
      return { ...computeStationDemands(new Map([[1, result]]), combos, solver.solvedModel), result };
    };
    const at = (value: ReturnType<typeof calc>, t: number) => value.stations.get(1)!.comboResults[0]!.stations.find(s => s.t === t)!;
    let base = calc(0);
    if (at(base, left).my < at(base, end).my) {
      load.q *= -1;
      base = calc(0);
    }
    const ml = at(base, left).my;
    const change = at(calc(1), left).my - ml;
    const drop = ml - at(base, end).my;
    const target = hogging ? (curvedTransition ? threshold + chordFraction * drop : 0.005) : drop + 1;
    return calc((target - ml) / change);
  };
  for (const drawn of [false, true]) for (const extracted of [false, true]) {
    const top = continuous ? [outer] : [outer, inner];
    const provided: ProvidedReinforcement = drawn ? membersFromLine({
      version: 1, members: [1], lengths: [L],
      bars: [
        { ...outer, id: 'top', face: 'top', role: 'main', from: 0, to: L },
        ...(!continuous ? [
          { ...inner, id: 'inner-start', face: 'top' as const, role: 'main' as const, from: 0, to: left * L },
          { ...inner, id: 'inner-end', face: 'top' as const, role: 'main' as const, from: right * L, to: L },
        ] : []),
        ...bottom.map(layer => ({ ...layer, id: `bottom-${layer.row}`, face: 'bottom' as const, role: 'main' as const, from: 0, to: L })),
      ],
      stirrups: [{ ...hoops, id: 'cage', from: 0, to: L }],
    }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)! : {
      stirrups: hoops,
      regions: {
        regionT: 0.25, bottomSpanLayers: bottom, topStartLayers: top, topEndLayers: top,
        ...(!continuous ? {
          topStartGroups: [{ layers: [outer] }, { layers: [inner], extensionEnd: (left - 0.25) * L }],
          topEndGroups: [{ layers: [outer] }, { layers: [inner], extensionStart: (0.75 - right) * L }],
        } : {}),
      },
    };
    for (const [hogging, force] of [[true, high], [true, retained.phiVn * 0.9], [false, high]] as const) {
      const drop = force * (right - left) * L / 2;
      const momentAtLeft = continuous && hogging ? -1
        : hogging && curvedTransition ? threshold + chordFraction * drop : 0.005;
      const momentAtRight = hogging ? (curvedTransition ? momentAtLeft - drop : -1) : 1;
      const stations = [
        { t: 0, my: momentAtLeft, vz: 0 },
        { t: left, my: momentAtLeft, vz: force },
        { t: right, my: momentAtRight, vz: 0 },
        { t: 1, my: momentAtRight, vz: 0 },
      ].map(s => ({ ...s, x: s.t * L, n: 0, mz: 0, vy: 0, torsion: 0 }));
      const solved = solveCuts(hogging, force);
      const layout = solved?.stations.get(1) ?? { elementId: 1, length: L, stationTs: stations.map(s => s.t),
        comboResults: [{ comboId: 1, comboName: 'Review', stations }] };
      const cuts = layout.comboResults[0]!.stations;
      const a = cuts.find(s => s.t === left)!, b = cuts.find(s => s.t > left)!;
      expect(Math.abs(a.vz)).toBeCloseTo(force, 8);
      expect(b.vz).toBeCloseTo(0, 8);
      if (!continuous) expect(a.my).toBeGreaterThan(-0.001);
      if (hogging) expect(b.my).toBeLessThan(-0.001);
      if (hogging && curvedTransition) {
        expect((a.my - threshold) / (a.my - b.my)).toBeCloseTo(chordFraction, 8);
        if (solved) {
          const element = solved.result.elementForces.find(ef => ef.elementId === 1)!;
          const crossing = extractForcesAtStation(element, a.t + crossingFraction * (b.t - a.t));
          expect(crossing.my).toBeCloseTo(threshold, 8);
          expect(Math.abs(crossing.vz)).toBeCloseTo(force * (1 - crossingFraction), 8);
        }
        if (force === high) {
          expect(force * (1 - chordFraction)).toBeLessThan(retained.phiVn);
          expect(force * (1 - crossingFraction)).toBeGreaterThan(retained.phiVn);
          expect(force).toBeLessThan(credited.phiVn);
        }
      }
      const demands = solved?.demands.get(1) ?? extractGoverningDemands(layout);
      const args = [1, 'beam', provided, extracted ? demands : undefined, {}, section,
        extracted ? undefined : layout, undefined, { axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } }] as const;
      const [id, kind, rebar, ...data] = args;
      const reports = [verifyProvidedReinforcement(...args), rankProvidedReinforcement(...args).ranking,
        prepareProvidedReinforcementRanker(id, kind, ...data)(rebar)];
      for (const [index, report] of reports.entries()) {
        const row = report.checks.find(r => r.category === 'Shear Span (Vz)');
        const context = `drawn=${drawn}, extracted=${extracted}, entry=${index}, hogging=${hogging}, row=${JSON.stringify(row)}`;
        if (drawn && hogging && index === 0) {
          expect.soft(row, context).toMatchObject({ status: 'fail', capacity: 0, ratio: Infinity, description: 'diag.rcShearTensionSteel' });
        } else if (hogging && force === high) {
          const fraction = continuous ? 0 : (a.my + 0.001) / (a.my - b.my);
          const demand = curvedTransition
            ? Math.max(Math.abs(a.vz), Math.abs(b.vz)) : Math.abs(a.vz + (b.vz - a.vz) * fraction);
          expect(demand).toBeGreaterThan(retained.phiVn);
          expect.soft(row, context).toMatchObject({
            status: 'fail', demand: +demand.toFixed(2), capacity: retained.phiVn, ratio: +(demand / retained.phiVn).toFixed(3),
          });
          if (!continuous) {
            expect.soft(row?.stationX, context).toBeGreaterThan(left * L);
            expect.soft(row?.stationX, context).toBeLessThan(right * L);
          }
        } else {
          expect.soft(row, context).toMatchObject({ status: 'ok' });
          if (!hogging) expect.soft(row, context).toMatchObject({ demand: +force.toFixed(2), capacity: credited.phiVn });
        }
      }
    }
  }
}

for (const mode of curtailedShearModes) {
  it(`#2355 round 4 row (c) uses the tension steel inside a curtailed interval (${mode})`, () => checkRowCShear(mode));
}

const transitionShear = process.env.RUN_KNOWN_WRONG === '2434' ? it : it.skip;
for (const mode of curtailedShearModes) {
  transitionShear(`known wrong result: #2434 bounds shear when distributed loading curves the hogging transition (${mode})`, () => checkRowCShear(mode, true));
}

const continuousShear = process.env.RUN_KNOWN_WRONG === '2355' ? it : it.skip;
continuousShear('known wrong result: #2355 round 4 row (c) uses the tension steel in a continuous layout', () => checkRowCShear('continuous layout'));

it('#2355 withholds shear when hogging and shear overlap only inside a top-bar gap', () => {
  const L = 4, left = 0.4, right = 0.6;
  const outer = { count: 3, diameter: 16, row: 0, face: 'top' as const, role: 'main' as const };
  const inner = { ...outer, row: 1, count: 2 };
  const hoops = { diameter: 8, legs: 4, spacing: 0.1 };
  const provided = membersFromLine({
    version: 1, members: [1], lengths: [L],
    bars: [
      { ...outer, id: 'start', from: 0, to: left * L },
      { ...outer, id: 'end', from: right * L, to: L },
      { ...inner, id: 'inner', from: 0, to: L },
      { ...outer, face: 'bottom', id: 'bottom', from: 0, to: L },
    ],
    stirrups: [{ ...hoops, id: 'hoops', from: 0, to: L }],
  }, [{ id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }]).get(1)!;
  const check = (overlap: boolean, extracted: boolean) =>
    checkReviewBeam(section, provided, L, [
      { t: 0, my: 20, vz: 0 },
      { t: left, my: 20, vz: 40 },
      ...(!overlap ? [{ t: 0.5, my: 7.5, vz: 0 }] : []),
      { t: right, my: -5, vz: 0 },
      { t: 1, my: -5, vz: 0 },
    ].map(t => ({ ...t, n: 0, vy: 0, torsion: 0 })), extracted, '2025')
      .find(row => row.category === 'Shear Span (Vz)');
  for (const extracted of [false, true]) {
    const refused = check(true, extracted);
    expect(refused).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcShearCutoff' });
    expect(refused?.stationX).toBeGreaterThan(0.5 * L);
    expect(refused?.stationX).toBeLessThan(right * L);
    expect(check(false, extracted)).toMatchObject({ status: 'ok', demand: 40 });
  }
});

it('#2310 active torsion requires resolved secondary geometry and preserves small shear demand', () => {
  const stirrups = { ...cage, spacing: 0.06 };
  const v = input(0.001, 6, '2025');
  const resolved = secondaryShearFace(section, resolveCage(section, stirrups),
    { kind: 'column', diameters: [16], totalAreaCm2: 16.08 });
  const numeric = checkTorsion2025({ ...torsionInput, stirrup: stirrups, demand: v.demand,
    dSecondary: depth(section.b, 8) } as unknown as TorsionInput);
  expect.soft(numeric).toMatchObject({ ratio: Infinity, refusal: 'diag.rcTorsionSecondaryFace' });
  expect.soft(checkTorsion2025({ ...torsionInput, dSecondary: resolved, stirrup: stirrups, demand: v.demand }).refusal).toBeUndefined();
  for (const elementType of ['beam', 'wall'] as const) {
    const fixedInput = { ...v, elementType };
    for (const out of [verifyElement(fixedInput, { shear: stirrups }), prepareElementVerification(fixedInput)({ shear: stirrups })]) {
      expect.soft(out.torsion).toMatchObject({ status: 'fail', refusal: 'diag.rcTorsionSecondaryFace' });
    }
  }
  const reinforcement = { top: longitudinal, bottom: longitudinal, longitudinal, stirrups };
  for (const extracted of [false, true]) {
    for (const elementType of ['beam', 'wall'] as const) {
      const out = provided(reinforcement, elementType, 0.001, 6, { extracted, edition: '2025' });
      expect.soft(out.checks.find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({
        status: 'fail', description: 'diag.rcTorsionSecondaryFace',
      });
      const row = concreteCheckRows(out).find(check => check.title === 'Torsion Span (Vz)')!;
      for (const dictionary of [en, es]) {
        const reason = dictionary['diag.rcTorsionSecondaryFace'];
        expect(renderFicha(row, { tr: key => (dictionary as Record<string, string>)[key] ?? key,
          fmt: (value, decimals) => value.toFixed(decimals), msg: message => message.key })).toContain(reason);
      }
    }
    for (const shaped of [false, true]) {
      const r = { ...reinforcement, shaped: { count: 8, diameter: 16 } };
      const out = provided(r, 'column', 0.001, 0, { extracted, edition: '2025', circular: shaped });
      expect.soft(out.checks.find(row => row.category === 'Ties (Vy)')?.demand).toBe(0.001);
      const below = provided(r, 'column', 0.000999, 0, { extracted, edition: '2025', circular: shaped });
      expect.soft(below.checks.find(row => row.category === 'Ties (Vy)')).toBeUndefined();
    }
  }
});

it('#2369 fixed column area cannot certify longitudinal torsion', () => {
  const stirrups = { diameter: 12, legs: 4, spacing: 0.06 };
  const geometry = { ...section, stirrupDia: stirrups.diameter };
  const torque = 28;
  const demand = { ...input(0, torque, '2025', geometry), demand: declaredTestDemands([{ comboId: 1, comboName: 'C1',
    forces: { t: 0.5, x: 2, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: torque },
  }])[0]!.section('My') };
  const r = { column: { barCount: 8, barDia: 20 }, shear: stirrups, torsion: { AlProv: sizeTorsionReinforcement(geometry, demand.demand, '2025').AlReq } };
  for (const out of [verifyElement(demand, r), prepareElementVerification(demand)(r)]) {
    expect.soft(out.torsion).toMatchObject({ status: 'fail', ratio: Infinity, longitudinalProvision: 'not-checked', refusal: 'diag.rcTorsionPerimeter' });
    expect.soft(out.overallStatus).toBe('fail');
    expect.soft(out.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ message: 'diag.rcTorsionPerimeter' })]));
  }
  const below = input(0, 0.5, '2025', geometry);
  expect(verifyElement(below, r).torsion).toMatchObject({ status: 'ok', neglect: true });
});

it('#2361 fixed column capacity uses the evaluated concrete contribution at a passing torque', () => {
  const shear = { diameter: 12, legs: 4, spacing: 0.045 };
  const geometry = { ...section, stirrupDia: shear.diameter };
  const torque = 42.513343, tension = 180;
  const demand = declaredTestDemands([{ comboId: 1, comboName: 'C1',
    forces: { t: 0.5, x: 2, n: tension, my: 0, mz: 0, vy: 0, vz: 0, torsion: torque } }])[0]!.section('My');
  const v = { ...input(0, torque, '2025', geometry), demand };
  const r = { shear, column: { barCount: 8, barDia: 16 }, torsion: { AlProv: 100 } };
  const inset = 2 * geometry.cover + shear.diameter / 1000;
  const aoh = (geometry.b - inset) * (geometry.h - inset);
  const perimeter = 2 * (geometry.b + geometry.h - 2 * inset);
  const root = Math.sqrt(geometry.fc);
  const concreteStress = 0.17 * root * 1000 - tension / (6 * geometry.b * geometry.h);
  const capacity = phi * (concreteStress + 0.66 * root * 1000) * 1.7 * aoh ** 2 / perimeter;
  for (const row of [verifyElement(v, r).torsion, prepareElementVerification(v)(r).torsion]) {
    expect.soft(row?.phiTn).toBeCloseTo(capacity, 9);
  }
});

it('#2373 evaluated section limit governs pure 2005 torsion', () => {
  const stirrup = { diameter: 12, legs: 4, spacing: 0.045 };
  const d = depth(section.h, stirrup.diameter);
  const inset = 2 * section.cover + stirrup.diameter / 1000;
  const aoh = (section.b - inset) * (section.h - inset);
  const perimeter = 2 * (section.b + section.h - 2 * inset);
  const capacity = (coefficient: number) => phi * (coefficient + 0.66) * Math.sqrt(section.fc) * 1000 * 1.7 * aoh ** 2 / perimeter;
  const check = (torque: number) => checkTorsion2025({
    ...torsionInput, d, stirrupDiaMm: stirrup.diameter, edition: '2005', stirrup, demand: torsionDemand(torque, 0, 0),
  });
  const above = capacity(0.17) * 0.998;
  const below = capacity(1 / 6) * 0.999;
  expect.soft(check(above)).toMatchObject({ ratio: Infinity, refusal: 'diag.rcTorsionConcrete' });
  expect.soft(check(below).refusal).toBeUndefined();
  expect.soft(check(below).sectionRatio).toBeCloseTo(0.999, 12);
  const geometry = { ...section, stirrupDia: stirrup.diameter };
  for (const verify of [verifyElement, (v: ConcurrentVerificationInput, shear: { shear: typeof stirrup }) =>
    prepareElementVerification(v)(shear)]) {
    expect.soft(verify(input(0, above, '2005', geometry), { shear: stirrup }).torsion?.refusal).toBe('diag.rcTorsionConcrete');
    expect.soft(verify(input(0, below, '2005', geometry), { shear: stirrup }).torsion?.phiTn).toBeCloseTo(capacity(1 / 6), 11);
  }
  for (const extracted of [false, true]) {
    const r = { top: longitudinal, bottom: longitudinal, stirrups: stirrup };
    const verify = (torque: number) => provided(r, 'beam', 0, torque, { extracted, geometry, edition: '2005' })
      .checks.find(row => row.category === 'Torsion Span (Vz)');
    expect.soft(verify(above)).toMatchObject({ status: 'fail', description: 'diag.rcTorsionConcrete' });
    expect.soft(verify(below)).toMatchObject({ status: 'warn', ratio: 0.999 });
  }
});

it('#2373 both fixed APIs require perimeter evidence with a fixed cage alone', () => {
  const shear = { ...cage, spacing: 0.06 };
  for (const elementType of ['beam', 'wall'] as const) for (const edition of ['2005', '2025'] as const) {
    const v = { ...input(0, 6, edition), elementType };
    for (const out of [verifyElement(v, { shear }), prepareElementVerification(v)({ shear })]) {
      expect.soft(out.torsion).toMatchObject({ status: 'fail', refusal: 'diag.rcTorsionPerimeter' });
    }
    expect(verifyElement({ ...input(0, 0.5, edition), elementType }, { shear }).torsion).toMatchObject({ neglect: true, status: 'ok' });
  }
});

it('#2373 primary shear checks hogging with nonzero shear between samples', () => {
  const L = 4;
  const outer = { ...longitudinal, row: 0 };
  const inner = { ...longitudinal, row: 1 };
  const reinforcement = { stirrups: { ...cage, spacing: 0.06 },
    regions: { topStartLayers: [outer, inner], topEndLayers: [outer, inner], bottomSpan: longitudinal } };
  for (const extracted of [false, true]) {
    const check = (my: number, vz: number) => checkReviewBeam(section, reinforcement, L, [
      { t: 0.26, n: 0, my, vy: 0, vz: 0, torsion: 0 },
      { t: 0.74, n: 0, my: 20, vy: 0, vz, torsion: 0 },
    ], extracted, '2025').find(row => row.category === 'Shear Span (Vz)');
    expect.soft(check(-20, 40)).toMatchObject({ status: 'fail', description: 'diag.rcShearDepth' });
    expect.soft(check(20, 40)).toMatchObject({ status: 'ok' });
    expect.soft(check(-20, 0)).toBeUndefined();
  }
});

it('#2412 drawn torsion cannot use development across mismatched seats', () => {
  const L = 4;
  const geometry = { ...section, h: 0.37 };
  const element = model.elements.get(1)!;
  const structure = { ...model,
    nodes: new Map([0, L, 2 * L].map((x, i) => [i + 1, { id: i + 1, x, y: 0, z: 0 }])),
    elements: new Map([[1, element], [2, { ...element, id: 2, nodeI: 2, nodeJ: 3 }]]),
  };
  const members = [1, 2].map(id => ({ id, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }));
  const top = { ...longitudinal, face: 'top' as const, row: 0, role: 'main' as const };
  const solver: SolverInput3D = { ...structure,
    elements: new Map([...structure.elements].map(([id, frame]) => [id, { ...frame, releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: 0, fz: 0, mx: 6, my: 0, mz: 0 } }],
  };
  const torques = [6, ...[solve3D(solver), solvePDelta3D(solver).results].map(result => {
    const station = computeStationDemands(new Map([[1, result]]), combos, structure).stations.get(1)!
      .comboResults[0]!.stations.find(station => station.t === 1)!;
    expect(station.torsion).toBeCloseTo(-6, 10);
    return station.torsion;
  })];
  for (const torque of torques) for (const extracted of [false, true]) {
    const check = (diameter: number, torsion = torque) => {
      const drawn = membersFromLine({
        version: 1, members: [1, 2], lengths: [L, L],
        bars: [{ ...top, id: 'top', from: 0, to: 2 * L }, { ...top, id: 'bottom', face: 'bottom', from: 0, to: 2 * L }],
        stirrups: [{ ...cage, spacing: 0.06, id: 'start', from: 0, to: L },
          { ...cage, spacing: 0.06, diameter, id: 'end', from: L, to: 2 * L }],
      }, members).get(1)!;
      return checkReviewBeam(geometry, drawn, L, [{ t: 1, n: 0, my: 0, vy: 0, vz: 0, torsion }], extracted, '2025', structure)
        .find(row => row.category === 'Torsion Al Support (Vz)');
    };
    expect.soft(check(8)).toMatchObject({ status: 'ok' });
    expect.soft(check(10)).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcTorsionSplice' });
    expect.soft(check(10, 0.5)).toBeUndefined();
  }
});

it('#2373 drawn hogging shear cannot credit the sagging steel ratio', () => {
  const L = 4;
  const stirrups = { diameter: 8, legs: 2, spacing: 0.45 };
  const member = { id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 };
  for (const extracted of [false, true]) {
    const check = (count: number) => {
      const drawn = membersFromLine({
        version: 1, members: [1], lengths: [L],
        bars: [{ ...longitudinal, count, id: 'top', face: 'top', row: 0, role: 'main', from: 0, to: L },
          { ...longitudinal, id: 'bottom', face: 'bottom', row: 0, role: 'main', from: 0, to: L }],
        stirrups: [{ ...stirrups, id: 'hoops', from: 0, to: L }],
      }, [member]).get(1)!;
      return checkReviewBeam(section, drawn, L, [{ t: 0.5, n: 0, my: -15, vy: 0, vz: 10, torsion: 0 }], extracted, '2025')
        .find(row => row.category === 'Shear Span (Vz)');
    };
    expect.soft(check(2)).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcShearTensionSteel' });
    expect.soft(check(4)).toMatchObject({ status: 'ok' });
  }
});


it('#2373 drawn hogging shear can verify mixed tension bars across overlapping layouts', () => {
  const L = 4;
  const member = { id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 };
  const specimen = (count: number, row: number, overlap: boolean, diameter = 14, hoopSpacing = 0.45, lap = false) => membersFromLine({
    version: 1, members: [1], lengths: [L],
    bars: [
      { id: 'start', face: 'top', row: 0, count: 2, diameter: 16, role: 'support', from: 0, to: lap ? 0.65 * L : L },
      { id: 'end', face: 'top', row, count, diameter, role: 'support', from: (overlap ? 0.35 : 0.55) * L, to: (lap ? 1 : 0.65) * L },
      { id: 'bottom', face: 'bottom', row: 0, count: 3, diameter: 16, role: 'main', from: 0, to: L },
    ],
    stirrups: [{ id: 'hoops', diameter: 8, legs: 2, spacing: hoopSpacing, from: 0, to: L }],
  }, [member]).get(1)!;

  const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]);
  const structure = { ...model, nodes };
  const element = model.elements.get(1)!;
  const cuts = [{ t: 0.5, n: 0, my: -15, vy: 0, vz: 10, torsion: 0 }];
  for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
    let result: AnalysisResults3D;
    if (spatial) {
      const solver: SolverInput3D = { ...structure,
        elements: new Map([[1, { ...element, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
      };
      result = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    } else {
      const solver: SolverInput = { ...structure,
        elements: new Map([[1, { ...element, hingeStart: false, hingeEnd: false }]]),
        nodes: new Map([...nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
        sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 10, my: 0 } }],
      };
      result = planarResultForDesign(nonlinear ? solvePDelta(solver).results : solve(solver));
    }
    const cut = computeStationDemands(new Map([[1, result]]), combos, structure).stations.get(1)!
      .comboResults[0]!.stations.find(station => station.t === 0.5)!;
    expect(cut.my, `spatial=${spatial}, nonlinear=${nonlinear}`).toBeLessThan(0);
    expect(Math.abs(cut.vz)).toBeCloseTo(10, 9);
    cuts.push(cut);
  }
  for (const cut of cuts) for (const extracted of [false, true]) {
    const check = (r: ProvidedReinforcement) => checkReviewBeam(section, r, L,
      [cut], extracted, '2025')
      .find(row => row.category === 'Shear Span (Vz)');
    expect.soft(check(specimen(2, 0, true))).toMatchObject({ status: 'ok' });
    expect.soft(check(specimen(1, 0, true))).toMatchObject({ status: 'fail', description: 'diag.rcShearTensionSteel' });
    expect.soft(check(specimen(2, 0, false))).toMatchObject({ status: 'fail', description: 'diag.rcShearTensionSteel' });
    expect.soft(check(specimen(2, 1, true))).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcShearDepth' });
    expect.soft(check(specimen(1, 0, true, 16))).toMatchObject({ status: 'ok' });
    expect.soft(check(specimen(2, 0, true, 14, 0.45, true))).toMatchObject({ status: 'fail', description: 'diag.rcShearTensionSteel' });
    expect.soft(check(specimen(1, 0, true, 14, 0.15))).toMatchObject({ status: 'ok' });
  }
});
