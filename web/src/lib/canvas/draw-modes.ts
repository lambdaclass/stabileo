// Drawing mode shapes (modal analysis) and buckling modes on the canvas

import type { PlasticResult } from '../engine/result-types';
import { computeDeformedShape } from '../engine/diagrams';

/** What the mode drawing reads of a member: its ends, and whether they carry moment. */
interface ModeElement {
  nodeI: number;
  nodeJ: number;
  type?: 'frame' | 'truss';
  releaseI?: { mz?: boolean };
  releaseJ?: { mz?: boolean };
}

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  nodes: Map<number, { x: number; y: number }>;
  elements: Map<number, ModeElement>;
}

type ModeDisplacement = { nodeId: number; ux: number; uz: number; ry: number };

/**
 * The points of one member's modal shape, in world coordinates, `scale` times
 * the mode's amplitude.
 *
 * ── Why the rotations ──────────────────────────────────────────────
 *
 * This interpolated only the nodal translations, with the two translation
 * Hermite functions applied to the global ux and uz, and never read `ry`. A
 * mode made of rotations then drew as the undeformed structure: the first
 * mode of a simply supported beam (both ends held, the ends rotating) was a
 * straight line, and so was every mode of a continuous beam, a bridge deck,
 * any beam whose nodes all sit on supports. It is now the member's own
 * displacement field, the one the deformed shape draws (`computeDeformedShape`):
 * axial displacement linear, transverse displacement the full cubic Hermite in
 * the end translations and rotations, a released end (hinge, truss bar) taking
 * the rotation its free end has.
 *
 * ── Sign ───────────────────────────────────────────────────────────
 *
 * `ry` is the engine's nodal rotation, the same field the static solve
 * publishes, counter-clockwise in the drawn plane; `computeDeformedShape`
 * measures the transverse displacement along the solver's own transverse
 * axis (x turned 90° counter-clockwise), for which dv/dx is that rotation.
 * No `transverseSign` enters: that flip is for quantities published in the
 * drawn member axes (loads, V, M), and displacements are global.
 */
export function modeShapePoints(
  ni: { x: number; y: number },
  nj: { x: number; y: number },
  di: { ux: number; uz: number; ry: number },
  dj: { ux: number; uz: number; ry: number },
  elem: Pick<ModeElement, 'type' | 'releaseI' | 'releaseJ'>,
  scale: number,
): { x: number; y: number }[] {
  const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
  const truss = elem.type === 'truss';
  return computeDeformedShape(
    ni.x, ni.y, nj.x, nj.y,
    di.ux, di.uz, di.ry,
    dj.ux, dj.uz, dj.ry,
    scale, L,
    truss || elem.releaseI?.mz === true,
    truss || elem.releaseJ?.mz === true,
  );
}

const NO_DISP = { ux: 0, uz: 0, ry: 0 };

type Pt = { x: number; y: number };

/**
 * Each member's mode shape as its undeformed points and their offsets at unit amplitude.
 *
 * A mode is fixed and only its amplitude animates, and the shape is linear in the amplitude, so
 * a frame is `base + scale·offset`. Interpolating anew every frame crossed into the engine once
 * per member (`computeDeformedShape`), at 60 frames a second. Kept per mode (its displacement
 * array) for the geometry it was drawn on.
 */
const unitShapes = new WeakMap<object, { nodes: unknown; elements: unknown; shapes: Map<number, { base: Pt[]; off: Pt[] } | null> }>();

