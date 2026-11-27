import data from '../../../../../engine/tests/benchmarks/lee_frame.json';
export const benchmark = data;
export const splits = [1, 2, 4] as const;
export type Split = typeof splits[number];
export type LeeInput = typeof data.input;
export const studyCase = (split: Split) => data.convergence.cases.find(c => c.split === split && c.stepScale === 1)!;
export const loadNodeOf = (split: Split) => 12 * split + 1;

export function refinedInput(split: Split): LeeInput {
  if (split === 1) return data.input;
  const old = Array.from({ length: 21 }, (_, i) => data.input.solver.nodes[String(i + 1) as keyof typeof data.input.solver.nodes]);
  const nodes: Record<string, { id: number; x: number; z: number }> = {};
  let id = 0;
  old.slice(0, -1).forEach((a, i) => {
    const b = old[i + 1];
    for (let j = 0; j < split; j++) {
      id += 1;
      const t = j / split;
      nodes[id] = j === 0 ? { id, x: a.x, z: a.z } : { id, x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
    }
  });
  id += 1;
  nodes[id] = { id, x: old[20].x, z: old[20].z };
  const template = data.input.solver.elements['1'];
  const elements = Object.fromEntries(Array.from({ length: id - 1 }, (_, e) => [String(e + 1), { ...template, id: e + 1, nodeI: e + 1, nodeJ: e + 2 }]));
  const supports = Object.fromEntries(Object.entries(data.input.solver.supports).map(([key, support]) => [key, { ...support, nodeId: (support.nodeId - 1) * split + 1 }]));
  const loads = data.input.solver.loads.map(l => ({ ...l, data: { ...l.data, nodeId: loadNodeOf(split) } }));
  return { ...data.input, maxSteps: studyCase(split).maxSteps, solver: { ...data.input.solver, nodes, elements, supports, loads } } as unknown as LeeInput;
}
export type Frame = { step: number; load: number; displacement: { nodeId: number; ux: number; uz: number }[] };
export type Failure = 'incomplete' | 'invalid' | 'solveError';
export class SolveFailure extends Error {
  constructor(public code: Failure) { super(code); }
}
export function failureCode(error: unknown): Failure {
  return error instanceof SolveFailure ? error.code : 'solveError';
}
export function frameFrom(result: { converged: boolean; steps: unknown[]; finalLoadFactor: number; results: { displacements: Frame['displacement'] } }, step: number, input: LeeInput = data.input): Frame {
  if (!result.converged || result.steps.length !== step) throw new SolveFailure('incomplete');
  const displacement = result.results.displacements;
  if (result.steps.some(s => !s || typeof s !== 'object' || !('loadFactor' in s) || !Number.isFinite(s.loadFactor))) throw new SolveFailure('invalid');
  if (!Number.isFinite(result.finalLoadFactor) || Object.values(input.solver.nodes).some(n => {
    const d = displacement.find(d => d.nodeId === n.id);
    return !d || !Number.isFinite(d.ux) || !Number.isFinite(d.uz);
  })) throw new SolveFailure('invalid');
  return { step, load: result.finalLoadFactor, displacement };
}
export function point(frame: Frame, loadNode: number = data.loadNode): [number, number] {
  const d = frame.displacement.find(d => d.nodeId === loadNode)!;
  return [-d.uz * 100, frame.load];
}
export function viewer(frame?: Frame, input: LeeInput = data.input) {
  const nodes = Object.values(input.solver.nodes);
  const displacement = nodes.flatMap(n => {
    const d = frame?.displacement.find(d => d.nodeId === n.id);
    return [d?.ux ?? 0, d?.uz ?? 0];
  });
  const values = nodes.map((_, i) => Math.hypot(displacement[2*i], displacement[2*i+1]));
  return { xy: nodes.flatMap(n => [n.x, n.z]), cells: Object.values(input.solver.elements).flatMap(e => [e.nodeI-1,e.nodeJ-1]), displacement, values, range: { min: 0, max: Math.max(1e-9,...values) } };
}
export function firstPeak(frames: Frame[]) {
  const index = frames.findIndex((f,i) => i > 0 && i < frames.length-1 && f.load > frames[i-1].load && f.load > frames[i+1].load);
  return index < 0 ? null : frames[index];
}
const finestStep = (split: number) => data.convergence.cases.filter(c => c.split === split).at(-1)!;
export const convergence = { elements40: finestStep(2), elements80: finestStep(4), stepEffectBound: data.convergence.stepEffectBound };
export function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}
