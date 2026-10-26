/**
 * Bolted splice of two collinear members: a cover plate on each flange carries the flange force
 * Ff = M/(d − tf) + |N|/2 (bolts in shear J.3.6, bearing J.3.10, the plate in tension J.4.1 and
 * block shear J.4.3), and two web plates carry the shear (bolts in double shear).
 */
import { blockShear, boltLineBlock, tensionStrength } from '../connecting-elements';
import { add, bearing, box, boltParts, boltStrength, cross, holeOf, lateral, norm, row, scale, stateOf } from './shared';
import type { JointMember, Part, TypologyCheck, TypologyContext, TypologyDesign, TypologyParams } from './types';

export function designSplice(ctx: TypologyContext, m: JointMember, p: TypologyParams): TypologyDesign {
  const s = m.section!, d = p.boltD, dh = holeOf(d), t = p.plateT;
  const Ff = m.M / ((s.d - s.tf) / 1000) + Math.abs(m.N) / 2;
  const n = 2 * p.rows; // two lines of bolts per side of the cut
  const b = boltStrength(d, p.boltGrade), b2 = boltStrength(d, p.boltGrade, 2);
  const pitch = 3 * d, le = Math.max(1.5 * d, 35);
  const checks: TypologyCheck[] = [
    row('J.3.6', 'joint.typ.check.boltShear', Ff / n, b.shear, 'kN'),
    row('J.3.10', 'joint.typ.check.bearing', Ff / n, Math.min(bearing(d, t, 370), bearing(d, s.tf, s.Fu)), 'kN'),
  ];
  const ten = tensionStrength({ Ag: s.bf * t / 100, An: (s.bf - 2 * dh) * t / 100, Fy: 240, Fu: 370, boltedPlate: true });
  checks.push(row(ten.governs, 'joint.typ.check.plateTension', Ff, ten.phiRn, 'kN'));
  const blk = boltLineBlock({ n: p.rows, s: pitch / 10, le: le / 10, lt: le / 10, t: t / 10, dh: dh / 10 });
  checks.push(row('J.4.3', 'joint.typ.check.blockShear', Ff / 2, blockShear({ ...blk, Fy: 240, Fu: 370 }).phiRn, 'kN'));
  checks.push(row('J.3.6', 'joint.typ.check.webBolts', m.V / 2, b2.shear, 'kN'));
  const u = m.dir, up = Math.abs(u.z) > 0.9 ? lateral(u) : norm(cross(lateral(u), u)), across = norm(cross(up, u));
  const L = 2 * ((p.rows - 1) * pitch + 2 * le) + 10;
  const parts: Part[] = [];
  for (const sgn of [1, -1]) parts.push(box('plate', add(ctx.origin, scale(up, sgn * (s.d / 2 + t / 2) / 1000)), u, across, [L / 1000, s.bf / 1000, t / 1000]));
  for (const sgn of [1, -1]) parts.push(box('plate', add(ctx.origin, scale(across, sgn * (s.tw / 2 + t / 2) / 1000)), u, up, [L / 1000, (s.d - 2 * s.tf - 20) / 1000, t / 1000]));
  const xs = [-1, 1].flatMap((side) => Array.from({ length: p.rows }, (_, k) => side * (5 + le + k * pitch)));
  const centres = [1, -1].flatMap((sgn) => xs.flatMap((x) => [-1, 1].map((g) => add(add(add(ctx.origin, scale(u, x / 1000)), scale(up, sgn * s.d / 2000)), scale(across, g * (s.bf / 4) / 1000)))));
  parts.push(...boltParts(centres, up, d, t + s.tf));
  return { kind: 'splice', params: p, checks, parts, state: stateOf(checks), mainId: m.id };
}
