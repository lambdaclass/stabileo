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
}

const reactionAt = (r: Reactions, node: number) => r.reactions?.find((x) => x.nodeId === node);

/** What the structure puts on its footing: the support's reaction turned round. */
export const actionOf = (combo: string, r: Pick<Reaction3D, 'fx' | 'fy' | 'fz' | 'mx' | 'my'>): FootingAction =>
  ({ combo, N: r.fz, Mx: -r.mx, My: -r.my, Vx: -r.fx, Vy: -r.fy });

function serviceOf(m: FootingDemandInput, node: number): { service: FootingAction | null; lateralLeftOut: number } {
  const sum = { fx: 0, fy: 0, fz: 0, mx: 0, my: 0 };
  let gravity = 0, lateral = 0;
  for (const c of m.cases) {
    const r = reactionAt(c.result, node);
    if (!r) continue;
    if (GRAVITY_CASES.has(c.type)) {
      gravity++;
      for (const k of ['fx', 'fy', 'fz', 'mx', 'my'] as const) sum[k] += r[k];
    } else if (LATERAL_CASES.has(c.type) && (Math.abs(r.fz) + Math.abs(r.mx) + Math.abs(r.my) + Math.abs(r.fx) + Math.abs(r.fy)) > 1e-9) lateral++;
  }
  return { service: gravity ? actionOf('D + L', sum) : null, lateralLeftOut: lateral };
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

/**
 * One footing per supported column base and per modelled footing: the footing the model holds
 * there if any, the column's reactions in every combination and its service gravity load. Nodes
 * another footing carries as well (a combined footing's second column) are that footing's.
 */
export function footingDemands(m: FootingDemandInput): FootingDemand[] {
  const byNode = new Map<number, FootingRecord>();
  for (const f of [...m.footings].sort((a, b) => a.id - b.id)) if (!byNode.has(f.nodeId)) byNode.set(f.nodeId, f);
  const carried = new Set(m.footings.flatMap((f) => f.supportedNodeIds ?? []));
  const own = (n: number): FootingDemand | null => {
    const p = m.nodes.get(n), col = m.columnAt(n);
    if (!p) return null;
    const combos = m.sets.flatMap((s) => { const r = reactionAt(s.result, n); return r ? [actionOf(s.name, r)] : []; });
    const { service, lateralLeftOut } = serviceOf(m, n);
    const z = p.z ?? 0;
    return {
      key: `footing:n${n}`, name: col?.name || `N${n}`, level: m.levelAt?.(z), nodeId: n, at: { x: p.x, y: p.y, z },
      column: col ? { b: col.b, h: col.h, ...(col.rowKey ? { rowKey: col.rowKey } : {}), ...(col.storey ? { storey: col.storey } : {}) } : null,
      service, lateralLeftOut, combos, soil: null,
    };
  };
  const nodes = [...new Set([...m.supportNodes.filter((n) => m.columnAt(n)), ...byNode.keys()])].filter((n) => !carried.has(n) && m.nodes.has(n));
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
  return out;
}
