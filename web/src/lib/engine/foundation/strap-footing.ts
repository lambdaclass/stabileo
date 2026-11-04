/**
 * A footing balanced by strap beams to other footings.
 *
 * A footing at a property line is set off its column, and a column fixed at its foot brings a
 * moment down to it; on its own, its bearing carries both. Tied by a strap beam (stiff enough to
 * turn the pair as one) to a footing further on, what lies along the strap goes into it. With P1
 * the column, a the offset of the footing's centre along the strap, w the column's moment about
 * the strap's cross axis (as the shift it gives the load, kN·m) and L the distance to the
 * partner's column, moments about the column give the strap's end force
 *
 *   V = (P1 · a + |w|) / (L − a),
 *
 * the footing's reaction R1 = P1 + ΣV, and the partner relieved by (P1 · a − |w|) / (L − a). The
 * moment's sign is the design's to envelope (it checks both): the footing takes the larger
 * reaction and its partner the smaller relief. The strap carries M = P1 · a + |w| at the column.
 * Without a moment this is the classical R1 = P1 · L / (L − a), R2 = P2 − P1 · a / (L − a).
 *
 * Straps in two directions take the whole offset and moment, and the footing is checked centred;
 * straps along one line take what lies along it, and the rest stays with the footing. With more
 * than two, the two that frame the footing best are read: the one the offset points to most, and
 * the one most square to it. All of it is linear in the loads, so it holds case by case and
 * combination by combination.
 *
 * A strip under a basement wall propped at its head by a floor balances its offset across the
 * same way, the wall and the floor being the strap: P·e and the wall foot's moment across are a
 * couple between the foot and the floor, and the strip is checked centred across, under its
 * load alone (`Footing.balanced`).
 */
import type { Footing } from '../../model/footing';
import type { CaseReaction, CombinationReaction, FootingNode, NodeReactions } from '../detailing/run-footing-design';

export interface StrapReading {
  footingId: number; partnerId: number; partnerNodeId: number;
  /** Between the columns, and the offset along the strap, m. */
  L: number; e: number;
  /** R1 / P1 over all the footing's straps, in the governing combination. */
  factor: number;
  /** Whether the footing's straps frame it both ways (checked centred) or along one line. */
  bothWays: boolean;
  /** The strap's governing moment and shear, kN·m and kN, and the combination they come from. */
  M: number; V: number; combinationName: string | null;
  /** The change in the partner's reaction in that combination, kN: positive relieves it. */
  relief: number;
}

/** A footing whose offset across is taken by the structure above (`Footing.balanced`). */
export interface BalancedReading {
  footingId: number;
  /** The offset across that is no longer the soil's, m, and the footing's length along, m. */
  e: number; length: number;
  /** The couple: moment at the foot per metre, kN·m/m, and the prop's force per metre, kN/m (with a height). */
  m: number; h?: number; combinationName: string | null;
}

export interface StrapAdjusted {
  footings: Footing[];
  reactions: Map<number, NodeReactions>;
  straps: StrapReading[];
  balanced: BalancedReading[];
  /** Straps that cannot be read: the partner missing, or the offset pointing away from it. */
  refused: Array<{ footingId: number; reason: 'noPartner' | 'offsetNotTowardPartner' }>;
}

type V2 = { x: number; y: number };
const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
const cross = (a: V2, b: V2) => a.x * b.y - a.y * b.x;

/** A vector in a basis of one or two directions: its components, and what lies off the basis. */
function decompose(v: V2, basis: readonly V2[]): { c: number[]; rest: V2 } {
  if (basis.length === 1) {
    const c = dot(v, basis[0]!);
    return { c: [c], rest: { x: v.x - c * basis[0]!.x, y: v.y - c * basis[0]!.y } };
  }
  const [u, w] = basis as [V2, V2], det = cross(u, w);
  return { c: [cross(v, w) / det, cross(u, v) / det], rest: { x: 0, y: 0 } };
}

