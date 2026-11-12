import { fromProject, type ProvenancedValue } from '../regulation';
import { msg, round } from '../message';
import { levelLoads } from '../../engine/loads/wind-cases';
import { snowWeightByLevel, type LevelMass, type LoadPlanInput, type PlanSink, type SeismicPlanDetail } from '../../engine/loads/load-plan';
import { EN1990, EN1998_1 } from './refs';
import { SEISMIC_ADAPTER, SEISMIC_DEFAULTS, SNOW_ADAPTER, type EcSeismicInput, type EcSnowInput, type GroundType, type ImportanceClass, type Occupancy, type PeriodSystem } from './inputs';
import { PSI, SNOW_ALTITUDE_LIMIT_M } from './basis';
import { categoryOfOccupancy } from './imposed';
import type { ImposedCategory } from './context';

export interface SpectrumParams { S: number; TB: number; TC: number; TD: number }

export const SPECTRUM: Readonly<Record<1 | 2, Readonly<Record<GroundType, SpectrumParams>>>> = {
  1: {
    A: { S: 1.0, TB: 0.15, TC: 0.4, TD: 2.0 }, B: { S: 1.2, TB: 0.15, TC: 0.5, TD: 2.0 }, C: { S: 1.15, TB: 0.2, TC: 0.6, TD: 2.0 },
    D: { S: 1.35, TB: 0.2, TC: 0.8, TD: 2.0 }, E: { S: 1.4, TB: 0.15, TC: 0.5, TD: 2.0 },
  },
  2: {
    A: { S: 1.0, TB: 0.05, TC: 0.25, TD: 1.2 }, B: { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 }, C: { S: 1.5, TB: 0.1, TC: 0.25, TD: 1.2 },
    D: { S: 1.8, TB: 0.1, TC: 0.3, TD: 1.2 }, E: { S: 1.6, TB: 0.05, TC: 0.25, TD: 1.2 },
  },
};
export const GAMMA_I: Readonly<Record<ImportanceClass, number>> = { I: 0.8, II: 1.0, III: 1.2, IV: 1.4 };
export const CT: Readonly<Record<PeriodSystem, number>> = { steelMrf: 0.085, concreteMrf: 0.075, other: 0.05 };
export const BETA = 0.2;
export const ACCIDENTAL_E = 0.05;
export const AVG_RATIO: Readonly<Record<1 | 2, number>> = { 1: 0.9, 2: 0.45 };

export function designSpectrum(T: number, ag: number, p: SpectrumParams, q: number): number {
  const { S, TB, TC, TD } = p;
  if (T <= TB) return ag * S * (2 / 3 + (T / TB) * (2.5 / q - 2 / 3));
  if (T <= TC) return ag * S * 2.5 / q;
  if (T <= TD) return Math.max(ag * S * 2.5 / q * TC / T, BETA * ag);
  return Math.max(ag * S * 2.5 / q * TC * TD / (T * T), BETA * ag);
}

export const approximatePeriod = (system: PeriodSystem, H: number) => CT[system] * H ** 0.75;
export const correctionLambda = (T1: number, TC: number, storeys: number) => (T1 <= 2 * TC && storeys > 2 ? 0.85 : 1);

export function storeyForces(Fb: number, levels: ReadonlyArray<{ z: number; w: number }>): number[] {
  const sum = levels.reduce((s, l) => s + l.z * l.w, 0);
  return levels.map((l) => (sum > 0 ? Fb * l.z * l.w / sum : 0));
}

export function phiFactor(cat: ImposedCategory | undefined, top: boolean, occupancy: Occupancy): number {
  if (cat === 'A' || cat === 'B' || cat === 'C') return top ? 1 : occupancy === 'correlated' ? 0.8 : 0.5;
  return 1;
}

export function psiE(occupancyKey: string, top: boolean, occupancy: Occupancy): number {
  const cat = categoryOfOccupancy(occupancyKey);
  if (!cat) return 0;
  return phiFactor(cat, top, occupancy) * PSI.eurocode.imposed[cat][2];
}

const NOT_EC = new Set(['loadPlan.assumption.liveParticipation', 'loadPlan.derivation.seismicSnow']);

