/**
 * The field a shell contour paints: a value at every corner of every shell, and the range the
 * scale spans. The painted shells, the legend beside them and the results read along a line all
 * take it from here, so they cannot disagree.
 *
 *   · At the nodes: von Mises from the solver's own nodal values; every other component is
 *     reported per element and is averaged at the nodes it touches.
 *   · At the centre: each element's own value at all of its corners, one colour per element.
 *
 * The range is the one the painted values occupy, or the one typed in (`contour-scale.ts`).
 *
 * Pure.
 */
import { shellComponentValue, type ShellContourComponent, type ShellStressLike } from './shell-stress';
import { nodalAverage, contourRange, type ContourAt } from './contour-scale';

export interface ShellStressEntry extends ShellStressLike { elementId: number; nodalVonMises?: readonly number[] }

export interface ContourField {
  /** Corner values by shell key (`p12`, `q7`), in the shell's node order. */
  corners: Map<string, number[]>;
  /** What the painted values occupy. */
  computed: { min: number; max: number };
  /** What the scale spans: `computed`, or the typed range. */
  range: { min: number; max: number };
}

export function shellContourField(
  stresses: { plates: readonly ShellStressEntry[]; quads: readonly ShellStressEntry[] },
  nodesOf: (key: string) => readonly number[] | undefined,
  component: ShellContourComponent,
  opts: { at: ContourAt; auto: boolean; min: number; max: number },
): ContourField {
  const entries: Array<{ key: string; nodes: readonly number[]; s: ShellStressEntry }> = [];
  for (const [prefix, list] of [['p', stresses.plates], ['q', stresses.quads]] as const) {
    for (const s of list) {
      const key = `${prefix}${s.elementId}`;
      const nodes = nodesOf(key);
      if (nodes) entries.push({ key, nodes, s });
    }
  }
  const corners = new Map<string, number[]>();
  if (opts.at === 'centre') {
    for (const e of entries) corners.set(e.key, e.nodes.map(() => shellComponentValue(e.s, component)));
  } else if (component === 'vonMises') {
    for (const e of entries) {
      const nv = e.s.nodalVonMises;
      corners.set(e.key, nv && nv.length === e.nodes.length ? [...nv] : e.nodes.map(() => e.s.vonMises));
    }
  } else {
    const avg = nodalAverage(entries.map((e) => ({ nodes: e.nodes, value: shellComponentValue(e.s, component) })));
    for (const e of entries) corners.set(e.key, e.nodes.map((n) => avg.get(n) ?? 0));
  }
  let min = Infinity, max = -Infinity;
  for (const vs of corners.values()) for (const v of vs) { if (v < min) min = v; if (v > max) max = v; }
  const computed = Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
  return { corners, computed, range: contourRange(computed, opts) };
}
