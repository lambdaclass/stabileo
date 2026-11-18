import { expect, it } from 'vitest';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { checkTorsion, prepareElementVerification, verifyElement, REBAR_DB, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
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
import { computeShearCapacity, extractGoverningDemands, verifyProvidedReinforcement } from '../station-design-forces';
import { declaredTestDemands } from './helpers/declared-demands';
import { torsionDemand } from './helpers/manual-interactions';
import { planarResultForDesign } from './helpers/inventory-analysis';

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

const torsionInput = { ...section, rectangularCage: true, d: 0.559, dSecondary: 0.259, fyt: section.fy, stirrupDiaMm: cage.diameter };
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
    expect(Math.abs(ef.vStart)).toBeCloseTo(10, 10);
    const v = verifyElement(input(0, 0, '2005', section, Math.abs(ef.vStart)), fixed);
    expect(v.shearSecondary).toBeUndefined();
    expect(v.torsion).toBeUndefined();
    expect(v.shear.phiVn).toBe(verifyElement(input(0, 0, '2005', section, 10), fixed).shear.phiVn);
    expect(v.shear.status).toBe('ok');
    expect(v.shear.stirrupLegs).toBe(4);
    const spatial = planarResultForDesign(raw);
    const planarModel = { ...model, nodes: new Map([...solver.nodes].map(([id, n]) => [id, { ...n, y: 0 }])) };
    const { demands } = computeStationDemands(new Map([[1, spatial]]), [{ id: 1, name: 'C1', factors: [] }], planarModel);
    const opts = { edition: '2005' as const };
    for (const result of [autoVerifyFromResults(spatial, planarModel, null, opts, demands).concrete[0],
      runUnifiedVerification(spatial, planarModel, null, demands, opts)[0],
      runCirsocDesign(spatial, planarModel, demands, new Map(), null, opts).concrete[0]]) {
      expect(result?.shear.Vu).toBeCloseTo(10, 10);
      expect(result?.shearSecondary).toBeUndefined();
      expect(result?.torsion).toBeUndefined();
      expect(result?.shear.status).toBe('ok');
    }
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

const torque = 20;
const outerLegArea = Math.PI * (0.008 / 2) ** 2;
const atRequired = torque / (0.75 * 2 * 0.85 * 0.242 * 0.542 * 420 * 1000);
const secondaryDepth = 0.259;

for (const [edition, vcStress] of [['2005', 5000 / 6], ['2025', 0.17 * 5000]] as const) {
  for (const factor of [0.999, 1.001]) {
    it(`#2171 beam member checks the secondary torsion face at capacity (${edition}, ${factor})`, () => {
      const shear = { ...cage, spacing: edition === '2025' ? 0.075 : cage.spacing };
      const secondaryVc = vcStress * section.h * secondaryDepth;
      const capacity = 0.75 * (secondaryVc + (2 * outerLegArea / shear.spacing - 2 * atRequired) * 420 * 1000 * secondaryDepth);
      const secondaryDemand = capacity * factor;
      const avRequired = (secondaryDemand / 0.75 - secondaryVc) / (420 * 1000 * secondaryDepth);
      const atProvided = (2 * outerLegArea / shear.spacing - avRequired) / 2;
      const v = { ...input(secondaryDemand, torque, edition), elementType: 'beam' as const };
      const reinforcement = { ...fixed, shear };
      for (const row of [verifyElement(v, reinforcement).torsion, prepareElementVerification(v)(reinforcement).torsion]) {
        expect(row?.AtOverSProv).toBeCloseTo(atProvided * 1e4, 10);
        expect(row?.reinforcementRatio).toBeCloseTo(atRequired / atProvided, 10);
        expect(row?.status).toBe(factor > 1 ? 'fail' : 'ok');
      }
    });
  }

  it(`#2171 beam refuses unknown secondary legs at active torsion (${edition})`, () => {
    const threshold = 0.75 * (0.33 * 5 * (section.b * section.h) ** 2 * 1000 / (2 * (section.b + section.h))) / 4;
    const check = (vy: number, tu: number, shear = { ...cage, secondaryCrossties: null as number | null }) =>
      verifyElement({ ...input(vy, tu, edition), elementType: 'beam' }, { ...fixed, shear });
    expect(check(0, threshold * 1.001).torsion).toMatchObject({ neglect: false, status: 'ok' });
    expect(check(0.001, threshold * 0.999).torsion).toMatchObject({ neglect: true, status: 'ok' });
    expect(check(0.001, threshold * 1.001).torsion).toMatchObject({ neglect: false, status: 'fail', reinforcementRatio: Infinity });
    expect(check(150, 20, { ...cage, secondaryCrossties: 1 }).torsion).toMatchObject({ status: 'ok' });
  });
}

it('#2171 concurrent member cases retain simultaneous secondary shear', () => {
  const demands = declaredTestDemands([0, 150].map((vy, i) => ({ comboId: i + 1, comboName: `C${i + 1}`,
    forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy, vz: 0, torsion: torque } })));
  const inputs = demands.map(demand => ({ ...section, elementId: 1, elementType: 'beam' as const,
    edition: '2025' as const, secondaryCrossties: null, demand: demand.section('My') }));
  const rows = verifyConcurrentElement(inputs).concurrentChecks!.map(c => c.verification.torsion);
  expect(rows[0]).toMatchObject({ neglect: false, longitudinalProvision: 'not-checked' });
  expect(rows[1]).toMatchObject({ neglect: false, status: 'fail', reinforcementRatio: Infinity });
});

