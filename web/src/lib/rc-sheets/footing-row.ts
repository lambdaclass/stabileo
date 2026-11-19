import type { Fmt } from './format';
import { analyseFooting, CIRSOC_ONE_WAY, foundingOf, MIN_D, pedestalOf, proposeFooting, spacingClause, type FootingAnalysis, type FootingRowCode, type PlanCap } from './footing-design';
import { MIN_CONTACT } from './footing-mechanics';
import { needsLine } from './footing-needs';
import { meshText } from './footing-mesh';
import { dowelsText } from './footing-dowels';
import { footingSteps } from './footing-steps';
import { check, ratioOf, type CheckLine, type ComboTable, type RowStatus } from './types';
import type { FootingAdopted, FootingContext, FootingDemand, FootingEdgeResult, FootingRow, StrapResult, TieResult } from './footing-types';
import { tieBars, TIE, tieLimits } from './footing-tie-bars';
import { combinedRow } from './footing-combined-row';
import { groupRow } from './footing-group-row';
import { capRow } from './pile-cap-row';
import { CRITERION, critOf, type Criteria } from './criteria';
import { strapDefault } from './footing-strap';
import { designKey, designMemo } from './design-memo';

export type FootingRowFn = (d: FootingDemand, c: FootingContext, adopted: FootingAdopted | undefined, fmt: Fmt, cap?: PlanCap) => FootingRow;

const sizeOf = (d: FootingDemand): FootingAdopted | null => {
  const f = d.footing;
  return f && f.B > 0 && f.L > 0 ? { B: f.B, L: f.L, h: f.h, ex: f.ex, ey: f.ey, x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 } } : null;
};

export { tieBars, TIE, tieLimits };

function tieOf(d: FootingDemand, axis: 'x' | 'y', H: number, e: number, t: FootingAnalysis['balanced'][number], c: FootingContext): TieResult {
  const cr = critOf(c), lim = tieLimits(cr);
  const p = d.edge?.partners.find((q) => q.axis === axis);
  const Ns = d.service ? Math.abs(d.service.N) : 0, Ts = t.service;
  const least = p ? (Ts * p.L) / (TIE.es * lim.stretch * H) * 1e4 : 0;
  const bars = tieBars(t.force, c.fy, c.diameters, least, cr.footingTieMinBars);
  const perLayer = Math.max(1, bars.count / 2);
  const b = Math.max(cr.footingTieMinWidth, up5(2 * c.cover + 2 * TIE.stirrup + perLayer * bars.dia / 1000 + (perLayer - 1) * TIE.gap));
  const h = Math.max(cr.footingTieMinDepth, up5((p?.L ?? 0) / cr.footingTieDepthRatio));
  return {
    axis, H, Tu: t.force, ...bars, e, Ns, Ts, b, h, mu: lim.mu, byCombo: t.byCombo,
    stretch: p ? (Ts * p.L) / (TIE.es * bars.asProvided * 1e-4) : null,
    ...(p ? { partner: { key: p.key, name: p.name, L: p.L } } : {}),
  };
}

/** A footing held at a line: what each strap or tie takes, read from the analysis; the strap beams themselves are designed beside the footing (`footing-strap.ts`). */
export function edgeResult(d: FootingDemand, r: FootingAnalysis, a: FootingAdopted, c: FootingContext, defaults: (axis: 'x' | 'y') => { b: number; h: number }): FootingEdgeResult | undefined {
  const e = d.edge;
  if (!e) return undefined;
  const bal = r.balance;
  const straps: StrapResult[] = [], ties: TieResult[] = [];
  bal.axes.forEach((x, i) => {
    const t = r.balanced[i]!;
    if (x.partner) {
      const P1 = d.service ? Math.abs(d.service.N) : 0;
      const sec = x.partner.beam ? { b: x.partner.beam.b, h: x.partner.beam.h } : a.straps?.[x.axis] ?? defaults(x.axis);
      straps.push({
        axis: x.axis, partner: x.partner.name, partnerKey: x.partner.key, L: x.partner.L, e: x.along, b: sec.b, h: sec.h,
        M: t.moment, V: t.force, factor: P1 > 0 ? (P1 + t.service) / P1 : 1, relief: t.relief, combo: t.combo, R1: P1 + t.service, P1,
        ...(x.partner.beam ? { group: x.partner.beam.group } : {}),
      });
    } else if (x.H) ties.push(tieOf(d, x.axis, x.H, x.along, t, c));
  });
  const free = Math.max(0, ...bal.free.flatMap((k) => d.combos.map((q) => Math.abs(q.N * (k === 'x' ? a.ex : a.ey)) + Math.abs(k === 'x' ? q.My + r.lever * q.Vx : q.Mx - r.lever * q.Vy))));
  const tied = Math.max(0, ...bal.axes.map((x, i) => (x.H ? r.balanced[i]!.moment : 0)));
  return {
    position: bal.position, balance: e.balance, anchor: e.anchor, source: e.source, straps, ties,
    columnMoment: Math.max(free, tied),
    unpartnered: e.balance === 'strap' ? bal.free : [],
  };
}

