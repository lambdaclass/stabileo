/**
 * A plate's shape edited on its drawing: a side curved by its sagitta, cells of its mesh taken out
 * as a hole or a notch in the outline, a hole closed again. Each edit is one undo step and meshes
 * the plate again when it had a mesh, so what is drawn is what is analysed.
 */
import { modelStore } from './model.svelte';
import {
  applyPlateMeshes, arcEdgeBetween, planPlateMesh, plateEntry, plateSides, plateStatus, setPlateLoops, setPlateSideArc,
} from './physical-plates';
import { plateGeometry, plateLoops, type PlateFrame, type PlateProblem } from '../model/physical/plate';
import type { Vec3 } from '../model/edit/affine';
import { frameAlong } from '../model/edit/grid-mesh';

export type PlateShapeProblem = PlateProblem | 'tooDeep' | 'followsMember' | 'wholePlate' | 'split' | 'pinch' | 'curvedOutline' | 'nothingChosen';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const pos = (id: number): Vec3 | null => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : null; };

/** The mesh a plate is drawn with for editing: its own when current, else the one its settings would give. */
export interface PlateFigure {
  points: Vec3[];
  cells: number[][];
  /** The model node at each point, when the figure is the plate's own mesh. */
  nodes: Array<number | null>;
  frame: PlateFrame;
  source: 'mesh' | 'plan';
}

export function plateFigure(id: number): PlateFigure | null {
  const e = plateEntry(id);
  const geo = e ? plateGeometry(modelStore, e.group) : null;
  if (!e || !geo) return null;
  // Drawn along global X (Y for a wall across it), not the outline's first side, which turns with every edit of it.
  const frame = frameAlong(geo.frame, [1, 0, 0]);
  const shells = [...(e.group.members.quads ?? []).map((q) => modelStore.quads.get(q)?.nodes), ...(e.group.members.plates ?? []).map((q) => modelStore.plates.get(q)?.nodes)];
  // Shells that came with the model are no mesher's cells (a whole bay may be one): drawn as the mesher would make them.
  if (plateStatus(id) === 'current' && !e.surface.meshed?.original && shells.length && shells.every(Boolean)) {
    const index = new Map<number, number>(), points: Vec3[] = [], nodes: number[] = [];
    const at = (n: number) => { let k = index.get(n); if (k === undefined) { k = points.length; index.set(n, k); points.push(pos(n)!); nodes.push(n); } return k; };
    return { points, cells: shells.map((c) => c!.map(at)), nodes, frame, source: 'mesh' };
  }
  const plan = planPlateMesh(id);
  if (!plan?.mesh) return null;
  return { points: plan.mesh.points, cells: plan.mesh.cells, nodes: plan.mesh.points.map(() => null), frame, source: 'plan' };
}

/** Mesh the plate again with its own settings, when it had a mesh; a mesh with loads put by hand on its elements is left for its panel. */
function remeshIfMeshed(id: number): void {
  const e = plateEntry(id);
  const shells = (e?.group.members.quads?.length ?? 0) + (e?.group.members.plates?.length ?? 0);
  if (!e || !shells) return;
  const plan = planPlateMesh(id);
  if (plan?.mesh && plan.localLoads === 0) applyPlateMeshes([plan]);
}

/** Outward in the plate's plane, square to side a→b. */
function outward(frame: PlateFrame, a: Vec3, b: Vec3, centroid: Vec3): Vec3 {
  const d = cross(sub(b, a), frame.n);
  const l = len(d) || 1;
  const n: Vec3 = [d[0] / l, d[1] / l, d[2] / l];
  const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return dot(n, sub(m, centroid)) >= 0 ? n : [-n[0], -n[1], -n[2]];
}

function centroidOf(ids: number[]): Vec3 {
  const ps = ids.map(pos).filter((p): p is Vec3 => !!p);
  return ps.reduce<Vec3>((s, p) => [s[0] + p[0] / ps.length, s[1] + p[1] / ps.length, s[2] + p[2] / ps.length], [0, 0, 0]);
}

