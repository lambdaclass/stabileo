/**
 * Where the load plan puts an area load (dead, live, roof live): which members or shells carry
 * it, and how much of each square metre each one takes.
 *
 * ── Panels ────────────────────────────────────────────────────────
 *
 * Each floor's horizontal beams bound panels, and each panel sends its load to the beams around
 * it by tributary area, in two ways or in one (`floor-loads.ts`, the Floor load tool's own
 * function, run here once per level with a unit load). A beam then carries the real area it
 * collects, as partial linear loads, instead of one width for every beam of the model.
 *
 * ── Slabs drawn as shells ─────────────────────────────────────────
 *
 * A level whose floor is drawn with horizontal quads already carries its load in the slab: the
 * quads take the area load as a surface load and the beams of that level take nothing from the
 * panels, or the floor would be loaded twice.
 *
 * ── The tributary width, as a fallback ────────────────────────────
 *
 * What bounds no panel (a cantilever, a beam that stops in the air, a sloped roof member, a plane
 * frame) is loaded with the tributary width given, as the plan always did, and counted, so the
 * derivation says how many members were loaded that way.
 *
 * ── Roofs ─────────────────────────────────────────────────────────
 *
 * A member is a roof member when nothing higher covers it in plan: no panel, slab or beam of a
 * higher level over its midpoint. The top floor of a building, a lower roof beside a step and
 * every sloped roof member are roofs; the floors under them are not.
 *
 * Pure: no store.
 */
import { floorLoad, type FloorBeam } from './floor-loads';
import { msg, round, type EngineMessage } from '../../codes/message';

export interface GravityModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId?: number; type?: 'frame' | 'truss' }>;
  quads?: Map<number, { id: number; nodes: number[] }>;
}

export interface GravityOptions {
  /** `panels`: by tributary area where the beams close panels; `width`: one width everywhere. */
  mode: 'panels' | 'width';
  slab?: 'twoWay' | 'oneWay';
  spanAxis?: 'x' | 'y';
  /** m, for the members no panel loads. */
  tributaryWidth: number;
}

/**
 * A stretch of a member and the depth of area it collects there, m (so q·w is kN/m), from one
 * panel; `roof` when nothing higher covers that panel.
 */
export interface GravityPiece { elementId: number; a?: number; b?: number; wI: number; wJ: number; roof: boolean; panel: number }

export interface GravityLayout {
  pieces: GravityPiece[];
  /** Area each member collects from floors, m². */
  areaOf: Map<number, number>;
  /** Area each member collects from roofs, m². A beam at a step has both. */
  roofAreaOf: Map<number, number>;
  /** Members loaded with the tributary width, and whether each is sloped (its load is per projection). */
  widthMembers: Array<{ elementId: number; length: number; horizontalLength: number }>;
  /** Horizontal quads that take the area load themselves, with their plan area, m². */
  shellQuads: Array<{ quadId: number; area: number; z: number }>;
  /** Loaded plan area per level elevation (rounded to the millimetre), m². */
  areaByLevel: Map<number, number>;
  /** Members that carry roof: a roof panel, or (loaded by width) nothing higher over them. */
  roof: Set<number>;
  roofQuads: Set<number>;
  /** Mid-height of each member that carries an area load, m. */
  zOf: Map<number, number>;
  /**
   * The checkerboard of alternate loading (CIRSOC 101 §4.3.3): a colour, 0 or 1, for each panel
   * (by `GravityPiece.panel`) and for each member loaded by width, so that neighbours on a level
   * differ and the pattern turns over from one level to the next.
   */
  panelColour: number[];
  widthColour: Map<number, number>;
  /** The loaded panels, by `GravityPiece.panel`: their outline in plan, their level, and whether a roof. */
  panels: Array<{ polygon: Array<[number, number]>; z: number; roof: boolean }>;
  notes: EngineMessage[];
}

const TOL = 1e-3;
const levelKey = (z: number) => Math.round(z / TOL) * TOL;

