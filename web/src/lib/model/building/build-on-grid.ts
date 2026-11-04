/**
 * Build a structure on the grid: columns at the intersections, beams along the axes, slabs in the
 * bays, walls between axes. Each element is placed as an engineer thinks of it and becomes both
 * the analysis model (bars and shells, joined at shared nodes) and a declared physical element.
 *
 * Every command is one undo step. Nodes are reused where one already stands, bars where one
 * already joins the same two nodes, so building twice over the same place does not double it.
 * Columns and beams share the layout of the grid's own frame (`frameBetweenAxes`).
 */
import { modelStore } from '../../store/model.svelte';
import { fillHoles } from '../edit/construct';
import { applyMesh } from '../edit/mesh-apply';
import type { MeshInput } from '../edit/mesher';
import type { Vec3 } from '../edit/affine';
import { frameBetweenAxes, type FrameBetweenAxes, type Level, type StructuralGrid } from '../grid';
import { fragmentFromMembers } from '../edit/fragment';
import { insertFragment } from '../edit/transformed-copy';
import { IDENTITY } from '../edit/affine';
import { PHYSICAL_GROUP_KIND } from '../physical/types';
import { computeLocalAxes3D, memberRoll } from '../../engine/local-axes-3d';
import { declare, nextName } from './declare';

export interface PlaceResult { created: number; elements: number; shells: number; refused?: string }

const levelsBetween = (g: StructuralGrid, from: string, to: string): Level[] => {
  const a = g.levels.find((l) => l.id === from), b = g.levels.find((l) => l.id === to);
  if (!a || !b) return [];
  const [lo, hi] = a.z <= b.z ? [a.z, b.z] : [b.z, a.z];
  return [...g.levels].filter((l) => l.z >= lo - 1e-9 && l.z <= hi + 1e-9).sort((p, q) => p.z - q.z);
};

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export interface FramePlaced extends PlaceResult { nodes: number; welded: number; duplicates: number; bars: number[] }

/**
 * Columns and beams between axes (`frameBetweenAxes` lays them out, insertion welds them onto the
 * model's nodes and skips bars already there), each declared a physical element: a column is the
 * stack of bars at one intersection, a beam the run of bars along one axis at one level. Bars
 * that already belong to an element are left in it.
 */
