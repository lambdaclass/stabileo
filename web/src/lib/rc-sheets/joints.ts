import { seismicFrameChecks, type FrameMember } from '../engine/design/seismic/frame-checks';
import type { SeismicDesignSettings } from '../model/seismic-design';
import type { BarGroup } from './types';
import type { BeamRow } from './beam-row';
import { columnBars, type ColumnRow } from './column-row';
import type { Fmt } from './format';
import { check, ratioOf, type CheckLine } from './types';

interface JointContext { fc: (r: ColumnRow) => number; beamFc: (b: BeamRow) => number; fy: number; cover: number; beamCover: number; settings: SeismicDesignSettings }
type P = { id: number; x: number; y: number; z?: number };

const layers = (g: readonly BarGroup[]) => g.filter((x) => x.count > 0).map((x, row) => ({ count: x.count, diameter: x.dia, row }));

/** Strong column–weak beam (18.7.3.2) and joint shear (18.8.4) at the top joint of each column storey, through the frame checks the design runs. */
export function jointChecks(columns: ColumnRow[], beams: BeamRow[], nodes: ReadonlyMap<number, P>, fmt: Fmt, c: JointContext): ColumnRow[] {
  const members: FrameMember[] = [];
  const columnId = new Map<ColumnRow, number>();
  beams.forEach((b, i) => {
    const line = b.demand.line;
    if (!line) return;
    const at = (s: 'start' | 'span' | 'end') => b.adopted.at?.[s] ?? { top: b.adopted.top, bottom: b.adopted.bottom };
    const st = b.adopted.stirrups, stirrups = { diameter: st.dia, legs: st.legs, spacing: st.spacing };
    members.push({
      id: -(i + 1), kind: 'beam', role: 'primary', nodeI: line.startNode, nodeJ: line.endNode, L: b.length,
      b: b.b, h: b.h, cover: c.beamCover, fc: c.beamFc(b), fy: c.fy, stirrupDia: st.dia,
      r: { regions: { topStartLayers: layers(at('start').top), topEndLayers: layers(at('end').top), bottomSpanLayers: layers(at('span').bottom), stirrupsSupport: stirrups }, stirrups },
      ...(b.demand.faces ? { faceHalf: [b.demand.faces.start, b.demand.faces.end] as [number, number] } : {}),
    });
  });
  columns.forEach((r, i) => {
    const n = r.demand.nodes;
    if (!n) return;
    const fc = c.fc(r), a = r.adopted;
    const pus = r.demand.cases.map((k) => k.pu);
    columnId.set(r, i + 1);
    members.push({
      id: i + 1, kind: 'column', role: 'primary', nodeI: n.bottom, nodeJ: n.top, L: r.demand.length,
      b: r.b, h: r.h, cover: c.cover, fc, fy: c.fy, stirrupDia: a.tieDia,
      r: { column: { cornerDia: a.corner, faceDia: Math.max(a.dx, a.dy), nBottom: a.nx, nTop: a.nx, nLeft: a.ny, nRight: a.ny }, stirrups: { diameter: a.tieDia, legs: 2 + r.checks.crossties.x, spacing: a.tieSpacing } },
      section: { outline: { kind: 'rect', b: r.b, h: r.h }, bars: columnBars(r.demand, a, { mat: { fc, fy: c.fy }, cover: c.cover, tieDia: a.tieDia, diameters: [] }) },
      axial: { min: pus.length ? Math.min(...pus) : 0, max: pus.length ? Math.max(...pus) : 0 },
      vu: Math.max(0, ...r.demand.cases.map((k) => Math.max(k.vx ?? 0, k.vy ?? 0))),
    });
  });
  const { joints } = seismicFrameChecks({ nodes, members, settings: c.settings });
  return columns.map((r) => {
    const top = r.demand.nodes?.top, id = columnId.get(r);
    const mine = joints.filter((j) => j.nodeId === top && id !== undefined && j.columns.includes(id) && !j.strongColumn.roof);
    if (!mine.length) return r;
    const scwb = mine.reduce((w, j) => (j.strongColumn.utilization > w.strongColumn.utilization ? j : w));
    const shear = mine.reduce((w, j) => (j.shear.utilization > w.shear.utilization ? j : w));
    const extra: CheckLine[] = [
      check('rcSheets.v.seisScwb', scwb.strongColumn.ok, { clause: '§18.7.3.2', demand: `${fmt(c.settings.strongColumn)}·ΣMnb = ${fmt(scwb.strongColumn.required)} kN·m`, capacity: `ΣMnc = ${fmt(scwb.strongColumn.sumColumns)} kN·m`, ratio: scwb.strongColumn.utilization }),
      check('rcSheets.v.seisJoint', shear.shear.utilization <= 1 + 1e-6, { clause: '§18.8.4', demand: `Vj = ${fmt(shear.shear.vj)} kN`, capacity: `${fmt(shear.shear.phiVn)} kN`, ratio: ratioOf(shear.shear.vj, shear.shear.phiVn) }),
    ];
    const fail = extra.some((x) => !x.ok);
    return { ...r, verifications: [...r.verifications, ...extra], status: fail ? 'fail' : r.status, checks: { ...r.checks, ok: r.checks.ok && !fail } };
  });
}
