import type { AnalysisResults, ElementForces } from './types';
import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import { exactForcePeak, memberForceExtrema } from './member-force-extrema';

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

const components3D = ['momentZ', 'shearY', 'axial', 'momentY', 'shearZ', 'torsion'] as const;
const components2D = ['moment', 'shear', 'axial'] as const;

export type Component3D = typeof components3D[number];
export type Component2D = typeof components2D[number];

type Magnitude = { value: number; bounded?: true };

export function governingMagnitude3D(ef: ElementForces3D, component: Component3D): Magnitude {
  const range = memberForceExtrema(ef, component);
  return range.kind === 'bounded' ? { value: range.bound, bounded: true } : { value: Math.abs(range.absolute.value) };
}

export function peakAlong(kind: Component2D, ef: ElementForces): number {
  return exactForcePeak(ef, kind);
}

export function governingMagnitude2D(ef: ElementForces, component: Component2D): number {
  return peakAlong(component, ef);
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
  return governing(perCombo, comboNames, components3D, governingMagnitude3D);
}

export function computeGoverning2D(
  perCombo: Map<number, AnalysisResults>,
  comboNames: Map<number, string>,
): Map<number, GoverningPerElement> {
  return governing(perCombo, comboNames, components2D, (ef, component) => ({ value: governingMagnitude2D(ef, component) }));
}
