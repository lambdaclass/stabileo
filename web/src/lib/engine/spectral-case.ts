/**
 * A response spectrum as a load case: its result is a set of signed values that a combination
 * takes like any case's, with a ± where both senses count.
 *
 * Per mode m, the displacement field is u = φₘ · Sdₘ · Σ_d f_d Γₘd (the engine's own spectral
 * formula, `spectral.rs`, with the direction factors f_d applied to one simultaneous excitation),
 * Sdₘ = Sa(Tₘ)/ωₘ². The structure is solved with that field imposed at every node, which gives
 * each mode's reactions, member end forces and shell stresses exactly as the engine's stiffness
 * reads them. The modes are then combined quantity by quantity (SRSS, CQC with the Der Kiureghian
 * correlation, or ABS), and each value takes the sign it has in the dominant mode: the mode with the
 * most mass excited in the case's direction.
 *
 * Along a member every mode's diagram is a straight line (no load inside the member), and the
 * combination of straight lines never rises above the straight line between its end values: the
 * case's diagram is that line, read from the combined ends.
 *
 * The spectrum is the project's code (CIRSOC 103) or one the user writes: a table of Sa or Sd
 * against period, interpolated linearly or on logarithmic axes.
 *
 * Pure.
 */
import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import type { ModalResult3D } from './result-types';
import { cqcRho } from './loads/seismic-modal';
import { reduceById, ELEMENT_KEEP } from './combination-methods';

/** Standard gravity as the engine's spectral analysis takes it. */
export { G } from './dynamics/requests';
import { G } from './dynamics/requests';

/** A spectrum the user writes. */
export interface UserSpectrum {
  id: number;
  name: string;
  /** Pseudo-acceleration or displacement. */
  ordinate: 'Sa' | 'Sd';
  /** Sa in g or m/s²; Sd in m. */
  unit: 'g' | 'm/s2' | 'm';
  interpolation: 'linear' | 'log';
  /** [period s, ordinate], periods increasing. */
  points: Array<[number, number]>;
}

export type ModalRule = 'srss' | 'cqc' | 'abs';

/** What a spectral case states (`LoadCase.spectral`). */
export interface SpectralCaseDef {
  source: { kind: 'code' } | { kind: 'user'; spectrumId: number };
  /** The excitation's direction factors (1 along the main one, 0.3 across, for instance). */
  factors: { x: number; y: number; z: number };
  rule: ModalRule;
  /** Damping ratio for CQC. */
  xi: number;
  /** Multiplies the ordinate: γr/R for the code's spectrum, or the user's own factor. */
  scale: number;
}

/** Sa, m/s², of a user spectrum at a period; the ends held flat beyond the table. */
export function userSa(s: UserSpectrum, t: number): number {
  const pts = s.points.filter(([p]) => p > 0 || s.interpolation === 'linear').sort((a, b) => a[0] - b[0]);
  if (!pts.length) return 0;
  let v: number;
  if (t <= pts[0]![0]) v = pts[0]![1];
  else if (t >= pts[pts.length - 1]![0]) v = pts[pts.length - 1]![1];
  else {
    let i = 0;
    while (pts[i + 1]![0] < t) i++;
    const [t0, v0] = pts[i]!, [t1, v1] = pts[i + 1]!;
    if (s.interpolation === 'log' && t0 > 0 && v0 > 0 && v1 > 0) {
      const k = Math.log(t / t0) / Math.log(t1 / t0);
      v = Math.exp(Math.log(v0) + k * (Math.log(v1) - Math.log(v0)));
    } else v = v0 + (v1 - v0) * (t - t0) / (t1 - t0);
  }
  if (s.ordinate === 'Sd') { const w = (2 * Math.PI) / t; return v * w * w; }
  return s.unit === 'g' ? v * G : v;
}

/** The table of a user spectrum as Sa in g, for the engine's spectral analysis; log tables densely sampled. */
export function userSpectrumPointsInG(s: UserSpectrum): Array<{ period: number; sa: number }> {
  const ts = s.points.map(([t]) => t).filter((t) => t > 0).sort((a, b) => a - b);
  if (!ts.length) return [];
  const periods = new Set<number>(ts);
  if (s.interpolation === 'log' || s.ordinate === 'Sd') {
    for (let i = 0; i + 1 < ts.length; i++) for (let k = 1; k < 40; k++) periods.add(ts[i]! * (ts[i + 1]! / ts[i]!) ** (k / 40));
  }
  return [...periods].sort((a, b) => a - b).map((t) => ({ period: t, sa: userSa(s, t) / G }));
}

