import type { Fmt } from './format';
import { CRITERION, critOf, withCriterion } from './criteria';
import { foundingOf, pedestalOf, pedestalSectionOf, proposeDowels, spacingClause, type FootingRowCode } from './footing-design';
import { proposeCombinedDowels } from './footing-combined';
import { meshText } from './footing-mesh';
import { edgeSteps } from './footing-steps';
import { strapDefault } from './footing-strap';
import { strapPullChecks } from './footing-needs';
import { analyseCap, CAP_SECONDARY, capBalance, capColumns, capCover, capHolds, capMeshes, capPlan, CAP_MAX_H, CAP_STEP_H, pileBars, pilePatterns, PILE_COUNTS, PILE_EMBED, upCap, PILE_UNHELD_TOL, type CapAnalysis } from './pile-cap';
import { check, ratioOf, type CheckLine, type RowStatus, type Step, type StepGroup } from './types';
import type { CapPiles, FootingAdopted, FootingContext, FootingDemand, FootingEdgeResult, FootingRow, StrapResult } from './footing-types';

type CapAdopted = FootingAdopted & { piles: CapPiles };

/**
 * A pile cap for its column, its pier or the two columns of a combined cap: of the fewest piles
 * that hold and the next count, in every pattern that suits the footprint (`pilePatterns`), the
 * one of least concrete in cap and piles. The piles stand at the criterion's spacing, kept off the
 * property lines, with service loads on a rigid cap within each pile's allowable load and the
 * group's (§13.4.1.1; GA §8.3, §8.5); the cap as thick as shear and punching with the pile
 * reactions of §13.4.6.7, or the struts and nodes of a deep cap (ch. 23), ask; the piles' own bars
 * for the largest factored load. Null without piles or service loads.
 */
export function proposeCap(d: FootingDemand, c: FootingContext, code: FootingRowCode): { adopted: CapAdopted; reached: boolean } | null {
  const spec = d.piles, cols = capColumns(d);
  if (!spec || !d.column || cols.some((k) => !k.demand.service)) return null;
  const cr = critOf(c), s = cr.footingPileSpacing * spec.diameter;
  const held = d.edge?.anchor ?? [0, 0];
  const span = (k: 'x' | 'y') => { const lo = Math.min(...cols.map((q) => q[k] - (k === 'x' ? q.b : q.h) / 2)), hi = Math.max(...cols.map((q) => q[k] + (k === 'x' ? q.b : q.h) / 2)); return Math.max(hi - lo, s); };
  const shaped = cols.length > 1 || !!d.pier;
  const along = shaped ? (span('x') >= span('y') ? 'x' : 'y') : held[0] && !held[1] ? 'y' : 'x';
  const aspect = shaped ? Math.max(span('x'), span('y')) / Math.min(span('x'), span('y')) : 1;
  const dowels = d.carried ? proposeCombinedDowels(d, c) : ((dw) => (dw ? { dowels: dw } : {}))(proposeDowels(d, c));
  const minH = upCap(0.3 + capCover(c.cover) + 0.04);
  const volume = (a: CapAdopted) => a.B * a.L * a.h + a.piles.at.length * Math.PI * a.piles.diameter ** 2 / 4 * a.piles.length;
  let last: CapAdopted | null = null, best: CapAdopted | null = null, holding = 0;
  for (const n of PILE_COUNTS.filter((k) => k >= Math.max(cr.footingPileMinCount, cols.length))) {
    let holds = false;
    for (const pattern of pilePatterns(n, s, along, aspect)) {
      const plan = capPlan(cols, pattern, spec, cr.footingPileLineClear);
      for (let h = minH; h <= CAP_MAX_H + 1e-9; h = Math.round((h + CAP_STEP_H) * 1000) / 1000) {
        const bars0 = pileBars(spec.diameter, 0, c);
        const base: CapAdopted = { B: plan.B, L: plan.L, h, ex: plan.ex, ey: plan.ey, x: { dia: 12, spacing: 0.2 }, y: { dia: 12, spacing: 0.2 }, ...dowels,
          piles: { diameter: spec.diameter, length: spec.length, at: plan.piles, bars: { count: bars0.count, dia: bars0.dia }, hoop: bars0.hoop } };
        const probe = analyseCap(d, c, base, code);
        const pb = pileBars(spec.diameter, probe.result.section.pu, c);
        const a: CapAdopted = { ...base, ...capMeshes(d, c, base, code), piles: { ...base.piles, bars: { count: pb.count, dia: pb.dia }, hoop: pb.hoop } };
        last = a;
        const r = analyseCap(d, c, a, code), k = r.result;
        const soil = Math.max(...k.piles.map((p) => p.service)) <= k.capacity + 1e-6 && Math.min(...k.piles.map((p) => p.service)) >= -1e-6 && k.group.service <= k.group.capacity + 1e-6;
        if (!soil) break;
        if (capHolds(r)) { holds = true; if (!best || volume(a) < volume(best) - 1e-9) best = a; break; }
      }
    }
    if (holds && ++holding >= 2) break;
  }
  if (best) return { adopted: best, reached: true };
  return last ? { adopted: last, reached: false } : null;
}

