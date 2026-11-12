import { fromProject, type ClauseRef, type ProvenancedValue } from '../regulation';
import { msg, round, type EngineMessage } from '../message';
import type { LoadCombinationSpec } from '../cirsoc101/combinations';
import { combinationLabel } from '../cirsoc101/combinations';
import { snowWeightByLevel, type LevelMass, type LoadPlanInput, type PlanSink, type SeismicPlanDetail } from '../../engine/loads/load-plan';
import { levelLoads } from '../../engine/loads/wind-cases';
import { seismicInputOf, type MassUse, type SoilClass } from './inputs';
import { occupancyUse } from './ts498-loads';
import { TBDY } from './refs';
import {
  IMPORTANCE, MASS_PARTICIPATION, SNOW_IN_MASS, baseShear, designClass, designSpectrum, dtsGroup, empiricalPeriod,
  empiricalPeriodAllowed, equivalentMethodAllowed, findSystem, heightClass, ra, sae, storeyForces, systemRefusal,
  type Dts, type Spectrum, type SystemRow,
} from './tbdy-spectrum';

export interface TbdyDetail {
  spectrum: Spectrum; importance: number; dts: Dts; bys: number; hn: number; n: number; tpa: number;
  byAxis: Partial<Record<'x' | 'y', { t: number; r: number; d: number; ra: number; sae: number; sar: number; vt: number; minimumGoverns: boolean; deltaFN: number; forces: number[] }>>;
}

export type TbdyPlanDetail = SeismicPlanDetail & { tbdy: TbdyDetail };

const ECCENTRICITY = 0.05;
const ORTHOGONAL = 0.3;

type Out = { seismicWeight: ProvenancedValue<number> | undefined; baseShear: ProvenancedValue<number> | undefined; seismicDetail: SeismicPlanDetail | undefined };

function dropCirsocSeismic(sink: PlanSink): void {
  const keep = <T>(list: T[], ok: (x: T) => boolean) => { for (let i = list.length - 1; i >= 0; i--) if (!ok(list[i]!)) list.splice(i, 1); };
  // The generator adds INPRES-CIRSOC 103's snow factor and live participation before this module runs.
  keep(sink.refs, (r: ClauseRef) => !String(r.regulation).startsWith('inpres-cirsoc-103'));
  keep(sink.assumptions, (m: EngineMessage) => m.key !== 'loadPlan.assumption.liveParticipation');
  keep(sink.derivation, (m: EngineMessage) => m.key !== 'loadPlan.derivation.seismicSnow');
}

export function massUseOf(input: LoadPlanInput, given: MassUse | undefined): MassUse {
  return given ?? occupancyUse(input.occupancyKey) ?? 'residential';
}

