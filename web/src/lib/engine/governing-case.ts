import type { AnalysisResults, ElementForces } from './types';
import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import { computeDiagram3D } from './diagrams-3d';
import { computeDiagramValueAt } from './diagrams';
import { cubicStationaryPoints } from './cubic-stationary';

export interface GoverningComboRef {
  comboId: number;
  comboName: string;
  value: number;
}

export interface GoverningPerElement3D {
  momentZ?: GoverningComboRef;
  shearY?: GoverningComboRef;
  axial?: GoverningComboRef;
  momentY?: GoverningComboRef;
  shearZ?: GoverningComboRef;
  torsion?: GoverningComboRef;
}

export interface GoverningPerElement {
  moment?: GoverningComboRef;
  shear?: GoverningComboRef;
  axial?: GoverningComboRef;
}

const ENDS_3D = {
  momentZ: ['mzStart', 'mzEnd'],
  shearY: ['vyStart', 'vyEnd'],
  axial: ['nStart', 'nEnd'],
  momentY: ['myStart', 'myEnd'],
  shearZ: ['vzStart', 'vzEnd'],
  torsion: ['mxStart', 'mxEnd'],
} as const satisfies Record<keyof GoverningPerElement3D, readonly [keyof ElementForces3D, keyof ElementForces3D]>;

const ENDS_2D = {
  moment: ['mStart', 'mEnd'],
  shear: ['vStart', 'vEnd'],
  axial: ['nStart', 'nEnd'],
} as const satisfies Record<keyof GoverningPerElement, readonly [keyof ElementForces, keyof ElementForces]>;

export type Component3D = keyof typeof ENDS_3D;
export type Component2D = keyof typeof ENDS_2D;

const peak = (...values: number[]): number => Math.max(...values.map(Math.abs));

/** The largest magnitude of the component anywhere along the member, its interior included. */
export function governingMagnitude3D(ef: ElementForces3D, component: Component3D): number {
  const [s, e] = ENDS_3D[component];
  const d = computeDiagram3D(ef, component);
  return peak(ef[s] as number, ef[e] as number, d.maxValue, d.minValue);
}

/**
 * The largest magnitude of the diagram along the member: its stations, both sides of each point load, and the
 * stationary points of the cubic it follows between load discontinuities, so a peak between stations is not read low.
 */
export function peakAlong(kind: 'moment' | 'shear' | 'axial', ef: ElementForces): number {
  const f = (t: number) => Math.abs(computeDiagramValueAt(kind, Math.min(1, Math.max(0, t)), ef));
  const ts = Array.from({ length: 41 }, (_, k) => k / 40);
  for (const p of ef.pointLoads ?? []) {
    const t = p.a / Math.max(ef.length, 1e-12);
    ts.push(Math.max(0, t - 1e-9), Math.min(1, t + 1e-9));
  }
  for (const d of [...(ef.distributedLoads ?? []), ...(ef.distributedLoadsX ?? [])]) {
    const a = d.a / Math.max(ef.length, 1e-12), b = d.b / Math.max(ef.length, 1e-12);
    for (let k = 0; k <= 8; k++) ts.push(Math.min(1, Math.max(0, a + ((b - a) * k) / 8)));
  }
  ts.sort((a, b) => a - b);
  const v = ts.map(f);
  let best = Math.max(...v);
  const g = (t: number) => computeDiagramValueAt(kind, t, ef);
  const cuts = [0, 1];
  for (const p of ef.pointLoads ?? []) cuts.push(p.a / Math.max(ef.length, 1e-12));
  for (const d of [...(ef.distributedLoads ?? []), ...(ef.distributedLoadsX ?? [])]) cuts.push(d.a / Math.max(ef.length, 1e-12), d.b / Math.max(ef.length, 1e-12));
  const edges = [...new Set(cuts.map((t) => Math.min(1, Math.max(0, t))))].sort((a, b) => a - b);
  for (let k = 0; k + 1 < edges.length; k++) {
    for (const t of cubicStationaryPoints(g, edges[k], edges[k + 1])) best = Math.max(best, Math.abs(g(t)));
  }
  for (let k = 1; k < ts.length - 1; k++) {
    if (!(v[k] >= v[k - 1] && v[k] >= v[k + 1])) continue;
    let lo = ts[k - 1], hi = ts[k + 1];
    for (let i = 0; i < 60 && hi - lo > 1e-12; i++) {
      const a = lo + (hi - lo) * 0.381966, b = lo + (hi - lo) * 0.618034;
      if (f(a) >= f(b)) hi = b; else lo = a;
    }
    best = Math.max(best, f((lo + hi) / 2));
  }
  return best;
}

/** The largest magnitude of the component anywhere along the member, its interior included. */
export function governingMagnitude2D(ef: ElementForces, component: Component2D): number {
  const [s, e] = ENDS_2D[component];
  return peak(ef[s], ef[e], peakAlong(component, ef));
}

function governing<E extends { elementId: number }, C extends string>(
  perCombo: Map<number, { elementForces: E[] }>,
  comboNames: Map<number, string>,
  components: readonly C[],
  magnitude: (ef: E, component: C) => number,
): Map<number, Partial<Record<C, GoverningComboRef>>> {
  const best = new Map<number, Map<C, { value: number; comboId: number }>>();
  for (const [comboId, results] of perCombo) {
    for (const ef of results.elementForces) {
      const cur = best.get(ef.elementId) ?? new Map<C, { value: number; comboId: number }>();
      best.set(ef.elementId, cur);
      for (const c of components) {
        const value = magnitude(ef, c);
        const held = cur.get(c);
        if (!held || value > held.value) cur.set(c, { value, comboId });
      }
    }
  }
  const result = new Map<number, Partial<Record<C, GoverningComboRef>>>();
  for (const [eid, cur] of best) {
    const out: Partial<Record<C, GoverningComboRef>> = {};
    for (const c of components) {
      const b = cur.get(c);
      out[c] = b && b.value > 0
        ? { comboId: b.comboId, comboName: comboNames.get(b.comboId) ?? `Combo ${b.comboId}`, value: b.value }
        : undefined;
    }
    result.set(eid, out);
  }
  return result;
}

export function computeGoverning3D(
  perCombo: Map<number, AnalysisResults3D>,
  comboNames: Map<number, string>,
): Map<number, GoverningPerElement3D> {
  return governing(perCombo, comboNames, Object.keys(ENDS_3D) as Component3D[], governingMagnitude3D);
}

export function computeGoverning2D(
  perCombo: Map<number, AnalysisResults>,
  comboNames: Map<number, string>,
): Map<number, GoverningPerElement> {
  return governing(perCombo, comboNames, Object.keys(ENDS_2D) as Component2D[], governingMagnitude2D);
}
