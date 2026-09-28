// Shell stress post-processing — pure helpers (CP2).
//
// The solver returns per-element membrane stresses (σxx, σyy, τxy), bending
// moments per unit width (mx, my, mxy) and a Von Mises scalar. Principal
// stresses are derived here (Mohr's circle) so plates AND quads expose σ1/σ2
// identically — the quad solver struct does not carry them, and deriving in the
// UI keeps shell results consistent without any solver change.

/** The membrane/bending fields shared by PlateStress and QuadStress. */
export interface ShellStressLike {
  sigmaXx: number;
  sigmaYy: number;
  tauXy: number;
  mx: number;
  my: number;
  mxy: number;
  vonMises: number;
}

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
  | 'mx' | 'my' | 'mxy';

/**
 * Family a component belongs to. Drives selector/table grouping AND the
 * unit-consistent "negligible" test (membrane/principal/equiv are all stresses
 * in kN/m²; bending moments are kN·m/m and must be judged against each other).
 */
export type ShellComponentGroup = 'equiv' | 'membrane' | 'principal' | 'bending';

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
];

export const SHELL_COMPONENT_GROUP_LABELS: Record<ShellComponentGroup, string> = {
  equiv: 'Equivalent',
  membrane: 'Membrane (in-plane) stress',
  principal: 'Principal stress',
  bending: 'Bending moment / unit width',
};

/** i18n keys for a component's and a group's name; `label` above stays as the symbol fallback. */
export const shellComponentLabelKey = (key: ShellContourComponent) => `shell.comp.${key}`;
export const shellGroupLabelKey = (group: ShellComponentGroup) => `shell.group.${group}`;

export function shellComponentMeta(key: ShellContourComponent): ShellComponentMeta {
  return SHELL_CONTOUR_COMPONENTS.find(c => c.key === key) ?? SHELL_CONTOUR_COMPONENTS[0];
}

/** Scalar value of a contour component for one shell element (deriving principals). */
export function shellComponentValue(s: ShellStressLike, key: ShellContourComponent): number {
  switch (key) {
    case 'vonMises': return s.vonMises;
    case 'sigmaXx': return s.sigmaXx;
    case 'sigmaYy': return s.sigmaYy;
    case 'tauXy': return s.tauXy;
    case 'mx': return s.mx;
    case 'my': return s.my;
    case 'mxy': return s.mxy;
    case 'sigma1': return principalStresses(s.sigmaXx, s.sigmaYy, s.tauXy).sigma1;
    case 'sigma2': return principalStresses(s.sigmaXx, s.sigmaYy, s.tauXy).sigma2;
    default: return 0;
  }
}

/** Min/max of a component across all supplied shells (for a contour legend). */
export function shellComponentRange(
  shells: ShellStressLike[],
  key: ShellContourComponent,
): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const s of shells) {
    const v = shellComponentValue(s, key);
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

const STRESS_GROUPS: ShellComponentGroup[] = ['equiv', 'membrane', 'principal'];

/** Classify every contour component for one result set (unit-consistent refs). */
export function shellComponentStats(
  shells: ShellStressLike[],
): Record<ShellContourComponent, ShellComponentStat> {
  const raw = {} as Record<ShellContourComponent, { min: number; max: number; peak: number; span: number; group: ShellComponentGroup }>;
  let stressRef = 0, momentRef = 0;
  for (const meta of SHELL_CONTOUR_COMPONENTS) {
    const { min, max } = shellComponentRange(shells, meta.key);
    const peak = Math.max(Math.abs(min), Math.abs(max));
    raw[meta.key] = { min, max, peak, span: max - min, group: meta.group };
    if (meta.group === 'bending') momentRef = Math.max(momentRef, peak);
    else stressRef = Math.max(stressRef, peak);
  }
  const out = {} as Record<ShellContourComponent, ShellComponentStat>;
  for (const meta of SHELL_CONTOUR_COMPONENTS) {
    const r = raw[meta.key];
    const ref = STRESS_GROUPS.includes(meta.group) ? stressRef : momentRef;
    let status: ShellComponentStatus;
    if (ref <= 0 || r.peak < 1e-3 * ref) status = 'negligible';
    else if (r.span < 1e-3 * r.peak) status = 'uniform';
    else status = 'varying';
    out[meta.key] = { key: meta.key, min: r.min, max: r.max, peak: r.peak, span: r.span, status };
  }
  return out;
}
