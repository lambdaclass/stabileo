/**
 * Columns that are not rectangles: circular (tied or spiral), T and L. The outline goes to the
 * general section engine (`cirsoc201-section.ts`, strain compatibility over any polygon, the same
 * the plane calculator uses) and each combination's Pu, Mx and My are checked against the
 * capacity at that axial load in the demand's own direction (`momentCapacityAtAxial`), which reads
 * biaxial bending without Bresler's approximation.
 *
 * Bars lie on the outline inset by cover, tie and half a bar: a ring on a circle, and on a T or an
 * L one at each corner and the rest spread along the sides by length. Shear is carried by the web
 * along each direction (a circle's by D and 0,8·D, §22.5.2.2). φ and the axial cap are CIRSOC
 * 201-2025's (Tabla 21.2.2, Tabla 22.4.2.1): a spiral gives φ 0,75 and the 0,85 axial cap, and is checked for its clear pitch (25 to 75 mm, §25.7.3.1) and its volumetric
 * ratio ρs ≥ 0,45·(Ag/Ach − 1)·f'c/fyt (§25.7.3.3).
 */
import { momentCapacityAtAxial } from '../codes/argentina/cirsoc-flex-surface';
import { axialRange } from '../codes/argentina/cirsoc-flex-surface';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';
import type { Bar, Outline } from '../codes/argentina/cirsoc201-section';
import { teePolygon, polygonArea, type Pt } from '../codes/argentina/section-polygon';
import { isSolidCircle } from '../../section/solid-circle';

export type ColumnShape =
  | { kind: 'circle'; D: number }
  | { kind: 'tee'; bf: number; hf: number; bw: number; h: number }
  | { kind: 'L'; b: number; h: number; tw: number; tf: number };

/** The shape of a concrete column's section, or null for a rectangle (and anything unreadable). */
export function columnShapeOf(s: { shape?: string; a: number; b?: number; h?: number; t?: number; tw?: number; tf?: number } | undefined): ColumnShape | null {
  if (!s) return null;
  if (isSolidCircle(s as never)) return { kind: 'circle', D: s.h! };
  if (s.shape === 'T' && s.b && s.h && s.tw && s.tf) return { kind: 'tee', bf: s.b, hf: s.tf, bw: s.tw, h: s.h };
  if (s.shape === 'L' && s.b && s.h && s.tw && s.tf && s.tw < s.b && s.tf < s.h) return { kind: 'L', b: s.b, h: s.h, tw: s.tw, tf: s.tf };
  return null;
}

function lPolygon(b: number, h: number, tw: number, tf: number): Pt[] {
  const pts: Pt[] = [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: tf }, { x: tw, y: tf }, { x: tw, y: h }, { x: 0, y: h }];
  const A1 = b * tf, A2 = tw * (h - tf);
  const cx = (A1 * b / 2 + A2 * tw / 2) / (A1 + A2), cy = (A1 * tf / 2 + A2 * (tf + (h - tf) / 2)) / (A1 + A2);
  return pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}

export function outlineOf(shape: ColumnShape): Outline {
  switch (shape.kind) {
    case 'circle': return { kind: 'circle', D: shape.D };
    case 'tee': return { kind: 'tee', bf: shape.bf, hf: shape.hf, bw: shape.bw, h: shape.h };
    case 'L': return { kind: 'polygon', outer: lPolygon(shape.b, shape.h, shape.tw, shape.tf) };
  }
}

export function grossAreaOf(shape: ColumnShape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.D ** 2 / 4;
    case 'tee': return shape.bf * shape.hf + shape.bw * (shape.h - shape.hf);
    case 'L': return shape.b * shape.tf + shape.tw * (shape.h - shape.tf);
  }
}

/** A polygon's vertices moved in by `e` along both sides at each right-angled corner. */
function inset(poly: readonly Pt[], e: number): Pt[] {
  const ccw = polygonArea(poly) > 0;
  const n = poly.length;
  const normal = (a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return ccw ? { x: -dy / l, y: dx / l } : { x: dy / l, y: -dx / l };
  };
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n]!, next = poly[(i + 1) % n]!;
    const n1 = normal(prev, p), n2 = normal(p, next);
    return { x: p.x + e * (n1.x + n2.x), y: p.y + e * (n1.y + n2.y) };
  });
}

