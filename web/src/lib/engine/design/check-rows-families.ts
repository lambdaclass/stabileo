/**
 * The check rows of the families that keep their own result shapes: slabs, walls, footings, the
 * shear of beam-column joints, and the capacity checks of a seismic frame. Same contract as the
 * member rows (`check-rows.ts`): each row names its clause, the inequality that must hold, the
 * values that went into it and the combination that governs. Translation only: nothing is
 * recomputed here.
 *
 * Titles are i18n keys (`titleKey`) with an English `title` beside them for the surfaces that do
 * not translate.
 */
import { statusOfRatio, type CheckInput, type CheckRow, type DesignStatus } from '../../design-contract';
import type { ClauseRef } from '../../codes/regulation';
import type { SlabDesignResult } from '../detailing/slab-design';
import type { WallDesignResult } from '../detailing/wall-design';
import type { FootingDesignOutcome } from '../detailing/run-footing-design';
import type { JointResult } from './joint-check';
import type { MemberSeismic, JointSeismic } from './seismic/frame-checks';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const cm2 = (m2: number) => Math.round(m2 * 1e4 * 100) / 100;
const firstClause = (refs: readonly ClauseRef[] | undefined, fallback: string) => refs?.find((r) => r.clause)?.clause ?? fallback;
const okStatus = (s: 'OK' | 'FAIL' | 'UNSUPPORTED', u: number): DesignStatus =>
  s === 'UNSUPPORTED' ? 'unsupported' : s === 'FAIL' ? 'fail' : statusOfRatio(u);
const inp = (symbol: string, value: number, unit?: string, description?: string): CheckInput => ({
  symbol, value: Number.isFinite(value) ? r3(value) : String(value), ...(unit ? { unit } : {}), ...(description ? { description } : {}),
});

function row(p: {
  key: string; title: string; clause: string; formula: string; inputs: CheckInput[];
  demand?: number; capacity?: number; unit?: string; ratio: number | null; status: DesignStatus;
  combination?: string | null; location?: string; derivation?: readonly string[]; edition?: string;
}): CheckRow {
  return {
    code: 'cirsoc-201', edition: p.edition ?? '2025', clause: p.clause, title: p.title, titleKey: p.key, formula: p.formula, inputs: p.inputs,
    ...(p.demand !== undefined ? { demand: r3(p.demand) } : {}), ...(p.capacity !== undefined ? { capacity: r3(p.capacity) } : {}),
    ...(p.unit ? { unit: p.unit } : {}), ratio: p.ratio === null ? null : Number.isFinite(p.ratio) ? r3(p.ratio) : p.ratio,
    status: p.status, ...(p.combination ? { combination: p.combination } : {}), ...(p.location ? { location: p.location } : {}),
    ...(p.derivation?.length ? { derivation: [...p.derivation] } : {}),
  };
}