export function planTbdy(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): Out {
  const out: Out = { seismicWeight: undefined, baseShear: undefined, seismicDetail: undefined };
  if (!input.seismic?.enabled) return out;
  dropCirsocSeismic(sink);
  const ti = seismicInputOf(input.codeInputs);
  const block = (key: string, params?: Record<string, string | number>) => { sink.blockedKeys.push(msg(key, params)); return out; };
  const dirs = ti.directions ?? input.seismic.directions;
  if (!dirs.x && !dirs.y) return block('loads.tr.noDirection');
  if (!(ti.ss! > 0) || !(ti.s1! > 0)) return block('loads.tr.seismic.blocked.spectrum');
  if (ti.soil === 'ZF') return block('loads.tr.seismic.blocked.zf');
  const sysX = findSystem(ti.system), sysY = findSystem(ti.systemY ?? ti.system);
  if (!sysX || !sysY) return block('loads.tr.seismic.blocked.system', { system: (!sysX ? ti.system : ti.systemY) ?? '' });

  const spec = designSpectrum(ti.soil as Exclude<SoilClass, 'ZF'>, ti.ss!, ti.s1!);
  const importance = IMPORTANCE[ti.bks];
  const dts = designClass(spec.sds, ti.bks);
  sink.refs.push(TBDY('2.3.2.2', 'Denk. 2.1'), TBDY('Tablo 2.1'), TBDY('Tablo 2.2'), TBDY('2.3.4.1', 'Denk. 2.2, 2.3'), TBDY('Tablo 3.1'), TBDY('Tablo 3.2'), TBDY('Tablo 3.3'));
  sink.derivation.push(msg('loads.tr.seismic.derivation.spectrum', {
    ss: ti.ss!, s1: ti.s1!, soil: ti.soil, fs: round(spec.fs, 3), f1: round(spec.f1, 3), sds: round(spec.sds, 3), sd1: round(spec.sd1, 3),
    ta: round(spec.ta, 3), tb: round(spec.tb, 3), tl: spec.tl,
  }));

  const base = Math.min(...levels.map((l) => l.elevation));
  const use = massUseOf(input, ti.massUse);
  const n = MASS_PARTICIPATION[use];
  const snowCase = sink.cases.findIndex((c) => c.type === 'S' && !c.pattern);
  const snow = snowWeightByLevel(input.model, sink.distributed, sink.nodal, snowCase, levels.map((l) => l.elevation));
  // The levels the plan reports carry this code's mass, not the fallback participation they came with.
  levels.forEach((l, k) => {
    l.liveParticipatingKN = n * l.liveTotalKN;
    l.weightKN = l.selfWeightKN + l.superimposedKN + l.liveParticipatingKN + SNOW_IN_MASS * snow[k]!;
  });
  const elevated = levels.map((l) => ({ l, w: l.weightKN }))
    .filter((x) => x.l.elevation > base + 1e-6 && x.w > 0);
  const W = elevated.reduce((s, x) => s + x.w, 0);
  if (W <= 0) { sink.unsupportedKeys.push(msg('loadPlan.unsupported.noSeismicMass')); return out; }
  sink.refs.push(TBDY('4.5.9.2', 'Denk. 4.16'), TBDY('Tablo 4.3'));
  const snowKN = snow.reduce((a, b) => a + b, 0);
  sink.derivation.push(msg('loads.tr.seismic.derivation.mass', { use: msg(`loads.tr.seismic.use.${use}`), n, snow: round(snowKN, 1), share: SNOW_IN_MASS, w: round(W, 1) }));
  for (const x of elevated) sink.derivation.push(msg('loads.tr.seismic.derivation.level', { level: round(x.l.elevation, 2), w: round(x.w, 1) }));

  const hn = Math.max(...elevated.map((x) => x.l.elevation)) - base;
  const bys = heightClass(hn, dts);
  sink.derivation.push(msg('loads.tr.seismic.derivation.class', { bks: ti.bks, i: importance, dts, hn: round(hn, 2), bys }));
  if (bys === 1) return block('loads.tr.seismic.blocked.highRise', { hn: round(hn, 2) });
  sink.refs.push(TBDY('Tablo 4.1'), TBDY('4.3.4'));
  for (const s of new Set([sysX, sysY])) {
    const why = systemRefusal(s, dts, bys, elevated.length, hn);
    if (why) return block(`loads.tr.seismic.blocked.${why}`, { system: s.key, dts, bys, min: s.minBys ?? '' });
  }
  const eta = ti.etaBi ?? 1;
  const regular = ti.regular && eta <= 2;
  sink.refs.push(TBDY('Tablo 4.4'));
  if (!equivalentMethodAllowed(dts, bys, regular)) return block('loads.tr.seismic.blocked.method', { dts, bys });

  sink.refs.push(TBDY('4.7.3.4', 'Denk. 4.27'));
  const periodOf = (s: SystemRow): { t: number; tpa: number; capped: boolean; ct: number } | null => {
    const ct = ti.ct ?? s.ct;
    if (ct === null) { block('loads.tr.seismic.blocked.ct', { system: s.key }); return null; }
    const tpa = empiricalPeriod(ct, hn);
    if (ti.tp! > 0) return { t: Math.min(ti.tp!, 1.4 * tpa), tpa, capped: ti.tp! > 1.4 * tpa, ct };
    if (!empiricalPeriodAllowed(dts, bys)) { block('loads.tr.seismic.blocked.period', { dts, bys }); return null; }
    return { t: tpa, tpa, capped: false, ct };
  };

  const needed = ti.orthogonal ? { x: dirs.x || dirs.y, y: dirs.x || dirs.y } : dirs;
  const levelsHW = elevated.map((x) => ({ h: x.l.elevation - base, w: x.w }));
  const byAxis: TbdyDetail['byAxis'] = {};
  let tpaShown = 0;
  for (const axis of ['x', 'y'] as const) {
    if (!needed[axis]) continue;
    const s = axis === 'x' ? sysX : sysY;
    const p = periodOf(s);
    if (!p) return out;
    tpaShown = p.tpa;
    sink.derivation.push(msg(p.capped ? 'loads.tr.seismic.derivation.periodCapped' : ti.tp! > 0 ? 'loads.tr.seismic.derivation.periodGiven' : 'loads.tr.seismic.derivation.period', {
      dir: axis.toUpperCase(), ct: p.ct, hn: round(hn, 2), tpa: round(p.tpa, 3), t: round(p.t, 3),
    }));
    const raT = ra(p.t, s.r, s.d, importance, spec.tb), saeT = sae(p.t, spec), sar = saeT / raT;
    const v = baseShear(W, sar, importance, spec.sds);
    const dist = storeyForces(levelsHW, v.vt);
    byAxis[axis] = { t: p.t, r: s.r, d: s.d, ra: raT, sae: saeT, sar, vt: v.vt, minimumGoverns: v.minimumGoverns, deltaFN: dist.deltaFN, forces: dist.forces };
    sink.derivation.push(msg('loads.tr.seismic.derivation.shear', {
      dir: axis.toUpperCase(), system: s.key, r: s.r, d: s.d, ra: round(raT, 3), sae: round(saeT, 4), sar: round(sar, 4),
      w: round(W, 1), v: round(W * sar, 1), min: round(0.04 * W * importance * spec.sds, 1), vt: round(v.vt, 1),
    }));
    if (v.minimumGoverns) sink.derivation.push(msg('loads.tr.seismic.derivation.minimum', { dir: axis.toUpperCase() }));
    sink.derivation.push(msg('loads.tr.seismic.derivation.deltaFN', { dir: axis.toUpperCase(), n: elevated.length, df: round(dist.deltaFN, 2) }));
    elevated.forEach((x, k) => sink.derivation.push(msg('loads.tr.seismic.derivation.storey', { dir: axis.toUpperCase(), level: round(x.l.elevation, 2), f: round(dist.forces[k]!, 2) })));
  }
  sink.refs.push(TBDY('4.2.1.2', 'Denk. 4.1'), TBDY('4.4.1', 'Denk. 4.8'), TBDY('4.7.1.1', 'Denk. 4.19'), TBDY('4.7.2', 'Denk. 4.21–4.23'));

  const dbi = eta > 1.2 && eta <= 2 ? (eta / 1.2) ** 2 : 1;
  const e = ti.eccentricity ? ECCENTRICITY * dbi : 0;
  if (e > 0) {
    sink.refs.push(TBDY('4.5.10.2', 'Denk. 4.17'), ...(dbi > 1 ? [TBDY('4.7.4', 'Denk. 4.29')] : []));
    sink.derivation.push(msg('loads.tr.seismic.derivation.torsion', { e: round(ECCENTRICITY * 100, 1), dbi: round(dbi, 3) }));
  }
  if (ti.orthogonal) { sink.refs.push(TBDY('4.4.2.1', 'Denk. 4.9')); sink.derivation.push(msg('loads.tr.seismic.derivation.orthogonal')); }

  const extent = (ids: number[], k: 'x' | 'y') => {
    const v = ids.map((id) => input.model.nodes.get(id)?.[k]).filter((c): c is number => c !== undefined);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  for (const axis of ['x', 'y'] as const) {
    if (!dirs[axis]) continue;
    const other = axis === 'x' ? 'y' : 'x';
    const main = byAxis[axis]!.forces, cross = byAxis[other]?.forces;
    const orthoSigns = ti.orthogonal && cross ? [1, -1] : [0];
    for (const s of e > 0 ? [1, -1] : [0]) {
      for (const o of orthoSigns) {
        const index = sink.cases.length;
        sink.cases.push({
          existingId: null, type: 'E', nameKey: 'loads.tr.seismic.case',
          nameParams: { dir: axis.toUpperCase(), ortho: o === 0 ? '' : ` ${o > 0 ? '+' : '−'} 0.3 ${other.toUpperCase()}`, ecc: s === 0 ? '' : ` (${s > 0 ? '+' : '−'}e)` },
        });
        elevated.forEach((x, k) => {
          const fm = main[k] ?? 0, fc = o * ORTHOGONAL * (cross?.[k] ?? 0);
          const lAcross = extent(x.l.nodeIds, other), lAlong = extent(x.l.nodeIds, axis);
          const mt = s * e * (Math.abs(fm) * lAcross + Math.abs(fc) * lAlong);
          const fx = axis === 'x' ? fm : fc, fy = axis === 'y' ? fm : fc;
          for (const nd of levelLoads(input.model.nodes, x.l.nodeIds, fx, fy, mt)) {
            sink.nodal.push({ nodeId: nd.nodeId, caseType: 'E', caseIndex: index, fx: nd.fx, fy: nd.fy, fz: 0, ...(nd.mz ? { mz: nd.mz } : {}) });
          }
        });
      }
    }
  }

  if (dtsGroup(dts) === 1) sink.unsupportedKeys.push(msg('loads.tr.seismic.note.verticalElements'));
  if (input.seismic.modal?.modes.length) sink.unsupportedKeys.push(msg('loads.tr.seismic.note.modalIgnored'));
  sink.unsupportedKeys.push(msg('loads.tr.seismic.note.base'));

  const main = byAxis.x ?? byAxis.y!;
  const tbdy: TbdyDetail = { spectrum: spec, importance, dts, bys, hn, n, tpa: tpaShown, byAxis };
  const detail: TbdyPlanDetail = { source: 'manual', c: main.vt / W, t: main.t, ta: tpaShown, r: main.r, tbdy };
  out.seismicWeight = fromProject(W, 'kN');
  out.baseShear = fromProject(main.vt, 'kN');
  out.seismicDetail = detail;
  sink.derivation.push(msg('loads.tr.seismic.derivation.summary', { w: round(W, 1), vt: round(main.vt, 1), c: round(main.vt / W, 4) }));
  return out;
}

export function tbdyVertical(combinations: LoadCombinationSpec[], detail: SeismicPlanDetail | undefined, sink: PlanSink): LoadCombinationSpec[] {
  const sds = (detail as TbdyPlanDetail | undefined)?.tbdy?.spectrum.sds;
  if (!(sds! > 0)) return combinations;
  const kv = ORTHOGONAL * (2 / 3) * sds!;
  const out = combinations.map((c) => {
    const sign = c.id.startsWith('TBDY-4.11') ? 1 : c.id.startsWith('TBDY-4.12') ? -1 : 0;
    if (sign === 0) return c;
    const terms = c.terms.map((t) => (t.symbol === 'D' ? { ...t, factor: +(t.factor + sign * kv).toFixed(4) } : t));
    return { ...c, id: `${c.id}-Ez`, terms, label: combinationLabel(terms) };
  });
  sink.refs.push(TBDY('4.4.3.2', 'Denk. 4.10'), TBDY('4.4.4.1', 'Denk. 4.11, 4.12'));
  sink.derivation.push(msg('loads.tr.seismic.derivation.vertical', { sds: round(sds!, 3), kv: round(kv, 4) }));
  return out;
}
