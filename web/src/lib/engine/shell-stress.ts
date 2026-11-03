// Shell stress post-processing — pure helpers (CP2).
//
// The solver returns per-element membrane stresses (σxx, σyy, τxy), bending
// moments per unit width (mx, my, mxy) and a Von Mises scalar. Principal
// stresses are derived here (Mohr's circle) so plates AND quads expose σ1/σ2
// identically — the quad solver struct does not carry them, and deriving in the
// UI keeps shell results consistent without any solver change.

import { woodArmer } from './wood-armer';

/** The membrane/bending fields shared by PlateStress and QuadStress. */
export interface ShellStressLike {
  sigmaXx: number;
  sigmaYy: number;
  tauXy: number;
  mx: number;
  my: number;
  mxy: number;
  vonMises: number;
  /** For the required-steel components: the effective depth, m, and the bars' fy, MPa. */
  steelBasis?: { d: number; fy: number };
  /** Thickness, m: the forces per unit length and the faces read it. */
  t?: number;
  /** Transverse shears, kN/m, local: MITC4 quads only. */
  qx?: number;
  qy?: number;
}

/**
 * Which face a stress is read on: the mid-surface (membrane), the top or bottom fibre, the more
 * stressed of the two by Von Mises (the engine's own Von Mises), or `auto`: Von Mises on the more
 * stressed face and every other stress on the mid-surface.
 */
export type ShellFace = 'auto' | 'mid' | 'top' | 'bottom' | 'worst';

export interface PrincipalStress {
  sigma1: number;   // max principal
  sigma2: number;   // min principal
  angleDeg: number; // orientation of σ1 from local x, degrees
}

/** In-plane principal stresses from the membrane stress tensor (Mohr). */
export function principalStresses(sxx: number, syy: number, txy: number): PrincipalStress {
  const avg = (sxx + syy) / 2;
  const diff = (sxx - syy) / 2;
  const r = Math.sqrt(diff * diff + txy * txy);
  return {
    sigma1: avg + r,
    sigma2: avg - r,
    angleDeg: 0.5 * Math.atan2(2 * txy, sxx - syy) * (180 / Math.PI),
  };
}

/** Von Mises of a plane stress state. */
export function vonMisesPlane(sxx: number, syy: number, txy: number): number {
  return Math.sqrt(Math.max(0, sxx * sxx - sxx * syy + syy * syy + 3 * txy * txy));
}

/** Tresca of a plane stress state: the largest difference of the three principals, σ3 = 0 included. */
export function trescaPlane(sxx: number, syy: number, txy: number): number {
  const { sigma1, sigma2 } = principalStresses(sxx, syy, txy);
  return Math.max(sigma1 - sigma2, Math.abs(sigma1), Math.abs(sigma2));
}

/** An in-plane stress state. */
export interface PlaneStress { sxx: number; syy: number; txy: number }

/**
 * The stress on the shell's two faces: membrane plus and minus 6M/t². Top is z = +t/2 along the
 * element's local z, the engine's convention (`element/plate.rs`, "Combined top/bottom fibre
 * stresses").
 */
export function faceStresses(s: { sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number }, t: number): { top: PlaneStress; bottom: PlaneStress } {
  const k = 6 / (t * t);
  return {
    top: { sxx: s.sigmaXx + k * s.mx, syy: s.sigmaYy + k * s.my, txy: s.tauXy + k * s.mxy },
    bottom: { sxx: s.sigmaXx - k * s.mx, syy: s.sigmaYy - k * s.my, txy: s.tauXy - k * s.mxy },
  };
}

/**
 * σ1, σ2 and Von Mises as the engine reports them for a DKT triangle: on the face where Von Mises
 * is larger. Combinations recompute them this way, so a combination's plate value means what a
 * case's does.
 */
export function worseFace(s: { sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number }, t: number): { sigma1: number; sigma2: number; vonMises: number } {
  const { top, bottom } = faceStresses(s, t);
  const vt = vonMisesPlane(top.sxx, top.syy, top.txy), vb = vonMisesPlane(bottom.sxx, bottom.syy, bottom.txy);
  const f = vt >= vb ? top : bottom;
  const p = principalStresses(f.sxx, f.syy, f.txy);
  return { sigma1: p.sigma1, sigma2: p.sigma2, vonMises: Math.max(vt, vb) };
}

