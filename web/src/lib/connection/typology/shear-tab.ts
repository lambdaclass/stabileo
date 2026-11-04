/**
 * Shear tab: a plate welded to the column (or the girder) and bolted to the beam's web, one line
 * of bolts. The beam's shear goes through the bolts (J.3.6), bears on the plate and the web
 * (J.3.10), crosses the plate in shear (J.4.2) and block shear (J.4.3), and reaches the support
 * through two fillets (J.2.4).
 */
import { blockShear, boltLineBlock, shearStrength } from '../connecting-elements';
import { add, bearing, box, boltParts, boltStrength, holeOf, lateral, row, scale, stateOf, weldRows, Z, cross, norm } from './shared';
import type { JointMember, TypologyCheck, TypologyContext, TypologyDesign, TypologyParams } from './types';

export function designShearTab(ctx: TypologyContext, beam: JointMember, p: TypologyParams): TypologyDesign {
  const s = beam.section!, d = p.boltD, dh = holeOf(d), n = p.rows, t = p.plateT;
  const pitch = 3 * d, le = Math.max(1.5 * d, 35), h = (n - 1) * pitch + 2 * le, w = 2 * le + 10;
  const V = beam.V, b = boltStrength(d, p.boltGrade);
  const checks: TypologyCheck[] = [
    row('J.3.6', 'joint.typ.check.boltShear', V / n, b.shear, 'kN'),
    row('J.3.10', 'joint.typ.check.bearing', V / n, Math.min(bearing(d, t, 370), bearing(d, s.tw, s.Fu)), 'kN'),
  ];
  const sh = shearStrength({ Agv: h * t / 100, Anv: (h - n * dh) * t / 100, Fy: 240, Fu: 370 });
  checks.push(row(sh.governs, 'joint.typ.check.plateShear', V, sh.phiRn, 'kN'));
  const bs = blockShear({ ...boltLineBlock({ n, s: pitch / 10, le: le / 10, lt: le / 10, t: t / 10, dh: dh / 10 }), Fy: 240, Fu: 370 });
  checks.push(row('J.4.3', 'joint.typ.check.blockShear', V, bs.phiRn, 'kN'));
  // The support's flange (or web) is the other part the fillet joins.
  const support = ctx.members.find((m) => m.id !== beam.id && m.section)?.section;
  const tSup = support ? (support.d > support.bf * 1.5 ? support.tw : support.tf) : t;
  checks.push(...weldRows({ leg: p.weldLeg, length: h, runs: 2, thicker: Math.max(tSup, t), thinner: Math.min(tSup, t), demand: V, label: 'joint.typ.check.weld' }));
  if (h > s.d - 2 * s.tf - 2 * (s.r ?? 10)) checks.push(row('geom', 'joint.typ.check.fitsWeb', h, s.d - 2 * s.tf - 2 * (s.r ?? 10), 'mm'));
  // Parts: the plate in the web plane, next to the support face.
  const u = beam.dir, up = Math.abs(u.z) > 0.9 ? lateral(u) : Z, across = norm(cross(u, up));
  const face = 0.15, c = add(ctx.origin, scale(u, face + w / 2000));
  const parts = [box('plate', c, u, up, [w / 1000, h / 1000, t / 1000])];
  const bolts = Array.from({ length: n }, (_, k) => add(add(ctx.origin, scale(u, face + (w - le) / 1000)), scale(up, ((k - (n - 1) / 2) * pitch) / 1000)));
  parts.push(...boltParts(bolts, across, d, t + s.tw));
  parts.push(box('weld', add(ctx.origin, scale(u, face)), up, across, [h / 1000, (t + 2 * p.weldLeg) / 1000, p.weldLeg / 1000]));
  return { kind: 'shearTab', params: p, checks, parts, state: stateOf(checks), mainId: beam.id };
}