for (const [startSpacing, endSpacing] of [[0.1, 0.15], [0.15, 0.1]] as const) {
  for (const factor of [0.999, 1.001]) {
    it(`#2171 projected support checks the actual secondary cage (${startSpacing}, ${factor})`, () => {
      const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0, reinforcement: {
        top: { count: 3, diameter: 16 }, bottom: { count: 3, diameter: 16 },
      } }];
      const stirrup = (spacing: number) => ({ ...cage, legs: spacing === 0.1 ? 2 : 4, spacing });
      const line = { ...lineFromMembers(members), stirrups: [
        { id: 'start', from: 0, to: 1, ...stirrup(startSpacing) },
        { id: 'end', from: 3, to: 4, ...stirrup(endSpacing) },
      ] };
      const vc = 0.17 * 5000 * section.h * secondaryDepth;
      const capacity = 0.75 * (vc + (2 * outerLegArea / 0.15 - 2 * atRequired) * 420 * 1000 * secondaryDepth);
      const vy = capacity * factor;
      const required = (vy / 0.75 - vc) / (420 * 1000 * secondaryDepth) + 2 * atRequired;
      const stationTs = [0, 0.25, 0.5, 0.75, 1];
      const stations = stationTs.map(t => ({ t, x: 4 * t, n: 0, my: 0, mz: 0,
        vy: t === 0 || t === 1 ? vy : 0, vz: 0, torsion: t === 0 || t === 1 ? torque : 0 }));
      const result = verifyProvidedReinforcement(1, 'beam', membersFromLine(line, members).get(1), undefined, {}, section,
        { elementId: 1, length: 4, stationTs, comboResults: [{ comboId: 1, comboName: 'C1', stations }] },
        undefined, { axes });
      const rows = result.checks.filter(c => c.category.startsWith('Torsion Support'));
      const governing = rows.reduce((worst, row) => row.ratio > worst.ratio ? row : worst);
      expect(governing).toMatchObject({ ratio: +(required / (2 * outerLegArea / 0.15)).toFixed(3),
        stationX: endSpacing === 0.15 ? 4 : 0, status: factor > 1 ? 'fail' : 'warn' });
      expect(rows).toHaveLength(2);
    });
  }
}

