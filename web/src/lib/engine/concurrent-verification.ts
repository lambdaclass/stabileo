import { checkColumn, prepareElementVerification, verificationCase, amplifiedDemand, type ConcurrentVerificationInput, type ElementVerification, type DemandLocation } from './codes/argentina/cirsoc201';
import { engineRecheckElement } from './codes/argentina/cirsoc201-engine-gate';

export function verifyConcurrentElement(inputs: readonly ConcurrentVerificationInput[]): ElementVerification {
  if (!inputs.length) throw new Error('Concurrent demands are required for verification');
  const first = inputs[0]!;
  const params = { b: first.b, h: first.h, fc: first.fc, fy: first.fy, cover: first.cover, stirrupDia: first.stirrupDia };
  const amplified = inputs.map(amplifiedDemand);
  const column = first.elementType !== 'beam'
    ? checkColumn(params, amplified, { edition: first.edition }) : undefined;
  const fixedColumn = column ? { barCount: column.barCount, barDia: column.barDia } : undefined;
  const prepared = inputs.map(prepareElementVerification);
  const preliminary = prepared.map(verify => verify({ column: fixedColumn }));
  const maxFlexure = preliminary.reduce((a, b) => b.flexure.AsProv > a.flexure.AsProv ? b : a).flexure;
  const maxCompression = preliminary.reduce((a, b) => (b.flexure.AsComp ?? 0) > (a.flexure.AsComp ?? 0) ? b : a).flexure;
  const flexure = { ...maxFlexure, AsComp: maxCompression.AsComp, barCountComp: maxCompression.barCountComp,
    barDiaComp: maxCompression.barDiaComp, barsComp: maxCompression.barsComp, isDoublyReinforced: maxCompression.isDoublyReinforced };
  const shear = { spacing: Math.min(...preliminary.flatMap(v => [v.shear.spacing, v.shearSecondary?.spacing ?? Infinity])),
    legs: Math.max(...preliminary.flatMap(v => [v.shear.stirrupLegs, v.shearSecondary?.stirrupLegs ?? 0])) };
  const checks = inputs.map((i, index) => {
    const v = prepared[index]!({ column: fixedColumn, flexure, shear });
    const d = verificationCase(i);
    return { demand: i.demand.source, verification: engineRecheckElement(v, { edition: i.edition, stirrupDia: i.stirrupDia, NuShear: d.Nu }) };
  });
  type Check = 'flexure' | 'shear' | 'shearSecondary' | 'column' | 'biaxial' | 'torsion';
  const rank = (s: string) => s === 'fail' ? 2 : s === 'warn' ? 1 : 0;
  const worst = (key: Check) => checks.filter(c => c.verification[key] !== undefined).reduce<typeof checks[number] | undefined>((a, b) =>
    !a || rank(b.verification[key]!.status) > rank(a.verification[key]!.status)
      || rank(b.verification[key]!.status) === rank(a.verification[key]!.status)
        && (!Number.isFinite(b.verification[key]!.ratio) || b.verification[key]!.ratio > a.verification[key]!.ratio) ? b : a, undefined);
  const f = worst('flexure')!, s = worst('shear')!, ss = worst('shearSecondary'), c = worst('column'), b = worst('biaxial'), t = worst('torsion');
  const secondarySlender = checks.reduce<typeof checks[number] | undefined>((a, b) => {
    const x = a?.verification.slenderSecondary, y = b.verification.slenderSecondary;
    if (!y) return a;
    if (!x) return b;
    const before = [Number(x.isSlender), x.delta_ns, x.klu_r / x.lambda_lim, x.Mc];
    const after = [Number(y.isSlender), y.delta_ns, y.klu_r / y.lambda_lim, y.Mc];
    for (let i = 0; i < before.length; i++) {
      if (after[i] !== before[i]) return after[i]! > before[i]! ? b : a;
    }
    return a;
  }, undefined);
  const at = (x: typeof checks[number]): DemandLocation => ({ comboId: x.demand.comboId, comboName: x.demand.comboName, stationT: x.demand.stationT, stationX: x.demand.stationX });
  const out: ElementVerification = { ...f.verification, flexure: f.verification.flexure, shear: s.verification.shear,
    shearSecondary: ss?.verification.shearSecondary, column: c?.verification.column, biaxial: b?.verification.biaxial, torsion: t?.verification.torsion,
    Nu: c?.verification.column?.Nu ?? f.verification.Nu, Mu: c?.verification.Mu ?? f.verification.Mu, Vu: s.verification.Vu,
    slender: c?.verification.slender ?? f.verification.slender, slenderSecondary: secondarySlender?.verification.slenderSecondary,
    concurrentChecks: checks,
    governingCombos: { flexure: at(f), shear: at(s), ...(ss ? { shearSecondary: at(ss) } : {}),
      ...(c ? { column: at(c), axial: at(c) } : {}), ...(b ? { biaxial: at(b) } : {}), ...(t ? { torsion: at(t) } : {}) },
    overallStatus: checks.some(c => c.verification.overallStatus === 'fail') ? 'fail'
      : checks.some(c => c.verification.overallStatus === 'warn') ? 'warn' : 'ok',
    diagnostics: checks.flatMap(c => c.verification.diagnostics ?? []),
  };
  const engine = checks.map(c => c.verification.engineRecheck!);
  out.engineRecheck = { ...engine[0]!, unavailable: engine.some(e => e.unavailable),
    disagreements: [...new Set(engine.flatMap(e => e.disagreements))], notRechecked: [...new Set(engine.flatMap(e => e.notRechecked))],
    flexureRatio: f.verification.engineRecheck!.flexureRatio, shearRatio: s.verification.engineRecheck!.shearRatio,
    columnRatio: c?.verification.engineRecheck!.columnRatio, biaxialRatio: b?.verification.engineRecheck!.biaxialRatio };
  if (engine.some(e => e.certified)) {
    const reasons = [...new Set(engine.flatMap(e => e.certified?.reason ? [e.certified.reason] : e.certified ? [] : ['Concurrent certificate unavailable']))];
    out.engineRecheck.certified = {
      ok: engine.every(e => !e.unavailable && !e.disagreements.length && e.certified?.ok === true),
      lower: Math.max(...engine.map(e => e.certified?.lower ?? 0)),
      upper: Math.max(...engine.map(e => e.certified?.upper ?? Infinity)),
      ...(reasons.length ? { reason: reasons.join('; ') } : {}),
    };
  }
  return out;
}