export interface ModeCoefficient {
  mode: number;
  period: number;
  /** The mode shape's multiplier under the case: Sd · Σ_d f_d Γ_d. */
  k: number;
  /** Mass excited in the case's direction, for choosing the dominant mode. */
  excited: number;
}

/** Each mode's multiplier under the case (`saOf`: Sa in m/s² at a period, before `scale`). */
export function modeCoefficients(modal: Pick<ModalResult3D, 'modes'>, def: SpectralCaseDef, saOf: (t: number) => number): ModeCoefficient[] {
  return modal.modes.map((m, i) => {
    const omega = m.omega || (2 * Math.PI) / m.period;
    const g = def.factors.x * (m.participationX ?? 0) + def.factors.y * (m.participationY ?? 0) + def.factors.z * (m.participationZ ?? 0);
    const sd = (saOf(m.period) * def.scale) / (omega * omega);
    return { mode: i + 1, period: m.period, k: g * sd, excited: g * g };
  });
}

/** A mode shape as the displacement to impose at each node: ux, uy, uz, rx, ry, rz. */
export function modeShapeField(mode: ModalResult3D['modes'][number]): Map<number, [number, number, number, number, number, number]> {
  return new Map(mode.displacements.map((d) => [d.nodeId, [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] as [number, number, number, number, number, number]]));
}

/** The combination of one quantity over the modes, with the dominant mode's sign. */
export function modalCombine(rule: ModalRule, vs: readonly number[], rho: readonly (readonly number[])[], dominant: number): number {
  let mag: number;
  if (rule === 'abs') mag = vs.reduce((s, v) => s + Math.abs(v), 0);
  else if (rule === 'srss') mag = Math.sqrt(vs.reduce((s, v) => s + v * v, 0));
  else {
    let q = 0;
    for (let i = 0; i < vs.length; i++) for (let j = 0; j < vs.length; j++) q += rho[i]![j]! * vs[i]! * vs[j]!;
    mag = Math.sqrt(Math.max(0, q));
  }
  return (vs[dominant] ?? 0) < 0 ? -mag : mag;
}

/** The case's result from each mode shape's solved result (`unit`, one per mode) and the case's multipliers. */
export function combineModes(rule: ModalRule, xi: number, coefs: readonly ModeCoefficient[], unit: readonly AnalysisResults3D[]): AnalysisResults3D {
  const rho = coefs.map((a) => coefs.map((b) => (rule === 'cqc' ? cqcRho(a.period, b.period, xi) : a === b ? 1 : 0)));
  let dominant = 0;
  coefs.forEach((f, i) => { if (f.excited > coefs[dominant]!.excited) dominant = i; });
  const reduce = (vs: readonly number[]) => modalCombine(rule, vs.map((v, i) => v * coefs[i]!.k), rho, dominant);
  const keepNode = new Set(['nodeId']), keepEl = new Set(['elementId']);
  const elementForces = reduceById(reduce, unit.map((r) => r.elementForces), 'elementId', ELEMENT_KEEP).map((ef): ElementForces3D => ({
    ...ef,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: [], distributedLoadsZ: [], distributedLoadsX: [],
    pointLoadsY: [], pointLoadsZ: [], pieces: undefined,
  }));
  return {
    displacements: reduceById(reduce, unit.map((r) => r.displacements), 'nodeId', keepNode),
    reactions: reduceById(reduce, unit.map((r) => r.reactions), 'nodeId', keepNode),
    elementForces,
    ...(unit.some((r) => r.plateStresses?.length) ? { plateStresses: reduceById(reduce, unit.map((r) => r.plateStresses), 'elementId', keepEl) } : {}),
    ...(unit.some((r) => r.quadStresses?.length) ? { quadStresses: reduceById(reduce, unit.map((r) => r.quadStresses), 'elementId', keepEl) } : {}),
  };
}
