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

export function solverInput(index: number): SolverInput3D {
  const wire = cases[index].input;
  const map = <T>(record: Record<string, T>) => new Map(Object.entries(record).map(([id, value]) => [Number(id), value]));
  return {
    nodes: map(wire.nodes), materials: map(wire.materials), sections: new Map(), elements: new Map(),
    supports: map(wire.supports), loads: wire.loads,
    plates: map(wire.plates), quads: map(wire.quads),
  };
}

export function mesh(index: number) {
  const c = cases[index];
  const nodes = Object.values(c.input.nodes).sort((a, b) => a.id - b.id);
  const cells = Object.values(c.family === 'DKT' ? c.input.plates : c.input.quads).flatMap(e => e.nodes.map((id: number) => id - 1));
  return { xy: nodes.flatMap(n => [n.x, n.y]), cells, cellSize: c.family === 'DKT' ? 3 as const : 4 as const };
}

export function navierCenter(terms = parameters.terms): number {
  const { a, b, e, nu, thickness, pressure } = parameters;
  const d = e * 1000 * thickness ** 3 / (12 * (1 - nu ** 2));
  let sum = 0;
  for (let i = 0; i < terms; i++) for (let j = 0; j < terms; j++) {
    const m = 2 * i + 1, n = 2 * j + 1;
    sum += (-1) ** (i + j) / (m * n * ((m / a) ** 2 + (n / b) ** 2) ** 2);
  }
  return 1000 * 16 * pressure * sum / (Math.PI ** 6 * d);
}

export const difference = (row: Row) => 100 * (row.center_mm / parameters.reference_mm - 1);

export function convergence(rows: Row[]) {
  return parameters.meshes.map(n => {
    const pair = rows.filter(row => row.n === n);
    return { n, best: pair.length === 2 ? pair.reduce((a, b) => Math.abs(difference(a)) < Math.abs(difference(b)) ? a : b).family : null };
  });
}

export function reduction(rows: Row[], family: string) {
  const coarse = rows.find(row => row.family === family && row.n === 4);
  const fine = rows.find(row => row.family === family && row.n === 16);
  return coarse && fine ? Math.abs(difference(coarse) / difference(fine)) : null;
}
