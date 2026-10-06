/**
 * The wind of a load plan: CIRSOC 102-2025 pressures per level and axis, the design cases
 * (§2.4.6), and the service-level Wa cases of B.4.2 when asked. Moved out of `load-plan.ts`
 * as it was; the planner calls it with the lists it appends to.
 */
import {
  applyMinimumWindLoad, computeWindPressures, internalPressureCoefficient, velocityPressure, G_RIGID,
  SERVICE_WIND_FACTOR, type WindProject,
} from '../../codes/cirsoc102/wind';
import { gustEffectFactor, dynamicSensitivity, meanHourlySpeed, equivalentHeight, type GustResult } from '../../codes/cirsoc102/gust';
import { gustInputsFor, isLowRise } from './wind-dynamics';
import { windLoadCases, type WindAxis, type WindLevel } from './wind-cases';
import { otherStructureWind } from './wind-other';
import { REF_FREE_ROOF, REF_SIGN, REF_OTHER, REF_MIN_OTHER } from '../../codes/cirsoc102/other-structures';
import { clause, fromProject, type ProvenancedValue } from '../../codes/regulation';
import { msg, round } from '../../codes/message';
import { windDirectionsOf, type LevelMass, type LoadPlanInput, type PlanSink } from './load-plan';

const R102 = (c: string, l?: string) => clause('cirsoc-102', '2025', c, l);

