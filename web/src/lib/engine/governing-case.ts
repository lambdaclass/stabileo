import type { AnalysisResults, ElementForces } from './types';
import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import { computeDiagram3D } from './diagrams-3d';
import { computeElementDiagram } from './diagrams';

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

/** The largest magnitude of the component anywhere along the member, its interior included. */
export function governingMagnitude2D(ef: ElementForces, component: Component2D): number {
  const [s, e] = ENDS_2D[component];
  const d = computeElementDiagram(component, ef, 0, 0, 0, 0);
  return peak(ef[s], ef[e], d.maxValue, d.minValue);
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
