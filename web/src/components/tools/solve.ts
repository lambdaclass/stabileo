import { initSolver, solve, solveBuckling } from '../../lib/engine/wasm-solver';
import { computeElementDiagram, computeDeformedShape } from '../../lib/engine/diagrams';
import { buildModel, formula, type Parameters, type ToolId } from './calculators';

export async function calculate(id: ToolId, p: Parameters) {
  await initSolver();
  const model = buildModel(id, p);
  const linear = solve(model);
  const buckling = id === 'column-buckling' ? solveBuckling(model, 1) : null;
  const charts: Record<'moment' | 'shear' | 'deflection', [number, number][]> = { moment: [], shear: [], deflection: [] };
  for (const ef of linear.elementForces) {
    const el = model.elements.get(ef.elementId)!;
    const ni = model.nodes.get(el.nodeI)!, nj = model.nodes.get(el.nodeJ)!;
    const di = linear.displacements.find(d => d.nodeId === ni.id)!, dj = linear.displacements.find(d => d.nodeId === nj.id)!;
    for (const key of ['moment', 'shear'] as const) charts[key].push(...computeElementDiagram(key, ef, ni.x, ni.z, nj.x, nj.z).points.map(v => [v.x, v.value] as [number, number]));
    charts.deflection.push(...computeDeformedShape(ni.x, ni.z, nj.x, nj.z, di.ux, di.uz, di.ry, dj.ux, dj.uz, dj.ry, 1, ef.length, false, false, p.e * 1000 * p.i, ef.qI, ef.qJ, ef.pointLoads, ef.distributedLoads).map(v => [v.x, v.y] as [number, number]));
  }
  const maxima = Object.fromEntries(Object.entries(charts).map(([key, values]) => [key, values.reduce((a, b) => Math.abs(b[1]) > Math.abs(a[1]) ? b : a, [0, 0])])) as Record<keyof typeof charts, [number, number]>;
  const expected = formula(id, p);
  const cantilever = id === 'cantilever-beam';
  const reference = {
    moment: id === 'column-buckling' ? 0 : p.uniform ? p.load * p.length ** 2 / (cantilever ? 2 : 8) : cantilever ? p.load * p.position : p.load * p.position * (p.length - p.position) / p.length,
    shear: id === 'column-buckling' || !p.uniform && (p.position === 0 || !cantilever && p.position === p.length) ? 0 : p.uniform ? p.load * p.length / (cantilever ? 1 : 2) : cantilever ? p.load : p.load * Math.max(p.position, p.length - p.position) / p.length,
    deflection: id === 'column-buckling' ? 0 : expected.value,
  };
  const value = buckling ? buckling.modes[0].loadFactor : Math.abs(linear.displacements.find(d => Math.abs(model.nodes.get(d.nodeId)!.x - expected.x) < 1e-10)!.uz);
  if (!Number.isFinite(value)) throw new Error('Non-finite solver result');
  return { model, linear, buckling, charts, maxima, reference, value, expected: expected.value, difference: expected.value === 0 ? Math.abs(value) : Math.abs(value - expected.value) / expected.value };
}
