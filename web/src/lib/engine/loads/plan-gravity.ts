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
 * Pure: no store.
 */
import { floorLoad, type FloorBeam } from './floor-loads';
import { msg, round, type EngineMessage } from '../../codes/message';

export interface GravityModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; type?: 'frame' | 'truss' }>;
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

/** A stretch of a member and the depth of area it collects there, m (so q·w is kN/m). */
export interface GravityPiece { elementId: number; a?: number; b?: number; wI: number; wJ: number }

export interface GravityLayout {
  pieces: GravityPiece[];
  /** Area each member collects, m². */
  areaOf: Map<number, number>;
  /** Members loaded with the tributary width, and whether each is sloped (its load is per projection). */
  widthMembers: Array<{ elementId: number; length: number; horizontalLength: number }>;
  /** Horizontal quads that take the area load themselves, with their plan area, m². */
  shellQuads: Array<{ quadId: number; area: number }>;
  /** Loaded plan area per level elevation (rounded to the millimetre), m². */
  areaByLevel: Map<number, number>;
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
  const out: GravityLayout = { pieces: [], areaOf: new Map(), widthMembers: [], shellQuads: [], areaByLevel: new Map(), notes: [] };
  const width = (id: number, length: number, horizontalLength: number) => {
    out.widthMembers.push({ elementId: id, length, horizontalLength });
    out.areaOf.set(id, opts.tributaryWidth * horizontalLength);
  };

  const candidates = [...model.elements.values()].filter((e) => e.type !== 'truss');
  if (opts.mode === 'width') {
    for (const e of candidates) {
      const b = beamLike(model, e);
      if (b.ok) width(e.id, b.length, b.horizontalLength);
    }
    return out;
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
    if (Math.abs((nI.z ?? 0) - (nJ.z ?? 0)) > TOL) { width(e.id, b.length, b.horizontalLength); continue; }
    const key = levelKey(nI.z ?? 0);
    const list = beamsAt.get(key) ?? [];
    list.push({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: 'frame', sectionId: e.sectionId });
    beamsAt.set(key, list);
  }

  for (const [z, quads] of quadsAt) {
    out.shellQuads.push(...quads);
    const area = quads.reduce((s, q) => s + q.area, 0);
    out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + area);
    out.notes.push(msg('loadPlan.gravity.shellLevel', { z: round(z, 2), n: quads.length, area: round(area, 1) }));
  }

  let byWidth = 0, nonConvex = 0;
  for (const [z, beams] of beamsAt) {
    if (quadsAt.has(z)) continue;
    const res = floorLoad({ nodes: model.nodes, beams, q: 1, distribution: opts.slab ?? 'twoWay', spanAxis: opts.spanAxis });
    const loaded = new Set<number>();
    for (const l of res.loads) {
      out.pieces.push({ elementId: l.elementId, ...(l.a !== undefined ? { a: l.a, b: l.b } : {}), wI: l.qI, wJ: l.qJ });
      loaded.add(l.elementId);
    }
    for (const [id, a] of res.perBeam) out.areaOf.set(id, (out.areaOf.get(id) ?? 0) + a);
    if (res.loadedArea > 0) out.areaByLevel.set(z, (out.areaByLevel.get(z) ?? 0) + res.loadedArea);
    nonConvex += res.skipped.nonConvex;
    for (const b of beams) {
      if (loaded.has(b.id)) continue;
      const g = beamLike(model, b);
      width(b.id, g.length, g.horizontalLength);
      byWidth++;
    }
  }
  const sloped = out.widthMembers.length - byWidth;
  if (out.pieces.length > 0) out.notes.push(msg('loadPlan.gravity.panels', { members: new Set(out.pieces.map((p) => p.elementId)).size }));
  if (out.widthMembers.length > 0) out.notes.push(msg('loadPlan.gravity.width', { n: out.widthMembers.length, sloped, width: round(opts.tributaryWidth, 2) }));
  if (nonConvex > 0) out.notes.push(msg('loadPlan.gravity.nonConvex', { n: nonConvex }));
  return out;
}
