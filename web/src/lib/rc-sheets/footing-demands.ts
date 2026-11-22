import { GRAVITY_CASES, LATERAL_CASES } from '../engine/detailing/service-reaction';
import type { Reaction3D } from '../engine/types-3d';
import type { FootingAction, FootingColumn, FootingDemand, FootingSoil, ModelledFooting } from './footing-types';

export interface FootingRecord {
  id: number; name: string; nodeId: number; kind: string;
  B: number; L: number; thickness: number; rotationDeg: number;
  eccentricityB: number; eccentricityL: number;
  cover: number; foundingElevation: number; soilProfileId: number | null;
  anchor?: [number, number]; supportedNodeIds?: number[];
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

function modelled(f: FootingRecord): ModelledFooting {
  const turned = Math.abs(((f.rotationDeg % 180) + 180) % 180) > 1e-6;
  const outOfScope = f.kind !== 'isolated' || (f.supportedNodeIds?.length ?? 0) > 0 ? 'kind' as const : turned ? 'rotated' as const : undefined;
  return {
    id: f.id, name: f.name, B: f.B, L: f.L, h: f.thickness, ex: f.eccentricityB, ey: f.eccentricityL,
    cover: f.cover, founding: f.foundingElevation, ...(f.anchor ? { anchor: f.anchor } : {}), ...(outOfScope ? { outOfScope } : {}),
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
  const nodes = [...new Set([...m.supportNodes.filter((n) => m.columnAt(n)), ...byNode.keys()])].filter((n) => !carried.has(n) && m.nodes.has(n));
  const out: FootingDemand[] = [];
  for (const n of nodes.sort((a, b) => a - b)) {
    const p = m.nodes.get(n)!, f = byNode.get(n), col = m.columnAt(n);
    const combos = m.sets.flatMap((s) => { const r = reactionAt(s.result, n); return r ? [actionOf(s.name, r)] : []; });
    const { service, lateralLeftOut } = serviceOf(m, n);
    const z = p.z ?? 0;
    out.push({
      key: `footing:n${n}`, name: f?.name || col?.name || `N${n}`, level: m.levelAt?.(z), nodeId: n, at: { x: p.x, y: p.y, z },
      column: col ? { b: col.b, h: col.h, ...(col.rowKey ? { rowKey: col.rowKey } : {}) } : null,
      ...(f ? { footing: modelled(f) } : {}), service, lateralLeftOut, combos, soil: m.soilOf(f ? f.soilProfileId : null),
    });
  }
  return out;
}