/** Each outline side: its corners, length, and sagitta (positive bulging out, 0 straight); whether it follows a curved member. */
export function plateSideShapes(id: number): Array<{ from: number; to: number; mid: number | null; length: number; sagitta: number; followsMember: boolean }> {
  const e = plateEntry(id);
  const geo = e ? plateGeometry(modelStore, e.group) : null;
  if (!e || !geo) return [];
  const c = centroidOf(plateLoops(e.group).outer);
  return plateSides(id).map((s) => {
    const a = pos(s.from)!, b = pos(s.to)!;
    const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const mid = s.mid !== null ? pos(s.mid) : null;
    return {
      ...s, length: len(sub(b, a)), sagitta: mid ? dot(sub(mid, m), outward(geo.frame, a, b, c)) : 0,
      followsMember: s.mid !== null && !!arcEdgeBetween(s.from, s.to),
    };
  });
}

/** Whether a node is held by nothing but this plate's loops: no member, support, load or other group. */
function onlyThisPlate(node: number, plate: number): boolean {
  for (const el of modelStore.elements.values()) if (el.nodeI === node || el.nodeJ === node) return false;
  for (const s of modelStore.supports.values()) if (s.nodeId === node) return false;
  for (const sh of [...modelStore.quads.values(), ...modelStore.plates.values()]) if (sh.nodes.includes(node)) return false;
  for (const g of modelStore.model.groups.values()) if (g.id !== plate && g.members.nodes?.includes(node)) return false;
  for (const l of modelStore.loads) if ((l.data as { nodeId?: number }).nodeId === node) return false;
  return true;
}

/**
 * Curve outline side `side` by `sagitta` (m, out of the plate when positive), or straighten it
 * (0 or null): the arc goes through a point that far from the chord's midpoint.
 */
export function setPlateSideSagitta(id: number, side: number, sagitta: number | null): PlateShapeProblem | null {
  const e = plateEntry(id);
  const geo = e ? plateGeometry(modelStore, e.group) : null;
  const sd = plateSides(id)[side];
  if (!e || !geo || !sd) return 'needNodes';
  if (sd.mid !== null && arcEdgeBetween(sd.from, sd.to)) return 'followsMember';
  const a = pos(sd.from)!, b = pos(sd.to)!;
  const L = len(sub(b, a));
  const s = sagitta ?? 0;
  if (Math.abs(s) >= L / 2 - 1e-6) return 'tooDeep';
  const oldMid = sd.mid;
  let problem: PlateShapeProblem | null = null;
  modelStore.batch(() => {
    if (Math.abs(s) < 1e-6) {
      problem = setPlateSideArc(id, side, null);
    } else {
      const n = outward(geo.frame, a, b, centroidOf(plateLoops(e.group).outer));
      const p: Vec3 = [(a[0] + b[0]) / 2 + n[0] * s, (a[1] + b[1]) / 2 + n[1] * s, (a[2] + b[2]) / 2 + n[2] * s];
      const mid = modelStore.addNode(p[0], p[1], p[2]);
      problem = setPlateSideArc(id, side, mid);
      if (problem) modelStore.removeNode(mid);
    }
    if (problem) return;
    if (oldMid !== null && onlyThisPlate(oldMid, -1)) modelStore.removeNode(oldMid);
    remeshIfMeshed(id);
  });
  return problem;
}

/** Point keys at a tenth of a millimetre, for finding a model node at a point of the figure. */
const key = (p: Vec3) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;

/** The loops bounding a set of cells, each as point indices in the cells' own turning; null when two loops meet at a point. */
function boundaryLoops(cells: number[][]): number[][] | null {
  const edges = new Set<string>();
  for (const c of cells) for (let i = 0; i < c.length; i++) edges.add(`${c[i]}>${c[(i + 1) % c.length]}`);
  const next = new Map<number, number>();
  for (const c of cells) for (let i = 0; i < c.length; i++) {
    const a = c[i]!, b = c[(i + 1) % c.length]!;
    if (edges.has(`${b}>${a}`)) continue;
    if (next.has(a)) return null;
    next.set(a, b);
  }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let at = start;
    while (!seen.has(at)) { seen.add(at); loop.push(at); at = next.get(at)!; if (at === undefined) return null; }
    loops.push(loop);
  }
  return loops;
}

