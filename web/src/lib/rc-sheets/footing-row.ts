import type { Fmt } from './format';
import { analyseFooting, CIRSOC_ONE_WAY, MIN_D, proposeFooting, type FootingAnalysis, type FootingRowCode } from './footing-design';
import { MIN_CONTACT } from './footing-mechanics';
import { meshText } from './footing-mesh';
import { footingSteps } from './footing-steps';
import { check, ratioOf, type CheckLine, type ComboTable, type RowStatus } from './types';
import type { FootingAdopted, FootingContext, FootingDemand, FootingEdgeResult, FootingRow, StrapResult, TieResult } from './footing-types';
import { barArea } from './bars';

export type FootingRowFn = (d: FootingDemand, c: FootingContext, adopted: FootingAdopted | undefined, fmt: Fmt) => FootingRow;

const sizeOf = (d: FootingDemand): FootingAdopted | null => {
  const f = d.footing;
  return f && f.B > 0 && f.L > 0 ? { B: f.B, L: f.L, h: f.h, ex: f.ex, ey: f.ey, x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 } } : null;
};

/** The tie's bars: two or more of one diameter, Ast = Tu/(0,90·fy) (FIUBA §14.1), half above and half below. */
export function tieBars(Tu: number, fy: number, diameters: readonly number[]): { asReq: number; count: number; dia: number; asProvided: number } {
  const asReq = (10 * Tu) / (0.9 * fy);
  const pick = diameters.map((dia) => ({ dia, count: Math.max(2, 2 * Math.ceil(asReq / barArea(dia) / 2)) })).find((x) => x.count <= 8) ?? { dia: diameters[diameters.length - 1] ?? 16, count: Math.max(2, 2 * Math.ceil(asReq / barArea(diameters[diameters.length - 1] ?? 16) / 2)) };
  return { asReq, ...pick, asProvided: pick.count * barArea(pick.dia) };
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
    } else if (x.H) ties.push({ axis: x.axis, H: x.H, Tu: t.force, ...tieBars(t.force, c.fy, c.diameters) });
  });
  const free = Math.max(0, ...bal.free.flatMap((k) => d.combos.map((q) => Math.abs(q.N * (k === 'x' ? a.ex : a.ey)) + Math.abs(k === 'x' ? q.My + r.lever * q.Vx : q.Mx - r.lever * q.Vy))));
  const tied = Math.max(0, ...bal.axes.map((x, i) => (x.H ? r.balanced[i]!.moment : 0)));
  return {
    position: bal.position, balance: e.balance, anchor: e.anchor, source: e.source, straps, ties,
    columnMoment: Math.max(free, tied),
    unpartnered: e.balance === 'strap' ? bal.free : [],
  };
}

function edgeChecks(ed: FootingEdgeResult, fmt: Fmt): CheckLine[] {
  const out: CheckLine[] = [];
  const knm = (v: number) => `${fmt(v, 1)} kN·m`;
  for (const k of ed.unpartnered) out.push(check('rcSheets.v.footStrapNoPartner', true, { demand: k.toUpperCase() }));
  for (const t of ed.ties) out.push(check('rcSheets.v.footTie', t.asProvided >= t.asReq - 1e-6, { clause: 'FIUBA §14.1', demand: `Tu = ${fmt(t.Tu, 1)} kN · ${fmt(t.asReq, 2)} cm²`, capacity: `${t.count} Ø${t.dia} (${fmt(t.asProvided, 2)} cm²)`, ratio: ratioOf(t.asReq, t.asProvided) }));
  if (ed.columnMoment > 1e-6) out.push(check(ed.balance === 'tie' ? 'rcSheets.v.footColumnTie' : 'rcSheets.v.footColumnMoment', true, { demand: knm(ed.columnMoment) }));
  return out;
}

