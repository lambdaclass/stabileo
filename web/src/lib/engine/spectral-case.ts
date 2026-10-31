/**
 * A response spectrum as a load case: its result is a set of signed values that a combination
 * takes like any case's, with a ± where both senses count.
 *
 * Each direction the case excites is worked out on its own, as the engine's spectral analysis
 * does one direction: per mode m the displacement field is u = φₘ · Sdₘ · Γₘd (`spectral.rs`),
 * Sdₘ = Sa(Tₘ)/ωₘ². The structure is solved with that field imposed at every node, which gives
 * each mode's reactions, member end forces and shell stresses exactly as the engine's stiffness
 * reads them. The modes are combined quantity by quantity (SRSS, CQC with the Der Kiureghian
 * correlation, or ABS), and each value takes the sign it has in the dominant mode: the mode with
 * the most mass excited in that direction.
 *
 * Then the directions, quantity by quantity, by the case's direction factors f_d: as percentages,
 * E = Σ f_d·|E_d| (the 100/30 rule: |E₁| + 0.3·|E₂| with factors 1 and 0.3), or by SRSS,
 * E = √Σ (f_d·E_d)²; with the sign of the main direction's term (the largest factor). Each
 * direction enters by its size, so (1, +0.3) and (1, −0.3) give the same case. Adding the
 * directions mode by mode, k = Sd · Σ f_d Γ_d, was one oblique excitation instead: on a
 * two-storey frame a corner column's N read 3.09 where the rule gives 4.10.
 *
 * Along a member every mode's diagram is a straight line (no load inside the member), and the
 * combination of straight lines never rises above the straight line between its end values: the
 * case's diagram is that line, read from the combined ends. A shell's Von Mises is a size, so
 * the case's is too.
 *
 * The spectrum is the project's code (CIRSOC 103) or one the user writes: a table of Sa or Sd
 * against period, interpolated linearly or on logarithmic axes.
 *
 * Pure.
 */
import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import type { ModalResult3D } from './result-types';
import { mergeResultDiagnostics } from './result-diagnostics';
import { cqcRho } from './loads/seismic-modal';
import { reduceById, ELEMENT_KEEP } from './combination-methods';
import { parseDecimal } from '../utils/numeric-input';

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

/** How a case's directions add, quantity by quantity: Σ f_d·|E_d|, or √Σ (f_d·E_d)². */
export type DirectionRule = 'percentage' | 'srss';

export type Direction = 'x' | 'y' | 'z';
export const DIRECTIONS: readonly Direction[] = ['x', 'y', 'z'];

/** What a spectral case states (`LoadCase.spectral`). */
export interface SpectralCaseDef {
  source: { kind: 'code' } | { kind: 'user'; spectrumId: number };
  /** The directions' factors (1 along the main one, 0.3 across, for the 100/30 rule). */
  factors: { x: number; y: number; z: number };
  rule: ModalRule;
  /** Damping ratio for CQC. */
  xi: number;
  /** Multiplies the ordinate: γr/R for the code's spectrum, or the user's own factor. */
  scale: number;
  /** How the directions add; percentages when absent. */
  directions?: DirectionRule;
}

/** The directions a case excites: those with a factor. */
export const excitedDirections = (def: Pick<SpectralCaseDef, 'factors'>): Direction[] => DIRECTIONS.filter((d) => def.factors[d] !== 0);

/**
 * The rows a table is read on: on log axes and for Sd, positive periods only (T = 0 has no
 * logarithm, and an Sd there no Sa).
 */
function tablePoints(s: UserSpectrum): Array<[number, number]> {
  return s.points.filter(([p]) => p > 0 || (s.interpolation === 'linear' && s.ordinate === 'Sa')).sort((a, b) => a[0] - b[0]);
}

/** The table's ordinate at a period inside it. */
function ordinateAt(s: UserSpectrum, pts: ReadonlyArray<[number, number]>, t: number): number {
  if (t <= pts[0]![0]) return pts[0]![1];
  if (t >= pts[pts.length - 1]![0]) return pts[pts.length - 1]![1];
  let i = 0;
  while (pts[i + 1]![0] < t) i++;
  const [t0, v0] = pts[i]!, [t1, v1] = pts[i + 1]!;
  if (s.interpolation === 'log' && t0 > 0 && v0 > 0 && v1 > 0) {
    const k = Math.log(t / t0) / Math.log(t1 / t0);
    return Math.exp(Math.log(v0) + k * (Math.log(v1) - Math.log(v0)));
  }
  return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
}

