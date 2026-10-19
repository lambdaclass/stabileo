/**
 * Column base, pinned or fixed: a plate welded to the column and anchored to the concrete
 * (`base-plate.ts` for J.8, the plate, the anchors and the breakout). The column's axial, shear
 * and, for a fixed base, moment; the column welded all round.
 */
import { checkBasePlate } from '../base-plate';
import { add, box, row, stateOf, weldRows, v } from './shared';
import type { JointMember, Part, TypologyCheck, TypologyContext, TypologyDesign, TypologyParams } from './types';

export function designBase(ctx: TypologyContext, col: JointMember, p: TypologyParams, fixed: boolean): TypologyDesign {
  const s = col.section!, N = p.plateN ?? Math.ceil((s.d + 100) / 10) * 10, B = p.plateB ?? Math.ceil((s.bf + 100) / 10) * 10;
  const Pu = Math.max(0, -col.N), Tu = Math.max(0, col.N);
  const r = checkBasePlate({
    column: { d: s.d, bf: s.bf, tf: s.tf }, plate: { N, B, t: p.plateT, Fy: 240 }, concrete: { fc: ctx.concreteFc ?? 25 },
    anchors: { count: p.anchors ?? 4, diameter: p.anchorD ?? 20, Fu: 370, edge: 50 },
    Pu: Pu || 1e-6, ...(fixed ? { Mu: col.M } : {}), Vu: col.V,
  });
  const NAME: Record<string, string> = { 'J.8': 'bearing', placa: 'plate', 'J.9 tracción': 'anchorTension', 'J.9 corte': 'anchorShear', '201 §17.6.2': 'breakout' };
  const checks: TypologyCheck[] = r.checks.map((c) => row(c.key, `joint.typ.check.base.${NAME[c.key] ?? 'other'}`, c.demand, c.capacity, c.unit));
  if (Tu > 0) checks.push(row('J.9', 'joint.typ.check.base.uplift', Tu / (p.anchors ?? 4), 0.75 * 0.75 * 370 * Math.PI * (p.anchorD ?? 20) ** 2 / 4 / 1000, 'kN'));
  const perimeter = 2 * s.bf + 2 * (s.d - 2 * s.tf);
  checks.push(...weldRows({ leg: p.weldLeg, length: perimeter, runs: 1, thicker: p.plateT, thinner: s.tf, demand: Math.hypot(col.V, Tu + (fixed ? col.M / (s.d / 1000) : 0)), label: 'joint.typ.check.weld' }));
  const parts: Part[] = [box('plate', add(ctx.origin, v(0, 0, -p.plateT / 2000)), v(1, 0, 0), v(0, 1, 0), [N / 1000, B / 1000, p.plateT / 1000])];
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].slice(0, p.anchors ?? 4)) {
    parts.push(box('anchor', add(ctx.origin, v((x! * (N / 2 - 50)) / 1000, (y! * (B / 2 - 50)) / 1000, -0.15)), v(1, 0, 0), v(0, 1, 0), [(p.anchorD ?? 20) / 1000, (p.anchorD ?? 20) / 1000, 0.32]));
  }
  return { kind: fixed ? 'baseFixed' : 'basePinned', params: { ...p, plateN: N, plateB: B }, checks, parts, state: stateOf(checks), mainId: col.id, ...(ctx.concreteFc ? {} : { assumptions: ['joint.typ.assume.concrete'] }) };
}
