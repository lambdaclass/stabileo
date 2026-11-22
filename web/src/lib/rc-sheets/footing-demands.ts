import { GRAVITY_CASES, LATERAL_CASES } from '../engine/detailing/service-reaction';
import type { Reaction3D } from '../engine/types-3d';
import type { FootingAction, FootingColumn, FootingDemand, FootingSoil, ModelledFooting } from './footing-types';

export interface FootingRecord {
  id: number; name: string; nodeId: number; kind: string;
  B: number; L: number; thickness: number; rotationDeg: number;
  eccentricityB: number; eccentricityL: number;
  cover: number; foundingElevation: number; soilProfileId: number | null;
  anchor?: [number, number]; supportedNodeIds?: number[];
  straps?: Array<{ toFootingId: number; nodeId?: number }>;
}

type Reactions = { reactions?: readonly Reaction3D[] };

export interface FootingDemandInput {
  supportNodes: readonly number[];
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  footings: readonly FootingRecord[];
  /** The column standing on a node, plan size along X and Y; null where none does. */
  columnAt(nodeId: number): (FootingColumn & { name: string }) | null;
  /** The soil a footing bears on: its own profile, else the project's default. */
  soilOf(profileId: number | null): FootingSoil | null;
  sets: ReadonlyArray<{ name: string; result: Reactions }>;
  /** The load cases solved apart, by type ('D', 'L', 'W', …). */
  cases: ReadonlyArray<{ type: string; result: Reactions }>;
  levelAt?(z: number): string;
  /** The walls that meet at the foundation, columns inside them or not: each stands on one footing (`FootingPier`). */
  piers?: readonly FootingPier[];
}

/** A group of walls at the foundation and the columns inside them: the supported nodes along their base, the plan box their footprint fills, m, and its area, m². */
export interface FootingPier {
  key: string; name: string;
  nodes: number[];
  box: { x0: number; y0: number; x1: number; y1: number };
  area: number;
  /** Up to the first floor, m. */
  storey?: number;
  /** The bottom storey's walls, by row key. */
  walls: string[];
  /** Its section in plan, global X and Y, m. */
  outline?: Array<{ x: number; y: number }>;
}

const reactionAt = (r: Reactions, node: number) => r.reactions?.find((x) => x.nodeId === node);

/** What the structure puts on its footing: the support's reaction turned round. */
export const actionOf = (combo: string, r: Pick<Reaction3D, 'fx' | 'fy' | 'fz' | 'mx' | 'my'>): FootingAction =>
  ({ combo, N: r.fz, Mx: -r.mx, My: -r.my, Vx: -r.fx, Vy: -r.fy });

function serviceOf(m: FootingDemandInput, node: number): { service: FootingAction | null; lateralLeftOut: number; permanent?: number } {
  const sum = { fx: 0, fy: 0, fz: 0, mx: 0, my: 0 };
  let gravity = 0, lateral = 0, permanent = 0;
  for (const c of m.cases) {
    const r = reactionAt(c.result, node);
    if (!r) continue;
    if (GRAVITY_CASES.has(c.type)) {
      gravity++;
      if (c.type === 'D') permanent += r.fz;
      for (const k of ['fx', 'fy', 'fz', 'mx', 'my'] as const) sum[k] += r[k];
    } else if (LATERAL_CASES.has(c.type) && (Math.abs(r.fz) + Math.abs(r.mx) + Math.abs(r.my) + Math.abs(r.fx) + Math.abs(r.fy)) > 1e-9) lateral++;
  }
  return { service: gravity ? actionOf('D + L', sum) : null, lateralLeftOut: lateral, ...(gravity ? { permanent } : {}) };
}

/** A combined footing of two columns the sheets design: square to the axes, as `combineFootings` and the sheets make it. */
const designedCombined = (f: FootingRecord) => f.kind === 'combined' && f.supportedNodeIds?.length === 1 && Math.abs(((f.rotationDeg % 90) + 90) % 90) < 1e-6;

function modelled(f: FootingRecord, all: readonly FootingRecord[]): ModelledFooting {
  const quarter = ((Math.round(f.rotationDeg / 90) % 4) + 4) % 4;
  const turned = designedCombined(f) ? false : Math.abs(((f.rotationDeg % 180) + 180) % 180) > 1e-6;
  const outOfScope = designedCombined(f) ? undefined : f.kind !== 'isolated' || (f.supportedNodeIds?.length ?? 0) > 0 ? 'kind' as const : turned ? 'rotated' as const : undefined;
  const straps = (f.straps ?? []).map((s) => s.nodeId ?? all.find((g) => g.id === s.toFootingId)?.nodeId).filter((n): n is number => n !== undefined);
  // The plan in global axes: a quarter turn swaps the sides and turns the offset.
  const [B, L] = quarter % 2 ? [f.L, f.B] : [f.B, f.L];
  const c = [1, 0, -1, 0][quarter]!, sn = [0, 1, 0, -1][quarter]!;
  const ex = f.eccentricityB * c - f.eccentricityL * sn, ey = f.eccentricityB * sn + f.eccentricityL * c;
  return {
    id: f.id, name: f.name, B, L, h: f.thickness, ex, ey,
    cover: f.cover, founding: f.foundingElevation, ...(f.anchor ? { anchor: f.anchor } : {}), ...(straps.length ? { straps } : {}), ...(outOfScope ? { outOfScope } : {}),
  };
}

