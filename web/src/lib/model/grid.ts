/**
 * The building's structural grid and its levels.
 *
 * Axes are the lines a structure is set out from: `x = at` or `y = at` in plan, named the way the
 * drawings name them (A, B, C… one way, 1, 2, 3… the other). Levels are named elevations: the
 * floors the engineer talks about, the planes new nodes land on, the floors a floor load acts on.
 *
 * Both are what the user DEFINES, so they live in the model, are saved in the `.ded`, travel in
 * the model code, and are undoable. Neither affects the analysis: editing them keeps the solve.
 *
 * Pure: no store.
 */
import { parseSpacings } from './edit/affine';

export interface GridAxis {
  id: string;
  name: string;
  /** The coordinate the line holds constant: `x` means the line x = at, running along Y. */
  axis: 'x' | 'y';
  at: number;
}

export interface Level {
  id: string;
  name: string;
  z: number;
}

export interface StructuralGrid {
  axes: GridAxis[];
  levels: Level[];
}

export type AxisNaming = 'letters' | 'numbers';

/** Bays as typed ("6; 7,5; 6", "3x6"): the same reading as every other list of spacings. */
export const parseBays = parseSpacings;

/** A, B, …, Z, AA, AB, … */
export function letterName(i: number): string {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** The name `i` steps after `start` in the naming's sequence ("C" + 2 = "E", "3" + 2 = "5"). */
export function axisName(naming: AxisNaming, start: string, i: number): string {
  if (naming === 'numbers') {
    const base = Number.parseInt(start, 10);
    return String((Number.isFinite(base) ? base : 1) + i);
  }
  const s = (start || 'A').toUpperCase();
  let k = 0;
  for (const ch of s) k = k * 26 + (ch.charCodeAt(0) - 64);
  return letterName(k - 1 + i);
}

let seq = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Axes at `origin`, origin + b1, origin + b1 + b2, … */
export function axesFromBays(bays: number[], axis: 'x' | 'y', origin: number, naming: AxisNaming, start: string): GridAxis[] {
  const at = [origin];
  for (const b of bays) at.push(at[at.length - 1]! + b);
  return at.map((v, i) => ({ id: newId('ax'), name: axisName(naming, start, i), axis, at: round(v) }));
}

/** Levels at `base`, base + h1, …; named from `names` where given, else by their index. */
export function levelsFromHeights(heights: number[], base: number, names: string[] = []): Level[] {
  const z = [base];
  for (const h of heights) z.push(z[z.length - 1]! + h);
  return z.map((v, i) => ({ id: newId('lv'), name: names[i]?.trim() || defaultLevelName(i), z: round(v) }));
}

export const defaultLevelName = (i: number) => (i === 0 ? 'N0' : `N${i}`);

const round = (v: number) => Math.round(v * 1e6) / 1e6;

export const axesOf = (g: StructuralGrid | undefined, axis: 'x' | 'y') =>
  (g?.axes ?? []).filter((a) => a.axis === axis).sort((a, b) => a.at - b.at);

export const sortedLevels = (g: StructuralGrid | undefined) => [...(g?.levels ?? [])].sort((a, b) => a.z - b.z);

/** The level at elevation z, within `tol`. */
export function levelAt(g: StructuralGrid | undefined, z: number, tol = 1e-3): Level | undefined {
  return g?.levels.find((l) => Math.abs(l.z - z) <= tol);
}

/** The bays between consecutive axes of one direction, for editing them back as text. */
export function baysText(axes: GridAxis[]): string {
  const s = [...axes].sort((a, b) => a.at - b.at);
  return s.slice(1).map((a, i) => fmt(a.at - s[i]!.at)).join('; ');
}

export const fmt = (v: number) => String(Math.round(v * 1000) / 1000).replace('.', ',');

/**
 * Snap a plan point to the grid: to an intersection within `tol`, else onto the nearest axis
 * within `tol`. Null when neither is near.
 */
export function snapToAxes(g: StructuralGrid | undefined, x: number, y: number, tol: number): { x: number; y: number; kind: 'intersection' | 'axis'; label: string } | null {
  const xs = axesOf(g, 'x'), ys = axesOf(g, 'y');
  const nx = nearest(xs, x), ny = nearest(ys, y);
  const okX = nx && Math.abs(nx.at - x) <= tol, okY = ny && Math.abs(ny.at - y) <= tol;
  if (okX && okY) return { x: nx.at, y: ny.at, kind: 'intersection', label: `${nx.name}-${ny.name}` };
  if (okX && (!okY)) return { x: nx.at, y, kind: 'axis', label: nx.name };
  if (okY) return { x, y: ny!.at, kind: 'axis', label: ny!.name };
  return null;
}

function nearest(axes: GridAxis[], v: number): GridAxis | undefined {
  let best: GridAxis | undefined;
  for (const a of axes) if (!best || Math.abs(a.at - v) < Math.abs(best.at - v)) best = a;
  return best;
}

/** The label of a plan point that sits on the grid ("B-3", "B", or ""). */
export function gridLabel(g: StructuralGrid | undefined, x: number, y: number, tol = 1e-3): string {
  const s = snapToAxes(g, x, y, tol);
  return s ? s.label : '';
}

/** Problems with a grid as typed: repeated names and axes on top of each other. */
export function gridIssues(g: StructuralGrid): string[] {
  const out: string[] = [];
  for (const axis of ['x', 'y'] as const) {
    const a = axesOf(g, axis);
    const names = new Set<string>();
    for (let i = 0; i < a.length; i++) {
      if (names.has(a[i]!.name)) out.push(`duplicateName:${a[i]!.name}`);
      names.add(a[i]!.name);
      if (i > 0 && Math.abs(a[i]!.at - a[i - 1]!.at) < 1e-6) out.push(`coincident:${a[i - 1]!.name}/${a[i]!.name}`);
    }
  }
  const lv = sortedLevels(g);
  for (let i = 1; i < lv.length; i++) if (Math.abs(lv[i]!.z - lv[i - 1]!.z) < 1e-6) out.push(`coincident:${lv[i - 1]!.name}/${lv[i]!.name}`);
  return out;
}

// ─── Columns and beams between axes ───────────────────────────────

export interface FrameBetweenAxes {
  /** Inclusive ranges, as axis ids. */
  x: [string, string];
  y: [string, string];
  levels: [string, string];
  columns: { sectionId: number; materialId: number } | null;
  beamsX: { sectionId: number; materialId: number } | null;
  beamsY: { sectionId: number; materialId: number } | null;
}

export interface FrameLayout {
  nodes: Array<{ id: number; x: number; y: number; z: number }>;
  members: Array<{ nodeI: number; nodeJ: number; sectionId: number; materialId: number; role: 'column' | 'beamX' | 'beamY' }>;
}

/**
 * The columns at every intersection of the ranges, between consecutive levels of the range, and
 * the beams along the axes at every level of the range above the lowest. Node ids are local to
 * the layout (1, 2, …); inserting it welds them onto the model's nodes where they coincide.
 */
export function frameBetweenAxes(g: StructuralGrid, spec: FrameBetweenAxes): FrameLayout | null {
  const range = <T extends { id: string }>(list: T[], [a, b]: [string, string]) => {
    const i = list.findIndex((v) => v.id === a), j = list.findIndex((v) => v.id === b);
    if (i < 0 || j < 0) return [];
    return list.slice(Math.min(i, j), Math.max(i, j) + 1);
  };
  const xs = range(axesOf(g, 'x'), spec.x), ys = range(axesOf(g, 'y'), spec.y), lv = range(sortedLevels(g), spec.levels);
  if (xs.length === 0 || ys.length === 0 || lv.length === 0) return null;
  const nodes: FrameLayout['nodes'] = [];
  const idAt = new Map<string, number>();
  const node = (i: number, j: number, k: number) => {
    const key = `${i},${j},${k}`;
    let id = idAt.get(key);
    if (id === undefined) { id = nodes.length + 1; idAt.set(key, id); nodes.push({ id, x: xs[i]!.at, y: ys[j]!.at, z: lv[k]!.z }); }
    return id;
  };
  const members: FrameLayout['members'] = [];
  for (let k = 0; k < lv.length; k++) {
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) {
      if (spec.columns && k > 0) members.push({ nodeI: node(i, j, k - 1), nodeJ: node(i, j, k), ...spec.columns, role: 'column' });
      if (k === 0 && lv.length > 1) continue;
      if (spec.beamsX && i > 0) members.push({ nodeI: node(i - 1, j, k), nodeJ: node(i, j, k), ...spec.beamsX, role: 'beamX' });
      if (spec.beamsY && j > 0) members.push({ nodeI: node(i, j - 1, k), nodeJ: node(i, j, k), ...spec.beamsY, role: 'beamY' });
    }
  }
  return members.length > 0 ? { nodes, members } : null;
}

