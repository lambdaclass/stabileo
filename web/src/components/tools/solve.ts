import { initSolver, solve, solveBuckling } from '../../lib/engine/wasm-solver';
import { computeElementDiagram, computeDeformedShape } from '../../lib/engine/diagrams';
import { buildModel, formula, normalize, type Parameters, type ToolId } from './calculators';
import { MESH_TOLERANCE, validityWarnings } from './validity';

export async function calculate(id: ToolId, input: Parameters) {
  await initSolver();
  const model = buildModel(id, input);
  const p = normalize(input);
  const linear = solve(model);
  const buckling = id === 'column-buckling' ? solveBuckling(model, 1) : null;
  const charts: Record<'moment' | 'shear' | 'deflection', [number, number][]> = { moment: [], shear: [], deflection: [] };
  for (const ef of linear.elementForces) {
    const el = model.elements.get(ef.elementId)!;
    const ni = model.nodes.get(el.nodeI)!, nj = model.nodes.get(el.nodeJ)!;
    const di = linear.displacements.find(d => d.nodeId === ni.id)!, dj = linear.displacements.find(d => d.nodeId === nj.id)!;
    for (const key of ['moment', 'shear'] as const) charts[key].push(...computeElementDiagram(key, ef, ni.x, ni.z, nj.x, nj.z).points.map(v => [v.x, key === 'moment' ? -v.value : v.value] as [number, number]));
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
  const node = [...model.nodes.values()].reduce((a, b) => Math.abs(b.x - expected.x) < Math.abs(a.x - expected.x) ? b : a);
  if (!buckling && Math.abs(node.x - expected.x) > p.length * MESH_TOLERANCE) throw new Error('tools.failed');
  const value = buckling ? buckling.modes[0].loadFactor : Math.abs(linear.displacements.find(d => d.nodeId === node.id)!.uz);
  if (!Number.isFinite(value)) throw new Error('tools.failed');
  const absolute = expected.value === 0;
  const difference = absolute ? Math.abs(value) : Math.abs(value - expected.value) / expected.value;
  const displacement = buckling ? undefined : Math.max(...linear.displacements.map(d => Math.hypot(d.ux, d.uz)), Math.abs(maxima.deflection[1]));
  const warnings = validityWarnings({ displacement, length: p.length, difference: absolute ? null : difference });
  return { model, linear, buckling, charts, maxima, reference, value, expected: expected.value, x: expected.x, absolute, difference, warnings };
}