export type ShellContourComponent =
  | 'vonMises'
  | 'sigmaXx' | 'sigmaYy' | 'tauXy'
  | 'sigma1' | 'sigma2'
  | 'mx' | 'my' | 'mxy'
  | 'mmax' | 'mmin'
  | 'nx' | 'ny' | 'nxy'
  | 'vx' | 'vy' | 'vmax'
  | 'asBotX' | 'asBotY' | 'asTopX' | 'asTopY';

/**
 * Family a component belongs to. Drives selector/table grouping AND the
 * unit-consistent "negligible" test (membrane/principal/equiv are all stresses
 * in kN/m²; bending moments are kN·m/m and must be judged against each other).
 */
export type ShellComponentGroup = 'equiv' | 'membrane' | 'principal' | 'bending' | 'forces' | 'shear' | 'steel';

export interface ShellComponentMeta {
  key: ShellContourComponent;
  /** Short label (plain text, used in dropdowns / legend). */
  label: string;
  /** Unit string. */
  unit: string;
  /** True for quantities that can be negative (diverging colour scale). */
  signed: boolean;
  /** Family (in-plane membrane stress, principal stress, plate bending, or equivalent). */
  group: ShellComponentGroup;
}

const STRESS_UNIT = 'kN/m²';
const MOMENT_UNIT = 'kN·m/m';
const FORCE_UNIT = 'kN/m';

/** Ordered list for selectors / legend. */
export const SHELL_CONTOUR_COMPONENTS: ShellComponentMeta[] = [
  { key: 'vonMises', label: 'Von Mises σ', unit: STRESS_UNIT, signed: false, group: 'equiv' },
  { key: 'sigma1',   label: 'σ1 (principal)', unit: STRESS_UNIT, signed: true, group: 'principal' },
  { key: 'sigma2',   label: 'σ2 (principal)', unit: STRESS_UNIT, signed: true, group: 'principal' },
  { key: 'sigmaXx',  label: 'σxx (membrane)', unit: STRESS_UNIT, signed: true, group: 'membrane' },
  { key: 'sigmaYy',  label: 'σyy (membrane)', unit: STRESS_UNIT, signed: true, group: 'membrane' },
  { key: 'tauXy',    label: 'τxy (membrane)', unit: STRESS_UNIT, signed: true, group: 'membrane' },
  { key: 'mx',       label: 'mx (bending)', unit: MOMENT_UNIT, signed: true, group: 'bending' },
  { key: 'my',       label: 'my (bending)', unit: MOMENT_UNIT, signed: true, group: 'bending' },
  { key: 'mxy',      label: 'mxy (twist)', unit: MOMENT_UNIT, signed: true, group: 'bending' },
  { key: 'mmax',     label: 'Mmax (principal)', unit: MOMENT_UNIT, signed: true, group: 'bending' },
  { key: 'mmin',     label: 'Mmin (principal)', unit: MOMENT_UNIT, signed: true, group: 'bending' },
  { key: 'nx',       label: 'Nx', unit: FORCE_UNIT, signed: true, group: 'forces' },
  { key: 'ny',       label: 'Ny', unit: FORCE_UNIT, signed: true, group: 'forces' },
  { key: 'nxy',      label: 'Nxy', unit: FORCE_UNIT, signed: true, group: 'forces' },
  { key: 'vx',       label: 'Vx', unit: FORCE_UNIT, signed: true, group: 'shear' },
  { key: 'vy',       label: 'Vy', unit: FORCE_UNIT, signed: true, group: 'shear' },
  { key: 'vmax',     label: 'Vmax', unit: FORCE_UNIT, signed: false, group: 'shear' },
  { key: 'asBotX',   label: 'As bottom x', unit: 'cm²/m', signed: false, group: 'steel' },
  { key: 'asBotY',   label: 'As bottom y', unit: 'cm²/m', signed: false, group: 'steel' },
  { key: 'asTopX',   label: 'As top x', unit: 'cm²/m', signed: false, group: 'steel' },
  { key: 'asTopY',   label: 'As top y', unit: 'cm²/m', signed: false, group: 'steel' },
];