for (const nonlinear of [false, true]) {
  it(`#2171 spatial beam checks secondary torsion steel through result adapters (nonlinear=${nonlinear})`, () => {
    const beam = { ...model, nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]) };
    const solver: SolverInput3D = { ...beam,
      elements: new Map([[1, { ...beam.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 150, fz: 0, mx: torque, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const { demands } = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], beam);
    const opts = { edition: '2025' as const };
    for (const v of [autoVerifyFromResults(raw, beam, null, opts, demands).concrete[0]!,
      runUnifiedVerification(raw, beam, null, demands, opts)[0]!,
      runCirsocDesign(raw, beam, demands, new Map(), null, opts).concrete[0]!]) {
      expect(v.elementType).toBe('beam');
      const demand = v.concurrentChecks![0]!.demand.section('My');
      expect(demand.Tu).toBeCloseTo(torque, 10);
      expect(demand.VuSecondary).toBeCloseTo(150, 10);
      const avRequired = (150 / 0.75 - 0.17 * 5000 * section.h * secondaryDepth) / (420 * 1000 * secondaryDepth);
      const atProvided = Math.max(0, Math.min(outerLegArea / v.shear.spacing, (2 * outerLegArea / v.shear.spacing - avRequired) / 2));
      expect(v.torsion?.AtOverSProv).toBeCloseTo(atProvided * 1e4, 10);
      expect(v.torsion?.status).toBe('fail');
    }
    const unknownSection = { ...beam, sections: new Map([[1, { ...beam.sections.get(1)!, shape: 'circle' }]]) };
    const held = autoVerifyFromResults(raw, unknownSection, null, opts, demands).concrete[0]!;
    expect(held.torsion).toMatchObject({ status: 'fail', reinforcementRatio: Infinity });
    expect(held.diagnostics?.map(d => d.code)).toContain('VERIF_SECONDARY_STIRRUP_LEGS_UNAVAILABLE');
  });
}

function providedBeamAt(
  provided: Parameters<typeof verifyProvidedReinforcement>[2],
  forces: Parameters<typeof declaredTestDemands>[0][number]['forces'],
  dimensions = section,
) {
  const stations = { elementId: 1, length: 4, stationTs: [forces.t], comboResults: [{ comboId: 1, comboName: 'C1', stations: [forces] }] };
  const verified = [
    verifyProvidedReinforcement(1, 'beam', provided, undefined, {}, dimensions, stations, undefined, { axes }),
    verifyProvidedReinforcement(1, 'beam', provided, extractGoverningDemands(stations), {}, dimensions, undefined, undefined, { axes }),
  ];
  return verified.map(result => result.checks.find(c => c.limiting !== 'unsupportedCheck' && /^Torsion (Support|Span)/.test(c.category))!);
}

const beamBars = { top: { count: 3, diameter: 16 }, bottom: { count: 3, diameter: 16 } };

it('#2171 projected beam torsion uses the zone at each station', () => {
  const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0, reinforcement: beamBars }];
  const strong = { ...cage, legs: 2, spacing: 0.075 };
  const weak = { ...strong, spacing: 0.15 };
  const base = lineFromMembers(members);
  for (const [x, expectedCage, status] of [[0.39, 'weak', 'fail'], [0.4, 'weak', 'fail'], [0.41, 'strong', 'ok'], [0.2, 'gap', 'fail']] as const) {
    const line = { ...base, stirrups: [
      ...(expectedCage === 'gap' ? [] : [{ id: 'near-end', from: 0, to: 0.4, ...weak }]),
      { id: 'rest', from: 0.4, to: 4, ...strong },
    ] };
    const zoneTorque = 30;
    const required = atRequired * zoneTorque / torque;
    const rows = providedBeamAt(membersFromLine(line, members).get(1), { t: x / 4, x, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: zoneTorque });
    for (const row of rows) {
      expect(row).toMatchObject({ stationX: x, status });
      if (expectedCage === 'gap') expect(row).toMatchObject({ ratio: Infinity, missingReinforcement: true });
      else expect(row.ratio).toBe(+(required * (expectedCage === 'weak' ? weak : strong).spacing / outerLegArea).toFixed(3));
    }
  }
});

