import shared from '../../../../../engine/tests/benchmarks/navier_plate.json';
import type { SolverInput3D, SolverNode3D, SolverMaterial, SolverSupport3D, SolverLoad3D, SolverPlateElement, SolverQuadElement } from '../../../lib/engine/types-3d';

export const parameters = shared.parameters;
export type Family = 'DKT' | 'MITC4';
type Wire = {
  nodes: Record<string, SolverNode3D>; materials: Record<string, SolverMaterial>;
  sections: Record<string, never>; elements: Record<string, never>;
  supports: Record<string, SolverSupport3D>; loads: SolverLoad3D[];
  plates: Record<string, SolverPlateElement>; quads: Record<string, SolverQuadElement>;
};
type Case = { family: Family; n: number; center: number; input: Wire };
export const cases = shared.cases as unknown as Case[];
export type Row = { family: string; n: number; center_mm: number; values: number[] };
export const hardCases = cases.flatMap((c, index) => c.family === 'MITC4' ? [index] : []);

/** One plate the page can solve: the paper's 3 × 5 m plate with a chosen element, mesh, support and thickness. */
export type Plate = { family: Family; n: number; hard: boolean; thickness: number };
export const PAPER_PLATE: Plate = { family: 'MITC4', n: 16, hard: false, thickness: parameters.thickness };
export const LIMITS = { n: { min: 2, max: 32, step: 2 }, thickness: { min: 0.02, max: 0.5 } };

export const THICKNESSES = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5];

export function validPlate(p: Plate): boolean {
  return typeof p.hard === 'boolean' && (p.family === 'DKT' || p.family === 'MITC4') && Number.isInteger(p.n) && p.n >= LIMITS.n.min && p.n <= LIMITS.n.max && p.n % 2 === 0
    && THICKNESSES.includes(p.thickness);
}

/** The plate builder of engine/tests/benchmarks/navier_plate.rs, operation for operation, so the fixture is reproduced exactly. */
export function build(family: Family, n: number, hard: boolean, thickness = parameters.thickness): { input: Wire; center: number } {
  const { a, b, pressure: q, e, nu } = parameters;
  const id = (i: number, j: number) => i * (n + 1) + j + 1;
  const nodes: Wire['nodes'] = {}, supports: Wire['supports'] = {}, plates: Wire['plates'] = {}, quads: Wire['quads'] = {};
  const force = new Array<number>((n + 1) * (n + 1) + 1).fill(0);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const k = id(i, j);
      nodes[k] = { id: k, x: a * i / n, y: b * j / n, z: 0 };
      const xEdge = i === 0 || i === n, yEdge = j === 0 || j === n;
      if (xEdge || yEdge) {
        supports[k] = { nodeId: k, rx: k === 1, ry: k === 1 || (i === n && j === 0), rz: true, rrx: hard && xEdge, rry: hard && yEdge, rrz: false } as SolverSupport3D;
      }
    }
  }
  const area = a * b / (n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const corners = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
      if (family === 'MITC4') {
        const k = Object.keys(quads).length + 1;
        quads[k] = { id: k, nodes: corners as [number, number, number, number], materialId: 1, thickness };
        for (const c of corners) force[c] += q * area / 4;
      } else {
        for (const tri of [[corners[0], corners[1], corners[2]], [corners[0], corners[2], corners[3]]]) {
          const k = Object.keys(plates).length + 1;
          plates[k] = { id: k, nodes: tri as [number, number, number], materialId: 1, thickness };
          for (const c of tri) force[c] += q * area / 2 / 3;
        }
      }
    }
  }
  const loads: SolverLoad3D[] = [];
  for (let k = 1; k < force.length; k++) loads.push({ type: 'nodal', data: { nodeId: k, fx: 0, fy: 0, fz: -force[k], mx: 0, my: 0, mz: 0 } } as SolverLoad3D);
  const input: Wire = { nodes, materials: { 1: { id: 1, e, nu } as SolverMaterial }, sections: {}, elements: {}, supports, loads, plates, quads };
  return { input, center: id(n / 2, n / 2) };
}

const map = <T>(record: Record<string, T>) => new Map(Object.entries(record).map(([id, value]) => [Number(id), value]));

export function toSolverInput(wire: Wire): SolverInput3D {
  return {
    nodes: map(wire.nodes), materials: map(wire.materials), sections: new Map(), elements: new Map(),
    supports: map(wire.supports), loads: wire.loads, plates: map(wire.plates), quads: map(wire.quads),
  };
}

