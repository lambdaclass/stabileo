import data from '../../../../../engine/tests/benchmarks/mattiasson_elastica.json';
import type { SolverInput } from '../../../lib/engine/types';

export const cases = data.cases;
export const nativeOnly = data.nativeOnly;
export const tolerance = data.accuracyTolerance;
export type Case = typeof cases[number];
export type Displacement = { nodeId: number; ux: number; uz: number; ry: number };
export type Output = { converged: boolean; loadFactor: number; results: { displacements: Displacement[] } };
export type Result = { id: string; u: number | null; v: number | null; errors: number[] | null; pass: boolean | null; failure?: string; displacement?: Displacement[] };
export const issue = 'https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/KNOWN_ISSUES.md#mattiasson-reference-and-accuracy';

export function inputFor(c: Case): SolverInput {
  return { ...c.input, ...Object.fromEntries(['nodes', 'materials', 'sections', 'elements', 'supports', 'connectors'].map(key => [key, new Map(Object.entries(c.input[key as keyof typeof c.input]).map(([id, value]) => [Number(id), value]))])) } as unknown as SolverInput;
}
export function compare(c: Case, output: Output): Result {
  if (!output.converged || output.loadFactor !== 1) throw new Error('Incomplete load step');
  const displacement = output.results.displacements;
  for (const node of Object.values(c.input.nodes)) {
    const d = displacement.find(d => d.nodeId === node.id);
    if (!d || ![d.ux, d.uz, d.ry].every(Number.isFinite)) throw new Error('Missing or non-finite displacement');
  }
  const tip = displacement.find(d => d.nodeId === c.tipNode)!;
  const u = -tip.ux / c.length, v = -tip.uz / c.length;
  const errors = c.reference?.map((ref, i) => Math.abs(([u, v][i] - ref) / ref)) ?? null;
  return { id: c.id, u, v, errors, pass: errors ? errors.every(e => e < tolerance) : null, displacement };
}
export async function runCases(onResult?: (r: Result) => void, stopped = () => false): Promise<Result[]> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const rows: Result[] = [];
  for (const c of cases) {
    if (stopped()) break;
    let row: Result;
    try { row = compare(c, engine.solveCorotational2D(inputFor(c), c.solver.maxIter, c.solver.tolerance, c.solver.nIncrements)); }
    catch (error) { row = { id: c.id, u: null, v: null, errors: null, pass: false, failure: String(error) }; }
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