/** True when a member is close enough to horizontal to carry an area load (|Δz|/L ≤ 0.5). */
export function beamLike(model: GravityModel, el: { nodeI: number; nodeJ: number }): { ok: boolean; length: number; horizontalLength: number } {
  const nI = model.nodes.get(el.nodeI), nJ = model.nodes.get(el.nodeJ);
  if (!nI || !nJ) return { ok: false, length: 0, horizontalLength: 0 };
  const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
  const L = Math.hypot(dx, dy, dz);
  if (L < 0.01) return { ok: false, length: 0, horizontalLength: 0 };
  return { ok: Math.abs(dz) / L <= 0.5, length: L, horizontalLength: Math.hypot(dx, dy) };
}

function planArea(pts: Array<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function gravityLayout(model: GravityModel, opts: GravityOptions): GravityLayout {
  const out: GravityLayout = {
    pieces: [], areaOf: new Map(), roofAreaOf: new Map(), widthMembers: [], shellQuads: [], areaByLevel: new Map(),
    roof: new Set(), roofQuads: new Set(), zOf: new Map(), panelColour: [], widthColour: new Map(), panels: [], notes: [],
  };
  const width = (id: number, length: number, horizontalLength: number) => {
    out.widthMembers.push({ elementId: id, length, horizontalLength });
  };
  const addArea = (map: Map<number, number>, id: number, a: number) => map.set(id, (map.get(id) ?? 0) + a);

  const candidates = [...model.elements.values()].filter((e) => e.type !== 'truss');
  for (const e of candidates) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (a && b && beamLike(model, e).ok) out.zOf.set(e.id, ((a.z ?? 0) + (b.z ?? 0)) / 2);
  }

  // Horizontal quads, by level.
  const quadsAt = new Map<number, Array<{ quadId: number; area: number }>>();
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const zs = pts.map((p) => p!.z ?? 0);
    if (Math.max(...zs) - Math.min(...zs) > TOL) continue;
    const key = levelKey(zs[0]!);
    const list = quadsAt.get(key) ?? [];
    list.push({ quadId: q.id, area: planArea(pts as Array<{ x: number; y: number }>) });
    quadsAt.set(key, list);
  }

  // Horizontal members, by level; the rest that can carry a load go by width.
  const beamsAt = new Map<number, FloorBeam[]>();
  for (const e of candidates) {
    const nI = model.nodes.get(e.nodeI), nJ = model.nodes.get(e.nodeJ);
    if (!nI || !nJ) continue;
    const b = beamLike(model, e);
    if (!b.ok) continue;
    const horizontal = Math.abs((nI.z ?? 0) - (nJ.z ?? 0)) <= TOL;
    // By width every member takes the width; its floor's panels still say what it covers.
    if (opts.mode === 'width' || !horizontal) width(e.id, b.length, b.horizontalLength);
    if (!horizontal) continue;
    const key = levelKey(nI.z ?? 0);
    const list = beamsAt.get(key) ?? [];
    list.push({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: 'frame', sectionId: e.sectionId ?? 0 });
    beamsAt.set(key, list);
  }

  // First pass: the panels of every level, which say what covers what.
  const slab = { distribution: opts.slab ?? 'twoWay', spanAxis: opts.spanAxis } as const;
  const levels = new Map<number, { beams: FloorBeam[]; res: ReturnType<typeof floorLoad> }>();
  const panelsAt = new Map<number, Array<Array<[number, number]>>>();
  for (const [z, beams] of beamsAt) {
    if (quadsAt.has(z)) continue;
    const res = floorLoad({ nodes: model.nodes, beams, q: 1, ...slab });
    levels.set(z, { beams, res });
    panelsAt.set(z, res.panels.map((pn) => pn.polygon));
  }
  const covered = coverage(model, out.zOf, panelsAt);
  if (opts.mode === 'width') levels.clear();

  if (opts.mode === 'panels') {
    for (const [z, quads] of quadsAt) {
      out.shellQuads.push(...quads.map((q) => ({ ...q, z })));
      const area = quads.reduce((s, q) => s + q.area, 0);
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + area);
      out.notes.push(msg('loadPlan.gravity.shellLevel', { z: round(z, 2), n: quads.length, area: round(area, 1) }));
    }
  }

  // Second pass: each panel on its own, as a floor or as a roof.
  let byWidth = 0, nonConvex = 0;
  const panelBeams: Array<Set<number>> = [];
  const panelLevel: number[] = [];
  const levelOrder = [...levels.keys()].sort((a, b) => a - b);
  for (const [z, { beams, res }] of levels) {
    nonConvex += res.skipped.nonConvex;
    const loaded = new Set<number>();
    for (const panel of res.panels) {
      if (!panel.loaded) continue;
      const own = beams.filter((b) => onBoundary(model, b, panel.polygon));
      const one = floorLoad({ nodes: model.nodes, beams: own, q: 1, ...slab });
      const c = centroid(panel.polygon);
      const roof = !covered(c, z);
      const index = panelBeams.length;
      panelBeams.push(new Set(one.perBeam.keys()));
      panelLevel.push(levelOrder.indexOf(z));
      out.panels.push({ polygon: panel.polygon, z, roof });
      for (const l of one.loads) {
        out.pieces.push({ elementId: l.elementId, ...(l.a !== undefined ? { a: l.a, b: l.b } : {}), wI: l.qI, wJ: l.qJ, roof, panel: index });
        loaded.add(l.elementId);
      }
      for (const [id, a] of one.perBeam) { addArea(roof ? out.roofAreaOf : out.areaOf, id, a); if (roof) out.roof.add(id); }
      out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + one.loadedArea);
    }
    for (const b of beams) {
      if (loaded.has(b.id)) continue;
      const g = beamLike(model, b);
      width(b.id, g.length, g.horizontalLength);
      byWidth++;
    }
  }

  out.panelColour = checkerboard(panelBeams.length, panelLevel,
    (i, j) => panelLevel[i] === panelLevel[j] && [...panelBeams[i]!].some((id) => panelBeams[j]!.has(id)));
  out.widthColour = widthCheckerboard(model, out.widthMembers.map((m) => m.elementId));

  // What goes by width is a roof when nothing higher stands over its midpoint.
  for (const m of out.widthMembers) {
    const e = model.elements.get(m.elementId)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const roof = !covered([(a.x + b.x) / 2, (a.y + b.y) / 2], Math.max(a.z ?? 0, b.z ?? 0));
    addArea(roof ? out.roofAreaOf : out.areaOf, m.elementId, opts.tributaryWidth * m.horizontalLength);
    if (roof) out.roof.add(m.elementId);
  }
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    const c = centroid(pts.map((p) => [p!.x, p!.y] as [number, number]));
    if (!covered(c, Math.max(...pts.map((p) => p!.z ?? 0)))) out.roofQuads.add(q.id);
  }

  if (opts.mode === 'panels') {
    const sloped = out.widthMembers.length - byWidth;
    if (out.pieces.length > 0) out.notes.push(msg('loadPlan.gravity.panels', { members: new Set(out.pieces.map((p) => p.elementId)).size }));
    if (out.widthMembers.length > 0) out.notes.push(msg('loadPlan.gravity.width', { n: out.widthMembers.length, sloped, width: round(opts.tributaryWidth, 2) }));
    if (nonConvex > 0) out.notes.push(msg('loadPlan.gravity.nonConvex', { n: nonConvex }));
  }
  return out;
}

