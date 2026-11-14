import { fromProject, type ProvenancedValue } from '../regulation';
import { msg, round } from '../message';
import { levelLoads, type WindLevel } from '../../engine/loads/wind-cases';
import type { LevelMass, LoadPlanInput, PlanSink } from '../../engine/loads/load-plan';
import { EN1991_1_4, UK_NA_1991_1_4, type EcFamily } from './refs';
import { WIND_ADAPTER, type EcWindInput, type TerrainCategory, type UkWindInput } from './inputs';

export const TERRAIN: Readonly<Record<TerrainCategory, { z0: number; zmin: number }>> = {
  '0': { z0: 0.003, zmin: 1 }, I: { z0: 0.01, zmin: 1 }, II: { z0: 0.05, zmin: 2 }, III: { z0: 0.3, zmin: 5 }, IV: { z0: 1.0, zmin: 10 },
};
export const Z_MAX = 200;
export const RHO: Readonly<Record<EcFamily, number>> = { eurocode: 1.25, uk: 1.226 };

export const terrainFactor = (cat: TerrainCategory) => 0.19 * (TERRAIN[cat].z0 / 0.05) ** 0.07;

export function roughness(z: number, cat: TerrainCategory): number {
  const { z0, zmin } = TERRAIN[cat];
  return terrainFactor(cat) * Math.log(Math.max(Math.min(z, Z_MAX), zmin) / z0);
}

export function turbulence(z: number, cat: TerrainCategory, c0 = 1, kI = 1): number {
  const { z0, zmin } = TERRAIN[cat];
  return kI / (c0 * Math.log(Math.max(Math.min(z, Z_MAX), zmin) / z0));
}

export interface PeakSite { vb: number; terrain: TerrainCategory; c0: number; rho: number }

export function meanVelocity(z: number, s: PeakSite): number {
  return roughness(z, s.terrain) * s.c0 * s.vb;
}

export function peakPressure(z: number, s: PeakSite): number {
  const vm = meanVelocity(z, s);
  return (1 + 7 * turbulence(z, s.terrain, s.c0)) * 0.5 * s.rho * vm * vm / 1000;
}

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);

export function wallCoefficients(hd: number): { D: number; E: number } {
  if (hd <= 0.25) return { D: 0.7, E: -0.3 };
  if (hd <= 1) return { D: lerp(hd, 0.25, 1, 0.7, 0.8), E: lerp(hd, 0.25, 1, -0.3, -0.5) };
  if (hd <= 5) return { D: 0.8, E: lerp(hd, 1, 5, -0.5, -0.7) };
  return { D: 0.8, E: -0.7 };
}

export function correlationFactor(hd: number): number {
  if (hd <= 1) return 0.85;
  return hd >= 5 ? 1 : lerp(hd, 1, 5, 0.85, 1);
}

export function windwardReferenceHeight(z: number, h: number, b: number): number {
  if (h <= b) return h;
  if (z <= b) return b;
  if (h <= 2 * b || z >= h - b) return h;
  return z;
}

export const altitudeFactor = (altitudeM: number) => 1 + 0.001 * Math.max(altitudeM, 0);

export function basicVelocity(family: EcFamily, ci: EcWindInput | UkWindInput): { vb0: number; vb: number } | null {
  const cdir = ci.cdir ?? 1, cseason = ci.cseason ?? 1;
  if (family === 'uk') {
    const u = ci as UkWindInput;
    if (!(u.vbMap! > 0) || u.altitude === undefined) return null;
    const vb0 = u.vbMap! * altitudeFactor(u.altitude);
    return { vb0, vb: cdir * cseason * vb0 };
  }
  const e = ci as EcWindInput;
  if (!(e.vb0! > 0)) return null;
  return { vb0: e.vb0!, vb: cdir * cseason * e.vb0! };
}

