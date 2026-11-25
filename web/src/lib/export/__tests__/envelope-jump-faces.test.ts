import { beforeAll, beforeEach, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { DEFAULT_AXES } from '../../axes/frame';
import { DIAGRAM_EXTREMA_UNAVAILABLE } from '../../engine/member-diagram';
import { envelopeRows } from '../../engine/result-tables';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { reexpandVariableResults } from '../../engine/variable-member-results';
import { computeEnvelope3D, initSolver } from '../../engine/wasm-solver';
import { modelStore, uiStore } from '../../store';
import { publishCombinations3D } from '../../store/active-results';
import { t } from '../../i18n';
import { engineGuarded } from '../../store/engine-action';
import { currentWorkbookParts, currentWorkbookSheets, streamWorkbookZip } from '../../store/project-workbook';
import { resultSheets, type WorkbookSource } from '../workbook-results';
import { partSize, type WorkbookSheet } from '../workbook-cells';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

const records = (sheet: WorkbookSheet) => sheet.rows.slice(1).map(row =>
  Object.fromEntries(sheet.rows[0]!.map((name, i) => [name, row[i]])));
const onlyEnvelope = { sheets: new Set(['Envelope']), design: false, model: false };

function cantilever(length: number) {
  const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(length, 0, 0);
  modelStore.addSupport(i, 'fixed3d');
  return modelStore.addElement(i, j, 'frame');
}

function twoCombinations() {
  for (const combo of modelStore.combinations) modelStore.removeCombination(combo.id);
  const first = modelStore.addLoadCase('First', 'D');
  const second = modelStore.addLoadCase('Second', 'L');
  const ids = [first, second].map(caseId => modelStore.addCombination(
    'Combination ' + caseId, [{ caseId, factor: 1 }],
  ));
  return { first, second, ids };
}

it.each([['linear', false], ['linear', true], ['pdelta', false], ['pdelta', true]] as const)(
  'known wrong result: #2226 workbook envelopes both faces and names each governing combination (%s, parallel=%s)', async (method, parallel) => {
  const member = cantilever(4);
  const { first, second, ids } = twoCombinations();
  if (method === 'pdelta') modelStore.adoptAnalysis({ perCombination: 'pdelta' });
  const at = 1.25, later = 2.5, force = 8;
  modelStore.addPointLoadOnElement3D(member, at, 0, -force, first);
  modelStore.addPointLoadOnElement3D(member, later, 0, -force / 2, second);
  const solved = parallel ? await modelStore.solveCombinations3DParallel(false, false, true)
    : modelStore.solveCombinations3D(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  if (method === 'pdelta') expect(solved.perCombo.get(ids[0]!)?.secondOrder?.converged).toBe(true);
  publishCombinations3D(solved);
  const result = currentWorkbookSheets('critical', onlyEnvelope).find(sheet => sheet.name === 'Envelope')!;
  const faces = records(result).filter(row => row.entity === member && row['x [m]'] === at && row.component === 'Vz');
  expect(faces.map(row => row.face)).toEqual(['left', 'right']);
  expect([faces[0]!.maxSourceId, faces[0]!.minSourceId].sort()).toEqual(ids);
  expect([faces[1]!.maxSourceId, faces[1]!.minSourceId].sort()).toEqual(ids);
  const governing = faces[0]!.maxSourceId === ids[0] ? 'max' : 'min';
  expect(Math.abs(Number(faces[0]![governing]))).toBeCloseTo(force, 10);
  expect(Math.abs(Number(faces[1]![governing]))).toBeCloseTo(force / 2, 10);
  const parts = currentWorkbookParts('critical', onlyEnvelope);
  const part = parts.find(sheet => sheet.name === 'Envelope')!;
  expect(partSize(part).rows).toBe(result.rows.length);
  const zip = unzipSync(new Uint8Array(await (await streamWorkbookZip(parts)).arrayBuffer()));
  const csv = strFromU8(zip[Object.keys(zip).find(name => name.endsWith('-Envelope.csv'))!]!);
  expect(csv.split('\n').filter(line => line.startsWith('forces,' + member + ',,1.25,Vz,'))).toEqual(
    faces.map(row => result.rows[0]!.map(key => row[key]).join(',')),
  );
});

it('known wrong result: #2226 keeps the two moment faces at a member split', () => {
  const member = cantilever(4);
  const { first, second, ids } = twoCombinations();
  const at = 1.25, moment = 8;
  modelStore.addPointLoadOnElement(member, at, 0, { my: moment, caseId: first });
  modelStore.addPointLoadOnElement(member, 2.5, 0, { my: moment / 2, caseId: second });
  const solved = modelStore.solveCombinations3D(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  publishCombinations3D(solved);
  const sheet = currentWorkbookSheets('critical', onlyEnvelope).find(sheet => sheet.name === 'Envelope')!;
  const faces = records(sheet).filter(row => row.entity === member && row['x [m]'] === at && row.component === 'Mz');
  expect(faces.map(row => row.face)).toEqual(['left', 'right']);
  for (const face of faces) {
    expect([face.maxSourceId, face.minSourceId].sort()).toEqual(ids);
  }
  expect(Math.max(...faces.map(row => Math.abs(Number(row.max) - Number(row.min))))).toBeCloseTo(moment / 2, 10);
  const memberCurve = solved.envelope.momentZ.elements.find(curve => curve.elementId === member)!;
  const cuts = memberCurve.tPositions.flatMap((t, i) => t === at / 4 ? [i] : []);
  expect(cuts).toHaveLength(2);
  expect(cuts.map(i => Math.max(Math.abs(memberCurve.posValues[i]!), Math.abs(memberCurve.negValues[i]!)))).toEqual([
    expect.closeTo(moment, 10), expect.closeTo(moment / 2, 10),
  ]);
});

function solvedMember(length: number): AnalysisResults3D {
  cantilever(length);
  const result = modelStore.solve3D(false, false, true);
  if (!result || typeof result === 'string') throw new Error(String(result));
  return structuredClone(result);
}

it('known wrong result: #2226 keeps distinct nearby stations and exact physical distances in imported result envelopes', () => {
  const a = 1.25, b = a + 2 ** -24;
  const first = solvedMember(3);
  const second = structuredClone(first);
  first.elementForces[0]!.pointLoadsZ = [{ a, p: 8 }];
  second.elementForces[0]!.pointLoadsZ = [{ a: b, p: 4 }];
  const sources: WorkbookSource[] = [first, second].map((results, i) => ({
    id: i + 1, name: String(i + 1), kind: 'combination', results,
  }));
  const rows = records(resultSheets({ sources, stations: 'critical', statics: null }, name => name === 'Envelope')[0]!);
  expect(rows.filter(row => row.component === 'Vz' && (row['x [m]'] === a || row['x [m]'] === b))
    .map(row => [row['x [m]'], row.face, row.max, row.min, row.maxSourceId, row.minSourceId])).toEqual([
    [a, 'left', 0, 0, 1, 1],
    [a, 'right', 8, 0, 1, 2],
    [b, 'left', 8, 0, 1, 2],
    [b, 'right', 8, 4, 1, 2],
  ]);
});

it.skip('known wrong result: #2226 compares every source at the unrounded physical cut', () => {
  const first = solvedMember(3);
  const second = structuredClone(first);
  const a = 0.24999999999999992;
  const slope = 2 ** 54;
  const pieces = (results: AnalysisResults3D) => {
    const force = results.elementForces[0]!;
    const local = { ...force, length: 1 };
    return force.pieces = [0, 1, 2].map(x0 => ({ x0, x1: x0 + 1, forces: { ...local } }));
  };
  pieces(first)[1]!.forces.pointLoadsZ = [{ a, p: 16 }];
  pieces(first)[2]!.forces.vzStart = 16;
  const other = pieces(second)[1]!.forces;
  other.vzStart = 16 - slope / 4;
  other.distributedLoadsZ = [{ a: 0, b: 1, qI: slope, qJ: slope }];
  other.vzEnd = other.vzStart + slope;
  const sources: WorkbookSource[] = [first, second].map((results, i) => ({
    id: i + 1, name: String(i + 1), kind: 'combination', results,
  }));
  const sheet = resultSheets({ sources, stations: 'critical', statics: null }, name => name === 'Envelope')[0]!;
  const rows = records(sheet).filter(row => row.component === 'Vz' && row['x [m]'] === 1 + a);
  expect(rows.map(row => [row.face, row.min, row.minSourceId, row.max, row.maxSourceId])).toEqual([
    ['left', 0, 1, 14.5, 2],
    ['right', 14.5, 2, 16, 1],
  ]);
});

it('known wrong result: #2226 refuses an aliased cross-case jump and accepts the adjacent representable layout', () => {
  const length = 9, a = 7 + 12 * Number.EPSILON;
  const first = solvedMember(length), second = structuredClone(first);
  let b = a + 4 * Number.EPSILON;
  first.elementForces[0]!.pointLoadsZ = [{ a, p: 8 }];
  second.elementForces[0]!.pointLoadsZ = [{ a: b, p: 4 }];
  const sources = [first, second].map((results, i) => ({ id: i + 1, name: String(i + 1), results }));
  const options = { axes: DEFAULT_AXES, stations: 'critical' } as const;
  expect(a / length).toBe(b / length);
  expect(() => envelopeRows('forces', sources, options)).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  expect(engineGuarded(() => envelopeRows('forces', sources, options))).toEqual({
    value: null, error: t(DIAGRAM_EXTREMA_UNAVAILABLE),
  });
  b += 4 * Number.EPSILON;
  second.elementForces[0]!.pointLoadsZ[0]!.a = b;
  expect(envelopeRows('forces', sources, options).filter(row => row.x === b)).toHaveLength(2);
});

it('known wrong result: #2226 rebased WASM envelopes refuse a jump that aliases a split face', () => {
  const member = cantilever(1);
  const { first, ids } = twoCombinations();
  modelStore.addPointLoadOnElement(member, 0.5, 0, { my: 8, caseId: first });
  const solved = modelStore.solveCombinations3D(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  const data = structuredClone(solved.perCombo.get(ids[0]!)!);
  const piece = data.elementForces[0]!.pieces![1]!;
  piece.forces.pointLoadsZ = [{ a: 2 ** -55, p: 8 }];
  const raw = computeEnvelope3D([reexpandVariableResults(data).results])!;
  const curve = raw.shearZ.elements.find(element => element.elementId === piece.forces.elementId)!;
  expect(curve.tPositions.filter(t => t === 2 ** -54)).toHaveLength(2);
  expect(() => computeEnvelope3D([data])).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  piece.forces.pointLoadsZ[0]!.a = 2 ** -52;
  const good = computeEnvelope3D([data])!.shearZ.elements.find(element => element.elementId === member)!;
  expect(good.tPositions.filter(t => t === 0.5 + 2 ** -52)).toHaveLength(2);
});

it('known wrong result: #2226 includes a resultant extremum between component stations in a critical envelope', () => {
  const results = solvedMember(1);
  const force = results.elementForces[0]!;
  force.vyStart = -3;
  force.vyEnd = 5;
  force.vzStart = -7;
  force.vzEnd = 1;
  force.distributedLoadsY = [{ a: 0, b: 1, qI: 8, qJ: 8 }];
  force.distributedLoadsZ = [{ a: 0, b: 1, qI: 8, qJ: 8 }];
  const source = { id: 1, name: 'Control', results };
  const rows = envelopeRows('forces', [source], { axes: DEFAULT_AXES, stations: 'critical', resultant: true });
  const row = rows.find(row => row.x === 5 / 8);
  expect(row?.min[6]).toEqual({ value: Math.hypot(2, -2), source });
});