function centroid(poly: Array<[number, number]>): [number, number] {
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}

/** A beam lies on a panel's boundary: both ends and its midpoint on its sides. */
function onBoundary(model: GravityModel, b: FloorBeam, poly: Array<[number, number]>): boolean {
  const a = model.nodes.get(b.nodeI)!, c = model.nodes.get(b.nodeJ)!;
  const pts: Array<[number, number]> = [[a.x, a.y], [c.x, c.y], [(a.x + c.x) / 2, (a.y + c.y) / 2]];
  return pts.every((p) => poly.some((v, i) => nearSegment(p, v, poly[(i + 1) % poly.length]!, 1e-3)));
}

/** Point in polygon, the boundary included (within `tol`). */
function inside(pt: [number, number], poly: Array<[number, number]>, tol = 0.05): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (nearSegment(pt, [xi, yi], [xj, yj], tol)) return true;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function nearSegment(p: [number, number], a: [number, number], b: [number, number], tol: number): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) <= tol;
}

/** Whether something higher than `zTop` covers a plan point: a panel, a slab or a beam (see the header). */
function coverage(model: GravityModel, zOf: Map<number, number>, panelsAt: Map<number, Array<Array<[number, number]>>>): (pt: [number, number], zTop: number) => boolean {
  type Cover = { z: number; polys: Array<Array<[number, number]>>; segs: Array<[[number, number], [number, number]]> };
  const covers: Cover[] = [];
  const coverAt = (z: number) => {
    let c = covers.find((x) => Math.abs(x.z - z) <= TOL);
    if (!c) { c = { z, polys: [], segs: [] }; covers.push(c); }
    return c;
  };
  for (const [z, polys] of panelsAt) coverAt(z).polys.push(...polys);
  for (const q of model.quads?.values() ?? []) {
    const pts = q.nodes.map((id) => model.nodes.get(id));
    if (pts.some((p) => !p)) continue;
    coverAt(Math.min(...pts.map((p) => p!.z ?? 0))).polys.push(pts.map((p) => [p!.x, p!.y] as [number, number]));
  }
  for (const id of zOf.keys()) {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    coverAt(Math.min(a.z ?? 0, b.z ?? 0)).segs.push([[a.x, a.y], [b.x, b.y]]);
  }
  return (pt, zTop) => covers.some((c) => c.z > zTop + 0.05
    && (c.polys.some((poly) => inside(pt, poly)) || c.segs.some(([a, b]) => nearSegment(pt, a, b, 0.05))));
}

