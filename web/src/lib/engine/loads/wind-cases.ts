import {
  flatRoofCp, roofCp, G_RIGID, type WindProject,
} from '../../codes/cirsoc102/wind';
import { msg, type EngineMessage } from '../../codes/message';
import { flexibleEccentricity, type GustResult } from '../../codes/cirsoc102/gust';
import { integrateWindPressure, windStationCuts, windPressureCoordinate, windHeightLoads } from './wind-pressure-field';
import { windRoofCarriers } from './wind-roof-geometry';
export { levelLoads } from './wind-plan-forces';
import type { WindHeightResult } from './wind-pressure-field';
import { gravityLayout } from './plan-gravity';

export type WindCaseSet = 'case1' | 'cases13' | 'all';

type Axis = 'x' | 'y';
type Sense = 1 | -1;

/** A direction the wind comes along: +X, −X, +Y or −Y. */
export type WindDirection = '+x' | '-x' | '+y' | '-y';
export const WIND_DIRECTIONS: readonly WindDirection[] = ['+x', '-x', '+y', '-y'];

/** The senses chosen on one axis, in the order +, −. */
export function sensesOn(dirs: readonly WindDirection[], axis: Axis): Sense[] {
  return ([1, -1] as const).filter((s) => dirs.includes(`${s > 0 ? '+' : '-'}${axis}` as WindDirection));
}

export interface WindLevel {
  elevation: number;
  nodeIds: number[];
  /** Case 1 force at the level, kN, with the §2.1.5 minimum. */
  force: number;
  /** The same force from the pressures alone, kN. The minimum is a case of its own (C 2.1.5). */
  pressureForce: number;
}

interface WindAxisGeometry {
  axis: Axis;
  /** Building width across the wind, m. */
  across: number;
  /** Plan dimension along the wind, m. */
  along: number;
  project: WindProject;
  qhNm2: number;
  /** (GC_pi) magnitude for the building's enclosure. */
  gcpi: number;
  /** The gust effect factor of this axis (§1.9). Absent: the rigid 0,85. */
  G?: number;
  /** Its derivation, when computed: a flexible axis's cases 2 and 4 take Eq. (2.4-5). */
  gust?: GustResult;
  /** Shear centre to mass centre for Eq. (2.4-5), m. */
  eR?: number;
}

export type WindAxis = WindAxisGeometry & { pressureField: WindHeightResult; minimumField?: WindHeightResult };

/**
 * The torsional eccentricity of cases 2 and 4 on an axis (§2.4.6): ±0,15·B from the geometric
 * centre (Fig. 2.4-8), or Eq. (2.4-5) for a flexible structure.
 */
export function caseEccentricity(a: WindAxis, sign: 1 | -1): number {
  const eQ = 0.15 * a.across;
  const g = a.gust;
  if (g?.kind !== 'flexible' || !g.steps.resonant) return sign * eQ;
  return sign * flexibleEccentricity({ eQ, eR: a.eR ?? 0, iz: g.steps.iz, q: g.steps.q, r: g.steps.resonant.r, gR: g.steps.resonant.gR }).value;
}

export interface WindModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number }>;
}

export interface WindCaseLoads {
  nameKey: string;
  nameParams: Record<string, string | number>;
  nodal: Array<{ nodeId: number; fx: number; fy: number; mz: number }>;
  distributed: WindRoofLoad[];
  baseLoads: WindCaseLoads['nodal'];
}

const Z = (n: { z?: number }) => n.z ?? 0;
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export interface RoofMember { id: number; mid: { x: number; y: number }; dx: number; dy: number; dz: number; lh: number; a: { x: number; y: number; z?: number }; b: { x: number; y: number; z?: number }; facets?: Array<{ a: number; b: number; gradient: [number, number]; share: number }> }
export interface WindRoofLoad { elementId: number; q: number; a: number; b: number; qX: number; qXJ?: number; qY: number; qYJ?: number; qJ?: number; frame: 'global'; facet: number }

/**
 * The members the roof pressures go on (see the header): beam-like members above the ground
 * that nothing higher covers in plan (`plan-gravity.ts`). A lower roof beside a step is a roof;
 * it used to be left out, because a column of the higher part rises from its nodes.
 *
 * `only`, a roof chosen by a region (`snow-loads.ts`), is read the same way among its own
 * members: the beam-like ones nothing higher of them covers. A region takes every member with
 * both ends in it, so a box over a shed brought its upper columns (read as a 90° slope: 52°
 * for a 14° roof, C_s 0,45 instead of 1) and the floor under the roof. Nothing outside the
 * choice covers it, so a lower roof can still be chosen on its own.
 */
export function roofMembers(model: WindModel, only?: ReadonlySet<number>): RoofMember[] {
  const within = only ? { ...model, elements: new Map([...model.elements].filter(([id]) => only.has(id))) } : model;
  const roof = gravityLayout(within, { mode: 'width', tributaryWidth: 1 }).roof;
  const out: RoofMember[] = [];
  for (const e of model.elements.values()) {
    if (!roof.has(e.id)) continue;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    if (Z(a) <= 0.05 || Z(b) <= 0.05) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = Z(b) - Z(a);
    out.push({ id: e.id, a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dx, dy, dz, lh: Math.hypot(dx, dy) });
  }
  return out;
}

