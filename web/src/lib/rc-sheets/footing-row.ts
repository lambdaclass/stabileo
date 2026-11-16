import type { Fmt } from './format';
import { analyseFooting, ACI_FOOTING, CIRSOC_FOOTING, MIN_D, proposeFooting, type FootingAnalysis, type FootingRowCode } from './footing-design';
import { MIN_CONTACT } from './footing-mechanics';
import { meshText } from './footing-mesh';
import { footingSteps } from './footing-steps';
import { check, ratioOf, type CheckLine, type ComboTable, type RowStatus } from './types';
import type { FootingAdopted, FootingContext, FootingDemand, FootingRow } from './footing-types';

export type FootingRowFn = (d: FootingDemand, c: FootingContext, adopted: FootingAdopted | undefined, fmt: Fmt) => FootingRow;

const sizeOf = (d: FootingDemand): FootingAdopted | null => {
  const f = d.footing;
  return f && f.B > 0 && f.L > 0 ? { B: f.B, L: f.L, h: f.h, ex: f.ex, ey: f.ey, x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 } } : null;
};

function verifications(d: FootingDemand, r: FootingAnalysis, a: FootingAdopted, code: FootingRowCode, fmt: Fmt): CheckLine[] {
  const out: CheckLine[] = [];
  const kn = (v: number) => `${fmt(v, 1)} kN`, knm = (v: number) => `${fmt(v, 1)} kN·m`, cm2 = (v: number) => `${fmt(v, 2)} cm²`, cm = (v: number) => `${fmt(v * 100, 1)} cm`;
  const b = r.bearing;
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
    out.push(check(`rcSheets.v.footFlexure${X}`, k.mu <= k.phiMn + 1e-6, { clause: '§13.2.7.1', demand: knm(k.mu), capacity: knm(k.phiMn), ratio: ratioOf(k.mu, k.phiMn) }));
    out.push(check(`rcSheets.v.footMin${X}`, k.asProvided >= k.asMin - 1e-6, { clause: '§8.6.1.1', demand: cm2(k.asMin), capacity: cm2(k.asProvided) }));
    const m = k.dir === 'x' ? a.x : a.y;
    out.push(check(`rcSheets.v.footSpacing${X}`, m.spacing <= r.sMax + 1e-9 && (m.outer ?? 0) <= r.sMax + 1e-9, { clause: '§8.7.2.2', demand: cm(Math.max(m.spacing, m.outer ?? 0)), capacity: `≤ ${cm(r.sMax)}` }));
    if (k.band) out.push(check(`rcSheets.v.footBand${X}`, k.band.asProvided >= k.band.asReq - 1e-6, { clause: '§13.3.3.3', demand: cm2(k.band.asReq), capacity: cm2(k.band.asProvided) }));
    out.push(check(`rcSheets.v.footShear${X}`, k.vu <= k.phiVc + 1e-6, { clause: `§13.2.7.2, ${code.oneWayClause}`, demand: kn(k.vu), capacity: kn(k.phiVc), ratio: ratioOf(k.vu, k.phiVc) }));
    out.push(check(`rcSheets.v.footAnchor${X}`, k.anchorage.ok, { clause: k.anchorage.hooked ? '§13.2.8, §25.4.3' : '§13.2.8, §25.4.2', demand: `${k.anchorage.hooked ? 'ldh' : 'ld'} ${cm(k.anchorage.ld)}`, capacity: cm(k.anchorage.available) }));
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
    out.push(check('rcSheets.v.footDowelAnchor', need <= dw.available + 1e-9, { clause: dw.tension ? '§25.4.9, §25.4.3' : '§25.4.9', demand: `${dw.tension && dw.ldh > dw.ldc ? 'ldh' : 'ldc'} ${cm(need)}`, capacity: cm(dw.available) }));
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
    const v = verifications(d, r, a, code, fmt);
    const ratios = [r.x.mu / Math.max(r.x.phiMn, 1e-9), r.y.mu / Math.max(r.y.phiMn, 1e-9), ratioOf(r.x.vu, r.x.phiVc), ratioOf(r.y.vu, r.y.phiVc), r.punching?.utilization ?? 0, r.bearing?.use ?? 0];
    const status: RowStatus = v.every((l) => l.ok) ? 'ok' : 'fail';
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
      steps: footingSteps(d, c, r, a, code, fmt, prop),
    };
  };
}

export const footingRow = footingRowFor(CIRSOC_FOOTING);
export const aciFootingRow = footingRowFor(ACI_FOOTING);

const BEARING_ONLY: FootingRowCode = { ...CIRSOC_FOOTING, bearingOnly: true };

/** A code the sheets design no footings to: the soil pressure under the modelled or presized base, and a line that says the rest is not covered. */
export const uncoveredFootingRow: FootingRowFn = (d, c, adopted, fmt) => {
  const base = footingRowFor(BEARING_ONLY)(d, c, adopted, fmt);
  const bearing = base.verifications.filter((l) => l.label === 'rcSheets.v.footBearing' || l.label === 'rcSheets.v.footContact' || l.label === 'rcSheets.v.footNoSoil' || l.label === 'rcSheets.v.footNoService');
  const none = { dia: 0, spacing: 0 };
  const strip = (a: FootingAdopted): FootingAdopted => ({ B: a.B, L: a.L, h: a.h, ex: a.ex, ey: a.ey, x: none, y: none });
  return {
    ...base, proposed: strip(base.proposed), adopted: strip(base.adopted), x: null, y: null, punching: null, dowels: null,
    verifications: [...bearing, check('rcSheets.v.footCodeOut', false)], combos: { headers: [], rows: [] },
    status: 'none', utilization: base.bearing?.utilization ?? 0, steps: base.steps.filter((g) => g.title === 'rcSheets.g.footSoil'), uncovered: true,
  };
};

export const footingLabel = (a: FootingAdopted): string => `X ${meshText(a.x)} · Y ${meshText(a.y)}`;
