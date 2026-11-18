import { expect, it } from 'vitest';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { autoVerifyFromResults } from '../auto-verify';
import { prepareElementVerification, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
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
const phi = 0.75;
const legArea = (diameter: number) => Math.PI * (diameter / 2000) ** 2;
const depth = (h: number, diameter: number) => h - section.cover - diameter / 1000 - 0.008;
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
    const capacity = shearCapacity(edition, section.h, depth(section.b, cage.diameter), cage.diameter, 2, cage.spacing);
    for (const out of [verifyElement(v, fixed), prepareElementVerification(v)(fixed)]) {
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
      const reinforcement = { ...fixed, shear };
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
    const vu = input(0.010001, 0, '2005');
    const small = input(0.01, 0, '2005');
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
  const result = verifyElement(input(expected * 0.8, 0, '2005'), { ...fixed, shear });
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
      expect(shear?.phiVn).toBeCloseTo(shearCapacity('2005', section.h, depth(section.b, 8), 8, 2, shear!.spacing), 10);
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
      [requiredLegs - 1, d / 2 * 0.999, 'fail'],
      [requiredLegs, d / 2 * 1.001, 'fail'],
    ] as const) {
      const stirrups = { ...cage, secondaryLegs, spacing };
      const expected = shearCapacity('2025', width, d, cage.diameter, secondaryLegs, spacing);
      for (const extracted of [false, true]) {
        const out = provided({ stirrups, longitudinal }, member, demand, 0, { edition: '2025', extracted });
        expect(out.checks.find(c => c.demandCategory === 'Vy')).toMatchObject({ capacity: +expected.toFixed(2), status });
      }
      const v = { ...input(demand, 0, '2025'), elementType: member };
      for (const out of [verifyElement(v, { shear: stirrups }), prepareElementVerification(v)({ shear: stirrups })]) {
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
        const out = provided({ stirrups, longitudinal }, member, vu, torque, { edition, compression, extracted });
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