export function placeFrame(g: StructuralGrid, spec: FrameBetweenAxes, o: {
  columnTypology?: string; beamTypology?: string; fixBase?: boolean;
  /** The columns' section turned about their axis, in degrees (`Element.rollAngle`). */
  columnAngle?: number;
  /**
   * The point of a column's footprint that stays on the intersection, as (x, y) each −1, 0 or 1:
   * (0, 0) the centre, (−1, −1) the corner towards −X and −Y. The column is offset off its nodes
   * (`Element.offset`), so the beams still frame into the intersection.
   */
  columnFixedPoint?: [number, number];
  /**
   * Which side of its axis a beam lies on, −1, 0 or 1 (towards −, centred, towards + of the
   * crossing direction), and a further eccentricity along it, in m.
   */
  beamAlign?: number; beamEccentricity?: number;
  /**
   * The beams on the range's edges with their outer face on the columns' outer face: each moved
   * outward, on its own side, by the column's half less its own (QA of 20-oct); the beams inside
   * the range stay on their axes. Instead of `beamAlign` on the edges.
   */
  beamPerimeterFlush?: boolean;
  /** The beams' top face on the level (the slab's top), their axis half a depth below it. */
  beamTopFlush?: boolean;
} = {}): FramePlaced {
  const out: FramePlaced = { created: 0, elements: 0, shells: 0, nodes: 0, welded: 0, duplicates: 0, bars: [] };
  const layout = frameBetweenAxes(g, spec);
  if (!layout) return { ...out, refused: 'nothing' };
  modelStore.batch(() => {
    const r = insertFragment(fragmentFromMembers(layout.nodes, layout.members), [{ A: IDENTITY, t: [0, 0, 0] }]);
    Object.assign(out, { elements: r.elements.length, nodes: r.nodes.length, welded: r.welded, duplicates: r.duplicates, bars: r.elements });
    const nodeMap = r.maps[0]?.nodes ?? new Map<number, number>(), elMap = r.maps[0]?.elements ?? new Map<number, number>();
    const byPair = new Map<string, number>();
    for (const e of modelStore.elements.values()) byPair.set(pairKey(e.nodeI, e.nodeJ), e.id);
    const held = new Set<number>();
    for (const grp of modelStore.model.groups.values()) if (grp.kind === PHYSICAL_GROUP_KIND) for (const id of grp.members.elements ?? []) held.add(id);
    const levelOf = (z: number) => g.levels.find((l) => Math.abs(l.z - z) < 1e-6)?.id;
    const runs = new Map<string, { kind: 'column' | 'beam'; bars: number[]; z0: number; z1: number; base?: number }>();
    // The range's edges, for the perimeter beams; the beams' offsets wait for every column placed.
    const xs = layout.nodes.map((n) => n.x), ys = layout.nodes.map((n) => n.y);
    const edge = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const beamsToSeat: Array<{ id: number; role: 'beamX' | 'beamY'; at: number; node: number | undefined }> = [];
    layout.members.forEach((m, i) => {
      const id = elMap.get(i + 1) ?? byPair.get(pairKey(nodeMap.get(m.nodeI) ?? -1, nodeMap.get(m.nodeJ) ?? -1));
      if (id === undefined || held.has(id)) return;
      const a = layout.nodes[m.nodeI - 1]!, b = layout.nodes[m.nodeJ - 1]!;
      const key = m.role === 'column' ? `c:${a.x}:${a.y}` : m.role === 'beamX' ? `x:${a.y}:${a.z}` : `y:${a.x}:${a.z}`;
      const run = runs.get(key) ?? { kind: m.role === 'column' ? 'column' as const : 'beam' as const, bars: [], z0: Infinity, z1: -Infinity };
      run.bars.push(id);
      if (elMap.has(i + 1)) {
        if (m.role === 'column' && o.columnAngle) modelStore.updateElement(id, { rollAngle: o.columnAngle });
        if (m.role !== 'column' && (o.beamPerimeterFlush || o.beamTopFlush)) beamsToSeat.push({ id, role: m.role, at: m.role === 'beamX' ? a.y : a.x, node: nodeMap.get(m.nodeI) });
        else {
          const shift = offsetFor(id, m.role, o);
          if (shift) modelStore.updateElement(id, { offset: { frame: 'global', i: shift, j: shift } });
        }
      }
      const lo = Math.min(a.z, b.z);
      if (m.role === 'column' && lo < run.z0) run.base = nodeMap.get(a.z <= b.z ? m.nodeI : m.nodeJ);
      run.z0 = Math.min(run.z0, lo); run.z1 = Math.max(run.z1, a.z, b.z);
      runs.set(key, run);
    });
    for (const b of beamsToSeat) {
      const shift = offsetFor(b.id, b.role, o) ?? { x: 0, y: 0, z: 0 };
      if (o.beamPerimeterFlush) {
        const [lo, hi] = b.role === 'beamX' ? [edge.y0, edge.y1] : [edge.x0, edge.x1];
        const side = Math.abs(b.at - lo) < 1e-6 ? -1 : Math.abs(b.at - hi) < 1e-6 ? 1 : 0;
        const k = b.role === 'beamX' ? 1 : 0;
        const col = b.node === undefined ? undefined : columnAt(b.node);
        const ch = col === undefined ? null : planHalf(col), bh = planHalf(b.id);
        // On an edge: outward by the column's half less the beam's, the eccentricity added.
        const d = side && ch && bh ? side * Math.max(0, ch[k] - bh[k]) + (o.beamEccentricity ?? 0) : null;
        if (d !== null) { if (b.role === 'beamX') { shift.x = 0; shift.y = d; } else { shift.x = d; shift.y = 0; } }
      }
      if (o.beamTopFlush) {
        const h = modelStore.sections.get(modelStore.elements.get(b.id)!.sectionId)?.h;
        if (h) shift.z = -h / 2;
      }
      if (shift.x || shift.y || shift.z) modelStore.updateElement(b.id, { offset: { frame: 'global', i: shift, j: shift } });
    }
    const colName = nextName('C'), beamName = nextName('V');
    for (const run of runs.values()) {
      const typology = run.kind === 'column' ? o.columnTypology : o.beamTypology;
      if (run.kind === 'column' && o.fixBase && run.base !== undefined && ![...modelStore.supports.values()].some((s) => s.nodeId === run.base)) {
        modelStore.addSupport(run.base, 'fixed3d');
      }
      const levelFrom = levelOf(run.z0), levelTo = levelOf(run.z1);
      declare(run.kind === 'column' ? colName() : beamName(), { elements: run.bars }, {
        kind: run.kind, provenance: 'declared',
        ...(levelFrom ? { levelFrom } : {}), ...(levelTo ? { levelTo } : {}),
        ...(typology ? { typology } : {}),
      });
      out.created++;
    }
  });
  return out;
}

