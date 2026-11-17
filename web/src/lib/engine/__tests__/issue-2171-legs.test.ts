import { expect, it } from 'vitest';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { prepareElementVerification, verifyElement, REBAR_DB, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { autoVerifyFromResults } from '../auto-verify';
import { computeStationDemands, runCirsocDesign, runUnifiedVerification } from '../verification-service';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { verifyConcurrentElement } from '../concurrent-verification';
import { normalizeCirsoc201 } from '../design-check-results';
import { lineFromMembers, membersFromLine } from '../design/beam-line';
import type { DesignAxes } from '../design/design-axes';
import { computeShearCapacity, verifyProvidedReinforcement } from '../station-design-forces';
import { declaredTestDemands } from './helpers/declared-demands';
import { torsionDemand } from './helpers/manual-interactions';

const section = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const cage = { diameter: 8, spacing: 0.1, legs: 4 };
const fixed = { shear: cage, torsion: { AlProv: 100 } };
type Edition = '2005' | '2025';

function input(vy: number, torsion: number, edition: Edition, s = section, vz = 0): ConcurrentVerificationInput {
  const [demand] = declaredTestDemands([{ comboId: 1, comboName: 'C1',
    forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy, vz, torsion } }]);
  return { ...s, edition, elementId: 1, elementType: 'column', demand: demand!.section('My') };
}

for (const [edition, demand, capacity, ratio] of [
  ['2005', 220.235, 179.19950999999995, 1.229],
  ['2025', 222.18, 181.14201, 1.227],
] as const) {
  it(`#2171 published column witness (${edition})`, () => {
    const v = input(demand, 30, edition);
    for (const out of [verifyElement(v, fixed), prepareElementVerification(v)(fixed)]) {
      const shear = out.shearSecondary!;
      expect({ ratio: +shear.ratio.toFixed(3), status: shear.status, legs: shear.stirrupLegs }).toEqual({ ratio, status: 'fail', legs: 2 });
      expect(shear.phiVn).toBeCloseTo(capacity, 10);
    }
  });
}

for (const [edition, demand] of [['2005', 94.6422855], ['2025', 95.4770355]] as const) {
  it(`#2171 zero-torque silent overall pass (${edition})`, () => {
    const out = verifyElement(input(demand, 0, edition, { ...section, b: 0.2, h: 0.4 }), fixed);
    expect({ overall: out.overallStatus, secondary: out.shearSecondary?.ratio, primary: out.shear.status, flexure: out.flexure.status,
      column: out.column?.status, torsion: out.torsion }).toEqual({
      overall: 'fail', secondary: expect.closeTo(1.05, 12), primary: 'ok', flexure: 'ok', column: 'ok', torsion: undefined,
    });
  });
}

it('#2171 concurrent verification keeps two physical secondary legs', () => {
  const v = input(220.235, 0, '2005');
  const out = verifyConcurrentElement([v]);
  expect(out.shear.stirrupLegs).toBeGreaterThan(2);
  expect(out.shearSecondary?.stirrupLegs).toBe(2);
  expect(out.concurrentChecks![0]!.verification.shearSecondary?.stirrupLegs).toBe(2);
});

it('#2171 four-leg primary answer stays identical with secondary demand', () => {
  const primary = verifyElement(input(0, 0, '2005', section, 100), fixed);
  const biaxial = verifyElement(input(220.235, 0, '2005', section, 100), fixed);
  expect(biaxial.shear).toEqual(primary.shear);
  expect(primary.shear.status).toBe('ok');
  expect(primary.shear.stirrupLegs).toBe(4);
});

it('#2171 a declared secondary crosstie gives three legs', () => {
  const shear = { ...cage, secondaryCrossties: 1 };
  const out = verifyElement(input(220.235, 0, '2005'), { shear });
  const { b, h, cover, fc, fy, stirrupDia } = section;
  const area = REBAR_DB.find(bar => bar.diameter === stirrupDia)!.area;
  const expected = evaluateBeamSection({ edition: '2005', b: h, h: b, d: b - cover - stirrupDia / 1000 - 0.008,
    fc: fc * 1e6, fy: fy * 1e6, fyt: fy * 1e6, Ag: b * h, As: 0, Av: 3 * area * 1e-4, s: cage.spacing, NuCompression: 0 })!;
  expect(out.shearSecondary?.stirrupLegs).toBe(3);
  expect(out.shearSecondary?.phiVn).toBeCloseTo(expected.phiVn / 1000, 10);
});

const axes: DesignAxes = { flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy', bFlex: section.b,
  hFlex: section.h, biaxial: true, sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0 };
