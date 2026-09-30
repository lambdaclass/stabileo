/**
 * A figure of a step-by-step document, as data: the structure (or a piece of
 * it: one span, one joint, one free body) with what the step is about drawn
 * on it. One renderer, components/steps/StepSketch.svelte, draws every
 * method's figures, so the same load or reaction looks the same in all of them.
 *
 * Coordinates are the model's (m, x right, z up). Directions and senses are
 * global unless said otherwise.
 */

export type SketchColor =
  | 'structure' | 'muted' | 'load' | 'reaction' | 'moment' | 'unknown'
  | 'dof' | 'accent' | 'tension' | 'compression' | 'deformed' | 'diagram';

export type SketchSupport = 'fixed' | 'pinned' | 'roller' | 'rollerV' | 'spring';

export interface Sketch {
  nodes: Array<{ id: number; x: number; z: number; label?: string }>;
  members: Array<{
    id: number; i: number; j: number;
    /** 'faint': context; 'dashed': removed or virtual; 'highlight': the one the step is about. */
    style?: 'solid' | 'faint' | 'dashed' | 'highlight';
    label?: string;
    color?: SketchColor;
  }>;
  /** roller: rolls along X (holds z); rollerV: rolls along Z (holds x). */
  supports?: Array<{ node: number; type: SketchSupport }>;
  /** A hinge at a member end, or at a node (all members there). */
  hinges?: Array<{ node: number; member?: number }>;
  /** Span loads, in the member's frame: w > 0 towards local −y (down on a span drawn left to right). */
  spanLoads?: Array<{ member: number; a: number; b: number; wa: number; wb: number; label?: string }>;
  /** Forces at a point: a load, a reaction, an unknown. `label` is drawn at the tail. */
  forces?: Array<{ x: number; z: number; fx: number; fz: number; label?: string; color?: SketchColor; dashed?: boolean }>;
  /** Couples at a point, counter-clockwise when m > 0. */
  couples?: Array<{ x: number; z: number; m: number; label?: string; color?: SketchColor; dashed?: boolean }>;
  /** Free text at a point. */
  labels?: Array<{ x: number; z: number; text: string; color?: SketchColor; anchor?: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' }>;
  /** Degrees of freedom: arrows (ux, uz) and arcs (ry) at nodes, numbered. */
  dofs?: Array<{ node: number; kind: 'ux' | 'uz' | 'ry'; label: string; color?: SketchColor }>;
  /** Dimension lines. 'auto': spans along X under the structure and heights on its left. */
  dims?: 'auto' | Array<{ a: { x: number; z: number }; b: { x: number; z: number }; text: string; offset?: number }>;
  /**
   * A diagram along members: values at t ∈ [0, 1], drawn off the member on
   * its local −y side when positive ("bottom" for sagging moments), scaled so
   * the largest is `px` pixels.
   */
  diagram?: {
    color: SketchColor;
    px?: number;
    /** Label the extreme values and the member ends. */
    marks?: boolean;
    unit?: string;
    members: Array<{ member: number; values: Array<[number, number]> }>;
  };
  /** A displaced shape, in model coordinates (already magnified). */
  deformed?: Array<{ points: Array<{ x: number; z: number }>; color?: SketchColor }>;
  /** A section cut through the structure. */
  cut?: { a: { x: number; z: number }; b: { x: number; z: number }; label?: string };
  /** Figure height in px (the width follows the page). */
  height?: number;
}

/** A plane-model node and member list as the sketch's structure. */
export function sketchOf(
  pm: { nodes: Map<number, { id: number; x: number; z: number; name: string }>; members: Map<number, { id: number; i: number; j: number; hingeI: boolean; hingeJ: boolean }>; supports: Map<number, { node: number; type: string }> },
  opts: { labels?: boolean } = {},
): Sketch {
  const nodes = [...pm.nodes.values()].map((n) => ({ id: n.id, x: n.x, z: n.z, ...(opts.labels !== false ? { label: n.name } : {}) }));
  const members = [...pm.members.values()].map((m) => ({ id: m.id, i: m.i, j: m.j }));
  const supports: Sketch['supports'] = [];
  for (const s of pm.supports.values()) {
    const t = s.type === 'fixed' ? 'fixed' : s.type === 'pinned' ? 'pinned' : s.type === 'rollerX' ? 'roller' : s.type === 'rollerZ' ? 'rollerV' : s.type === 'spring' ? 'spring' : 'roller';
    supports.push({ node: s.node, type: t as SketchSupport });
  }
  const hinges: Sketch['hinges'] = [];
  for (const m of pm.members.values()) {
    if (m.hingeI) hinges.push({ node: m.i, member: m.id });
    if (m.hingeJ) hinges.push({ node: m.j, member: m.id });
  }
  return { nodes, members, supports, hinges };
}