/**
 * Slabs in the panels the beams close at each level: a grid bay, an L, any outline the beams
 * bound, found as the floor loads find them. A ring of beams inside a panel (a stair well) stays
 * open. Each panel is meshed at the size given, cutting its beams at the mesh's edge nodes so slab
 * and beams share them, and becomes one slab; asked to wait (`meshAtSolve`), a panel is one shell
 * until the first solve meshes it. A joist slab is modelled as a one-way slab of the
 * thickness given; the joists' design reads its typology. Panels already holding shells are left.
 */
export function placeSlabs(g: StructuralGrid, o: {
  levels: string[]; thickness: number; materialId: number; meshSize: number; typology?: string;
  /** One shell per panel now, meshed at `meshSize` by the first solve (`deferred-slabs.ts`). */
  meshAtSolve?: boolean;
}): PlaceResult {
  const name = nextName('L');
  let created = 0, shells = 0;
  let refused: string | undefined;
  modelStore.batch(() => {
    for (const lid of o.levels) {
      const l = g.levels.find((x) => x.id === lid);
      if (!l) continue;
      const onLevel = (id: number) => Math.abs((modelStore.nodes.get(id)?.z ?? 0) - l.z) < 1e-6;
      const beams = [...modelStore.elements.values()].filter((e) => onLevel(e.nodeI) && onLevel(e.nodeJ)).map((e) => e.id);
      const r = fillHoles(beams, o.materialId, o.thickness, o.meshAtSolve ? {} : { density: { mode: 'targetSize', size: o.meshSize } });
      if ('refused' in r) { refused = r.refused; continue; }
      if (r.faces.length === 0 && r.skippedExisting > 0) refused = 'occupied';
      for (const f of r.faces) {
        created++; shells += f.quads.length + f.plates.length;
        // A panel that came out as one quad waits for its mesh; any other shape is meshed as filled.
        const panel = o.meshAtSolve && f.quads.length === 1 && f.plates.length === 0 ? modelStore.quads.get(f.quads[0]!)?.nodes : undefined;
        declare(name(), f, {
          kind: 'slab', provenance: 'declared', levelFrom: l.id, levelTo: l.id,
          ...(o.typology ? { typology: o.typology } : {}),
          ...(panel ? { meshAtSolve: { size: o.meshSize, meshed: false, panel: [...panel] } } : {}),
        });
      }
    }
  });
  return { created, elements: 0, shells, ...(refused && created === 0 ? { refused } : {}) };
}

/** Half the plan extent of a bar's section along global X and Y, from its own local axes. */
export function planHalf(id: number): [number, number] | null {
  const e = modelStore.elements.get(id);
  const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
  const sec = e && modelStore.sections.get(e.sectionId);
  if (!e || !a || !b || !sec?.b || !sec.h) return null;
  const ly = e.localYx !== undefined ? { x: e.localYx, y: e.localYy ?? 0, z: e.localYz ?? 0 } : undefined;
  const ax = computeLocalAxes3D({ id: a.id, x: a.x, y: a.y, z: a.z ?? 0 }, { id: b.id, x: b.x, y: b.y, z: b.z ?? 0 }, ly, memberRoll(e, modelStore.sections));
  // The profile's width b runs along local y and its depth h along local z.
  const half = (k: 0 | 1) => (Math.abs(ax.ey[k]) * sec.b! + Math.abs(ax.ez[k]) * sec.h!) / 2;
  return [half(0), half(1)];
}

