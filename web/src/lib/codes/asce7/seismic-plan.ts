import { derived, type ProvenancedValue } from '../regulation';
import { combinationLabel, type LoadCombinationSpec } from '../cirsoc101/combinations';
import { msg, round } from '../message';
import { levelLoads } from '../../engine/loads/wind-cases';
import { seismicCases } from '../../engine/loads/seismic-cases';
import { snowWeightByLevel, type LevelMass, type LoadPlanInput, type PlanSink, type SeismicPlanDetail } from '../../engine/loads/load-plan';
import { ADAPTER, codeInput, SEISMIC_DEFAULTS, type Asce7SeismicInput } from './inputs';
import { STORAGE_OCCUPANCIES } from './live-loads';
import {
  IMPORTANCE_SEISMIC, PERIOD_PARAMETERS, REF_SEIS, SYSTEMS, designCategory, distributionExponent, responseCoefficient,
  upperLimitCu, verticalDistribution, type SeismicSystem,
} from './seismic';
import { PSF } from './refs';

export const STORAGE_SHARE = 0.25;
export const PARTITION_MIN_KNM2 = 10 * PSF;
export const SNOW_IN_W_LIMIT_KNM2 = 30 * PSF;
export const ACCIDENTAL = 0.05;

export interface Asce7Detail extends SeismicPlanDetail {
  asce7: { sds: number; sd1: number; ie: number; rho: number; cd: number; omega0: number; sdc: string; k: number; cs: number };
}

type Result = { seismicWeight: ProvenancedValue<number> | undefined; baseShear: ProvenancedValue<number> | undefined; seismicDetail: SeismicPlanDetail | undefined };