/** A slab panel: flexure per layer, the minimum, one-way shear and the strips of a panel. */
export function slabCheckRows(s: SlabDesignResult, edition = '2025'): CheckRow[] {
  const out: CheckRow[] = [];
  for (const l of s.layers) {
    const u = l.asProvided > 0 ? l.asRequired / l.asProvided : Number.POSITIVE_INFINITY;
    out.push(row({
      key: 'check.slab.flexure', title: `Flexure, ${l.face} ${l.direction}`, clause: firstClause(l.refs, '22.3'), edition,
      formula: 'As,req ≤ As,prov',
      inputs: [inp('As,req', cm2(l.asRequired), 'cm²/m'), inp('As,prov', cm2(l.asProvided), 'cm²/m'), inp('Ø', l.diameterMm, 'mm'), inp('s', l.spacing * 100, 'cm')],
      demand: cm2(l.asRequired), capacity: cm2(l.asProvided), unit: 'cm²/m', ratio: u, status: statusOfRatio(u),
      location: `${l.face} ${l.direction}`, derivation: l.minimumGoverns ? ['As,mín (7.6.1.1) governs'] : [],
    }));
  }
  const sh = s.shear;
  out.push(row({
    key: 'check.slab.shear', title: 'One-way shear', clause: firstClause(sh.refs, '22.5.5.1'), edition, formula: 'Vu ≤ φ·Vc',
    inputs: [inp('Vu', sh.vu, 'kN'), inp('φVc', sh.phiVc, 'kN')], demand: sh.vu, capacity: sh.phiVc, unit: 'kN',
    ratio: sh.utilization, status: sh.ok ? statusOfRatio(sh.utilization) : 'fail', derivation: [sh.memo],
  }));
  for (const st of s.panel?.check.strips ?? []) {
    out.push(row({
      key: 'check.slab.strip', title: `Strip ${st.kind}, ${st.face} ${st.dir}`, clause: '8.4.1', edition, formula: 'As,req ≤ As,prov',
      inputs: [inp('As,req', st.need * 1e4, 'cm²/m'), inp('As,prov', st.given * 1e4, 'cm²/m')],
      ratio: st.utilization, status: statusOfRatio(st.utilization), location: `${st.dir} ${st.lo.toFixed(2)}–${st.hi.toFixed(2)} m`,
    }));
  }
  // §8.7.2.2: the spacing of each base mat and band, against min(2h, 300 mm) (`panelMaxSpacing`).
  for (const c of s.panel?.check.spacing ?? []) {
    out.push(row({
      key: 'check.slab.spacing', title: `Bar spacing, ${c.source === 'base' ? 'base' : `band ${c.id}`}, ${c.face} ${c.dir}`, clause: '8.7.2.2', edition, formula: 's ≤ s,máx = mín(2h; 300 mm)',
      inputs: [inp('s', c.spacing * 100, 'cm'), inp('s,máx', c.limit * 100, 'cm')],
      demand: c.spacing * 100, capacity: c.limit * 100, unit: 'cm', ratio: c.ratio, status: c.ok ? 'ok' : 'fail',
      location: `${c.face} ${c.dir}`,
    }));
  }
  return out;
}

/** A wall: in-plane shear and its ceiling, axial load and flexure, thickness, and the checks out of its plane. */
export function wallCheckRows(w: WallDesignResult, edition = '2025'): CheckRow[] {
  const out: CheckRow[] = [
    row({
      key: 'check.wall.shear', title: 'In-plane shear', clause: firstClause(w.shear.refs, '11.5.4'), edition, formula: 'Vu ≤ φ·Vn ≤ φ·0,83·√f\'c·Acv',
      inputs: [inp('Vu', w.shear.vu, 'kN'), inp('φVn', w.shear.phiVn, 'kN'), inp('Acv', w.shear.acv, 'm²'), inp('Vn,máx', w.shear.vnLimit, 'kN')],
      demand: w.shear.vu, capacity: w.shear.phiVn, unit: 'kN', ratio: w.shear.utilization, status: w.shear.ok ? statusOfRatio(w.shear.utilization) : 'fail',
      derivation: [w.shear.memo],
    }),
    row({
      key: 'check.wall.axialFlexure', title: 'Axial load and flexure', clause: firstClause(w.axialFlexure.refs, '11.5.2'), edition, formula: 'Mu ≤ φ·Mn(Pu)',
      inputs: [inp('Pu', w.axialFlexure.pu, 'kN'), inp('Mu', w.axialFlexure.mu, 'kN·m'), inp('φMn', w.axialFlexure.phiMn ?? w.axialFlexure.mn, 'kN·m'), inp('Pn0', w.axialFlexure.pn0, 'kN')],
      demand: w.axialFlexure.mu, capacity: w.axialFlexure.phiMn ?? w.axialFlexure.mn, unit: 'kN·m',
      ratio: w.axialFlexure.utilization, status: w.axialFlexure.ok ? statusOfRatio(w.axialFlexure.utilization) : 'fail', derivation: [w.axialFlexure.memo],
    }),
    row({
      key: 'check.wall.thickness', title: 'Minimum thickness', clause: '11.3.1.1', edition, formula: 'h ≥ h,mín',
      inputs: [inp('h,mín', w.minThickness * 100, 'cm')], ratio: null, status: w.thicknessOk ? 'ok' : 'fail',
    }),
  ];
  // Each member check names its own clause at the end of its description (11.6.1 or 11.6.2 for the
  // minimum ratios, 11.7.2 for the spacing); the rest are the member checks of 11.8.
  for (const c of w.checks) {
    out.push(row({
      key: 'check.wall.member', title: c.category, clause: /\((11\.[\d.]*\d)\)$/.exec(c.description)?.[1] ?? '11.8', edition, formula: 'η = demand / capacity ≤ 1',
      inputs: [], ratio: c.utilization, status: c.ok ? statusOfRatio(c.utilization) : 'fail', derivation: [c.description],
    }));
  }
  return out;
}

