/**
 * The seismic checks of a concrete frame, member by member and joint by joint, from the bars the
 * members carry (`capacity.ts` for the clauses):
 *
 *   primary beam    capacity shear against its end hoops, and the hoop zone and spacing;
 *   primary column  capacity shear (its own probable moments, not more than the beams deliver),
 *                   confinement over lo;
 *   joint           at each column top where primary beams frame in, along X and along Y: the
 *                   strong-column ratio and the joint shear.
 *
 * Secondary members are listed and not checked: they follow the frame without resisting the
 * earthquake. A member is secondary only when the project declares it outside the lateral system
 * (`model/lateral-system.ts`); one whose role is not declared is checked as primary and says so
 * (`assumed`), whatever the geometry suggests. Pure: the store gathers the input.
 */
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';
import type { SeismicDesignSettings, SeismicRole } from '../../../model/seismic-design';
import { layersTotalArea, resolveLayers, resolveColumnReinf } from '../../station-design-forces';
import type { Bar, Outline } from '../../codes/argentina/cirsoc201-section';
import {
  beamCapacityShear, columnCapacityShear, columnConfinement, nominalMomentAt, probableMoment,
  seismicJointShear, strongColumn, type BeamCapacityResult, type JointConfinementKind,
} from './capacity';

type P = { x: number; y: number; z?: number };

export interface FrameMember {
  id: number; kind: 'beam' | 'column'; role: SeismicRole;
  /** The role was not declared: `primary` is the reading, not the project's statement. */
  assumed?: boolean;
  nodeI: number; nodeJ: number; L: number;
  b: number; h: number; cover: number; fc: number; fy: number; stirrupDia: number;
  r: ProvidedReinforcement | undefined;
  /** Columns: outline and bars about the centroid. */
  section?: { outline: Outline; bars: Bar[] };
  /** Beams: half the column depth at each end, m; gravity shear at each end, kN; slab bars in the flange, cm². */
  faceHalf?: [number, number]; vg?: [number, number]; slabTop?: [number, number];
  /** Columns: factored axial over the seismic combinations (compression positive), and the analysis shear. */
  axial?: { min: number; max: number }; vu?: number;
}

export interface MemberSeismic {
  id: number; kind: 'beam' | 'column'; role: SeismicRole;
  /** Checked as primary because no role was declared (`FrameMember.assumed`). */
  assumed?: boolean;
  shear?: { ve: number; phiVn: number; utilization: number; vcZero: boolean };
  beam?: BeamCapacityResult;
  confinement?: ReturnType<typeof columnConfinement>;
  ok: boolean;
  /** i18n keys of what fails. */
  issues: string[];
}

export interface JointSeismic {
  nodeId: number; direction: 'X' | 'Y'; columns: number[]; beams: number[];
  strongColumn: ReturnType<typeof strongColumn> & { roof: boolean };
  shear: ReturnType<typeof seismicJointShear> & { confinement: JointConfinementKind };
  ok: boolean;
}

export interface SeismicReport { members: MemberSeismic[]; joints: JointSeismic[] }

const groupArea = (g?: { count: number; diameter: number }) => (g ? layersTotalArea(resolveLayers(undefined, g)) : 0);

/** A beam's top steel at each end and bottom steel, cm², and its thinnest bar, mm. */
export function beamSteel(r: ProvidedReinforcement | undefined): { top: [number, number]; bottom: number; minDia: number } {
  const g = r?.regions;
  const topI = g ? layersTotalArea(resolveLayers(g.topStartLayers, g.topStart)) : groupArea(r?.top);
  const topJ = g ? layersTotalArea(resolveLayers(g.topEndLayers, g.topEnd)) : groupArea(r?.top);
  const bottom = g ? layersTotalArea(resolveLayers(g.bottomSpanLayers, g.bottomSpan)) : groupArea(r?.bottom);
  const dias = [g?.topStart, g?.topEnd, g?.bottomSpan, r?.top, r?.bottom, ...(g?.topStartLayers ?? []), ...(g?.bottomSpanLayers ?? [])]
    .filter((x): x is { count: number; diameter: number } => !!x && x.count > 0).map((x) => x.diameter);
  return { top: [topI || (g ? groupArea(r?.top) : 0), topJ || (g ? groupArea(r?.top) : 0)], bottom: bottom || groupArea(r?.bottom), minDia: dias.length ? Math.min(...dias) : 12 };
}