export function planAsce7Seismic(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): Result {
  const none: Result = { seismicWeight: undefined, baseShear: undefined, seismicDetail: undefined };
  if (!input.seismic?.enabled) return none;
  const ci = codeInput<Asce7SeismicInput>(input, ADAPTER.seismic);
  const { blockedKeys, derivation, refs, unsupportedKeys, cases, nodal } = sink;
  const mce = (ci.spectrum ?? SEISMIC_DEFAULTS.spectrum) === 'mce';
  const sds = mce ? (ci.sms !== undefined ? (2 / 3) * ci.sms : undefined) : ci.sds;
  const sd1 = mce ? (ci.sm1 !== undefined ? (2 / 3) * ci.sm1 : undefined) : ci.sd1;
  if (sds === undefined || sd1 === undefined || !(sds >= 0) || !(sd1 >= 0)) { blockedKeys.push(msg('loads.asce7.seismic.blocked.noSpectrum')); return none; }
  if ((ci.siteClass ?? SEISMIC_DEFAULTS.siteClass) === 'F') { blockedKeys.push(msg('loads.asce7.seismic.blocked.siteF')); return none; }
  if (!(ci.tl !== undefined && ci.tl > 0)) { blockedKeys.push(msg('loads.asce7.seismic.blocked.noTl')); return none; }
  const key = ci.systemKey ?? SEISMIC_DEFAULTS.systemKey;
  const sys: SeismicSystem | undefined = key === 'custom'
    ? (ci.r! > 0 && ci.cd! > 0 && ci.omega0! > 0 ? { r: ci.r!, cd: ci.cd!, omega0: ci.omega0! } : undefined)
    : SYSTEMS[key];
  if (!sys) { blockedKeys.push(msg('loads.asce7.seismic.blocked.noSystem', { system: key })); return none; }
  const period = PERIOD_PARAMETERS[ci.periodKey ?? SEISMIC_DEFAULTS.periodKey] ?? PERIOD_PARAMETERS.other!;
  const rc = ci.riskCategory ?? SEISMIC_DEFAULTS.riskCategory;
  const ie = IMPORTANCE_SEISMIC[rc];
  const rho = ci.rho ?? SEISMIC_DEFAULTS.rho;
  const sdc = designCategory(sds, sd1, ci.s1, rc);
  refs.push(REF_SEIS.params, REF_SEIS.sds, REF_SEIS.ie, REF_SEIS.sdc, REF_SEIS.system, REF_SEIS.w, REF_SEIS.cs, REF_SEIS.ta, REF_SEIS.cu, REF_SEIS.ct, REF_SEIS.fx, REF_SEIS.rho);
  derivation.push(msg(mce ? 'loads.asce7.seismic.derivation.mce' : 'loads.asce7.seismic.derivation.design', {
    sms: round(ci.sms ?? 0, 3), sm1: round(ci.sm1 ?? 0, 3), sds: round(sds, 3), sd1: round(sd1, 3), site: ci.siteClass ?? SEISMIC_DEFAULTS.siteClass,
  }));
  derivation.push(msg('loads.asce7.seismic.derivation.category', { rc, ie, sdc, r: sys.r, cd: sys.cd, omega0: sys.omega0, rho }));

  const elevated = levels.filter((l) => l.elevation > 0);
  const share = STORAGE_OCCUPANCIES.has(input.occupancyKey) ? STORAGE_SHARE : 0;
  const top = Math.max(...elevated.map((l) => l.elevation), 0);
  const partition = (input.partitionLive ?? 0) > 0 ? Math.max(ci.partitionKNm2 ?? 0, PARTITION_MIN_KNM2) : 0;
  const snowCase = cases.findIndex((c) => c.type === 'S' && c.nameKey === 'snow.case.balanced');
  const pf = snowCase >= 0 ? Number(cases[snowCase]!.nameParams?.pf ?? 0) : 0;
  const snowByLevel = pf > SNOW_IN_W_LIMIT_KNM2 ? snowWeightByLevel(input.model, sink.distributed, nodal, snowCase, levels.map((l) => l.elevation)) : null;
  for (const lv of elevated) {
    const k = levels.indexOf(lv);
    const parts = (input.roof && Math.abs(lv.elevation - top) < 1e-6 ? 0 : partition) * lv.planAreaM2;
    const snow = snowByLevel ? 0.2 * snowByLevel[k]! : 0;
    // The plan reports these levels: their weight is set to §12.7.2's, not the one the generator weighed them with.
    lv.liveParticipatingKN = share * lv.liveTotalKN;
    lv.weightKN = lv.selfWeightKN + lv.superimposedKN + lv.liveParticipatingKN + parts + snow;
  }
  derivation.push(msg('loads.asce7.seismic.derivation.weight', { share, partition: round(partition, 3), snow: snowByLevel ? 0.2 : 0 }));
  const W = elevated.reduce((s, l) => s + l.weightKN, 0);
  if (!(W > 0)) { unsupportedKeys.push(msg('loadPlan.unsupported.noSeismicMass')); return none; }

  const hn = top;
  const ta = period.ct * Math.pow(hn, period.x);
  const cu = upperLimitCu(sd1);
  const t = ci.computedT !== undefined && ci.computedT > 0 ? Math.min(ci.computedT, cu * ta) : ta;
  derivation.push(msg('loads.asce7.seismic.derivation.period', { ct: period.ct, x: period.x, hn: round(hn, 2), ta: round(ta, 3), cu: round(cu, 3), t: round(t, 3) }));
  const cs = responseCoefficient({ sds, sd1, s1: ci.s1, r: sys.r, ie, t, tl: ci.tl });
  derivation.push(cs.steps);
  const V = cs.cs * W;
  const kExp = distributionExponent(t);
  const forces = verticalDistribution(elevated.map((l) => ({ h: l.elevation, w: l.weightKN })), V, kExp).map((f) => f * rho);
  derivation.push(msg('loads.asce7.seismic.derivation.baseShear', { w: round(W, 1), cs: round(cs.cs, 4), v: round(V, 1), k: round(kExp, 3), rho }));
  if (rho > 1 && 'ABC'.includes(sdc)) unsupportedKeys.push(msg('loads.asce7.seismic.note.rhoLowSdc', { sdc }));
  if (!input.seismic.vertical && sds > 0.125) unsupportedKeys.push(msg('loads.asce7.seismic.note.evOff', { kv: round(0.2 * sds, 4) }));
  unsupportedKeys.push(msg('loads.asce7.seismic.note.notCovered'));

  const dirs = ci.directions ?? SEISMIC_DEFAULTS.directions;
  const torsion = ci.torsion ?? SEISMIC_DEFAULTS.torsion;
  if (torsion) refs.push(REF_SEIS.torsion);
  const orthogonal = (ci.orthogonal ?? SEISMIC_DEFAULTS.orthogonal) && dirs.x && dirs.y;
  if ((ci.orthogonal ?? false) && !orthogonal) unsupportedKeys.push(msg('loads.asce7.seismic.note.orthogonalNeedsBoth'));
  const generated = orthogonal
    ? orthogonalCases(input, elevated, forces, torsion)
    : seismicCases({ nodes: input.model.nodes, levels: elevated, forcesX: forces, forcesY: forces, directions: dirs, torsion: torsion ? 'medium' : 'low' });
  if (orthogonal) refs.push(REF_SEIS.orthogonal);
  for (const c of generated) {
    const index = cases.length;
    cases.push({ existingId: null, type: 'E', nameKey: c.nameKey, nameParams: c.nameParams });
    for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'E', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, ...(n.mz ? { mz: n.mz } : {}) });
  }

  const seismicDetail: Asce7Detail = {
    source: 'manual', c: cs.cs, t, ta, r: sys.r,
    asce7: { sds, sd1, ie, rho, cd: sys.cd, omega0: sys.omega0, sdc, k: kExp, cs: cs.cs },
  };
  return { seismicWeight: derived(W, [REF_SEIS.w], 'kN'), baseShear: derived(V, [REF_SEIS.cs], 'kN'), seismicDetail };
}