export function strapAdjust(footings: readonly Footing[], nodes: ReadonlyMap<number, FootingNode>, reactions: ReadonlyMap<number, NodeReactions>): StrapAdjusted {
  const out: StrapAdjusted = { footings: [...footings], reactions: new Map(reactions), straps: [], balanced: [], refused: [] };
  const replace = (id: number, patch: Partial<Footing>) => { out.footings = out.footings.map((x) => (x.id === id ? { ...x, ...patch } : x)); };
  // The structure's couple: the offset across (local L, the short side of a strip) and the wall
  // foot's moment across leave the soil, for the wall and the floor at its head.
  for (const f of footings) {
    if (f.balanced?.by !== 'structure') continue;
    const e = Math.abs(f.eccentricityL);
    const t = (f.rotationDeg * Math.PI) / 180, across: V2 = { x: -Math.sin(t), y: Math.cos(t) };
    replace(f.id, { eccentricityL: 0 });
    const nodesOn = [f.nodeId, ...(f.supportedNodeIds ?? [])];
    // Each node's reactions without their moment across: shift (my along x, mx along y) less its part along `across`.
    const strip = <R extends CombinationReaction | CaseReaction>(c: R): R => {
      const w = dot({ x: c.my, y: c.mx }, across);
      return { ...c, my: c.my - w * across.x, mx: c.mx - w * across.y };
    };
    const combos = new Map<number, { n: string; m: number }>();
    for (const n of nodesOn) {
      const r = reactions.get(n);
      if (!r) continue;
      for (const c of r.factored) {
        const k = combos.get(c.combinationId) ?? { n: c.combinationName, m: 0 };
        k.m += Math.abs(c.fz) * e + Math.abs(dot({ x: c.my, y: c.mx }, across)); combos.set(c.combinationId, k);
      }
      out.reactions.set(n, { factored: r.factored.map(strip), ...(r.cases ? { cases: r.cases.map(strip) } : {}) });
    }
    let worst = 0, name: string | null = null;
    for (const k of combos.values()) if (k.m > worst) { worst = k.m; name = k.n; }
    if (!(worst > 1e-9)) continue;
    const m = worst / Math.max(f.B, 1e-6);
    out.balanced.push({ footingId: f.id, e, length: f.B, m, ...(f.balanced.height ? { h: m / f.balanced.height } : {}), combinationName: name });
  }

  for (const f of footings) {
    const list = f.straps ?? [];
    if (!list.length) continue;
    const a = nodes.get(f.nodeId);
    if (!a) { out.refused.push({ footingId: f.id, reason: 'noPartner' }); continue; }
    // The footing's centre from its column, in plan, from its offset along its own axes.
    const t = (f.rotationDeg * Math.PI) / 180, ct = Math.cos(t), st = Math.sin(t);
    const off: V2 = { x: f.eccentricityB * ct - f.eccentricityL * st, y: f.eccentricityB * st + f.eccentricityL * ct };
    const offLen = Math.hypot(off.x, off.y);
    const usable: Array<{ partner: Footing; node: number; u: V2; L: number }> = [];
    for (const s of list) {
      const g = footings.find((x) => x.id === s.toFootingId);
      const node = s.nodeId ?? g?.nodeId;
      const b = node !== undefined ? nodes.get(node) : undefined;
      const L = b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      if (!g || !b || !(L > 1e-6)) { out.refused.push({ footingId: f.id, reason: 'noPartner' }); continue; }
      usable.push({ partner: g, node: node!, u: { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, L });
    }
    if (!usable.length) continue;
    // The two that frame it: the one the offset points to most (any, with none), and the squarest to it.
    const first = offLen > 1e-6 ? usable.reduce((p, q) => (dot(q.u, off) > dot(p.u, off) ? q : p)) : usable[0]!;
    if (offLen > 1e-6 && dot(first.u, off) <= 1e-6) { out.refused.push({ footingId: f.id, reason: 'offsetNotTowardPartner' }); continue; }
    const second = usable.filter((q) => q !== first).reduce<typeof first | null>((p, q) => (Math.abs(cross(q.u, first.u)) > Math.abs(p ? cross(p.u, first.u) : 0.5) ? q : p), null);
    const pair = second ? [first, second] : [first];
    const basis = pair.map((p) => p.u);
    const along = decompose(off, basis);
    if (along.c.some((c, k) => c >= pair[k]!.L)) { out.refused.push({ footingId: f.id, reason: 'offsetNotTowardPartner' }); continue; }
    // What stays with the footing: the offset off the straps' line, in its own axes.
    replace(f.id, { eccentricityB: along.rest.x * ct + along.rest.y * st, eccentricityL: -along.rest.x * st + along.rest.y * ct });

    // One reaction (a combination or a case) through the straps: the footing's, and each partner's change.
    const through = <R extends CombinationReaction | CaseReaction>(c: R) => {
      const P = Math.abs(c.fz), sg = c.fz < 0 ? -1 : 1;
      // The moments as the shift they give the load: my along x, mx along y.
      const w = decompose({ x: c.my, y: c.mx }, basis);
      const force = pair.map((p, k) => (Math.abs(P * along.c[k]!) + Math.abs(w.c[k]!)) / (p.L - along.c[k]!));
      const relief = pair.map((p, k) => (P * along.c[k]! - Math.abs(w.c[k]!)) / (p.L - along.c[k]!));
      const moment = pair.map((_, k) => Math.abs(P * along.c[k]!) + Math.abs(w.c[k]!));
      return { own: { ...c, fz: sg * (P + force.reduce((s, x) => s + x, 0)), mx: w.rest.y, my: w.rest.x }, force, relief, moment, sg, P };
    };
    const r1 = reactions.get(f.nodeId);
    if (!r1) continue;
    const fact = r1.factored.map(through), cases = r1.cases?.map(through);
    out.reactions.set(f.nodeId, { factored: fact.map((x) => x.own), ...(cases ? { cases: cases.map((x) => x.own) } : {}) });
    pair.forEach((p, k) => {
      const r2 = out.reactions.get(p.node);
      if (!r2) return;
      out.reactions.set(p.node, {
        factored: r2.factored.map((c) => { const x = fact.find((q) => q.own.combinationId === c.combinationId); return x ? { ...c, fz: c.fz - x.sg * x.relief[k]! } : c; }),
        ...(r2.cases ? { cases: r2.cases.map((c) => { const x = cases?.find((q) => q.own.caseId === c.caseId); return x ? { ...c, fz: c.fz - x.sg * x.relief[k]! } : c; }) } : {}),
      });
    });
    const gov = fact.reduce((m, x) => (x.P > m.P ? x : m), fact[0]!);
    pair.forEach((p, k) => {
      // The strap's own demand is its worst combination, which need not be the footing's.
      const worst = fact.reduce((m, x) => (x.moment[k]! > m.moment[k]! ? x : m), fact[0]!);
      out.straps.push({
        footingId: f.id, partnerId: p.partner.id, partnerNodeId: p.node, L: p.L, e: along.c[k]!, bothWays: pair.length === 2,
        factor: gov && gov.P > 0 ? Math.abs(gov.own.fz) / gov.P : 1,
        M: worst?.moment[k] ?? 0, V: worst?.force[k] ?? 0, combinationName: worst?.own.combinationName ?? null,
        relief: gov?.relief[k] ?? 0,
      });
    });
  }
  return out;
}