export const SHELL_COMPONENT_GROUP_LABELS: Record<ShellComponentGroup, string> = {
  equiv: 'Equivalent',
  membrane: 'Membrane (in-plane) stress',
  principal: 'Principal stress',
  bending: 'Bending moment / unit width',
  forces: 'Membrane force / unit width',
  shear: 'Transverse shear / unit width',
  steel: 'Required steel (Wood-Armer)',
};

/**
 * Steel a face and direction needs, cm²/m: the Wood–Armer design moment over φ·0,9·d·fy, the same
 * lever arm the slab design uses. Zero without a basis (a shell with no thickness or bars known).
 */
export function requiredSteel(s: ShellStressLike, key: 'asBotX' | 'asBotY' | 'asTopX' | 'asTopY'): number {
  if (!s.steelBasis || !(s.steelBasis.d > 0) || !(s.steelBasis.fy > 0)) return 0;
  const w = woodArmer(s.mx, s.my, s.mxy);
  const m = key === 'asBotX' ? w.bottomX : key === 'asBotY' ? w.bottomY : key === 'asTopX' ? w.topX : w.topY;
  return (m * 1000) / (0.9 * 0.9 * s.steelBasis.d * s.steelBasis.fy * 1e6) * 1e4;
}

/** i18n keys for a component's and a group's name; `label` above stays as the symbol fallback. */
export const shellComponentLabelKey = (key: ShellContourComponent) => `shell.comp.${key}`;
export const shellGroupLabelKey = (group: ShellComponentGroup) => `shell.group.${group}`;

export function shellComponentMeta(key: ShellContourComponent): ShellComponentMeta {
  return SHELL_CONTOUR_COMPONENTS.find(c => c.key === key) ?? SHELL_CONTOUR_COMPONENTS[0];
}

/** Principal bending moments of (mx, my, mxy), and the direction of the larger from local x, degrees. */
export function principalMoments(mx: number, my: number, mxy: number): { m1: number; m2: number; angleDeg: number } {
  const p = principalStresses(mx, my, mxy);
  return { m1: p.sigma1, m2: p.sigma2, angleDeg: p.angleDeg };
}

/** The components a face applies to: the stresses. Forces, moments and shears are of the section. */
export const FACE_GROUPS: readonly ShellComponentGroup[] = ['equiv', 'membrane', 'principal'];

/** The face a component is read on: `auto` resolved, and the section's own for what is not a stress. */
export function faceRead(key: ShellContourComponent, face: ShellFace): Exclude<ShellFace, 'auto'> {
  const group = shellComponentMeta(key).group;
  if (!FACE_GROUPS.includes(group)) return 'mid';
  if (face === 'auto') return group === 'equiv' ? 'worst' : 'mid';
  return face;
}

/** The in-plane stress on a face; null on a fibre of a shell with no thickness. */
function planeOn(s: ShellStressLike, face: Exclude<ShellFace, 'auto'>): PlaneStress | null {
  if (face === 'mid') return { sxx: s.sigmaXx, syy: s.sigmaYy, txy: s.tauXy };
  if (!(s.t && s.t > 0)) return null;
  const { top, bottom } = faceStresses(s, s.t);
  if (face === 'top') return top;
  if (face === 'bottom') return bottom;
  return vonMisesPlane(top.sxx, top.syy, top.txy) >= vonMisesPlane(bottom.sxx, bottom.syy, bottom.txy) ? top : bottom;
}

/**
 * Scalar value of a contour component for one shell element (deriving principals), on `face`.
 * NaN where the element does not give it: a transverse shear on a triangle, a force or a face with
 * no thickness.
 */
export function shellComponentValue(s: ShellStressLike, key: ShellContourComponent, face: ShellFace = 'auto'): number {
  const read = faceRead(key, face);
  if (key === 'vonMises' && read === 'worst') return s.vonMises;
  const f = planeOn(s, read);
  if (!f) return NaN;
  const force = (v: number) => (s.t && s.t > 0 ? v * s.t : NaN);
  switch (key) {
    case 'vonMises': return vonMisesPlane(f.sxx, f.syy, f.txy);
    case 'sigmaXx': return f.sxx;
    case 'sigmaYy': return f.syy;
    case 'tauXy': return f.txy;
    case 'mx': return s.mx;
    case 'my': return s.my;
    case 'mxy': return s.mxy;
    case 'mmax': return principalMoments(s.mx, s.my, s.mxy).m1;
    case 'mmin': return principalMoments(s.mx, s.my, s.mxy).m2;
    case 'nx': return force(s.sigmaXx);
    case 'ny': return force(s.sigmaYy);
    case 'nxy': return force(s.tauXy);
    case 'vx': return s.qx ?? NaN;
    case 'vy': return s.qy ?? NaN;
    case 'vmax': return s.qx === undefined || s.qy === undefined ? NaN : Math.hypot(s.qx, s.qy);
    case 'sigma1': return principalStresses(f.sxx, f.syy, f.txy).sigma1;
    case 'sigma2': return principalStresses(f.sxx, f.syy, f.txy).sigma2;
    case 'asBotX': case 'asBotY': case 'asTopX': case 'asTopY': return requiredSteel(s, key);
    default: return 0;
  }
}