export function planWind(input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): { windQh: ProvenancedValue<number> | undefined; windGust?: Partial<Record<'x' | 'y', GustResult>> } {
  const { cases, nodal, distributed, derivation, refs, assumptions, unsupportedKeys } = sink;
  const windAxes: WindAxis[] = [];
  let windQh: ProvenancedValue<number> | undefined;
  const windGust: Partial<Record<'x' | 'y', GustResult>> = {};
  if (input.wind?.enabled) {
    const elevations = levels.map((l) => l.elevation);
    const h = Math.max(...elevations, 0);
    const xs = [...input.model.nodes.values()].map((n) => n.x);
    const ys = [...input.model.nodes.values()].map((n) => n.y);
    const bx = Math.max(...xs) - Math.min(...xs);
    const by = Math.max(...ys) - Math.min(...ys);

    /*
     * Each axis's gust effect factor inputs (§1.9): its frequency, by the source the dialog chose,
     * damping and the rigid G. A level's extent along the wind gives L_ef (Eq. 1.9-1).
     */
    const dyn = input.wind.dynamics;
    const lowRise = isLowRise(h, bx, by, input.wind.enclosure, input.wind.structure?.kind);
    const extent = (ids: readonly number[], k: 'x' | 'y') => {
      const v = ids.map((id) => input.model.nodes.get(id)?.[k] ?? 0);
      return v.length ? Math.max(...v) - Math.min(...v) : 0;
    };
    const gustOf = (axis: 'x' | 'y') => gustInputsFor(dyn, axis, h, levels.map((l) => ({ elevation: l.elevation, along: extent(l.nodeIds, axis) })), lowRise);
    const gustReported = new Set<string>();
    if (dyn && !lowRise) {
      // What the generated load does not cover, by the commentary's triggers (C 1.1.2).
      const bMin = Math.min(bx, by);
      const n1s = (['x', 'y'] as const).map((a) => { const g = gustOf(a); return g && !('refused' in g) ? g.n1 : undefined; }).filter((v): v is number => v !== undefined);
      const n1 = n1s.length ? Math.min(...n1s) : undefined;
      unsupportedKeys.push(...dynamicSensitivity({ h, bMin, n1, vBar: meanHourlySpeed(equivalentHeight(h, input.wind.exposure), input.wind.basicSpeed, input.wind.exposure) }));
    }

    /** The wind on each axis at basic speed `speed`; `service` for Wa (no minimum, no derivation). */
    // The directions asked for, any of ±X and ±Y (`windDirectionsOf`); an axis is solved when either sense is.
    const windDirs = windDirectionsOf(input.wind);
    const axesFor = (speed: number, service: boolean): WindAxis[] => {
      const out: WindAxis[] = [];
      for (const [dir, enabled, along, across] of [
        ['x', windDirs.some((d) => d.endsWith('x')), bx, by],
        ['y', windDirs.some((d) => d.endsWith('y')), by, bx],
      ] as const) {
        if (!enabled) continue;
        const project: WindProject = {
          basicSpeed: speed, exposure: input.wind!.exposure,
          siteAltitudeM: input.wind!.siteAltitudeM, kzt: input.wind!.kzt,
          kztSurveyed: input.wind!.kztSurveyed, structureKind: 'building',
          enclosure: input.wind!.enclosure, meanRoofHeight: Math.max(h, 1),
          L: Math.max(along, 1), B: Math.max(across, 1),
          roofSlopeDeg: input.wind!.roofSlopeDeg, rigid: input.wind!.rigid,
        };
        const g = gustOf(dir);
        if (g && 'refused' in g) {
          if (!service) unsupportedKeys.push(g.refused);
          continue;
        }
        if (g) project.gust = g;
        const res = computeWindPressures(project);
        const G = res.factors.G.value;
        if (!service && res.gust && !gustReported.has(dir)) {
          gustReported.add(dir);
          windGust[dir] = res.gust;
          derivation.push(gustLine(dir, res.gust));
        }
        if (!service) {
          refs.push(...res.factors.kd.refs, ...res.factors.kh.refs);
          assumptions.push(...res.assumptions);
          unsupportedKeys.push(...res.unsupported);
        }

        if (res.pressures.length === 0) continue;
        if (!service) windQh = fromProject(res.qhNm2, 'N/m²');

        /*
         * Windward + leeward on each level, distributed over that level's nodes.
         *
         * The windward wall sees q_z, which grows with height (§2.4.1); the leeward wall
         * sees q_h everywhere. The internal pressure acts on both walls and cancels in the
         * net lateral force. This used to take the windward row evaluated at
         * z = min(5 m, h) and apply it at every level, so the upper storeys of anything
         * taller than 5 m got the base's pressure: about 40 % short at the top of a 30 m
         * building in exposure B. Each level's band is now integrated over its own heights.
         */
        const cpWw = res.pressures.find((p) => p.surface === 'windwardWall')?.cp ?? 0;
        const cpLw = res.pressures.find((p) => p.surface === 'leewardWall')?.cp ?? 0;
        const qz = (z: number) => velocityPressure(Math.max(z, 0), project);
        /** Net lateral pressure on the band [z0, z1], averaged over it, kPa. */
        const bandNet = (z0: number, z1: number) => {
          if (z1 <= z0) return (qz(z0) * G * cpWw - res.qhNm2 * G * cpLw) / 1000;
          // Simpson over the band: q_z is smooth in z (a power law of height past 5 m).
          const n = 8, hh = (z1 - z0) / n;
          let sum = qz(z0) + qz(z1);
          for (let k = 1; k < n; k++) sum += (k % 2 ? 4 : 2) * qz(z0 + k * hh);
          const meanQz = (sum * hh / 3) / (z1 - z0);
          return (meanQz * G * cpWw - res.qhNm2 * G * cpLw) / 1000;
        };
        const net = bandNet(h, h);   // kPa, at the roof: what the summary line reports

        const elevated = levels.filter((l) => l.elevation > 0);
        const windLevels: WindLevel[] = [];
        for (let i = 0; i < elevated.length; i++) {
          const lv = elevated[i];
          const below = i === 0 ? 0 : elevated[i - 1].elevation;
          const above = i === elevated.length - 1 ? lv.elevation : elevated[i + 1].elevation;
          // The lower half of the first storey goes straight to the foundation, as before.
          const z0 = (below + lv.elevation) / 2;
          const z1 = (lv.elevation + above) / 2;
          const tribH = z1 - z0;
          const levelNet = bandNet(z0, z1);
          const force = levelNet * across * tribH;
          if (!service) derivation.push(msg('loadPlan.derivation.windLevel', {
            dir: dir.toUpperCase(), level: round(lv.elevation, 2),
            z0: round(z0, 2), z1: round(z1, 2), net: round(levelNet, 3), force: round(force, 1),
          }));
          const min = applyMinimumWindLoad(force * 1000, across * tribH, 0);
          const applied = min.totalN / 1000;
          if (!service && min.governedByMinimum) {
            unsupportedKeys.push(msg('loadPlan.note.windMinimumGoverns', {
              level: round(lv.elevation, 2),
            }));
            refs.push(...min.refs);
          }
          // §2.1.5's minimum is a design load; service wind (Wa) is the pressures alone.
          windLevels.push({ elevation: lv.elevation, nodeIds: lv.nodeIds, force: service ? force : applied, pressureForce: force });
        }
        out.push({
          axis: dir, across, along, levels: windLevels, project, qhNm2: res.qhNm2,
          gcpi: internalPressureCoefficient(input.wind!.enclosure),
          G, ...(res.gust ? { gust: res.gust, eR: dyn?.eR?.[dir] ?? 0 } : {}),
        });
        if (!service) derivation.push(msg('loadPlan.derivation.wind', {
          dir: dir.toUpperCase(), qh: round(res.qhNm2, 0),
          net: round(net, 3), front: round(across, 1),
        }));
      }
      return out;
    };
    const other = input.wind.structure && input.wind.structure.kind !== 'building' ? input.wind.structure : null;
    if (other) {
      // Not a closed building: the coefficients of §2.4.3, §4.4 or §4.5 (`wind-other.ts`).
      // Tabla 1.6-1: hexagonal 0,95, octagonal 1,00. Figura 4.5-1 has one row for both, so the
      // section does not say which: the larger Kd, the octagon's, is the one never short.
      const kd: WindProject['structureKind'] = other.kind === 'latticeTower' ? 'latticeTowerTriangularOrRect'
        : other.kind === 'openSign' ? 'openSign' : other.kind === 'solidSign' ? 'solidSign'
        : other.kind === 'chimney' ? (other.section.startsWith('round') ? 'chimneyRound' : other.section === 'hexOct' ? 'chimneyOctagonal' : 'chimneySquare') : 'building';
      const project: WindProject = {
        basicSpeed: input.wind.basicSpeed, exposure: input.wind.exposure, siteAltitudeM: input.wind.siteAltitudeM,
        kzt: input.wind.kzt, kztSurveyed: input.wind.kztSurveyed, structureKind: kd, enclosure: 'open',
        meanRoofHeight: Math.max(h, 1), L: Math.max(bx, 1), B: Math.max(by, 1), roofSlopeDeg: input.wind.roofSlopeDeg, rigid: input.wind.rigid,
      };
      // A structure declared flexible with no frequency to compute G_f with is refused, as a
      // building is: it used to take a rigid one's 0,85 without a word.
      if (!dyn && !input.wind.rigid) { unsupportedKeys.push(msg('loads.cirsoc102.unsupported.flexibleBuilding')); return { windQh }; }
      // Its gust effect factor per direction, with the structure's own h, B and L (§1.9, art. 1.3).
      const gOther = new Map<'x' | 'y', number>();
      const diagonal = other.kind === 'latticeTower' && other.section === 'square' && other.diagonal;
      for (const axis of ['x', 'y'] as const) {
        // Diagonal cases need both axes, even when only one cardinal direction was selected.
        if (!diagonal && !windDirs.some((d) => d.endsWith(axis))) continue;
        const g = gustOf(axis);
        if (g && 'refused' in g) { unsupportedKeys.push(g.refused); continue; }
        if (!g) { gOther.set(axis, G_RIGID); continue; }
        const r = gustEffectFactor({ exposure: input.wind.exposure, V: input.wind.basicSpeed, h: Math.max(h, 1), B: Math.max(axis === 'x' ? by : bx, 0.1), L: Math.max(axis === 'x' ? bx : by, 0.1), ...g });
        if (r.kind === 'unsupported') { unsupportedKeys.push(...r.notes); continue; }
        gOther.set(axis, r.value.value);
        windGust[axis] = r;
        derivation.push(gustLine(axis, r));
      }
      const directions = windDirs.filter((d) => gOther.has(d.endsWith('x') ? 'x' : 'y'));
      if (directions.length === 0) return { windQh, windGust };
      // A rejected axis must not return as a rigid fallback, including through a diagonal.
      const structure = other.kind === 'latticeTower' && gOther.size < 2 ? { ...other, diagonal: false } : other;
      const res = otherStructureWind({ model: input.model, structure, project, directions, tributaryWidth: input.tributaryWidth, G: (axis) => gOther.get(axis)! });
      derivation.push(...res.derivation);
      unsupportedKeys.push(...res.notes);
      refs.push(other.kind === 'freeRoof' ? REF_FREE_ROOF : other.kind === 'solidSign' ? REF_SIGN : REF_OTHER, REF_MIN_OTHER);
      windQh = fromProject(velocityPressure(Math.max(h, 0), project), 'N/m²');
      for (const c of res.cases) {
        const index = cases.length;
        cases.push({ existingId: null, type: 'W', nameKey: c.nameKey, nameParams: c.nameParams });
        for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'W', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, ...(n.mz ? { mz: n.mz } : {}) });
        for (const d of c.distributed) distributed.push({ elementId: d.elementId, caseType: 'W', caseIndex: index, q: d.qZ, qX: d.qX, qY: d.qY, frame: 'global' });
      }
    } else windAxes.push(...axesFor(input.wind.basicSpeed, false));
    if (windAxes.length > 0) {
      const set = input.wind.caseSet ?? 'all';
      const generated = windLoadCases({
        model: input.model, axes: windAxes, set, directions: windDirs,
        tributaryWidth: input.tributaryWidth, speed: input.wind.basicSpeed,
      });
      unsupportedKeys.push(...generated.notes);
      refs.push(R102('2.4.6', 'casos de carga de viento de diseño'));
      derivation.push(msg('loadPlan.derivation.windCases', { set, count: generated.cases.length }));
      for (const c of generated.cases) {
        const index = cases.length;
        cases.push({ existingId: null, type: 'W', nameKey: c.nameKey, nameParams: c.nameParams });
        for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'W', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, mz: n.mz });
        for (const d of c.distributed) distributed.push({ elementId: d.elementId, caseType: 'W', caseIndex: index, q: d.q });
      }
    }

    /*
     * Wa, for the service combinations of B.4.2: the same procedure at the speed of a shorter
     * recurrence, the 50-year speed of Figura C AB.4.2-1 times its conversion factor. Case 1 in
     * each direction and sense: the torsional and simultaneous cases are for strength.
     */
    const sw = input.wind.service;
    // Service wind Wa is the building procedure's; another structure has none here.
    if (sw?.enabled && sw.v50 > 0 && !other) {
      const factor = SERVICE_WIND_FACTOR[sw.mri];
      const speed = sw.v50 * factor;
      const waAxes = axesFor(speed, true);
      if (waAxes.length > 0) {
        const generated = windLoadCases({
          model: input.model, axes: waAxes, set: 'case1', directions: windDirs,
          tributaryWidth: input.tributaryWidth, speed: round(speed, 1),
        });
        refs.push(R102('B.4.2', 'servicio'));
        derivation.push(msg('loadPlan.derivation.windService', { v50: sw.v50, mri: sw.mri, factor, v: round(speed, 1), count: generated.cases.length }));
        for (const c of generated.cases) {
          const index = cases.length;
          cases.push({ existingId: null, type: 'Wa', nameKey: c.nameKey.replace('windCase1', 'windCaseWa'), nameParams: { ...c.nameParams, mri: sw.mri } });
          for (const n of c.nodal) nodal.push({ nodeId: n.nodeId, caseType: 'Wa', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0, mz: n.mz });
          for (const d of c.distributed) distributed.push({ elementId: d.elementId, caseType: 'Wa', caseIndex: index, q: d.q });
        }
      }
    }
  }

  return { windQh, ...(Object.keys(windGust).length ? { windGust } : {}) };
}

/** One derivation line: the direction's frequency, whether rigid or flexible, and its factor. */
function gustLine(dir: 'x' | 'y', g: GustResult) {
  return msg(`loadPlan.derivation.windGust.${g.kind}`, {
    dir: dir.toUpperCase(), n1: g.n1 !== undefined ? round(g.n1, 3) : '—', g: round(g.value.value, 3),
    zBar: round(g.steps.zBar, 1), iz: round(g.steps.iz, 3), q: round(g.steps.q, 3),
    r: g.steps.resonant ? round(g.steps.resonant.r, 3) : '—', gR: g.steps.resonant ? round(g.steps.resonant.gR, 3) : '—',
  });
}