/** A footing: bearing, one-way shear, punching and the flexural steel of each direction. */
export function footingCheckRows(o: FootingDesignOutcome, edition = '2025'): CheckRow[] {
  const c = o.check;
  if (!c) return [];
  const combo = o.governingCombination;
  const b = c.bearing;
  const out: CheckRow[] = [row({
    key: 'check.footing.bearing', title: 'Soil bearing', clause: firstClause(b.refs, '13.3.1.1'), edition, formula: 'q,máx ≤ q,adm',
    inputs: [inp('q,máx', b.qMax, 'kPa'), inp('q,mín', b.qMin, 'kPa'), inp('eB', b.eB, 'm'), inp('eL', b.eL, 'm')],
    ratio: b.utilization, status: okStatus(b.status, b.utilization), combination: combo, derivation: b.memo,
  })];
  if (c.oneWayShear) {
    const s = c.oneWayShear;
    out.push(row({
      key: 'check.footing.shear', title: 'One-way shear', clause: firstClause(s.refs, '22.5.5.1'), edition, formula: 'Vu ≤ φ·Vc',
      inputs: [inp('Vu', s.Vu, 'kN'), inp('φVc', s.phiVc, 'kN'), inp('ℓ', s.cantilever, 'm')], demand: s.Vu, capacity: s.phiVc, unit: 'kN',
      ratio: s.utilization, status: okStatus(s.status, s.utilization), combination: combo, derivation: s.memo,
    }));
  }
  if (c.punching) {
    const p = c.punching;
    out.push(row({
      key: 'check.footing.punching', title: 'Punching shear', clause: firstClause(p.refs, '22.6.5.2'), edition, formula: 'vu ≤ φ·vc',
      inputs: [inp('vu', p.vu, 'MPa'), inp('φvc', p.phiVc, 'MPa')], demand: p.vu, capacity: p.phiVc, unit: 'MPa',
      ratio: p.utilization, status: okStatus(p.status, p.utilization), combination: combo, derivation: p.memo,
    }));
  }
  for (const [axis, d] of [['x', o.mat?.x], ['y', o.mat?.y]] as const) {
    if (!d) continue;
    const prov = d.asProvided, req = d.asGoverning, u = prov > 0 ? req / prov : Number.POSITIVE_INFINITY;
    out.push(row({
      key: 'check.footing.flexure', title: `Flexure, ${axis}`, clause: d.governingClause || '13.3.3', edition, formula: 'As,req ≤ As,prov',
      inputs: [inp('Mu', d.Mu, 'kN·m'), inp('d', d.d * 100, 'cm'), inp('As,req', cm2(req), 'cm²'), inp('As,prov', cm2(prov), 'cm²'), inp('Ø', d.diameterMm, 'mm'), inp('n', d.barCount)],
      demand: cm2(req), capacity: cm2(prov), unit: 'cm²', ratio: u, status: statusOfRatio(u), combination: combo, location: axis,
    }));
  }
  return out;
}

/** The shear of a beam-column joint, by direction. */
export function jointShearCheckRows(j: JointResult, edition = '2025'): CheckRow[] {
  const c = j.check;
  return [row({
    key: 'check.joint.shear', title: `Joint shear, ${j.direction}`, clause: firstClause(c.refs, '15.4.2'), edition, formula: 'Vu ≤ φ·Vn',
    inputs: [inp('Vu', c.Vu, 'kN'), inp('φVn', c.phiVn, 'kN')], demand: c.Vu, capacity: c.phiVn, unit: 'kN',
    ratio: c.utilization, status: okStatus(c.status, c.utilization), combination: j.combo, location: j.direction,
  })];
}