/**
 * The direction a principal component acts along, degrees from the element's local x; null for a
 * component without one.
 */
export function shellComponentAngle(s: ShellStressLike, key: ShellContourComponent, face: ShellFace = 'auto'): number | null {
  if (key === 'mmax' || key === 'mmin') {
    const a = principalMoments(s.mx, s.my, s.mxy).angleDeg;
    return key === 'mmax' ? a : a + 90;
  }
  if (key !== 'sigma1' && key !== 'sigma2') return null;
  const f = planeOn(s, faceRead(key, face));
  if (!f) return null;
  const a = principalStresses(f.sxx, f.syy, f.txy).angleDeg;
  return key === 'sigma1' ? a : a + 90;
}

/** Min/max of a component across all supplied shells (for a contour legend). */
export function shellComponentRange(
  shells: ShellStressLike[],
  key: ShellContourComponent,
): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const s of shells) {
    const v = shellComponentValue(s, key);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) { min = 0; max = 0; }
  return { min, max };
}

/**
 * How a component reads for the CURRENT result set — so the UI can be honest
 * rather than painting a misleading full-range contour over a field that is
 * really flat or ~0 (e.g. membrane stress in a pure-bending slab):
 *   - 'negligible' : peak is a tiny fraction of the governing field in its unit
 *                    family (stress vs moment) — "this component is ≈ 0 here".
 *   - 'uniform'    : non-zero but essentially constant (no spatial variation).
 *   - 'varying'    : a genuine contour worth colouring.
 * No faked variation: the thresholds only *label* the data, never alter it.
 */
export type ShellComponentStatus = 'varying' | 'uniform' | 'negligible';

export interface ShellComponentStat {
  key: ShellContourComponent;
  min: number;
  max: number;
  peak: number;  // max absolute value
  span: number;  // max - min
  status: ShellComponentStatus;
}

/** Components compared with each other, one family per unit. */
const UNIT_FAMILY: Record<ShellComponentGroup, 'stress' | 'moment' | 'force' | 'steel'> = {
  equiv: 'stress', membrane: 'stress', principal: 'stress', bending: 'moment', forces: 'force', shear: 'force', steel: 'steel',
};

/** Classify every contour component for one result set (unit-consistent refs). */
export function shellComponentStats(
  shells: ShellStressLike[],
): Record<ShellContourComponent, ShellComponentStat> {
  const raw = {} as Record<ShellContourComponent, { min: number; max: number; peak: number; span: number; group: ShellComponentGroup }>;
  const refs = { stress: 0, moment: 0, force: 0, steel: 0 };
  for (const meta of SHELL_CONTOUR_COMPONENTS) {
    const { min, max } = shellComponentRange(shells, meta.key);
    const peak = Math.max(Math.abs(min), Math.abs(max));
    raw[meta.key] = { min, max, peak, span: max - min, group: meta.group };
    const fam = UNIT_FAMILY[meta.group];
    refs[fam] = Math.max(refs[fam], peak);
  }
  const out = {} as Record<ShellContourComponent, ShellComponentStat>;
  for (const meta of SHELL_CONTOUR_COMPONENTS) {
    const r = raw[meta.key];
    const ref = refs[UNIT_FAMILY[meta.group]];
    let status: ShellComponentStatus;
    if (ref <= 0 || r.peak < 1e-3 * ref) status = 'negligible';
    else if (r.span < 1e-3 * r.peak) status = 'uniform';
    else status = 'varying';
    out[meta.key] = { key: meta.key, min: r.min, max: r.max, peak: r.peak, span: r.span, status };
  }
  return out;
}
