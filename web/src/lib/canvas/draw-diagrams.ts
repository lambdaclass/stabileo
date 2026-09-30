// Render M, V, N diagrams on Canvas 2D

import { transverseSign } from '../engine/transverse-sign-2d';
import type { AnalysisResults, EnvelopeDiagramData } from '../engine/types';
import { createLabelCollector, type LabelCollector } from './label-layout';
import {
  computeMomentDiagram, computeShearDiagram, computeAxialDiagram,
  computeDiagramValueAt,
  type ElementDiagram,
} from '../engine/diagrams';
import { toDisplay, unitLabel, type UnitSystem } from '../utils/units';

export type DiagramKind = 'moment' | 'shear' | 'axial';

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getNode: (id: number) => { x: number; y: number } | undefined;
  getElement: (id: number) => { nodeI: number; nodeJ: number } | undefined;
  /** The frame's shared label layout, when the caller runs one. */
  labels?: LabelCollector;
}

/*
 * Diagram colours, on the application's palette.
 *
 * These were royal blue, lime green and medium orchid — CSS named colours from
 * a different era of the product, at a saturation nothing else on screen uses.
 * Three fully saturated hues over a quiet model made the diagram shout louder
 * than the structure it describes.
 *
 * The assignment is not arbitrary. Moment takes the accent because it is the
 * diagram an engineer reads first; shear takes the blue already meaning
 * compression in the truss figure; axial takes amber, kept away from the
 * red/blue pair so a signed axial colour map is never confused with it.
 */
const DIAGRAM_COLORS: Record<DiagramKind, { fill: string; stroke: string; text: string }> = {
  moment: { fill: 'rgba(229, 72, 42, 0.22)', stroke: '#e5482a', text: '#f07a62' },
  shear:  { fill: 'rgba(74, 143, 212, 0.22)', stroke: '#4a8fd4', text: '#7fb0e2' },
  axial:  { fill: 'rgba(217, 164, 65, 0.22)', stroke: '#d9a441', text: '#e5bd77' },
};

/**
 * Compute the maximum absolute value across all elements for a given diagram kind.
 * Used to establish a consistent scale when overlaying multiple diagrams.
 */
export function computeDiagramGlobalMax(results: AnalysisResults, kind: DiagramKind): number {
  let globalMax = 0;
  const N = 20;
  for (const ef of results.elementForces) {
    // Sample the full diagram (including point load effects) at N+1 points,
    // plus extra points around each point load to capture discontinuities.
    const sampleTs: number[] = [];
    for (let i = 0; i <= N; i++) sampleTs.push(i / N);
    for (const pl of ef.pointLoads ?? []) {
      const tPl = pl.a / ef.length;
      if (tPl > 1e-6) sampleTs.push(tPl - 1e-6);
      sampleTs.push(tPl);
      if (tPl < 1 - 1e-6) sampleTs.push(tPl + 1e-6);
    }
    for (const t of sampleTs) {
      const val = Math.abs(computeDiagramValueAt(kind, t, ef));
      if (val > globalMax) globalMax = val;
    }
  }
  return globalMax;
}

/**
 * Draw M, V, or N diagram for all elements.
 * Pass globalMaxOverride to share scale across multiple overlaid diagrams.
 */