function unitShape(
  displacements: ModeDisplacement[], dc: DrawContext, dispMap: Map<number, { ux: number; uz: number; ry: number }>,
  id: number, elem: ModeElement,
): { base: Pt[]; off: Pt[] } | null {
  let cache = unitShapes.get(displacements);
  if (!cache || cache.nodes !== dc.nodes || cache.elements !== dc.elements) {
    cache = { nodes: dc.nodes, elements: dc.elements, shapes: new Map() };
    unitShapes.set(displacements, cache);
  }
  if (cache.shapes.has(id)) return cache.shapes.get(id)!;
  const ni = dc.nodes.get(elem.nodeI), nj = dc.nodes.get(elem.nodeJ);
  let shape: { base: Pt[]; off: Pt[] } | null = null;
  if (ni && nj) {
    const di = dispMap.get(elem.nodeI) ?? NO_DISP, dj = dispMap.get(elem.nodeJ) ?? NO_DISP;
    const base = modeShapePoints(ni, nj, di, dj, elem, 0);
    const unit = modeShapePoints(ni, nj, di, dj, elem, 1);
    if (base.length === unit.length && base.length >= 2) {
      shape = { base, off: unit.map((p, k) => ({ x: p.x - base[k]!.x, y: p.y - base[k]!.y })) };
    }
  }
  cache.shapes.set(id, shape);
  return shape;
}

/**
 * Draw a mode shape (modal or buckling).
 * Renders the deformed shape with animated sinusoidal scaling.
 */
export function drawModeShape(
  displacements: ModeDisplacement[],
  dc: DrawContext,
  _zoom: number,
  scale: number,
  color: string = '#7fd4cc',
): void {
  const { ctx, worldToScreen, nodes, elements } = dc;

  // Build displacement lookup
  const dispMap = new Map<number, { ux: number; uz: number; ry: number }>();
  for (const d of displacements) {
    dispMap.set(d.nodeId, { ux: d.ux ?? 0, uz: d.uz ?? 0, ry: d.ry ?? 0 });
  }

  // Draw deformed elements
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);

  for (const [id, elem] of elements) {
    const shape = unitShape(displacements, dc, dispMap, id, elem);
    if (!shape) continue;

    ctx.beginPath();
    for (let k = 0; k < shape.base.length; k++) {
      const b = shape.base[k]!, o = shape.off[k]!;
      const s = worldToScreen(b.x + scale * o.x, b.y + scale * o.y);
      if (k === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }

  // Draw node positions
  ctx.fillStyle = color;
  for (const [nodeId, node] of nodes) {
    const d = dispMap.get(nodeId) ?? NO_DISP;
    const wx = node.x + d.ux * scale;
    const wy = node.y + d.uz * scale;
    const s = worldToScreen(wx, wy);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The plastic hinges formed up to a step of the collapse analysis, over the
 * moment diagram the Viewport draws for that step's accumulated state.
 *
 * Every hinge formed so far is marked, numbered in the order it formed; those
 * of the current step are drawn brighter, so stepping through reads as the
 * hinges appearing one event at a time. A yielded truss bar is marked with a
 * square rather than a circle: it is an axial yield, not a hinge.
 */
export function drawPlasticHinges(
  result: PlasticResult,
  stepIndex: number,
  dc: DrawContext,
  _zoom: number,
): void {
  const { ctx, worldToScreen, nodes, elements } = dc;
  if (!result.steps[stepIndex]) return;
  const upTo = result.hinges
    .map((h, order) => ({ h, order }))
    .filter(({ h }) => h.step <= stepIndex);
  for (const { h, order } of upTo) {
    const elem = elements.get(h.elementId);
    if (!elem) continue;
    const ni = nodes.get(elem.nodeI);
    const nj = nodes.get(elem.nodeJ);
    if (!ni || !nj) continue;
    const pos = h.position ?? (h.end === 'start' ? 0 : 1);
    const s = worldToScreen(ni.x + (nj.x - ni.x) * pos, ni.y + (nj.y - ni.y) * pos);
    const current = h.step === stepIndex;
    const axial = (h as { kind?: string }).kind === 'axial';
    const r = current ? 9 : 7.5;
    ctx.beginPath();
    if (axial) ctx.rect(s.x - r, s.y - r, 2 * r, 2 * r);
    else ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = current ? 'rgba(233, 69, 96, 0.95)' : 'rgba(150, 60, 75, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = current ? 2 : 1.2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${current ? 10 : 9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(order + 1), s.x, s.y);
  }
}
