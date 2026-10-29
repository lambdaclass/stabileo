import data from '../../../../../engine/tests/benchmarks/southwell_1932.json';
import type { SolverInput } from '../../../lib/engine/types';
import LZString from 'lz-string';

export const benchmark = data;
export const euler = Math.PI ** 2 * data.input.materials['1'].e * 1000 * data.input.sections['1'].iz / data.length ** 2;
export type Displacement = { nodeId: number; ux: number; uz: number; ry: number };
export type Row = { load: number; delta: number; displacements: Displacement[] };
export function inputFor(load: number, straight = false): SolverInput {
  const raw = structuredClone(data.input);
  raw.loads[0].data.fx = -load;
  if (straight) Object.values(raw.nodes).forEach(n => { n.z = 0; });
  return { ...raw, ...Object.fromEntries(['nodes', 'materials', 'sections', 'elements', 'supports', 'connectors'].map(k => [k, new Map(Object.entries(raw[k as keyof typeof raw]).map(([id, v]) => [Number(id), v]))])) } as unknown as SolverInput;
}
export function fit(rows: Pick<Row, 'load' | 'delta'>[]) {
  if (rows.length < 2 || rows.some(r => !Number.isFinite(r.load) || !Number.isFinite(r.delta) || r.load <= 0 || r.delta <= 0)) throw new Error('Invalid Southwell samples');
  const mx = rows.reduce((v, r) => v + r.delta, 0) / rows.length;
  const my = rows.reduce((v, r) => v + r.delta / r.load, 0) / rows.length;
  const variance = rows.reduce((v, r) => v + (r.delta - mx) ** 2, 0);
  const slope = rows.reduce((v, r) => v + (r.delta - mx) * (r.delta / r.load - my), 0) / variance;
  if (!Number.isFinite(slope) || slope <= 0) throw new Error('Invalid Southwell slope');
  return { slope, intercept: my - slope * mx, estimated: 1 / slope };
}
export function readRow(load: number, output: { converged: boolean; loadFactor: number; results: { displacements: Displacement[] } }): Row {
  if (!output.converged || Math.abs(output.loadFactor - 1) > 1e-12) throw new Error('Incomplete nonlinear solve');
  const ds = output.results.displacements;
  for (const n of Object.values(data.input.nodes)) {
    const d = ds.find(d => d.nodeId === n.id);
    if (!d || ![d.ux, d.uz, d.ry].every(Number.isFinite)) throw new Error('Missing or non-finite displacement');
  }
  const delta = ds.find(d => d.nodeId === data.midNode)!.uz;
  if (delta <= 0) throw new Error('Non-positive lateral displacement');
  return { load, delta, displacements: ds };
}
export async function compute(onRow: (r: Row) => void, stopped: () => boolean) {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  if (stopped()) return null;
  const linear = engine.solveBuckling(inputFor(1, true), 1).modes[0]?.loadFactor;
  if (!Number.isFinite(linear) || linear <= 0) throw new Error('Invalid linear buckling result');
  const rows: Row[] = [];
  for (const fraction of data.loadFractions) {
    if (stopped()) return null;
    const load = fraction * euler;
    const row = readRow(load, engine.solveCorotational2D(inputFor(load), data.solver.maxIter, data.solver.tolerance, data.solver.nIncrements));
    rows.push(row); onRow(row);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (stopped()) return null;
  return { linear, ...fit(rows) };
}
export function viewerData(row?: Row) {
  const nodes = Object.values(data.input.nodes);
  const ds = row?.displacements;
  const values = nodes.map(n => Math.abs(ds?.find(d => d.nodeId === n.id)?.uz ?? 0));
  return { xy: nodes.flatMap(n => [n.x, n.z]), cells: Object.values(data.input.elements).flatMap(e => [e.nodeI - 1, e.nodeJ - 1]),
    displacement: nodes.flatMap(n => { const d = ds?.find(d => d.nodeId === n.id); return [d?.ux ?? 0, d?.uz ?? 0]; }), values,
    range: { min: 0, max: Math.max(...values, 1e-6) } };
}
export function editorURL(load: number, base: string) {
  const raw = data.input;
  const entries = (v: object) => Object.entries(v).map(([k, v]) => [Number(k), v]);
  const snapshot = { name: 'Southwell (1932)', analysisMode: '2d', localAxisConvention: 'zUpStrongAxis',
    nodes: Object.values(raw.nodes).map(n => [n.id, { id: n.id, x: n.x, y: n.z, z: 0 }]),
    materials: Object.values(raw.materials).map(m => [m.id, { ...m, name: 'E = 200 GPa', rho: 0 }]),
    sections: Object.values(raw.sections).map(s => [s.id, { ...s, name: 'Column' }]),
    elements: entries(raw.elements), supports: entries(raw.supports), quads: [], plates: [],
    loads: [{ type: 'nodal', data: { id: 1, caseId: 1, nodeId: 21, fx: -load, fy: 0, mz: 0 } }],
    loadCases: [{ id: 1, name: 'Compression', type: 'other' }], combinations: [], constraints: [],
    includeSelfWeight: false, _shareMeta: { includeSelfWeight: false, autoSolve: false }, nextId: {} };
  return `${base}#data=${LZString.compressToEncodedURIComponent(JSON.stringify(snapshot))}`;
}
