/**
 * The shell stresses as the contours read them: each with its thickness (forces per unit length,
 * faces) and, for the required steel, its depth and fy; and the field painted from them under the
 * contour options. The shells, the legend, the results along a line and the figures all take it
 * from here.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { contourOptions } from './contour-options.svelte';
import { designData } from './design-data';
import { physicalPlates } from './physical-plates';
import { shellContourField, type ContourField, type ShellStressEntry } from '../engine/shell-contour-field';
import type { ShellContourComponent } from '../engine/shell-stress';
import type { AnalysisResults3D } from '../engine/types-3d';

export const shellNodesOf = (key: string) => (key.startsWith('p') ? modelStore.plates.get(+key.slice(1))?.nodes : modelStore.quads.get(+key.slice(1))?.nodes);

export function shellStressInputs(r3d: AnalysisResults3D, component: ShellContourComponent): { plates: ShellStressEntry[]; quads: ShellStressEntry[] } {
  const steel = component.startsWith('as');
  const dd = steel ? designData() : null;
  const with_ = (t: number | undefined) => ({
    ...(t ? { t } : {}),
    ...(dd && t ? { steelBasis: { d: t - dd.covers.slab - 0.006, fy: dd.rebarFy } } : {}),
  });
  return {
    plates: (r3d.plateStresses ?? []).map((s) => ({ ...s, ...with_(modelStore.plates.get(s.elementId)?.thickness) })),
    quads: (r3d.quadStresses ?? []).map((s) => ({ ...s, ...with_(modelStore.quads.get(s.elementId)?.thickness) })),
  };
}

/** Which elements average with each other at a node: all, those of one physical plate, or of one group. */
export function shellDomainOf(within: 'all' | 'physical' | 'group'): ((key: string) => string) | undefined {
  if (within === 'all') return undefined;
  const of = new Map<string, string>();
  const groups = within === 'physical'
    ? physicalPlates().map((p) => p.group)
    : [...modelStore.model.groups.values()].sort((a, b) => a.id - b.id);
  for (const g of groups) {
    for (const id of g.members.quads ?? []) if (!of.has(`q${id}`)) of.set(`q${id}`, `g${g.id}`);
    for (const id of g.members.plates ?? []) if (!of.has(`p${id}`)) of.set(`p${id}`, `g${g.id}`);
  }
  return (key) => of.get(key) ?? '';
}

/** The field the shells are painted with now, or null without shell results. */
export function currentShellContourField(r3d: AnalysisResults3D | null = resultsStore.results3D, component: ShellContourComponent = resultsStore.shellContourComponent): ContourField | null {
  if (!r3d || ((r3d.plateStresses?.length ?? 0) + (r3d.quadStresses?.length ?? 0)) === 0) return null;
  return shellContourField(shellStressInputs(r3d, component), shellNodesOf, component, {
    at: contourOptions.at, auto: contourOptions.auto, min: contourOptions.min, max: contourOptions.max,
    face: contourOptions.face, domainOf: shellDomainOf(contourOptions.within),
  });
}