/** Where `count` bars of `diaMm` sit in the section, m about its centroid. */
export function shapedBarPositions(shape: ColumnShape, count: number, diaMm: number, cover: number, tieDiaMm: number): Pt[] {
  const e = cover + tieDiaMm / 1000 + diaMm / 2000;
  if (shape.kind === 'circle') {
    const R = shape.D / 2 - e;
    return Array.from({ length: count }, (_, i) => ({ x: R * Math.cos((2 * Math.PI * i) / count + Math.PI / 2), y: R * Math.sin((2 * Math.PI * i) / count + Math.PI / 2) }));
  }
  const ring = inset(shape.kind === 'tee' ? teePolygon(shape.bf, shape.hf, shape.bw, shape.h) : lPolygon(shape.b, shape.h, shape.tw, shape.tf), e);
  const out: Pt[] = ring.map((p) => ({ ...p }));
  const extra = Math.max(0, count - ring.length);
  if (extra === 0) return out.slice(0, Math.max(count, ring.length));
  const edges = ring.map((p, i) => ({ a: p, b: ring[(i + 1) % ring.length]!, L: Math.hypot(ring[(i + 1) % ring.length]!.x - p.x, ring[(i + 1) % ring.length]!.y - p.y) }));
  const P = edges.reduce((s, x) => s + x.L, 0);
  // Largest remainder: each side gets bars in proportion to its length.
  const raw = edges.map((x) => (extra * x.L) / P);
  const take = raw.map(Math.floor);
  let left = extra - take.reduce((s, k) => s + k, 0);
  for (const i of raw.map((r, i) => [r - Math.floor(r), i] as const).sort((p, q) => q[0] - p[0]).map(([, i]) => i)) { if (left-- <= 0) break; take[i]!++; }
  edges.forEach((x, i) => {
    const k = take[i]!;
    for (let j = 1; j <= k; j++) out.push({ x: x.a.x + ((x.b.x - x.a.x) * j) / (k + 1), y: x.a.y + ((x.b.y - x.a.y) * j) / (k + 1) });
  });
  return out;
}

/** The smallest clear distance between bars, m. */
export function minClear(pts: readonly Pt[], diaMm: number): number {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
  return m - diaMm / 1000;
}

export interface ShapedCheck {
  category: string; utilization: number; unit: string; description: string;
  limiting: 'axialFlexure' | 'biaxial' | 'shear' | 'tieSpacing' | 'minSteel' | 'maxSteel' | 'congestion';
  demand?: number; capacity?: number; required?: number; provided?: number;
  comboName?: string; stationX?: number; missingReinforcement?: boolean;
}

export interface ShapedTuple { n: number; my: number; mz: number; vy: number; vz: number; comboName: string; stationX: number }

/**
 * The checks of a shaped column: P–M at every tuple in the demand's own direction, the steel
 * ratio, the bars' clear spacing, shear along both directions and the ties or the spiral.
 */