/** The column standing at or arriving at a node, where there is one. */
function columnAt(node: number): number | undefined {
  for (const e of modelStore.elements.values()) {
    if (e.nodeI !== node && e.nodeJ !== node) continue;
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (a && b && Math.hypot(b.x - a.x, b.y - a.y) < 1e-6 && Math.abs((b.z ?? 0) - (a.z ?? 0)) > 1e-6) return e.id;
  }
  return undefined;
}

function offsetFor(id: number, role: 'column' | 'beamX' | 'beamY', o: { columnFixedPoint?: [number, number]; beamAlign?: number; beamEccentricity?: number }) {
  if (role === 'column') {
    const [fx, fy] = o.columnFixedPoint ?? [0, 0];
    if (!fx && !fy) return null;
    const h = planHalf(id);
    return h ? { x: -fx * h[0], y: -fy * h[1], z: 0 } : null;
  }
  const side = o.beamAlign ?? 0, ecc = o.beamEccentricity ?? 0;
  if (!side && !ecc) return null;
  const h = planHalf(id);
  // A beam along X shifts along Y, and the other way round.
  const d = side * (h ? (role === 'beamX' ? h[1] : h[0]) : 0) + ecc;
  return role === 'beamX' ? { x: 0, y: d, z: 0 } : { x: d, y: 0, z: 0 };
}

/** A door or window in a wall: from its start along it, and from the storey's floor up, in m. */
export interface WallOpening { offset: number; width: number; sill: number; height: number }

type Shells = { quads: number[]; plates: number[] };

/**
 * Mesh a planar panel through the given corners, with holes, onto the model: welded to the nodes
 * already there, the members along its edges cut at its edge nodes. A panel already holding
 * shells in its plane is refused, not meshed twice.
 */
function meshPanel(corners: Vec3[], holes: Vec3[][], o: { size: number; materialId: number; thickness: number }): Shells | { refused: string } {
  const input: MeshInput = { outer: { kind: 'polygon', points: corners }, holes: holes.map((h) => ({ kind: 'polygon' as const, points: h })), size: o.size, element: 'quad' };
  const r = applyMesh(input, { materialId: o.materialId, thickness: o.thickness, splitBeams: true });
  if (!r) return { refused: 'cannotMesh' };
  if (r.occupied) return { refused: 'occupied' };
  return { quads: r.quads, plates: r.plates };
}

/**
 * A wall along one grid axis, between two crossing axes, from one level to another, one per
 * storey. Openings, if any, repeat on every storey; one that does not fit inside the storey's
 * panel refuses the wall.
 */