for (const [atEnd, factor] of [[false, 1.01], [true, 0.99]] as const) {
  it(`#2171 provided beam torsion uses the tension steel and cage depth at the support (${atEnd})`, () => {
    const stir = { diameter: 12, legs: 2, spacing: 0.16 };
    const other = { ...stir, diameter: 8 };
    const top = { count: 3, diameter: 32 };
    const provided = { ...beamBars, regions: { topStart: top, topEnd: top, stirrupsSupport: stir,
      stirrupsBySupport: { atStart: atEnd ? other : stir, atEnd: atEnd ? stir : other } } };
    const tu = 10;
    const d = section.h - section.cover - 0.012 - 0.032 / 2;
    const at = tu / (0.75 * 2 * 0.85 * 0.238 * 0.538 * 420_000);
    const transverse = 2 * Math.PI * (0.012 / 2) ** 2 / stir.spacing;
    const vc = 0.17 * 5000 * section.b * d;
    const vu = 0.75 * (vc + (transverse - 2 * at) * 420_000 * d) * factor;
    const required = (vu / 0.75 - vc) / (420_000 * d) + 2 * at;
    const t = atEnd ? 1 : 0;
    for (const row of providedBeamAt(provided, { t, x: 4 * t, n: 0, my: -20, mz: 0, vy: 0, vz: vu, torsion: tu })) {
      expect(row).toMatchObject({ ratio: +(required / transverse).toFixed(3), status: factor > 1 ? 'fail' : 'warn' });
    }
  });
}

for (const factor of [0.99, 1.01]) {
  it(`#2171 the secondary torsion depth seats the actual corner steel (${factor})`, () => {
    const stirrups = { diameter: 12, legs: 2, spacing: 0.16 };
    const provided = { ...beamBars, top: { count: 3, diameter: 32 }, stirrups };
    const tu = 10;
    const d = section.b - section.cover - 0.012 - 0.032 / 2;
    const at = tu / (0.75 * 2 * 0.85 * 0.238 * 0.538 * 420_000);
    const transverse = 2 * Math.PI * (0.012 / 2) ** 2 / stirrups.spacing;
    const vc = 0.17 * 5000 * section.h * d;
    const vu = 0.75 * (vc + (transverse - 2 * at) * 420_000 * d) * factor;
    const required = (vu / 0.75 - vc) / (420_000 * d) + 2 * at;
    for (const row of providedBeamAt(provided, { t: 0, x: 0, n: 0, my: -20, mz: 0, vy: vu, vz: 0, torsion: tu })) {
      expect(row).toMatchObject({ ratio: +(required / transverse).toFixed(3), status: factor > 1 ? 'fail' : 'warn' });
    }
  });
}

for (const factor of [0.999, 1.001]) {
  it(`#2171 the active secondary torsion face uses its own minimum width (${factor})`, () => {
    const s = { ...section, b: 0.2, h: 0.8 };
    const secondaryMinimum = Math.max(0.062 * Math.sqrt(s.fc), 0.35) * s.h / s.fy;
    const stirrup = { ...cage, legs: 2, spacing: 2 * outerLegArea / secondaryMinimum * factor };
    const tu = 4.1;
    const geometry = { ...s, d: s.h - 0.041, dSecondary: s.b - 0.041, stirrupDiaMm: 8, fyt: s.fy, stirrup, rectangularCage: true };
    const active = checkTorsion2025({ ...geometry, demand: torsionDemand(tu, 0, 1) });
    expect(active.transverseRequired).toBeCloseTo(secondaryMinimum, 12);
    expect(active.ratio).toBeCloseTo(factor, 12);
    const primaryOnly = checkTorsion2025({ ...geometry, demand: torsionDemand(tu, 0) });
    expect(primaryOnly.transverseRequired).toBeCloseTo(secondaryMinimum * s.b / s.h, 12);
    expect(primaryOnly.ratio).toBeLessThan(1);
    for (const row of providedBeamAt({ ...beamBars, stirrups: stirrup }, { t: 0.5, x: 2, n: 0, my: 0, mz: 0, vy: 1, vz: 0, torsion: tu }, s)) {
      expect(row).toMatchObject({ ratio: factor, status: factor > 1 ? 'fail' : 'warn' });
    }
  });
}

