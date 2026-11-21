import { beforeAll, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore, verificationStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { commitManual } from '../rebar-edit';
import { patchSeismic, runSeismicChecks, seismicComboIds, seismicSettings } from '../seismic-design.svelte';
import { seismicJointCheckRows, seismicMemberCheckRows } from '../../engine/design/check-rows-families';
import { isSolverReady } from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';

const issue2442 = process.env.RUN_KNOWN_WRONG === '2442' ? it : it.skip;

beforeAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(isSolverReady(), 'real WASM solver required').toBe(true);
});

function portal(
  analysis: 'linear' | 'pdelta', geometry: 'planar' | 'spatial',
  scenario: 'covered' | 'gravity' | 'uncombined' | 'partially covered' | 'zero factor',
) {
  modelStore.clear();
  resultsStore.clear();
  verificationStore.clear();
  uiStore.analysisMode = 'pro';
  modelStore.setAnalysis({ perCombination: analysis });
  for (const { id } of [...modelStore.model.combinations]) modelStore.removeCombination(id);
  for (const { id, type } of [...modelStore.model.loadCases]) if (type === 'E') modelStore.removeLoadCase(id);
  const material = modelStore.addMaterial({ name: 'H-30', e: 27500, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const section = modelStore.addSection({ name: 'Rect 40x40 cm', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' });
  const leftBase = modelStore.addNode(0, 0, 0), joint = modelStore.addNode(0, 0, 3);
  const rightBase = modelStore.addNode(6, 0, 0), rightTop = modelStore.addNode(6, 0, 3);
  const member = (a: number, b: number) => {
    const id = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementSection(id, section);
    modelStore.updateElementMaterial(id, material);
    return id;
  };
  const column = member(leftBase, joint), otherColumn = member(rightBase, rightTop), beam = member(joint, rightTop);
  modelStore.addSupport(leftBase, 'fixed3d');
  modelStore.addSupport(rightBase, 'fixed3d');
  if (geometry === 'spatial') {
    const base = modelStore.addNode(0, 4, 0), top = modelStore.addNode(0, 4, 3);
    modelStore.addSupport(base, 'fixed3d');
    member(base, top);
    member(joint, top);
  }
  const dead = modelStore.model.loadCases.find(c => c.type === 'D')!.id;
  const gravity = { caseId: dead, factor: 1 };
  modelStore.addDistributedLoad3D(beam, 0, 0, -15, -15, undefined, undefined, dead, { frame: 'global' });
  modelStore.addCombination('Gravity', [gravity]);
  if (scenario !== 'gravity') {
    const east = modelStore.addLoadCase('Earthquake X', 'E');
    modelStore.addNodalLoad3D(joint, 10, 0, 0, 0, 0, 0, east);
    if (scenario === 'covered' || scenario === 'partially covered') {
      modelStore.addDistributedLoad3D(column, 0, 0, 0, 0, undefined, undefined, east,
        { frame: 'global', qXI: 160, qXJ: 160 });
      modelStore.addCombination('Named earthquake', [gravity, { caseId: east, factor: 1 }]);
      modelStore.addCombination('Reverse earthquake', [gravity, { caseId: east, factor: -0.5 }]);
    }
    if (scenario === 'partially covered') {
      const orphan = modelStore.addLoadCase('Earthquake Y', 'E');
      modelStore.addNodalLoad3D(joint, 0, 10, 0, 0, 0, 0, orphan);
    }
    if (scenario === 'zero factor') modelStore.addCombination('Zero earthquake', [gravity, { caseId: east, factor: 0 }]);
  }
  const solved = modelStore.solveCombinations3D(true, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  expect(solved.unstable ?? []).toEqual([]);
  resultsStore.setCombinationResults3D(solved.perCase, solved.perCombo, solved.envelope);
  const bars = { count: 2, diameter: 16 };
  commitManual(beam, { top: bars, bottom: bars, stirrups: { diameter: 8, legs: 2, spacing: 0.075 } });
  for (const id of [column, otherColumn]) {
    commitManual(id, {
      column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
      stirrups: { diameter: 10, legs: 4, spacing: 0.1 },
    });
  }
  expect(designRunStore.computeDemands().ok).toBe(true);
  const read = () => {
    const report = runSeismicChecks();
    return {
      member: report.members.find(m => m.id === column),
      beam: report.members.find(m => m.id === beam),
      otherColumn: report.members.find(m => m.id === otherColumn),
      joint: report.joints.find(j => j.nodeId === joint && j.direction === 'X'),
      otherJoint: report.joints.find(j => j.nodeId === rightTop && j.direction === 'X'),
    };
  };
  return { column, beam, read };
}

function expectRefusal(result: ReturnType<ReturnType<typeof portal>['read']>, reason: string) {
  expect.soft(result.member, JSON.stringify(result.member)).toMatchObject({ ok: false, refusal: reason, issues: [reason] });
  expect.soft(result.joint, JSON.stringify(result.joint)).toMatchObject({ ok: false, refusal: reason });
  expect.soft(result.member?.shear).toBeUndefined();
  expect.soft(result.joint?.shear).toBeUndefined();
  expect.soft(result.joint?.strongColumn).toBeUndefined();
}

const completeVe = {
  linear: { planar: 367.0741394527806, spatial: 362.153682611077 },
  pdelta: { planar: 367.15801491703706, spatial: 362.2160388171717 },
};

const missingStations = 'seisDes.issue.incompleteStations';
const uncombinedCase = 'seisDes.issue.uncombinedCase';
const noSeismicCombinations = 'seisDes.issue.noSeismicCombinations';

for (const analysis of ['linear', 'pdelta'] as const) for (const geometry of ['planar', 'spatial'] as const) {
  issue2442(`known wrong result: #2442 ${analysis} ${geometry} refuses a named combination with a missing governing station`, () => {
    const { column, read } = portal(analysis, geometry, 'covered');
    const complete = read();
    expect(complete.member?.ok).toBe(true);
    expect(complete.member?.shear?.ve).toBeCloseTo(completeVe[analysis][geometry], 9);
    expect(complete.joint?.ok).toBe(true);
    expect(complete.joint?.shear?.vj).toBeGreaterThan(0);
    const contexts = new Map(verificationStore.contexts);
    const context = contexts.get(column)!;
    const stations = context.stations!;
    const required = seismicComboIds();
    expect(required.size).toBe(2);
    const candidates = stations.comboResults.filter(c => required.has(c.comboId))
      .flatMap(c => c.stations.map(station => ({ comboId: c.comboId, station, shear: Math.hypot(station.vy, station.vz) })))
      .sort((a, b) => b.shear - a.shear);
    const [peak, runnerUp] = candidates;
    expect(peak!.shear).toBeGreaterThan(runnerUp!.shear);
    const comboResults = stations.comboResults.map(c => c.comboId === peak!.comboId
      ? { ...c, stations: c.stations.filter(station => station.t !== peak!.station.t) } : c);
    expect(comboResults.find(c => c.comboId === peak!.comboId)!.stations.length).toBeGreaterThan(0);
    contexts.set(column, { ...context, stations: { ...stations, comboResults } });
    verificationStore.setDemandData(contexts);
    const incomplete = read();
    expectRefusal(incomplete, missingStations);
    expect(incomplete.otherColumn).toEqual(complete.otherColumn);
    expect(incomplete.otherJoint).toEqual(complete.otherJoint);
    verificationStore.setDemandData(new Map(contexts).set(column, context));
    expect(read()).toEqual(complete);
  });

  for (const [scenario, reason] of [
    ['gravity', noSeismicCombinations], ['uncombined', uncombinedCase],
    ['partially covered', uncombinedCase], ['zero factor', uncombinedCase],
  ] as const) {
    issue2442(`known wrong result: #2442 ${analysis} ${geometry} refuses ${scenario} seismic demand`, () => {
      const { column, read } = portal(analysis, geometry, scenario);
      expect(verificationStore.contextFor(column)?.stations?.comboResults.length).toBeGreaterThan(0);
      expect(seismicComboIds().size).toBe(scenario === 'partially covered' ? 2 : 0);
      const result = read();
      expectRefusal(result, reason);
      expect(result.beam).toMatchObject({ ok: false, refusal: reason });
      expect(result.beam?.shear).toBeUndefined();
    });
  }
}

issue2442('known wrong result: #2442 withholds a beam and its joints when a named combination is absent', () => {
  const { beam, read } = portal('linear', 'spatial', 'covered');
  const complete = read();
  expect(complete.beam?.shear?.ve).toBeGreaterThan(0);
  const contexts = new Map(verificationStore.contexts);
  const context = contexts.get(beam)!;
  const stations = context.stations!;
  const missing = [...seismicComboIds()][0];
  for (const comboResults of [
    stations.comboResults.filter(c => c.comboId !== missing),
    stations.comboResults.map(c => c.comboId === missing ? { ...c, stations: [] } : c),
  ]) {
    const changed = { ...context, stations: { ...stations, comboResults } };
    verificationStore.setDemandData(new Map(contexts).set(beam, changed));
    const result = read();
    expect.soft(result.beam).toMatchObject({ ok: false, refusal: missingStations });
    expect.soft(result.joint).toMatchObject({ ok: false, refusal: missingStations });
    expect.soft(result.otherJoint).toMatchObject({ ok: false, refusal: missingStations });
    expect.soft(result.member?.shear).toBeUndefined();
  }
});

issue2442('known wrong result: #2442 refuses soft-storey design when an earthquake case has no combination', () => {
  portal('linear', 'planar', 'uncombined');
  patchSeismic({ softStoreys: { ...seismicSettings().softStoreys, levels: [3] } });
  expect(designRunStore.computeDemands()).toMatchObject({ ok: false, reasonKey: uncombinedCase });
});

issue2442('known wrong result: #2442 publishes refusal rows without numerical seismic assessments', () => {
  const { read } = portal('linear', 'planar', 'gravity');
  const result = read();
  for (const rows of [seismicMemberCheckRows(result.member!), seismicJointCheckRows(result.joint!)]) {
    expect.soft(rows).toEqual([expect.objectContaining({
      status: 'notVerified', titleKey: noSeismicCombinations, inputs: [], ratio: null,
    })]);
  }
});

it('#2442 amplifies a soft storey with complete seismic stations', () => {
  const { column } = portal('linear', 'planar', 'covered');
  const combo = [...seismicComboIds()][0];
  const shear = () => verificationStore.contextFor(column)?.stations?.comboResults.find(c => c.comboId === combo)?.stations[0];
  const original = shear()!;
  expect(Math.hypot(original.vy, original.vz)).toBeGreaterThan(0);
  const settings = seismicSettings().softStoreys;
  patchSeismic({ softStoreys: { ...settings, levels: [3] } });
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(shear()).toMatchObject({ vy: original.vy * settings.shear.column, vz: original.vz * settings.shear.column });
});