export function roofLoads(
  roof: RoofMember[], w: WindAxis, sense: Sense, gcpiSign: 1 | -1, tributaryWidth: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): WindRoofLoad[] {
  const out: WindRoofLoad[] = [];
  const h = w.project.meanRoofHeight, hOverL = h / Math.max(w.along, 1e-9);
  const qh = w.qhNm2, qi = gcpiSign * w.gcpi * qh;
  const gable = w.project.roofSlopeDeg >= 10 ? roofCp(hOverL, w.project.roofSlopeDeg) : null;
  for (const m of roof) {
    const length = Math.hypot(m.lh, m.dz);
    const start = w.axis === 'x' ? m.a.x : m.a.y;
    const end = w.axis === 'x' ? m.b.x : m.b.y;
    const edge = w.axis === 'x' ? (sense > 0 ? bounds.minX : bounds.maxX) : (sense > 0 ? bounds.minY : bounds.maxY);
    const s0 = sense * (start - edge), s1 = sense * (end - edge);
    const fallback: [number, number] = [m.dz * m.dx / m.lh ** 2, m.dz * m.dy / m.lh ** 2];
    for (const [facetIndex, facet] of (m.facets ?? [{ a: 0, b: length, gradient: fallback, share: 1 }]).entries()) {
      const gradient = facet.gradient, norm = Math.hypot(...gradient, 1);
      const alongSlope = gradient[w.axis === 'x' ? 0 : 1] * sense;
      const cuts = windStationCuts(s0, s1, [h / 2, h, 2 * h], length).map(s => s - facet.a);
      const parts = integrateWindPressure(facet.b - facet.a, cuts, s => {
        const distance = windPressureCoordinate(s0 + (s1 - s0) * (s + facet.a) / length, [0, h / 2, h, 2 * h]);
        const cps = gable && Math.abs(alongSlope) > Math.tan(5 * Math.PI / 180)
          ? (alongSlope > 0 ? gable.windward : gable.leeward)
          : flatRoofCp(hOverL, Math.max(distance, 0), h).cp;
        const cp = gcpiSign > 0 ? Math.min(...cps) : Math.max(...cps);
        return -(qh * (w.G ?? G_RIGID) * cp - qi) / 1000 * tributaryWidth * facet.share;
      });
      for (const p of parts) out.push({ elementId: m.id, a: p.a + facet.a, b: p.b + facet.a, q: p.q / norm, qJ: p.qJ / norm, qX: -p.q * gradient[0] / norm, qXJ: -p.qJ * gradient[0] / norm, qY: -p.q * gradient[1] / norm, qYJ: -p.qJ * gradient[1] / norm, frame: 'global', facet: facetIndex });
    }
  }
  return out;
}

export interface WindCasesInput {
  model: WindModel;
  axes: WindAxis[];
  set: WindCaseSet;
  /** The directions to generate; an axis with none is skipped. */
  directions: readonly WindDirection[];
  tributaryWidth: number;
  speed: number;
}

/** All the cases the set asks for, with their loads. */
export function windLoadCases({ model, ...input }: WindCasesInput): { cases: WindCaseLoads[]; notes: EngineMessage[] } {
  return windCasesForModel(model)(input);
}