for (const nonlinear of [false, true]) {
  it(`#2171 provided spatial beam torsion requires rectangular cage eligibility (nonlinear=${nonlinear})`, () => {
    const beam = { ...model, nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]]) };
    const threshold = 0.75 * 0.083 * Math.sqrt(section.fc) * 1000 * (section.b * section.h) ** 2 / (2 * (section.b + section.h));
    const provided = { ...beamBars, stirrups: { ...cage, legs: 2 } };
    for (const factor of [0.999, 1.001]) {
      const solver: SolverInput3D = { ...beam,
        elements: new Map([[1, { ...beam.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 1, fz: 0, mx: threshold * factor, my: 0, mz: 0 } }],
      };
      const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
      const { demands, stations } = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], beam);
      const demand = demands.get(1)!;
      expect(demand.concurrent![0]!.section('My').VuSecondary).toBeCloseTo(1, 10);
      expect(demand.concurrent![0]!.section('My').Tu).toBeCloseTo(threshold * factor, 10);
      for (const shape of ['circle', 'rect']) {
        const modelData = { ...beam, sections: new Map([[1, { ...beam.sections.get(1)!, shape }]]) };
        const rows = verifyProvidedReinforcement(1, 'beam', provided, demand, {}, section, stations.get(1), modelData, { axes }).checks
          .filter(c => /^Torsion (Support|Span)/.test(c.category));
        if (factor < 1) expect(rows).toHaveLength(0);
        else {
          expect(rows.length).toBeGreaterThan(0);
          for (const row of rows) {
            if (shape === 'circle') expect(row).toMatchObject({ limiting: 'unsupportedCheck', status: 'fail', ratio: Infinity });
            else expect(row).toMatchObject({ limiting: 'torsion', status: 'ok' });
          }
        }
      }
    }
  });
}

const round4Members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0, reinforcement: beamBars }];
const round4Cage = { ...cage, legs: 2, spacing: 0.075 };
const round4Stations = (length: number, torsion: number) => ({
  elementId: 1, length, stationTs: [0, 0.3, 0.7, 1], comboResults: [{ comboId: 1, comboName: 'C1', transverseLoading: { My: false, Mz: false },
    stations: [0, 0.3, 0.7, 1].map(t => ({ t, x: t * length, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion })) }],
});
function round4Checks(rebar: Parameters<typeof verifyProvidedReinforcement>[2], length: number, torsion = 30) {
  const stations = round4Stations(length, torsion);
  return [
    verifyProvidedReinforcement(1, 'beam', rebar, undefined, {}, section, stations, undefined, { axes }),
    verifyProvidedReinforcement(1, 'beam', rebar, extractGoverningDemands(stations), {}, section, undefined, undefined, { axes }),
  ];
}

for (const middle of ['weak', 'gap', 'strong'] as const) {
  it(`#2171 round 4 checks a cage interval between force stations (${middle})`, () => {
    const line = { ...lineFromMembers(round4Members), stirrups: [
      { ...round4Cage, id: 'left', from: 0, to: 1.8 },
      ...(middle === 'gap' ? [] : [{ ...round4Cage, spacing: middle === 'weak' ? 0.15 : round4Cage.spacing, id: 'middle', from: 1.8, to: 2.2 }]),
      { ...round4Cage, id: 'right', from: 2.2, to: 4 },
    ] };
    for (const result of round4Checks(membersFromLine(line, round4Members).get(1), 4)) {
      const rows = result.checks.filter(c => /^Torsion Span/.test(c.category));
      expect(rows).toHaveLength(1);
      if (middle === 'gap') expect(rows[0]).toMatchObject({ status: 'fail', ratio: Infinity, missingReinforcement: true });
      else {
        const required = atRequired * 30 / torque;
        const ratio = +(required * (middle === 'weak' ? 0.15 : round4Cage.spacing) / outerLegArea).toFixed(3);
        expect(rows[0]).toMatchObject({ status: middle === 'weak' ? 'fail' : 'ok', ratio });
      }
    }
  });
}