/*
 * The seismic frame checks follow ACI 318-19 chapter 18 (capacity shear, hoops, confinement, strong
 * column, joint shear). CIRSOC 201-2025 §18.1 sends the seismic design of concrete to INPRES-CIRSOC 103
 * Parte II 2026 (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-18-…md:10-16), which the
 * repository does not hold; the 2005 edition it holds is not the one §18.1 names, and the project has no
 * setting that adopts it. So each of these rows is a substitute: not verified, with no ratio. Its numbers
 * stay as inputs and its result as a line of the derivation, to guide the detailing.
 */
const SEISMIC_SUBSTITUTE = 'substitute: ACI 318-19 chapter 18; CIRSOC 201-2025 §18.1 requires INPRES-CIRSOC 103 Parte II 2026, not in the repository: not verified';
const substitute = (p: { key: string; title: string; aci: string; formula: string; inputs: CheckInput[]; result: string; location?: string; extra?: readonly string[] }): CheckRow =>
  row({ key: p.key, title: p.title, clause: '18.1', formula: p.formula, inputs: p.inputs, ratio: null, status: 'notVerified',
    ...(p.location ? { location: p.location } : {}), derivation: [SEISMIC_SUBSTITUTE, `ACI 318-19 ${p.aci}: ${p.result}`, ...(p.extra ?? [])] });
const u3 = (u: number) => (Number.isFinite(u) ? u.toFixed(3) : '∞');

/** The capacity checks of a member of a seismic frame: capacity shear and detailing, as substitutes. */
export function seismicMemberCheckRows(m: MemberSeismic): CheckRow[] {
  const out: CheckRow[] = [];
  const beam = m.kind === 'beam';
  if (m.shear) {
    out.push(substitute({
      key: 'check.seismic.shear', title: 'Capacity shear', aci: beam ? '§18.6.5' : '§18.7.6', formula: 'Ve ≤ φ·Vn',
      inputs: [inp('Ve', m.shear.ve, 'kN'), inp('φVn', m.shear.phiVn, 'kN')],
      result: `Ve/φVn = ${u3(m.shear.utilization)}${m.shear.vcZero ? `, Vc = 0 (${beam ? '§18.6.5.2' : '§18.7.6.2'})` : ''}`,
    }));
  }
  if (m.role === 'primary' && (m.shear || m.issues.length)) {
    out.push(substitute({
      key: 'check.seismic.detailing', title: 'Seismic detailing', aci: beam ? '§18.6.4' : '§18.7.5', formula: beam ? 'hoops over 2h at s ≤ min(d/4; 6·db; 150 mm)' : 'lo, so and Ash',
      inputs: [], result: m.issues.length ? `${m.issues.length} rule(s) not met, listed below` : 'every rule met', extra: m.issues,
    }));
  }
  return out;
}

/** A joint of a seismic frame: strong column and joint shear, as substitutes. */
export function seismicJointCheckRows(j: JointSeismic): CheckRow[] {
  const sc = j.strongColumn, sh = j.shear;
  return [
    substitute({
      key: 'check.seismic.strongColumn', title: `Strong column, ${j.direction}`, aci: '§18.7.3.2', formula: 'ΣMnc ≥ 1,2·ΣMnb', location: j.direction,
      inputs: [inp('ΣMnc', sc.sumColumns, 'kN·m'), inp('ΣMnb', sc.sumBeams, 'kN·m'), inp('1,2·ΣMnb', sc.required, 'kN·m')],
      result: sc.roof ? 'roof level, not required (§18.7.3.1)' : `1,2·ΣMnb/ΣMnc = ${u3(sc.utilization)}`,
    }),
    substitute({
      key: 'check.seismic.jointShear', title: `Joint shear, ${j.direction}`, aci: '§18.8.4', formula: 'Vj ≤ φ·Vn', location: j.direction,
      inputs: [inp('T', sh.T, 'kN'), inp('Vj', sh.vj, 'kN'), inp('φVn', sh.phiVn, 'kN')],
      result: `Vj/φVn = ${u3(sh.utilization)}`,
    }),
  ];
}


