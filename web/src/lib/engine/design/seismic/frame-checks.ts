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
import { lineFromMembers, lineMembersOf, type LineMemberSource } from '../beam-line';
import type { LineStirrupPiece } from '../../detailing/line-bars';
import { drawnBeamReinforcement, type LongBarGroup, type ProvidedReinforcement, type RebarGroup, type RebarLayer, type StirrupDef } from '../../../design-contract/reinforcement';
import type { SeismicDesignSettings, SeismicRole } from '../../../model/seismic-design';
import { layersTotalArea, resolveBarGroups, resolveLayers, resolveColumnReinf } from '../../station-design-forces';
import type { Bar, Outline } from '../../codes/argentina/cirsoc201-section';
import {
  beamCapacityShear, columnCapacityShear, columnConfinement, nominalMomentAt, probableMoment,
  seismicJointShear, strongColumn, type BeamCapacityResult, type JointConfinementKind,
} from './capacity';

type P = { x: number; y: number; z?: number };
type CriticalEnd = NonNullable<LineMemberSource['criticalSections']>['start'] & { halfDepth?: number };

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
  criticalSections?: { start: CriticalEnd; end: CriticalEnd };
  drawnStirrups?: readonly LineStirrupPiece[];
  /** Columns: factored axial over the seismic combinations (compression positive), and the analysis shear. */
  axial?: { min: number; max: number }; vu?: number;
}

type SeismicShear = { ve: number; phiVn: number; utilization: number; vcZero: boolean };

export type MemberSeismic = {
  id: number; kind: 'beam' | 'column'; assumed?: boolean;
} & (
  | { role: 'primary'; ok: boolean; issues: string[]; shear: SeismicShear; beam?: BeamCapacityResult;
      confinement?: ReturnType<typeof columnConfinement>; refusal?: never }
  | { role: 'primary'; ok: false; issues: [string]; refusal: string; shear?: never; beam?: never; confinement?: never }
  | { role: 'secondary'; ok?: never; issues: []; refusal?: never; shear?: never; beam?: never; confinement?: never }
);

export type JointSeismic = {
  nodeId: number; direction: 'X' | 'Y'; columns: number[]; beams: number[];
} & (
  | { ok: boolean; strongColumn: ReturnType<typeof strongColumn> & { roof: boolean };
      shear: ReturnType<typeof seismicJointShear> & { confinement: JointConfinementKind }; refusal?: never }
  | { ok: false; refusal: string; strongColumn?: never; shear?: never }
);

export interface SeismicReport { members: MemberSeismic[]; joints: JointSeismic[] }

export function beamSteel(r: ProvidedReinforcement | undefined): { top: [number, number]; bottom: number; minDia: number } {
  const g = r?.regions;
  const faceLayers = (groups?: LongBarGroup[], layers?: RebarLayer[], bars?: RebarGroup) =>
    resolveBarGroups(groups, resolveLayers(layers, bars), true, true).flatMap(group => group.layers);
  const topI = faceLayers(g?.topStartGroups, g?.topStartLayers, g?.topStart ?? r?.top);
  const topJ = faceLayers(g?.topEndGroups, g?.topEndLayers, g?.topEnd ?? r?.top);
  const bottom = faceLayers(g?.bottomGroups, g?.bottomSpanLayers, g?.bottomSpan ?? r?.bottom);
  const diameters = [...topI, ...topJ, ...bottom].filter(bar => bar.count > 0).map(bar => bar.diameter);
  return { top: [layersTotalArea(topI), layersTotalArea(topJ)], bottom: layersTotalArea(bottom),
    minDia: diameters.length ? Math.min(...diameters) : 12 };
}

const beamDepths = (m: FrameMember, dia: number) => {
  const st = m.r?.regions?.stirrupsSupport?.diameter ?? m.r?.stirrups?.diameter ?? m.stirrupDia;
  return { d: m.h - m.cover - (st + dia / 2) / 1000, dPrime: m.cover + (st + dia / 2) / 1000 };
};