export function hardSupports(supports: Record<string, SolverSupport3D>, nodes: Record<string, SolverNode3D>): Record<string, SolverSupport3D> {
  const { a, b } = parameters;
  const on = (v: number, edge: number) => Math.abs(v - edge) < 1e-9;
  return Object.fromEntries(Object.entries(supports).map(([id, s]) => {
    const node = nodes[String(s.nodeId)];
    return [id, { ...s, rrx: on(node.x, 0) || on(node.x, a), rry: on(node.y, 0) || on(node.y, b) }];
  }));
}

/** A fixture case as the solver reads it; `hard` restrains the rotation along each edge as well. */
export function solverInput(index: number, hard = false): SolverInput3D {
  const wire = cases[index].input;
  return toSolverInput(hard ? { ...wire, supports: hardSupports(wire.supports, wire.nodes) } : wire);
}

export function geometry(input: Wire, family: Family) {
  const nodes = Object.values(input.nodes).sort((p, q) => p.id - q.id);
  const cells = Object.values(family === 'DKT' ? input.plates : input.quads).flatMap(e => e.nodes.map((id: number) => id - 1));
  return { xy: nodes.flatMap(n => [n.x, n.y]), cells, cellSize: family === 'DKT' ? 3 as const : 4 as const };
}

export const mesh = (index: number) => geometry(cases[index].input, cases[index].family);

function oddSeries(terms: number, power: number) {
  const { a, b } = parameters;
  let sum = 0;
  for (let i = 0; i < terms; i++) for (let j = 0; j < terms; j++) {
    const m = 2 * i + 1, n = 2 * j + 1;
    sum += (-1) ** (i + j) / (m * n * ((m / a) ** 2 + (n / b) ** 2) ** power);
  }
  return sum;
}

/** Flexural rigidity D = Et³ / [12(1 − ν²)] in kN·m (the case stores E in MPa). */
export const rigidity = (thickness = parameters.thickness) => parameters.e * 1000 * thickness ** 3 / (12 * (1 - parameters.nu ** 2));

export function navierCenter(terms = parameters.terms, thickness = parameters.thickness): number {
  return 1000 * 16 * parameters.pressure * oddSeries(terms, 2) / (Math.PI ** 6 * rigidity(thickness));
}

export function mindlinCenter(terms = parameters.mindlin_terms, thickness = parameters.thickness): number {
  const { e, nu, pressure, shear_correction } = parameters;
  const shear = shear_correction * e * 1000 / (2 * (1 + nu)) * thickness;
  return navierCenter(terms, thickness) + 1000 * 16 * pressure * oddSeries(terms, 1) / (Math.PI ** 4 * shear);
}

/** The series this plate converges to, if one is known: DKT to the thin-plate series, MITC4 with hard support to Reissner–Mindlin. */
export function seriesFor(p: Plate): { kind: 'kirchhoff' | 'mindlin'; mm: number } | null {
  if (p.family === 'DKT') return { kind: 'kirchhoff', mm: p.thickness === parameters.thickness ? parameters.reference_mm : navierCenter(parameters.terms, p.thickness) };
  if (p.hard) return { kind: 'mindlin', mm: p.thickness === parameters.thickness ? parameters.mindlin_reference_mm : mindlinCenter(200, p.thickness) };
  return null;
}

export const difference = (row: { center_mm: number }, reference = parameters.reference_mm) => 100 * (row.center_mm / reference - 1);

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

export const richardson = (coarse: number, fine: number) => fine + (fine - coarse) / 3;

export type RunState = 'replay' | 'running' | 'complete' | 'partial' | 'cancelled' | 'failed';

export function runState(source: 'replay' | 'live', running: boolean, failed: boolean, count: number): RunState {
  if (source === 'replay') return 'replay';
  if (running) return 'running';
  if (failed) return 'failed';
  if (count === cases.length) return 'complete';
  return count === 0 ? 'cancelled' : 'partial';
}

/** Downward centre displacement and every node's, in mm, from a solver result. */
export function downward(input: Wire, displacements: { nodeId: number; uz: number }[]): number[] {
  const byId = new Map(displacements.map(d => [d.nodeId, d.uz]));
  if (byId.size !== displacements.length || byId.size !== Object.keys(input.nodes).length) throw new Error('Incomplete or duplicate displacement field');
  return Object.values(input.nodes).sort((p, q) => p.id - q.id).map(n => {
    const uz = byId.get(n.id);
    if (uz === undefined || !Number.isFinite(uz)) throw new Error(`node ${n.id}`);
    return -1000 * uz;
  });
}