const longitudinal = { count: 8, diameter: 16 };
function provided(vy: number, vz: number, stirrups: typeof cage | undefined, shape?: { kind: 'circle'; D: number },
  member: 'column' | 'beam' = 'column', torsion = 0) {
  const stations = [0, 0.5, 1].map(t => ({ t, x: t, n: 0, my: 0, mz: 0, vy, vz, torsion }));
  const reinforcement = member === 'column' ? { longitudinal, stirrups, shaped: longitudinal } : {
    regions: { bottomSpan: longitudinal, topStart: longitudinal, topEnd: longitudinal, stirrupsSpan: stirrups, stirrupsSupport: stirrups },
  };
  return verifyProvidedReinforcement(1, member, reinforcement, undefined, {}, section,
    { elementId: 1, length: 1, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations }] },
    undefined, { axes, shape, spacingRule: { edition: '2005', maxAggregateSizeMm: 0 } });
}

for (const factor of [0.999, 1.001]) {
  it(`#2171 provided column uses two legs across capacity boundary (${factor})`, () => {
    const expected = computeShearCapacity(8, 2, 0.1, section.h, section.b - section.cover - 0.008 - 0.008,
      section.fc, section.fy, 0, { edition: '2005' }).phiVn;
    const row = provided(expected * factor, 0, cage).checks.find(c => c.category === 'Ties (Vy)');
    expect(row).toMatchObject({ capacity: +expected.toFixed(2), ratio: factor, status: factor > 1 ? 'fail' : 'warn' });
  });
}

const unknown = { ...cage, shape: 'unknown' as const };
const missing = { ...cage, secondaryCrossties: null };
const invalid = { ...cage, secondaryCrossties: -1 };
const malformed = { ...cage, spacing: 0 };
for (const [reason, stirrups] of [['unknown shape', unknown], ['missing data', missing], ['invalid count', invalid], ['invalid spacing', malformed]] as const) {
  it(`#2171 refuses unresolved secondary legs (${reason})`, () => {
    const direct = verifyElement(input(40, 0, '2005'), { shear: stirrups });
    const existing = provided(40, 0, stirrups);
    expect(direct.overallStatus).toBe('fail');
    expect(direct.shearSecondary).toBeUndefined();
    expect(direct.diagnostics?.some(d => /secondary.*legs/i.test(d.message))).toBe(true);
    expect(existing.overallStatus).toBe('fail');
    expect(existing.checks.find(c => c.category === 'Ties (Vy)')).toMatchObject({
      limiting: 'unsupportedCheck', status: 'fail', description: expect.stringMatching(/secondary.*legs/i),
    });
  });
}

it('#2171 shaped column refuses secondary capacity and retains primary', () => {
  const shape = { kind: 'circle', D: 0.5 } as const;
  const control = provided(0, 20, cage, shape);
  const out = provided(20, 20, cage, shape);
  expect(out.checks.find(c => c.category === 'Ties (Vz)')).toEqual(control.checks.find(c => c.category === 'Ties (Vz)'));
  expect(out.checks.find(c => c.category === 'Ties (Vy)')).toMatchObject({
    limiting: 'unsupportedCheck', status: 'fail', description: expect.stringMatching(/secondary.*legs/i),
  });
  expect(out.overallStatus).toBe('fail');
});

it('#2171 inactive or absent secondary force retains the primary answer', () => {
  const control = provided(0, 20, cage);
  for (const force of [0, 0.000999]) {
    const out = provided(force, 20, unknown);
    expect(out.checks.find(c => c.category === 'Ties (Vz)')).toEqual(control.checks.find(c => c.category === 'Ties (Vz)'));
    expect(out.checks.find(c => c.category === 'Ties (Vy)')).toBeUndefined();
  }
  expect(provided(20, 0, undefined).checks.find(c => c.category === 'Ties (Vy)')).toMatchObject({ missingReinforcement: true, status: 'fail' });
});

it('#2171 unknown cage is refused at the provided shear threshold', () => {
  expect(provided(0.001, 20, unknown).checks.find(c => c.category === 'Ties (Vy)')).toMatchObject({
    limiting: 'unsupportedCheck', status: 'fail',
  });
});

const torsionInput = { ...section, d: 0.559, dSecondary: 0.259, fyt: section.fy, stirrupDiaMm: cage.diameter };
const twoLegTorsion = checkTorsion2025({ ...torsionInput, stirrup: { ...cage, legs: 2 }, demand: torsionDemand(30, 0, 220.235) });

it('#2171 combined torsion checks the secondary face and one outer leg', () => {
  const out = checkTorsion2025({ ...torsionInput, stirrup: cage, demand: torsionDemand(30, 0, 220.235) });
  expect(out.ratio).toBe(twoLegTorsion.ratio);
  expect(out.outerLegProvided).toBe(twoLegTorsion.outerLegProvided);
  expect(out.transverseProvided).toBe(twoLegTorsion.transverseProvided);
  expect(out.ratio).toBeGreaterThan(1);
});

