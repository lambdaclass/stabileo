import data from '../../../../../engine/tests/benchmarks/shell_obstacle_course.json';
import type { SolverInput3D } from '../../../lib/engine/types-3d';

// Normalize numeric-keyed maps at the JSON boundary; otherwise every mesh produces
// a distinct huge object union throughout the viewer and editor type checks.
type Example = typeof data.cases[0];
type WireInput = Example['input'];
type NumericMapKeys = 'nodes' | 'materials' | 'supports' | 'quads';
type Input = Omit<WireInput, NumericMapKeys> & {
  [K in NumericMapKeys]: Record<string, NonNullable<WireInput[K][keyof WireInput[K]]>>;
};
export type Case = Omit<Example, 'input'> & { input: Input };
export const cases = data.cases as Case[];
export const nativeOnly = data.nativeOnly;
export const tolerance = data.accuracyTolerance;
export const groups = ['roof', 'cylinder', 'hemisphere'];
export const finest = groups.map(group => cases.filter(c => c.group === group).at(-1)!);
export type Result = { id: string; value: number | null; error: number | null; pass: boolean; failure?: string; displacement?: Record<string, number>[] };

export function inputFor(c: Case): SolverInput3D {
  const input: Record<string, unknown> = { ...c.input };
  for (const key of ['nodes', 'materials', 'sections', 'elements', 'supports', 'quads', 'plates', 'connectors', 'curvedShells']) {
    input[key] = new Map(Object.entries((c.input as Record<string, unknown>)[key] ?? {}).map(([id, value]) => [Number(id), value]));
  }
  return input as unknown as SolverInput3D;
}

export function compare(c: Case, displacements: Record<string, number>[]): Result {
  // Signed, as in the engine test: the roof and the pinched cylinder deflect downward, the
  // hemisphere outward, so a response in the wrong direction fails instead of passing on magnitude.
  const value = displacements.find(d => d.nodeId === c.measurement.node)?.[c.measurement.component] ?? NaN;
  if (!Number.isFinite(value)) throw new Error(`Missing or non-finite displacement: ${c.id}`);
  const direction = c.id.startsWith('hemisphere') ? 1 : -1;
  const error = Math.abs(value / (direction * c.reference) - 1);
  return { id: c.id, value, error, pass: error < c.tolerance, displacement: displacements };
}

export async function runCases(onResult?: (r: Result) => void): Promise<Result[]> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const rows: Result[] = [];
  for (const c of cases) {
    let row: Result;
    try {
      row = compare(c, engine.solve3D(inputFor(c)).displacements as unknown as Record<string, number>[]);
    } catch (e) {
      row = { id: c.id, value: null, error: null, pass: false, failure: String(e) };
    }
    rows.push(row);
    onResult?.(row);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return rows;
}

export function project(x: number, y: number, z: number): number[] {
  return [(x - y) / Math.sqrt(2), z * Math.sqrt(2 / 3) - (x + y) / Math.sqrt(6)];
}

export function viewerData(c: Case, result?: Result) {
  const nodes = Object.values(c.input.nodes).sort((a, b) => a.id - b.id);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const byNode = new Map(result?.displacement?.map(d => [d.nodeId, d]));
  const xy = nodes.flatMap(n => project(n.x, n.y, n.z));
  const cells = Object.values(c.input.quads).flatMap(e => e.nodes.map((n: number) => index.get(n)!));
  const displacement = result?.displacement ? nodes.flatMap(n => {
    const d = byNode.get(n.id)!;
    return project(d.ux, d.uy, d.uz);
  }) : null;
  const values = nodes.map(n => {
    const d = byNode.get(n.id);
    return d ? Math.hypot(d.ux, d.uy, d.uz) : 0;
  });
  return { xy, cells, displacement, values, range: { min: 0, max: Math.max(...values, 1e-12) } };
}
