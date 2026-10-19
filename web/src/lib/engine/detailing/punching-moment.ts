/**
 * Punching with moment transfer, CIRSOC 201-2025 §8.4.4.2 (the eccentric-shear model), the shear
 * reinforcement that carries what the concrete does not (§22.6.6, §22.6.7) and the openings near
 * a column (§22.6.4.3).
 *
 * The critical section is laid out as its sides in plan, about the column centre, x along the
 * column's b and y along its h: four for an interior column, three for an edge column (the free
 * edge perpendicular to `edgeAxis`, its two sides c + d/2 long), two for a corner one. From the
 * sides come bo, the centroid and Jc about each axis (a side along the axis adds d·L³/12 +
 * L·d³/12, every side d·L·r² for its distance r): the general form of Jc = d·b1³/6 + b1·d³/6 +
 * d·b2·b1²/2. The moment carried by eccentric shear is γv·Msc, γv = 1 − 1/(1 + ⅔·√(b1/b2)), b1
 * the section's extent along the direction the moment bends; Msc is taken about the section's
 * centroid, the column's moment plus Vu times the offset, both senses, the worse kept. The stress
 * at the farthest corner adds both directions: vu = Vu/(bo·d) + γvx·Mx·cy/Jcx + γvy·My·cx/Jcy.
 */
import type { ColumnPosition } from './punching-shear';

export interface Side { x0: number; y0: number; x1: number; y1: number }

export interface CriticalGeometry {
  sides: Side[];
  bo: number;
  /** Centroid of the perimeter, m from the column centre. */
  cx: number; cy: number;
  /** Extents of the section, m. */
  b1x: number; b2y: number;
  /** Jc about the centroidal y axis (moment My, stress varying with x) and x axis, m⁴. */
  JcY: number; JcX: number;
  /** Farthest distances from the centroid, m. */
  cMaxX: number; cMaxY: number;
  enclosedArea: number;
}

export function criticalGeometry(b: number, h: number, d: number, position: ColumnPosition, edgeAxis: 'x' | 'y' = 'x'): CriticalGeometry {
  // The section's rectangle about the column centre; a free edge cuts it at the column face.
  let xl = -(b + d) / 2, xr = (b + d) / 2, yb = -(h + d) / 2, yt = (h + d) / 2;
  const free = { xr: false, yt: false };
  if (position === 'edge') { if (edgeAxis === 'x') { xr = b / 2; free.xr = true; } else { yt = h / 2; free.yt = true; } }
  if (position === 'corner') { xr = b / 2; yt = h / 2; free.xr = true; free.yt = true; }
  const sides: Side[] = [];
  sides.push({ x0: xl, y0: yb, x1: xr, y1: yb });                       // bottom, along x
  if (!free.yt) sides.push({ x0: xl, y0: yt, x1: xr, y1: yt });          // top, along x
  sides.push({ x0: xl, y0: yb, x1: xl, y1: yt });                        // left, along y
  if (!free.xr) sides.push({ x0: xr, y0: yb, x1: xr, y1: yt });          // right, along y
  const len = (s: Side) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
  const bo = sides.reduce((t, s) => t + len(s), 0);
  const cx = sides.reduce((t, s) => t + len(s) * (s.x0 + s.x1) / 2, 0) / bo;
  const cy = sides.reduce((t, s) => t + len(s) * (s.y0 + s.y1) / 2, 0) / bo;
  let JcY = 0, JcX = 0;
  for (const s of sides) {
    const L = len(s), mx = (s.x0 + s.x1) / 2 - cx, my = (s.y0 + s.y1) / 2 - cy;
    const alongX = Math.abs(s.y1 - s.y0) < 1e-12;
    // About y (x-varying stress): a side along x bends like a beam of depth L, plus its torsion term.
    JcY += alongX ? d * L ** 3 / 12 + L * d ** 3 / 12 + d * L * mx * mx : d * L * mx * mx;
    JcX += alongX ? d * L * my * my : d * L ** 3 / 12 + L * d ** 3 / 12 + d * L * my * my;
  }
  return {
    sides, bo, cx, cy, b1x: xr - xl, b2y: yt - yb, JcY, JcX,
    cMaxX: Math.max(xr - cx, cx - xl), cMaxY: Math.max(yt - cy, cy - yb),
    enclosedArea: (xr - xl) * (yt - yb),
  };
}

/** γv for a moment bending along a section of extent b1 across b2. */
export const gammaV = (b1: number, b2: number): number => 1 - 1 / (1 + (2 / 3) * Math.sqrt(b1 / b2));

export interface EccentricShear {
  vu: number; vDirect: number; vMomentX: number; vMomentY: number;
  gammaVx: number; gammaVy: number; MscX: number; MscY: number;
  geometry: CriticalGeometry;
}

/**
 * The largest shear stress on the critical section, MPa, with the moments about the column's x
 * (Mx, bending along y) and y (My, bending along x) axes, kN·m.
 */
