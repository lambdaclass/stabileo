/**
 * Gusset of a brace: the brace bolted to a plate (one line along it) and the plate welded to the
 * frame. The brace's axial force goes through the bolts (J.3.6) and their bearing (J.3.10), spreads
 * over the Whitmore width lw = 2·L·tan 30° at the last bolt, where the plate is checked in tension
 * (J.4.1) or compression (J.4.4, kL/r ≤ 25 assumed for a short gusset), block shear (J.4.3), and
 * reaches the frame through two fillets (J.2.4).
 */
import { blockShear, boltLineBlock, tensionStrength } from '../connecting-elements';
import { add, bearing, box, boltParts, boltStrength, cross, holeOf, lateral, norm, row, scale, stateOf, weldRows } from './shared';
import type { JointMember, TypologyCheck, TypologyContext, TypologyDesign, TypologyParams } from './types';

export function designGusset(ctx: TypologyContext, brace: JointMember, p: TypologyParams): TypologyDesign {
  const d = p.boltD, dh = holeOf(d), t = p.plateT, n = p.rows, P = Math.abs(brace.N);
  const pitch = 3 * d, le = Math.max(1.5 * d, 35), L = (n - 1) * pitch;
  const lw = 2 * L * Math.tan(Math.PI / 6) + 2 * le;
  const b = boltStrength(d, p.boltGrade);
  const tw = brace.section?.tf ?? brace.section?.tw ?? t;
  const checks: TypologyCheck[] = [
    row('J.3.6', 'joint.typ.check.boltShear', P / n, b.shear, 'kN'),
    row('J.3.10', 'joint.typ.check.bearing', P / n, Math.min(bearing(d, t, 370), bearing(d, tw, brace.section?.Fu ?? 370)), 'kN'),
  ];
  const tens = tensionStrength({ Ag: lw * t / 100, An: (lw - dh) * t / 100, Fy: 240, Fu: 370, boltedPlate: true });
  checks.push(row(tens.governs, 'joint.typ.check.whitmore', P, tens.phiRn, 'kN'));
  checks.push(row('J.4.4', 'joint.typ.check.whitmoreCompression', P, 0.85 * 240 * lw * t / 1000, 'kN'));
  const blk = boltLineBlock({ n, s: pitch / 10, le: le / 10, lt: le / 10, t: t / 10, dh: dh / 10 });
  checks.push(row('J.4.3', 'joint.typ.check.blockShear', P, blockShear({ ...blk, Fy: 240, Fu: 370 }).phiRn, 'kN'));
  const edge = Math.max(lw, L + 2 * le);
  const frame = ctx.members.find((m) => m.id !== brace.id && m.section)?.section;
  const tf = frame?.tf ?? t;
  checks.push(...weldRows({ leg: p.weldLeg, length: edge, runs: 2, thicker: Math.max(tf, t), thinner: Math.min(tf, t), demand: P, label: 'joint.typ.check.weld' }));
  const u = brace.dir, side = lateral(u), inPlane = norm(cross(side, u));
  const c = add(ctx.origin, scale(u, (L + 2 * le) / 2000 + 0.05));
  const parts = [box('plate', c, u, inPlane, [(L + 2 * le + 100) / 1000, lw / 1000, t / 1000])];
  const centres = Array.from({ length: n }, (_, k) => add(ctx.origin, scale(u, (0.05 * 1000 + le + 50 + k * pitch) / 1000)));
  parts.push(...boltParts(centres, side, d, t + tw));
  return { kind: 'gusset', params: p, checks, parts, state: stateOf(checks), mainId: brace.id };
}