function edgeChecks(ed: FootingEdgeResult, cr: Criteria, fmt: Fmt): CheckLine[] {
  const lim = tieLimits(cr);
  const out: CheckLine[] = [];
  const knm = (v: number) => `${fmt(v, 1)} kN·m`;
  for (const k of ed.unpartnered) out.push(check('rcSheets.v.footStrapNoPartner', true, { demand: k.toUpperCase() }));
  for (const t of ed.ties) {
    const m = (v: number) => `${fmt(v, 2)} m`;
    out.push(
      check('rcSheets.v.footTie', t.asProvided >= t.asReq - 1e-6, { clause: CRITERION, demand: `Tu = ${fmt(t.Tu, 1)} kN · ${fmt(t.asReq, 2)} cm²`, capacity: `${t.count} Ø${t.dia} (${fmt(t.asProvided, 2)} cm²)`, ratio: ratioOf(t.asReq, t.asProvided) }),
      check('rcSheets.v.footTieLoad', t.Ns <= lim.maxNs + 1e-6, { clause: CRITERION, demand: `Ns = ${fmt(t.Ns, 0)} kN`, capacity: `≤ ${fmt(lim.maxNs, 0)} kN`, ratio: t.Ns / lim.maxNs }),
      check('rcSheets.v.footTieArm', t.H >= lim.minH - 1e-9, { clause: CRITERION, demand: `H = ${m(t.H)}`, capacity: `≥ ${m(lim.minH)}` }),
      check('rcSheets.v.footTieOffset', t.e <= lim.maxE * t.H + 1e-9, { clause: CRITERION, demand: `e = ${m(t.e)}`, capacity: `≤ H/${fmt(cr.footingTieOffset, Number.isInteger(cr.footingTieOffset) ? 0 : 1)} = ${m(lim.maxE * t.H)}`, ratio: t.e / (lim.maxE * t.H) }),
      check('rcSheets.v.footTieSlide', t.mu * t.Ns >= lim.slide * t.Ts - 1e-6, { clause: CRITERION, demand: `${fmt(lim.slide, 1)}·Ts = ${fmt(lim.slide * t.Ts, 1)} kN`, capacity: `μ·Ns = ${fmt(t.mu, 2)}·${fmt(t.Ns, 0)} = ${fmt(t.mu * t.Ns, 1)} kN (φ = ${fmt(lim.phi, 0)}°)`, ratio: (lim.slide * t.Ts) / Math.max(t.mu * t.Ns, 1e-9) }),
      t.partner && t.stretch !== null
        ? check('rcSheets.v.footTieStretch', t.stretch <= lim.stretch * t.H + 1e-9, { clause: CRITERION, demand: `ΔL = Ts·L/(Es·As) = ${fmt(t.stretch * 1000, 2)} mm`, capacity: `≤ H/${fmt(cr.footingTieStretch, 0)} = ${fmt(lim.stretch * t.H * 1000, 2)} mm` })
        : check('rcSheets.v.footTieNoPartner', true, { demand: t.axis.toUpperCase() }),
    );
  }
  if (ed.columnMoment > 1e-6) out.push(check(ed.balance === 'tie' ? 'rcSheets.v.footColumnTie' : 'rcSheets.v.footColumnMoment', true, { demand: knm(ed.columnMoment) }));
  return out;
}

