import caseData from '../../../../../engine/tests/benchmarks/newmark_1959.json';

export const benchmark = caseData;
const { solver, densities } = caseData.input;
const [n1, n2] = [solver.nodes['1'], solver.nodes['2']];
export const model = {
  length: Math.hypot(n2.x - n1.x, n2.y - n1.y, n2.z - n1.z),
  e: solver.materials['1'].e,
  area: solver.sections['1'].a,
  density: densities['1'],
  force: caseData.input.forceHistory[0].loads[0].fx,
};
export const stiffness = 1000 * model.e * model.area / model.length;
export const mass = model.density * model.area * model.length / 3000;
export const omega = Math.sqrt(stiffness / mass);
export const period = 2 * Math.PI / omega;
export const amplitude = model.force / stiffness;
export const exact = (time: number) => amplitude * (1 - Math.cos(omega * time));
const theta = (ratio: number) => 2 * Math.atan(Math.PI * ratio);
export const discrete = (ratio: number, step: number) => amplitude * (1 - Math.cos(step * theta(ratio)));
export const discretePeriod = (ratio: number) => period * Math.PI * ratio / Math.atan(Math.PI * ratio);
export const steps = (ratio: number) => Math.round(caseData.cycles / ratio);
export const phaseLagBound = (ratio: number) => amplitude * Math.min(2, steps(ratio) * (2 * Math.PI * ratio - theta(ratio))) + 1e-10;
export const PLAYBACK_SLOWDOWN = 2.5;
export const playbackMs = (ratio: number) => 1000 * PLAYBACK_SLOWDOWN * period * ratio;
export type Run = { ratio: number; time: number[]; u: number[]; measuredPeriod: number; maxError: number; discreteError: number };
export type EvidenceCheck = { metric: string; observed: number; tolerance: number; passed: boolean };

export function request(ratio: number) {
  if (!caseData.ratios.includes(ratio)) throw new Error('Unsupported time step');
  return { ...caseData.input, timeStep: period * ratio, nSteps: steps(ratio) };
}

export function summarize(ratio: number, time: number[], u: number[]): Run {
  if (time.length !== request(ratio).nSteps + 1 || time.length !== u.length || [...time, ...u].some(v => !Number.isFinite(v))) {
    throw new Error('Invalid solver history');
  }
  const crossings: number[] = [];
  for (let i = 1; i < u.length; i++) {
    if (u[i - 1] < amplitude && u[i] >= amplitude) {
      crossings.push(time[i - 1] + (time[i] - time[i - 1]) * (amplitude - u[i - 1]) / (u[i] - u[i - 1]));
    }
  }
  if (crossings.length < 3) throw new Error('Insufficient crossings');
  return {
    ratio, time, u,
    measuredPeriod: (crossings.at(-1)! - crossings[0]) / (crossings.length - 1),
    maxError: Math.max(...u.map((v, i) => Math.abs(v - exact(time[i])))),
    discreteError: Math.max(...u.map((v, i) => Math.abs(v - discrete(ratio, i)))),
  };
}

export function evaluate(runs: Run[]): EvidenceCheck[] {
  const check = (metric: string, observed: number, tolerance: number) => ({ metric, observed, tolerance, passed: observed < tolerance });
  return runs.flatMap(r => [
    check(`dt/T=${r.ratio}: maximum discrete displacement error (m)`, r.discreteError, 1e-10),
    check(`dt/T=${r.ratio}: measured period relative difference from discrete prediction`, Math.abs(r.measuredPeriod / discretePeriod(r.ratio) - 1), 0.005),
    check(`dt/T=${r.ratio}: maximum continuous displacement error (m) within the phase-lag bound`, r.maxError, phaseLagBound(r.ratio)),
    ...(r.ratio === 0.025 ? [check(`dt/T=${r.ratio}: maximum continuous displacement error (m)`, r.maxError, 0.0005)] : []),
  ]);
}

export async function compute(ratio: number): Promise<Run> {
  const { initSolver, solveTimeHistory3D } = await import('../../../lib/engine/wasm-solver');
  await initSolver();
  const result = solveTimeHistory3D(request(ratio)) as { timeSteps: number[]; nodeHistories: { nodeId: number; ux: number[] }[] };
  const node = result.nodeHistories?.find(n => n.nodeId === 2);
  if (!node) throw new Error('Missing production solver result');
  return summarize(ratio, result.timeSteps, node.ux);
}