/**
 * Sa, m/s², of a user spectrum at a period.
 *
 * Outside the table Sa is held at its end values, below the first period as beyond the last, for
 * an Sd table as for an Sa one: the rule the engine's spectral analysis reads its table by
 * (`spectral.rs`, the table's ends held), so a spectral case and the advanced analysis read one
 * spectrum alike (`userSpectrumPointsInG`). An Sd table held Sd flat instead, and Sa = (2π/T)²·Sd
 * grew without bound toward short periods: 32 g at 0.05 s for Sd = 0.02 m from 0.5 s, where the
 * engine read 0.32 g.
 */
export function userSa(s: UserSpectrum, t: number): number {
  const pts = tablePoints(s);
  if (!pts.length) return 0;
  const tc = Math.min(Math.max(t, pts[0]![0]), pts[pts.length - 1]![0]);
  const v = ordinateAt(s, pts, tc);
  if (s.ordinate === 'Sd') { const w = (2 * Math.PI) / tc; return v * w * w; }
  return s.unit === 'g' ? v * G : v;
}

/**
 * The table of a user spectrum as Sa in g, for the engine's spectral analysis; log and Sd tables
 * densely sampled. It starts where `userSa` reads the table from: a linear Sa table at its T = 0
 * row, which the engine takes as it is. That row was dropped, and the engine held the next one
 * flat below it: the default spectrum read 1.0 g at 0.2 s where the case read 0.64 g.
 */
export function userSpectrumPointsInG(s: UserSpectrum): Array<{ period: number; sa: number }> {
  const ts = [...new Set(tablePoints(s).map(([t]) => t))];
  if (!ts.length) return [];
  const periods = new Set<number>(ts);
  if (s.interpolation === 'log' || s.ordinate === 'Sd') {
    for (let i = 0; i + 1 < ts.length; i++) {
      if (ts[i]! <= 0) continue;
      for (let k = 1; k < 40; k++) periods.add(ts[i]! * (ts[i + 1]! / ts[i]!) ** (k / 40));
    }
  }
  return [...periods].sort((a, b) => a - b).map((t) => ({ period: t, sa: userSa(s, t) / G }));
}

/** Why a typed table is refused: too few rows, a negative period or ordinate, a period twice. */
export type SpectrumTableError = 'rows' | 'negative' | 'duplicate';

/**
 * Rows of "period, value" (a comma, a semicolon, a tab or spaces between them; a decimal comma
 * reads), sorted by period. A spectrum has no negative ordinate, and one period has one value:
 * a row repeating a period made the interpolation divide by zero between the two.
 */
