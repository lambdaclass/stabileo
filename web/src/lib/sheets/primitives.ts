/**
 * What a sheet is drawn with: one list of primitives, in paper millimetres (origin at the sheet's
 * lower left, y up), each on a declared layer. The screen (SVG), the DXF and the PDF are three
 * renderings of the same list, so what is shown is what is exported.
 *
 * A dimension is an entity of its own, not lines and a text: the DXF writes it as a DIMENSION and
 * the other two draw its parts.
 */
export type LayerName = string;

export type Primitive =
  | { kind: 'line'; layer: LayerName; a: P; b: P; dash?: boolean }
  | { kind: 'polyline'; layer: LayerName; points: P[]; closed?: boolean; fill?: boolean }
  | { kind: 'circle'; layer: LayerName; c: P; r: number; fill?: boolean }
  | { kind: 'arc'; layer: LayerName; c: P; r: number; start: number; end: number }
  | { kind: 'text'; layer: LayerName; at: P; text: string; height: number; align?: 'left' | 'center' | 'right'; rotation?: number }
  | { kind: 'dimension'; layer: LayerName; a: P; b: P; offset: number; text?: string; height?: number };

export type P = { x: number; y: number };

/** The points of a dimension: its two extension lines, the dimension line and the text position. */
export function dimensionGeometry(d: Extract<Primitive, { kind: 'dimension' }>) {
  const dx = d.b.x - d.a.x, dy = d.b.y - d.a.y, L = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / L, y: dx / L };
  const a2 = { x: d.a.x + n.x * d.offset, y: d.a.y + n.y * d.offset }, b2 = { x: d.b.x + n.x * d.offset, y: d.b.y + n.y * d.offset };
  const h = d.height ?? 2.5;
  return {
    ext: [[d.a, a2], [d.b, b2]] as [P, P][],
    line: [a2, b2] as [P, P],
    textAt: { x: (a2.x + b2.x) / 2 + n.x * h * 0.6, y: (a2.y + b2.y) / 2 + n.y * h * 0.6 },
    // Read from below or from the right, never upside down.
    angle: ((a) => (a > 90 ? a - 180 : a <= -90 ? a + 180 : a))((Math.atan2(dy, dx) * 180) / Math.PI),
    length: L,
  };
}

/** Bounding box of a list of primitives, paper mm. */
/** `textScale`: model units per paper millimetre, so a text's printed size is measured in the
 *  drawing's own units (1 for primitives already on paper). */
export function bounds(ps: readonly Primitive[], textScale = 1): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p: P) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
  for (const p of ps) {
    if (p.kind === 'line') { add(p.a); add(p.b); }
    else if (p.kind === 'polyline') p.points.forEach(add);
    else if (p.kind === 'circle' || p.kind === 'arc') { add({ x: p.c.x - p.r, y: p.c.y - p.r }); add({ x: p.c.x + p.r, y: p.c.y + p.r }); }
    else if (p.kind === 'text') { add(p.at); add({ x: p.at.x + p.text.length * p.height * 0.6 * textScale, y: p.at.y + p.height * textScale }); }
    else { const g = dimensionGeometry(p); add(p.a); add(p.b); add(g.line[0]); add(g.line[1]); }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}

/** Move and scale primitives: model millimetres at 1:`scale` placed at `origin` on the paper. */
export function place(ps: readonly Primitive[], scale: number, origin: P, from: P = { x: 0, y: 0 }): Primitive[] {
  const f = (p: P): P => ({ x: origin.x + (p.x - from.x) / scale, y: origin.y + (p.y - from.y) / scale });
  return ps.map((p) => {
    switch (p.kind) {
      case 'line': return { ...p, a: f(p.a), b: f(p.b) };
      case 'polyline': return { ...p, points: p.points.map(f) };
      case 'circle': return { ...p, c: f(p.c), r: p.r / scale };
      case 'arc': return { ...p, c: f(p.c), r: p.r / scale };
      // Text keeps its paper height: a 2,5 mm label is 2,5 mm at any scale.
      case 'text': return { ...p, at: f(p.at) };
      case 'dimension': return { ...p, a: f(p.a), b: f(p.b), text: p.text ?? `${Math.round(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))}` };
    }
  });
}