function caseGeometry(model: WindModel) {
  const roof = windRoofCarriers(model).members;
  const xs = [...model.nodes.values()].map(n => n.x), ys = [...model.nodes.values()].map(n => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { roof, bounds };
}

export function windCasesForModel(model: WindModel) {
  let geometry: ReturnType<typeof caseGeometry> | undefined;
  return (input: Omit<WindCasesInput, 'model'>) => casesForGeometry(input, geometry ??= caseGeometry(model));
}

function casesForGeometry(input: Omit<WindCasesInput, 'model'>, { roof, bounds }: ReturnType<typeof caseGeometry>) {
  const { set } = input;
  const notes: EngineMessage[] = [];
  const cases: WindCaseLoads[] = [];
  const sensesOf = (a: Axis) => sensesOn(input.directions, a);
  const byAxis = new Map(input.axes.map((a) => [a.axis, a]));
  const signTxt = (s: number) => (s > 0 ? '+' : '−');
  const dirTxt = (a: Axis, s: Sense) => `${signTxt(s)}${a.toUpperCase()}`;
  const v = input.speed;

  const roofFor = (a: WindAxis, s: Sense, g: 1 | -1) => roofLoads(roof, a, s, g, input.tributaryWidth, bounds);
  const push = (nameKey: string, nameParams: WindCaseLoads['nameParams'], nodal: WindCaseLoads['nodal'], roofQ: WindRoofLoad[]) => {
    cases.push({ nameKey, nameParams, nodal, baseLoads: [], distributed: roofQ.filter(p => Math.hypot(p.q, p.qJ ?? p.q, p.qX, p.qXJ ?? p.qX, p.qY, p.qYJ ?? p.qY) > 0) });
  };
  const scaled = (loads: WindRoofLoad[], k: number) => loads.map(p => ({ ...p, q: p.q * k, qJ: (p.qJ ?? p.q) * k, qX: p.qX * k, qXJ: (p.qXJ ?? p.qX) * k, qY: p.qY * k, qYJ: (p.qYJ ?? p.qY) * k }));
  const larger = (a: WindRoofLoad[], b: WindRoofLoad[]) => {
    const out: WindRoofLoad[] = [];
    for (const key of new Set([...a, ...b].map(p => `${p.elementId}:${p.facet}`))) {
      const [id, facet] = key.split(':').map(Number) as [number, number];
      const aa = a.filter(p => p.elementId === id && p.facet === facet), bb = b.filter(p => p.elementId === id && p.facet === facet);
      const cuts = [...new Set([...aa, ...bb].flatMap(p => [p.a, p.b]))].sort((a, b) => a - b);
      for (let k = 1; k < cuts.length; k++) {
        const lo = cuts[k - 1]!, hi = cuts[k]!, mid = (lo + hi) / 2;
        const sum = (rows: WindRoofLoad[]) => rows.filter(p => p.a <= mid && p.b >= mid).reduce((s, p) => ({ ...s, q: s.q + p.q, qX: s.qX + p.qX, qY: s.qY + p.qY }), { elementId: id, a: lo, b: hi, q: 0, qX: 0, qY: 0, frame: 'global' as const, facet });
        const p = sum(aa), q = sum(bb);
        out.push(Math.hypot(p.q, p.qX, p.qY) >= Math.hypot(q.q, q.qX, q.qY) ? p : q);
      }
    }
    return out;
  };
  const total = (field: WindHeightResult) => [...field.loads.values(), ...field.baseLoads.values()].reduce((s, f) => s + f, 0);
  const memberLateral = (a: WindAxis, s: Sense, k: number, e: number) => windHeightLoads(a.pressureField, a.axis === 'x' ? s * k : 0, a.axis === 'y' ? s * k : 0, k * e).distributed;

  for (const a of input.axes) {
    for (const s of sensesOf(a.axis)) {
      const minimumFirst = a.minimumField && total(a.minimumField) > total(a.pressureField);
      const pushMinimum = () => {
        if (!a.minimumField) return;
        const member = windHeightLoads(a.minimumField, a.axis === 'x' ? s : 0, a.axis === 'y' ? s : 0);
        push('autoLoad.windMinimumCase', { dir: dirTxt(a.axis, s), v }, member.nodal, member.distributed);
      };
      if (minimumFirst) pushMinimum();
      const gSigns: Array<1 | -1> = roof.length > 0 && a.gcpi > 0 ? [1, -1] : [1];
      for (const g of gSigns) {
        push(gSigns.length > 1 ? 'autoLoad.windCase1Gcpi' : 'autoLoad.windCase1',
          { dir: dirTxt(a.axis, s), v, gcpi: signTxt(g) }, [], [...memberLateral(a, s, 1, 0), ...roofFor(a, s, g)]);
      }
      if (!minimumFirst) pushMinimum();
    }
  }
  if (set === 'case1') return { cases, notes };

  // ── Case 2 ──
  if (set === 'all') {
    for (const a of input.axes) {
      for (const s of sensesOf(a.axis)) {
        for (const es of [1, -1] as const) {
          push('autoLoad.windCase2', { dir: dirTxt(a.axis, s), e: signTxt(es), v },
            [], [...memberLateral(a, s, 0.75, caseEccentricity(a, es)), ...scaled(roofFor(a, s, 1), 0.75)]);
        }
      }
    }
  }

  // ── Cases 3 and 4: both axes at once ──
  const ax = byAxis.get('x'), ay = byAxis.get('y');
  const quadrants: Array<[Sense, Sense]> = sensesOf('x').flatMap((sx) => sensesOf('y').map((sy) => [sx, sy] as [Sense, Sense]));
  if (!ax || !ay || quadrants.length === 0) {
    notes.push(msg('loadPlan.note.windCases34NeedBothAxes'));
    return { cases, notes };
  }
  for (const [sx, sy] of quadrants) {
    const roofQ = larger(roofFor(ax, sx, 1), roofFor(ay, sy, 1));
    push('autoLoad.windCase3', { dirX: dirTxt('x', sx), dirY: dirTxt('y', sy), v },
      [], [...memberLateral(ax, sx, 0.75, 0), ...memberLateral(ay, sy, 0.75, 0), ...roofQ]);
    if (set !== 'all') continue;
    for (const es of [1, -1] as const) {
      push('autoLoad.windCase4', { dirX: dirTxt('x', sx), dirY: dirTxt('y', sy), e: signTxt(es), v },
        [],
        [...memberLateral(ax, sx, 0.563, caseEccentricity(ax, es)), ...memberLateral(ay, sy, 0.563, caseEccentricity(ay, es)), ...scaled(roofQ, 0.75)]);
    }
  }
  if (roof.length > 0) notes.push(msg('loadPlan.note.windRoofApplied', { members: roof.length, width: round(input.tributaryWidth, 2) }));
  return { cases, notes };
}