function capEdge(d: FootingDemand, r: CapAnalysis, a: CapAdopted): FootingEdgeResult | undefined {
  if (!d.edge) return undefined;
  const bal = capBalance(d), first = r.cols[0]!, n = a.piles.at.length;
  const gx = a.piles.at.reduce((t, p) => t + p[0], 0) / n, gy = a.piles.at.reduce((t, p) => t + p[1], 0) / n;
  const straps: StrapResult[] = bal.filter((b) => b.kind === 'strap').map((b) => {
    const p = d.edge!.partners.find((x) => x.axis === b.axis)!, e = Math.abs(b.axis === 'x' ? first.x - gx : first.y - gy);
    const sec = a.straps?.[b.axis] ?? p.beam ?? strapDefault(d, a, b.axis), P1 = Math.abs(d.service?.N ?? 0);
    let M = 0, combo: string | null = null;
    for (const q of d.combos) { const m = Math.abs(q.N) * e + Math.abs(b.axis === 'x' ? q.My + r.lever * q.Vx : q.Mx - r.lever * q.Vy); if (m > M) { M = m; combo = q.combo; } }
    const V = M / Math.max(0.1, p.L - e), Vs = (P1 * e) / Math.max(0.1, p.L - e);
    return { axis: b.axis, partner: p.name, partnerKey: p.key, L: p.L, e, b: sec.b, h: sec.h, M, V, factor: P1 > 0 ? (P1 + Vs) / P1 : 1, relief: Vs, combo, R1: P1 + Vs, P1, pull: Vs, ...(p.permanent !== undefined ? { partnerPermanent: p.permanent } : {}), ...(p.beam ? { group: p.beam.group } : {}) };
  });
  return { position: d.edge.anchor[0] && d.edge.anchor[1] ? 'corner' : 'edge', balance: d.edge.balance, anchor: d.edge.anchor, source: d.edge.source, straps, ties: [], columnMoment: 0, unpartnered: [] };
}

