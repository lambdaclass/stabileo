import data from '../../../../../engine/tests/benchmarks/dadeppo_arch.json';
import results from '../../../../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json';

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
export const meshes = [20, 40, 80] as const;
export type Mesh = typeof meshes[number];
export type ArchInput = typeof data.input;
const arcLengthFactor = (elements: Mesh) => elements === 80 ? 2 : 1;

export function archInput(elements: Mesh): ArchInput {
  if (elements === 40) return data.input;
  const half = data.openingDegrees / 2 * Math.PI / 180;
  const factor = arcLengthFactor(elements);
  const nodes = Object.fromEntries(Array.from({ length: elements + 1 }, (_, i) => {
    const angle = -half + 2 * half * i / elements;
    return [String(i), { id: i, x: data.radius * Math.sin(angle), z: data.radius * Math.cos(angle) }];
  }));
  const template = data.input.solver.elements['0'];
  const members = Object.fromEntries(Array.from({ length: elements }, (_, i) => [String(i), { ...template, id: i, nodeI: i, nodeJ: i + 1 }]));
  return {
    ...data.input,
    initialDs: data.input.initialDs * factor,
    maxDs: data.input.maxDs * factor,
    maxSteps: Math.ceil(data.input.maxSteps / factor),
    solver: {
      ...data.input.solver,
      nodes, elements: members,
      supports: { '0': { id: 0, nodeId: 0, type: 'fixed' }, [String(elements)]: { id: elements, nodeId: elements, type: 'pinned' } },
      loads: [{ type: 'nodal', data: { nodeId: elements / 2, fx: 0, fz: -1, my: 0 } }],
    },
  } as unknown as ArchInput;
}

export const sampleStepsFor = (input: ArchInput) => Array.from({ length: input.maxSteps / 20 }, (_, i) => (i + 1) * 20);
export const sampleSteps = sampleStepsFor(data.input);
export const studyValue = (elements: Mesh, q: Quantity) => results.convergence.meshes.find(m => m.elements === elements)![q];

export function compare(steps: Step[], maxSteps: number = data.input.maxSteps) {
  if (!steps.length || steps.some(s => !s.converged || !Number.isFinite(s.loadFactor))) throw new Error('Invalid equilibrium path');
  const peak = Math.max(...steps.map(s => s.loadFactor));
  const difference = peak - data.reference;
  const relative = difference / data.reference;
  const passedPeak = steps.at(-1)!.loadFactor < peak * 0.95;
  return { peak, difference, relative, passedPeak, pass: steps.length === maxSteps && passedPeak && Math.abs(relative) < data.relativeTolerance };
}

export function frameFor(run: Run, step: number, input: ArchInput = data.input): Frame {
  if (!run.converged || run.steps.length !== step) throw new Error(`Incomplete path at step ${step}`);
  const nodes = Object.values(input.solver.nodes);
  if (nodes.some(n => !run.results.displacements.some(d => d.nodeId === n.id && Number.isFinite(d.ux) && Number.isFinite(d.uz)))) throw new Error('Missing or non-finite displacement');
  return { step, loadFactor: run.finalLoadFactor, displacements: run.results.displacements };
}

export function viewerData(frame?: Frame, input: ArchInput = data.input) {
  const nodes = Object.values(input.solver.nodes).sort((a, b) => a.id - b.id);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const displacement = nodes.flatMap(n => {
    const d = frame?.displacements.find(d => d.nodeId === n.id);
    return [d?.ux ?? 0, d?.uz ?? 0];
  });
  const values = nodes.map((_, i) => Math.hypot(displacement[2 * i], displacement[2 * i + 1]));
  return {
    xy: nodes.flatMap(n => [n.x, n.z]),
    cells: Object.values(input.solver.elements).flatMap(e => [index.get(e.nodeI)!, index.get(e.nodeJ)!]),
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

export function crownOf(frame: Frame, crownNode: number = data.crownNode): Crown {
  const d = frame.displacements.find(d => d.nodeId === crownNode);
  if (!d || d.ry === undefined) throw new Error('Missing crown displacement');
  return { uOverR: d.ux / data.radius, vOverR: -d.uz / data.radius, rotation: d.ry };
}

export function limitPoint(steps: Step[], frames: [Frame, Frame, Frame], crownNode: number = data.crownNode): LimitPoint {
  const { offset, loadFactor, peakStep } = peakBracket(steps);
  const [a, b, c] = frames.map(f => crownOf(f, crownNode));
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
  const { convergence } = results;
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
