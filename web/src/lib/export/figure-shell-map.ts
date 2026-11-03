/**
 * The shells of a figure painted by one result: the field the screen paints them with
 * (`currentShellContourField`: nodal or centre values, its averaging domain, face, range and bands),
 * each face cut along the steps of its scale where the screen's blended field crosses them, with the
 * scale beside the structure.
 */
import type { AnalysisResults3D } from '../engine/types-3d';
import { shellComponentMeta, type ShellContourComponent } from '../engine/shell-stress';
import { bandEdges, bandValue } from '../engine/contour-scale';
import { shellContourColor } from '../three/stress-heatmap';
import { faceVertexWeights } from '../three/create-shell-mesh';
import { currentShellContourField } from '../store/shell-contour';
import { contourOptions } from '../store/contour-options.svelte';
import type { createLabelCollector } from '../canvas/label-layout';
import type { P3 } from '../canvas/free-body';
import { RAW_INK } from './paper-ink';

type XY = { x: number; y: number };
const SMOOTH_STEPS = 24;

/** A value's colour on the figure: the screen's contour ramp, or a grey ramp in black and white. */
export function bandColour(v: number, min: number, max: number, style: string): string {
  if (style === 'bw') {
    const t = max > min ? (v - min) / (max - min) : 0.5;
    const g = Math.round(235 - 175 * Math.max(0, Math.min(1, t)));
    return `${RAW_INK}rgb(${g},${g},${g})`;
  }
  return `${RAW_INK}#${shellContourColor(v, min, max).toString(16).padStart(6, '0')}`;
}

type Vertex = XY & { value: number };

function keepSide(poly: readonly Vertex[], level: number, sign: 1 | -1): Vertex[] {
  const out: Vertex[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const fp = sign * (p.value - level), fq = sign * (q.value - level);
    if (fp >= 0) out.push(p);
    if ((fp > 0 && fq < 0) || (fp < 0 && fq > 0)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y), value: level });
    }
  });
  return out;
}

/**
 * A face cut into the triangles the screen blends its values across (`faceVertexWeights`), and each
 * of those along the `levels` its linear field crosses: every piece lies between two neighbouring
 * levels and carries the middle of the values it spans.
 */
export function shellPatches(pts: readonly XY[], values: readonly number[], levels: readonly number[]): Array<{ pts: XY[]; value: number }> {
  const n = pts.length;
  if (values.length !== n || n < 3) return [];
  const ws = faceVertexWeights(n);
  const at = (w: readonly number[]): Vertex => ({
    x: w.reduce((a, k, i) => a + k * pts[i]!.x, 0), y: w.reduce((a, k, i) => a + k * pts[i]!.y, 0),
    value: w.reduce((a, k, i) => a + k * values[i]!, 0),
  });
  const out: Array<{ pts: XY[]; value: number }> = [];
  for (let t = 0; t + 2 < ws.length; t += 3) {
    const tri = [at(ws[t]!), at(ws[t + 1]!), at(ws[t + 2]!)];
    const lo = Math.min(...tri.map((v) => v.value)), hi = Math.max(...tri.map((v) => v.value));
    const bounds = [lo, ...levels.filter((l) => l > lo && l < hi).sort((a, b) => a - b), hi];
    if (hi === lo) { out.push({ pts: tri.map(({ x, y }) => ({ x, y })), value: lo }); continue; }
    for (let k = 0; k + 1 < bounds.length; k++) {
      const piece = keepSide(keepSide(tri, bounds[k]!, 1), bounds[k + 1]!, -1);
      if (piece.length >= 3) out.push({ pts: piece.map(({ x, y }) => ({ x, y })), value: (bounds[k]! + bounds[k + 1]!) / 2 });
    }
  }
  return out;
}

export type DrawShells = (fill?: (key: string) => string | null, move?: (nodeId: number) => P3 | undefined, paint?: (key: string, pts: XY[]) => boolean) => void;

export function drawShellMap(
  ctx: CanvasRenderingContext2D,
  component: ShellContourComponent,
  style: string,
  r3d: AnalysisResults3D | null | undefined,
  shellFaces: () => Array<{ key: string; id: number; nodes: number[] }>,
  drawShells: DrawShells,
  toScreen: (p: P3) => XY,
  scenePos: (id: number) => P3 | undefined,
  values: boolean,
  labels: ReturnType<typeof createLabelCollector>,
): void {
  const field = r3d ? currentShellContourField(r3d, component) : null;
  if (!field || field.corners.size === 0) { drawShells(); return; }
  const { min, max } = field.range;
  const bands = contourOptions.bands;
  const colour = (v: number) => bandColour(bandValue(v, min, max, bands), min, max, style);
  const levels = bandEdges(min, max, bands > 0 ? bands : SMOOTH_STEPS);
  drawShells(undefined, undefined, (key, pts) => {
    const vs = field.corners.get(key);
    if (!vs || vs.length !== pts.length) return false;
    for (const p of shellPatches(pts, vs, levels)) {
      ctx.beginPath();
      p.pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      const c = colour(p.value);
      ctx.fillStyle = c; ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 0.4; ctx.stroke();
    }
    return true;
  });

  let x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const f of shellFaces()) for (const id of f.nodes) {
    const p = scenePos(id); if (!p) continue;
    const c = toScreen(p);
    x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
  }
  if (!Number.isFinite(x1)) return;
  const meta = shellComponentMeta(component);
  const fmt = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : v.toFixed(Math.abs(v) >= 100 ? 0 : 2));
  const h = Math.max(120, Math.min(260, y1 - y0)), w = 14, x = x1 + 36, top = (y0 + y1) / 2 - h / 2;
  const steps = bands > 0 ? bands : SMOOTH_STEPS;
  ctx.save();
  for (let k = 0; k < steps; k++) {
    ctx.fillStyle = colour(max - ((max - min) * (k + 0.5)) / steps);
    ctx.fillRect(x, top + (h * k) / steps, w, h / steps + 0.5);
  }
  ctx.strokeStyle = '#8fa3b3'; ctx.lineWidth = 0.8; ctx.strokeRect(x, top, w, h);
  ctx.fillStyle = '#c7d3dd'; ctx.font = '10.5px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (max - min > 1e-9 * Math.max(1, Math.abs(max))) {
    ctx.fillText(fmt(max), x + w + 6, top);
    ctx.fillText(fmt((max + min) / 2), x + w + 6, top + h / 2);
    ctx.fillText(fmt(min), x + w + 6, top + h);
  } else {
    ctx.fillText(fmt(max), x + w + 6, top + h / 2);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${meta.label} [${meta.unit}]`, x, top - 10);
  ctx.restore();

  if (values) {
    let best: { key: string; i: number; v: number } | null = null;
    for (const [key, vs] of field.corners) vs.forEach((v, i) => { if (!best || Math.abs(v) > Math.abs(best.v)) best = { key, i, v }; });
    const peak = best as { key: string; i: number; v: number } | null;
    const f = peak ? shellFaces().find((s) => s.key === peak.key) : undefined;
    const p = f && peak ? scenePos(f.nodes[peak.i]!) : undefined;
    if (peak && p) {
      const c = toScreen(p);
      labels.add({ text: fmt(peak.v), colour: '#f4f7fa', font: 'bold 10.5px sans-serif', box: { x: c.x, y: c.y - 6, width: 0, height: 0, dirX: 0, dirY: -1, priority: Math.abs(peak.v), anchorX: 'center', sweep: 'any' } });
    }
  }
}
