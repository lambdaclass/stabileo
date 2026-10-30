import data from '../../../../../engine/tests/benchmarks/plastic_collapse.json';
export const portal = data;
export type Step = { loadFactor: number; results: { displacements: { nodeId: number; ux: number; uz: number }[] } };
export type Result = { collapseFactor: number; isMechanism: boolean; warnings?: string[]; steps: Step[] };
export function mechanisms() {
  const { mp, horizontal: h, vertical: v, span: l, height } = portal;
  return { beam: 8 * mp / (v * l), sway: 4 * mp / (h * height), combined: 6 * mp / (h * height + v * l / 2) };
}
export function compare(result: Result) {
  if (!Number.isFinite(result.collapseFactor) || !result.steps?.length) throw new Error('Invalid plastic-collapse result');
  return Object.entries(mechanisms()).map(([mechanism, reference]) => ({ mechanism, reference, difference: result.collapseFactor - reference }));
}
export async function run(): Promise<Result> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const result: Result = engine.solvePlastic3D(structuredClone(portal.input));
  compare(result);
  return result;
}
export function viewer(step?: Step) {
  const nodes = Object.values(portal.input.solver.nodes).sort((a, b) => a.id - b.id);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const displacement = step ? nodes.flatMap(n => {
    const d = step.results.displacements.find(d => d.nodeId === n.id);
    if (!d || !Number.isFinite(d.ux) || !Number.isFinite(d.uz)) throw new Error('Missing portal displacement');
    return [d.ux, d.uz];
  }) : null;
  const values = displacement ? nodes.map((_, i) => Math.hypot(displacement[2 * i], displacement[2 * i + 1])) : null;
  return {
    xy: nodes.flatMap(n => [n.x, n.z]),
    cells: Object.values(portal.input.solver.elements).flatMap(e => [index.get(e.nodeI)!, index.get(e.nodeJ)!]),
    displacement, values, range: { min: 0, max: Math.max(...(values ?? [1]), 1e-12) },
  };
}

export function cumulativeStep(steps: Step[], index: number): Step | undefined {
  const selected = steps[index];
  if (!selected) return undefined;
  return {
    loadFactor: selected.loadFactor,
    results: { displacements: selected.results.displacements.map(node => ({
      nodeId: node.nodeId,
      ux: steps.slice(0, index + 1).reduce((sum, step) => sum + (step.results.displacements.find(n => n.nodeId === node.nodeId)?.ux ?? 0), 0),
      uz: steps.slice(0, index + 1).reduce((sum, step) => sum + (step.results.displacements.find(n => n.nodeId === node.nodeId)?.uz ?? 0), 0),
    })) },
  };
}