function verifications(r: CapAnalysis, a: CapAdopted, c: FootingContext, code: FootingRowCode, fmt: Fmt): CheckLine[] {
  const k = r.result, cr = critOf(c), out: CheckLine[] = [];
  const kn = (v: number) => `${fmt(v, 1)} kN`, mpa = (v: number) => `${fmt(v, 3)} MPa`, cm = (v: number) => `${fmt(v * 100, 1)} cm`, cm2 = (v: number) => `${fmt(v, 2)} cm²`;
  const n = k.piles.length, maxS = Math.max(...k.piles.map((p) => p.service)), minS = Math.min(...k.piles.map((p) => p.service));
  out.push(check(k.source === 'strata' ? 'rcSheets.v.pileStrata' : k.source === 'layers' ? 'rcSheets.v.pileLayers' : 'rcSheets.v.pilePresumed', k.beyond === undefined, { demand: `Ø${fmt(k.diameter * 100, 0)} · L = ${fmt(k.length, 1)} m (−${fmt(k.head, 2)} … −${fmt(k.head + k.length, 2)} m) · Qadm = ${kn(k.capacity)}`, ...(k.beyond !== undefined ? { capacity: `≤ −${fmt(k.beyond, 2)} m` } : {}) }));
  out.push(check('rcSheets.v.pileLoad', maxS <= k.capacity + 1e-6, { clause: '§13.4.1.1', demand: kn(maxS), capacity: kn(k.capacity), ratio: ratioOf(maxS, k.capacity) }));
  out.push(check('rcSheets.v.pileUplift', minS >= -1e-6 && r.leastFactored >= -1e-6, { clause: '§13.4.1.1', demand: `${kn(minS)} · ${kn(r.leastFactored)}`, capacity: '≥ 0 kN' }));
  if (r.unheld > PILE_UNHELD_TOL) out.push(check('rcSheets.v.pileLine', false, { clause: CRITERION, demand: `${fmt(r.unheld, 1)} kN·m`, capacity: '0 kN·m' }));
  if (r.tieAsked) out.push(check('rcSheets.v.capTieOnPiles', true, { clause: CRITERION }));
  out.push(check('rcSheets.v.pileGroup', k.group.service <= k.group.capacity + 1e-6, { clause: CRITERION, demand: kn(k.group.service), capacity: `${fmt(k.efficiency, 2)}·${n}·${kn(k.capacity)} = ${kn(k.group.capacity)}`, ratio: ratioOf(k.group.service, k.group.capacity) }));
  const gap = n > 1 ? Math.min(...a.piles.at.flatMap((p, i) => a.piles.at.slice(i + 1).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))) : Infinity;
  out.push(check('rcSheets.v.pileSpacing', n >= cr.footingPileMinCount && gap >= cr.footingPileSpacing * k.diameter - 2e-3, { clause: CRITERION, demand: `${n} · ${Number.isFinite(gap) ? cm(gap) : '—'}`, capacity: `≥ ${cr.footingPileMinCount} · ${fmt(cr.footingPileSpacing, 2)}·Ø = ${cm(cr.footingPileSpacing * k.diameter)}` }));
  out.push(check('rcSheets.v.pileSection', k.section.pu <= k.section.phiPn + 1e-6 && k.section.as >= k.section.asMin - 1e-6, { clause: withCriterion('§22.4.2.1, §13.4.3.2'), demand: `${kn(k.section.pu)} · ${cm2(k.section.asMin)}`, capacity: `${kn(k.section.phiPn)} · ${a.piles.bars.count} Ø${a.piles.bars.dia} (${cm2(k.section.as)})`, ratio: ratioOf(k.section.pu, k.section.phiPn) }));
  for (const p of k.punching) out.push(check(p.at.startsWith('P') && !r.cols.some((x) => x.demand.name === p.at) ? 'rcSheets.v.pilePunching' : 'rcSheets.v.footPunching', p.vu <= p.phiVc + 1e-6, { clause: `§13.4.6.7, §22.6 · ${p.at}`, demand: mpa(p.vu), capacity: mpa(p.phiVc), ratio: ratioOf(p.vu, p.phiVc) }));
  for (const s of k.shear) out.push(check(`rcSheets.v.footShear${s.dir.toUpperCase()}`, s.vu <= s.phiVc + 1e-6, { clause: `§13.4.6.5, ${code.oneWayClause}`, demand: kn(s.vu), capacity: kn(s.phiVc), ratio: ratioOf(s.vu, s.phiVc) }));
  if (k.stm) {
    const t = k.stm;
    out.push(check('rcSheets.v.capStmAngle', t.theta >= 25 - 1e-9, { clause: '§23.2.7', demand: `θ = ${fmt(t.theta, 1)}°`, capacity: '≥ 25°' }));
    out.push(check('rcSheets.v.capStmNodeColumn', t.node.column <= t.node.columnCap + 1e-6, { clause: '§23.9.1', demand: kn(t.node.column), capacity: kn(t.node.columnCap), ratio: ratioOf(t.node.column, t.node.columnCap) }));
    out.push(check('rcSheets.v.capStmNodePile', t.node.pile <= t.node.pileCap + 1e-6, { clause: '§23.4.3, §23.9.1', demand: kn(t.node.pile), capacity: kn(t.node.pileCap), ratio: ratioOf(t.node.pile, t.node.pileCap) }));
  }
  for (const x of [r.x, r.y]) {
    const X = x.dir.toUpperCase(), m = x.dir === 'x' ? a.x : a.y;
    const tie = k.stm ? (x.dir === 'x' ? k.stm.asx : k.stm.asy) : 0;
    const held = k.stm ? k.stm.tie[x.dir] : 0;
    out.push(check(k.stm ? `rcSheets.v.capStmTie${X}` : `rcSheets.v.footFlexure${X}`, k.stm ? held >= tie - 1e-6 : x.mu <= x.phiMn + 1e-6, k.stm ? { clause: k.stm.banded[x.dir] ? withCriterion('§23.7, §23.8') : '§23.7', demand: cm2(tie), capacity: cm2(held), ratio: ratioOf(tie, held) } : { clause: '§13.2.7.1', demand: `${fmt(x.mu, 1)} kN·m`, capacity: `${fmt(x.phiMn, 1)} kN·m`, ratio: ratioOf(x.mu, x.phiMn) }));
    if (k.stm?.banded[x.dir] && tie > 1e-9) out.push(check(`rcSheets.v.capSecondary${X}`, k.stm.mesh[x.dir] >= CAP_SECONDARY * tie - 1e-6, { clause: CRITERION, demand: `${fmt(CAP_SECONDARY, 2)} · ${cm2(tie)} = ${cm2(CAP_SECONDARY * tie)}`, capacity: cm2(k.stm.mesh[x.dir]), ratio: ratioOf(CAP_SECONDARY * tie, k.stm.mesh[x.dir]) }));
    out.push(check(`rcSheets.v.footMin${X}`, x.asProvided >= x.asMin - 1e-6, { clause: '§8.6.1.1', demand: cm2(x.asMin), capacity: cm2(x.asProvided) }));
    out.push(check(`rcSheets.v.footSpacing${X}`, m.spacing <= Math.min(0.45, cr.footingMaxSpacing) + 1e-9, { clause: spacingClause(cr.footingMaxSpacing, a.h), demand: cm(m.spacing), capacity: `≤ ${cm(Math.min(0.45, cr.footingMaxSpacing))}` }));
    if ((x as { mTop?: number }).mTop! > 1e-6 && !k.stm) out.push(check(`rcSheets.v.capTop${X}`, true, { clause: '§13.2.7.1', demand: `${fmt((x as { mTop?: number }).mTop!, 1)} kN·m` }));
  }
  const dMin = Math.min(r.layers.dx, r.layers.dy);
  out.push(check('rcSheets.v.footMinD', dMin >= 0.3 - 1e-9, { clause: '§13.4.6.2', demand: cm(dMin), capacity: '≥ 30,0 cm' }));
  out.push(check('rcSheets.v.footBearingStrength', r.bearing.pu <= r.bearing.phiBn + 1e-6 || (!!r.dowels && r.dowels.area >= r.dowels.required - 1e-6), { clause: '§22.8', demand: kn(r.bearing.pu), capacity: kn(r.bearing.phiBn), ratio: ratioOf(r.bearing.pu, r.bearing.phiBn) }));
  if (r.dowels) {
    out.push(check('rcSheets.v.footDowelArea', r.dowels.area >= r.dowels.required - 1e-6, { clause: '§16.3.4.1', demand: cm2(r.dowels.required), capacity: `${r.dowels.count} Ø${r.dowels.dia} (${cm2(r.dowels.area)})` }));
    const need = Math.max(r.dowels.ldc, r.dowels.ldh);
    out.push(check('rcSheets.v.footDowelAnchor', need <= r.dowels.available + 1e-9, { clause: code.anchorage?.clause.compression ?? '', demand: `ldc ${cm(need)}`, capacity: cm(r.dowels.available) }));
  }
  if (k.tie) out.push(check('rcSheets.v.capTie', true, { clause: withCriterion('§18.13.3'), demand: `T = ${kn(k.tie.force)}`, capacity: `As ≥ ${cm2(k.tie.as)}` }));
  return out;
}

