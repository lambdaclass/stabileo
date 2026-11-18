import type { Fmt } from './format';
import { MIN_D, type FootingRowCode } from './footing-design';
import { MIN_CONTACT } from './footing-mechanics';
import { meshText } from './footing-mesh';
import { analyseCombined, proposeCombined, type CombinedAnalysis } from './footing-combined';
import { check, ratioOf, type CheckLine, type RowStatus, type Step, type StepGroup } from './types';
import type { FootingAdopted, FootingContext, FootingDemand, FootingRow } from './footing-types';

function verifications(d: FootingDemand, r: CombinedAnalysis, a: FootingAdopted, code: FootingRowCode, fmt: Fmt): CheckLine[] {
  const out: CheckLine[] = [];
  const kn = (v: number) => `${fmt(v, 1)} kN`, knm = (v: number) => `${fmt(v, 1)} kN·m`, cm2 = (v: number) => `${fmt(v, 2)} cm²`, cm = (v: number) => `${fmt(v * 100, 1)} cm`;
  if (d.soil?.presumed) out.push(check('rcSheets.v.footPresumedSoil', true, { demand: `qadm = ${fmt(d.soil.allowable, 0)} kPa` }));
  const b = r.bearing;
  if (!d.soil) out.push(check('rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
  else if (!b) out.push(check('rcSheets.v.footNoService', false, { clause: '§13.3.1.1' }));
  else {
    out.push(check('rcSheets.v.footBearing', !b.overturns && b.use <= 1 + 1e-9, { clause: '§13.3.1.1', demand: `${fmt(b.qMax, 0)} · ${fmt(b.qMean, 0)} kPa`, capacity: `${fmt(b.edgeFactor * (b.allowable ?? 0), 0)} · ${fmt(b.allowable ?? 0, 0)} kPa`, ratio: b.use }));
    out.push(check('rcSheets.v.footContact', !b.overturns && b.contact >= MIN_CONTACT - 1e-9, { clause: '§13.2.6.1', demand: `${fmt(b.contact * 100, 0)} %`, capacity: `≥ ${fmt(MIN_CONTACT * 100, 0)} %` }));
  }
  const L = r.along, X = L.dir.toUpperCase(), T = r.across.dir.toUpperCase();
  out.push(check(`rcSheets.v.footFlexure${X}`, L.mu <= L.phiMn + 1e-6, { clause: '§13.2.7.1', demand: knm(L.mu), capacity: knm(L.phiMn), ratio: ratioOf(L.mu, L.phiMn) }));
  out.push(check(`rcSheets.v.footMin${X}`, L.asProvided >= L.asMin - 1e-6, { clause: '§8.6.1.1', demand: cm2(L.asMin), capacity: cm2(L.asProvided) }));
  out.push(check('rcSheets.v.footTop', r.top.mu <= r.top.phiMn + 1e-6 && r.top.asProvided >= r.top.asReq - 1e-6, { clause: '§13.2.7.1, §8.6.1.1', demand: `${knm(r.top.mu)} · ${cm2(r.top.asReq)}`, capacity: `${knm(r.top.phiMn)} · ${cm2(r.top.asProvided)}`, ratio: ratioOf(r.top.mu, r.top.phiMn) }));
  if (r.top.mu > 1e-6) out.push(check('rcSheets.v.footTopAnchor', r.top.anchorage.ok, { clause: r.top.anchorage.hooked ? code.anchorage?.clause.hooked ?? '' : `§25.4.2.5, ${code.anchorage?.clause.straight ?? ''}`, demand: `${r.top.anchorage.hooked ? 'ldh' : '1,3·ld'} ${cm(r.top.anchorage.ld)}`, capacity: cm(r.top.anchorage.available) }));
  r.bands.forEach((k, i) => {
    out.push(check(`rcSheets.v.footBand${T}`, k.mu <= k.phiMn + 1e-6 && k.asProvided >= k.asReq - 1e-6, { clause: '§13.3.4 · ' + r.cols[i]!.demand.name, demand: `${knm(k.mu)} · ${cm2(k.asReq)}`, capacity: `${knm(k.phiMn)} · ${cm2(k.asProvided)}`, ratio: ratioOf(k.mu, k.phiMn) }));
    out.push(check(`rcSheets.v.footShear${T}`, k.vu <= k.phiVc + 1e-6, { clause: `§13.2.7.2, ${code.oneWayClause} · ${r.cols[i]!.demand.name}`, demand: kn(k.vu), capacity: kn(k.phiVc), ratio: ratioOf(k.vu, k.phiVc) }));
  });
  for (const k of [r.along, r.across]) {
    const m = k.dir === 'x' ? a.x : a.y;
    out.push(check(`rcSheets.v.footSpacing${k.dir.toUpperCase()}`, m.spacing <= r.sMax + 1e-9, { clause: '§8.7.2.2', demand: cm(m.spacing), capacity: `≤ ${cm(r.sMax)}` }));
    out.push(check(`rcSheets.v.footAnchor${k.dir.toUpperCase()}`, k.anchorage.ok, { clause: `§13.2.8, ${k.anchorage.hooked ? code.anchorage?.clause.hooked ?? '' : code.anchorage?.clause.straight ?? ''}`, demand: `${k.anchorage.hooked ? 'ldh' : 'ld'} ${cm(k.anchorage.ld)}`, capacity: cm(k.anchorage.available) }));
  }
  out.push(check(`rcSheets.v.footShear${X}`, L.vu <= L.phiVc + 1e-6, { clause: `§13.2.7.2, ${code.oneWayClause}`, demand: kn(L.vu), capacity: kn(L.phiVc), ratio: ratioOf(L.vu, L.phiVc) }));
  r.punching.forEach((p, i) => out.push(check('rcSheets.v.footPunching', p.utilization <= 1 + 1e-6, { clause: `§22.6, §13.2.6.2(b) · ${r.cols[i]!.demand.name}`, demand: `${fmt(p.vu, 3)} MPa`, capacity: `${fmt(p.phiVc, 3)} MPa`, ratio: p.utilization })));
  const dMin = Math.min(r.layers.dx, r.layers.dy);
  out.push(check('rcSheets.v.footMinD', dMin >= MIN_D - 1e-9, { clause: '§13.3.1.2', demand: cm(dMin), capacity: `≥ ${cm(MIN_D)}` }));
  r.bearingStrength.forEach((bs, i) => {
    const phiBn = Math.min(bs.column, bs.footing), dw = r.dowels[i];
    out.push(check('rcSheets.v.footBearingStrength', bs.pu <= phiBn + 1e-6 || (!!dw && dw.area >= dw.required - 1e-6), { clause: `§22.8 · ${r.cols[i]!.demand.name}`, demand: kn(bs.pu), capacity: kn(phiBn), ratio: ratioOf(bs.pu, phiBn) }));
    if (dw) {
      out.push(check('rcSheets.v.footDowelArea', dw.area >= dw.required - 1e-6, { clause: `§16.3.4.1 · ${r.cols[i]!.demand.name}`, demand: cm2(dw.required), capacity: `${dw.count} Ø${dw.dia} (${cm2(dw.area)})` }));
      const need = Math.max(dw.ldc, dw.ldh);
      out.push(check('rcSheets.v.footDowelAnchor', need <= dw.available + 1e-9, { clause: code.anchorage?.clause.compression, demand: `${dw.tension && dw.ldh > dw.ldc ? 'ldh' : 'ldc'} ${cm(need)}`, capacity: cm(dw.available) }));
    } else out.push(check('rcSheets.v.footDowelArea', false, { clause: '§16.3.4.1' }));
  });
  return out;
}

function steps(d: FootingDemand, r: CombinedAnalysis, a: FootingAdopted, code: FootingRowCode, fmt: Fmt, reached: boolean | null): StepGroup[] {
  const cm = (v: number) => fmt(v * 100, 0);
  const [c1, c2] = r.cols;
  const b = r.bearing;
  const X = r.along.dir.toUpperCase(), T = r.across.dir.toUpperCase();
  const size: Step[] = [
    { label: 'rcSheets.s.footCombinedCols', formula: `${c1.demand.name} · ${c2.demand.name}`, value: `N = ${fmt(d.service?.N ?? 0, 1)} + ${fmt(d.carried?.service?.N ?? 0, 1)} kN · ${fmt(Math.hypot(c2.x - c1.x, c2.y - c1.y), 2)} m` },
    { label: 'rcSheets.s.footCombinedResultant', formula: 'x̄ = N2·s/(N1 + N2)', value: `${cm(a.ex)} · ${cm(a.ey)} cm` },
    { label: 'rcSheets.s.footSize', formula: 'B × L × h', value: `${cm(a.B)} × ${cm(a.L)} × ${cm(a.h)} cm`, ...(reached !== null ? { ok: reached } : {}) },
    ...(b ? [{ label: 'rcSheets.s.footPressure', formula: 'qmáx · qmín · qmed', value: `${fmt(b.qMax, 0)} · ${fmt(b.qMin, 0)} · ${fmt(b.qMean, 0)} kPa`, ok: b.ok }] : []),
  ];
  const line: Step[] = [
    { label: 'rcSheets.s.footCombinedBottom', formula: `Mu+ (${X})`, value: `${fmt(r.along.mu, 1)} kN·m → ${fmt(r.along.asReq, 2)} cm² · ${meshText(r.along.dir === 'x' ? a.x : a.y)} (${fmt(r.along.asProvided, 2)})`, ok: r.along.mu <= r.along.phiMn + 1e-6 },
    { label: 'rcSheets.s.footCombinedTop', formula: `Mu− (${X})`, value: `${fmt(r.top.mu, 1)} kN·m → ${fmt(r.top.asReq, 2)} cm² · ${a.top ? meshText(a.top) : '—'} (${fmt(r.top.asProvided, 2)})`, ok: r.top.mu <= r.top.phiMn + 1e-6 },
    { label: `rcSheets.s.footVu${X}`, formula: `${code.oneWayFormula} (${code.oneWayClause})`, value: `${fmt(r.along.vu, 1)} ≤ ${fmt(r.along.phiVc, 1)} kN`, ok: r.along.vu <= r.along.phiVc + 1e-6 },
  ];
  const across: Step[] = r.bands.flatMap((k, i): Step[] => [
    { label: 'rcSheets.s.footCombinedBand', formula: `${r.cols[i]!.demand.name}: b = c + d · Mu = (Nu/W)·v²/2 (${T})`, value: `${cm(k.width)} cm · ${fmt(k.mu, 1)} kN·m → ${fmt(k.asReq, 2)} ≤ ${fmt(k.asProvided, 2)} cm²`, ok: k.asProvided >= k.asReq - 1e-6 },
    { label: `rcSheets.s.footVu${T}`, formula: `${code.oneWayFormula} (${code.oneWayClause})`, value: `${fmt(k.vu, 1)} ≤ ${fmt(k.phiVc, 1)} kN`, ok: k.vu <= k.phiVc + 1e-6 },
  ]);
  const punch: Step[] = r.punching.map((p, i) => ({ label: 'rcSheets.s.footPunchVc', formula: `${r.cols[i]!.demand.name} (${p.position})`, value: `${fmt(p.vu, 3)} ≤ ${fmt(p.phiVc, 3)} MPa (${p.combo})`, ok: p.utilization <= 1 + 1e-6 }));
  return [
    { title: 'rcSheets.g.footCombined', steps: size },
    { title: 'rcSheets.g.footCombinedLine', steps: line },
    { title: 'rcSheets.g.footCombinedAcross', steps: across },
    { title: 'rcSheets.g.footShear', steps: punch },
  ];
}

/** A combined footing's row: its two columns on one base, the line between them read as a beam and the bands under each across it. */
export function combinedRow(d: FootingDemand, c: FootingContext, adopted: FootingAdopted | undefined, fmt: Fmt, code: FootingRowCode): FootingRow | null {
  const m = d.footing && d.footing.B > 0 ? d.footing : undefined;
  const prop = c.sizing === 'reinforce' && m ? null : proposeCombined(d, c, code);
  const fromModel = m ? { B: m.B, L: m.L, h: m.h, ex: m.ex, ey: m.ey } : null;
  const proposed: FootingAdopted | undefined = prop?.adopted ?? (fromModel ? { ...fromModel, x: { dia: 12, spacing: 0.2 }, y: { dia: 12, spacing: 0.2 } } : undefined);
  const own = adopted ?? proposed;
  if (!own) return null;
  const a: FootingAdopted = { ...own, with: d.carried!.key };
  const r = analyseCombined(d, c, a, code);
  const v = verifications(d, r, a, code, fmt);
  const status: RowStatus = v.every((l) => l.ok) ? 'ok' : 'fail';
  const ratios = [r.along.mu / Math.max(r.along.phiMn, 1e-9), r.top.mu / Math.max(r.top.phiMn, 1e-9), ratioOf(r.along.vu, r.along.phiVc), ...r.bands.map((k) => ratioOf(k.mu, k.phiMn)), ...r.punching.map((p) => p.utilization), r.bearing?.use ?? 0];
  const x = r.along.dir === 'x' ? r.along : r.across, y = r.along.dir === 'y' ? r.along : r.across;
  const name = `${d.name} + ${d.carried!.name}`;
  return {
    family: 'footing', key: d.key, name, level: d.level, demand: d,
    B: a.B, L: a.L, h: a.h, ex: a.ex, ey: a.ey, cover: c.cover, proposed: proposed ? { ...proposed, with: d.carried!.key } : a, adopted: a, isAdopted: !!adopted,
    sizing: { mode: c.sizing, reached: prop?.reached ?? false, from: prop ? 'loads' : 'model' },
    bearing: r.bearing ? { qMax: r.bearing.qMax, qMin: r.bearing.qMin, qMean: r.bearing.qMean, contact: r.bearing.contact, allowable: r.bearing.allowable, edgeFactor: r.bearing.edgeFactor, weight: r.bearing.weight, ex: r.bearing.ex, ey: r.bearing.ey, overturns: r.bearing.overturns, ok: r.bearing.ok, utilization: r.bearing.use } : null,
    layers: r.layers, x, y,
    punching: r.punching[0] ? { vu: r.punching[0].vu, phiVc: r.punching[0].phiVc, utilization: Math.max(...r.punching.map((p) => p.utilization)), bo: r.punching[0].bo, position: r.punching[0].position as 'interior' } : null,
    dowels: r.dowels[0] ? { count: r.dowels[0].count, dia: r.dowels[0].dia, ldc: Math.max(r.dowels[0].ldc, r.dowels[0].ldh), available: r.dowels[0].available, lap: r.dowels[0].lap, tension: r.dowels[0].tension, above: r.dowels[0].above, offset: r.dowels[0].offset } : null,
    utilization: Math.max(0, ...ratios.filter(Number.isFinite)), verifications: v,
    combos: { headers: ['N', 'Mx', 'My', 'qu,max'], rows: r.combos.map((k) => ({ combo: k.combo, values: [fmt(k.N, 1), fmt(k.mx, 1), fmt(k.my, 1), fmt(k.qMax, 0)], ratio: k.ratio, ok: k.ratio <= 1 + 1e-6 })) },
    status, generous: false,
    steps: steps(d, r, a, code, fmt, prop ? prop.reached : null),
    combined: {
      axis: r.axis, second: d.carried!.name, secondKey: d.carried!.key, spacing: Math.hypot(r.cols[1].x - r.cols[0].x, r.cols[1].y - r.cols[0].y),
      mBottom: r.along.mu, mTop: r.top.mu, asTop: r.top.asReq, asTopProvided: r.top.asProvided, phiMnTop: r.top.phiMn,
      bands: r.bands.map((k) => ({ width: k.width, mu: k.mu, asReq: k.asReq, asProvided: k.asProvided })),
      punching: r.punching.map((p) => ({ vu: p.vu, phiVc: p.phiVc, utilization: p.utilization, position: p.position })),
    },
  };
}