/** Drop the points of a loop where it runs straight on, keeping those `keep` names. */
function corners(loop: number[], uv: Array<[number, number]>, keep: (i: number) => boolean): number[] {
  return loop.filter((p, k) => {
    if (keep(p)) return true;
    const a = uv[loop[(k + loop.length - 1) % loop.length]!]!, b = uv[p]!, c = uv[loop[(k + 1) % loop.length]!]!;
    const x = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    return Math.abs(x) > 1e-9 * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]));
  });
}

const signedArea = (loop: number[], uv: Array<[number, number]>) => {
  let s = 0;
  for (let i = 0; i < loop.length; i++) { const a = uv[loop[i]!]!, b = uv[loop[(i + 1) % loop.length]!]!; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};

/**
 * Take cells of the figure out of the plate: those inside it make a hole, those along the outline
 * cut a notch in it. The plate's holes and outline become what the cells left bound.
 */
export function cutPlateCells(id: number, figure: PlateFigure, chosen: ReadonlySet<number>): PlateShapeProblem | null {
  const e = plateEntry(id);
  if (!e) return 'needNodes';
  if (!chosen.size) return 'nothingChosen';
  const kept = figure.cells.filter((_, i) => !chosen.has(i));
  if (!kept.length) return 'wholePlate';
  const f = figure.frame;
  const uv = figure.points.map((p): [number, number] => { const d = sub(p, f.o); return [dot(d, f.u), dot(d, f.v)]; });
  const before = boundaryLoops(figure.cells);
  const after = boundaryLoops(kept);
  if (!before || !after) return 'pinch';
  const turn = Math.sign(signedArea(before.reduce((m, l) => (Math.abs(signedArea(l, uv)) > Math.abs(signedArea(m, uv)) ? l : m)), uv));
  const outers = after.filter((l) => Math.sign(signedArea(l, uv)) === turn);
  if (outers.length !== 1) return 'split';
  const outerLoop = outers[0]!;
  const holeLoops = after.filter((l) => l !== outerLoop);

  const loops = plateLoops(e.group);
  const byKey = new Map<string, number>();
  for (const n of modelStore.nodes.values()) byKey.set(key([n.x, n.y, n.z ?? 0]), n.id);
  const existing = new Set([...loops.outer, ...loops.holes.flat()]);
  const nodeAt = (i: number) => figure.nodes[i] ?? byKey.get(key(figure.points[i]!)) ?? null;
  const keep = (i: number) => { const n = nodeAt(i); return n !== null && existing.has(n); };

  const outlineBefore = before.find((l) => Math.sign(signedArea(l, uv)) === turn)!;
  const sameOutline = new Set(outlineBefore).size === new Set(outerLoop).size && outerLoop.every((i) => outlineBefore.includes(i));
  if (!sameOutline && (e.surface.arcMids ?? []).length) return 'curvedOutline';

  let problem: PlateShapeProblem | null = null;
  modelStore.batch(() => {
    const made: number[] = [];
    const idOf = (i: number) => {
      const n = nodeAt(i);
      if (n !== null) return n;
      const p = figure.points[i]!;
      const id = modelStore.addNode(p[0], p[1], p[2]);
      byKey.set(key(p), id);
      made.push(id);
      return id;
    };
    const outer = sameOutline ? loops.outer : corners(outerLoop, uv, keep).map(idOf);
    const holes = holeLoops.map((l) => corners(l, uv, keep).map(idOf));
    problem = setPlateLoops(id, outer, holes, sameOutline ? (e.surface.arcMids ?? []).filter((k) => k < loops.outer.length) : []);
    if (problem) { for (const n of made) modelStore.removeNode(n); return; }
    remeshIfMeshed(id);
  });
  return problem;
}

/** Close hole `k` of the plate: its area is plate again. */
export function closePlateHole(id: number, k: number): PlateShapeProblem | null {
  const e = plateEntry(id);
  if (!e) return 'needNodes';
  const loops = plateLoops(e.group);
  if (!loops.holes[k]) return 'needNodes';
  let problem: PlateShapeProblem | null = null;
  modelStore.batch(() => {
    problem = setPlateLoops(id, loops.outer, loops.holes.filter((_, i) => i !== k), (e.surface.arcMids ?? []).filter((x) => x < loops.outer.length));
    if (!problem) remeshIfMeshed(id);
  });
  return problem;
}
