import shared from '../../../../../engine/tests/benchmarks/navier_plate.json';
import type { SolverInput3D, SolverNode3D, SolverMaterial, SolverSupport3D, SolverLoad3D, SolverPlateElement, SolverQuadElement } from '../../../lib/engine/types-3d';

export const parameters = shared.parameters;
type Case = {
  family: 'DKT' | 'MITC4'; n: number; center: number;
  input: {
    nodes: Record<string, SolverNode3D>; materials: Record<string, SolverMaterial>;
    supports: Record<string, SolverSupport3D>; loads: SolverLoad3D[];
    plates: Record<string, SolverPlateElement>; quads: Record<string, SolverQuadElement>;
  };
};
export const cases = shared.cases as unknown as Case[];
export type Row = { family: string; n: number; center_mm: number; values: number[] };
export const hardCases = cases.flatMap((c, index) => c.family === 'MITC4' ? [index] : []);

export function hardSupports(supports: Record<string, SolverSupport3D>, nodes: Record<string, SolverNode3D>): Record<string, SolverSupport3D> {
  const { a, b } = parameters;
  const on = (v: number, edge: number) => Math.abs(v - edge) < 1e-9;
  return Object.fromEntries(Object.entries(supports).map(([id, s]) => {
    const node = nodes[String(s.nodeId)];
    return [id, { ...s, rrx: on(node.x, 0) || on(node.x, a), rry: on(node.y, 0) || on(node.y, b) }];
  }));
}

export function solverInput(index: number, hard = false): SolverInput3D {
  const wire = cases[index].input;
  const map = <T>(record: Record<string, T>) => new Map(Object.entries(record).map(([id, value]) => [Number(id), value]));
  return {
    nodes: map(wire.nodes), materials: map(wire.materials), sections: new Map(), elements: new Map(),
    supports: map(hard ? hardSupports(wire.supports, wire.nodes) : wire.supports), loads: wire.loads,
    plates: map(wire.plates), quads: map(wire.quads),
  };
}

export function mesh(index: number) {
  const c = cases[index];
  const nodes = Object.values(c.input.nodes).sort((a, b) => a.id - b.id);
  const cells = Object.values(c.family === 'DKT' ? c.input.plates : c.input.quads).flatMap(e => e.nodes.map((id: number) => id - 1));
  return { xy: nodes.flatMap(n => [n.x, n.y]), cells, cellSize: c.family === 'DKT' ? 3 as const : 4 as const };
}

function oddSeries(terms: number, power: number) {
  const { a, b } = parameters;
  let sum = 0;
  for (let i = 0; i < terms; i++) for (let j = 0; j < terms; j++) {
    const m = 2 * i + 1, n = 2 * j + 1;
    sum += (-1) ** (i + j) / (m * n * ((m / a) ** 2 + (n / b) ** 2) ** power);
  }
  return sum;
}

export function navierCenter(terms = parameters.terms): number {
  const { e, nu, thickness, pressure } = parameters;
  const d = e * 1000 * thickness ** 3 / (12 * (1 - nu ** 2));
  return 1000 * 16 * pressure * oddSeries(terms, 2) / (Math.PI ** 6 * d);
}

export function mindlinCenter(terms = parameters.mindlin_terms): number {
  const { e, nu, thickness, pressure, shear_correction } = parameters;
  const shear = shear_correction * e * 1000 / (2 * (1 + nu)) * thickness;
  return navierCenter(terms) + 1000 * 16 * pressure * oddSeries(terms, 1) / (Math.PI ** 4 * shear);
}

export const difference = (row: Row, reference = parameters.reference_mm) => 100 * (row.center_mm / reference - 1);

export function convergence(rows: Row[]) {
  return parameters.meshes.map(n => {
    const pair = rows.filter(row => row.n === n);
    return { n, best: pair.length === 2 ? pair.reduce((a, b) => Math.abs(difference(a)) < Math.abs(difference(b)) ? a : b).family : null };
  });
}

export function reduction(rows: Row[], family: string, reference = parameters.reference_mm) {
  const coarse = rows.find(row => row.family === family && row.n === 4);
  const fine = rows.find(row => row.family === family && row.n === 16);
  return coarse && fine ? Math.abs(difference(coarse, reference) / difference(fine, reference)) : null;
}

export type RunState = 'replay' | 'running' | 'complete' | 'partial' | 'cancelled' | 'failed';

export function runState(source: 'replay' | 'live', running: boolean, failed: boolean, count: number): RunState {
  if (source === 'replay') return 'replay';
  if (running) return 'running';
  if (failed) return 'failed';
  if (count === cases.length) return 'complete';
  return count === 0 ? 'cancelled' : 'partial';
}