for (const length of [3.6, 4, 4.4]) {
  it(`#2171 round 4 refuses a zone layout measured on another length (${length})`, () => {
    const line = { ...lineFromMembers(round4Members), stirrups: [{ ...round4Cage, id: 'full', from: 0, to: 4 }] };
    const rebar = membersFromLine(line, round4Members).get(1);
    for (const torsion of [0, 30]) for (const result of round4Checks(rebar, length, torsion)) {
      const refused = result.checks.some(c => c.limiting === 'unsupportedCheck' && c.category === 'check.rc.stirrupZoneGeometry');
      expect(refused).toBe(length !== 4);
      if (length !== 4) expect(result.overallStatus).toBe('fail');
      else expect(result.checks.filter(c => c.limiting === 'torsion' && c.status === 'fail')).toEqual([]);
    }
  });
}

for (const factor of [0.999, 1.001]) {
  it(`#2171 round 4 requires a known closed cage in pure torsion (${factor})`, () => {
    const { b, h, fc, fy, cover } = section;
    const tu = 0.75 * 0.083 * Math.sqrt(fc) * 1000 * (b * h) ** 2 / (2 * (b + h)) * factor;
    const { Tcr } = checkTorsion(section, torsionDemand(tu, 0), '2025');
    const directTorque = 0.75 * Tcr / 4 * factor;
    const v = { ...input(0, directTorque, '2025'), elementType: 'beam' as const };
    for (const shape of ['unknown', 'closedRectangular'] as const) {
      const stirrup = { ...round4Cage, shape };
      const activeRefusal = factor > 1 && shape === 'unknown';
      const check = checkTorsion2025({ ...section, d: h - cover - 0.016, dSecondary: b - cover - 0.016,
        stirrupDiaMm: 8, fyt: fy, demand: torsionDemand(tu, 0), stirrup, rectangularCage: true });
      expect(check.neglect).toBe(factor < 1);
      if (activeRefusal) expect(check).toMatchObject({ ratio: Infinity, outerLegProvided: 0 });
      else expect(check.ratio).toBeLessThan(1);
      const direct = verifyElement(v, { shear: stirrup, torsion: { AlProv: 100 } }).torsion!;
      if (activeRefusal) expect(direct).toMatchObject({ status: 'fail', reinforcementRatio: Infinity });
      else expect(direct.status).toBe('ok');
      for (const result of round4Checks({ ...beamBars, stirrups: stirrup }, 4, tu)) {
        const torsionRows = result.checks.filter(c => /^Torsion (Support|Span)/.test(c.category));
        if (factor < 1) expect(torsionRows).toEqual([]);
        else if (activeRefusal) expect(torsionRows[0]).toMatchObject({ status: 'fail', limiting: 'unsupportedCheck' });
        else expect(torsionRows[0]).toMatchObject({ status: 'ok', limiting: 'torsion' });
      }
    }
  });
}

it('#2171 round 4 holds a zoned torsion check if the concurrent shear between stations is unbounded', () => {
  const line = { ...lineFromMembers(round4Members), stirrups: [
    { ...round4Cage, id: 'left', from: 0, to: 1.8 },
    { ...round4Cage, id: 'middle', diameter: 10, from: 1.8, to: 2.2 },
    { ...round4Cage, id: 'right', from: 2.2, to: 4 },
  ] };
  const rebar = membersFromLine(line, round4Members).get(1);
  const { b, h, fc } = section;
  const threshold = 0.75 * 0.083 * Math.sqrt(fc) * 1000 * (b * h) ** 2 / (2 * (b + h));
  for (const factor of [0.999, 1.001]) {
    const stations = round4Stations(4, threshold * factor);
    stations.comboResults[0]!.transverseLoading.My = true;
    const rows = verifyProvidedReinforcement(1, 'beam', rebar, undefined, {}, section, stations, undefined, { axes }).checks;
    const refusal = rows.find(row => row.category.startsWith('Torsion Span') && row.limiting === 'unsupportedCheck');
    if (factor < 1) expect(refusal).toBeUndefined();
    else expect(refusal).toMatchObject({ status: 'fail', ratio: Infinity, stationX: 1.8 });
  }
});