function supportFaces(m: FrameMember): [number, number] | undefined {
  const distance = (end: CriticalEnd | undefined, explicit: number | undefined) => {
    if (end?.source === 'column' || end?.source === 'wall') return end.halfDepth ?? end.tFace * m.L;
    return explicit ?? (end?.source === 'support' ? 0 : NaN);
  };
  const start = distance(m.criticalSections?.start, m.faceHalf?.[0]);
  const end = distance(m.criticalSections?.end, m.faceHalf?.[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start + end >= m.L) return;
  return [start, end];
}

function validHoops(hoops: StirrupDef | undefined): hoops is StirrupDef {
  return !!hoops && Number.isFinite(hoops.diameter) && hoops.diameter > 0 && Number.isFinite(hoops.spacing)
    && hoops.spacing > 0 && Number.isSafeInteger(hoops.legs) && hoops.legs > 0;
}

export function seismicFrameChecks(i: { nodes: ReadonlyMap<number, P>; members: readonly FrameMember[]; settings: SeismicDesignSettings }): SeismicReport {
  const { settings: s } = i;
  const memberResults = new Map<number, MemberSeismic>();
  const byId = new Map(i.members.map((m) => [m.id, m]));
  const z = (n: number) => i.nodes.get(n)?.z ?? 0;

  const identity = (m: FrameMember) => ({ id: m.id, kind: m.kind, ...(m.assumed ? { assumed: true } : {}) });
  const refuse = (m: FrameMember, refusal: string) => {
    memberResults.set(m.id, { ...identity(m), role: 'primary', ok: false, issues: [refusal], refusal });
  };
  const eligible = (m: FrameMember): m is FrameMember & { r: ProvidedReinforcement } => {
    if (m.role === 'secondary') {
      memberResults.set(m.id, { ...identity(m), role: 'secondary', issues: [] });
      return false;
    }
    if (!m.r) {
      refuse(m, 'seisDes.issue.missingReinforcement');
      return false;
    }
    if (![m.L, m.b, m.h, m.fc, m.fy].every(v => Number.isFinite(v) && v > 0)
      || !Number.isFinite(m.cover) || m.cover < 0 || 2 * m.cover >= Math.min(m.b, m.h)) {
      refuse(m, 'seisDes.issue.missingSection');
      return false;
    }
    return true;
  };

  // ── Beams ──
  const beamOut = new Map<number, { mprNeg: [number, number]; mprPos: [number, number]; mnNeg: [number, number]; mnPos: [number, number]; top: [number, number]; bottom: number }>();
  for (const m of i.members) {
    if (m.kind !== 'beam') continue;
    if (!eligible(m)) continue;
    const st = beamSteel(m.r);
    const hoopDef = m.r.regions?.stirrupsSupport ?? m.r.stirrups;
    if (![...st.top, st.bottom].every(a => Number.isFinite(a) && a > 0) || !validHoops(hoopDef)) {
      refuse(m, 'seisDes.issue.missingReinforcement');
      continue;
    }
    const faces = supportFaces(m);
    if (!faces) {
      refuse(m, 'seisDes.issue.missingSupportFaces');
      continue;
    }
    if (!m.vg || !Number.isFinite(m.vg[0]) || !Number.isFinite(m.vg[1])) {
      refuse(m, 'seisDes.issue.missingForces');
      continue;
    }
    const { d, dPrime } = beamDepths(m, st.minDia);
    if (!(d > 0 && dPrime > 0)) {
      refuse(m, 'seisDes.issue.missingSection');
      continue;
    }
    const drawing = m.r[drawnBeamReinforcement];
    const hoopZones = m.drawnStirrups ?? drawing?.stirrups.map(zone => ({
      ...zone, from: zone.from * drawing.memberLength, to: zone.to * drawing.memberLength,
    })) ?? lineFromMembers(lineMembersOf({ members: [m.id], forward: [true] },
      () => ({ L: m.L, criticalSections: m.criticalSections, reinforcement: m.r }), r => r)).stirrups;
    const matching = hoopZones.filter(z => Number.isFinite(z.from) && Number.isFinite(z.to) && z.from < z.to
      && Number.isFinite(z.spacing) && z.spacing > 0 && z.spacing <= hoopDef.spacing
      && Number.isFinite(z.diameter) && z.diameter > 0 && z.diameter === hoopDef.diameter
      && Number.isSafeInteger(z.legs) && z.legs > 0 && z.legs >= hoopDef.legs);
    const [faceI, faceJ] = faces;
    const clearLength = m.L - faceI - faceJ;
    const continuousLength = (zones: Pick<LineStirrupPiece, 'from' | 'to'>[], face: number) => {
      let end = face;
      for (const z of zones.sort((a, b) => a.from - b.from)) {
        if (z.from > end + 1e-9) break;
        end = Math.max(end, z.to);
      }
      return end - face;
    };
    const declaredLength = (m.r.regions?.regionT ?? 0.25) * m.L;
    const zone = Math.min(declaredLength, clearLength, continuousLength(matching, faceI),
      continuousLength(matching.map(z => ({ from: m.L - z.to, to: m.L - z.from })), faceJ));
    const ln = Math.max(0.1, clearLength);
    const slab = s.slabFlange ? m.slabTop ?? [0, 0] : [0, 0] as [number, number];
    const r = beamCapacityShear({
      b: m.b, h: m.h, d, dPrime, fc: m.fc, fy: m.fy, fyt: m.fy,
      ends: [{ top: st.top[0], bottom: st.bottom }, { top: st.top[1], bottom: st.bottom }], slabTop: slab,
      ln, vg: m.vg, hoops: { ...hoopDef, length: zone }, longMinDiaMm: st.minDia, overstrength: s.overstrength,
    });
    const mn = (t: number, c: number) => probableMoment(m.b, d, dPrime, m.fc, m.fy, 1, t, c);
    beamOut.set(m.id, {
      mprNeg: r.mprNeg, mprPos: r.mprPos, top: st.top, bottom: st.bottom,
      mnNeg: [mn(st.top[0] + slab[0], st.bottom), mn(st.top[1] + slab[1], st.bottom)], mnPos: [mn(st.bottom, st.top[0]), mn(st.bottom, st.top[1])],
    });
    const issues = [...(r.utilization > 1 + 1e-9 ? ['seisDes.issue.beamShear'] : []), ...(!r.hoops.spacingOk ? ['seisDes.issue.hoopSpacing'] : []), ...(!r.hoops.lengthOk ? ['seisDes.issue.hoopZone'] : [])];
    memberResults.set(m.id, { id: m.id, kind: 'beam', role: 'primary', ...(m.assumed ? { assumed: true } : {}), beam: r, shear: { ve: r.ve, phiVn: r.phiVn, utilization: r.utilization, vcZero: r.vcZero }, ok: issues.length === 0, issues });
  }

  // ── Joints: column tops where primary beams frame in ──
  const beamsAt = new Map<number, number[]>(), colsAt = new Map<number, number[]>();
  for (const m of i.members) for (const n of [m.nodeI, m.nodeJ]) {
    const map = m.kind === 'beam' ? beamsAt : colsAt;
    map.set(n, [...(map.get(n) ?? []), m.id]);
  }
  const columns = new Map<number, {
    m: FrameMember & { r: ProvidedReinforcement }; ties: StirrupDef;
    axial: NonNullable<FrameMember['axial']>; vu: number; least: number; most: number;
    col: ReturnType<typeof resolveColumnReinf>;
  }>();
  for (const m of i.members) {
    if (m.kind !== 'column' || !eligible(m)) continue;
    const { section, axial, vu } = m;
    const ties = m.r.stirrups;
    if (!section || !section.bars.length
      || !section.bars.every(b => Number.isFinite(b.area) && b.area > 0 && Number.isFinite(b.x) && Number.isFinite(b.y))) {
      refuse(m, 'seisDes.issue.missingSection');
      continue;
    }
    const col = resolveColumnReinf(m.r.column, m.r.longitudinal);
    if (!validHoops(ties) || (!col && !m.r.shaped)) {
      refuse(m, 'seisDes.issue.missingReinforcement');
      continue;
    }
    if (!axial || !Number.isFinite(axial.min) || !Number.isFinite(axial.max) || axial.min > axial.max
      || vu === undefined || !Number.isFinite(vu) || vu < 0) {
      refuse(m, 'seisDes.issue.missingForces');
      continue;
    }
    const moments = (fy: number) => [axial.min, axial.max].flatMap(p => [0, Math.PI / 2]
      .map(angle => nominalMomentAt(section.outline, section.bars, m.fc, fy, angle, p)));
    columns.set(m.id, { m, col, ties, axial, vu, least: Math.min(...moments(m.fy)), most: Math.max(...moments(s.overstrength * m.fy)) });
  }
  const joints: JointSeismic[] = [];
  const fromBeamsAt = new Map<string, number>();
  for (const [node, beams] of beamsAt) {
    const cols = (colsAt.get(node) ?? []).filter((c) => byId.get(c)!.role === 'primary');
    if (cols.length === 0) continue;
    const p = i.nodes.get(node)!;
    for (const dir of ['X', 'Y'] as const) {
      const along = beams.filter((b) => {
        const m = byId.get(b)!; if (m.role !== 'primary') return false;
        const o = i.nodes.get(m.nodeI === node ? m.nodeJ : m.nodeI)!;
        return dir === 'X' ? Math.abs(o.x - p.x) > Math.abs(o.y - p.y) : Math.abs(o.y - p.y) >= Math.abs(o.x - p.x);
      });
      if (along.length === 0) continue;
      if (along.some(b => !beamOut.has(b)) || cols.some(c => !columns.has(c))) {
        joints.push({ nodeId: node, direction: dir, columns: cols, beams: along, ok: false, refusal: 'seisDes.issue.incompleteJoint' });
        continue;
      }
      const endOf = (b: number) => (byId.get(b)!.nodeI === node ? 0 : 1);
      // One beam hogging (its negative, with slab) and the other sagging: the larger pairing.
      const neg = along.map((b) => beamOut.get(b)!.mnNeg[endOf(b)]), pos = along.map((b) => beamOut.get(b)!.mnPos[endOf(b)]);
      const sumBeams = along.length === 1 ? Math.max(neg[0]!, pos[0]!) : Math.max(neg[0]! + pos[1]!, pos[0]! + neg[1]!);
      // At the roof no column continues upward: a hinge in the column there forms no storey
      // mechanism, so the strong-column rule is not asked for.
      const roof = !cols.some((c) => Math.min(z(byId.get(c)!.nodeI), z(byId.get(c)!.nodeJ)) >= (p.z ?? 0) - 1e-6);
      const sc0 = strongColumn({ columns: cols.map((c) => columns.get(c)!.least), beams: [sumBeams], ratio: s.strongColumn });
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
  for (const { m, col, ties, axial, vu, most: mpr } of columns.values()) {
    const [lo, hi] = z(m.nodeI) <= z(m.nodeJ) ? [m.nodeI, m.nodeJ] : [m.nodeJ, m.nodeI];
    const beamH = Math.max(0, ...(beamsAt.get(hi) ?? []).map((b) => byId.get(b)!.h));
    const lu = Math.max(0.3, m.L - beamH);
    const zones = m.r.tieZones ?? { endLength: 0, endSpacing: ties.spacing };
    const fb: [number, number] | undefined = fromBeamsAt.has(`${m.id}:${hi}`) || fromBeamsAt.has(`${m.id}:${lo}`)
      ? [fromBeamsAt.get(`${m.id}:${hi}`) ?? mpr, fromBeamsAt.get(`${m.id}:${lo}`) ?? mpr] : undefined;
    const d = Math.max(m.b, m.h) - m.cover - (ties.diameter + 16) / 1000;
    const sh = columnCapacityShear({ b: Math.min(m.b, m.h), h: Math.max(m.b, m.h), d, fc: m.fc, fyt: m.fy, mpr: [mpr, mpr], ...(fb ? { fromBeams: fb } : {}), lu, vu, pu: axial.min, ties: { diameter: ties.diameter, legs: ties.legs, spacing: Math.min(ties.spacing, zones.endSpacing) } });
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
    memberResults.set(m.id, { id: m.id, kind: 'column', role: 'primary', ...(m.assumed ? { assumed: true } : {}), shear: { ve: sh.ve, phiVn: sh.phiVn, utilization: sh.utilization, vcZero: sh.vcZero }, confinement: conf, ok: issues.length === 0, issues });
  }
  const members = (['beam', 'column'] as const).flatMap(kind => i.members
    .filter(m => m.kind === kind)
    .map(m => memberResults.get(m.id)!));
  return { members, joints };
}
