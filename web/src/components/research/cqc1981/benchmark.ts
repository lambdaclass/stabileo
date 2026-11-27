import type { SolverInput3D } from '../../../lib/engine/types-3d';
import type { SpectralModeInput3D } from '../../../lib/engine/dynamics/requests';
import shared from '../../../../../engine/tests/benchmarks/cqc_1981.json';

export const benchmark = shared;
export type SpectrumResult = { baseShear: number; displacements: { nodeId: number; ux: number }[] };
export type Results = { modal: { modes: SpectralModeInput3D[] }; SRSS: SpectrumResult; CQC: SpectrumResult };

export function model(): SolverInput3D {
  const map = <T>(data: Record<string, T>) => new Map(Object.entries(data).map(([id, value]) => [Number(id), structuredClone(value)]));
  return {
    nodes: map(shared.solver.nodes), materials: map(shared.solver.materials),
    sections: map(shared.solver.sections),
    elements: new Map(Object.values(shared.solver.elements).map(e => [e.id, {
      ...e, type: e.type as 'frame' | 'truss',
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false,
      releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    }])),
    supports: map(shared.solver.supports), loads: [],
    constraints: structuredClone(shared.solver.constraints) as SolverInput3D['constraints'],
    masses: structuredClone(shared.solver.masses),
  };
}

export const DAMPING = [0.02, 0.05, 0.1, 0.2];

export type ClosedForm = typeof shared.reference;

export function closedForm(xi: number): ClosedForm {
  const [a, b, d, mass] = [1020, -20, 1230, 10];
  const roots = [-1, 1].map(sign => (a + d + sign * Math.hypot(a - d, 2 * b)) / (2 * mass));
  const omega = roots.map(Math.sqrt);
  const forces: number[] = [];
  const shapes: number[][] = [];
  for (const root of roots) {
    const raw = [1, (mass * root - a) / b];
    const norm = Math.sqrt(mass * raw.reduce((s, v) => s + v * v, 0));
    const vector = raw.map(v => v / norm);
    const gamma = mass * vector.reduce((s, v) => s + v, 0);
    forces.push(gamma * gamma);
    shapes.push(vector.map(v => v * gamma / root));
  }
  const r = omega[1] / omega[0];
  const rho = 8 * xi ** 2 * (1 + r) * r ** 1.5 / ((1 - r * r) ** 2 + 4 * xi ** 2 * r * (1 + r) ** 2);
  const combine = (values: number[], correlation: number) => Math.sqrt(values[0] ** 2 + values[1] ** 2 + 2 * correlation * values[0] * values[1]);
  return {
    frequencies: omega.map(w => w / (2 * Math.PI)), rho, modalBaseShear: forces,
    SRSS: combine(forces, 0), CQC: combine(forces, rho),
    roofSRSS: [0, 1].map(i => combine(shapes.map(s => s[i]), 0)),
    roofCQC: [0, 1].map(i => combine(shapes.map(s => s[i]), rho)),
  };
}

export async function recompute(xi = shared.xi): Promise<Results> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const solver = model();
  const densities = new Map([[1, 0]]);
  const modal = engine.solveModal3D(solver, densities, shared.numModes);
  const config = { solver, densities, modes: modal.modes, spectrum: shared.spectrum, direction: 'X' as const, xi };
  return { modal, SRSS: engine.solveSpectral3D({ ...config, rule: 'SRSS' }), CQC: engine.solveSpectral3D({ ...config, rule: 'CQC' }) };
}

export function difference(actual: number, reference: number): number {
  return 100 * (actual - reference) / reference;
}

export function projection(result: SpectrumResult, amplitude = 1) {
  const nodes = Object.values(shared.solver.nodes);
  const displacements = new Map(result.displacements.map(d => [d.nodeId, d.ux]));
  return {
    xy: nodes.flatMap(n => [n.x + 0.45 * n.y, n.z + 0.25 * n.y]),
    cells: Object.values(shared.solver.elements).flatMap(e => [e.nodeI - 1, e.nodeJ - 1]),
    displacement: nodes.flatMap(n => [amplitude * (displacements.get(n.id) ?? 0), 0]),
    values: nodes.map(n => 1000 * (displacements.get(n.id) ?? 0)),
  };
}

export function modalShears(results: Results): number[] {
  const sa = shared.spectrum.points[0].sa;
  return results.modal.modes.map(m => m.effectiveMassX * sa);
}

export function impliedRho(results: Results): number {
  const [v1, v2] = modalShears(results);
  return (results.CQC.baseShear ** 2 - results.SRSS.baseShear ** 2) / (2 * v1 * v2);
}

export function roof(result: SpectrumResult): number[] {
  return [5, 6].map(id => Math.abs(result.displacements.find(d => d.nodeId === id)!.ux));
}
