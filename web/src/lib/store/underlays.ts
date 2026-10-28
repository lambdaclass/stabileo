/**
 * Templates from a DXF (`model/underlay.ts`): one drawing, or each region of it, laid at a level
 * by a point of the drawing onto a point of the model; aligned by two such pairs; edited without
 * ever moving the structure modelled on it. A template is not the model and touches no result.
 */
import { modelStore } from './model.svelte';
import { cadSegments, type Underlay } from '../model/underlay';
import { cadShapes, type DrawingRegion } from '../model/underlay-regions';
import type { CadDocument, CadUnit } from '../cad/types';

export interface LayOptions {
  name: string;
  unit: CadUnit;
  layers: readonly string[];
  region?: DrawingRegion | null;
  /** The drawing point (m, drawing coordinates) laid onto `target` (m, model plan). */
  ref?: { x: number; y: number };
  target?: { x: number; y: number };
  levelId?: string;
  z: number;
  source?: string;
}

/** A template from a drawing, or from one region of it; null when it holds no segment. */
export function underlayFromDrawing(doc: CadDocument, o: LayOptions): { underlay: Underlay; truncated: boolean } | null {
  const layers = [...o.layers];
  const box = o.region?.box ?? null;
  const { segments, truncated, segLayer } = cadSegments(doc, o.unit, new Set(layers), { box, layerOrder: layers });
  if (segments.length < 4) return null;
  const { shapes, leftOut } = cadShapes(doc, o.unit, layers, box);
  const ref = o.ref ?? (o.region ? o.region.ref : { x: 0, y: 0 });
  const target = o.target ?? { x: 0, y: 0 };
  const underlay: Underlay = {
    id: `ul-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`, name: o.name,
    ...(o.levelId ? { levelId: o.levelId } : {}), z: o.z,
    segments, dx: target.x - ref.x, dy: target.y - ref.y, rotationDeg: 0, visible: true, layers,
    ...(segLayer ? { segLayer } : {}), unit: o.unit, ...(box ? { region: { ...box } } : {}), ref: { ...ref },
    shapes, ...(Object.keys(leftOut).length ? { leftOut } : {}), ...(o.source ? { source: o.source } : {}),
  };
  return { underlay, truncated };
}

/** Add templates to the project (the view channel: its own undo, no result touched). */
export function addUnderlays(list: readonly Underlay[]): void {
  modelStore.setUnderlays([...modelStore.underlays, ...list]);
}

/** Change a template; a locked one only in what does not move it (its visibility, layers, opacity, lock). */
export function editUnderlay(id: string, patch: Partial<Underlay>): boolean {
  const u = modelStore.underlays.find((x) => x.id === id);
  if (!u) return false;
  const moves = ['dx', 'dy', 'rotationDeg', 'z', 'levelId', 'segments', 'shapes', 'region', 'ref'].some((k) => k in patch);
  if (u.locked && moves && !('locked' in patch && patch.locked === false)) return false;
  modelStore.setUnderlays(modelStore.underlays.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return true;
}

export function removeUnderlay(id: string): void {
  modelStore.setUnderlays(modelStore.underlays.filter((x) => x.id !== id));
}

/**
 * Lay a template by two pairs of points, drawing → model: the turn and shift that take the first
 * drawing point onto the first model point and the second onto the line to the second. Says how
 * far the two distances differ (a scale the unit may have got wrong); never scales the drawing.
 */
export function alignByPoints(u: Underlay, pairs: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>): { dx: number; dy: number; rotationDeg: number; scaleMismatch: number | null } {
  const [p, q] = pairs;
  if (!p) return { dx: u.dx, dy: u.dy, rotationDeg: u.rotationDeg, scaleMismatch: null };
  let th = (u.rotationDeg * Math.PI) / 180;
  let mismatch: number | null = null;
  if (q) {
    const a1 = Math.atan2(q.from.y - p.from.y, q.from.x - p.from.x), a2 = Math.atan2(q.to.y - p.to.y, q.to.x - p.to.x);
    th = a2 - a1;
    const d1 = Math.hypot(q.from.x - p.from.x, q.from.y - p.from.y), d2 = Math.hypot(q.to.x - p.to.x, q.to.y - p.to.y);
    mismatch = d1 > 0 ? d2 / d1 - 1 : null;
  }
  const c = Math.cos(th), s = Math.sin(th);
  const rx = p.from.x * c - p.from.y * s, ry = p.from.x * s + p.from.y * c;
  const deg = Math.round(((th * 180) / Math.PI) * 1e9) / 1e9;
  return { dx: p.to.x - rx, dy: p.to.y - ry, rotationDeg: ((deg % 360) + 360) % 360, scaleMismatch: mismatch };
}

/**
 * Replace a template's drawing with another file, keeping its level and placement (a revised plan
 * comes in where the old one was). Refused for a locked template.
 */
export function replaceUnderlayDrawing(id: string, doc: CadDocument, o: Pick<LayOptions, 'unit' | 'layers' | 'source'>): boolean {
  const u = modelStore.underlays.find((x) => x.id === id);
  if (!u || u.locked) return false;
  const next = underlayFromDrawing(doc, { name: u.name, unit: o.unit, layers: o.layers, region: u.region ? { box: u.region, count: 0, ref: u.ref ?? { x: u.region.minX, y: u.region.minY } } : null, z: u.z, ...(u.levelId ? { levelId: u.levelId } : {}), ...(o.source ? { source: o.source } : {}) });
  if (!next) return false;
  const { id: _id, dx: _dx, dy: _dy, rotationDeg: _r, ref: _ref, ...drawing } = next.underlay;
  modelStore.setUnderlays(modelStore.underlays.map((x) => (x.id === id ? { ...x, ...drawing } : x)));
  return true;
}