export function eccentricShear(o: { b: number; h: number; d: number; position: ColumnPosition; edgeAxis?: 'x' | 'y'; Vu: number; Mx: number; My: number; boReduction?: number }): EccentricShear {
  const g = criticalGeometry(o.b, o.h, o.d, o.position, o.edgeAxis);
  const bo = Math.max(1e-9, g.bo - (o.boReduction ?? 0));
  // About the centroid: the column's moment and Vu times the offset, the worse sense.
  const MscY = Math.abs(o.My) + Math.abs(o.Vu * g.cx);
  const MscX = Math.abs(o.Mx) + Math.abs(o.Vu * g.cy);
  const gY = gammaV(g.b1x, g.b2y), gX = gammaV(g.b2y, g.b1x);
  const vDirect = o.Vu / (bo * o.d) / 1000;
  const vMomentY = (gY * MscY * g.cMaxX) / g.JcY / 1000;
  const vMomentX = (gX * MscX * g.cMaxY) / g.JcX / 1000;
  return { vu: vDirect + vMomentX + vMomentY, vDirect, vMomentX, vMomentY, gammaVx: gX, gammaVy: gY, MscX, MscY, geometry: g };
}

/**
 * §22.6.4.3: the part of the critical perimeter inside the lines from the column centre to the
 * corners of an opening within 4·h of the column is not effective. Openings as plan rectangles
 * about the column centre; the perimeter sampled every 5 mm.
 */
export function openingReduction(g: CriticalGeometry, openings: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>, slabH: number, colHalf: number): number {
  // Near: the opening's closest point within 4·h of the column face.
  const near = openings.filter((o) => {
    const nx = Math.min(Math.max(0, Math.min(o.x0, o.x1)), Math.max(o.x0, o.x1));
    const ny = Math.min(Math.max(0, Math.min(o.y0, o.y1)), Math.max(o.y0, o.y1));
    return Math.max(0, Math.hypot(nx, ny) - colHalf) <= 4 * slabH + 1e-9;
  });
  if (!near.length) return 0;
  const spans = near.map((o) => {
    const angs = [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]].map(([x, y]) => Math.atan2(y!, x!));
    // The opening's angular span, unwrapped about its centre direction.
    const c = Math.atan2((o.y0 + o.y1) / 2, (o.x0 + o.x1) / 2);
    const rel = angs.map((a) => { let r = a - c; while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r; });
    return { c, lo: Math.min(...rel), hi: Math.max(...rel) };
  });
  let lost = 0;
  const STEP = 0.005;
  for (const s of g.sides) {
    const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), n = Math.max(1, Math.round(L / STEP));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = s.x0 + (s.x1 - s.x0) * t, y = s.y0 + (s.y1 - s.y0) * t, a = Math.atan2(y, x);
      if (spans.some((sp) => { let r = a - sp.c; while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r >= sp.lo && r <= sp.hi; })) lost += L / n;
    }
  }
  return lost;
}

export interface PunchingReinforcement {
  /** Stirrup legs' area per perimeter line, mm², at spacing s, m. */
  avPerLine: number; spacing: number; legDiameter: number; legs: number;
  /** How far from the column face the lines run, m, and how many there are. */
  extent: number; lines: number;
  /** vn's ceiling with stirrups (0,5√f'c) was exceeded: thicker slab or bigger column needed. */
  overCeiling: boolean;
}

/**
 * Stirrups for the shear the concrete does not carry (§22.6.6.1, §22.6.7): vc drops to 0,17λs√f'c,
 * vn ≤ 0,5√f'c, s ≤ d/2, Av·fyt/(bo·s) ≥ vu/φ − vc; the lines run until the section at d/2 beyond
 * the last one carries vu with 0,17λs√f'c (that outer section taken as the rectangle around them).
 */
export function designPunchingReinforcement(o: { vu: number; Vu: number; fc: number; fyt: number; b: number; h: number; d: number; bo: number; lambdaS: number; position: ColumnPosition; phi?: number }): PunchingReinforcement {
  const phi = o.phi ?? 0.75, root = Math.sqrt(Math.min(o.fc, 70));
  const vc = 0.17 * o.lambdaS * root;
  const overCeiling = o.vu / phi > 0.5 * root + 1e-9;
  const vs = Math.max(0, o.vu / phi - vc);
  const s = Math.floor((o.d / 2) / 0.025) * 0.025 || o.d / 2;
  const avPerLine = (vs * o.bo * s / o.fyt) * 1e6; // mm²
  const legDiameter = avPerLine / 4 > 50 ? 10 : 8;
  const legs = Math.max(4, Math.ceil(avPerLine / (Math.PI * legDiameter ** 2 / 4)));
  // Extent: the outer rectangle at distance a from the column face, d/2 outside the last line.
  // The outer section a from the column faces, cut at the free edges like the critical one.
  const boOut = (a: number) => o.position === 'interior' ? 2 * (o.b + o.h) + 8 * a : o.position === 'edge' ? 2 * o.b + o.h + 4 * a : o.b + o.h + 2 * a;
  let a = o.d / 2;
  for (let i = 0; i < 200 && o.Vu / (boOut(a) * o.d) / 1000 > phi * vc; i++) a += 0.025;
  const extent = Math.max(0, a - o.d / 2);
  return { avPerLine, spacing: s, legDiameter, legs, extent, lines: Math.max(1, Math.ceil(extent / s)), overCeiling };
}
