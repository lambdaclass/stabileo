import type { WindProject } from '../cirsoc102/wind';
import { derived, type ProvenancedValue } from '../regulation';
import { msg, round } from '../message';
import { windLoadCases, type WindAxis, type WindDirection, type WindLevel } from '../../engine/loads/wind-cases';
import type { LevelMass, LoadPlanInput, PlanSink } from '../../engine/loads/load-plan';
import { ADAPTER, codeInput, WIND_DEFAULTS, type Asce7WindInput } from './inputs';
import { G_RIGID, KD_BUILDING, MIN_WALL_KNM2, REF, designPressure, gcpi, groundElevationKe, kz, velocityPressure, wallCp } from './wind';
import { MPH } from './refs';

export function planAsce7Wind(input: LoadPlanInput, allLevels: LevelMass[], sink: PlanSink): { windQh: ProvenancedValue<number> | undefined } {
  const none = { windQh: undefined };
  if (!input.wind?.enabled) return none;
  const ci = codeInput<Asce7WindInput>(input, ADAPTER.wind);
  const { derivation, refs, unsupportedKeys, blockedKeys, cases, nodal, distributed } = sink;
  if (!(ci.V !== undefined && ci.V > 0)) { blockedKeys.push(msg('loads.asce7.wind.blocked.noSpeed')); return none; }
  if (ci.rigid === false) { blockedKeys.push(msg('loads.asce7.wind.blocked.flexible')); return none; }
  if (input.wind.structure && input.wind.structure.kind !== 'building') { unsupportedKeys.push(msg('loads.asce7.wind.unsupported.otherStructure')); return none; }
  const enclosure = ci.enclosure ?? WIND_DEFAULTS.enclosure;
  if (enclosure === 'open') { unsupportedKeys.push(msg('loads.asce7.wind.unsupported.open')); return none; }

  const region = input.wind.region ? new Set(input.wind.region) : null;
  const modelElevations = allLevels.map((l) => l.elevation);
  const levels = region ? allLevels.map((l) => ({ ...l, nodeIds: l.nodeIds.filter((id) => region.has(id)) })).filter((l) => l.nodeIds.length > 0) : allLevels;
  const pts = [...input.model.nodes.entries()].filter(([id]) => !region || region.has(id)).map(([, n]) => n);
  if (!pts.length) { unsupportedKeys.push(msg('loadPlan.note.windEmptyRegion')); return none; }

  const V = ci.V;
  const exposure = ci.exposure ?? WIND_DEFAULTS.exposure;
  const kzt = ci.kzt ?? WIND_DEFAULTS.kzt;
  const ke = ci.ke ?? (ci.groundElevationM !== undefined ? groundElevationKe(ci.groundElevationM) : 1);
  const w = { V, exposure, kzt, ke };
  // Heights are above the model's lowest level, which is not always at z = 0.
  const base = modelElevations.length ? Math.min(...modelElevations) : 0;
  const h = Math.max(...levels.map((l) => l.elevation - base), 0);
  const xs = pts.map((n) => n.x), ys = pts.map((n) => n.y);
  const bx = Math.max(...xs) - Math.min(...xs), by = Math.max(...ys) - Math.min(...ys);
  const qh = velocityPressure(h, w);
  const gi = gcpi(enclosure);
  const slope = ci.roofSlopeDeg ?? input.wind.roofSlopeDeg ?? 0;
  refs.push(REF.qz, REF.kz, REF.exposure, REF.kd, REF.kzt, REF.ke, REF.g, REF.gcpi, REF.cp, REF.p);
  derivation.push(msg('loads.asce7.wind.derivation.qh', {
    v: round(V, 2), mph: round(V / MPH, 1), exposure, h: round(h, 2), kh: round(kz(h, exposure), 3), kzt: round(kzt, 3), ke: round(ke, 3),
    qh: round(qh, 0), kd: KD_BUILDING, g: G_RIGID, gcpi: gi,
  }));

  const dirs: WindDirection[] = ci.directions ? [...ci.directions] : [...WIND_DEFAULTS.directions];
  const axes: WindAxis[] = [];
  for (const [axis, along, across] of [['x', bx, by], ['y', by, bx]] as const) {
    if (!dirs.some((d) => d.endsWith(axis))) continue;
    const cp = wallCp(Math.max(along, 1e-6) / Math.max(across, 1e-6));
    derivation.push(msg('loads.asce7.wind.derivation.walls', { dir: axis.toUpperCase(), lb: round(along / Math.max(across, 1e-6), 2), cpw: cp.windward, cpl: round(cp.leeward, 3), cps: cp.side }));
    const bandNet = (z0: number, z1: number) => {
      const n = 8, hh = (z1 - z0) / n;
      let mean: number;
      if (z1 <= z0) mean = velocityPressure(z0, w);
      else {
        let sum = velocityPressure(z0, w) + velocityPressure(z1, w);
        for (let k = 1; k < n; k++) sum += (k % 2 ? 4 : 2) * velocityPressure(z0 + k * hh, w);
        mean = (sum * hh) / 3 / (z1 - z0);
      }
      return (designPressure(mean, qh, cp.windward, 0) - designPressure(qh, qh, cp.leeward, 0)) / 1000;
    };
    const elevated = levels.filter((l) => l.elevation > base + 1e-6);
    const windLevels: WindLevel[] = [];
    elevated.forEach((lv, i) => {
      const below = i === 0 ? Math.max(base, ...modelElevations.filter((z) => z < lv.elevation - 1e-6)) : elevated[i - 1]!.elevation;
      const above = i === elevated.length - 1 ? lv.elevation : elevated[i + 1]!.elevation;
      const z0 = (below + lv.elevation) / 2 - base, z1 = (lv.elevation + above) / 2 - base;
      const net = bandNet(z0, z1);
      const force = net * across * (z1 - z0);
      const minimum = MIN_WALL_KNM2 * across * (z1 - z0);
      derivation.push(msg('loadPlan.derivation.windLevel', { dir: axis.toUpperCase(), level: round(lv.elevation, 2), z0: round(z0, 2), z1: round(z1, 2), net: round(net, 3), force: round(force, 1) }));
      if (minimum > force) {
        unsupportedKeys.push(msg('loads.asce7.wind.minimumGoverns', { dir: axis.toUpperCase(), level: round(lv.elevation, 2), min: round(MIN_WALL_KNM2, 3) }));
        if (!refs.includes(REF.min)) refs.push(REF.min);
      }
      windLevels.push({ elevation: lv.elevation, nodeIds: lv.nodeIds, force: Math.max(force, minimum), pressureForce: force });
    });
    const project: WindProject = {
      basicSpeed: V, exposure, siteAltitudeM: ci.groundElevationM ?? 0, kzt, kztSurveyed: kzt !== 1, structureKind: 'building',
      enclosure, meanRoofHeight: Math.max(h, 1), L: Math.max(along, 1), B: Math.max(across, 1), roofSlopeDeg: slope, rigid: true,
    };
    // `wind-cases.ts` reads qh·G·Cp − qh·(GCpi): Kd goes in with qh so its roof loads are Eq. 27.3-1's.
    axes.push({ axis, across, along, levels: windLevels, project, qhNm2: qh * KD_BUILDING, gcpi: gi, G: G_RIGID });
    derivation.push(msg('loadPlan.derivation.wind', { dir: axis.toUpperCase(), qh: round(qh, 0), net: round(bandNet(h, h), 3), front: round(across, 1) }));
  }
  if (!axes.length) { blockedKeys.push(msg('loads.tr.noDirection')); return none; }
  const set = ci.caseSet ?? WIND_DEFAULTS.caseSet;
  const generated = windLoadCases({ model: input.model, axes, set, directions: dirs, tributaryWidth: input.tributaryWidth, speed: round(V, 1) });
  unsupportedKeys.push(...generated.notes.filter((n) => n.key !== 'loadPlan.note.windCases34NeedBothAxes'));
  if (generated.notes.some((n) => n.key === 'loadPlan.note.windCases34NeedBothAxes')) unsupportedKeys.push(msg('loads.asce7.wind.cases34NeedBothAxes'));
  refs.push(REF.cases);
  derivation.push(msg('loads.asce7.wind.derivation.cases', { set, count: generated.cases.length }));
  const inRegion = (id: number) => { const e = input.model.elements.get(id); return !region || (!!e && region.has(e.nodeI) && region.has(e.nodeJ)); };
  for (const c of generated.cases) {
    const index = cases.length;
    cases.push({ existingId: null, type: 'W', nameKey: c.nameKey, nameParams: c.nameParams });
    for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'W', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, mz: n.mz });
    for (const d of c.distributed) if (inRegion(d.elementId)) distributed.push({ elementId: d.elementId, caseType: 'W', caseIndex: index, q: d.q });
  }
  return { windQh: derived(qh, [REF.qz], 'N/m²') };
}
