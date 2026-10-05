/**
 * Floor loads kept as what they are (an area load on a target, carried to the members or to the
 * slab) and load zones, both stored as groups of the model (`ModelGroup.kind`). A definition is
 * expanded into ordinary loads, marked `fromDef`, when it is written and again before a solve
 * (`store/defined-loads.ts`), so a beam added or a node moved since is taken into account and
 * every reader of the model's loads (solve, statics, mass, report, tables) sees plain loads.
 *
 * A zone: its outline is the group's nodes in order, the members it leaves out its elements, and
 * its openings other zones (`data.openings`). It is read in plan, projected vertically.
 *
 * Targets of a floor load: a level, a group, the members and shells it holds itself, a box of
 * coordinates, or a zone. Distribution: two way or one way to the members
 * (`engine/loads/floor-loads.ts`), or onto the slab's shells as surface loads.
 *
 * Pure: the model in, the loads and what was found out.
 */
import { floorLoad, type FloorBeam, type FloorLoadResult } from '../../engine/loads/floor-loads';
import type { GroupMembers, Load, ModelGroup } from '../../store/model.svelte';

type P3 = [number, number, number];

export type FloorTarget =
  | { by: 'level'; z: number }
  | { by: 'group'; groupId: number }
  | { by: 'own' }
  | { by: 'range'; x?: [number, number]; y?: [number, number]; z?: [number, number] }
  | { by: 'zone'; zoneId: number };

export interface FloorLoadDef {
  caseId: number;
  /** kN/m², downward; negative lifts. */
  q: number;
  target: FloorTarget;
  distribution: 'twoWay' | 'oneWay' | 'slab';
  spanAxis?: 'x' | 'y';
  /** On an inclined floor, q per plan area. */
  perPlanArea?: boolean;
}

export interface ZoneData { openings?: number[] }

export interface DefinitionModel {
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; type: string; sectionId: number; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number }>;
  quads: ReadonlyMap<number, { id: number; nodes: number[] }>;
  plates: ReadonlyMap<number, { id: number; nodes: number[] }>;
  sections: ReadonlyMap<number, { rotation?: number }>;
  groups: ReadonlyMap<number, ModelGroup>;
  loadCases: ReadonlyArray<{ id: number }>;
}

export interface Expansion {
  defId: number;
  loads: Load[];
  /** What the member path found: panels, skipped, totals. Null on a slab or a refused one. */
  result: FloorLoadResult | null;
  /** Why it wrote nothing, when it did not. */
  problem?: 'noCase' | 'noZone' | 'nothingTargeted';
  totalKN: number;
}

const TOL = 1e-3;
const pt = (n: { x: number; y: number; z?: number }): P3 => [n.x, n.y, n.z ?? 0];

/** A zone's outline and openings, or null when it has fewer than three nodes. */
export function zoneOutline(m: DefinitionModel, zoneId: number, seen = new Set<number>()): { outer: P3[]; holes: P3[][]; excluded: Set<number> } | null {
  const g = m.groups.get(zoneId);
  if (!g || g.kind !== 'loadZone') return null;
  const outer = (g.members.nodes ?? []).map((id) => m.nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n).map(pt);
  if (outer.length < 3) return null;
  seen.add(zoneId);
  const holes: P3[][] = [];
  for (const h of ((g.data as ZoneData | undefined)?.openings ?? [])) {
    if (seen.has(h)) continue;
    const o = zoneOutline(m, h, seen);
    if (o) holes.push(o.outer);
  }
  return { outer, holes, excluded: new Set(g.members.elements ?? []) };
}

/** The plane through a polygon's points (its first three that are not in line), or null. */
function planeOf(pts: readonly P3[]): { o: P3; n: P3 } | null {
  const o = pts[0]!;
  for (let i = 1; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i]!.map((v, k) => v - o[k]!), b = pts[j]!.map((v, k) => v - o[k]!);
    const c: P3 = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const l = Math.hypot(...c);
    if (l > 1e-9) return { o, n: [c[0] / l, c[1] / l, c[2] / l] };
  }
  return null;
}

/** The members and the shells a target names. */
export function targetsOf(m: DefinitionModel, def: FloorLoadDef, own: GroupMembers): { elements: number[]; quads: number[]; plates: number[] } {
  const t = def.target;
  const nodeOk = (pred: (p: P3) => boolean) => (id: number) => { const n = m.nodes.get(id); return !!n && pred(pt(n)); };
  const byNodes = (pred: (p: P3) => boolean) => {
    const ok = nodeOk(pred);
    return {
      elements: [...m.elements.values()].filter((e) => ok(e.nodeI) && ok(e.nodeJ)).map((e) => e.id),
      quads: [...m.quads.values()].filter((q) => q.nodes.every(ok)).map((q) => q.id),
      plates: [...m.plates.values()].filter((q) => q.nodes.every(ok)).map((q) => q.id),
    };
  };
  switch (t.by) {
    case 'level': return byNodes((p) => Math.abs(p[2] - t.z) <= TOL);
    case 'group': {
      const g = m.groups.get(t.groupId)?.members;
      return { elements: [...(g?.elements ?? [])], quads: [...(g?.quads ?? [])], plates: [...(g?.plates ?? [])] };
    }
    case 'own': return { elements: [...(own.elements ?? [])], quads: [...(own.quads ?? [])], plates: [...(own.plates ?? [])] };
    case 'range': {
      const inR = (v: number, r?: [number, number]) => !r || (v >= Math.min(...r) - TOL && v <= Math.max(...r) + TOL);
      return byNodes((p) => inR(p[0], t.x) && inR(p[1], t.y) && inR(p[2], t.z));
    }
    case 'zone': {
      // The members and shells of the zone's plane: the panels it crosses are found whole and
      // the load is limited to the zone where it is shared out (`floor-tributary.ts`).
      const z = zoneOutline(m, t.zoneId);
      if (!z) return { elements: [], quads: [], plates: [] };
      const pl = planeOf(z.outer);
      if (!pl) return { elements: [], quads: [], plates: [] };
      const r = byNodes((p) => Math.abs((p[0] - pl.o[0]) * pl.n[0] + (p[1] - pl.o[1]) * pl.n[1] + (p[2] - pl.o[2]) * pl.n[2]) <= TOL);
      return { ...r, elements: r.elements.filter((id) => !z.excluded.has(id)) };
    }
  }
}