function verifications(d: FootingDemand, r: FootingAnalysis, a: FootingAdopted, code: FootingRowCode, fmt: Fmt, needs?: number): CheckLine[] {
  const out: CheckLine[] = [];
  const kn = (v: number) => `${fmt(v, 1)} kN`, knm = (v: number) => `${fmt(v, 1)} kN·m`, cm2 = (v: number) => `${fmt(v, 2)} cm²`, cm = (v: number) => `${fmt(v * 100, 1)} cm`;
  const b = r.bearing;
  if (d.soil?.presumed) out.push(check('rcSheets.v.footPresumedSoil', true, { demand: `qadm = ${fmt(d.soil.allowable, 0)} kPa` }));
  if (d.pier) out.push(check('rcSheets.v.footPier', true, { clause: CRITERION, demand: `${d.pier.nodes.length} · ${d.column ? `${fmt(d.column.b, 2)} × ${fmt(d.column.h, 2)} m` : ''}` }));
  for (const p of d.pulls ?? []) {
    const T = Math.max(0, ...Object.values(p.byCombo).map(Math.abs));
    out.push(check('rcSheets.v.footTiePull', true, { clause: CRITERION, demand: `${p.name} → ${p.axis.toUpperCase()}: Tu = ${kn(T)} · Tu·${fmt(p.height, 2)} m = ${knm(T * p.height)}` }));
  }
  if (!d.soil) out.push(check('rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
  else if (!b) out.push(check('rcSheets.v.footNoService', false, { clause: '§13.3.1.1' }));
  else {
    out.push(check('rcSheets.v.footBearing', !b.overturns && b.use <= 1 + 1e-9, {
      clause: '§13.3.1.1', demand: `${fmt(b.qMax, 0)} · ${fmt(b.qMean, 0)} kPa`,
      capacity: `${fmt(b.edgeFactor * (b.allowable ?? 0), 0)} · ${fmt(b.allowable ?? 0, 0)} kPa`, ratio: b.use,
    }));
    out.push(check('rcSheets.v.footContact', !b.overturns && b.contact >= MIN_CONTACT - 1e-9, { clause: '§13.2.6.1', demand: `${fmt(b.contact * 100, 0)} %`, capacity: `≥ ${fmt(MIN_CONTACT * 100, 0)} %` }));
    if (needs !== undefined && !b.ok) out.push(needsLine(needs, b.allowable ?? 0, fmt));
  }
  for (const k of [r.x, r.y]) {
    const X = k.dir.toUpperCase();
    if (k.carried) out.push(check('rcSheets.v.footCarried', true, { demand: X }));
    out.push(check(`rcSheets.v.footFlexure${X}`, k.mu <= k.phiMn + 1e-6, { clause: '§13.2.7.1', demand: knm(k.mu), capacity: knm(k.phiMn), ratio: ratioOf(k.mu, k.phiMn) }));
    out.push(check(`rcSheets.v.footMin${X}`, k.asProvided >= k.asMin - 1e-6, { clause: '§8.6.1.1', demand: cm2(k.asMin), capacity: cm2(k.asProvided) }));
    const m = k.dir === 'x' ? a.x : a.y;
    out.push(check(`rcSheets.v.footSpacing${X}`, m.spacing <= r.sMax + 1e-9 && (m.outer ?? 0) <= r.sMax + 1e-9, { clause: spacingClause(r.sMax, a.h), demand: cm(Math.max(m.spacing, m.outer ?? 0)), capacity: `≤ ${cm(r.sMax)}` }));
    if (k.band) out.push(check(`rcSheets.v.footBand${X}`, k.band.asProvided >= k.band.asReq - 1e-6, { clause: '§13.3.3.3', demand: cm2(k.band.asReq), capacity: cm2(k.band.asProvided) }));
    out.push(check(`rcSheets.v.footShear${X}`, k.vu <= k.phiVc + 1e-6, { clause: `§13.2.7.2, ${code.oneWayClause}`, demand: kn(k.vu), capacity: kn(k.phiVc), ratio: ratioOf(k.vu, k.phiVc) }));
    out.push(check(`rcSheets.v.footAnchor${X}`, k.anchorage.ok, { clause: `§13.2.8, ${k.anchorage.hooked ? code.anchorage?.clause.hooked ?? '' : code.anchorage?.clause.straight ?? ''}`, demand: `${k.anchorage.hooked ? 'ldh' : 'ld'} ${cm(k.anchorage.ld)}`, capacity: cm(k.anchorage.available) }));
  }
  if (r.punching) out.push(check('rcSheets.v.footPunching', r.punching.utilization <= 1 + 1e-6, { clause: '§22.6, §13.2.6.2(b)', demand: `${fmt(r.punching.vu, 3)} MPa`, capacity: `${fmt(r.punching.phiVc, 3)} MPa`, ratio: r.punching.utilization }));
  const dMin = Math.min(r.layers.dx, r.layers.dy);
  out.push(check('rcSheets.v.footMinD', dMin >= MIN_D - 1e-9, { clause: '§13.3.1.2', demand: cm(dMin), capacity: `≥ ${cm(MIN_D)}` }));
  const bs = r.bearingStrength, phiBn = Math.min(bs.column, bs.footing);
  if (d.column) out.push(check('rcSheets.v.footBearingStrength', bs.pu <= phiBn + 1e-6 || (!!r.dowels && r.dowels.area >= r.dowels.required - 1e-6), { clause: '§22.8', demand: kn(bs.pu), capacity: kn(phiBn), ratio: ratioOf(bs.pu, phiBn) }));
  const dw = r.dowels;
  if (dw) {
    out.push(check('rcSheets.v.footDowelArea', dw.area >= dw.required - 1e-6, { clause: d.pier ? '§16.3.4.1, §16.3.4.2' : '§16.3.4.1', demand: cm2(dw.required), capacity: `${dowelsText({ adopted: a, demand: d })} (${cm2(dw.area)})` }));
    const need = Math.max(dw.ldc, dw.ldh);
    out.push(check('rcSheets.v.footDowelAnchor', need <= dw.available + 1e-9, { clause: dw.tension ? `${code.anchorage?.clause.compression}, ${code.anchorage?.clause.hooked}` : code.anchorage?.clause.compression, demand: `${dw.tension && dw.ldh > dw.ldc ? 'ldh' : 'ldc'} ${cm(need)}`, capacity: cm(dw.available) }));
  } else if (d.column) out.push(check('rcSheets.v.footDowelArea', false, { clause: '§16.3.4.1' }));
  return out;
}

function combosOf(r: FootingAnalysis, fmt: Fmt): ComboTable {
  return {
    headers: ['N', 'Mx', 'My', 'qu,max'],
    rows: r.combos.map((k) => ({ combo: k.combo, values: [fmt(k.N, 1), fmt(k.mx, 1), fmt(k.my, 1), fmt(k.qMax, 0)], ratio: k.ratio, ok: k.ratio <= 1 + 1e-6 })),
  };
}

const emptyRow = (d: FootingDemand, c: FootingContext, line: CheckLine, a?: FootingAdopted): FootingRow => {
  const z = a ?? { B: 0, L: 0, h: 0, ex: 0, ey: 0, x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 } };
  return {
    family: 'footing', key: d.key, name: d.name, level: d.level, demand: d, ...z, cover: c.cover, proposed: z, adopted: z, isAdopted: false,
    sizing: { mode: c.sizing, reached: false, from: 'none' }, bearing: null, layers: { lower: 'x', dx: 0, dy: 0, d: 0 },
    x: null, y: null, punching: null, dowels: null, utilization: 0, verifications: [line], combos: { headers: [], rows: [] }, status: 'none', generous: false, steps: [],
    founding: foundingOf(d, z.h), pedestal: pedestalOf(d, z.h),
  };
};

export function footingRowFor(code: FootingRowCode): FootingRowFn {
  const memo = designMemo<FootingRow>();
  const design = designOf(code);
  return (d, c, adopted, fmt, cap) => ({ ...memo(designKey(fmt, d, c, adopted ?? null, cap ?? null), () => design(d, c, adopted, fmt, cap)) });
}

function designOf(code: FootingRowCode): FootingRowFn {
  return (d, c, adopted, fmt, cap) => {
    if (d.footing?.outOfScope) return emptyRow(d, c, check(`rcSheets.v.footOut.${d.footing.outOfScope}`, false));
    if (d.piles && d.column) return capRow(d, c, adopted, fmt, code) ?? emptyRow(d, c, check('rcSheets.v.footNoService', false, { clause: '§13.4.1.1' }));
    if (d.group) return groupRow(d, c, adopted, fmt, code) ?? emptyRow(d, c, check(d.soil ? 'rcSheets.v.footNoService' : 'rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
    if (!d.column) return emptyRow(d, c, check('rcSheets.v.footNoColumn', false));
    if (d.carried) return combinedRow(d, c, adopted, fmt, code) ?? emptyRow(d, c, check(d.soil ? 'rcSheets.v.footNoService' : 'rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
    const prop = proposeFooting(d, c, code, cap);
    const a = adopted ?? prop?.adopted ?? sizeOf(d);
    if (!a) return emptyRow(d, c, check(d.soil ? 'rcSheets.v.footNoService' : 'rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
    const r = analyseFooting(d, c, a, code);
    const edge = edgeResult(d, r, a, c, (axis) => strapDefault(d, a, axis));
    const needs = adopted ? undefined : prop?.needs;
    const v = [...verifications(d, r, a, code, fmt, needs), ...(edge ? edgeChecks(edge, critOf(c), fmt) : [])];
    const ratios = [r.x.mu / Math.max(r.x.phiMn, 1e-9), r.y.mu / Math.max(r.y.phiMn, 1e-9), ratioOf(r.x.vu, r.x.phiVc), ratioOf(r.y.vu, r.y.phiVc), r.punching?.utilization ?? 0, r.bearing?.use ?? 0];
    const status: RowStatus = v.every((l) => l.ok) ? 'ok' : 'fail';
    const proposed = prop?.adopted ?? a;
    return {
      family: 'footing', key: d.key, name: d.name, level: d.level, demand: d,
      B: a.B, L: a.L, h: a.h, ex: a.ex, ey: a.ey, cover: c.cover, proposed, adopted: a, isAdopted: !!adopted,
      sizing: { mode: c.sizing, reached: prop?.reached ?? false, from: prop?.from ?? 'model', ...(needs !== undefined ? { needs } : {}) },
      bearing: r.bearing ? { qMax: r.bearing.qMax, qMin: r.bearing.qMin, qMean: r.bearing.qMean, contact: r.bearing.contact, allowable: r.bearing.allowable, edgeFactor: r.bearing.edgeFactor, weight: r.bearing.weight, ex: r.bearing.ex, ey: r.bearing.ey, overturns: r.bearing.overturns, ok: r.bearing.ok, utilization: r.bearing.use } : null,
      layers: r.layers, x: r.x, y: r.y,
      punching: r.punching ? { vu: r.punching.vu, phiVc: r.punching.phiVc, utilization: r.punching.utilization, bo: r.punching.bo, position: r.punching.position } : null,
      dowels: r.dowels ? { count: r.dowels.count, dia: r.dowels.dia, ldc: Math.max(r.dowels.ldc, r.dowels.ldh), available: r.dowels.available, lap: r.dowels.lap, tension: r.dowels.tension, above: r.dowels.above, offset: r.dowels.offset } : null,
      utilization: Math.max(0, ...ratios.filter(Number.isFinite)), verifications: v, combos: combosOf(r, fmt), status, generous: false,
      steps: footingSteps(d, c, r, a, code, fmt, prop, edge),
      founding: foundingOf(d, a.h), pedestal: pedestalOf(d, a.h),
      ...(edge ? { edge } : {}),
    };
  };
}

const up5 = (v: number) => Math.ceil(v / 0.05 - 1e-9) * 0.05;

export { strapDefault };

const BEARING_ONLY: FootingRowCode = { ...CIRSOC_ONE_WAY, bearingOnly: true };

/** A code the sheets design no footings to: the soil pressure under the modelled or presized base, and a line that says the rest is not covered. */
export const uncoveredFootingRow: FootingRowFn = (d, c, adopted, fmt, cap) => {
  const base = footingRowFor(BEARING_ONLY)(d, c, adopted, fmt, cap);
  const bearing = base.verifications.filter((l) => l.label === 'rcSheets.v.footBearing' || l.label === 'rcSheets.v.footContact' || l.label === 'rcSheets.v.footNoSoil' || l.label === 'rcSheets.v.footNoService');
  const none = { dia: 0, spacing: 0 };
  const strip = (a: FootingAdopted): FootingAdopted => ({ B: a.B, L: a.L, h: a.h, ex: a.ex, ey: a.ey, x: none, y: none, ...(a.straps ? { straps: a.straps } : {}) });
  return {
    ...base, proposed: strip(base.proposed), adopted: strip(base.adopted), x: null, y: null, punching: null, dowels: null,
    verifications: [...bearing, check('rcSheets.v.footCodeOut', false)], combos: { headers: [], rows: [] },
    status: 'none', utilization: base.bearing?.utilization ?? 0, steps: base.steps.filter((g) => g.title === 'rcSheets.g.footSoil' || g.title === 'rcSheets.g.footEdge').map((g) => (g.title === 'rcSheets.g.footEdge' ? { ...g, steps: g.steps.filter((x) => !x.label.startsWith('rcSheets.s.footTie')) } : g)), uncovered: true,
    ...(base.edge ? { edge: { ...base.edge, ties: [] } } : {}),
  };
};

export const footingLabel = (a: FootingAdopted): string => `X ${meshText(a.x)} · Y ${meshText(a.y)}`;
