import data from '../../../../../engine/tests/benchmarks/mattiasson_elastica.json';
import type { SolverInput } from '../../../lib/engine/types';
import { BUILD_COMMIT } from '../../../lib/build-info';

export const cases = data.cases;
export const nativeOnly = data.nativeOnly;
export const tolerance = data.accuracyTolerance;
export const meshErrorCeilings = data.meshErrorCeilings;
export const axialExtensionBound = data.axialExtensionBound;
export type Case = typeof cases[number];
export const meshes = meshErrorCeilings.map(c => c.elements);

export function refined(c: Case, elements = 16): Case {
  if (elements === Object.keys(c.input.elements).length) return c;
  const template = c.input.elements['1'];
  const nodes = Object.fromEntries(Array.from({ length: elements + 1 }, (_, i) => [String(i + 1), { id: i + 1, x: c.length * i / elements, z: 0 }]));
  const members = Object.fromEntries(Array.from({ length: elements }, (_, i) => [String(i + 1), { ...template, id: i + 1, nodeI: i + 1, nodeJ: i + 2 }]));
  const loads = c.input.loads.map(l => ({ ...l, data: { ...l.data, nodeId: elements + 1 } }));
  return { ...c, tipNode: elements + 1, input: { ...c.input, nodes, elements: members, loads } } as unknown as Case;
}
export type Displacement = { nodeId: number; ux: number; uz: number; ry: number };
export type Output = { converged: boolean; loadFactor: number; results: { displacements: Displacement[] } };
export type Result = { id: string; u: number | null; v: number | null; errors: number[] | null; pass: boolean | null; failure?: string; displacement?: Displacement[] };
export const issue = 'https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/KNOWN_ISSUES.md#mattiasson-reference-and-accuracy';
export const evidence = `https://github.com/lambdaclass/stabileo/blob/${BUILD_COMMIT === 'dev' ? 'main' : BUILD_COMMIT}/research/benchmarks/mattiasson-elastica/README.md`;

export function inputFor(c: Case): SolverInput {
  return { ...c.input, ...Object.fromEntries(['nodes', 'materials', 'sections', 'elements', 'supports', 'connectors'].map(key => [key, new Map(Object.entries(c.input[key as keyof typeof c.input]).map(([id, value]) => [Number(id), value]))])) } as unknown as SolverInput;
}
export const withinTolerance = (error: number) => Number.isFinite(error) && error < tolerance;
export function compare(c: Case, output: Output): Result {
  if (!output.converged || output.loadFactor !== 1) throw new Error('incomplete');
  const displacement = output.results.displacements;
  for (const node of Object.values(c.input.nodes)) {
    const d = displacement.find(d => d.nodeId === node.id);
    if (!d || ![d.ux, d.uz, d.ry].every(Number.isFinite)) throw new Error('invalid');
  }
  const tip = displacement.find(d => d.nodeId === c.tipNode)!;
  const u = -tip.ux / c.length, v = -tip.uz / c.length;
  const errors = c.reference?.map((ref, i) => Math.abs(([u, v][i] - ref) / ref)) ?? null;
  return { id: c.id, u, v, errors, pass: errors ? errors.every(withinTolerance) : null, displacement };
}
export async function runCases(onResult?: (r: Result) => void, stopped = () => false, elements = 16): Promise<Result[]> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const rows: Result[] = [];
  for (const original of cases) {
    if (stopped()) break;
    const c = refined(original, elements);
    let row: Result;
    try { row = compare(c, engine.solveCorotational2D(inputFor(c), c.solver.maxIter, c.solver.tolerance, c.solver.nIncrements)); }
    catch (error) { row = { id: c.id, u: null, v: null, errors: null, pass: false, failure: error instanceof Error && ['incomplete', 'invalid'].includes(error.message) ? error.message : 'solveError' }; }
    rows.push(row); onResult?.(row);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return rows;
}
export function viewerData(c: Case, r?: Result) {
  const nodes = Object.values(c.input.nodes).sort((a, b) => a.id - b.id);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const displacement = r?.displacement ? nodes.flatMap(n => { const d = r.displacement!.find(d => d.nodeId === n.id)!; return [d.ux, d.uz]; }) : null;
  const values = displacement ? nodes.map((_, i) => Math.hypot(displacement[2*i], displacement[2*i+1])) : null;
  return { xy: nodes.flatMap(n => [n.x, n.z]), cells: Object.values(c.input.elements).flatMap(e => [index.get(e.nodeI)!, index.get(e.nodeJ)!]), displacement, values, range: { min: 0, max: Math.max(...(values ?? [1]), 1e-12) } };
}
