/**
 * Use zones: the load zones of a floor (`loads/floor-definitions.ts`, kind `loadZone`) told what
 * they are used for, and the live loads that follow from it.
 *
 * ── Three things kept apart ───────────────────────────────────────
 *
 *   · the room's name as the architecture writes it (ESTAR, DORMITORIO 2, PASILLO);
 *   · the use the engineer states for it, as a row of the occupancy table
 *     (`codes/cirsoc101/live-loads.ts`, CIRSOC 101-2025 Tabla 4.1), or a value typed with its
 *     reason where the table refers elsewhere or has no row, or the explicit decision that the
 *     zone carries no live load;
 *   · the value and the clause that row gives.
 *
 * A name only suggests: `cad/rooms.ts` reads a label into the rows it may be, and the zone stays
 * pending until the engineer confirms one. A zone with nothing stated is unassigned, never a load
 * of zero.
 *
 * ── The loads ─────────────────────────────────────────────────────
 *
 * Each assigned zone has one floor-load definition (`floorLoad`, marked `fromZone`) on the live
 * case, targeting the zone: onto the slab's shells where the zone has shells under it, to the
 * members by tributary area where it has only members. Planning compares what the zones ask for
 * with the definitions there are, and says what it adds, changes and removes, and what stays
 * unresolved, before anything is written; applying it twice changes nothing.
 *
 * Pure.
 */
import { findOccupancy, type OccupancyEntry } from '../codes/cirsoc101/live-loads';
import { zoneArea, zoneOutline, type DefinitionModel, type FloorLoadDef, type ZoneData } from './loads/floor-definitions';
import { shellLoadForces } from '../engine/shell-load-integration';
import type { ModelGroup } from '../store/model.svelte';
import { plateLoops, plateSurfaceOf } from './physical/plate';

export interface ZoneUse {
  /** The room's name, as drawn or typed. */
  name?: string;
  /** The occupancy table row stated (or suggested, while pending). */
  occupancy?: string;
  /** A value typed for the zone, kN/m², with its reason; used where the table gives none. */
  manualQ?: number;
  manualNote?: string;
  /** The explicit decision: no live load here. */
  none?: boolean;
  /** Where the use came from. A suggestion is pending until confirmed. */
  provenance: 'manual' | 'suggested' | 'confirmed' | 'imported';
  /** The rows a suggestion offered. */
  candidates?: string[];
  /** A package of finishes (dead load) assigned to the zone (`finishes`). */
  finish?: string;
}

export type UseData = ZoneData & { use?: ZoneUse };
export type ZoneStatus = 'unassigned' | 'pending' | 'assigned' | 'none' | 'unsupported';

export const TABLE_REF = 'CIRSOC 101-2025, Tabla 4.1';

export function zoneUseOf(g: Pick<ModelGroup, 'kind' | 'data'> | undefined): ZoneUse | undefined {
  return g?.kind === 'loadZone' ? (g.data as UseData | undefined)?.use : undefined;
}

/** What a zone's use amounts to now. */
export function zoneStatus(use: ZoneUse | undefined): ZoneStatus {
  if (!use) return 'unassigned';
  if (use.none) return 'none';
  if (use.provenance === 'suggested') return 'pending';
  if (Number.isFinite(use.manualQ)) return 'assigned';
  if (use.occupancy) {
    const row = findOccupancy(use.occupancy);
    return row && row.uniformKNm2 !== null ? 'assigned' : 'unsupported';
  }
  return 'unassigned';
}

/** The live load a zone carries, kN/m², and where it comes from; null when it carries none or none is stated. */
export function zoneLiveLoad(use: ZoneUse | undefined): { q: number; source: 'table' | 'manual'; row?: OccupancyEntry } | null {
  const s = zoneStatus(use);
  if (s !== 'assigned' || !use) return null;
  if (Number.isFinite(use.manualQ)) return { q: use.manualQ!, source: 'manual', ...(use.occupancy && findOccupancy(use.occupancy) ? { row: findOccupancy(use.occupancy)! } : {}) };
  const row = findOccupancy(use.occupancy!)!;
  return { q: row.uniformKNm2!, source: 'table', row };
}