export function planEcSeismic(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): {
  seismicWeight: ProvenancedValue<number> | undefined; baseShear: ProvenancedValue<number> | undefined; seismicDetail: SeismicPlanDetail | undefined;
} {
  const none = { seismicWeight: undefined, baseShear: undefined, seismicDetail: undefined };
  if (!input.seismic?.enabled) return none;
  const { cases, nodal, derivation, refs, assumptions, unsupportedKeys, blockedKeys } = sink;
  for (const list of [assumptions, derivation]) for (let i = list.length - 1; i >= 0; i--) if (NOT_EC.has(list[i]!.key)) list.splice(i, 1);
  for (let i = refs.length - 1; i >= 0; i--) if (refs[i]!.regulation === 'inpres-cirsoc-103-i') refs.splice(i, 1);

  const ci = { ...SEISMIC_DEFAULTS, ...((input.codeInputs?.[SEISMIC_ADAPTER] ?? {}) as EcSeismicInput) };
  if (!(ci.agR! > 0)) { blockedKeys.push(msg('loads.ec.blocked.agR')); return none; }
  if (!ci.groundType || !SPECTRUM[1][ci.groundType]) { blockedKeys.push(msg('loads.ec.blocked.groundType')); return none; }
  if (!(ci.q! >= 1)) { blockedKeys.push(msg('loads.ec.blocked.q')); return none; }
  const dirs = ci.directions;
  if (!dirs.x && !dirs.y) { unsupportedKeys.push(msg('loads.ec.seismic.noDirection')); return none; }

  const snowCi = (input.codeInputs?.[SNOW_ADAPTER.eurocode] ?? {}) as EcSnowInput;
  const psi2S = (snowCi.altitude ?? 0) > SNOW_ALTITUDE_LIMIT_M ? PSI.eurocode.snowHigh[2] : PSI.eurocode.snowLow[2];
  const balanced = cases.findIndex((c) => c.type === 'S' && c.nameKey === 'loads.ec.snowCase.i');
  const snowByLevel = psi2S > 0 && balanced >= 0 ? snowWeightByLevel(input.model, sink.distributed, sink.nodal, balanced, levels.map((l) => l.elevation)) : levels.map(() => 0);
  const topIndex = levels.reduce((k, l, i) => (l.elevation > levels[k]!.elevation ? i : k), 0);
  levels.forEach((lv, i) => {
    // A roof with its own occupancy brings that occupancy's ψ to the top level; mixed with floors there, the larger one.
    const roofKey = input.roof?.use === 'occupancy' ? input.roof.occupancyKey : undefined;
    const e = Math.max(psiE(input.occupancyKey, i === topIndex, ci.occupancy), i === topIndex && roofKey ? psiE(roofKey, true, ci.occupancy) : 0);
    lv.liveParticipatingKN = e * lv.liveTotalKN;
    lv.weightKN = lv.selfWeightKN + lv.superimposedKN + lv.liveParticipatingKN + psi2S * (snowByLevel[i] ?? 0);
    derivation.push(msg('loads.ec.seismic.level', { elevation: round(lv.elevation, 2), psiE: round(e, 3), live: round(lv.liveTotalKN, 1), weight: round(lv.weightKN, 1) }));
  });
  refs.push(EN1998_1('3.2.4', 'masses, eq. 3.17'), EN1998_1('4.2.4', 'psiE'), EN1998_1('Table 4.2', 'phi'), EN1990('Table A1.1', 'psi2'));

  const base = Math.min(...levels.map((l) => l.elevation));
  const elevated = levels.filter((l) => l.elevation > base && l.weightKN > 0);
  const W = elevated.reduce((s, l) => s + l.weightKN, 0);
  if (!(W > 0)) { unsupportedKeys.push(msg('loadPlan.unsupported.noSeismicMass')); return none; }
  const H = Math.max(...elevated.map((l) => l.elevation)) - base;
  const p = SPECTRUM[ci.spectrumType][ci.groundType];
  const gammaI = ci.gammaI ?? GAMMA_I[ci.importance];
  const ag = gammaI * ci.agR!;
  const typed = ci.t1 !== undefined && ci.t1 > 0;
  const T1 = typed ? ci.t1! : approximatePeriod(ci.periodSystem, H);
  if (!typed && H > 40) unsupportedKeys.push(msg('loads.ec.seismic.periodHeight', { h: round(H, 1) }));
  const limit = Math.min(4 * p.TC, 2);
  if (T1 > limit) { blockedKeys.push(msg('loads.ec.blocked.lateralForceMethod', { t1: round(T1, 3), limit: round(limit, 3) })); return none; }
  assumptions.push(msg('loads.ec.seismic.regularAssumed'));
  const Sd = designSpectrum(T1, ag, p, ci.q!);
  const lambda = correctionLambda(T1, p.TC, elevated.length);
  const Fb = Sd * W * lambda;
  derivation.push(msg('loads.ec.seismic.spectrum', {
    type: ci.spectrumType, ground: ci.groundType, s: p.S, tb: p.TB, tc: p.TC, td: p.TD, agr: round(ci.agR!, 4), gi: gammaI, ag: round(ag, 4), q: ci.q!,
  }));
  derivation.push(typed ? msg('loads.ec.seismic.periodTyped', { t1: round(T1, 3) }) : msg('loads.ec.seismic.period', { t1: round(T1, 3), ct: CT[ci.periodSystem], h: round(H, 2) }));
  derivation.push(msg('loads.ec.seismic.baseShear', { sd: round(Sd, 4), lambda, w: round(W, 1), fb: round(Fb, 1) }));
  derivation.push(msg('loadPlan.derivation.seismic', { weight: round(W, 1), coefficient: round(Fb / W, 4), baseShear: round(Fb, 1) }));
  refs.push(
    EN1998_1('3.1.2', 'ground types, Table 3.1'), EN1998_1(ci.spectrumType === 1 ? 'Table 3.2' : 'Table 3.3', 'spectrum parameters'),
    EN1998_1('3.2.2.5', 'design spectrum'), EN1998_1('4.2.5', 'importance factor'), EN1998_1('4.3.3.2.2', 'base shear, eq. 4.5'),
    EN1998_1('4.3.3.2.3', 'distribution, eq. 4.11'), EN1998_1('4.3.2', 'accidental torsion'), EN1998_1('4.3.3.3.3', 'torsional moments'),
  );
  if (AVG_RATIO[ci.spectrumType] * ag > 0.25) unsupportedKeys.push(msg('loads.ec.seismic.vertical', { avg: round(AVG_RATIO[ci.spectrumType] * ag, 3) }));

  const forces = storeyForces(Fb, elevated.map((l) => ({ z: l.elevation - base, w: l.weightKN })));
  const extent = (ids: number[], k: 'x' | 'y') => {
    const v = ids.map((id) => input.model.nodes.get(id)?.[k]).filter((c): c is number => c !== undefined);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  const both = dirs.x && dirs.y && ci.combine30;
  if (both) refs.push(EN1998_1('4.3.3.5.1(3)', 'combination of components, 0.30'));
  for (const main of ['X', 'Y'] as const) {
    if (!(main === 'X' ? dirs.x : dirs.y)) continue;
    for (const s of [1, -1] as const) {
      for (const t of both ? ([1, -1] as const) : ([0] as const)) {
        const index = cases.length;
        const e = s > 0 ? '+' : '−';
        cases.push(t === 0
          ? { existingId: null, type: 'E', nameKey: 'loads.ec.seismicCase', nameParams: { dir: main, e } }
          : { existingId: null, type: 'E', nameKey: 'loads.ec.seismicCase30', nameParams: { dir: main, e, other: main === 'X' ? 'Y' : 'X', sign: t > 0 ? '+' : '−' } });
        elevated.forEach((lv, k) => {
          const F = forces[k] ?? 0, Fo = 0.3 * Math.abs(t) * F;
          const Fx = main === 'X' ? F : t * Fo, Fy = main === 'Y' ? F : t * Fo;
          const mt = s * ACCIDENTAL_E * (Math.abs(Fx) * extent(lv.nodeIds, 'y') + Math.abs(Fy) * extent(lv.nodeIds, 'x'));
          for (const n of levelLoads(input.model.nodes, lv.nodeIds, Fx, Fy, mt)) nodal.push({ nodeId: n.nodeId, caseType: 'E', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, ...(n.mz ? { mz: n.mz } : {}) });
        });
      }
    }
  }
  derivation.push(msg(both ? 'loads.ec.seismic.cases30' : 'loads.ec.seismic.cases', { e: ACCIDENTAL_E * 100 }));
  return {
    seismicWeight: fromProject(W, 'kN'), baseShear: fromProject(Fb, 'kN'),
    seismicDetail: { source: 'manual', c: Fb / W, t: T1 },
  };
}