function verifications(d: FootingDemand, r: FootingAnalysis, a: FootingAdopted, code: FootingRowCode, fmt: Fmt): CheckLine[] {
  const out: CheckLine[] = [];
  const kn = (v: number) => `${fmt(v, 1)} kN`, knm = (v: number) => `${fmt(v, 1)} kN·m`, cm2 = (v: number) => `${fmt(v, 2)} cm²`, cm = (v: number) => `${fmt(v * 100, 1)} cm`;
  const b = r.bearing;
  if (d.soil?.presumed) out.push(check('rcSheets.v.footPresumedSoil', true, { demand: `qadm = ${fmt(d.soil.allowable, 0)} kPa` }));
  if (!d.soil) out.push(check('rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
  else if (!b) out.push(check('rcSheets.v.footNoService', false, { clause: '§13.3.1.1' }));
  else {
    out.push(check('rcSheets.v.footBearing', !b.overturns && b.use <= 1 + 1e-9, {
      clause: '§13.3.1.1', demand: `${fmt(b.qMax, 0)} · ${fmt(b.qMean, 0)} kPa`,
      capacity: `${fmt(b.edgeFactor * (b.allowable ?? 0), 0)} · ${fmt(b.allowable ?? 0, 0)} kPa`, ratio: b.use,
    }));
    out.push(check('rcSheets.v.footContact', !b.overturns && b.contact >= MIN_CONTACT - 1e-9, { clause: '§13.2.6.1', demand: `${fmt(b.contact * 100, 0)} %`, capacity: `≥ ${fmt(MIN_CONTACT * 100, 0)} %` }));
  }
  for (const k of [r.x, r.y]) {
    const X = k.dir.toUpperCase();
    if (k.carried) out.push(check('rcSheets.v.footCarried', true, { demand: X }));
    out.push(check(`rcSheets.v.footFlexure${X}`, k.mu <= k.phiMn + 1e-6, { clause: '§13.2.7.1', demand: knm(k.mu), capacity: knm(k.phiMn), ratio: ratioOf(k.mu, k.phiMn) }));
    out.push(check(`rcSheets.v.footMin${X}`, k.asProvided >= k.asMin - 1e-6, { clause: '§8.6.1.1', demand: cm2(k.asMin), capacity: cm2(k.asProvided) }));
    const m = k.dir === 'x' ? a.x : a.y;
    out.push(check(`rcSheets.v.footSpacing${X}`, m.spacing <= r.sMax + 1e-9 && (m.outer ?? 0) <= r.sMax + 1e-9, { clause: '§8.7.2.2', demand: cm(Math.max(m.spacing, m.outer ?? 0)), capacity: `≤ ${cm(r.sMax)}` }));
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
    out.push(check('rcSheets.v.footDowelArea', dw.area >= dw.required - 1e-6, { clause: '§16.3.4.1', demand: cm2(dw.required), capacity: `${dw.count} Ø${dw.dia} (${cm2(dw.area)})` }));
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
  };
};

export function footingRowFor(code: FootingRowCode): FootingRowFn {
  return (d, c, adopted, fmt) => {
    if (d.footing?.outOfScope) return emptyRow(d, c, check(`rcSheets.v.footOut.${d.footing.outOfScope}`, false));
    if (!d.column) return emptyRow(d, c, check('rcSheets.v.footNoColumn', false));
    const prop = proposeFooting(d, c, code);
    const a = adopted ?? prop?.adopted ?? sizeOf(d);
    if (!a) return emptyRow(d, c, check(d.soil ? 'rcSheets.v.footNoService' : 'rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
    const r = analyseFooting(d, c, a, code);
    const edge = edgeResult(d, r, a, c, (axis) => strapDefault(d, a, axis));
    const v = [...verifications(d, r, a, code, fmt), ...(edge ? edgeChecks(edge, fmt) : [])];
    const ratios = [r.x.mu / Math.max(r.x.phiMn, 1e-9), r.y.mu / Math.max(r.y.phiMn, 1e-9), ratioOf(r.x.vu, r.x.phiVc), ratioOf(r.y.vu, r.y.phiVc), r.punching?.utilization ?? 0, r.bearing?.use ?? 0];
    const status: RowStatus = !v.every((l) => l.ok) ? 'fail' : edge && edge.columnMoment > 1e-6 ? 'warn' : 'ok';
    const proposed = prop?.adopted ?? a;
    return {
      family: 'footing', key: d.key, name: d.name, level: d.level, demand: d,
      B: a.B, L: a.L, h: a.h, ex: a.ex, ey: a.ey, cover: c.cover, proposed, adopted: a, isAdopted: !!adopted,
      sizing: { mode: c.sizing, reached: prop?.reached ?? false, from: prop?.from ?? 'model' },
      bearing: r.bearing ? { qMax: r.bearing.qMax, qMin: r.bearing.qMin, qMean: r.bearing.qMean, contact: r.bearing.contact, allowable: r.bearing.allowable, edgeFactor: r.bearing.edgeFactor, weight: r.bearing.weight, ex: r.bearing.ex, ey: r.bearing.ey, overturns: r.bearing.overturns, ok: r.bearing.ok, utilization: r.bearing.use } : null,
      layers: r.layers, x: r.x, y: r.y,
      punching: r.punching ? { vu: r.punching.vu, phiVc: r.punching.phiVc, utilization: r.punching.utilization, bo: r.punching.bo, position: r.punching.position } : null,
      dowels: r.dowels ? { count: r.dowels.count, dia: r.dowels.dia, ldc: Math.max(r.dowels.ldc, r.dowels.ldh), available: r.dowels.available, lap: r.dowels.lap, tension: r.dowels.tension } : null,
      utilization: Math.max(0, ...ratios.filter(Number.isFinite)), verifications: v, combos: combosOf(r, fmt), status, generous: false,
      steps: footingSteps(d, c, r, a, code, fmt, prop, edge),
      ...(edge ? { edge } : {}),
    };
  };
}

const up5 = (v: number) => Math.ceil(v / 0.05 - 1e-9) * 0.05;

/**
 * A strap beam's section where the model has none: as wide as the column across it (20 cm at
 * least), and as deep as L/8 and 10 cm over the footing, 40 cm at least. Deeper than the footing
 * it balances, it turns with it as one rather than bending under it, as the statics of
 * `strap-footing.ts` assume; L/8 keeps its own deflection, which the footing would follow, small.
 */
export function strapDefault(d: FootingDemand, a: Pick<FootingAdopted, 'h'>, axis: 'x' | 'y'): { b: number; h: number } {
  const p = d.edge?.partners.find((x) => x.axis === axis);
  const across = axis === 'x' ? d.column?.h ?? 0.2 : d.column?.b ?? 0.2;
  return { b: Math.round(Math.max(0.2, up5(across)) * 1000) / 1000, h: Math.round(Math.max(0.4, up5((p?.L ?? 0) / 8), up5(a.h + 0.1)) * 1000) / 1000 };
}

const BEARING_ONLY: FootingRowCode = { ...CIRSOC_ONE_WAY, bearingOnly: true };

/** A code the sheets design no footings to: the soil pressure under the modelled or presized base, and a line that says the rest is not covered. */
export const uncoveredFootingRow: FootingRowFn = (d, c, adopted, fmt) => {
  const base = footingRowFor(BEARING_ONLY)(d, c, adopted, fmt);
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
