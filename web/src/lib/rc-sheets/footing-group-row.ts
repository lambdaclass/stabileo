import type { Fmt } from './format';
import { CRITERION, critOf } from './criteria';
import { foundingOf, MIN_D, pedestalOf, spacingClause, type FootingRowCode } from './footing-design';
import { MIN_CONTACT } from './footing-mechanics';
import { meshText } from './footing-mesh';
import { analyseGroup, type GroupAnalysis } from './footing-group';
import { groupPunchingFixes, proposeGroup, proposeGroupBars, proposeGroupDowels } from './footing-group-propose';
import { tieLimits } from './footing-tie-bars';
import { punchingChecks, punchingSteps } from './footing-punching-row';
import { needsLine } from './footing-needs';
import { check, ratioOf, type CheckLine, type RowStatus, type Step, type StepGroup } from './types';
import type { FootingAdopted, FootingContext, FootingDemand, FootingDirection, FootingGroup, FootingRow, GroupResult } from './footing-types';

const stripName = (s: GroupAnalysis['strips'][number]) => `${s.dir.toUpperCase()}: ${s.columns.join('–')}`;

function verifications(d: FootingDemand, g: FootingGroup, r: GroupAnalysis, a: FootingAdopted, c: FootingContext, code: FootingRowCode, fmt: Fmt, needs?: number): CheckLine[] {
  const out: CheckLine[] = [];
  const cr = critOf(c);
  const kn = (v: number) => `${fmt(v, 1)} kN`, knm = (v: number) => `${fmt(v, 1)} kN·m`, cm2 = (v: number) => `${fmt(v, 2)} cm²`, cm = (v: number) => `${fmt(v * 100, 1)} cm`, m = (v: number) => `${fmt(v, 2)} m`;
  out.push(check(`rcSheets.v.footGroup.${g.reason}`, true, { clause: g.reason === 'cover' ? CRITERION : g.kind === 'mat' ? '§13.3.4' : '§13.3.4', demand: g.members.map((x) => x.name).join(', ') }));
  if (d.soil?.presumed) out.push(check('rcSheets.v.footPresumedSoil', true, { demand: `qadm = ${fmt(d.soil.allowable, 0)} kPa` }));
  const b = r.bearing;
  if (!d.soil) out.push(check('rcSheets.v.footNoSoil', false, { clause: '§13.3.1.1' }));
  else if (!b) out.push(check('rcSheets.v.footNoService', false, { clause: '§13.3.1.1' }));
  else {
    out.push(check('rcSheets.v.footBearing', !b.overturns && b.use <= 1 + 1e-9, { clause: '§13.3.1.1, §13.3.4.3', demand: `${fmt(b.qMax, 0)} · ${fmt(b.qMean, 0)} kPa`, capacity: `${fmt(b.edgeFactor * (b.allowable ?? 0), 0)} · ${fmt(b.allowable ?? 0, 0)} kPa`, ratio: b.use }));
    out.push(check('rcSheets.v.footContact', !b.overturns && b.contact >= MIN_CONTACT - 1e-9, { clause: '§13.2.6.1', demand: `${fmt(b.contact * 100, 0)} %`, capacity: `≥ ${fmt(MIN_CONTACT * 100, 0)} %` }));
    if (needs !== undefined && !b.ok) out.push(needsLine(needs, b.allowable ?? 0, fmt));
  }
  for (const s of r.strips) {
    const name = stripName(s);
    out.push(check('rcSheets.v.footStripBottom', s.mBottom <= s.phiMnBottom + 1e-6, { clause: `§13.3.4.1, §13.2.7.1 · ${name}`, demand: `${knm(s.mBottom)} · ${cm2(s.asBottom)}`, capacity: `${knm(s.phiMnBottom)} · ${cm2(s.asBottomProvided)}`, ratio: ratioOf(s.mBottom, s.phiMnBottom) }));
    if (s.mTop > 1e-6) out.push(check('rcSheets.v.footStripTop', s.mTop <= s.phiMnTop + 1e-6, { clause: `§13.3.4.1, §13.2.7.1 · ${name}`, demand: `${knm(s.mTop)} · ${cm2(s.asTop)}`, capacity: `${knm(s.phiMnTop)} · ${cm2(s.asTopProvided)}`, ratio: ratioOf(s.mTop, s.phiMnTop) }));
    out.push(check('rcSheets.v.footStripShear', s.vu <= s.phiVc + 1e-6, { clause: `§13.2.7.2, ${code.oneWayClause} · ${name}`, demand: kn(s.vu), capacity: kn(s.phiVc), ratio: ratioOf(s.vu, s.phiVc) }));
    if (s.rigid === null) out.push(check('rcSheets.v.footRigidUnknown', true, { clause: CRITERION, demand: name }));
    else {
      const k = cr.footingRigidLength;
      out.push(check('rcSheets.v.footRigid', s.rigid || !!s.winkler, { clause: `${CRITERION} · ${name}`, demand: `L = ${m(s.span)} · L'' = ${m(s.overhang)}`, capacity: `≤ ${fmt(k, 2)}·Lo = ${m(k * s.Lo!)} · ${fmt(k / 2, 2)}·Lo = ${m((k / 2) * s.Lo!)}` }));
    }
    if (s.winkler) {
      out.push(check('rcSheets.v.footWinklerSettle', s.winkler.y <= cr.footingWinklerSettlement + 1e-9, { clause: `${CRITERION} · ${name}`, demand: `${fmt(s.winkler.y * 1000, 1)} mm`, capacity: `≤ ${fmt(cr.footingWinklerSettlement * 1000, 1)} mm` }));
      const qa = (d.soil?.allowable ?? 0) * (b?.edgeFactor ?? 1);
      out.push(check('rcSheets.v.footWinklerPressure', s.winkler.q <= qa + 1e-6, { clause: `§13.3.1.1 · ${name}`, demand: `${fmt(s.winkler.q, 0)} kPa`, capacity: `≤ ${fmt(qa, 0)} kPa`, ratio: s.winkler.q / Math.max(qa, 1e-9) }));
    }
  }
  const T = g.axis === 'x' ? 'Y' : 'X';
  for (const k of r.bands) {
    out.push(check(`rcSheets.v.footBand${T}`, k.mu <= k.phiMn + 1e-6 && k.asProvided >= k.asReq - 1e-6, { clause: `§13.3.4 · ${k.column}`, demand: `${knm(k.mu)} · ${cm2(k.asReq)}`, capacity: `${knm(k.phiMn)} · ${cm2(k.asProvided)}`, ratio: ratioOf(k.mu, k.phiMn) }));
    out.push(check(`rcSheets.v.footShear${T}`, k.vu <= k.phiVc + 1e-6, { clause: `§13.2.7.2, ${code.oneWayClause} · ${k.column}`, demand: kn(k.vu), capacity: kn(k.phiVc), ratio: ratioOf(k.vu, k.phiVc) }));
  }
  for (const dir of ['x', 'y'] as const) {
    const X = dir.toUpperCase(), need = dir === 'x' ? r.minSteel.x : r.minSteel.y, has = dir === 'x' ? r.minSteel.xProvided : r.minSteel.yProvided;
    out.push(check(`rcSheets.v.footMin${X}`, has >= need - 1e-6, { clause: g.kind === 'mat' ? '§8.6.1.1, §13.3.4.4' : '§8.6.1.1', demand: cm2(need), capacity: cm2(has) }));
    const s = Math.max(a[dir].spacing, a.tops?.[dir]?.spacing ?? 0);
    out.push(check(`rcSheets.v.footSpacing${X}`, s <= r.sMax + 1e-9, { clause: spacingClause(r.sMax, a.h), demand: cm(s), capacity: `≤ ${cm(r.sMax)}` }));
  }
  out.push(check('rcSheets.v.footGroupAnchor', r.anchorage.ok, { clause: `§13.2.8, ${code.anchorage?.clause.hooked ?? ''}`, demand: `ldh ${cm(r.anchorage.ld)}`, capacity: cm(r.anchorage.available) }));
  out.push(...punchingChecks(r.columns, fmt));
  for (const k of r.columns) {
    const dw = k.dowels;
    out.push(check('rcSheets.v.footBearingStrength', k.bearing.pu <= k.bearing.phiBn + 1e-6 || (!!dw && dw.area >= dw.required - 1e-6), { clause: `§22.8 · ${k.name}`, demand: kn(k.bearing.pu), capacity: kn(k.bearing.phiBn), ratio: ratioOf(k.bearing.pu, k.bearing.phiBn) }));
    if (dw) {
      out.push(check('rcSheets.v.footDowelArea', dw.area >= dw.required - 1e-6, { clause: `§16.3.4.1 · ${k.name}`, demand: cm2(dw.required), capacity: `${dw.count} Ø${dw.dia} (${cm2(dw.area)})` }));
      const need = Math.max(dw.ldc, dw.ldh);
      out.push(check('rcSheets.v.footDowelAnchor', need <= dw.available + 1e-9, { clause: `${code.anchorage?.clause.compression ?? ''} · ${k.name}`, demand: `${dw.tension && dw.ldh > dw.ldc ? 'ldh' : 'ldc'} ${cm(need)}`, capacity: cm(dw.available) }));
    } else if (code.anchorage) out.push(check('rcSheets.v.footDowelArea', false, { clause: `§16.3.4.1 · ${k.name}` }));
  }
  const thin = r.columns.filter((k) => k.punching && !k.punching.fix && k.punching.utilization > 1 + 1e-6 && k.punching.position !== 'interior');
  if (thin.length) out.push(check('rcSheets.v.footCapital', true, { demand: thin.map((k) => k.name).join(', ') }));
  const lim = tieLimits(critOf(c));
  for (const t of r.ties) {
    out.push(
      check('rcSheets.v.footTie', t.asProvided >= t.asReq - 1e-6, { clause: `${CRITERION} · ${t.column}`, demand: `Tu = ${kn(t.Tu)} · ${cm2(t.asReq)}`, capacity: `${t.count} Ø${t.dia} (${cm2(t.asProvided)})`, ratio: ratioOf(t.asReq, t.asProvided) }),
      check('rcSheets.v.footTieLoad', t.Ns <= lim.maxNs + 1e-6, { clause: `${CRITERION} · ${t.column}`, demand: `Ns = ${fmt(t.Ns, 0)} kN`, capacity: `≤ ${fmt(lim.maxNs, 0)} kN`, ratio: t.Ns / lim.maxNs }),
      check('rcSheets.v.footTieArm', t.H >= lim.minH - 1e-9, { clause: `${CRITERION} · ${t.column}`, demand: `H = ${m(t.H)}`, capacity: `≥ ${m(lim.minH)}` }),
      check('rcSheets.v.footTieOffset', t.e <= lim.maxE * t.H + 1e-9, { clause: `${CRITERION} · ${t.column}`, demand: `e = ${m(t.e)}`, capacity: `≤ ${m(lim.maxE * t.H)}`, ratio: t.e / (lim.maxE * t.H) }),
      check('rcSheets.v.footTieSlide', t.mu * t.Ns >= lim.slide * t.Ts - 1e-6, { clause: `${CRITERION} · ${t.column}`, demand: `${fmt(lim.slide, 1)}·Ts = ${kn(lim.slide * t.Ts)}`, capacity: `μ·Ns = ${kn(t.mu * t.Ns)}`, ratio: (lim.slide * t.Ts) / Math.max(t.mu * t.Ns, 1e-9) }),
    );
  }
  const dMin = Math.min(r.layers.dx, r.layers.dy);
  out.push(check('rcSheets.v.footMinD', dMin >= MIN_D - 1e-9, { clause: '§13.3.1.2', demand: cm(dMin), capacity: `≥ ${cm(MIN_D)}` }));
  return out;
}