/**
 * A package of finishes (a floor build-up, a ceiling): layers with their thickness and unit weight,
 * or a load per square metre stated directly. Its total is a dead load on the zones it is given to,
 * apart from the structure's own weight. Never inferred from a room's name.
 */
export interface FinishLayer { name: string; thickness?: number; unitWeight?: number; q?: number }
export interface FinishPackage { layers: FinishLayer[] }

/** A package's total, kN/m²: each layer's thickness × unit weight, or its stated load. */
export function finishTotal(p: FinishPackage | undefined): number {
  return (p?.layers ?? []).reduce((s, l) => s + (Number.isFinite(l.q) ? l.q! : (l.thickness ?? 0) * (l.unitWeight ?? 0)), 0);
}

export type ZoneLoadRole = 'live' | 'finish';
export interface ZonePlanItem { zoneId: number; zone: string; defId?: number; q: number; caseId: number; distribution: FloorLoadDef['distribution']; role: ZoneLoadRole }
export interface ZonePlan {
  add: ZonePlanItem[];
  change: Array<ZonePlanItem & { from: { q: number; caseId: number; distribution: string } }>;
  remove: Array<{ defId: number; zoneId: number | null; zone: string }>;
  /** Zones whose use leaves the load undecided: unassigned, pending, a row with no value. */
  unresolved: Array<{ zoneId: number; zone: string; status: ZoneStatus }>;
  /** Zones given finishes while the model has no dead-load case to put them in. */
  finishNoCase: Array<{ zoneId: number; zone: string }>;
}