/** The reactions at several nodes as one action about `c`, m: their forces summed and their moments carried there. */
export function summedAction(combo: string, rs: ReadonlyArray<Reaction3D & { x: number; y: number }>, c: { x: number; y: number }): FootingAction {
  const t = { fx: 0, fy: 0, fz: 0, mx: 0, my: 0 };
  for (const r of rs) {
    t.fx += r.fx; t.fy += r.fy; t.fz += r.fz;
    t.mx += r.mx + (r.y - c.y) * r.fz;
    t.my += r.my - (r.x - c.x) * r.fz;
  }
  return actionOf(combo, t);
}

/** A footing the model holds under every node of a pier, read about the pier's box centre. */
function modelledPier(p: FootingPier, all: readonly FootingRecord[], nodes: FootingDemandInput['nodes']): ModelledFooting | undefined {
  const f = all.find((g) => p.nodes.every((n) => g.nodeId === n || g.supportedNodeIds?.includes(n)));
  const at = f ? nodes.get(f.nodeId) : undefined;
  if (!f || !at) return undefined;
  const c = { x: (p.box.x0 + p.box.x1) / 2, y: (p.box.y0 + p.box.y1) / 2 };
  const m = modelled({ ...f, kind: 'isolated', supportedNodeIds: [] }, all);
  return { ...m, ex: m.ex + at.x - c.x, ey: m.ey + at.y - c.y, ...(Math.abs(((f.rotationDeg % 90) + 90) % 90) > 1e-6 ? { outOfScope: 'rotated' as const } : {}) };
}

/** A pier's footing: the reactions of every node along its base summed about the centre of its box, which stands for its column. */
function pierDemand(p: FootingPier, m: FootingDemandInput): FootingDemand | null {
  const pts = p.nodes.map((n) => ({ n, p: m.nodes.get(n) })).filter((x): x is { n: number; p: { x: number; y: number; z?: number } } => !!x.p);
  if (!pts.length) return null;
  const c = { x: (p.box.x0 + p.box.x1) / 2, y: (p.box.y0 + p.box.y1) / 2 }, z = Math.min(...pts.map((x) => x.p.z ?? 0));
  const at = (r: Reactions) => pts.flatMap(({ n, p: q }) => { const x = reactionAt(r, n); return x ? [{ ...x, x: q.x, y: q.y }] : []; });
  const combos = m.sets.flatMap((s) => { const rs = at(s.result); return rs.length ? [summedAction(s.name, rs, c)] : []; });
  const gravity = m.cases.filter((k) => GRAVITY_CASES.has(k.type)).flatMap((k) => at(k.result));
  const lateral = m.cases.filter((k) => LATERAL_CASES.has(k.type) && at(k.result).some((r) => Math.abs(r.fz) + Math.abs(r.mx) + Math.abs(r.my) + Math.abs(r.fx) + Math.abs(r.fy) > 1e-9)).length;
  const own = modelledPier(p, m.footings, m.nodes);
  const rep = pts.reduce((b, x) => (Math.hypot(x.p.x - c.x, x.p.y - c.y) < Math.hypot(b.p.x - c.x, b.p.y - c.y) ? x : b), pts[0]!);
  return {
    key: `footing:${p.key}`, name: p.name, level: m.levelAt?.(z), nodeId: rep.n, at: { x: c.x, y: c.y, z },
    column: { b: p.box.x1 - p.box.x0, h: p.box.y1 - p.box.y0, area: p.area, ...(p.storey ? { storey: p.storey } : {}) },
    service: gravity.length ? summedAction('D + L', gravity, c) : null, lateralLeftOut: lateral, combos,
    ...(gravity.length ? { permanent: m.cases.filter((k) => k.type === 'D').flatMap((k) => at(k.result)).reduce((t, r) => t + r.fz, 0) } : {}),
    soil: m.soilOf(own ? m.footings.find((f) => f.id === own.id)?.soilProfileId ?? null : null),
    ...(own ? { footing: own } : {}), pier: { key: p.key, nodes: p.nodes, walls: p.walls, ...(p.outline ? { outline: p.outline } : {}), points: pts.map(({ p: q }) => ({ x: q.x, y: q.y })) },
  };
}

