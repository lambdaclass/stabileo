/**
 * End plate (and the knee of a portal, and the apex between two rafters): a plate welded to the
 * beam's end and bolted to the column flange (or to the other rafter's plate). The moment becomes
 * a flange force Ff = M/(d − tf) that the bolts at the tension flange carry, with prying on the
 * plate; every bolt shares the shear, combined with tension by J.3.7; the flanges and the web are
 * welded to the plate. At a column the flange forces load it (J.10.1, J.10.2, J.10.6), and a pair
 * of stiffeners resolves the first two.
 */
import { columnAtMomentJoint } from '../column-web';
import { pryingCapacity } from '../prying';
import { add, box, boltParts, boltStrength, cross, holeOf, lateral, norm, row, scale, stateOf, weldRows } from './shared';
import type { JointMember, Part, TypologyCheck, TypologyContext, TypologyDesign, TypologyParams } from './types';

export function designEndPlate(ctx: TypologyContext, beam: JointMember, column: JointMember | null, p: TypologyParams, kind: 'endPlate' | 'knee' | 'apex'): TypologyDesign {
  const s = beam.section!, d = p.boltD, t = p.plateT;
  const g = Math.max(s.tw + 2 * (1.5 * d + 10), 90), bp = Math.max(s.bf + 20, g + 2 * 1.5 * d), ext = 2.5 * d;
  const hp = s.d + 2 * ext;
  const b = boltStrength(d, p.boltGrade);
  // Tension rows at the tension flange: one outside and (p.rows − 1) inside, two bolts each.
  // Rows: one outside and (rows − 1) inside the tension flange, one inside and one outside the other.
  const nt = 2 * p.rows, ntot = 2 * (p.rows + 2);
  const Ff = beam.M / ((s.d - s.tf) / 1000) + Math.max(0, beam.N) / 2;
  const T = Ff / nt, Vb = beam.V / ntot;
  // J.3.7: Fnt' = 1,3·Fnt − Fnt/(φ·Fnv)·frv ≤ Fnt.
  const frv = Vb * 10 / b.Ab;
  const FntP = Math.min(b.Fnt, 1.3 * b.Fnt - (b.Fnt / (0.75 * b.Fnv)) * frv);
  const Bt = 0.75 * FntP * b.Ab / 10;
  const pr = pryingCapacity({ B: Bt, t, p: bp / 2, b: g / 2 - s.tw / 2, a: (bp - g) / 2, db: d, dh: holeOf(d), Fu: 370 });
  const checks: TypologyCheck[] = [
    row('J.3.6', 'joint.typ.check.boltShear', Vb, b.shear, 'kN'),
    row('J.3.7', 'joint.typ.check.boltTensionShear', T, Bt, 'kN'),
    row('palanca', 'joint.typ.check.prying', T, pr.perBolt, 'kN'),
  ];
  checks.push(...weldRows({ leg: p.weldLeg, length: s.bf, runs: 2, thicker: t, thinner: s.tf, demand: Ff, label: 'joint.typ.check.flangeWeld' }));
  checks.push(...weldRows({ leg: p.weldLeg, length: s.d - 2 * s.tf, runs: 2, thicker: t, thinner: s.tw, demand: beam.V, label: 'joint.typ.check.webWeld' }));
  if (column?.section && kind !== 'apex') {
    const c = column.section;
    const col = columnAtMomentJoint({
      column: { d: c.d / 10, tw: c.tw / 10, tf: c.tf / 10, k: (c.tf + (c.r ?? 10)) / 10, Fy: c.Fy, A: c.A / 100 }, beam: { d: s.d / 10, tf: s.tf / 10 },
      momentsKNm: [beam.M], columnShearKN: column.V, columnAxialKN: column.N,
    });
    for (const k of col) {
      // Stiffeners carry the flange force where the flange or the web alone cannot.
      if (p.stiffeners && k.key !== 'J.10.6') continue;
      checks.push(row(k.key, `joint.typ.check.${k.key === 'J.10.1' ? 'flangeBending' : k.key === 'J.10.2' ? 'webYielding' : 'panelZone'}`, k.demandKN, k.phiRnKN, 'kN'));
    }
  }
  // Parts: the plate across the beam at the support face, bolts, stiffeners in the column.
  const u = beam.dir, up = Math.abs(u.z) > 0.9 ? lateral(u) : norm(cross(lateral(u), u)), across = norm(cross(up, u));
  const face = kind === 'apex' ? t / 2000 : (column?.section ? column.section.d / 2000 : 0.15);
  const pc = add(ctx.origin, scale(u, face));
  const parts: Part[] = [box('plate', pc, across, up, [bp / 1000, hp / 1000, t / 1000])];
  if (kind === 'apex') parts.push(box('plate', add(ctx.origin, scale(u, -t / 2000)), across, up, [bp / 1000, hp / 1000, t / 1000]));
  const rowsZ = [s.d / 2 + ext / 2, ...Array.from({ length: p.rows - 1 }, (_, k) => s.d / 2 - s.tf - 1.5 * d - k * 3 * d), -(s.d / 2 - s.tf - 1.5 * d), -(s.d / 2 + ext / 2)];
  const centres = rowsZ.flatMap((z) => [-g / 2, g / 2].map((x) => add(add(pc, scale(across, x / 1000)), scale(up, z / 1000))));
  parts.push(...boltParts(centres, u, d, t + (column?.section?.tf ?? t)));
  if (p.stiffeners && column?.section) {
    const c = column.section;
    for (const z of [s.d / 2 - s.tf / 2, -(s.d / 2 - s.tf / 2)]) parts.push(box('stiffener', add(ctx.origin, scale(up, z / 1000)), across, u, [(c.bf - c.tw) / 1000, (c.d - 2 * c.tf) / 1000, s.tf / 1000]));
  }
  return { kind, params: p, checks, parts, state: stateOf(checks), mainId: beam.id };
}