type Case = { nameKey: string; nameParams: Record<string, string | number>; nodal: Array<{ nodeId: number; fx: number; fy: number; mz: number }> };

function orthogonalCases(input: LoadPlanInput, levels: LevelMass[], forces: number[], torsion: boolean): Case[] {
  const nodes = input.model.nodes;
  const extent = (ids: number[], k: 'x' | 'y') => { const v = ids.map((id) => nodes.get(id)?.[k] ?? 0); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
  const out: Case[] = [];
  for (const axis of ['X', 'Y'] as const) {
    for (const s of torsion ? [1, -1] : [0]) {
      for (const o of [1, -1]) {
        const nodal = levels.flatMap((lv, k) => {
          const F = forces[k] ?? 0;
          const mt = s * F * ACCIDENTAL * extent(lv.nodeIds, axis === 'X' ? 'y' : 'x');
          const main = levelLoads(nodes, lv.nodeIds, axis === 'X' ? F : 0, axis === 'Y' ? F : 0, mt);
          const other = levelLoads(nodes, lv.nodeIds, axis === 'Y' ? 0.3 * o * F : 0, axis === 'X' ? 0.3 * o * F : 0, 0);
          return main.map((n, i) => ({ nodeId: n.nodeId, fx: n.fx + other[i]!.fx, fy: n.fy + other[i]!.fy, mz: n.mz }));
        });
        const otherDir = `${o > 0 ? '+' : '−'}${axis === 'X' ? 'Y' : 'X'}`;
        out.push(s === 0
          ? { nameKey: 'loads.asce7.case.seismicOrth', nameParams: { dir: axis, other: otherDir }, nodal }
          : { nameKey: 'loads.asce7.case.seismicOrthEcc', nameParams: { dir: axis, other: otherDir, sign: s > 0 ? '+' : '−', e: ACCIDENTAL * 100 }, nodal });
      }
    }
  }
  return out;
}

export function asce7Vertical(combinations: LoadCombinationSpec[], detail: SeismicPlanDetail | undefined, sink: PlanSink): LoadCombinationSpec[] {
  const a = (detail as Asce7Detail | undefined)?.asce7;
  if (!a) return combinations;
  if (a.sds <= 0.125) { sink.derivation.push(msg('loads.asce7.seismic.derivation.evZero', { sds: round(a.sds, 3) })); return combinations; }
  const kv = 0.2 * a.sds;
  sink.refs.push(REF_SEIS.ev);
  sink.derivation.push(msg('loads.asce7.seismic.derivation.ev', { sds: round(a.sds, 3), kv: round(kv, 4) }));
  return combinations.map((c) => {
    const d = c.terms.find((x) => x.symbol === 'D');
    if (!d || !c.terms.some((x) => x.symbol === 'E' && x.factor !== 0) || c.purpose === 'service') return c;
    const sign = c.basic === 7 || (c.basic === undefined && d.factor < 1) ? -1 : 1;
    const terms = c.terms.map((x) => (x.symbol === 'D' ? { ...x, factor: +(x.factor + sign * kv).toFixed(4) } : x));
    return { ...c, terms, label: combinationLabel(terms) };
  });
}
