/**
 * A bar as it is bent: the centreline as a polyline in the bar's own plane, through the
 * intersections of its straight legs, and the mandrel it is bent on. One shape gives the drawing,
 * the cut length, the weight and the bending schedule's sketch, so they cannot disagree.
 */
export interface BarShape {
  /** Vertices in the bar's plane, m: x along the member, y across it (up positive). */
  pts: Array<[number, number]>;
  /** Inside diameter of the bends, m. */
  mandrel: number;
  /** Bar diameter, mm. */
  dia: number;
}

const STEEL_DENSITY = 7850;

const legOf = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Each straight leg vertex to vertex, m. */
export function legLengths(s: BarShape): number[] {
  return s.pts.slice(1).map((p, i) => legOf(s.pts[i]!, p));
}

/** The angle the bar turns through at each inner vertex, rad. */
export function bendAngles(s: BarShape): number[] {
  const out: number[] = [];
  for (let i = 1; i < s.pts.length - 1; i++) {
    const [ax, ay] = s.pts[i - 1]!, [bx, by] = s.pts[i]!, [cx, cy] = s.pts[i + 1]!;
    const u = Math.atan2(by - ay, bx - ax), v = Math.atan2(cy - by, cx - bx);
    let d = Math.abs(v - u);
    if (d > Math.PI) d = 2 * Math.PI - d;
    out.push(d);
  }
  return out;
}

/** Length of steel to cut, m: the legs less what each arc on the mandrel saves on the corner it rounds. */
export function developedLength(s: BarShape): number {
  const r = (s.mandrel + s.dia / 1000) / 2;
  const saved = bendAngles(s).reduce((acc, t) => acc + (t > 1e-9 ? 2 * r * Math.tan(t / 2) - r * t : 0), 0);
  return legLengths(s).reduce((a, b) => a + b, 0) - saved;
}

export function shapeWeight(s: BarShape, count = 1): number {
  const area = (Math.PI * (s.dia / 1000) ** 2) / 4;
  return count * area * developedLength(s) * STEEL_DENSITY;
}

/**
 * A straight bar from x0 to x1 at height y, with a 90° hook at either end turned `toward`
 * (+1 up, −1 down); the hook's leg runs the bend radius and its extension past the corner.
 */
export function hookedStraight(x0: number, x1: number, y: number, dia: number, mandrel: number, hooks: [boolean, boolean], toward: 1 | -1, extension: number): BarShape {
  const leg = (mandrel + dia / 1000) / 2 + extension;
  const pts: Array<[number, number]> = [];
  if (hooks[0]) pts.push([x0, y + toward * leg]);
  pts.push([x0, y], [x1, y]);
  if (hooks[1]) pts.push([x1, y + toward * leg]);
  return { pts, mandrel, dia };
}

/**
 * A bent-up bar: along the bottom from x0 to where it rises at `upAt`, up at `angle` to the top
 * face, along the top to x1; `down` mirrors it (top to bottom). Heights are the bar's centreline.
 */
export function bentBar(o: {
  x0: number; x1: number; yLow: number; yHigh: number; riseAt: number; angleDeg: number; rising: boolean;
  dia: number; mandrel: number; hooks: [boolean, boolean]; extension: number;
}): BarShape {
  const run = (o.yHigh - o.yLow) / Math.tan((o.angleDeg * Math.PI) / 180);
  const yStart = o.rising ? o.yLow : o.yHigh, yEnd = o.rising ? o.yHigh : o.yLow;
  const leg = (o.mandrel + o.dia / 1000) / 2 + o.extension;
  const pts: Array<[number, number]> = [];
  if (o.hooks[0]) pts.push([o.x0, yStart + (yStart === o.yLow ? leg : -leg)]);
  pts.push([o.x0, yStart], [o.riseAt, yStart], [o.riseAt + run, yEnd], [o.x1, yEnd]);
  if (o.hooks[1]) pts.push([o.x1, yEnd + (yEnd === o.yLow ? leg : -leg)]);
  return { pts, mandrel: o.mandrel, dia: o.dia };
}