const beamDepths = (m: FrameMember, dia: number) => {
  const st = m.r?.regions?.stirrupsSupport?.diameter ?? m.r?.stirrups?.diameter ?? m.stirrupDia;
  return { d: m.h - m.cover - (st + dia / 2) / 1000, dPrime: m.cover + (st + dia / 2) / 1000 };
};

export function seismicFrameChecks(i: { nodes: ReadonlyMap<number, P>; members: readonly FrameMember[]; settings: SeismicDesignSettings }): SeismicReport {
  const { settings: s } = i;
  const members: MemberSeismic[] = [];
  const byId = new Map(i.members.map((m) => [m.id, m]));
  const z = (n: number) => i.nodes.get(n)?.z ?? 0;

  // ── Beams ──
  const beamOut = new Map<number, { mprNeg: [number, number]; mprPos: [number, number]; mnNeg: [number, number]; mnPos: [number, number]; top: [number, number]; bottom: number }>();
  for (const m of i.members) {
    if (m.kind !== 'beam') continue;
    if (m.role !== 'primary' || !m.r) { members.push({ id: m.id, kind: 'beam', role: m.role, ...(m.assumed ? { assumed: true } : {}), ok: true, issues: [] }); continue; }
    const st = beamSteel(m.r), { d, dPrime } = beamDepths(m, st.minDia);
    const hoopDef = m.r.regions?.stirrupsSupport ?? m.r.stirrups ?? { diameter: m.stirrupDia, legs: 2, spacing: 0.2 };
    const zone = (m.r.regions?.regionT ?? 0.25) * m.L;
    const ln = Math.max(0.1, m.L - (m.faceHalf?.[0] ?? 0) - (m.faceHalf?.[1] ?? 0));
    const slab = s.slabFlange ? m.slabTop ?? [0, 0] : [0, 0] as [number, number];
    const r = beamCapacityShear({
      b: m.b, h: m.h, d, dPrime, fc: m.fc, fy: m.fy, fyt: m.fy,
      ends: [{ top: st.top[0], bottom: st.bottom }, { top: st.top[1], bottom: st.bottom }], slabTop: slab,
      ln, vg: m.vg ?? [0, 0], hoops: { ...hoopDef, length: zone }, longMinDiaMm: st.minDia, overstrength: s.overstrength,
    });
    const mn = (t: number, c: number) => probableMoment(m.b, d, dPrime, m.fc, m.fy, 1, t, c);
    beamOut.set(m.id, {
      mprNeg: r.mprNeg, mprPos: r.mprPos, top: st.top, bottom: st.bottom,
      mnNeg: [mn(st.top[0] + slab[0], st.bottom), mn(st.top[1] + slab[1], st.bottom)], mnPos: [mn(st.bottom, st.top[0]), mn(st.bottom, st.top[1])],
    });
    const issues = [...(r.utilization > 1 + 1e-9 ? ['seisDes.issue.beamShear'] : []), ...(!r.hoops.spacingOk ? ['seisDes.issue.hoopSpacing'] : []), ...(!r.hoops.lengthOk ? ['seisDes.issue.hoopZone'] : [])];
    members.push({ id: m.id, kind: 'beam', role: 'primary', ...(m.assumed ? { assumed: true } : {}), beam: r, shear: { ve: r.ve, phiVn: r.phiVn, utilization: r.utilization, vcZero: r.vcZero }, ok: issues.length === 0, issues });
  }

  // ── Joints: column tops where primary beams frame in ──
  const beamsAt = new Map<number, number[]>(), colsAt = new Map<number, number[]>();
  for (const m of i.members) for (const n of [m.nodeI, m.nodeJ]) {
    const map = m.kind === 'beam' ? beamsAt : colsAt;
    map.set(n, [...(map.get(n) ?? []), m.id]);
  }
  const colMn = new Map<number, { least: number; most: number }>();
  const mnOf = (m: FrameMember, fy: number, P: number, pick: 'least' | 'most') => {
    if (!m.section) return 0;
    const a = nominalMomentAt(m.section.outline, m.section.bars, m.fc, fy, Math.PI / 2, P), b = nominalMomentAt(m.section.outline, m.section.bars, m.fc, fy, 0, P);
    return pick === 'least' ? Math.min(a, b) : Math.max(a, b);
  };
  for (const m of i.members) {
    if (m.kind !== 'column' || !m.section) continue;
    const ax = m.axial ?? { min: 0, max: 0 };
    colMn.set(m.id, { least: Math.min(mnOf(m, m.fy, ax.min, 'least'), mnOf(m, m.fy, ax.max, 'least')), most: Math.max(mnOf(m, s.overstrength * m.fy, ax.min, 'most'), mnOf(m, s.overstrength * m.fy, ax.max, 'most')) });
  }
  const joints: JointSeismic[] = [];
  const fromBeamsAt = new Map<string, number>();
  for (const [node, beams] of beamsAt) {
    const cols = (colsAt.get(node) ?? []).filter((c) => byId.get(c)!.role === 'primary');
    if (cols.length === 0) continue;
    const p = i.nodes.get(node)!;
    for (const dir of ['X', 'Y'] as const) {
      const along = beams.filter((b) => {
        const m = byId.get(b)!; if (m.role !== 'primary' || !beamOut.has(b)) return false;
        const o = i.nodes.get(m.nodeI === node ? m.nodeJ : m.nodeI)!;
        return dir === 'X' ? Math.abs(o.x - p.x) > Math.abs(o.y - p.y) : Math.abs(o.y - p.y) >= Math.abs(o.x - p.x);
      });
      if (along.length === 0) continue;
      const endOf = (b: number) => (byId.get(b)!.nodeI === node ? 0 : 1);
      // One beam hogging (its negative, with slab) and the other sagging: the larger pairing.
      const neg = along.map((b) => beamOut.get(b)!.mnNeg[endOf(b)]), pos = along.map((b) => beamOut.get(b)!.mnPos[endOf(b)]);
      const sumBeams = along.length === 1 ? Math.max(neg[0]!, pos[0]!) : Math.max(neg[0]! + pos[1]!, pos[0]! + neg[1]!);
      // At the roof no column continues upward: a hinge in the column there forms no storey
      // mechanism, so the strong-column rule is not asked for.
      const roof = !cols.some((c) => Math.min(z(byId.get(c)!.nodeI), z(byId.get(c)!.nodeJ)) >= (p.z ?? 0) - 1e-6);
      const sc0 = strongColumn({ columns: cols.map((c) => colMn.get(c)?.least ?? 0), beams: [sumBeams], ratio: s.strongColumn });
      const sc = roof ? { ...sc0, ok: true, roof: true } : { ...sc0, roof: false };
      const prNeg = along.map((b) => beamOut.get(b)!.mprNeg[endOf(b)]), prPos = along.map((b) => beamOut.get(b)!.mprPos[endOf(b)]);
      const sumPr = along.length === 1 ? Math.max(prNeg[0]!, prPos[0]!) : Math.max(prNeg[0]! + prPos[1]!, prPos[0]! + prNeg[1]!);
      for (const c of cols) fromBeamsAt.set(`${c}:${node}`, Math.max(fromBeamsAt.get(`${c}:${node}`) ?? 0, sumPr / cols.length));
      const top = along.map((b) => beamOut.get(b)!.top[endOf(b)]), bot = along.map((b) => beamOut.get(b)!.bottom);
      const pair = along.length === 1 ? { t: top[0]!, b: 0 } : top[0]! + bot[1]! >= top[1]! + bot[0]! ? { t: top[0]!, b: bot[1]! } : { t: top[1]!, b: bot[0]! };
      const heights = cols.map((c) => byId.get(c)!.L);
      const vcol = sumPr / (heights.reduce((a, h) => a + h, 0) / heights.length);
      const col = byId.get(cols.find((c) => Math.abs(Math.max(z(byId.get(c)!.nodeI), z(byId.get(c)!.nodeJ)) - (p.z ?? 0)) < 1e-6) ?? cols[0]!)!;
      const faces = beams.filter((b) => byId.get(b)!.role === 'primary').length;
      const opposite = along.length === 2;
      const confinement: JointConfinementKind = faces >= 4 ? 'fourFaces' : faces === 3 || opposite ? 'threeOrOpposite' : 'other';
      const sh = seismicJointShear({ fc: col.fc, fy: col.fy, overstrength: s.overstrength, topOneSide: pair.t, bottomOtherSide: pair.b, columnShear: vcol, aj: col.b * col.h, confinement });
      joints.push({ nodeId: node, direction: dir, columns: cols, beams: along, strongColumn: sc, shear: { ...sh, confinement }, ok: sc.ok && sh.utilization <= 1 + 1e-9 });
    }
  }

  // ── Columns ──
  for (const m of i.members) {
    if (m.kind !== 'column') continue;
    if (m.role !== 'primary' || !m.r || !m.section) { members.push({ id: m.id, kind: 'column', role: m.role, ...(m.assumed ? { assumed: true } : {}), ok: true, issues: [] }); continue; }
    const [lo, hi] = z(m.nodeI) <= z(m.nodeJ) ? [m.nodeI, m.nodeJ] : [m.nodeJ, m.nodeI];
    const beamH = Math.max(0, ...(beamsAt.get(hi) ?? []).map((b) => byId.get(b)!.h));
    const lu = Math.max(0.3, m.L - beamH);
    const ties = m.r.stirrups ?? { diameter: m.stirrupDia, legs: 2, spacing: 0.2 };
    const zones = m.r.tieZones ?? { endLength: 0, endSpacing: ties.spacing };
    const mpr = colMn.get(m.id)?.most ?? 0;
    const fb: [number, number] | undefined = fromBeamsAt.has(`${m.id}:${hi}`) || fromBeamsAt.has(`${m.id}:${lo}`)
      ? [fromBeamsAt.get(`${m.id}:${hi}`) ?? mpr, fromBeamsAt.get(`${m.id}:${lo}`) ?? mpr] : undefined;
    const d = Math.max(m.b, m.h) - m.cover - (ties.diameter + 16) / 1000;
    const sh = columnCapacityShear({ b: Math.min(m.b, m.h), h: Math.max(m.b, m.h), d, fc: m.fc, fyt: m.fy, mpr: [mpr, mpr], ...(fb ? { fromBeams: fb } : {}), lu, vu: m.vu ?? 0, pu: m.axial?.min ?? 0, ties: { diameter: ties.diameter, legs: ties.legs, spacing: Math.min(ties.spacing, zones.endSpacing) } });
    const col = resolveColumnReinf(m.r.column, m.r.longitudinal);
    const perFace = m.r.column ? Math.max(m.r.column.nBottom, m.r.column.nTop, m.r.column.nLeft, m.r.column.nRight) : 1;
    const hx = (Math.max(m.b, m.h) - 2 * m.cover) / (perFace + 1);
    const conf = columnConfinement({
      b: m.b, h: m.h, cover: m.cover, lu, fc: m.fc, fyt: m.fy, longMinDiaMm: Math.min(col?.cornerDia ?? 16, m.r.column?.faceDia ?? 99),
      tieDiaMm: ties.diameter, legsB: ties.legs, legsH: ties.legs, hx,
      provided: m.r.tieZones ? { length: zones.endLength, spacing: zones.endSpacing } : { length: lu / 2, spacing: ties.spacing },
    });
    const issues = [
      ...(sh.utilization > 1 + 1e-9 ? ['seisDes.issue.columnShear'] : []),
      ...(!conf.lengthOk ? ['seisDes.issue.confinedLength'] : []), ...(!conf.spacingOk ? ['seisDes.issue.confinedSpacing'] : []), ...(!conf.ashOk ? ['seisDes.issue.ash'] : []),
    ];
    members.push({ id: m.id, kind: 'column', role: 'primary', ...(m.assumed ? { assumed: true } : {}), shear: { ve: sh.ve, phiVn: sh.phiVn, utilization: sh.utilization, vcZero: sh.vcZero }, confinement: conf, ok: issues.length === 0, issues });
  }
  return { members, joints };
}
