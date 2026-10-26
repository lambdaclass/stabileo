/**
 * A rigid rectangular footing under one or more columns or a wall, checked on the pressure that
 * cannot pull the ground (`pressure-field.ts`): isolated with partial uplift, rotated (its loads
 * read in its own axes), combined under several columns, and strip footings (a metre of wall).
 *
 *   Bearing     the service field (columns plus the footing's weight) against the allowable
 *               pressure, with at least half the base in contact.
 *   Flexure     along each direction, at every section outside the columns, the moment of the
 *               factored net field and the column loads on one side: positive bends the bottom,
 *               negative (between the columns of a combined footing) the top; As = Mu/(φ·0,9·d·fy)
 *               on the footing's width, never under 0,0018·b·h at the bottom.
 *   Shear       one-way at d from each column face, against φ·0,17·√f'c·b·d: §13.2.6.2(a) allows it
 *               for a shallow member continuously on the soil designed as rigid, which this is.
 *   Punching    around each column that does not span the footing, by the shared check
 *               (`checkPunchingShear`), its moments included (§8.4.4.2).
 *
 * Local axes: x along B, y along L, origin at the footing's centroid. Loads: N compression
 * positive, kN; My about y and Mx about x, kN·m, signs as in `pressure-field.ts`.
 */
import { shearSqrtFc } from '../codes/argentina/cirsoc201-basis';
import { pressureField, type PressureField } from './pressure-field';
import { checkPunchingShear, type ColumnPosition, type PunchingCheck } from '../detailing/punching-shear';

export interface Post {
  id: string;
  x: number; y: number;
  /** Plan size along x and y, m. */
  cx: number; cy: number;
  /** A length of wall rather than a column: it shears along its faces and does not punch. */
  wall?: boolean;
  service: { N: number; Mx: number; My: number };
  factored: { N: number; Mx: number; My: number };
}

export interface RigidFootingInput {
  B: number; L: number; thickness: number; cover: number;
  fc: number; fy: number;
  /** Allowable bearing, kPa (service). */
  allowable: number;
  /** The edge pressure may reach this many times the allowable while the mean stays under it. */
  edgeFactor?: number;
  posts: readonly Post[];
  /** Footing and soil above it, kPa added to the service field (weight acts at the centroid). */
  surcharge?: number;
}

export interface DirectionResult {
  mPos: number; mNeg: number; atPos: number; atNeg: number;
  asBottom: number; asTop: number;
  shear: { vu: number; phiVc: number; utilization: number; at: number };
}

export interface RigidFootingResult {
  service: PressureField; factored: PressureField;
  bearing: { qMax: number; allowable: number; contact: number; utilization: number; ok: boolean };
  x: DirectionResult; y: DirectionResult;
  punching: Array<{ postId: string; utilization: number; status: string; check: PunchingCheck }>;
  overturns: boolean;
  utilization: number;
}

function resultant(posts: readonly Post[], key: 'service' | 'factored') {
  let N = 0, My = 0, Mx = 0;
  for (const p of posts) { const a = p[key]; N += a.N; My += a.My + a.N * p.x; Mx += a.Mx + a.N * p.y; }
  return { N, My, Mx };
}

const GRID = 60;