/**
 * Two colours over units, neighbours apart (breadth first; a unit with no neighbour starts its
 * own island at colour 0), turned over on odd levels so floors alternate in elevation too.
 */
function checkerboard(n: number, level: number[], adjacent: (i: number, j: number) => boolean): number[] {
  const colour = new Array<number>(n).fill(-1);
  for (let s = 0; s < n; s++) {
    if (colour[s] !== -1) continue;
    colour[s] = 0;
    const queue = [s];
    while (queue.length) {
      const i = queue.shift()!;
      for (let j = 0; j < n; j++) {
        if (colour[j] !== -1 || !adjacent(i, j)) continue;
        colour[j] = 1 - colour[i]!;
        queue.push(j);
      }
    }
  }
  return colour.map((c, i) => (level[i]! % 2 === 0 ? c : 1 - c));
}

/** Members loaded by width: alternate spans along each line of collinear members on a level. */
function widthCheckerboard(model: GravityModel, ids: number[]): Map<number, number> {
  const ends = ids.map((id) => {
    const e = model.elements.get(id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { id, i: e.nodeI, j: e.nodeJ, dir: [(b.x - a.x) / L, (b.y - a.y) / L] as const, z: Math.min(a.z ?? 0, b.z ?? 0) };
  });
  const zs = [...new Set(ends.map((e) => Math.round(e.z / 0.05)))].sort((a, b) => a - b);
  const colour = checkerboard(ends.length, ends.map((e) => zs.indexOf(Math.round(e.z / 0.05))), (p, q) => {
    const A = ends[p]!, B = ends[q]!;
    const shared = A.i === B.i || A.i === B.j || A.j === B.i || A.j === B.j;
    return shared && Math.abs(A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0]) < 0.17;
  });
  return new Map(ends.map((e, k) => [e.id, colour[k]!]));
}
