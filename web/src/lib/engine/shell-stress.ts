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

export type ShellContourComponent =
  | 'vonMises'
  | 'sigmaXx' | 'sigmaYy' | 'tauXy'
  | 'sigma1' | 'sigma2'
  | 'mx' | 'my' | 'mxy';

export interface ShellComponentMeta {
  key: ShellContourComponent;
  /** Short label (plain text, used in dropdowns / legend). */
  label: string;
  /** Unit string. */
  unit: string;
  /** True for quantities that can be negative (diverging colour scale). */
  signed: boolean;
}

const STRESS_UNIT = 'kN/m²';
const MOMENT_UNIT = 'kN·m/m';

/** Ordered list for selectors / legend. */
export const SHELL_CONTOUR_COMPONENTS: ShellComponentMeta[] = [
  { key: 'vonMises', label: 'Von Mises σ', unit: STRESS_UNIT, signed: false },
  { key: 'sigma1',   label: 'σ1 (principal)', unit: STRESS_UNIT, signed: true },
  { key: 'sigma2',   label: 'σ2 (principal)', unit: STRESS_UNIT, signed: true },
  { key: 'sigmaXx',  label: 'σxx', unit: STRESS_UNIT, signed: true },
  { key: 'sigmaYy',  label: 'σyy', unit: STRESS_UNIT, signed: true },
  { key: 'tauXy',    label: 'τxy', unit: STRESS_UNIT, signed: true },
  { key: 'mx',       label: 'mx', unit: MOMENT_UNIT, signed: true },
  { key: 'my',       label: 'my', unit: MOMENT_UNIT, signed: true },
  { key: 'mxy',      label: 'mxy', unit: MOMENT_UNIT, signed: true },
];

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
