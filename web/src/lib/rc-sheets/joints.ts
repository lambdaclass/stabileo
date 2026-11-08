import { nominalMomentAt, probableMoment, seismicJointShear, strongColumn, type JointConfinementKind } from '../engine/design/seismic/capacity';
import { faceLayout, groupsArea } from './bars';
import type { BeamRow } from './beam-row';
import { columnBars, type ColumnRow } from './column-row';
import type { Fmt } from './format';
import { OVERSTRENGTH } from './seismic';
import { check, ratioOf, type BarGroup, type CheckLine } from './types';

interface JointContext { fc: (r: ColumnRow) => number; fy: number; cover: number; beamCover: number }
type P = { x: number; y: number; z?: number };

/** Strong column–weak beam (18.7.3.2) and joint shear (18.8.4) at the top joint of each column storey that has a storey above. */
export function jointChecks(columns: ColumnRow[], beams: BeamRow[], nodes: ReadonlyMap<number, P>, fmt: Fmt, c: JointContext): ColumnRow[] {
  const byBottom = new Map(columns.filter((r) => r.demand.nodes).map((r) => [r.demand.nodes!.bottom, r]));
  return columns.map((r) => {
    const top = r.demand.nodes?.top;
    if (top === undefined) return r;
    const above = byBottom.get(top);
    const framing = beams.filter((b) => b.demand.line && (b.demand.line.startNode === top || b.demand.line.endNode === top));
    if (!above || !framing.length) return r;
    const fc = c.fc(r);
    const mnc = (row: ColumnRow) => {
      const bars = columnBars(row.demand, row.adopted, { mat: { fc, fy: c.fy }, cover: c.cover, tieDia: row.adopted.tieDia, diameters: [] });
      const outline = { kind: 'rect' as const, b: row.b, h: row.h };
      const pus = row.demand.cases.map((k) => k.pu);
      const loads = pus.length ? [Math.min(...pus), Math.max(...pus)] : [0];
      return Math.min(...[0, Math.PI / 2].flatMap((th) => loads.map((pu) => nominalMomentAt(outline, bars, fc, c.fy, th, pu))));
    };
    const beamEnd = (b: BeamRow) => {
      const end = b.demand.line!.startNode === top ? 'start' : 'end';
      const g: { top: BarGroup[]; bottom: BarGroup[] } = b.adopted.at?.[end] ?? { top: b.adopted.top, bottom: b.adopted.bottom };
      const sd = b.adopted.stirrups.dia;
      const dT = b.h - faceLayout(g.top, b.b, c.beamCover, sd).centroidFromFace, dB = b.h - faceLayout(g.bottom, b.b, c.beamCover, sd).centroidFromFace;
      const other = nodes.get(end === 'start' ? b.demand.line!.endNode : b.demand.line!.startNode), at = nodes.get(top);
      const dir = other && at && Math.abs(other.x - at.x) >= Math.abs(other.y - at.y) ? 'x' : 'y';
      return {
        dir, top: groupsArea(g.top), bottom: groupsArea(g.bottom),
        mnNeg: probableMoment(b.b, dT, b.h - dB, fc, c.fy, 1, groupsArea(g.top), groupsArea(g.bottom)),
        mnPos: probableMoment(b.b, dB, b.h - dT, fc, c.fy, 1, groupsArea(g.bottom), groupsArea(g.top)),
      };
    };
    const ends = framing.map(beamEnd);
    const sumC = mnc(r) + mnc(above);
    const kind: JointConfinementKind = ends.length >= 4 ? 'fourFaces' : ends.length === 3 || (ends.filter((e) => e.dir === 'x').length === 2 || ends.filter((e) => e.dir === 'y').length === 2) ? 'threeOrOpposite' : 'other';
    const vcol = Math.max(0, ...r.demand.cases.map((k) => Math.max(k.vx ?? 0, k.vy ?? 0)));
    const extra: CheckLine[] = [];
    let worstScwb = 0, worstJoint = 0, sumB = 0, vj = 0, phiVj = 0;
    for (const dir of ['x', 'y'] as const) {
      const e = ends.filter((x) => x.dir === dir);
      if (!e.length) continue;
      const sb = e.length >= 2 ? Math.max(e[0]!.mnNeg + e[1]!.mnPos, e[0]!.mnPos + e[1]!.mnNeg) : Math.max(e[0]!.mnNeg, e[0]!.mnPos);
      const sc = strongColumn({ columns: [sumC], beams: [sb], ratio: 1.2 });
      if (sc.utilization > worstScwb) { worstScwb = sc.utilization; sumB = sb; }
      const js = seismicJointShear({ fc, fy: c.fy, overstrength: OVERSTRENGTH, topOneSide: e[0]!.top, bottomOtherSide: e[1]?.bottom ?? 0, columnShear: vcol, aj: r.b * r.h, confinement: kind });
      if (js.utilization > worstJoint) { worstJoint = js.utilization; vj = js.vj; phiVj = js.phiVn; }
    }
    extra.push(
      check('rcSheets.v.seisScwb', worstScwb <= 1 + 1e-6, { clause: '§18.7.3.2', demand: `1.2·ΣMnb = ${fmt(1.2 * sumB)} kN·m`, capacity: `ΣMnc = ${fmt(sumC)} kN·m`, ratio: worstScwb }),
      check('rcSheets.v.seisJoint', worstJoint <= 1 + 1e-6, { clause: '§18.8.4', demand: `Vj = ${fmt(vj)} kN`, capacity: `${fmt(phiVj)} kN`, ratio: ratioOf(vj, phiVj) }),
    );
    const verifications = [...r.verifications, ...extra];
    const fail = extra.some((x) => !x.ok);
    return { ...r, verifications, status: fail ? 'fail' : r.status, checks: { ...r.checks, ok: r.checks.ok && !fail } };
  });
}