// ─── A grid read off an existing model ────────────────────────────

/**
 * Axes and levels read off a model that has none: a level at every elevation that holds at least
 * two nodes, and an axis at every plan coordinate that holds a column (a vertical member). With
 * no columns, every plan coordinate shared by two nodes. Coordinates within 1 mm are one.
 */
export function gridFromModel(
  nodes: Iterable<{ id: number; x: number; y: number; z?: number }>,
  members: Iterable<{ nodeI: number; nodeJ: number }>,
  naming: { x: AxisNaming; y: AxisNaming } = { x: 'numbers', y: 'letters' },
): StructuralGrid {
  const byId = new Map([...nodes].map((n) => [n.id, n]));
  const cluster = (vals: number[], minCount: number) => {
    const s = [...vals].sort((a, b) => a - b);
    const out: number[] = [];
    let run: number[] = [];
    const flush = () => { if (run.length >= minCount) out.push(round(run.reduce((a, b) => a + b, 0) / run.length)); run = []; };
    for (const v of s) { if (run.length && v - run[run.length - 1]! > 1e-3) flush(); run.push(v); }
    flush();
    return out;
  };
  const cols: Array<{ x: number; y: number }> = [];
  for (const m of members) {
    const a = byId.get(m.nodeI), b = byId.get(m.nodeJ);
    if (!a || !b) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-3 && Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-3) cols.push({ x: a.x, y: a.y });
  }
  const plan = cols.length > 0 ? cols : [...byId.values()];
  const minCount = cols.length > 0 ? 1 : 2;
  const xs = cluster(plan.map((p) => p.x), minCount).slice(0, 60);
  const ys = cluster(plan.map((p) => p.y), minCount).slice(0, 60);
  const zs = cluster([...byId.values()].map((n) => n.z ?? 0), 2).slice(0, 200);
  const start = (n: AxisNaming) => (n === 'letters' ? 'A' : '1');
  return {
    axes: [
      ...xs.map((at, i) => ({ id: newId('ax'), name: axisName(naming.x, start(naming.x), i), axis: 'x' as const, at })),
      ...ys.map((at, i) => ({ id: newId('ax'), name: axisName(naming.y, start(naming.y), i), axis: 'y' as const, at })),
    ],
    levels: zs.map((z, i) => ({ id: newId('lv'), name: defaultLevelName(i), z })),
  };
}
