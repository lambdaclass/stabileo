import data from '../../../../../engine/tests/benchmarks/dadeppo_arch.json';
import convergence from '../../../../../research/benchmarks/dadeppo-arch-1975/results/convergence.json';

export const benchmark = data;
export type Displacement = { nodeId: number; ux: number; uz: number; ry?: number };
export type Step = { step: number; loadFactor: number; converged: boolean };
export type Run = { converged: boolean; steps: Step[]; results: { displacements: Displacement[] }; finalLoadFactor: number };
export type Frame = { step: number; loadFactor: number; displacements: Displacement[] };
export type Crown = { uOverR: number; vOverR: number; rotation: number };
export type LimitPoint = { loadFactor: number; peakStep: number; offset: number; crown: Crown };
export type Replay = { frames: Frame[]; steps: Step[]; limitPoint: LimitPoint };
export type Quantity = 'loadFactor' | keyof Crown;
export const quantities: Quantity[] = ['loadFactor', 'uOverR', 'vOverR', 'rotation'];
export const published: Record<Quantity, number> = { loadFactor: data.reference, ...data.crownReference };
export const tolerance: Record<Quantity, number> = { loadFactor: data.relativeTolerance, ...data.crownRelativeTolerance };
const valueOf = (limit: LimitPoint, q: Quantity) => q === 'loadFactor' ? limit.loadFactor : limit.crown[q];
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

export function peakBracket(steps: Step[]) {
  const loads = steps.map(s => s.loadFactor);
  const k = loads.indexOf(Math.max(...loads));
  if (k < 1 || k + 1 >= loads.length) throw new Error('The path does not pass the limit point');
  const [before, peak, after] = [loads[k - 1], loads[k], loads[k + 1]];
  const offset = (before - after) / (2 * (before - 2 * peak + after));
  return { prefixes: [k, k + 1, k + 2], offset, loadFactor: peak - (before - after) * offset / 4, peakStep: k + 1 };
}

export function crownOf(frame: Frame): Crown {
  const d = frame.displacements.find(d => d.nodeId === data.crownNode);
  if (!d || d.ry === undefined) throw new Error('Missing crown displacement');
  return { uOverR: d.ux / data.radius, vOverR: -d.uz / data.radius, rotation: d.ry };
}

export function limitPoint(steps: Step[], frames: [Frame, Frame, Frame]): LimitPoint {
  const { offset, loadFactor, peakStep } = peakBracket(steps);
  const [a, b, c] = frames.map(crownOf);
  const at = (q: keyof Crown) => b[q] + offset * (c[q] - a[q]) / 2 + offset * offset * (c[q] - 2 * b[q] + a[q]) / 2;
  return { loadFactor, peakStep, offset, crown: { uOverR: at('uOverR'), vOverR: at('vOverR'), rotation: at('rotation') } };
}

export function checks(limit: LimitPoint) {
  return quantities.map(q => {
    const value = valueOf(limit, q);
    const relative = value / published[q] - 1;
    return { quantity: q, published: published[q], value, relative, tolerance: tolerance[q], pass: Math.abs(relative) < tolerance[q] };
  });
}

export function study() {
  const [coarse, medium, fine] = convergence.meshes;
  return quantities.map(q => {
    const [q20, q40, q80] = [coarse[q], medium[q], fine[q]];
    const order = Math.log2((q20 - q40) / (q40 - q80));
    const extrapolated = q80 + (q80 - q40) / (2 ** order - 1);
    const rounding = 0.5 * 10 ** -(String(published[q]).split('.')[1]?.length ?? 0) / Math.abs(published[q]);
    const budget = convergence.gciSafetyFactor * Math.abs((q40 - extrapolated) / extrapolated) + rounding;
    return { quantity: q, values: [q20, q40, q80], order, extrapolated, published: published[q], relative: extrapolated / published[q] - 1, rounding, budget, tolerance: tolerance[q] };
  });
}