function steps(d: FootingDemand, g: FootingGroup, r: GroupAnalysis, a: FootingAdopted, code: FootingRowCode, fmt: Fmt, reached: boolean | null): StepGroup[] {
  const cm = (v: number) => fmt(v * 100, 0);
  const b = r.bearing;
  const N = r.columns.reduce((s, k) => s + k.N, 0);
  const size: Step[] = [
    { label: `rcSheets.footKind.${g.kind}`, formula: g.members.map((x) => x.name).join(' · '), value: `ΣN = ${fmt(N, 1)} kN` },
    { label: 'rcSheets.s.footSize', formula: 'B × L × h', value: `${cm(a.B)} × ${cm(a.L)} × ${cm(a.h)} cm`, ...(reached !== null ? { ok: reached } : {}) },
    { label: 'rcSheets.s.footFounding', formula: 'z', value: `${fmt(foundingOf(d, a.h), 2)} m` },
    ...(b ? [{ label: 'rcSheets.s.footPressure', formula: 'qmáx · qmín · qmed', value: `${fmt(b.qMax, 0)} · ${fmt(b.qMin, 0)} · ${fmt(b.qMean, 0)} kPa`, ok: b.ok }] : []),
    { label: 'rcSheets.s.footGroupMesh', formula: 'X · Y', value: `${meshText(a.x)} · ${meshText(a.y)}${a.tops ? ` / ${a.tops.x ? meshText(a.tops.x) : '—'} · ${a.tops.y ? meshText(a.tops.y) : '—'}` : ''}` },
  ];
  const strips: Step[] = r.strips.flatMap((s): Step[] => [
    { label: 'rcSheets.s.footStrip', formula: `${stripName(s)} · b = ${cm(s.width)} cm`, value: `Mu+ ${fmt(s.mBottom, 1)} · Mu− ${fmt(s.mTop, 1)} kN·m → ${fmt(s.asBottom, 2)} · ${fmt(s.asTop, 2)} cm²`, ok: s.mBottom <= s.phiMnBottom + 1e-6 && s.mTop <= s.phiMnTop + 1e-6 },
    { label: `rcSheets.s.footVu${s.dir.toUpperCase()}`, formula: `${code.oneWayFormula} (${code.oneWayClause})`, value: `${fmt(s.vu, 1)} ≤ ${fmt(s.phiVc, 1)} kN`, ok: s.vu <= s.phiVc + 1e-6 },
    ...(s.Lo !== null ? [{ label: 'rcSheets.s.footRigid', formula: 'Lo = (4·E·I/(b·ks))^¼', value: `Lo = ${fmt(s.Lo, 2)} m · L = ${fmt(s.span, 2)} m${s.winkler ? ` · Winkler: y = ${fmt(s.winkler.y * 1000, 1)} mm, q = ${fmt(s.winkler.q, 0)} kPa` : ''}`, ok: s.rigid || !!s.winkler }] : []),
  ]);
  const punch: Step[] = punchingSteps(r.columns, fmt);
  const ties: Step[] = [
    ...r.ties.map((t) => ({ label: 'rcSheets.s.footTieT', formula: `${t.column}: Tu = (Pu·e + |w|)/H`, value: `${fmt(t.Tu, 1)} kN (H = ${fmt(t.H, 2)} m) → ${t.count} Ø${t.dia}`, ok: t.asProvided >= t.asReq - 1e-6 })),
    ...r.straps.flatMap((t): Step[] => [
      { label: 'rcSheets.s.footStrapGeom', formula: `${t.column} → ${t.partner}: e · L`, value: `${cm(t.e)} · ${cm(t.L)} cm` },
      { label: 'rcSheets.s.footStrapV', formula: 'V = (P1·e + |w|)/(L − e)', value: `${fmt(t.V, 1)} kN${t.combo ? ` (${t.combo})` : ''}` },
      { label: 'rcSheets.s.footStrapM', formula: 'M = P1·e + |w|', value: `${fmt(t.M, 1)} kN·m` },
      { label: 'rcSheets.s.footStrapR1', formula: 'R1 = P1 + V', value: `${fmt(t.P1, 1)} → ${fmt(t.R1, 1)} kN (×${fmt(t.factor, 3)})` },
      { label: 'rcSheets.s.footStrapSection', formula: 'h ≥ máx(L/8; hbase + 10 cm; 40 cm)', value: `${cm(t.b)} × ${cm(t.h)} cm` },
    ]),
  ];
  return [
    { title: 'rcSheets.g.footGroup', steps: size },
    { title: 'rcSheets.g.footGroupStrips', steps: strips },
    { title: 'rcSheets.g.footShear', steps: punch },
    ...(ties.length ? [{ title: 'rcSheets.g.footEdge', steps: ties }] : []),
  ];
}