export function checkShapedColumn(input: {
  shape: ColumnShape;
  bars?: { count: number; diameter: number; spiral?: { diameter: number; pitch: number } };
  ties?: { diameter: number; legs: number; spacing: number };
  fc: number; fy: number; cover: number;
  tuples: readonly ShapedTuple[];
  /** δns·δs on both moment axes. */
  magnifier: number;
  maxTieSpacing: number;
  shearCapacity: (bw: number, d: number, Nu: number) => number;
}): ShapedCheck[] {
  const { shape, bars } = input;
  const out: ShapedCheck[] = [];
  const Ag = grossAreaOf(shape);
  if (!bars || bars.count <= 0) {
    out.push({ category: 'Longitudinal', utilization: Number.POSITIVE_INFINITY, unit: 'cm²', description: 'no longitudinal reinforcement provided', limiting: 'axialFlexure', missingReinforcement: true });
    return out;
  }
  const tieDia = bars.spiral?.diameter ?? input.ties?.diameter ?? 8;
  const pts = shapedBarPositions(shape, bars.count, bars.diameter, input.cover, tieDia);
  const aBar = (Math.PI * bars.diameter ** 2) / 4 / 1e6;
  const sectionBars: Bar[] = pts.map((p) => ({ x: p.x, y: p.y, area: aBar }));
  const outline = outlineOf(shape);
  const mat = { fc: input.fc, fy: input.fy, confinement: bars.spiral ? 'spiral' as const : 'ties' as const, edition: CIRSOC201_DESIGN_EDITION };
  const Ast = aBar * bars.count;

  // ── P–M in the demand's own direction ──
  let worst: { u: number; Pu: number; Mu: number; phiMn: number; t: ShapedTuple } | null = null;
  const range = axialRange(outline, sectionBars, mat);
  for (const t of input.tuples) {
    const Pu = -t.n;
    // My bends over the depth (section y), Mz over the width (section x).
    const Mx = t.my * input.magnifier, My = t.mz * input.magnifier;
    const Mu = Math.hypot(Mx, My);
    let u: number, phiMn = 0;
    if (Pu > range.max + 1e-6 || Pu < range.min - 1e-6) u = Pu > 0 ? Pu / Math.max(range.max, 1e-9) : Math.abs(Pu) / Math.max(Math.abs(range.min), 1e-9);
    else if (Mu < 1e-6) u = Pu > 0 ? Pu / Math.max(range.max, 1e-9) : Math.abs(Pu) / Math.max(Math.abs(range.min), 1e-9);
    else {
      const cap = momentCapacityAtAxial(outline, sectionBars, mat, Pu, Mx || 1e-9, My || 1e-9);
      phiMn = cap?.phiMn ?? 0;
      u = cap && phiMn > 1e-9 ? Mu / phiMn : Number.POSITIVE_INFINITY;
    }
    if (!worst || u > worst.u) worst = { u, Pu, Mu, phiMn, t };
  }
  if (worst) {
    out.push({
      category: `Biaxial P-M (${shape.kind === 'circle' ? 'circular' : shape.kind === 'tee' ? 'T' : 'L'} section)`,
      utilization: worst.u, unit: 'kN·m', demand: +worst.Mu.toFixed(2), capacity: +worst.phiMn.toFixed(2),
      description: `${bars.count}Ø${bars.diameter}${bars.spiral ? ` + spiral Ø${bars.spiral.diameter} p=${(bars.spiral.pitch * 100).toFixed(1)}cm` : ''} → Pu=${worst.Pu.toFixed(0)} kN, Mu=${worst.Mu.toFixed(1)} kN·m, φMn=${worst.phiMn.toFixed(1)} kN·m at that load [strain-compat, general section]${input.magnifier > 1.0001 ? ` [δ=${input.magnifier.toFixed(3)}]` : ''}`,
      limiting: 'biaxial', comboName: worst.t.comboName, stationX: worst.t.stationX,
    });
  }

  // ── Steel ratio and clear spacing ──
  const rho = Ast / Ag;
  out.push({ category: 'Steel ratio', utilization: rho / 0.08, unit: '%', required: 8, provided: +(rho * 100).toFixed(2), description: `ρ = ${(rho * 100).toFixed(2)}% (limits 1%–8% Ag)`, limiting: 'maxSteel' });
  if (rho < 0.01) out.push({ category: 'Min steel ratio', utilization: 0.01 / Math.max(rho, 1e-9), unit: '%', required: 1, provided: +(rho * 100).toFixed(2), description: `ρ = ${(rho * 100).toFixed(2)}% below the 1% Ag minimum`, limiting: 'minSteel' });
  const minBars = bars.spiral ? 6 : shape.kind === 'circle' ? 4 : 4;
  if (bars.count < minBars) out.push({ category: 'Min bar count', utilization: minBars / bars.count, unit: '—', required: minBars, provided: bars.count, description: `${bars.count} bars, at least ${minBars} (§10.7.3.1)`, limiting: 'minSteel' });
  const clear = minClear(pts, bars.diameter), need = Math.max(0.04, 1.5 * bars.diameter / 1000);
  out.push({ category: 'Bar spacing', utilization: need / Math.max(clear, 1e-9), unit: 'cm', required: +(need * 100).toFixed(1), provided: +(clear * 100).toFixed(1), description: `clear ${(clear * 100).toFixed(1)} cm ≥ max(40 mm, 1.5·db) (§25.2.3)`, limiting: 'congestion' });

  // ── Shear along each direction, on the web that carries it ──
  const webs: Array<{ axis: 'Vy' | 'Vz'; bw: number; d: number; read: (t: ShapedTuple) => number }> = shape.kind === 'circle'
    ? [{ axis: 'Vz', bw: shape.D, d: 0.8 * shape.D, read: (t) => t.vz }, { axis: 'Vy', bw: shape.D, d: 0.8 * shape.D, read: (t) => t.vy }]
    : shape.kind === 'tee'
      ? [{ axis: 'Vz', bw: shape.bw, d: 0.8 * shape.h, read: (t) => t.vz }, { axis: 'Vy', bw: shape.hf, d: 0.8 * shape.bf, read: (t) => t.vy }]
      : [{ axis: 'Vz', bw: shape.tw, d: 0.8 * shape.h, read: (t) => t.vz }, { axis: 'Vy', bw: shape.tf, d: 0.8 * shape.b, read: (t) => t.vy }];
  for (const w of webs) {
    let wv: { u: number; Vu: number; cap: number; t: ShapedTuple } | null = null;
    for (const t of input.tuples) {
      const Vu = Math.abs(w.read(t));
      if (Vu < 1e-3) continue;
      const cap = input.shearCapacity(w.bw, w.d, -t.n);
      const u = cap > 1e-9 ? Vu / cap : Number.POSITIVE_INFINITY;
      if (!wv || u > wv.u) wv = { u, Vu, cap, t };
    }
    if (wv) out.push({ category: `Ties (${w.axis})`, utilization: wv.u, unit: 'kN', demand: +wv.Vu.toFixed(2), capacity: +wv.cap.toFixed(2), description: `bw = ${(w.bw * 100).toFixed(0)} cm, d = ${(w.d * 100).toFixed(0)} cm`, limiting: 'shear', comboName: wv.t.comboName, stationX: wv.t.stationX });
  }

  // ── Ties or spiral ──
  if (bars.spiral) {
    const sp = bars.spiral;
    const clearPitch = sp.pitch - sp.diameter / 1000;
    out.push({ category: 'Spiral pitch', utilization: clearPitch > 0.075 ? clearPitch / 0.075 : clearPitch < 0.025 ? 0.025 / Math.max(clearPitch, 1e-9) : clearPitch / 0.075, unit: 'cm', provided: +(clearPitch * 100).toFixed(1), description: `clear pitch ${(clearPitch * 100).toFixed(1)} cm within 2.5–7.5 cm (§25.7.3.1)`, limiting: 'tieSpacing' });
    if (shape.kind === 'circle') {
      const Dc = shape.D - 2 * input.cover;
      const Ach = Math.PI * Dc ** 2 / 4;
      const Asp = Math.PI * sp.diameter ** 2 / 4 / 1e6;
      const rhoS = (4 * Asp) / (Dc * sp.pitch);
      const rhoMin = 0.45 * (Ag / Ach - 1) * input.fc / input.fy;
      out.push({ category: 'Spiral ratio', utilization: rhoMin / Math.max(rhoS, 1e-9), unit: '%', required: +(rhoMin * 100).toFixed(3), provided: +(rhoS * 100).toFixed(3), description: `ρs = ${(rhoS * 100).toFixed(3)}% ≥ 0.45·(Ag/Ach − 1)·f'c/fyt = ${(rhoMin * 100).toFixed(3)}% (§25.7.3.3)`, limiting: 'minSteel' });
    }
  } else if (input.ties) {
    out.push({ category: 'Tie spacing', utilization: input.ties.spacing / input.maxTieSpacing, unit: 'cm', required: +(input.maxTieSpacing * 100).toFixed(1), provided: +(input.ties.spacing * 100).toFixed(1), description: `s = ${(input.ties.spacing * 100).toFixed(0)} cm, s,max = ${(input.maxTieSpacing * 100).toFixed(0)} cm`, limiting: 'tieSpacing' });
  } else {
    out.push({ category: 'Ties', utilization: Number.POSITIVE_INFINITY, unit: '—', description: 'no ties or spiral provided', limiting: 'shear', missingReinforcement: true });
  }
  return out;
}