/** The moment and shear at sections along one direction, from the field and the posts on the low side. */
function along(dir: 'x' | 'y', f: RigidFootingInput, field: PressureField, d: number): DirectionResult {
  const [S, W] = dir === 'x' ? [f.B, f.L] : [f.L, f.B];
  const n = GRID, du = S / n, dw = W / n;
  const us = Array.from({ length: n }, (_, i) => -S / 2 + (i + 0.5) * du);
  const ws = Array.from({ length: n }, (_, j) => -W / 2 + (j + 0.5) * dw);
  // Pressure resultant per strip along the direction: force and its position, so sections integrate fast.
  const strip = us.map((u) => ws.reduce((s, w) => s + field.at(dir === 'x' ? u : w, dir === 'x' ? w : u) * du * dw, 0));
  const posU = (p: Post) => (dir === 'x' ? p.x : p.y), half = (p: Post) => (dir === 'x' ? p.cx : p.cy) / 2;
  const momentAbout = (p: Post) => (dir === 'x' ? p.factored.My : p.factored.Mx);
  const inside = (s: number) => f.posts.some((p) => s > posU(p) - half(p) + 1e-9 && s < posU(p) + half(p) - 1e-9);
  // Each strip's force taken uniform over its width, so a section through a strip takes its share.
  const below = (s: number) => us.map((u, i) => {
    const lo = u - du / 2, hi = u + du / 2;
    if (hi <= s) return { F: strip[i]!, at: u };
    if (lo >= s) return { F: 0, at: u };
    return { F: (strip[i]! * (s - lo)) / du, at: (lo + s) / 2 };
  });
  const M = (s: number) => {
    let m = 0;
    for (const b of below(s)) m += b.F * (s - b.at);
    for (const p of f.posts) if (posU(p) < s) m -= p.factored.N * (s - posU(p)) - momentAbout(p);
    return m;
  };
  const V = (s: number) => {
    let v = 0;
    for (const b of below(s)) v += b.F;
    for (const p of f.posts) if (posU(p) < s) v -= p.factored.N;
    return v;
  };
  let mPos = 0, mNeg = 0, atPos = 0, atNeg = 0;
  const sections = [...Array.from({ length: 2 * n + 1 }, (_, k) => -S / 2 + (k * S) / (2 * n)), ...f.posts.flatMap((p) => [posU(p) - half(p), posU(p) + half(p)])];
  for (const s of sections) {
    if (s <= -S / 2 || s >= S / 2 || inside(s)) continue;
    const m = M(s);
    if (m > mPos) { mPos = m; atPos = s; }
    if (m < mNeg) { mNeg = m; atNeg = s; }
  }
  // §13.2.6.2(a): a shallow foundation on the soil, designed rigid, may take Vc = 0,17·λ·√f'c·bw·d,
  // with √f'c ≤ 8,3 MPa (§22.5.3.1). It read √f'c up to √70 = 8,37.
  const phiVc = 0.75 * 0.17 * shearSqrtFc(f.fc) * W * d * 1000;
  let shear = { vu: 0, phiVc, utilization: 0, at: 0 };
  for (const p of f.posts) for (const s of [posU(p) - half(p) - d, posU(p) + half(p) + d]) {
    if (s <= -S / 2 || s >= S / 2) continue;
    const vu = Math.abs(V(s));
    if (vu / phiVc > shear.utilization) shear = { vu, phiVc, utilization: vu / phiVc, at: s };
  }
  const As = (m: number) => (m * 1000) / (0.9 * 0.9 * d * f.fy * 1e6);
  return { mPos, mNeg, atPos, atNeg, asBottom: Math.max(As(mPos), 0.0018 * W * f.thickness), asTop: As(-mNeg), shear };
}

export function checkRigidFooting(f: RigidFootingInput): RigidFootingResult {
  const d = f.thickness - f.cover - 0.016;
  const s = resultant(f.posts, 'service'), u = resultant(f.posts, 'factored');
  const W = (f.surcharge ?? 0) * f.B * f.L;
  const service = pressureField(f.B, f.L, s.N + W, s.My, s.Mx);
  const factored = pressureField(f.B, f.L, u.N, u.My, u.Mx);
  const contactOk = service.contact >= 0.5 - 1e-9;
  // The mean held to the allowable and the edge to k times it (k = 1 unless the soil states more).
  const edgeK = f.edgeFactor && f.edgeFactor > 1 ? f.edgeFactor : 1;
  const bearingUse = Math.max((s.N + W) / (f.B * f.L) / f.allowable, service.qMax / (edgeK * f.allowable));
  const bearing = { qMax: service.qMax, allowable: f.allowable, contact: service.contact, utilization: bearingUse, ok: !service.overturns && contactOk && bearingUse <= 1 + 1e-9 };
  const overturns = service.overturns || factored.overturns;
  const x = along('x', f, factored, d), y = along('y', f, factored, d);
  const punching = f.posts.filter((p) => !p.wall && p.cx < f.B - 1e-9 && p.cy < f.L - 1e-9).map((p) => {
    const nearX = Math.min(f.B / 2 - (p.x + p.cx / 2), (p.x - p.cx / 2) + f.B / 2) <= d / 2 + 1e-6;
    const nearY = Math.min(f.L / 2 - (p.y + p.cy / 2), (p.y - p.cy / 2) + f.L / 2) <= d / 2 + 1e-6;
    const position: ColumnPosition = nearX && nearY ? 'corner' : nearX || nearY ? 'edge' : 'interior';
    // The mean net pressure inside the critical perimeter.
    let q = 0, k = 0;
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const px = p.x - (p.cx + d) / 2 + ((i + 0.5) * (p.cx + d)) / 10, py = p.y - (p.cy + d) / 2 + ((j + 0.5) * (p.cy + d)) / 10;
      if (Math.abs(px) <= f.B / 2 && Math.abs(py) <= f.L / 2) { q += factored.at(px, py); k++; }
    }
    const c = checkPunchingShear({
      fc: f.fc, columnB: p.cx, columnH: p.cy, d, position,
      ...(position === 'edge' ? { edgeAxis: nearX ? 'x' as const : 'y' as const } : {}),
      demand: { supportReaction: p.factored.N, loadInsidePerimeter: k ? q / k : 0, unbalancedMomentX: p.factored.Mx, unbalancedMomentY: p.factored.My },
    });
    return { postId: p.id, utilization: c.utilization, status: c.status, check: c };
  });
  const utilization = Math.max(
    overturns ? Infinity : 0, bearing.ok ? bearing.utilization : Math.max(bearing.utilization, contactOk ? 0 : Infinity),
    x.shear.utilization, y.shear.utilization, ...punching.map((p) => p.utilization),
  );
  return { service, factored, bearing, x, y, punching, overturns, utilization };
}
