import data from '../../../../../engine/tests/benchmarks/dadeppo_arch.json';

export const benchmark = data;
export type Displacement = { nodeId: number; ux: number; uz: number };
export type Step = { step: number; loadFactor: number; converged: boolean };
export type Run = { converged: boolean; steps: Step[]; results: { displacements: Displacement[] }; finalLoadFactor: number };
export type Frame = { step: number; loadFactor: number; displacements: Displacement[] };
export type Replay = { frames: Frame[]; steps: Step[] };
export const sampleSteps = Array.from({ length: data.input.maxSteps / 20 }, (_, i) => (i + 1) * 20);

export function compare(steps: Step[]) {
  if (!steps.length || steps.some(s => !s.converged || !Number.isFinite(s.loadFactor))) throw new Error('Invalid equilibrium path');
  const peak = Math.max(...steps.map(s => s.loadFactor));
  const difference = peak - data.reference;
  const relative = difference / data.reference;
  const passedPeak = steps.at(-1)!.loadFactor < peak * 0.95;
  return { peak, difference, relative, passedPeak, pass: steps.length === data.input.maxSteps && passedPeak && Math.abs(relative) < data.relativeTolerance };
}

export function frameFor(run: Run, step: number): Frame {
  if (!run.converged || run.steps.length !== step) throw new Error(`Incomplete path at step ${step}`);
  const nodes = Object.values(data.input.solver.nodes);
  if (nodes.some(n => !run.results.displacements.some(d => d.nodeId === n.id && Number.isFinite(d.ux) && Number.isFinite(d.uz)))) throw new Error('Missing or non-finite displacement');
  return { step, loadFactor: run.finalLoadFactor, displacements: run.results.displacements };
}

export function viewerData(frame?: Frame) {
  const nodes = Object.values(data.input.solver.nodes).sort((a, b) => a.id - b.id);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const displacement = nodes.flatMap(n => {
    const d = frame?.displacements.find(d => d.nodeId === n.id);
    return [d?.ux ?? 0, d?.uz ?? 0];
  });
  const values = nodes.map((_, i) => Math.hypot(displacement[2 * i], displacement[2 * i + 1]));
  return {
    xy: nodes.flatMap(n => [n.x, n.z]),
    cells: Object.values(data.input.solver.elements).flatMap(e => [index.get(e.nodeI)!, index.get(e.nodeJ)!]),
    displacement, values, range: { min: 0, max: Math.max(...values, 1e-12) },
  };
}
