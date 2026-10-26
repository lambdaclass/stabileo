/**
 * Adjustments a person makes to the composed sheets, kept as differences keyed by the drawings'
 * stable keys (`<entry>:<drawing>`), so a regeneration lays the sheets out again and then applies
 * them: a drawing at another scale, moved to the sheet of another drawing (its tables and sections
 * with it), placed at a point of its sheet, texts and dimensions moved inside it, and annotations
 * of one's own. An adjustment made when the drawing had another size is not applied over the new
 * one: it is listed, to be looked at again.
 *
 * Pure.
 */
import type { DrawingInput } from './compose';
import type { P, Primitive } from './primitives';

export interface DrawingAdjust {
  /** A scale (1:n) instead of the one that fits. */
  scale?: number;
  /** On the sheet of this drawing, right after it. */
  withDrawing?: string;
  /** Its lower left on its sheet, paper mm. */
  at?: P;
  /** The drawing's size (model units) when the adjustment was made: a change means it no longer holds. */
  size?: { w: number; h: number };
  /** Texts and dimensions moved inside it, paper mm, by `textKey`. */
  moves?: Record<string, P>;
}

export interface SheetAnnotation { id: string; /** On the sheet of this drawing. */ onDrawing: string; at: P; text: string; height: number }

export interface SheetLayout { drawings: Record<string, DrawingAdjust>; annotations: SheetAnnotation[] }
export const emptyLayout = (): SheetLayout => ({ drawings: {}, annotations: [] });

/** A text's or dimension's key inside its drawing: its kind, its order among them and what it reads. */
export function textKeys(ps: readonly Primitive[]): Map<number, string> {
  const out = new Map<number, string>();
  let n = 0;
  ps.forEach((p, i) => {
    if (p.kind === 'text') out.set(i, `t${n++}:${p.text}`);
    // A dimension by its order alone: its text is the measured length, written when it is placed.
    else if (p.kind === 'dimension') out.set(i, `d${n++}`);
  });
  return out;
}

/** The drawings that go with one (its tables, breakdowns and sections): keys that start with its own. */
export const linkedTo = (key: string, all: readonly DrawingInput[]): DrawingInput[] => all.filter((d) => d.key !== key && d.key.startsWith(`${key}-`));

const SIZE_TOL = 0.01;
export const sizeChanged = (a: DrawingAdjust, d: DrawingInput) => !!a.size && (Math.abs(a.size.w - d.width) > SIZE_TOL * Math.max(1, a.size.w) || Math.abs(a.size.h - d.height) > SIZE_TOL * Math.max(1, a.size.h));

export interface LayoutConflict { key: string; reason: 'sizeChanged' | 'anchorMissing' | 'textMissing'; detail?: string }

/**
 * The drawings in the order and at the scales the layout says, before they are composed: a drawing
 * moved to another's sheet (with its linked ones) right after that drawing and in its group; the
 * conflicts found (the drawing changed size since, the drawing it goes with is gone).
 */
export function arrangeDrawings(drawings: readonly DrawingInput[], layout: SheetLayout | undefined): { drawings: DrawingInput[]; conflicts: LayoutConflict[] } {
  if (!layout) return { drawings: [...drawings], conflicts: [] };
  const conflicts: LayoutConflict[] = [];
  const byKey = new Map(drawings.map((d) => [d.key, d]));
  // Scales first: they change nothing of the order.
  let list = drawings.map((d) => {
    const a = layout.drawings[d.key];
    if (!a?.scale) return d;
    if (sizeChanged(a, d)) { conflicts.push({ key: d.key, reason: 'sizeChanged' }); return d; }
    return { ...d, scale: a.scale };
  });
  for (const [key, a] of Object.entries(layout.drawings)) {
    if (!a.withDrawing) continue;
    const d = byKey.get(key);
    if (!d) continue;
    const anchor = list.find((x) => x.key === a.withDrawing);
    if (!anchor) { conflicts.push({ key, reason: 'anchorMissing', detail: a.withDrawing }); continue; }
    if (sizeChanged(a, d)) { conflicts.push({ key, reason: 'sizeChanged' }); continue; }
    const moving = [key, ...linkedTo(key, list).map((x) => x.key)];
    const moved = list.filter((x) => moving.includes(x.key)).map((x) => ({ ...x, ...(anchor.group ? { group: anchor.group } : {}), ...(anchor.format ? { format: anchor.format } : {}) }));
    list = list.filter((x) => !moving.includes(x.key));
    const at = list.findIndex((x) => x.key === anchor.key);
    // After the anchor and the drawings that go with it.
    let end = at + 1;
    while (end < list.length && list[end]!.key.startsWith(`${anchor.key}-`)) end++;
    list.splice(end, 0, ...moved);
  }
  return { drawings: list, conflicts };
}

/** A drawing's primitives on its sheet moved by `delta`, paper mm. */
export function translate(ps: readonly Primitive[], d: P): Primitive[] {
  const f = (p: P): P => ({ x: p.x + d.x, y: p.y + d.y });
  return ps.map((p) => {
    switch (p.kind) {
      case 'line': return { ...p, a: f(p.a), b: f(p.b) };
      case 'polyline': return { ...p, points: p.points.map(f) };
      case 'circle': case 'arc': return { ...p, c: f(p.c) };
      case 'text': return { ...p, at: f(p.at) };
      case 'dimension': return { ...p, a: f(p.a), b: f(p.b) };
    }
  });
}
