/**
 * A physical plate's results read as one object: the largest and smallest of each quantity over
 * all the elements of its mesh, where each one occurs, and in which result set.
 *
 * ── In the plate's axes ───────────────────────────────────────────
 *
 * Each element of a mesh has local axes of its own (x along its first edge), so its local moments
 * cannot be compared with its neighbour's. The extremes here are read in the plate's axes: u along
 * the outline's first side, n its normal, v = n × u (`model/physical/plate.ts#frameOfLoop`). Each
 * element's moments and membrane forces in global axes (`shell-results.ts`) are turned to them.
 * A curved quad has no global components here, and is counted as left out.
 *
 * Nothing is smoothed: the values are the elements' own, at their centres, so a jump between two
 * elements stays a jump. The deflection is the nodes' displacement along n.
 *
 * Pure.
 */
import { shellCentreRows, type ShellModel, type Tensor6 } from './shell-results';
import type { AnalysisResults3D } from './types-3d';

type Vec = [number, number, number];

export type PlateQuantity = 'muu' | 'mvv' | 'muv' | 'nuu' | 'nvv' | 'nuv' | 'w';
export const PLATE_QUANTITIES: readonly PlateQuantity[] = ['muu', 'mvv', 'muv', 'nuu', 'nvv', 'nuv', 'w'];

export interface PlateExtreme { value: number; at: string; source: string }
export interface PlateSummary {
  rows: Array<{ quantity: PlateQuantity; max: PlateExtreme | null; min: PlateExtreme | null }>;
  /** Elements whose global components are unknown here (curved quads), left out of the moments. */
  leftOut: number;
  elements: number;
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const apply = (t: Tensor6, v: Vec): Vec => [t.xx * v[0] + t.xy * v[1] + t.zx * v[2], t.xy * v[0] + t.yy * v[1] + t.yz * v[2], t.zx * v[0] + t.yz * v[1] + t.zz * v[2]];
const comp = (t: Tensor6, a: Vec, b: Vec) => dot(a, apply(t, b));

/**
 * The extremes of a plate over one or more result sets. `shellKeys` are its elements ("q12",
 * "p3"); `nodes` the nodes of its mesh; `frame` its axes; `sets` each result set with the name it
 * is shown by.
 */
export function plateSummary(
  sets: ReadonlyArray<{ name: string; result: AnalysisResults3D }>,
  m: ShellModel,
  shellKeys: readonly string[],
  nodes: readonly number[],
  frame: { u: Vec; v: Vec; n: Vec },
): PlateSummary {
  const keys = new Set(shellKeys);
  const best = new Map<PlateQuantity, { max: PlateExtreme | null; min: PlateExtreme | null }>(PLATE_QUANTITIES.map((q) => [q, { max: null, min: null }]));
  const take = (q: PlateQuantity, value: number, at: string, source: string) => {
    if (!Number.isFinite(value)) return;
    const b = best.get(q)!;
    if (!b.max || value > b.max.value) b.max = { value, at, source };
    if (!b.min || value < b.min.value) b.min = { value, at, source };
  };
  let leftOut = 0;
  const nodeSet = new Set(nodes);
  for (const { name, result } of sets) {
    for (const row of shellCentreRows(result, m)) {
      const key = `${row.kind === 'quad' ? 'q' : 'p'}${row.id}`;
      if (!keys.has(key)) continue;
      if (!row.global) { if (sets[0]!.result === result) leftOut++; continue; }
      const { moment, stress } = row.global;
      const t = row.thickness;
      take('muu', comp(moment, frame.u, frame.u), key, name);
      take('mvv', comp(moment, frame.v, frame.v), key, name);
      take('muv', comp(moment, frame.u, frame.v), key, name);
      take('nuu', comp(stress, frame.u, frame.u) * t, key, name);
      take('nvv', comp(stress, frame.v, frame.v) * t, key, name);
      take('nuv', comp(stress, frame.u, frame.v) * t, key, name);
    }
    for (const d of result.displacements) {
      if (!nodeSet.has(d.nodeId)) continue;
      take('w', d.ux * frame.n[0] + d.uy * frame.n[1] + d.uz * frame.n[2], `N${d.nodeId}`, name);
    }
  }
  return { rows: PLATE_QUANTITIES.map((q) => ({ quantity: q, ...best.get(q)! })), leftOut, elements: keys.size };
}