function zoneAnalysis(nonlinear: boolean, moment = 0) {
  const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]]);
  const beam = { ...model, nodes };
  const solver3D: SolverInput3D = { ...beam,
    elements: new Map([[1, { ...beam.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 30, my: moment, mz: 0 } }],
  };
  const solver2D: SolverInput = { ...beam,
    nodes: new Map([...nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z }])),
    sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
    elements: new Map([[1, { ...beam.elements.get(1)!, hingeStart: false, hingeEnd: false }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 2, my: 0 } }],
  };
  const spatial = nonlinear ? solvePDelta3D(solver3D).results : solve3D(solver3D);
  const planar = planarResultForDesign(nonlinear ? solvePDelta(solver2D).results : solve(solver2D));
  return { beam, spatial, planar };
}

for (const nonlinear of [false, true]) {
  it(`#2171 round 4 verifies saved zones against spatial and planar WASM stations (nonlinear=${nonlinear})`, () => {
    const { beam, spatial, planar } = zoneAnalysis(nonlinear);
    for (const [raw, hasTorsion] of [[spatial, true], [planar, false]] as const) {
      const { demands, stations } = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], beam);
      const line = { ...lineFromMembers(round4Members), stirrups: [
        { ...round4Cage, id: 'left', from: 0, to: 1.65 },
        { ...round4Cage, spacing: 0.15, id: 'middle', from: 1.65, to: 1.95 },
        { ...round4Cage, id: 'right', from: 1.95, to: 4 },
      ] };
      const original = membersFromLine(line, round4Members).get(1)!;
      const zoneRows = (rebar: typeof original) => verifyProvidedReinforcement(1, 'beam', rebar, demands.get(1), {}, section, stations.get(1), beam, { axes }).checks;
      const torsionRows = zoneRows(original).filter(row => row.category.startsWith('Torsion Span'));
      if (hasTorsion) expect(torsionRows[0]).toMatchObject({ status: 'fail', ratio: 1.275, stationX: 1.65 });
      else expect(torsionRows).toEqual([]);
      const stale = { ...original, regions: { ...original.regions, stirrupZones: { ...original.regions!.stirrupZones!, length: 4.2 } } };
      expect(zoneRows(stale)).toContainEqual(expect.objectContaining({ category: 'check.rc.stirrupZoneGeometry', limiting: 'unsupportedCheck', status: 'fail' }));
    }
  });
}

it('#2171 round 4 retains unknown closure through a beam line round trip', () => {
  const stirrup = { ...round4Cage, secondaryCrossties: null, shape: 'closedRectangular' as const };
  const unknown = { ...stirrup, shape: 'unknown' as const };
  const line = { ...lineFromMembers(round4Members), stirrups: [
    { ...stirrup, id: 'closed', from: 0, to: 2 },
    { ...unknown, id: 'unknown', from: 2, to: 4 },
  ] };
  const reinforcement = membersFromLine(line, round4Members).get(1);
  const projected = lineFromMembers([{ ...round4Members[0]!, reinforcement }]);
  expect(projected.stirrups.map(zone => zone.shape)).toEqual(['closedRectangular', 'unknown']);
});

