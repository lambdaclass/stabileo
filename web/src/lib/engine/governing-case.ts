import type { AnalysisResults, ElementForces } from './types';
import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import { computeSpatialDiagramExtrema } from './diagrams-3d';
import { computePlanarDiagramExtrema } from './diagrams';

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

type Magnitude = { value: number; bounded?: true };

const peak = (...values: number[]): number => Math.max(...values.map(Math.abs));

/** The largest magnitude of the component anywhere along the member, its interior included. */
export function governingMagnitude3D(ef: ElementForces3D, component: Component3D): Magnitude {
  const [s, e] = ENDS_3D[component];
  const d = computeSpatialDiagramExtrema(ef, component);
  const value = peak(ef[s] as number, ef[e] as number, d.maxValue, d.minValue);
  return d.extrema === 'bounded' ? { value, bounded: true } : { value };
}

export function peakAlong(kind: Component2D, ef: ElementForces): number {
  return Math.abs(computePlanarDiagramExtrema(kind, ef).maxAbsValue);
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
  magnitude: (ef: E, component: C) => Magnitude,
): Map<number, Partial<Record<C, GoverningComboRef>>> {
  const best = new Map<number, Map<C, Magnitude & { comboId: number }>>();
  for (const [comboId, results] of perCombo) {
    for (const ef of results.elementForces) {
      const cur = best.get(ef.elementId) ?? new Map<C, Magnitude & { comboId: number }>();
      best.set(ef.elementId, cur);
      for (const c of components) {
        const next = magnitude(ef, c);
        const held = cur.get(c);
        if (!held || next.value > held.value || (next.value === held.value && held.bounded && !next.bounded)) {
          cur.set(c, { ...next, comboId });
        }
      }
    }
  }
  const result = new Map<number, Partial<Record<C, GoverningComboRef>>>();
  for (const [eid, cur] of best) {
    const out: Partial<Record<C, GoverningComboRef>> = {};
    for (const c of components) {
      const b = cur.get(c);
      out[c] = b && !b.bounded && b.value > 0
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
  return governing(perCombo, comboNames, Object.keys(ENDS_2D) as Component2D[], (ef, component) => ({ value: governingMagnitude2D(ef, component) }));
}
