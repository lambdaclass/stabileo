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

export type HookAngle = 90 | 135;
export type BarUse = 'longitudinal' | 'transverse';

/** A code's rules for bending bars: lengths in m, diameters in mm. */
export interface BendRules {
  /** Inside diameter of a bend. */
  mandrel(dia: number, use: BarUse): number;
  /** Straight leg past a hook's bend. */
  extension(dia: number, angle: HookAngle, use: BarUse): number;
  /** The hooks of a cross tie, start and end. */
  crossTieHooks: [HookAngle, HookAngle];
  clause: string;
  /** An i18n key, when the rules are assumed rather than the code's own. */
  confirm?: string;
}

const radiusOf = (dia: number, mandrel: number) => (mandrel + dia / 1000) / 2;

/** A hook's leg from the corner its bend rounds to its free end. */
export const hookLeg = (angle: HookAngle, dia: number, mandrel: number, extension: number): number =>
  radiusOf(dia, mandrel) * Math.tan((angle * Math.PI) / 360) + extension;

const along = (p: [number, number], deg: number, l: number): [number, number] =>
  [p[0] + l * Math.cos((deg * Math.PI) / 180), p[1] + l * Math.sin((deg * Math.PI) / 180)];

/**
 * A closed hoop or stirrup of centreline width `w` and height `h`, closed at the top-left corner by
 * two 135° hooks turned into the core; both hooks wrap the corner bar, so their corners lie on the
 * sides produced past it.
 */
export function closedHoop(w: number, h: number, dia: number, mandrel: number, extension: number): BarShape {
  const r = radiusOf(dia, mandrel), t = r * Math.tan((135 * Math.PI) / 360);
  const leg = t + extension;
  const v1: [number, number] = [r - t, h], v5: [number, number] = [0, h - r + t];
  return { pts: [along(v1, -45, leg), v1, [w, h], [w, 0], [0, 0], v5, along(v5, -45, leg)], mandrel, dia };
}

/** A straight cross tie of `len` between the corners of its hooks, both turned down. */
export function crossTie(len: number, dia: number, mandrel: number, hooks: [HookAngle, HookAngle], extensions: [number, number]): BarShape {
  const start = along([0, 0], hooks[0] - 180, hookLeg(hooks[0], dia, mandrel, extensions[0]));
  const end = along([len, 0], -hooks[1], hookLeg(hooks[1], dia, mandrel, extensions[1]));
  return { pts: [start, [0, 0], [len, 0], end], mandrel, dia };
}

/** A U-bar: a base of `width` between the centrelines of its legs, each `leg` long from the corner. */
export function uBar(width: number, leg: number, dia: number, mandrel: number): BarShape {
  return { pts: [[leg, 0], [0, 0], [0, width], [leg, width]], mandrel, dia };
}

/**
 * A bar cranked in by `offset` at its top: straight up to `top − slope·offset`, inclined at 1 in
 * `slope` to `top`, then straight on for `lap`.
 */
export function crankedBar(top: number, offset: number, lap: number, dia: number, mandrel: number, slope = 6): BarShape {
  const run = slope * offset;
  return { pts: [[0, 0], [top - run, 0], [top, offset], [top + lap, offset]], mandrel, dia };
}

/** Each leg vertex to vertex, m, with the turn to the next leg in degrees (positive to the left); the last turn 0. */
export function planarLegs(s: BarShape): Array<{ l: number; w: number }> {
  const legs = legLengths(s);
  return legs.map((l, i) => {
    if (i === legs.length - 1) return { l, w: 0 };
    const [ax, ay] = s.pts[i]!, [bx, by] = s.pts[i + 1]!, [cx, cy] = s.pts[i + 2]!;
    const u = Math.atan2(by - ay, bx - ax), v = Math.atan2(cy - by, cx - bx);
    let d = v - u;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return { l, w: (d * 180) / Math.PI };
  });
}

/** What makes two bars the same piece to bend: diameter, mandrel, legs to the mm and turns to the degree, whichever end first and whichever face up. */
export function shapeKey(s: BarShape): string {
  const legs = planarLegs(s).map((x) => ({ l: Math.round(x.l * 1000), w: Math.round(x.w) }));
  const signed = (seq: Array<{ l: number; w: number }>) => {
    const first = seq.find((x) => x.w !== 0)?.w ?? 1;
    return seq.map((x) => `${x.l}@${first < 0 ? -x.w : x.w}`).join(',');
  };
  const back = legs.map((_, i) => ({ l: legs[legs.length - 1 - i]!.l, w: i < legs.length - 1 ? -legs[legs.length - 2 - i]!.w : 0 }));
  const a = signed(legs), b = signed(back);
  return `${s.dia}|${Math.round(s.mandrel * 1000)}|${a < b ? a : b}`;
}