export function placeWall(g: StructuralGrid, o: {
  axis: string; from: string; to: string; levelFrom: string; levelTo: string;
  thickness: number; materialId: number; meshSize: number; typology?: string; openings?: WallOpening[];
}): PlaceResult {
  const a = g.axes.find((x) => x.id === o.axis);
  const p = g.axes.find((x) => x.id === o.from), q = g.axes.find((x) => x.id === o.to);
  const lv = levelsBetween(g, o.levelFrom, o.levelTo);
  if (!a || !p || !q || p.axis === a.axis || q.axis === a.axis || lv.length < 2) return { created: 0, elements: 0, shells: 0, refused: 'axes' };
  const pt = (s: number, z: number): Vec3 => (a.axis === 'x' ? [a.at, s, z] : [s, a.at, z]);
  const s0 = Math.min(p.at, q.at), length = Math.abs(q.at - p.at);
  const openings = o.openings ?? [];
  for (let k = 0; k + 1 < lv.length; k++) {
    const h = lv[k + 1]!.z - lv[k]!.z;
    const fits = openings.every((w) => w.offset > 1e-6 && w.width > 0 && w.offset + w.width < length - 1e-6 && w.sill >= 0 && w.height > 0 && w.sill + w.height < h - 1e-6);
    const overlap = openings.some((w, i) => openings.some((v, j) => j > i && w.offset < v.offset + v.width && v.offset < w.offset + w.width));
    if (!fits || overlap) return { created: 0, elements: 0, shells: 0, refused: 'opening' };
  }
  const name = nextName('M');
  let created = 0, shells = 0;
  let refused: string | undefined;
  modelStore.batch(() => {
    for (let k = 0; k + 1 < lv.length; k++) {
      const z0 = lv[k]!.z, z1 = lv[k + 1]!.z;
      const holes = openings.map((w) => {
        const b = z0 + w.sill, t = b + w.height, l = s0 + w.offset, r = l + w.width;
        // A door reaches the floor: its hole is a notch in the outline, not a hole inside it.
        return [pt(l, b), pt(r, b), pt(r, t), pt(l, t)];
      });
      const doors = openings.filter((w) => w.sill <= 1e-6);
      const bottom: Vec3[] = [pt(s0, z0), ...doors.sort((x, y) => x.offset - y.offset).flatMap((w) => {
        const l = s0 + w.offset, r = l + w.width;
        return [pt(l, z0), pt(l, z0 + w.height), pt(r, z0 + w.height), pt(r, z0)];
      }), pt(s0 + length, z0)];
      const outline: Vec3[] = [...bottom, pt(s0 + length, z1), pt(s0, z1)];
      const r = meshPanel(outline, holes.filter((_, i) => openings[i]!.sill > 1e-6), { size: o.meshSize, materialId: o.materialId, thickness: o.thickness });
      if ('refused' in r) { refused = r.refused; continue; }
      created++; shells += r.quads.length + r.plates.length;
      declare(name(), r, {
        kind: 'wall', provenance: 'declared', levelFrom: lv[k]!.id, levelTo: lv[k + 1]!.id,
        ...(o.typology ? { typology: o.typology } : {}),
        ...(openings.length ? { openings: openings.map((w) => ({ offset: w.offset, width: w.width, sill: w.sill, height: w.height })) } : {}),
      });
    }
  });
  return { created, elements: 0, shells, ...(refused ? { refused } : {}) };
}

/**
 * A ramp: a slab across one bay of the grid that rises from one level at one end to another at
 * the other, along X or along Y. Meshed onto the model like a slab, cutting the beams at its two
 * ends; declared a slab of typology ramp.
 */
export function placeRamp(g: StructuralGrid, o: {
  x: [string, string]; y: [string, string]; levelLow: string; levelHigh: string; rises: 'x' | 'y';
  thickness: number; materialId: number; meshSize: number;
}): PlaceResult {
  const ax = (id: string) => g.axes.find((a) => a.id === id);
  const [x0, x1, y0, y1] = [ax(o.x[0]), ax(o.x[1]), ax(o.y[0]), ax(o.y[1])];
  const lo = g.levels.find((l) => l.id === o.levelLow), hi = g.levels.find((l) => l.id === o.levelHigh);
  if (!x0 || !x1 || !y0 || !y1 || !lo || !hi || x0.at === x1.at || y0.at === y1.at || lo.z === hi.z) return { created: 0, elements: 0, shells: 0, refused: 'ramp' };
  const [xa, xb] = [Math.min(x0.at, x1.at), Math.max(x0.at, x1.at)], [ya, yb] = [Math.min(y0.at, y1.at), Math.max(y0.at, y1.at)];
  const z = (x: number, y: number) => (o.rises === 'x' ? (x === xa ? lo.z : hi.z) : (y === ya ? lo.z : hi.z));
  const corners: Vec3[] = [[xa, ya, z(xa, ya)], [xb, ya, z(xb, ya)], [xb, yb, z(xb, yb)], [xa, yb, z(xa, yb)]];
  let out: PlaceResult = { created: 0, elements: 0, shells: 0 };
  modelStore.batch(() => {
    const r = meshPanel(corners, [], { size: o.meshSize, materialId: o.materialId, thickness: o.thickness });
    if ('refused' in r) { out = { ...out, refused: r.refused }; return; }
    declare(nextName('L')(), r, {
      kind: 'slab', provenance: 'declared', typology: 'ramp',
      levelFrom: lo.z < hi.z ? lo.id : hi.id, levelTo: lo.z < hi.z ? hi.id : lo.id,
    });
    out = { created: 1, elements: 0, shells: r.quads.length + r.plates.length };
  });
  return out;
}

