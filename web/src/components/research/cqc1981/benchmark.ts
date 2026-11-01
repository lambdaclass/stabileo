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

export async function recompute(): Promise<Results> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const solver = model();
  const densities = new Map([[1, 0]]);
  const modal = engine.solveModal3D(solver, densities, shared.numModes);
  const config = { solver, densities, modes: modal.modes, spectrum: shared.spectrum, direction: 'X' as const, xi: shared.xi };
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