export function parseSpectrumTable(raw: string): { points: Array<[number, number]> } | { error: SpectrumTableError } {
  const rows: Array<[number, number]> = [];
  for (const line of raw.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || /^[a-zA-Z#]/.test(l)) continue;
    const parts = l.split(/\s*[;\t]\s*|\s+|,\s+/).filter(Boolean);
    const cells = parts.length >= 2 ? parts : l.split(',');
    if (cells.length < 2) return { error: 'rows' };
    const a = parseDecimal(cells[0]!), b = parseDecimal(cells[1]!);
    if (a === null || b === null) return { error: 'rows' };
    if (a < 0 || b < 0) return { error: 'negative' };
    rows.push([a, b]);
  }
  rows.sort((p, q) => p[0] - q[0]);
  for (let i = 1; i < rows.length; i++) if (rows[i]![0] === rows[i - 1]![0]) return { error: 'duplicate' };
  return rows.length >= 2 ? { points: rows } : { error: 'rows' };
}

export interface ModeCoefficient {
  mode: number;
  period: number;
  /** The mode shape's multiplier along one direction: Sd · Γ_d. */
  k: number;
  /** Mass excited in that direction, for choosing the dominant mode. */
  excited: number;
}

const PARTICIPATION = { x: 'participationX', y: 'participationY', z: 'participationZ' } as const;

/** Each mode's multiplier along a direction (`saOf`: Sa in m/s² at a period, before `scale`). */
export function modeCoefficients(modal: Pick<ModalResult3D, 'modes'>, dir: Direction, saOf: (t: number) => number, scale: number): ModeCoefficient[] {
  return modal.modes.map((m, i) => {
    const omega = m.omega || (2 * Math.PI) / m.period;
    const g = (m as unknown as Record<string, number | undefined>)[PARTICIPATION[dir]] ?? 0;
    const sd = (saOf(m.period) * scale) / (omega * omega);
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

/** The combination of one quantity over the directions, with the main direction's sign. */
export function directionCombine(rule: DirectionRule, factors: readonly number[], vs: readonly number[]): number {
  const terms = vs.map((v, i) => factors[i]! * v);
  const mag = rule === 'srss' ? Math.sqrt(terms.reduce((s, v) => s + v * v, 0)) : terms.reduce((s, v) => s + Math.abs(v), 0);
  let main = 0;
  factors.forEach((f, i) => { if (Math.abs(f) > Math.abs(factors[main]!)) main = i; });
  return (terms[main] ?? 0) < 0 ? -mag : mag;
}

/**
 * Results combined quantity by quantity, row by row in their order (`reduceById`). A member keeps
 * no loads: its diagram is the straight line between the combined ends. Von Mises is a size.
 */
function reduceResults(reduce: (vs: readonly number[]) => number, results: readonly AnalysisResults3D[]): AnalysisResults3D {
  const keepNode = new Set(['nodeId']), keepEl = new Set(['elementId']);
  const elementForces = reduceById(reduce, results.map((r) => r.elementForces), 'elementId', ELEMENT_KEEP).map((ef): ElementForces3D => ({
    ...ef,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: [], distributedLoadsZ: [], distributedLoadsX: [],
    pointLoadsY: [], pointLoadsZ: [], pieces: undefined,
  }));
  const sized = <T extends { vonMises: number; nodalVonMises?: number[] }>(s: T): T => ({
    ...s, vonMises: Math.abs(s.vonMises), ...(s.nodalVonMises ? { nodalVonMises: s.nodalVonMises.map(Math.abs) } : {}),
  });
  return {
    ...mergeResultDiagnostics(results),
    displacements: reduceById(reduce, results.map((r) => r.displacements), 'nodeId', keepNode),
    reactions: reduceById(reduce, results.map((r) => r.reactions), 'nodeId', keepNode),
    elementForces,
    ...(results.some((r) => r.plateStresses?.length) ? { plateStresses: reduceById(reduce, results.map((r) => r.plateStresses), 'elementId', keepEl).map(sized) } : {}),
    ...(results.some((r) => r.quadStresses?.length) ? { quadStresses: reduceById(reduce, results.map((r) => r.quadStresses), 'elementId', keepEl).map(sized) } : {}),
  };
}

/** One direction's result from each mode shape's solved result (`unit`, one per mode) and the direction's multipliers. */
export function combineModes(rule: ModalRule, xi: number, coefs: readonly ModeCoefficient[], unit: readonly AnalysisResults3D[]): AnalysisResults3D {
  const rho = coefs.map((a) => coefs.map((b) => (rule === 'cqc' ? cqcRho(a.period, b.period, xi) : a === b ? 1 : 0)));
  let dominant = 0;
  coefs.forEach((f, i) => { if (f.excited > coefs[dominant]!.excited) dominant = i; });
  return reduceResults((vs) => modalCombine(rule, vs.map((v, i) => v * coefs[i]!.k), rho, dominant), unit);
}

/** The directions' results combined by their factors (`directionCombine`). */
export function combineDirections(rule: DirectionRule, parts: ReadonlyArray<{ factor: number; result: AnalysisResults3D }>): AnalysisResults3D {
  const factors = parts.map((p) => p.factor);
  return reduceResults((vs) => directionCombine(rule, factors, vs), parts.map((p) => p.result));
}

/**
 * A spectral case's result: each direction it excites worked out from the modes on its own, then
 * the directions combined. `saOf`: Sa in m/s² at a period, before the case's scale.
 */
export function spectralCaseResult(def: SpectralCaseDef, modal: Pick<ModalResult3D, 'modes' | 'structuredDiagnostics'>, saOf: (t: number) => number, unit: readonly AnalysisResults3D[]): AnalysisResults3D {
  const dirs = excitedDirections(def);
  const along = dirs.length ? dirs : (['x'] as Direction[]);
  const result = combineDirections(def.directions ?? 'percentage', along.map((d) => ({
    factor: def.factors[d],
    result: combineModes(def.rule, def.xi, modeCoefficients(modal, d, saOf, def.scale), unit),
  })));
  return { ...result, ...mergeResultDiagnostics([result, modal]) };
}