export function planEcWind(family: EcFamily, input: LoadPlanInput, levels: LevelMass[], sink: PlanSink): { windQh: ProvenancedValue<number> | undefined } {
  const ci = (input.codeInputs?.[WIND_ADAPTER[family]] ?? {}) as EcWindInput & UkWindInput;
  const { cases, nodal, derivation, refs, assumptions, unsupportedKeys, blockedKeys } = sink;
  const basic = basicVelocity(family, ci);
  if (!basic) { blockedKeys.push(msg(family === 'uk' ? 'loads.ec.blocked.ukWindSpeed' : 'loads.ec.blocked.windSpeed')); return { windQh: undefined }; }
  if (!ci.terrain || !TERRAIN[ci.terrain]) { blockedKeys.push(msg('loads.ec.blocked.terrain')); return { windQh: undefined }; }
  const dirs = ci.directions ?? { x: true, y: true };
  const region = input.wind?.region ? new Set(input.wind.region) : null;
  const inRegion = region ? levels.map((l) => ({ ...l, nodeIds: l.nodeIds.filter((id) => region.has(id)) })).filter((l) => l.nodeIds.length > 0) : levels;
  const nodes = [...input.model.nodes.values()].filter((n) => !region || region.has(n.id));
  // Heights are above the model's lowest level, which is not always at z = 0.
  const base = Math.min(...levels.map((l) => l.elevation));
  const elevated = inRegion.filter((l) => l.elevation > base + 1e-6);
  if (!nodes.length || !elevated.length || (!dirs.x && !dirs.y)) { unsupportedKeys.push(msg('loads.ec.wind.nothing')); return { windQh: undefined }; }

  const site: PeakSite = { vb: basic.vb, terrain: ci.terrain, c0: ci.c0 ?? 1, rho: RHO[family] };
  const cscd = ci.cscd ?? 1;
  const h = Math.max(...elevated.map((l) => l.elevation)) - base;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const bx = Math.max(...xs) - Math.min(...xs), by = Math.max(...ys) - Math.min(...ys);
  const qh = peakPressure(h, site);

  if (family === 'uk') {
    refs.push(UK_NA_1991_1_4('NA.2.4', 'vb,0 = vb,map calt'));
    derivation.push(msg('loads.ec.wind.ukBasic', { vmap: round(ci.vbMap!, 2), alt: round(ci.altitude!, 0), calt: round(altitudeFactor(ci.altitude!), 3), vb0: round(basic.vb0, 2) }));
    assumptions.push(msg('loads.ec.wind.ukRecommendedProfile'));
  }
  refs.push(
    EN1991_1_4('4.2', 'basic wind velocity'), EN1991_1_4('Table 4.1', 'terrain categories'), EN1991_1_4('4.3.2', 'terrain roughness'),
    EN1991_1_4('4.4', 'turbulence'), EN1991_1_4('4.5', 'peak velocity pressure'), EN1991_1_4('7.2.2', 'vertical walls'),
    EN1991_1_4('Table 7.1', 'cpe walls'), EN1991_1_4('5.3', 'wind forces'),
  );
  derivation.push(msg('loads.ec.wind.basic', {
    vb0: round(basic.vb0, 2), cdir: ci.cdir ?? 1, cseason: ci.cseason ?? 1, vb: round(basic.vb, 2), cat: ci.terrain,
    kr: round(terrainFactor(ci.terrain), 4), c0: site.c0, rho: site.rho, h: round(h, 2), qp: round(qh, 3), cscd,
  }));
  if (cscd === 1) assumptions.push(msg('loads.ec.wind.cscdOne'));
  unsupportedKeys.push(msg('loads.ec.wind.notCovered'));

  for (const axis of ['x', 'y'] as const) {
    if (!dirs[axis]) continue;
    const d = axis === 'x' ? bx : by, b = axis === 'x' ? by : bx;
    if (!(d > 0) || !(b > 0)) { unsupportedKeys.push(msg('loads.ec.wind.noFront', { dir: axis.toUpperCase() })); continue; }
    const hd = h / d;
    const cpe = wallCoefficients(hd), f = correlationFactor(hd);
    derivation.push(msg('loads.ec.wind.cpe', { dir: axis.toUpperCase(), hd: round(hd, 3), d: round(d, 2), b: round(b, 2), cpeD: round(cpe.D, 3), cpeE: round(cpe.E, 3), f: round(f, 3) }));
    const qe = (z: number) => peakPressure(windwardReferenceHeight(z, h, b), site);
    const bandNet = (z0: number, z1: number) => {
      const n = 8, step = (z1 - z0) / n;
      let s = qe(z0) + qe(z1);
      for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * qe(z0 + k * step);
      const mean = z1 > z0 ? s * step / 3 / (z1 - z0) : qe(z0);
      return cscd * f * (cpe.D * mean - cpe.E * qh);
    };
    const windLevels: WindLevel[] = elevated.map((lv, i) => {
      const below = i === 0 ? base : elevated[i - 1]!.elevation;
      const above = i === elevated.length - 1 ? lv.elevation : elevated[i + 1]!.elevation;
      const z0 = (below + lv.elevation) / 2 - base, z1 = (lv.elevation + above) / 2 - base;
      const net = bandNet(z0, z1);
      const force = net * b * (z1 - z0);
      derivation.push(msg('loadPlan.derivation.windLevel', { dir: axis.toUpperCase(), level: round(lv.elevation, 2), z0: round(z0, 2), z1: round(z1, 2), net: round(net, 3), force: round(force, 1) }));
      return { elevation: lv.elevation, nodeIds: lv.nodeIds, force, pressureForce: force };
    });
    for (const sense of [1, -1] as const) {
      const index = cases.length;
      const dir = `${sense > 0 ? '+' : '−'}${axis.toUpperCase()}`;
      cases.push({ existingId: null, type: 'W', nameKey: 'loads.ec.windCase', nameParams: { dir } });
      for (const lv of windLevels) {
        for (const n of levelLoads(input.model.nodes, lv.nodeIds, axis === 'x' ? sense * lv.force : 0, axis === 'y' ? sense * lv.force : 0, 0)) {
          nodal.push({ nodeId: n.nodeId, caseType: 'W', caseIndex: index, fx: n.fx, fy: n.fy, fz: 0 });
        }
      }
    }
  }
  return { windQh: fromProject(qh * 1000, 'N/m²') };
}
