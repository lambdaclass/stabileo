/**
 * The shell results a table and a workbook list: for each plate and quad, at its centre, its
 * membrane stresses and moments in its local axes, the stresses on its two faces with their
 * principals, Von Mises and Tresca, its transverse shears, and the same membrane stresses,
 * moments and shears turned to global axes.
 *
 * The engine returns the centre values (`PlateStress`, `QuadStress`, kN/m² and kN·m/m). The faces
 * are membrane ± 6M/t² (`shell-stress.ts#faceStresses`), with the engine's top at z = +t/2 along
 * the local z. The engine's own `vonMises` means the worse face for a triangle and the membrane for
 * a quad; the columns here say which is which instead of sharing one name.
 *
 * Local axes are the engine's (`element/plate.rs#local_axes`, `element/quad.rs#quad_local_axes`):
 * x along the edge from the first node to the second, z normal (for a quad, the cross product of
 * its diagonals, with x made orthogonal to it), y = z × x. A curved quad has its own frame in the
 * engine, which is not reproduced here: its global columns are left empty rather than guessed.
 *
 * Per node, the values are the average of the elements around it, in global components only:
 * local components of elements with different axes do not add. The engine's corner Von Mises of
 * each element (`nodalVonMises`) is listed as it comes.
 *
 * Pure.
 */
import type { AnalysisResults3D } from './types-3d';
import { faceStresses, principalStresses, trescaPlane, vonMisesPlane, type PlaneStress } from './shell-stress';

type Vec = [number, number, number];
type Pt = { x: number; y: number; z?: number };

export interface ShellModel {
  nodes: ReadonlyMap<number, Pt>;
  plates?: ReadonlyMap<number, { id: number; nodes: readonly number[]; thickness: number }>;
  quads?: ReadonlyMap<number, { id: number; nodes: readonly number[]; thickness: number; curved?: boolean }>;
}

/** One face, or the membrane: its components, principals and the two criteria. */
export interface FaceResult { sxx: number; syy: number; txy: number; s1: number; s2: number; angleDeg: number; vonMises: number; tresca: number }

/** The six independent components of a symmetric tensor in global axes. */
export interface Tensor6 { xx: number; yy: number; zz: number; xy: number; yz: number; zx: number }

export interface ShellCentreRow {
  kind: 'plate' | 'quad';
  id: number;
  thickness: number;
  /** Membrane stresses, kN/m², and moments, kN·m/m, in local axes. */
  sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number;
  /** Transverse shears, kN/m, local: MITC4 quads only. */
  qx?: number; qy?: number;
  membrane: FaceResult; top: FaceResult; bottom: FaceResult;
  /** Global axes; absent where the element's local axes are not known here (a curved quad). */
  global?: { stress: Tensor6; moment: Tensor6; shear?: Vec };
}

const sub = (a: Pt, b: Pt): Vec => [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec): Vec | null => { const n = Math.hypot(...a); return n > 1e-15 ? [a[0] / n, a[1] / n, a[2] / n] : null; };

/** The engine's local axes of a triangle or a flat quad, or null when degenerate. */
export function shellLocalAxes(kind: 'plate' | 'quad', pts: readonly Pt[]): { ex: Vec; ey: Vec; ez: Vec } | null {
  if (pts.length < 3) return null;
  const ez = kind === 'plate' || pts.length < 4
    ? unit(cross(sub(pts[1]!, pts[0]!), sub(pts[2]!, pts[0]!)))
    : unit(cross(sub(pts[2]!, pts[0]!), sub(pts[3]!, pts[1]!)));
  if (!ez) return null;
  const e01 = unit(sub(pts[1]!, pts[0]!));
  if (!e01) return null;
  // For a triangle e01 is already in the plane; for a warped quad it is not, and the engine
  // removes its normal part.
  const ex = unit([e01[0] - dot(e01, ez) * ez[0], e01[1] - dot(e01, ez) * ez[1], e01[2] - dot(e01, ez) * ez[2]]);
  if (!ex) return null;
  return { ex, ey: cross(ez, ex), ez };
}

/** An in-plane symmetric tensor [[a, c], [c, b]] in (ex, ey), as its global components. */
function toGlobal(a: number, b: number, c: number, ex: Vec, ey: Vec): Tensor6 {
  const g = (i: number, j: number) => a * ex[i]! * ex[j]! + b * ey[i]! * ey[j]! + c * (ex[i]! * ey[j]! + ey[i]! * ex[j]!);
  return { xx: g(0, 0), yy: g(1, 1), zz: g(2, 2), xy: g(0, 1), yz: g(1, 2), zx: g(2, 0) };
}

function face(p: PlaneStress): FaceResult {
  const pr = principalStresses(p.sxx, p.syy, p.txy);
  return { sxx: p.sxx, syy: p.syy, txy: p.txy, s1: pr.sigma1, s2: pr.sigma2, angleDeg: pr.angleDeg, vonMises: vonMisesPlane(p.sxx, p.syy, p.txy), tresca: trescaPlane(p.sxx, p.syy, p.txy) };
}

