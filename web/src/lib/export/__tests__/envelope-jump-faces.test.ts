import { beforeAll, beforeEach, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { read, utils, write } from 'xlsx';
import { buildExcelWorkbook } from '../excel';
import { DEFAULT_AXES } from '../../axes/frame';
import { computeDiagram3D, evaluateDiagramAt, prepareDiagramEvaluator3D } from '../../engine/diagrams-3d';
import { DIAGRAM_EXTREMA_UNAVAILABLE } from '../../engine/member-diagram';
import { envelopeRows } from '../../engine/result-tables';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { reexpandVariableResults } from '../../engine/variable-member-results';
import { computeEnvelope3D, initSolver } from '../../engine/wasm-solver';
import { modelStore, uiStore } from '../../store';
import { publishCombinations3D } from '../../store/active-results';
import { currentWorkbookParts, currentWorkbookSheets, streamWorkbookZip } from '../../store/project-workbook';
import { resultSheetParts, resultSheets, type WorkbookSource } from '../workbook-results';
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
  expect(faces).toMatchObject([
    { maxSourceId: ids[0], max: expect.closeTo(force, 10), minSourceId: ids[1], min: expect.closeTo(force / 2, 10) },
    { maxSourceId: ids[1], max: expect.closeTo(force / 2, 10), minSourceId: ids[0], min: expect.closeTo(0, 10) },
  ]);
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
  expect(faces).toMatchObject([
    { maxSourceId: ids[1], max: expect.closeTo(-moment / 2, 10), minSourceId: ids[0], min: expect.closeTo(-moment, 10) },
    { maxSourceId: ids[0], max: expect.closeTo(0, 10), minSourceId: ids[1], min: expect.closeTo(-moment / 2, 10) },
  ]);
  expect(Math.max(...faces.map(row => Math.abs(Number(row.max) - Number(row.min))))).toBeCloseTo(moment / 2, 10);
  const memberCurve = solved.envelope.momentZ.elements.find(curve => curve.elementId === member)!;
  const cuts = memberCurve.tPositions.flatMap((t, i) => t === at / 4 ? [i] : []);
  expect(cuts).toHaveLength(2);
  expect(cuts.map(i => [memberCurve.negValues[i], memberCurve.posValues[i]])).toEqual([
    [expect.closeTo(-moment, 10), 0],
    [expect.closeTo(-moment / 2, 10), 0],
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

it.each([false, true])('known wrong result: #2226 compares every source at the unrounded physical cut (split=%s)', async split => {
  const first = solvedMember(3);
  const second = structuredClone(first);
  const a = 0.24999999999999992;
  const slope = 2 ** 54;
  const pieces = (results: AnalysisResults3D) => {
    const force = results.elementForces[0]!;
    const local = { ...force, length: 1 };
    const sectionId = modelStore.elements.get(force.elementId)!.sectionId;
    const result = [0, 1, 2].map(x0 => ({ x0, x1: x0 + 1, sectionId, forces: { ...local } }));
    force.pieces = result;
    return result;
  };
  const firstPieces = pieces(first);
  firstPieces[1]!.forces.pointLoadsZ = [{ a, p: 16 }];
  firstPieces[2]!.forces.vzStart = 16;
  const other = split ? pieces(second)[1]!.forces : second.elementForces[0]!;
  const offset = split ? 0.25 : 1.25;
  other.vzStart = 16 - slope * offset;
  other.distributedLoadsZ = [{ a: 0, b: other.length, qI: slope, qJ: slope }];
  other.vzEnd = other.vzStart + slope * other.length;
  const sources: WorkbookSource[] = [first, second].map((results, i) => ({
    id: i + 1, name: String(i + 1), kind: 'combination', results,
  }));
  const input = { sources, stations: 'critical', statics: null } as const;
  const want = (name: string) => name === 'Envelope';
  const x = 1 + a;
  const sheet = resultSheets(input, want)[0]!;
  const rows = records(sheet).filter(row => row.component === 'Vz' && row['x [m]'] === x);
  const expected = [
    ['left', 0, 1, 14.5, 2],
    ['right', 14.5, 2, 16, 1],
  ];
  expect(rows.map(row => [row.face, row.min, row.minSourceId, row.max, row.maxSourceId])).toEqual(expected);
  const table = envelopeRows('forces', sources, { axes: DEFAULT_AXES, stations: 'critical' });
  expect(table.filter(row => row.x === x).map(({ face, min, max }) =>
    [face, min[2]!.value, min[2]!.source.id, max[2]!.value, max[2]!.source.id])).toEqual(expected);
  const csvPart = resultSheetParts(input, want);
  const zip = unzipSync(new Uint8Array(await (await streamWorkbookZip(csvPart)).arrayBuffer()));
  const csv = strFromU8(zip[Object.keys(zip).find(name => name.endsWith('-Envelope.csv'))!]!);
  const prefix = ['forces', first.elementForces[0]!.elementId, '', x, 'Vz', ''].join(',');
  expect(csv.split('\n').filter(line => line.startsWith(prefix))).toEqual(
    rows.map(row => sheet.rows[0]!.map(key => row[key]).join(',')),
  );
});

it('known wrong result: #2226 refuses an aliased cross-case jump in normalized envelopes and accepts the adjacent representable layout', async () => {
  const length = 9, a = 7 + 12 * Number.EPSILON;
  const first = solvedMember(length), second = structuredClone(first);
  let b = a + 4 * Number.EPSILON;
  first.elementForces[0]!.pointLoadsZ = [{ a, p: 8 }];
  second.elementForces[0]!.pointLoadsZ = [{ a: b, p: 4 }];
  const sources = [first, second].map((results, i) => ({ id: i + 1, name: String(i + 1), results }));
  const options = { axes: DEFAULT_AXES, stations: 'critical' } as const;
  const input = { sources: sources.map(source => ({ ...source, kind: 'combination' as const })), stations: 'critical', statics: null } as const;
  const want = (name: string) => name === 'Envelope';
  expect(a / length).toBe(b / length);
  expect(() => computeEnvelope3D([first, second])).toThrow(/normalized station/i);
  b += 4 * Number.EPSILON;
  second.elementForces[0]!.pointLoadsZ[0]!.a = b;
  expect(computeEnvelope3D([first, second])!.shearZ.globalMax).toBe(8);
  expect(envelopeRows('forces', sources, options).filter(row => row.x === b)).toHaveLength(2);
  expect(records(resultSheets(input, want)[0]!).filter(row => row['x [m]'] === b && row.component === 'Vz')).toHaveLength(2);
  await expect(streamWorkbookZip(resultSheetParts(input, want))).resolves.toBeInstanceOf(Blob);
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


it('known wrong result: #2226 evaluates competing sources at the physical stationary point', async () => {
  const peak = solvedMember(3);
  const other = structuredClone(peak);
  const first = peak.elementForces[0]!;
  const second = other.elementForces[0]!;
  first.vzStart = first.vzEnd = 17 / 8;
  first.distributedLoadsZ = [{ a: 1, b: 2, qI: 3, qJ: -1 }];
  const slope = 2 ** 52;
  second.vzStart = 4 - slope / 4;
  second.vzEnd = 4 + 3 * slope / 4;
  second.distributedLoadsZ = [{ a: 1.5, b: 2.5, qI: slope, qJ: slope }];
  const sources: WorkbookSource[] = [peak, other].map((results, i) => ({
    id: i + 1, name: String(i + 1), kind: 'combination', results,
  }));
  const input = { sources, stations: 'critical', statics: null } as const;
  const want = (name: string) => name === 'Envelope';
  const at = 1.75;
  const table = envelopeRows('forces', sources, { axes: DEFAULT_AXES, stations: 'critical' });
  const row = table.find(row => row.x === at);
  expect.soft(row?.min[2]).toEqual({ value: 13 / 4, source: sources[0] });
  expect.soft(row?.max[2]).toEqual({ value: 4, source: sources[1] });
  const sheet = resultSheets(input, want)[0]!;
  const workbookRow = records(sheet).find(row => row.component === 'Vz' && row['x [m]'] === at);
  expect.soft(workbookRow).toMatchObject({ min: 13 / 4, minSourceId: 1, max: 4, maxSourceId: 2 });
  const zip = unzipSync(new Uint8Array(await (await streamWorkbookZip(resultSheetParts(input, want))).arrayBuffer()));
  const csv = strFromU8(zip[Object.keys(zip).find(name => name.endsWith('-Envelope.csv'))!]!);
  const prefix = ['forces', first.elementId, '', at, 'Vz', ''].join(',');
  expect(csv.split('\n').filter(line => line.startsWith(prefix))).toEqual([
    ['forces', first.elementId, '', at, 'Vz', 'kN', 4, 2, '2', 13 / 4, 1, '1', '', 0].join(','),
  ]);
});

it.each(['linear', 'pdelta'] as const)('known wrong result: #2226 rebasing keeps adjacent normalized cuts (%s)', async method => {
  const member = cantilever(3);
  const { first, ids } = twoCombinations();
  if (method === 'pdelta') modelStore.adoptAnalysis({ perCombination: 'pdelta' });
  for (const at of [1, 2]) modelStore.addPointLoadOnElement(member, at, 0, { my: 8, caseId: first });
  const solved = await modelStore.solveCombinations3DParallel(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  const data = structuredClone(solved.perCombo.get(ids[0]!)!);
  if (method === 'pdelta') expect(data.secondOrder?.converged).toBe(true);
  const force = data.elementForces[0]!;
  const piece = force.pieces!.find(piece => piece.x0 === 1)!;
  const tA = 0.41666666666666663, tB = 1.25 / 3;
  piece.forces.pointLoadsZ = [{ a: 0.24999999999999992, p: 8 }, { a: 0.25, p: 4 }];
  const raw = computeEnvelope3D([reexpandVariableResults(data).results])!;
  const rawPiece = raw.shearZ.elements.find(element => element.elementId === piece.forces.elementId)!;
  expect.soft(rawPiece.criticalStations?.filter(station => station.x === 0.24999999999999992 || station.x === 0.25)).toHaveLength(4);
  expect.soft(() => {
    const rebased = computeEnvelope3D([data])!.shearZ.elements.find(element => element.elementId === member)!;
    expect(rebased.tPositions.flatMap((t, i) => t === tA || t === tB ? [[t, rebased.negValues[i], rebased.posValues[i]]] : [])).toEqual([
      [tA, 0, 0], [tA, 0, 8], [tB, 0, 8], [tB, 0, 12],
    ]);
    expect(rebased.criticalStations!.filter(station => station.right && station.x === 1.25)
      .map(station => station.xResidual)).toEqual([-3 * 2 ** -55, 0]);
  }).not.toThrow();
  expect.soft(() => {
    const at = prepareDiagramEvaluator3D(force, 'shearZ');
    const faces = [[tA, false, 0], [tA, true, 8], [tB, false, 8], [tB, true, 12]] as const;
    for (const [t, right, value] of faces) {
      expect(evaluateDiagramAt(force, 'shearZ', t, right)).toBe(value);
      expect(at(t, right)).toBe(value);
    }
    const diagram = computeDiagram3D(force, 'shearZ');
    expect(diagram.points.filter(point => point.t === tA || point.t === tB).map(point =>
      [point.t, !!point.right, point.value])).toEqual(faces);
  }).not.toThrow();
  const sources: WorkbookSource[] = [{ id: 1, name: '1', kind: 'combination', results: data }];
  const input = { sources, stations: 'critical', statics: null } as const;
  const want = (name: string) => name === 'Envelope';
  const sheet = resultSheets(input, want)[0]!;
  const rows = records(sheet).filter(row => row.component === 'Vz' && row['x [m]'] === 1.25);
  expect(rows.map(row => [row.face, row.min, row.max])).toEqual([
    ['left', 0, 0], ['right', 8, 8], ['left', 8, 8], ['right', 12, 12],
  ]);
  const zip = unzipSync(new Uint8Array(await (await streamWorkbookZip(resultSheetParts(input, want))).arrayBuffer()));
  const csv = strFromU8(zip[Object.keys(zip).find(name => name.endsWith('-Envelope.csv'))!]!);
  expect(csv.split('\n').filter(line => line.startsWith('forces,' + member + ',,1.25,Vz,'))).toEqual(
    rows.map(row => sheet.rows[0]!.map(key => row[key]).join(',')),
  );
  piece.forces.pointLoadsZ[1]!.a = 0.25 - 2 ** -55;
  expect(() => computeEnvelope3D([data])).toThrow(DIAGRAM_EXTREMA_UNAVAILABLE);
  const aliased = resultSheets(input, want)[0]!;
  const expected = [
    [-3 * 2 ** -55, 'left', 0, 0], [-3 * 2 ** -55, 'right', 8, 8],
    [-(2 ** -55), 'left', 8, 8], [-(2 ** -55), 'right', 12, 12],
  ];
  const atAlias = records(aliased).filter(row => row.component === 'Vz' && row['x [m]'] === 1.25);
  expect(atAlias.map(row => [row['x residual [m]'], row.face, row.min, row.max])).toEqual(expected);
  const aliasedZip = unzipSync(new Uint8Array(await (await streamWorkbookZip(resultSheetParts(input, want))).arrayBuffer()));
  const aliasedCsv = strFromU8(aliasedZip[Object.keys(aliasedZip).find(name => name.endsWith('-Envelope.csv'))!]!);
  expect(aliasedCsv.split('\n').filter(line => line.startsWith('forces,' + member + ',,1.25,Vz,'))).toEqual(
    atAlias.map(row => aliased.rows[0]!.map(key => row[key]).join(',')),
  );
});

it.each(['linear', 'pdelta'] as const)('known wrong result: #2226 identifies the same-metre cuts in tables, XLSX and CSV (%s)', async method => {
  const member = cantilever(3);
  const { first, ids } = twoCombinations();
  if (method === 'pdelta') modelStore.adoptAnalysis({ perCombination: 'pdelta' });
  for (const at of [1, 2]) modelStore.addPointLoadOnElement(member, at, 0, { my: 8, caseId: first });
  const solved = await modelStore.solveCombinations3DParallel(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  const results = structuredClone(solved.perCombo.get(ids[0]!)!);
  const piece = results.elementForces[0]!.pieces!.find(piece => piece.x0 === 1)!;
  piece.forces.pointLoadsZ = [{ a: 0.24999999999999992, p: 8 }, { a: 0.25, p: 4 }];
  const sources: WorkbookSource[] = [{ id: 1, name: '1', kind: 'combination', results }];
  const input = { sources, stations: 'critical', statics: null } as const;
  const want = (name: string) => name === 'Envelope';
  const expected = [[-3 * 2 ** -55, 8, 8], [0, 12, 12]];
  const rows = envelopeRows('forces', sources, { axes: DEFAULT_AXES, stations: 'critical' });
  expect.soft(rows.filter(row => row.x === 1.25 && row.face === 'right').map(row =>
    [row.xResidual, row.min[2]!.value, row.max[2]!.value])).toEqual(expected);

  const workbook = await buildExcelWorkbook({ onlyExtras: true, extraSheets: resultSheets(input, want), provenance: false });
  const file = read(write(workbook!, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
  const xlsxRows = utils.sheet_to_json<Record<string, string | number>>(file.Sheets.Envelope!);
  const cuts = (rows: Record<string, string | number>[]) => rows.filter(row =>
    Number(row['x [m]']) === 1.25 && row.component === 'Vz' && row.face === 'right');
  expect.soft(cuts(xlsxRows).map(row => [row['x residual [m]'], row.min, row.max])).toEqual(expected);

  const zip = unzipSync(new Uint8Array(await (await streamWorkbookZip(resultSheetParts(input, want))).arrayBuffer()));
  const csv = strFromU8(zip[Object.keys(zip).find(name => name.endsWith('-Envelope.csv'))!]!);
  const header = csv.split('\n')[0]!.split(',');
  const csvRows = csv.split('\n').slice(1).map(line => Object.fromEntries(line.split(',').map((value, i) => [header[i], value])));
  expect.soft(cuts(csvRows).map(row => [row['x residual [m]'], row.min, row.max])).toEqual(
    expected.map(row => row.map(String)),
  );
});

it('known wrong result: #2226 carries both words of local and rebased WASM envelope stations', () => {
  const member = cantilever(3);
  const { first, ids } = twoCombinations();
  for (const x of [1, 2]) modelStore.addPointLoadOnElement(member, x, 0, { my: 8, caseId: first });
  const solved = modelStore.solveCombinations3D(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  const data = structuredClone(solved.perCombo.get(ids[0]!)!);
  const piece = data.elementForces[0]!.pieces!.find(piece => piece.x0 === 1)!;
  const a = 0.25 + 2 ** -53;
  piece.forces.distributedLoadsZ = [{ a: a - 0.125, b: a + 0.375, qI: 1, qJ: -3 + 2 ** -50 }];
  piece.forces.pointLoadsZ = [{ a: 0.75, p: 8 }];
  const raw = computeEnvelope3D([reexpandVariableResults(data).results])!.shearZ.elements.find(e => e.elementId === piece.forces.elementId)!;
  const rawStations = raw.criticalStations!;
  expect.soft(rawStations.find(s => s.x === a && s.xResidual !== 0)?.xResidual).toBe(2 ** -55);
  const rebased = computeEnvelope3D([data])!.shearZ.elements.find(e => e.elementId === member)!;
  const rebasedStations = rebased.criticalStations!;
  expect.soft(rebasedStations.find(s => s.x === 1.25 + 2 ** -52)?.xResidual).toBe(-3 * 2 ** -55);
  expect.soft(rebasedStations.filter(s => s.x === 1.75).map(s => [s.right, s.xResidual])).toEqual([[false, 0], [true, 0]]);
});

it('known wrong result: #2226 exports two physical events that share one normalized coordinate', async () => {
  const length = 9, a = 7 + 12 * Number.EPSILON, b = a + 4 * Number.EPSILON;
  const left = solvedMember(length), right = structuredClone(left);
  left.elementForces[0]!.pointLoadsZ = [{ a, p: 8 }];
  right.elementForces[0]!.pointLoadsZ = [{ a: b, p: 4 }];
  const sources: WorkbookSource[] = [left, right].map((results, i) => ({
    id: i + 1, name: String(i + 1), kind: 'combination', results,
  }));
  const input = { sources, stations: 'critical', statics: null } as const;
  const want = (name: string) => name === 'Envelope';
  expect(a / length).toBe(b / length);
  const rows = [[a, 'left', 0, 0], [a, 'right', 0, 8], [b, 'left', 0, 8], [b, 'right', 4, 8]];
  const table = envelopeRows('forces', sources, { axes: DEFAULT_AXES, stations: 'critical' });
  expect.soft(table.filter(row => row.x === a || row.x === b).map(row =>
    [row.x, row.face, row.min[2]!.value, row.max[2]!.value])).toEqual(rows);
  const workbook = await buildExcelWorkbook({ onlyExtras: true, extraSheets: resultSheets(input, want), provenance: false });
  const file = read(write(workbook!, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
  const exported = utils.sheet_to_json<Record<string, string | number>>(file.Sheets.Envelope!);
  expect.soft(exported.filter(row => row.component === 'Vz' && (row['x [m]'] === a || row['x [m]'] === b))
    .map(row => [row['x [m]'], row.face, row.min, row.max])).toEqual(rows);
  const zip = unzipSync(new Uint8Array(await (await streamWorkbookZip(resultSheetParts(input, want))).arrayBuffer()));
  const csv = strFromU8(zip[Object.keys(zip).find(name => name.endsWith('-Envelope.csv'))!]!);
  expect(csv.split('\n').map(line => line.split(',')).filter(c => c[4] === 'Vz' && (Number(c[3]) === a || Number(c[3]) === b))
    .map(c => [Number(c[3]), c[12], Number(c[9]), Number(c[6])])).toEqual(rows);
});
