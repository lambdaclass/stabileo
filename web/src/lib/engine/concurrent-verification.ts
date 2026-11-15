import { copyVerificationCheck } from './verification-steps';
import { withBiaxialCapacityCache } from './station-design-forces';
import { verificationForElement } from './element-verification-copy';
import { sharedTorsionReinforcement, checkColumn, prepareElementVerification, verificationCase, amplifiedDemand, type ConcurrentVerificationInput, type ElementVerification, type DemandLocation } from './codes/argentina/cirsoc201';
import { engineRecheckElement } from './codes/argentina/cirsoc201-engine-gate';

function completeCaseKeys(): (input: ConcurrentVerificationInput) => string | undefined {
  let keys: string[] = [];
  let sorted: string[] = [];
  let shape = '';
  return input => {
    const fields = verificationCase(input);
    const current = Object.keys(fields).filter(key => key !== 'demand');
    if (keys.length !== current.length || keys.some((key, index) => key !== current[index])) {
      keys = current;
      sorted = [...current].sort();
      shape = JSON.stringify(sorted);
    }
    const values: unknown[] = [];
    for (const key of sorted) {
      const value = (fields as unknown as Record<string, unknown>)[key];
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) return undefined;
        values.push(Object.is(value, -0) ? { negativeZero: true } : value);
      } else if (value === undefined || typeof value === 'string' || typeof value === 'boolean') values.push(value ?? null);
      else return undefined;
    }
    return shape + JSON.stringify(values);
  };
}

export function verifyConcurrentElement(inputs: readonly ConcurrentVerificationInput[]): ElementVerification {
  return withBiaxialCapacityCache(() => verifyConcurrentCases(inputs));
}

function verifyConcurrentCases(inputs: readonly ConcurrentVerificationInput[]): ElementVerification {
  if (!inputs.length) throw new Error('Concurrent demands are required for verification');
  const first = inputs[0]!;
  const params = { b: first.b, h: first.h, fc: first.fc, fy: first.fy, cover: first.cover, stirrupDia: first.stirrupDia };
  const unique: ConcurrentVerificationInput[] = [];
  const cases = new Map<string, number>();
  const caseKey = completeCaseKeys();
  const indices = inputs.map(input => {
    const key = caseKey(input);
    const previous = key === undefined ? undefined : cases.get(key);
    if (previous !== undefined) return previous;
    const index = unique.push(input) - 1;
    if (key !== undefined) cases.set(key, index);
    return index;
  });
  const amplified = unique.map(amplifiedDemand);
  const column = first.elementType !== 'beam'
    ? checkColumn(params, amplified, { edition: first.edition }) : undefined;
  const fixedColumn = column ? { barCount: column.barCount, barDia: column.barDia } : undefined;
  const prepared = unique.map(prepareElementVerification);
  const initial = prepared.map(verify => verify({ column: fixedColumn }));
  const preliminary = indices.map(index => initial[index]!);
  const maxFlexure = preliminary.reduce((a, b) => b.flexure.AsProv > a.flexure.AsProv ? b : a).flexure;
  const maxCompression = preliminary.reduce((a, b) => (b.flexure.AsComp ?? 0) > (a.flexure.AsComp ?? 0) ? b : a).flexure;
  const flexure = Object.assign(copyVerificationCheck(maxFlexure), { AsComp: maxCompression.AsComp, barCountComp: maxCompression.barCountComp,
    barDiaComp: maxCompression.barDiaComp, barsComp: maxCompression.barsComp, isDoublyReinforced: maxCompression.isDoublyReinforced });
  const { shear, requirements } = sharedTorsionReinforcement(params, preliminary);
  const fixed = prepared.map(verify => verify({ column: fixedColumn, flexure, shear }));
  const used = new Set<number>();
  const checked = new Map<number, ElementVerification>();
  const checks = inputs.map((i, index) => {
    const position = indices[index]!;
    const value = fixed[position]!;
    const v = checked.has(position) ? undefined : used.has(position) ? verificationForElement(value, i.elementId) : value;
    used.add(position);
    const previous = checked.get(position);
    const d = verificationCase(i);
    const verification = previous ? verificationForElement(previous, i.elementId)
      : engineRecheckElement(v!, { edition: i.edition, stirrupDia: i.stirrupDia, NuShear: d.Nu });
    const recheck = verification.engineRecheck;
    if (!previous && recheck && !recheck.unavailable && recheck.disagreements.length === 0
      && (!recheck.certified || recheck.certified.ok || recheck.certified.reason === 'Longitudinal torsion reinforcement not checked')) checked.set(position, verification);
    return { demand: i.demand.source, verification };
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
  const torsionSteel = requirements.index >= 0 ? checks[requirements.index]!.verification.torsion : undefined;
  const at = (x: typeof checks[number]): DemandLocation => ({ comboId: x.demand.comboId, comboName: x.demand.comboName, stationT: x.demand.stationT, stationX: x.demand.stationX });
  const out: ElementVerification = { ...f.verification, flexure: f.verification.flexure, shear: s.verification.shear,
    shearSecondary: ss?.verification.shearSecondary, column: c?.verification.column, biaxial: b?.verification.biaxial, torsion: t?.verification.torsion && { ...t.verification.torsion,
      ratio: Math.max(...checks.map(c => c.verification.torsion?.ratio ?? 0)),
      AtOverS: requirements.AtOverS, AlReq: requirements.AlReq, neglect: requirements.index < 0,
      AtOverSProv: torsionSteel?.AtOverSProv ?? t.verification.torsion.AtOverSProv,
      reinforcementRatio: Math.max(...checks.map(c => c.verification.torsion?.reinforcementRatio ?? 0)),
      steps: [...t.verification.torsion.steps, `Máximos de todas las combinaciones (torsión ${requirements.index < 0 ? 'despreciable' : 'no despreciable'}): At/s,req = ${requirements.AtOverS.toFixed(2)} cm²/m, Al,req = ${requirements.AlReq.toFixed(2)} cm²`] },
    Nu: c?.verification.column?.Nu ?? f.verification.Nu, Mu: c?.verification.Mu ?? f.verification.Mu, Vu: s.verification.Vu,
    slender: c?.verification.slender ?? f.verification.slender, slenderSecondary: secondarySlender?.verification.slenderSecondary,
    concurrentChecks: checks,
    governingCombos: { flexure: at(f), shear: at(s), ...(ss ? { shearSecondary: at(ss) } : {}),
      ...(c ? { column: at(c), axial: at(c) } : {}), ...(b ? { biaxial: at(b) } : {}), ...(t ? { torsion: at(t) } : {}),
      ...(requirements.index >= 0 ? { torsionReinforcement: at(checks[requirements.index]!) } : {}) },
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