/** Whether a zone has shells under it in its plane: the load goes onto the slab, else to the members. */
/** A zone's plan box, and whether a shell's points lie wholly outside it. */
function boxOf(outer: ReadonlyArray<readonly number[]>) {
  const b = outer.reduce((a, p) => ({ x0: Math.min(a.x0, p[0]!), x1: Math.max(a.x1, p[0]!), y0: Math.min(a.y0, p[1]!), y1: Math.max(a.y1, p[1]!) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  return (pts: ReadonlyArray<{ x: number; y: number } | undefined>) => pts.every((p) => p!.x < b.x0 - 1e-6) || pts.every((p) => p!.x > b.x1 + 1e-6) || pts.every((p) => p!.y < b.y0 - 1e-6) || pts.every((p) => p!.y > b.y1 + 1e-6);
}

export function zoneHasShells(m: DefinitionModel, zoneId: number): boolean {
  const z = zoneOutline(m, zoneId);
  if (!z) return false;
  const zLevel = z.outer[0]![2];
  const outside = boxOf(z.outer);
  const region = { normal: [0, 0, 1] as [number, number, number], points: z.outer, ...(z.holes.length ? { holes: z.holes } : {}) };
  const reach = (kind: 'quad' | 'plate', nodes: readonly number[]) => {
    const pts = nodes.map((id) => m.nodes.get(id));
    if (pts.some((p) => !p || Math.abs((p.z ?? 0) - zLevel) > 1e-3)) return false;
    if (outside(pts)) return false;
    return (shellLoadForces(kind, pts as Array<{ x: number; y: number; z?: number }>, { q: 1, region })?.loadedArea ?? 0) > 1e-9;
  };
  for (const q of m.quads.values()) if (reach('quad', q.nodes)) return true;
  for (const p of m.plates.values()) if (reach('plate', p.nodes)) return true;
  return zoneOverUnmeshedPlate(m, zoneId);
}

/** A physical plate with no mesh yet under the zone, in its plane: the slab its load goes onto once meshed. */
export function zoneOverUnmeshedPlate(m: DefinitionModel, zoneId: number): boolean {
  const z = zoneOutline(m, zoneId);
  if (!z) return false;
  const zl = z.outer[0]![2];
  const zoneTris = triangles(z.outer.map((p) => [p[0], p[1]] as [number, number]));
  for (const g of m.groups.values()) {
    if (g.kind !== 'physicalMember' || !plateSurfaceOf(g)) continue;
    if ((g.members.quads?.length ?? 0) + (g.members.plates?.length ?? 0) > 0) continue;
    const pts = plateLoops(g).outer.map((id) => m.nodes.get(id));
    if (pts.length < 3 || pts.some((p) => !p || Math.abs((p.z ?? 0) - zl) > 1e-3)) continue;
    const plateTris = triangles(pts.map((p) => [p!.x, p!.y] as [number, number]));
    let shared = 0;
    for (const a of zoneTris) for (const b of plateTris) shared += Math.abs(area(clip(a, b)));
    if (shared > 1e-6) return true;
  }
  return false;
}

/**
 * The definitions the zones ask for against the ones there are (marked `fromZone`): what is
 * added, changed and removed, and what stays unresolved. `zoneIds` limits it to some zones (the
 * definitions of the others are left alone); absent, every zone.
 */
export function planZoneLoads(m: DefinitionModel, liveCaseId: number, zoneIds?: readonly number[], deadCaseId: number | null = null): ZonePlan {
  const plan: ZonePlan = { add: [], change: [], remove: [], unresolved: [], finishNoCase: [] };
  const zones = [...m.groups.values()].filter((g) => g.kind === 'loadZone' && (!zoneIds || zoneIds.includes(g.id)));
  const defs = [...m.groups.values()].filter((g) => g.kind === 'floorLoad' && (g.data as { fromZone?: number } | undefined)?.fromZone !== undefined);
  const key = (z: number, r: ZoneLoadRole) => `${z}|${r}`;
  const defOf = new Map<string, ModelGroup>();
  for (const d of defs) {
    const { fromZone: z, role } = d.data as { fromZone: number; role?: ZoneLoadRole };
    const k = key(z, role ?? 'live');
    if (defOf.has(k) || !m.groups.has(z)) {
      // A second definition for one zone and role, or one whose zone is gone: removed.
      if (!zoneIds || zoneIds.includes(z)) plan.remove.push({ defId: d.id, zoneId: m.groups.has(z) ? z : null, zone: m.groups.get(z)?.name ?? `#${z}` });
      continue;
    }
    defOf.set(k, d);
  }
  const packages = new Map([...m.groups.values()].filter((g) => g.kind === 'finishPackage').map((g) => [g.id, g.data as unknown as FinishPackage]));
  const want = (z: ModelGroup, role: ZoneLoadRole, q: number, caseId: number) => {
    const have = defOf.get(key(z.id, role));
    const item: ZonePlanItem = { zoneId: z.id, zone: z.name, q, caseId, distribution: zoneHasShells(m, z.id) ? 'slab' : 'twoWay', role };
    if (!have) { plan.add.push(item); return; }
    const d = have.data as unknown as FloorLoadDef;
    if (d.q !== item.q || d.caseId !== item.caseId || d.distribution !== item.distribution) plan.change.push({ ...item, defId: have.id, from: { q: d.q, caseId: d.caseId, distribution: d.distribution } });
  };
  const drop = (z: ModelGroup, role: ZoneLoadRole) => { const have = defOf.get(key(z.id, role)); if (have) plan.remove.push({ defId: have.id, zoneId: z.id, zone: z.name }); };
  for (const z of zones) {
    const use = zoneUseOf(z);
    const live = zoneLiveLoad(use);
    if (live) want(z, 'live', live.q, liveCaseId);
    else {
      const s = zoneStatus(use);
      if (s !== 'none') plan.unresolved.push({ zoneId: z.id, zone: z.name, status: s });
      drop(z, 'live');
    }
    // Finishes, a dead load of their own, whatever the live state.
    const pkg = use?.finish !== undefined ? packages.get(Number(use.finish)) : undefined;
    const total = finishTotal(pkg);
    if (pkg && total > 0 && deadCaseId !== null) want(z, 'finish', Math.round(total * 1e6) / 1e6, deadCaseId);
    else {
      if (pkg && total > 0) plan.finishNoCase.push({ zoneId: z.id, zone: z.name });
      drop(z, 'finish');
    }
  }
  return plan;
}

/** The definition a zone's live load is written as. */
export function zoneDefinition(item: ZonePlanItem): FloorLoadDef & { fromZone: number; role: ZoneLoadRole } {
  return { caseId: item.caseId, q: item.q, target: { by: 'zone', zoneId: item.zoneId }, distribution: item.distribution, fromZone: item.zoneId, role: item.role };
}

// ─── Review ──────────────────────────────────────────────────────

/** A zone's outline in plan, as points. */
function plan2(m: DefinitionModel, zoneId: number): Array<[number, number]> | null {
  const z = zoneOutline(m, zoneId);
  return z ? z.outer.map((p) => [p[0], p[1]]) : null;
}

/**
 * The area two zones of one level share, m² (polygons clipped one against the other; a concave
 * zone is cut in triangles first). Zero when they only touch.
 */
export function zoneOverlap(m: DefinitionModel, a: number, b: number): number {
  const za = zoneOutline(m, a), zb = zoneOutline(m, b);
  if (!za || !zb || Math.abs(za.outer[0]![2] - zb.outer[0]![2]) > 1e-3) return 0;
  const pa = plan2(m, a)!, pb = plan2(m, b)!;
  let s = 0;
  for (const ta of triangles(pa)) for (const tb of triangles(pb)) s += Math.abs(area(clip(ta, tb)));
  return s;
}

/** The part of a zone with no shell under it (on a hole, or off the slab), m²: what its load cannot go onto. */
export function zoneUnsupported(m: DefinitionModel, zoneId: number): number {
  const z = zoneOutline(m, zoneId);
  if (!z) return 0;
  const region = { normal: [0, 0, 1] as [number, number, number], points: z.outer, ...(z.holes.length ? { holes: z.holes } : {}) };
  let loaded = 0;
  const zl = z.outer[0]![2];
  const outside = boxOf(z.outer);
  const add = (kind: 'quad' | 'plate', nodes: readonly number[]) => {
    const pts = nodes.map((id) => m.nodes.get(id));
    if (pts.some((p) => !p || Math.abs((p.z ?? 0) - zl) > 1e-3)) return;
    if (outside(pts)) return;
    loaded += shellLoadForces(kind, pts as Array<{ x: number; y: number; z?: number }>, { q: 1, region })?.loadedArea ?? 0;
  };
  for (const q of m.quads.values()) add('quad', q.nodes);
  for (const p of m.plates.values()) add('plate', p.nodes);
  return Math.max(0, zoneArea(m, zoneId) - loaded);
}

function area(p: ReadonlyArray<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i]!, b = p[(i + 1) % p.length]!; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

/** Ear-clipping triangulation of a simple polygon. */
function triangles(poly: ReadonlyArray<[number, number]>): Array<Array<[number, number]>> {
  const pts = area(poly) < 0 ? [...poly].reverse() : [...poly];
  const out: Array<Array<[number, number]>> = [];
  const idx = pts.map((_, i) => i);
  const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]) => {
    const s = (u: [number, number], v: [number, number], w: [number, number]) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    return s(a, b, p) >= -1e-12 && s(b, c, p) >= -1e-12 && s(c, a, p) >= -1e-12;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = pts[idx[(k + idx.length - 1) % idx.length]!]!, b = pts[idx[k]!]!, c = pts[idx[(k + 1) % idx.length]!]!;
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12) continue;
      if (idx.some((j) => { const p = pts[j]!; return p !== a && p !== b && p !== c && inside(p, a, b, c); })) continue;
      out.push([a, b, c]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push(idx.map((i) => pts[i]!));
  return out;
}

/** Sutherland–Hodgman: `subject` clipped by the convex `clipper` (counter-clockwise). */
function clip(subject: Array<[number, number]>, clipper: Array<[number, number]>): Array<[number, number]> {
  let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i]!, b = clipper[(i + 1) % clipper.length]!;
    const side = (p: [number, number]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const input = out; out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k]!, q = input[(k + 1) % input.length]!;
      const sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
