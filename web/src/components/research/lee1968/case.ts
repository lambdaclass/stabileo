import data from '../../../../../engine/tests/benchmarks/lee_frame.json';
export const benchmark = data;
export type Frame = { step: number; load: number; displacement: { nodeId: number; ux: number; uz: number }[] };
export type Failure = 'incomplete' | 'invalid' | 'solveError';
export class SolveFailure extends Error {
  constructor(public code: Failure) { super(code); }
}
export function failureCode(error: unknown): Failure {
  return error instanceof SolveFailure ? error.code : 'solveError';
}
export function frameFrom(result: { converged: boolean; steps: unknown[]; finalLoadFactor: number; results: { displacements: Frame['displacement'] } }, step: number): Frame {
  if (!result.converged || result.steps.length !== step) throw new SolveFailure('incomplete');
  const displacement = result.results.displacements;
  if (!Number.isFinite(result.finalLoadFactor) || Object.values(data.input.solver.nodes).some(n => {
    const d = displacement.find(d => d.nodeId === n.id);
    return !d || !Number.isFinite(d.ux) || !Number.isFinite(d.uz);
  })) throw new SolveFailure('invalid');
  return { step, load: result.finalLoadFactor, displacement };
}
export function point(frame: Frame): [number, number] {
  const d = frame.displacement.find(d => d.nodeId === data.loadNode)!;
  return [-d.uz * 100, frame.load];
}
export function viewer(frame?: Frame) {
  const nodes = Object.values(data.input.solver.nodes);
  const displacement = nodes.flatMap(n => {
    const d = frame?.displacement.find(d => d.nodeId === n.id);
    return [d?.ux ?? 0, d?.uz ?? 0];
  });
  const values = nodes.map((_, i) => Math.hypot(displacement[2*i], displacement[2*i+1]));
  return { xy: nodes.flatMap(n => [n.x, n.z]), cells: Object.values(data.input.solver.elements).flatMap(e => [e.nodeI-1,e.nodeJ-1]), displacement, values, range: { min: 0, max: Math.max(1e-9,...values) } };
}
export function firstPeak(frames: Frame[]) {
  const index = frames.findIndex((f,i) => i > 0 && i < frames.length-1 && f.load > frames[i-1].load && f.load > frames[i+1].load);
  return index < 0 ? null : frames[index];
}
const finestStep = (split: number) => data.convergence.cases.filter(c => c.split === split).at(-1)!;
export const convergence = { elements40: finestStep(2), elements80: finestStep(4), stepEffectBound: data.convergence.stepEffectBound };
export function percentAgainstReference(load: number) {
  return Math.round(100 * (load / data.reference.load - 1));
}
export function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}