export function drawDiagrams(
  results: AnalysisResults,
  kind: DiagramKind,
  dc: DrawContext,
  scaleMult: number = 1,
  showAllValues: boolean = false,
  colorOverride?: { fill: string; stroke: string; text: string },
  globalMaxOverride?: number,
  towardLocalAxes: boolean = false,
): void {
  const colors = colorOverride ?? DIAGRAM_COLORS[kind];

  // Use shared globalMax if provided, otherwise compute from this diagram alone
  const globalMax = globalMaxOverride ?? computeDiagramGlobalMax(results, kind);

  if (globalMax < 1e-10) return; // Nothing to draw

  // Target diagram height in pixels (~60px), scaled by user multiplier
  const DIAGRAM_PX = 60 * scaleMult;
  const scale = DIAGRAM_PX / globalMax;

  for (const ef of results.elementForces) {
    const elem = dc.getElement(ef.elementId);
    if (!elem) continue;
    const nodeI = dc.getNode(elem.nodeI);
    const nodeJ = dc.getNode(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    let diagram: ElementDiagram;
    const pLoads = ef.pointLoads ?? [];
    if (kind === 'moment') {
      diagram = computeMomentDiagram(
        ef.mStart, ef.mEnd, ef.vStart, ef.qI, ef.qJ,
        ef.length, nodeI.x, nodeI.y, nodeJ.x, nodeJ.y,
        pLoads,
      );
    } else if (kind === 'shear') {
      diagram = computeShearDiagram(
        ef.vStart, ef.qI, ef.qJ, ef.length,
        nodeI.x, nodeI.y, nodeJ.x, nodeJ.y,
        pLoads,
      );
    } else {
      diagram = computeAxialDiagram(
        ef.nStart, ef.nEnd, ef.length,
        nodeI.x, nodeI.y, nodeJ.x, nodeJ.y,
        pLoads,
      );
    }
    diagram.elementId = ef.elementId;

    drawSingleDiagram(dc, diagram, scale, colors, ef.length, nodeI, nodeJ, kind, showAllValues, globalMax, towardLocalAxes);
  }
}

/**
 * Side on which a positive diagram value is plotted.
 *
 * The offset is `value · perp` with `perp` the member's drawn local +z (UP for
 * a horizontal member, +X for a vertical one; transverse-sign-2d.ts). Engine moments are hogging-positive,
 * so a sagging moment (engine value < 0) naturally plots on the structural /
 * tension side (DOWN); shear & axial use raw values and plot toward local +z (UP).
 *
 * Default (towardLocalAxes = false): unify N/V/M on the structural side — keep
 * moment as-is, flip shear & axial so positive plots DOWN (right for columns).
 * towardLocalAxes = true: unify toward the local positive axis — flip moment,
 * keep shear & axial (so all plot toward local +z, UP for a horizontal member).
 */
function diagramSideFactor(kind: DiagramKind, towardLocalAxes: boolean): 1 | -1 {
  const isMoment = kind === 'moment';
  if (towardLocalAxes) return isMoment ? -1 : 1;
  return isMoment ? 1 : -1;
}

function drawSingleDiagram(
  dc: DrawContext,
  diagram: ElementDiagram,
  scale: number,
  colors: { fill: string; stroke: string; text: string },
  length: number,
  nodeI: { x: number; y: number },
  nodeJ: { x: number; y: number },
  kind: DiagramKind,
  showAllValues: boolean = false,
  globalMax: number = 1,
  towardLocalAxes: boolean = false,
) {
  const { ctx } = dc;
  const pts = diagram.points;
  if (pts.length < 2) return;
  const sideFactor = diagramSideFactor(kind, towardLocalAxes);

  // Element direction and perpendicular (terna derecha)
  // Perpendicular = 90° CCW from element direction = LEFT of i→j
  // For horizontal beam going right: perpendicular points UP (world +Z in Z-up convention)
  // All diagrams drawn consistently: positive values on +perp side
  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;
  // The drawn local z: the results are published in the drawn axes
  // (transverse-sign-2d.ts), so positive values go toward it.
  const zs = transverseSign(dx, dy);
  const perpX = zs * -dy / length;
  const perpY = zs * dx / length;

  // Build screen-space polygon
  const screenBaseline: { x: number; y: number }[] = [];
  const screenDiagram: { x: number; y: number }[] = [];

  for (const p of pts) {
    const base = dc.worldToScreen(p.x, p.y);
    screenBaseline.push(base);

    const offsetWorld = {
      x: p.x + p.value * sideFactor * scale / 50 * perpX,
      y: p.y + p.value * sideFactor * scale / 50 * perpY,
    };
    screenDiagram.push(dc.worldToScreen(offsetWorld.x, offsetWorld.y));
  }

  // Fill polygon: baseline forward, diagram backward
  ctx.beginPath();
  ctx.moveTo(screenBaseline[0].x, screenBaseline[0].y);
  for (let i = 1; i < screenBaseline.length; i++) {
    ctx.lineTo(screenBaseline[i].x, screenBaseline[i].y);
  }
  for (let i = screenDiagram.length - 1; i >= 0; i--) {
    ctx.lineTo(screenDiagram[i].x, screenDiagram[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = colors.fill;
  ctx.fill();

  // Stroke the diagram line
  ctx.beginPath();
  ctx.moveTo(screenDiagram[0].x, screenDiagram[0].y);
  for (let i = 1; i < screenDiagram.length; i++) {
    ctx.lineTo(screenDiagram[i].x, screenDiagram[i].y);
  }
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw value labels at endpoints and max point (only when showAllValues is on)
  if (showAllValues) {
    const labels = dc.labels ?? createLabelCollector();

    const startVal = pts[0].value;
    const endVal = pts[pts.length - 1].value;

    if (Math.abs(startVal) > 1e-3) {
      drawValueLabel(labels, colors.text, screenDiagram[0], screenBaseline[0], formatValue(startVal, kind));
    }
    if (Math.abs(endVal) > 1e-3) {
      const last = pts.length - 1;
      drawValueLabel(labels, colors.text, screenDiagram[last], screenBaseline[last], formatValue(endVal, kind));
    }

    // Label at max absolute value (if not at endpoints)
    if (diagram.maxAbsT > 0.05 && diagram.maxAbsT < 0.95 && Math.abs(diagram.maxAbsValue) > 1e-3) {
      const idx = Math.round(diagram.maxAbsT * (pts.length - 1));
      drawValueLabel(labels, colors.text, screenDiagram[idx], screenBaseline[idx], formatValue(diagram.maxAbsValue, kind));
    }

    // A caller without a shared collector still gets its own labels resolved.
    if (!dc.labels) labels.flush(ctx);
  }

  /*
   * Auto max/min markers (filled circles at extremes).
   *
   * Registered with the layout as well as drawn: the maximum's own value label
   * is placed at the very point the marker occupies, so without this the dot
   * lands on the first character of its own number.
   */
  const threshold = globalMax * 0.05;
  let maxPosIdx = -1, maxPosVal = 0;
  let minNegIdx = -1, minNegVal = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].value > maxPosVal) { maxPosVal = pts[i].value; maxPosIdx = i; }
    if (pts[i].value < minNegVal) { minNegVal = pts[i].value; minNegIdx = i; }
  }

  // Draw max positive marker (if significant and not at endpoints)
  if (maxPosIdx > 0 && maxPosIdx < pts.length - 1 && maxPosVal > threshold) {
    const m = screenDiagram[maxPosIdx];
    ctx.beginPath();
    ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colors.stroke;
    ctx.fill();
    dc.labels?.block({ x1: m.x, y1: m.y, x2: m.x, y2: m.y, pad: 6 });
  }

  // Draw min negative marker (if significant and not at endpoints)
  if (minNegIdx > 0 && minNegIdx < pts.length - 1 && Math.abs(minNegVal) > threshold) {
    const m = screenDiagram[minNegIdx];
    ctx.beginPath();
    ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colors.stroke;
    ctx.fill();
    dc.labels?.block({ x1: m.x, y1: m.y, x2: m.x, y2: m.y, pad: 6 });
  }
}

/**
 * Offer a diagram value to the frame's label layout.
 *
 * Diagram values collide with each other for a reason that has nothing to do
 * with loads: two members meeting at a joint each label their end there, so the
 * two values land within a few pixels — one hogging, one sagging, both
 * unreadable. Pushing each one further along its own offset direction, away
 * from the baseline, separates them without detaching either from its curve.
 */
function drawValueLabel(
  labels: LabelCollector,
  colour: string,
  diagramPt: { x: number; y: number },
  basePt: { x: number; y: number },
  text: string,
) {
  const offsetX = diagramPt.x - basePt.x;
  const offsetY = diagramPt.y - basePt.y;
  const dist = Math.sqrt(offsetX ** 2 + offsetY ** 2);

  if (dist < 3) return; // Too small to label

  const ux = offsetX / dist;
  const uy = offsetY / dist;
  labels.add({
    text,
    colour,
    font: '11px sans-serif',
    box: {
      x: diagramPt.x + ux * 5, y: diagramPt.y + uy * 5,
      // Measured by the collector against the real font; see there.
      width: 0, height: 13,
      dirX: ux, dirY: uy, sweep: 'any', anchorX: 'left',
      // Bigger numbers keep their place: they are the ones being looked for.
      priority: Math.abs(parseFloat(text)) || 0,
    },
  });
}

let _unitSystem: UnitSystem = 'SI';

/** Set the unit system for diagram labels. Called before drawing. */
export function setDiagramUnitSystem(us: UnitSystem): void {
  _unitSystem = us;
}

function formatValue(value: number, kind: DiagramKind): string {
  const qty = kind === 'moment' ? 'moment' as const : 'force' as const;
  // Negate moment values for display: internal convention is hogging=positive,
  // but standard engineering convention is sagging=positive
  const displayed = toDisplay(kind === 'moment' ? -value : value, qty, _unitSystem);
  const abs = Math.abs(displayed);
  const sign = displayed < 0 ? '-' : '';
  const formatted = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  const unit = ' ' + unitLabel(qty, _unitSystem);
  return sign + formatted + unit;
}

// ─── Envelope Diagram Rendering ──────────────────────────────────

/*
 * Envelope colours: the same hue for the positive branch as the plain diagram,
 * and a muted counter-hue for the negative one, so an envelope reads as the
 * same quantity with two bounds rather than as two unrelated plots.
 */
const ENVELOPE_COLORS: Record<DiagramKind, {
  posFill: string; posStroke: string; posText: string;
  negFill: string; negStroke: string; negText: string;
}> = {
  moment: {
    posFill: 'rgba(229,72,42,0.16)', posStroke: '#e5482a', posText: '#f07a62',
    negFill: 'rgba(74,143,212,0.16)', negStroke: '#4a8fd4', negText: '#7fb0e2',
  },
  shear: {
    posFill: 'rgba(74,143,212,0.16)', posStroke: '#4a8fd4', posText: '#7fb0e2',
    negFill: 'rgba(229,72,42,0.16)',  negStroke: '#e5482a', negText: '#f07a62',
  },
  axial: {
    posFill: 'rgba(217,164,65,0.16)', posStroke: '#d9a441', posText: '#e5bd77',
    negFill: 'rgba(143,163,179,0.16)', negStroke: '#8fa3b3', negText: '#a8b8c6',
  },
};

/**
 * Draw envelope diagram with dual curves (max positive + max negative)
 * for all elements in the structure.
 */
export function drawEnvelopeDiagrams(
  envelopeData: EnvelopeDiagramData,
  dc: DrawContext,
  scaleMult: number = 1,
  showAllValues: boolean = false,
  towardLocalAxes: boolean = false,
): void {
  if (envelopeData.globalMax < 1e-10) return;

  const DIAGRAM_PX = 60 * scaleMult;
  const scale = DIAGRAM_PX / envelopeData.globalMax;
  const kind = envelopeData.kind;
  const colors = ENVELOPE_COLORS[kind];
  const sideFactor = diagramSideFactor(kind, towardLocalAxes);
  const envLabels = dc.labels ?? createLabelCollector();

  for (const elemEnv of envelopeData.elements) {
    const elem = dc.getElement(elemEnv.elementId);
    if (!elem) continue;
    const nodeI = dc.getNode(elem.nodeI);
    const nodeJ = dc.getNode(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1e-10) continue;
    const zs = transverseSign(dx, dy);
    const perpX = zs * -dy / length;
    const perpY = zs * dx / length;

    const nPts = elemEnv.tPositions.length;

    // Compute baseline screen points + offset points for pos and neg
    const screenBaseline: { x: number; y: number }[] = [];
    const screenPos: { x: number; y: number }[] = [];
    const screenNeg: { x: number; y: number }[] = [];

    for (let j = 0; j < nPts; j++) {
      const t = elemEnv.tPositions[j];
      const wx = nodeI.x + t * dx;
      const wy = nodeI.y + t * dy;
      screenBaseline.push(dc.worldToScreen(wx, wy));

      const posVal = elemEnv.posValues[j];
      screenPos.push(dc.worldToScreen(
        wx + posVal * sideFactor * scale / 50 * perpX,
        wy + posVal * sideFactor * scale / 50 * perpY,
      ));

      const negVal = elemEnv.negValues[j];
      screenNeg.push(dc.worldToScreen(
        wx + negVal * sideFactor * scale / 50 * perpX,
        wy + negVal * sideFactor * scale / 50 * perpY,
      ));
    }

    // Draw positive envelope curve (if any positive values)
    const hasPos = elemEnv.posValues.some(v => v > 1e-6);
    if (hasPos) {
      drawEnvelopeCurve(dc.ctx, screenBaseline, screenPos, colors.posFill, colors.posStroke);
      // Labels
      drawEnvelopeLabels(dc.ctx, envLabels, screenBaseline, screenPos, elemEnv.posValues, kind, colors.posText, showAllValues, envelopeData.globalMax);
    }

    // Draw negative envelope curve (if any negative values)
    const hasNeg = elemEnv.negValues.some(v => v < -1e-6);
    if (hasNeg) {
      drawEnvelopeCurve(dc.ctx, screenBaseline, screenNeg, colors.negFill, colors.negStroke);
      // Labels
      drawEnvelopeLabels(dc.ctx, envLabels, screenBaseline, screenNeg, elemEnv.negValues, kind, colors.negText, showAllValues, envelopeData.globalMax);
    }
  }

  if (!dc.labels) envLabels.flush(dc.ctx);
}

function drawEnvelopeCurve(
  ctx: CanvasRenderingContext2D,
  baseline: { x: number; y: number }[],
  curve: { x: number; y: number }[],
  fillColor: string,
  strokeColor: string,
): void {
  // Fill polygon: baseline forward, curve backward
  ctx.beginPath();
  ctx.moveTo(baseline[0].x, baseline[0].y);
  for (let i = 1; i < baseline.length; i++) {
    ctx.lineTo(baseline[i].x, baseline[i].y);
  }
  for (let i = curve.length - 1; i >= 0; i--) {
    ctx.lineTo(curve[i].x, curve[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Stroke the curve
  ctx.beginPath();
  ctx.moveTo(curve[0].x, curve[0].y);
  for (let i = 1; i < curve.length; i++) {
    ctx.lineTo(curve[i].x, curve[i].y);
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawEnvelopeLabels(
  ctx: CanvasRenderingContext2D,
  labels: LabelCollector,
  baseline: { x: number; y: number }[],
  curve: { x: number; y: number }[],
  values: number[],
  kind: DiagramKind,
  textColor: string,
  showAllValues: boolean,
  globalMax: number,
): void {
  const nPts = values.length;

  if (showAllValues) {
    // Label at endpoints if significant
    if (Math.abs(values[0]) > 1e-3) {
      drawValueLabel(labels, textColor, curve[0], baseline[0], formatValue(values[0], kind));
    }
    if (Math.abs(values[nPts - 1]) > 1e-3) {
      drawValueLabel(labels, textColor, curve[nPts - 1], baseline[nPts - 1], formatValue(values[nPts - 1], kind));
    }

    // Find and label max absolute value (not at endpoints)
    let maxAbsIdx = -1;
    let maxAbsVal = 0;
    for (let i = 1; i < nPts - 1; i++) {
      if (Math.abs(values[i]) > maxAbsVal) {
        maxAbsVal = Math.abs(values[i]);
        maxAbsIdx = i;
      }
    }
    if (maxAbsIdx > 0 && maxAbsVal > globalMax * 0.05) {
      drawValueLabel(labels, textColor, curve[maxAbsIdx], baseline[maxAbsIdx], formatValue(values[maxAbsIdx], kind));
      // Marker dot
      ctx.beginPath();
      ctx.arc(curve[maxAbsIdx].x, curve[maxAbsIdx].y, 4, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.fillStyle = textColor;
    }
  }
}