const direction = (dir: 'x' | 'y', r: GroupAnalysis, a: FootingAdopted): FootingDirection => {
  const own = r.strips.filter((s) => s.dir === dir);
  const worst = own.reduce<GroupAnalysis['strips'][number] | null>((w, s) => (!w || s.mBottom / Math.max(s.phiMnBottom, 1e-9) > w.mBottom / Math.max(w.phiMnBottom, 1e-9) ? s : w), null);
  const W = dir === 'x' ? a.L : a.B;
  const minNeed = dir === 'x' ? r.minSteel.x : r.minSteel.y;
  return {
    dir, mu: worst?.mBottom ?? 0, vu: Math.max(0, ...own.map((s) => s.vu)), width: worst?.width ?? W, d: dir === 'x' ? r.layers.dx : r.layers.dy,
    asReq: Math.max(r.need.bottom[dir], minNeed), asMin: minNeed, asProvided: dir === 'x' ? r.minSteel.xProvided : r.minSteel.yProvided,
    phiMn: worst?.phiMnBottom ?? 0, phiVc: Math.min(Infinity, ...own.map((s) => s.phiVc)),
    anchorage: { ld: r.anchorage.ld, available: r.anchorage.available, hooked: true, ok: r.anchorage.ok },
  };
};

/** A base of given size with the stirrups or drops its columns need for punching at its thickness, where they all have one. */
function withFixes(g: FootingGroup, c: FootingContext, a: FootingAdopted, code: FootingRowCode): FootingAdopted {
  if (code.bearingOnly) return a;
  const fixes = groupPunchingFixes(analyseGroup(g, c, a, code), a);
  return fixes && Object.keys(fixes).length ? { ...a, punching: fixes } : a;
}