/** One stored definition's loads. */
export function expandFloorLoad(m: DefinitionModel, defId: number, opts: { leftHand: boolean }): Expansion {
  const g = m.groups.get(defId);
  const def = g?.data as unknown as FloorLoadDef | undefined;
  if (!g || !def) return { defId, loads: [], result: null, problem: 'nothingTargeted', totalKN: 0 };
  return expandDefinition(m, def, g.members, defId, opts);
}

/** A definition's loads, stored or not (a preview): `own` the members it holds itself. */
export function expandDefinition(m: DefinitionModel, def: FloorLoadDef, own: GroupMembers, defId: number, opts: { leftHand: boolean }): Expansion {
  const none = (problem: Expansion['problem']): Expansion => ({ defId, loads: [], result: null, problem, totalKN: 0 });
  if (!m.loadCases.some((c) => c.id === def.caseId)) return none('noCase');
  const zone = def.target.by === 'zone' ? zoneOutline(m, def.target.zoneId) : null;
  if (def.target.by === 'zone' && !zone) return none('noZone');
  const tg = targetsOf(m, def, own);
  const mark = { caseId: def.caseId, fromDef: defId };

  if (def.distribution === 'slab') {
    const loads: Load[] = [];
    const extra = {
      ...(def.perPlanArea ? { frame: 'projected' as const, dir: [0, 0, -1] as P3 } : {}),
      ...(zone ? { region: { normal: [0, 0, 1] as P3, points: zone.outer, ...(zone.holes.length ? { holes: zone.holes } : {}) } } : {}),
    };
    for (const id of tg.quads) loads.push({ type: 'surface3d', data: { id: 0, quadId: id, q: def.q, ...extra, ...mark } });
    for (const id of tg.plates) loads.push({ type: 'surface3d', data: { id: 0, quadId: id, on: 'plate', q: def.q, ...extra, ...mark } });
    return loads.length ? { defId, loads, result: null, totalKN: NaN } : none('nothingTargeted');
  }

  const beams: FloorBeam[] = tg.elements.map((id) => m.elements.get(id)).filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({
    id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: e.type === 'truss' ? 'truss' : 'frame', sectionId: e.sectionId,
    localYx: e.localYx, localYy: e.localYy, localYz: e.localYz, rollAngle: e.rollAngle,
  }));
  if (!beams.length) return none('nothingTargeted');
  const res = floorLoad({
    nodes: m.nodes as never, beams, q: def.q, distribution: def.distribution, spanAxis: def.spanAxis,
    sectionRotation: (id) => m.sections.get(id)?.rotation ?? 0, leftHand: opts.leftHand,
    ...(zone ? { zone: { outer: zone.outer, holes: zone.holes } } : {}),
    ...(def.perPlanArea ? { perPlanArea: true } : {}),
  });
  const loads: Load[] = [
    ...res.loads.map((l): Load => ({ type: 'distributed3d', data: { id: 0, elementId: l.elementId, qYI: l.qYI, qYJ: l.qYJ, qZI: l.qZI, qZJ: l.qZJ, ...(l.a !== undefined ? { a: l.a, b: l.b } : {}), ...mark } })),
    ...res.nodal.map((n): Load => ({ type: 'nodal3d', data: { id: 0, nodeId: n.nodeId, fx: 0, fy: 0, fz: n.fz, mx: 0, my: 0, mz: 0, ...mark } })),
  ];
  return { defId, loads, result: res, totalKN: res.totalKN, ...(loads.length ? {} : { problem: 'nothingTargeted' as const }) };
}

/** Every floor-load definition of the model, expanded. */
export function expandAll(m: DefinitionModel, opts: { leftHand: boolean }): Expansion[] {
  return [...m.groups.values()].filter((g) => g.kind === 'floorLoad').map((g) => expandFloorLoad(m, g.id, opts));
}

/** Whether the loads a model holds from its definitions are the ones they expand to now. */
export function definitionsCurrent(loads: readonly Load[], expanded: readonly Expansion[]): boolean {
  const key = (l: Load) => { const { id: _id, ...d } = l.data as unknown as Record<string, unknown>; return `${l.type}|${stable(d)}`; };
  const have = loads.filter((l) => (l.data as { fromDef?: number }).fromDef !== undefined).map(key).sort();
  const want = expanded.flatMap((e) => e.loads).map(key).sort();
  return have.length === want.length && have.every((k, i) => k === want[i]);
}

/** JSON with every object's keys in order, so two equal loads read alike. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
