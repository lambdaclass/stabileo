import { expect, it } from 'vitest';
import { checkTorsion2025, resolveCage, secondaryShearFace } from '../../codes/cirsoc201/torsion';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { autoVerifyFromResults } from '../auto-verify';
import { checkTorsion, prepareElementVerification, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import type { DesignAxes } from '../design/design-axes';
import { extractGoverningDemands, verifyProvidedReinforcement } from '../station-design-forces';
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

  it(`known wrong result: #2171 fixed beam uses its actual secondary cage (${edition})`, () => {
    const shear = { ...cage, diameter: 10, spacing: 0.1 };
    const d = depth(section.b, shear.diameter);
    const torque = 20;
    const inset = 2 * section.cover + shear.diameter / 1000;
    const ao = 0.85 * (section.b - inset) * (section.h - inset);
    const at = torque / (phi * 2 * ao * steelStress);
    const vcStress = (edition === '2005' ? Math.sqrt(section.fc) / 6 : 0.17 * Math.sqrt(section.fc)) * 1000;
    const capacity = phi * d * (vcStress * section.h + (2 * legArea(shear.diameter) / shear.spacing - 2 * at) * steelStress);
    for (const elementType of ['beam', 'wall'] as const) for (const factor of [0.999, 1.001]) {
      const v = { ...input(capacity * factor, torque, edition), elementType };
      const reinforcement = { ...fixed, ...fixedLongitudinal, shear };
      const atProvided = at + (capacity - capacity * factor) / (phi * d * 2 * steelStress);
      for (const out of [verifyElement(v, reinforcement), prepareElementVerification(v)(reinforcement)]) {
        expect(out.shearSecondary?.d).toBeCloseTo(d, 12);
        expect(out.torsion?.AtOverSProv).toBeCloseTo(atProvided * 1e4, 10);
        expect(out.torsion?.status).toBe(factor > 1 ? 'fail' : 'ok');
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

const torsionInput = { ...section, d: depth(section.h, 8), dSecondary: depth(section.b, 8), fyt: section.fy, stirrupDiaMm: 8 };
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
  const d = depth(s.b, stirrup.diameter);
  const tu = 1.001 * phi * 0.083 * Math.sqrt(s.fc) * 1000 * (s.b * s.h) ** 2 / (2 * (s.b + s.h));
  const inset = 2 * s.cover + stirrup.diameter / 1000;
  const at = tu / (phi * 2 * 0.85 * (s.b - inset) * (s.h - inset) * s.fy * 1000);
  const required = Math.max(2 * at, Math.max(0.062 * Math.sqrt(s.fc), 0.35) * s.h / s.fy);
  const out = checkTorsion2025({ ...s, d: depth(s.h, stirrup.diameter), dSecondary: d, fyt: s.fy,
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
        expect(torsion).toMatchObject({ ratio: +((reserve + 2 * at) / av).toFixed(3), status: factor > 1 ? 'fail' : 'warn' });
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
          reinforcementRatio: expect.closeTo(factor, 12), status: factor > 1 ? 'fail' : 'ok' });
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
      for (const factor of [0.998, 1.002]) {
        const vz = limit * factor;
        const out = provided({ stirrups, longitudinal, bottom: longitudinal }, member, 0, torque, { vz, geometry, extracted });
        expect(out.checks.find(c => c.category === (member === 'column' ? 'Torsion ties' : 'Torsion Span (Vz)')))
          .toMatchObject({ ratio: +(Math.hypot(vz / (section.b * d), vt) / sectionLimit).toFixed(3), status: factor > 1 ? 'fail' : 'warn' });
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
  for (const factor of [0.998, 1.002]) {
    const vy = shearLimit * factor;
    const vv = vy / (section.h * d);
    const check = input(vy, torque, '2005');
    const reinforcement = { ...fixed, shear: stirrups, column: { barCount: 4, barDia: 32 } };
    const phiTn = torque * Math.sqrt(sectionLimit ** 2 - vv ** 2) / vt;
    for (const out of [verifyElement(check, reinforcement), prepareElementVerification(check)(reinforcement)]) {
      expect(out.torsion?.phiTn).toBeCloseTo(phiTn, 10);
      expect(out.torsion?.status).toBe(factor < 1 ? 'ok' : 'fail');
    }
    for (const extracted of [false, true]) {
      const out = provided({ stirrups, longitudinal: { count: 4, diameter: 32 } }, 'column', vy, torque, { extracted });
      expect(out.checks.find(c => c.category === 'Torsion ties')).toMatchObject({
        ratio: +(Math.hypot(vv, vt) / sectionLimit).toFixed(3), status: factor < 1 ? 'warn' : 'fail',
      });
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
        expect.soft(out.torsion?.status).toBe(belowMinimum || factor > 1 ? 'fail' : 'ok');
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
  const face = secondaryShearFace(section, resolveCage(section, declaration), { kind: 'beam-or-wall', diameters: [32] });
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

const issue2225 = process.env.RUN_KNOWN_WRONG === '2225' ? it : it.skip;
issue2225('known wrong result: #2225 active torsion requires the transverse minimum on the wider face', () => {
  const stirrup = { diameter: 6, legs: 2, spacing: 0.15 };
  const minimum = (width: number) => Math.max(0.062 * Math.sqrt(section.fc), 0.35) * width / section.fy;
  const supplied = stirrup.legs * legArea(stirrup.diameter) / stirrup.spacing;
  const check = (spacing: number) => checkTorsion2025({
    ...section, d: 0.561, dSecondary: 0.261, stirrupDiaMm: 6, fyt: section.fy,
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

const issue2310 = process.env.RUN_KNOWN_WRONG === '2310' ? it : it.skip;
issue2310('known wrong result: #2310 fixed torsion limits combined stress using concurrent concrete shear resistance', () => {
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
  expect.soft(result.torsion?.phiTn).toBeCloseTo(torqueCapacity, 9);
  expect.soft(result.torsion?.status).toBe('fail');
});

function verifyBeamStations(
  geometry: typeof section, rebar: ProvidedReinforcement, L: number,
  groups: Array<{ name: string; forces: { n: number; my: number; vz: number; torsion: number } }>,
) {
  const stationTs = [0, 0.5, 1];
  const comboResults = groups.map(({ name, forces }, i) => ({
    comboId: i + 1, comboName: name,
    stations: stationTs.map(t => ({ t, x: t * L, ...forces, mz: 0, vy: 0 })),
  }));
  return verifyProvidedReinforcement(1, 'beam', rebar, undefined, {}, geometry,
    { elementId: 1, length: L, stationTs, comboResults }, undefined,
    { axes: { ...axes, bFlex: geometry.b, hFlex: geometry.h }, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } });
}

const issue2213 = process.env.RUN_KNOWN_WRONG === '2213' ? it : it.skip;
issue2213('known wrong result: #2213 compression in another combination cannot waive the ductility check', () => {
  const geometry = { ...section, h: 0.35, fy: 500 };
  const steel = {
    top: { count: 4, diameter: 25 }, bottom: { count: 2, diameter: 16 },
    stirrups: { diameter: 8, legs: 2, spacing: 0.1 },
  };
  const bending = { name: 'Bending', forces: { n: 0, my: -50, vz: 0, torsion: 0 } };
  const cirsoc201Section9331Threshold = 0.1 * geometry.fc * 1000 * geometry.b * geometry.h;
  const compression = { name: 'Compression', forces: { n: -Math.ceil(cirsoc201Section9331Threshold), my: 0, vz: 0, torsion: 0 } };
  const ductility = (groups: Parameters<typeof verifyBeamStations>[3]) =>
    verifyBeamStations(geometry, steel, 12, groups).checks.filter(row => row.category.includes('ductility'));
  expect(ductility([bending])).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'fail' })]));
  expect(ductility([bending, compression])).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'fail' })]));
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

const issue2214 = process.env.RUN_KNOWN_WRONG === '2214' ? it : it.skip;
issue2214('known wrong result: #2214 concurrent tension requires row 2 stirrup spacing', () => {
  tensionSpacingWitness(450, 210);
});

const issue2271 = process.env.RUN_KNOWN_WRONG === '2271' ? it : it.skip;
issue2271('known wrong result: #2271 the spacing row changes before the uncoupled shear threshold', () => {
  tensionSpacingWitness(450, 208);
});

const issue2296 = process.env.RUN_KNOWN_WRONG === '2296' ? it : it.skip;
issue2296('known wrong result: #2296 primary shear uses the depth of the hogging tension bars', () => {
  const geometry = { ...section, stirrupDia: 12 };
  const bars = { top: { count: 3, diameter: 32 }, bottom: { count: 3, diameter: 16 } };
  const stirrups = { diameter: 12, legs: 2, spacing: 0.16 };
  const vu = 352;
  const d = depth(geometry.h, stirrups.diameter, bars.top.diameter);
  const capacity = phi * d * (0.17 * Math.sqrt(geometry.fc) * 1000 * geometry.b
    + stirrups.legs * 1.131e-4 * geometry.fy * 1000 / stirrups.spacing);
  expect(vu / capacity).toBeGreaterThan(1);
  const result = verifyBeamStations(geometry, { ...bars, stirrups }, 4,
    [{ name: 'Support hogging', forces: { n: 0, my: -20, vz: vu, torsion: 0 } }]);
  const row = result.checks.find(check => check.demandCategory === 'Vz');
  expect.soft(row?.capacity).toBeCloseTo(Number(capacity.toFixed(2)), 10);
  expect.soft(row?.status).toBe('fail');
});

const issue2300 = process.env.RUN_KNOWN_WRONG === '2300' ? it : it.skip;
issue2300('known wrong result: #2300 longitudinal torsion does not count bars beyond their cutoff', () => {
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
  const result = verifyProvidedReinforcement(1, 'beam', reinforcement, undefined, {}, section,
    { elementId: 1, length: L, stationTs, comboResults: [{ comboId: 1, comboName: 'C1', stations }] }, undefined,
    { axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } });
  expect(result.checks.find(row => row.category === 'Torsion Al Span (Vz)')).toMatchObject({ provided: 0, status: 'fail' });
});