it('#2171 provided beam torsion credits secondary legs', () => {
  const rows = (legs: number) => provided(220.235, 0, { ...cage, legs }, undefined, 'beam', 30).checks
    .filter(c => c.category.startsWith('Torsion ') && !c.category.startsWith('Torsion Al'));
  expect(rows(4).map(r => r.ratio)).toEqual(rows(2).map(r => r.ratio));
  expect(rows(4)).toHaveLength(2);
});

it('#2171 provided beam refuses torsion with an unknown secondary cage', () => {
  const out = provided(220.235, 0, unknown, undefined, 'beam', 30);
  expect(out.checks.find(c => c.category === 'Torsion Span (Vz)')).toMatchObject({
    status: 'fail', limiting: 'unsupportedCheck', description: expect.stringMatching(/secondary.*legs/i),
  });
});

it('#2171 combined torsion refuses unknown legs above its neglect threshold', () => {
  const { phiTth } = twoLegTorsion;
  const check = (torque: number) => checkTorsion2025({
    ...torsionInput, stirrup: unknown, demand: torsionDemand(torque, 0, 220.235),
  });
  expect(check(phiTth * 0.999)).toMatchObject({ neglect: true, ratio: 0 });
  expect(check(phiTth)).toMatchObject({ neglect: false, ratio: Infinity, secondaryLegsRefusal: expect.stringMatching(/secondary.*legs/i) });
});

it('#2171 wall member torsion uses its secondary shear provision', () => {
  const verify = (legs: number) => verifyElement({ ...input(220.235, 30, '2005'), elementType: 'wall' },
    { ...fixed, shear: { ...cage, legs } });
  const wall = verify(4);
  expect(wall.shearSecondary?.stirrupLegs).toBe(2);
  expect(wall.torsion?.AtOverSProv).toBe(verify(2).torsion?.AtOverSProv);
  expect(wall.torsion?.status).toBe('fail');
});

const model = {
  elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 0.04 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: section.b, h: section.h, a: section.b * section.h,
    iy: section.b * section.h ** 3 / 12, iz: section.h * section.b ** 3 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
};

for (const nonlinear of [false, true]) {
  it(`#2171 3D WASM result entry points (nonlinear=${nonlinear})`, () => {
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 220.235, fz: 0, mx: 0, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const { demands } = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model);
    for (const v of [autoVerifyFromResults(raw, model, null, { edition: '2005' }, demands).concrete[0]!,
      runUnifiedVerification(raw, model, null, demands, { edition: '2005' })[0]!,
      runCirsocDesign(raw, model, demands, new Map(), null, { edition: '2005' }).concrete[0]!]) {
      expect(v.shearSecondary?.stirrupLegs).toBe(2);
      expect(v.shear.stirrupLegs).toBeGreaterThan(2);
    }
  });

  it(`#2171 2D WASM retains primary capacity (nonlinear=${nonlinear})`, () => {
    const solver: SolverInput = { ...model,
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.04, z: 0 }]]),
      sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
      elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 10, my: 20 } }],
    };
    const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
    const ef = raw.elementForces[0]!;
    const v = verifyElement(input(0, 0, '2005', section, Math.abs(ef.vStart)), fixed);
    expect(v.shearSecondary).toBeUndefined();
    expect(v.torsion).toBeUndefined();
    expect(v.shear.phiVn).toBe(verifyElement(input(0, 0, '2005', section, 10), fixed).shear.phiVn);
    expect(v.shear.status).toBe('ok');
    expect(v.shear.stirrupLegs).toBe(4);
  });
}

it('#2171 concurrent summaries hold when the cage shape is unknown', () => {
  const v = input(40, 0, '2005');
  const out = verifyConcurrentElement([{ ...v, rectangularCage: false } as typeof v]);
  expect(out.overallStatus).toBe('fail');
  expect(out.shearSecondary).toBeUndefined();
  expect(out.engineRecheck?.notRechecked).toContain('shear-secondary');
  expect(normalizeCirsoc201([out], new Map())[0]).toMatchObject({
    status: 'held', governingCheck: expect.stringMatching(/secondary.*legs/i),
  });
});

it('#2171 beam-line round trip preserves declared secondary crossties', () => {
  const stirrup = { ...cage, secondaryCrossties: 1 };
  const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0, reinforcement: { stirrups: stirrup } }];
  const regions = membersFromLine(lineFromMembers(members), members).get(1)?.regions;
  expect(regions?.stirrupsSupport).toEqual(stirrup);
  expect(regions?.stirrupsSpan).toEqual(stirrup);
});

it('#2171 a shared support cage cannot credit incompatible end declarations', () => {
  const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }];
  const line = lineFromMembers(members);
  const start = { ...cage, id: 'start', from: 0, to: 1, secondaryCrossties: 1 };
  const end = { ...cage, id: 'end', from: 3, to: 4 };
  const projected = membersFromLine({ ...line, stirrups: [start, end] }, members).get(1)?.regions?.stirrupsSupport;
  expect(projected).toEqual({ ...cage, secondaryCrossties: null });
});