/** Every plate and quad of one result, at its centre, plates first, each in id order. */
export function shellCentreRows(r: AnalysisResults3D, m: ShellModel): ShellCentreRow[] {
  const out: ShellCentreRow[] = [];
  const add = (kind: 'plate' | 'quad', list: AnalysisResults3D['quadStresses'], el: ShellModel['quads']) => {
    for (const s of [...(list ?? [])].sort((a, b) => a.elementId - b.elementId)) {
      const e = el?.get(s.elementId);
      const t = e?.thickness ?? 0;
      const faces = t > 0 ? faceStresses(s, t) : null;
      const membrane = face({ sxx: s.sigmaXx, syy: s.sigmaYy, txy: s.tauXy });
      const pts = e ? e.nodes.map((n) => m.nodes.get(n)).filter((p): p is Pt => !!p) : [];
      const axes = e && !(e as { curved?: boolean }).curved && pts.length === e.nodes.length ? shellLocalAxes(kind, pts) : null;
      const q = 'qx' in s && s.qx !== undefined && s.qy !== undefined ? { qx: s.qx, qy: s.qy } : {};
      out.push({
        kind, id: s.elementId, thickness: t,
        sigmaXx: s.sigmaXx, sigmaYy: s.sigmaYy, tauXy: s.tauXy, mx: s.mx, my: s.my, mxy: s.mxy, ...q,
        membrane,
        top: faces ? face(faces.top) : membrane,
        bottom: faces ? face(faces.bottom) : membrane,
        ...(axes ? {
          global: {
            stress: toGlobal(s.sigmaXx, s.sigmaYy, s.tauXy, axes.ex, axes.ey),
            moment: toGlobal(s.mx, s.my, s.mxy, axes.ex, axes.ey),
            ...('qx' in q ? { shear: [0, 1, 2].map((i) => q.qx! * axes.ex[i]! + q.qy! * axes.ey[i]!) as Vec } : {}),
          },
        } : {}),
      });
    }
  };
  add('plate', r.plateStresses as AnalysisResults3D['quadStresses'], m.plates as ShellModel['quads']);
  add('quad', r.quadStresses, m.quads);
  return out;
}

export interface ShellNodeRow { node: number; elements: number; stress: Tensor6; moment: Tensor6 }

/** Per node, the average in global axes of the elements around it that have global values. */
export function shellNodeRows(rows: readonly ShellCentreRow[], m: ShellModel): ShellNodeRow[] {
  const acc = new Map<number, { n: number; s: number[]; mo: number[] }>();
  const keys = ['xx', 'yy', 'zz', 'xy', 'yz', 'zx'] as const;
  for (const r of rows) {
    if (!r.global) continue;
    const e = r.kind === 'plate' ? m.plates?.get(r.id) : m.quads?.get(r.id);
    for (const node of e?.nodes ?? []) {
      const a = acc.get(node) ?? { n: 0, s: [0, 0, 0, 0, 0, 0], mo: [0, 0, 0, 0, 0, 0] };
      a.n++;
      keys.forEach((k, i) => { a.s[i]! += r.global!.stress[k]; a.mo[i]! += r.global!.moment[k]; });
      acc.set(node, a);
    }
  }
  const avg = (v: number[], n: number): Tensor6 => ({ xx: v[0]! / n, yy: v[1]! / n, zz: v[2]! / n, xy: v[3]! / n, yz: v[4]! / n, zx: v[5]! / n });
  return [...acc].sort((a, b) => a[0] - b[0]).map(([node, a]) => ({ node, elements: a.n, stress: avg(a.s, a.n), moment: avg(a.mo, a.n) }));
}

export interface ShellCornerRow { kind: 'plate' | 'quad'; id: number; corner: number; node: number; vonMises: number }

/** The engine's Von Mises at each element's corners, as it reports them (face for plates, membrane for quads). */
export function shellCornerRows(r: AnalysisResults3D, m: ShellModel): ShellCornerRow[] {
  const out: ShellCornerRow[] = [];
  const add = (kind: 'plate' | 'quad', list: AnalysisResults3D['quadStresses'], el: ShellModel['quads']) => {
    for (const s of [...(list ?? [])].sort((a, b) => a.elementId - b.elementId)) {
      const nodes = el?.get(s.elementId)?.nodes ?? [];
      (s.nodalVonMises ?? []).forEach((v, k) => { if (nodes[k] !== undefined) out.push({ kind, id: s.elementId, corner: k + 1, node: nodes[k]!, vonMises: v }); });
    }
  };
  add('plate', r.plateStresses as AnalysisResults3D['quadStresses'], m.plates as ShellModel['quads']);
  add('quad', r.quadStresses, m.quads);
  return out;
}