/** A strip's or a mat's row: its columns on one base read by strips both ways (rigid method, §13.3.4), punching at each column and its dowels. */
export function groupRow(d: FootingDemand, c: FootingContext, adopted: FootingAdopted | undefined, fmt: Fmt, code: FootingRowCode): FootingRow | null {
  const g = d.group!;
  const m = d.footing && d.footing.B > 0 ? d.footing : undefined;
  const prop = adopted || m ? null : proposeGroup(g, c, code);
  const fromModel = m ? { B: m.B, L: m.L, h: m.h, ex: m.ex, ey: m.ey, columns: proposeGroupDowels(g, c) } : null;
  const proposed: FootingAdopted | undefined = prop?.adopted ?? (fromModel ? withFixes(g, c, { ...fromModel, ...proposeGroupBars(g, c, fromModel, code) }, code) : undefined);
  const a = adopted ?? proposed;
  if (!a) return null;
  const r = analyseGroup(g, c, a, code);
  const v = verifications(d, g, r, a, c, code, fmt, prop?.needs);
  const status: RowStatus = v.every((l) => l.ok) ? 'ok' : 'fail';
  const ratios = [...r.strips.flatMap((s) => [ratioOf(s.mBottom, s.phiMnBottom), ratioOf(s.mTop, s.phiMnTop), ratioOf(s.vu, s.phiVc)]), ...r.columns.map((k) => k.punching?.utilization ?? 0), r.bearing?.use ?? 0, ...r.bands.map((k) => ratioOf(k.mu, k.phiMn))];
  const worstPunch = r.columns.filter((k) => k.punching).sort((p, q) => q.punching!.utilization - p.punching!.utilization)[0];
  const firstDowel = r.columns.find((k) => k.dowels)?.dowels;
  const group: GroupResult = {
    kind: g.kind, ...(g.axis ? { axis: g.axis } : {}), reason: g.reason, members: g.members.map((x) => x.key), columns: r.columns, strips: r.strips, bands: r.bands,
    anchor: [r.columns.some((k) => k.anchor[0] < 0) ? -1 : r.columns.some((k) => k.anchor[0] > 0) ? 1 : 0, r.columns.some((k) => k.anchor[1] < 0) ? -1 : r.columns.some((k) => k.anchor[1] > 0) ? 1 : 0],
    ties: r.ties, straps: r.straps, ks: d.soil?.subgrade ?? null, minSteel: r.minSteel, anchorage: r.anchorage,
  };
  return {
    family: 'footing', key: d.key, name: d.name, level: d.level, demand: d,
    B: a.B, L: a.L, h: a.h, ex: a.ex, ey: a.ey, cover: c.cover, proposed: proposed ?? a, adopted: a, isAdopted: !!adopted,
    sizing: { mode: c.sizing, reached: prop?.reached ?? !!adopted, from: prop ? 'loads' : 'model', ...(prop?.needs !== undefined && !adopted ? { needs: prop.needs } : {}) },
    bearing: r.bearing ? { qMax: r.bearing.qMax, qMin: r.bearing.qMin, qMean: r.bearing.qMean, contact: r.bearing.contact, allowable: r.bearing.allowable, edgeFactor: r.bearing.edgeFactor, weight: r.bearing.weight, ex: r.bearing.ex, ey: r.bearing.ey, overturns: r.bearing.overturns, ok: r.bearing.ok, utilization: r.bearing.use } : null,
    layers: r.layers, x: direction('x', r, a), y: direction('y', r, a),
    punching: worstPunch ? { vu: worstPunch.punching!.vu, phiVc: worstPunch.punching!.phiVc, utilization: worstPunch.punching!.utilization, bo: worstPunch.punching!.bo, position: worstPunch.punching!.position as 'interior' } : null,
    dowels: firstDowel ? { count: firstDowel.count, dia: firstDowel.dia, ldc: Math.max(firstDowel.ldc, firstDowel.ldh), available: firstDowel.available, lap: firstDowel.lap, tension: firstDowel.tension } : null,
    utilization: Math.max(0, ...ratios.filter(Number.isFinite)), verifications: v,
    combos: { headers: ['N', 'Mx', 'My', 'qu,max'], rows: r.combos.map((k) => ({ combo: k.combo, values: [fmt(k.N, 1), fmt(k.mx, 1), fmt(k.my, 1), fmt(k.qMax, 0)], ratio: k.ratio, ok: k.ratio <= 1 + 1e-6 })) },
    status, generous: false, steps: steps(d, g, r, a, code, fmt, prop ? prop.reached : null),
    founding: foundingOf(d, a.h), pedestal: pedestalOf(d, a.h), group,
  };
}