function steps(r: CapAnalysis, a: CapAdopted, fmt: Fmt, reached: boolean | null, edge?: FootingEdgeResult): StepGroup[] {
  const k = r.result, cm = (v: number) => fmt(v * 100, 0);
  const size: Step[] = [
    { label: 'rcSheets.s.pileSpec', formula: 'Ø · L · Qadm · E', value: `${cm(k.diameter)} cm · ${fmt(k.length, 1)} m · ${fmt(k.capacity, 0)} kN · ${fmt(k.efficiency, 2)}` },
    { label: 'rcSheets.s.pileLoads', formula: 'Pi = ΣN/n ± Σ(N·e + w)·xi/Σx²', value: `${k.piles.length} × ${fmt(Math.min(...k.piles.map((p) => p.service)), 0)}…${fmt(Math.max(...k.piles.map((p) => p.service)), 0)} kN` },
    { label: 'rcSheets.s.footSize', formula: 'B × L × h', value: `${cm(a.B)} × ${cm(a.L)} × ${cm(a.h)} cm`, ...(reached !== null ? { ok: reached } : {}) },
    { label: 'rcSheets.s.footGroupMesh', formula: 'X · Y', value: `${meshText(a.x)} · ${meshText(a.y)}` },
    { label: 'rcSheets.s.pileBars', formula: 'Pu ≤ 0,65·0,80·Po', value: `${a.piles.bars.count} Ø${a.piles.bars.dia} · eØ${a.piles.hoop.dia} c/${cm(a.piles.hoop.spacing)} · ${fmt(k.section.pu, 0)} ≤ ${fmt(k.section.phiPn, 0)} kN` },
  ];
  const shear: Step[] = [
    ...k.punching.map((p) => ({ label: 'rcSheets.s.footPunchVc', formula: `${p.at} (§13.4.6.7)`, value: `${fmt(p.vu, 3)} ≤ ${fmt(p.phiVc, 3)} MPa`, ok: p.vu <= p.phiVc + 1e-6 })),
    ...k.shear.map((s) => ({ label: `rcSheets.s.footVu${s.dir.toUpperCase()}`, formula: `d · ${fmt(s.at, 2)} m`, value: `${fmt(s.vu, 1)} ≤ ${fmt(s.phiVc, 1)} kN`, ok: s.vu <= s.phiVc + 1e-6 })),
    ...(k.stm ? [{ label: 'rcSheets.s.capStm', formula: 'T = Σ Ri·xi/z · θ', value: `z = ${cm(k.stm.z)} cm · θ = ${fmt(k.stm.theta, 1)}° · Tx ${fmt(k.stm.tx, 0)} · Ty ${fmt(k.stm.ty, 0)} kN`, ok: k.stm.theta >= 25 - 1e-9 }] : []),
  ];
  return [
    { title: 'rcSheets.g.pileCap', steps: size },
    { title: 'rcSheets.g.footShear', steps: shear },
    ...(edge ? [{ title: 'rcSheets.g.footEdge', steps: edgeSteps(edge, fmt) }] : []),
  ];
}

