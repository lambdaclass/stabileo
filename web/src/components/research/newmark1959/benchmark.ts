import caseData from '../../../../../engine/tests/benchmarks/newmark_1959.json';

export const benchmark = caseData;
export const period = 2 * Math.PI / caseData.reference.omega;
export const amplitude = caseData.reference.force / caseData.reference.stiffness;
export const exact = (time: number) => amplitude * (1 - Math.cos(caseData.reference.omega * time));
export const discretePeriod = (ratio: number) => period * Math.PI * ratio / Math.atan(Math.PI * ratio);
export type Run = { ratio: number; time: number[]; u: number[]; measuredPeriod: number; maxError: number };

export function request(ratio: number) {
  if (!caseData.ratios.includes(ratio)) throw new Error('Unsupported time step');
  return { ...caseData.input, timeStep: period * ratio, nSteps: Math.round(caseData.cycles / ratio) };
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
  return { ratio, time, u, measuredPeriod: (crossings.at(-1)! - crossings[0]) / (crossings.length - 1), maxError: Math.max(...u.map((v, i) => Math.abs(v - exact(time[i])))) };
}

export async function compute(ratio: number): Promise<Run> {
  const { initSolver, solveTimeHistory3D } = await import('../../../lib/engine/wasm-solver');
  await initSolver();
  const result = solveTimeHistory3D(request(ratio)) as { timeSteps: number[]; nodeHistories: { nodeId: number; ux: number[] }[] };
  const node = result.nodeHistories?.find(n => n.nodeId === 2);
  if (!node) throw new Error('Missing production solver result');
  return summarize(ratio, result.timeSteps, node.ux);
}