/**
 * One footing per supported column base and per modelled footing: the footing the model holds
 * there if any, the column's reactions in every combination and its service gravity load. Nodes
 * another footing carries as well (a combined footing's second column) are that footing's, and
 * the nodes of a pier's base its own footing's, which the model's footing under all of them is.
 */
export function footingDemands(m: FootingDemandInput): FootingDemand[] {
  const owner = new Map<number, string>();
  for (const p of m.piers ?? []) for (const n of p.nodes) owner.set(n, p.key);
  const groups = m.footings.filter((f) => (f.kind === 'strip' || f.kind === 'mat' || f.kind === 'combined') && !designedCombined(f)
    && new Set([f.nodeId, ...(f.supportedNodeIds ?? [])].map((n) => owner.get(n) ?? `n${n}`)).size >= 2);
  const inGroup = new Set(groups.flatMap((f) => [f.nodeId, ...(f.supportedNodeIds ?? [])]));
  const footings = m.footings.filter((f) => !groups.includes(f));
  m = { ...m, footings };
  const byNode = new Map<number, FootingRecord>();
  for (const f of [...m.footings].sort((a, b) => a.id - b.id)) if (!byNode.has(f.nodeId)) byNode.set(f.nodeId, f);
  const onPiers = new Set((m.piers ?? []).flatMap((p) => p.nodes));
  const pierFootings = new Set(m.footings.filter((f) => onPiers.has(f.nodeId)).map((f) => f.id));
  for (const id of pierFootings) for (const [n, f] of byNode) if (f.id === id) byNode.delete(n);
  const carried = new Set([...m.footings.filter((f) => !pierFootings.has(f.id)).flatMap((f) => f.supportedNodeIds ?? []), ...onPiers]);
  const own = (n: number): FootingDemand | null => {
    const p = m.nodes.get(n), col = m.columnAt(n);
    if (!p) return null;
    const combos = m.sets.flatMap((s) => { const r = reactionAt(s.result, n); return r ? [actionOf(s.name, r)] : []; });
    const { service, lateralLeftOut, permanent } = serviceOf(m, n);
    const z = p.z ?? 0;
    return {
      key: `footing:n${n}`, name: col?.name || `N${n}`, level: m.levelAt?.(z), nodeId: n, at: { x: p.x, y: p.y, z },
      column: col ? { b: col.b, h: col.h, ...(col.rowKey ? { rowKey: col.rowKey } : {}), ...(col.storey ? { storey: col.storey } : {}) } : null,
      service, lateralLeftOut, combos, soil: null, ...(permanent !== undefined ? { permanent } : {}),
    };
  };
  const nodes = [...new Set([...m.supportNodes.filter((n) => m.columnAt(n) || inGroup.has(n)), ...byNode.keys()])].filter((n) => !carried.has(n) && m.nodes.has(n));
  const out: FootingDemand[] = [];
  for (const n of nodes.sort((a, b) => a - b)) {
    const f = byNode.get(n), base = own(n)!;
    const second = f && designedCombined(f) ? own(f.supportedNodeIds![0]!) : null;
    out.push({
      ...base, name: f?.name || base.name,
      ...(f ? { footing: modelled(f, m.footings) } : {}), soil: m.soilOf(f ? f.soilProfileId : null),
      ...(second ? { carried: second } : {}),
    });
  }
  for (const p of m.piers ?? []) { const d = pierDemand(p, m); if (d) out.push(d); }
  return groups.length ? withModelGroups(out, groups, m) : out;
}

/** The strips and mats the model holds under several footings: each member keeps its own demand with the group's plan read from its own axis. */
function withModelGroups(out: FootingDemand[], groups: readonly FootingRecord[], m: FootingDemandInput): FootingDemand[] {
  const held = new Map<string, { footing: ModelledFooting; soil: FootingSoil | null }>();
  for (const f of groups) {
    const nodes = new Set([f.nodeId, ...(f.supportedNodeIds ?? [])]);
    const members = out.filter((d) => (d.pier ? d.pier.nodes.every((n) => nodes.has(n)) : nodes.has(d.nodeId)));
    const at = m.nodes.get(f.nodeId);
    if (members.length < 2 || !at) continue;
    const base = modelled({ ...f, kind: 'isolated', supportedNodeIds: [] }, m.footings);
    const kind = f.kind === 'mat' ? 'mat' as const : 'strip' as const;
    const keys = members.map((d) => d.key);
    const soil = m.soilOf(f.soilProfileId);
    for (const d of members) { const { outOfScope: _o, ...rest } = base; held.set(d.key, { footing: { ...rest, ex: base.ex + at.x - d.at.x, ey: base.ey + at.y - d.at.y, group: { kind, members: keys } }, soil }); }
  }
  return out.map((d) => { const f = held.get(d.key); return f ? { ...d, footing: f.footing, soil: f.soil } : d; });
}