/** A pile cap's row: the cap and its piles proposed, or as adopted, read by `analyseCap`. */
export function capRow(d: FootingDemand, c: FootingContext, adopted: FootingAdopted | undefined, fmt: Fmt, code: FootingRowCode): FootingRow | null {
  const prop = adopted?.piles ? null : proposeCap(d, c, code);
  const a = (adopted?.piles ? adopted : prop?.adopted) as CapAdopted | undefined;
  if (!a) return null;
  const r = analyseCap(d, c, a, code);
  const edge = capEdge(d, r, a);
  const v = [...verifications(r, a, c, code, fmt), ...strapPullChecks(edge?.straps ?? [], fmt)];
  const status: RowStatus = v.every((l) => l.ok) ? 'ok' : 'fail';
  const k = r.result;
  const ratios = [...k.punching.map((p) => ratioOf(p.vu, p.phiVc)), ...k.shear.map((s) => ratioOf(s.vu, s.phiVc)), ratioOf(Math.max(...k.piles.map((p) => p.service)), k.capacity), ratioOf(k.section.pu, k.section.phiPn), ratioOf(r.x.mu, r.x.phiMn), ratioOf(r.y.mu, r.y.phiMn)];
  const cover = capCover(c.cover);
  return {
    family: 'footing', key: d.key, name: d.carried ? `${d.name} + ${d.carried.name}` : d.name, level: d.level, demand: d,
    B: a.B, L: a.L, h: a.h, ex: a.ex, ey: a.ey, cover, proposed: prop?.adopted ?? a, adopted: a, isAdopted: !!adopted,
    sizing: { mode: c.sizing, reached: prop?.reached ?? !!adopted, from: 'loads' },
    bearing: null, layers: r.layers, x: r.x, y: r.y,
    punching: r.columnPunching, dowels: r.dowels ? { count: r.dowels.count, dia: r.dowels.dia, ldc: Math.max(r.dowels.ldc, r.dowels.ldh), available: r.dowels.available, lap: r.dowels.lap, tension: r.dowels.tension, above: r.dowels.above, offset: r.dowels.offset } : null,
    utilization: Math.max(0, ...ratios.filter(Number.isFinite)), verifications: v,
    combos: { headers: ['N', 'Mx', 'My', 'R max'], rows: r.byCombo.map((q) => { const act = d.combos.find((x) => x.combo === q.combo)!; const R = Math.max(...q.R); return { combo: q.combo, values: [fmt(act.N, 1), fmt(act.Mx, 1), fmt(act.My, 1), fmt(R, 0)], ratio: R / Math.max(k.capacity, 1e-9), ok: true }; }) },
    status, generous: false, steps: steps(r, a, fmt, prop ? prop.reached : null, edge),
    founding: foundingOf(d, a.h), pedestal: pedestalOf(d, a.h), pedestalSection: pedestalSectionOf(d, a.h, c), cap: k, ...(edge ? { edge } : {}),
  };
}

export { PILE_EMBED };