function longitudinalZoneFixture() {
  const bars = { count: 2, diameter: 16 };
  const area = bars.count * Math.PI * (bars.diameter / 2000) ** 2;
  const { b, h, cover, fy } = section;
  const at = (diameter: number) => {
    const x = b - 2 * cover - diameter / 1000, y = h - 2 * cover - diameter / 1000;
    const depth = h - cover - (diameter + bars.diameter / 2) / 1000;
    const halfAl = 30 * (x + y) / (0.75 * 2 * 0.85 * x * y * fy * 1000);
    const momentAtCapacity = (area - halfAl) * 0.9 * fy * 1000 * 0.9 * depth;
    return { halfAl, depth, momentAtCapacity };
  };
  const regular = at(8), thick = at(16);
  const moment = (regular.momentAtCapacity + thick.momentAtCapacity) / 2;
  const ratio = (cage: typeof regular) => (cage.halfAl + moment / (0.9 * fy * 1000 * 0.9 * cage.depth)) / area;
  const rebar = (thickHoops: boolean): ProvidedReinforcement => ({
    top: bars, bottom: bars, stirrups: round4Cage,
    regions: { stirrupZones: { length: 4, startSupportEnd: 1, endSupportStart: 3, zones: [
      { from: 0, to: 1.65, stirrup: round4Cage },
      { from: 1.65, to: 1.95, stirrup: { ...round4Cage, diameter: thickHoops ? 16 : 8 } },
      { from: 1.95, to: 4, stirrup: round4Cage },
    ] } },
  });
  return { moment, rebar, regularRatio: ratio(regular), thickRatio: ratio(thick) };
}

type ZoneTestMode = 'raw' | 'linear' | 'nonlinear';

function expectLongitudinalZoneResult(mode: ZoneTestMode, thickHoops: boolean) {
  const { moment, rebar, regularRatio, thickRatio } = longitudinalZoneFixture();
  expect(regularRatio).toBeLessThan(1);
  expect(thickRatio).toBeGreaterThan(1);
  const analysis = mode === 'raw' ? undefined : zoneAnalysis(mode === 'nonlinear', moment);
  const stationSets = analysis
    ? [analysis.spatial, analysis.planar].map(raw =>
        computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], analysis.beam).stations.get(1)!)
    : [round4Stations(4, 30)];
  if (!analysis) for (const station of stationSets[0]!.comboResults[0]!.stations) station.my = moment;
  for (const [index, stations] of stationSets.entries()) {
    expect(stations.stationTs.every(t => t * 4 < 1.65 || t * 4 > 1.95)).toBe(true);
    for (const useDemands of [false, true]) {
      const { checks } = verifyProvidedReinforcement(1, 'beam', rebar(thickHoops),
        useDemands ? extractGoverningDemands(stations) : undefined, {}, section,
        useDemands ? undefined : stations, analysis?.beam, { axes: { ...axes, biaxial: false } });
      const transverse = checks.filter(row => /^Torsion (Support|Span)/.test(row.category));
      const longitudinal = checks.filter(row => row.category.startsWith('Torsion Al'));
      if (index === 1) {
        expect(transverse).toEqual([]);
        expect(longitudinal).toEqual([]);
        continue;
      }
      expect(transverse.length).toBeGreaterThan(0);
      expect(transverse.every(row => row.status === 'ok')).toBe(true);
      const span = longitudinal.find(row => row.category.startsWith('Torsion Al Span'));
      expect(span).toMatchObject({
        status: thickHoops ? 'fail' : 'warn',
        ratio: +(thickHoops ? thickRatio : regularRatio).toFixed(3),
        ...(thickHoops ? { stationX: 1.65 } : {}),
      });
      expect(checks.filter(row => row.status === 'fail')).toEqual(thickHoops ? [span] : []);
    }
  }
}

for (const mode of ['raw', 'linear', 'nonlinear'] as const) {
  it(`#2171 round 5 longitudinal torsion checks the interior cage (${mode})`, () => {
    expectLongitudinalZoneResult(mode, true);
  });
  it(`#2171 round 5 longitudinal torsion passes with uniform hoops (${mode})`, () => {
    expectLongitudinalZoneResult(mode, false);
  });
}
