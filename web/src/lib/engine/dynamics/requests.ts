/**
 * The dynamic analyses' requests, built in one place.
 *
 * PRO's advanced panel used to assemble each payload inline, and the contract tests copied
 * those shapes by hand. Nothing tied the two together, so the panel could drift away from the
 * engine without a test noticing — and it had: the spectral payload sent `directions`,
 * `combination` and `numModes` to a struct that requires `modes` and `direction`, and failed to
 * parse on every run; the time history sent weight densities where the engine reads mass
 * densities, so every period came out √(1000/g) ≈ 10× too short.
 *
 * These builders are what the panel calls AND what the tests call. A payload that no longer
 * matches the engine now fails a test instead of a user.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { ModalResult3D } from '../result-types';

/** Standard gravity, m/s². The engine's own conversions use this value. */
export const G = 9.81;

/**
 * Mass density, kg/m³, per material id, from the weight density the model stores (kN/m³).
 *
 * `extraMaterialIds` are materials the request carries and the model does not — the penalty
 * members a rigid diaphragm adds. They get 1 kg/m³: negligible, but not zero, because a DOF with
 * no mass at all makes the mass matrix singular.
 */
export function massDensities(
  materials: Iterable<[number, { rho?: number }]>,
  extraMaterialIds: Iterable<number> = [],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, mat] of materials) out.set(id, (mat.rho ?? 0) * 1000 / G);
  for (const id of extraMaterialIds) if (!out.has(id)) out.set(id, 1.0);
  return out;
}

/** The same densities keyed the way the time-history and harmonic structs deserialise them. */
export function densityRecord(densities: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, d] of densities) out[String(id)] = d;
  return out;
}

/** One mode as `SpectralModeInput3D` reads it. */
export interface SpectralModeInput3D {
  frequency: number;
  period: number;
  omega: number;
  displacements: ModalResult3D['modes'][number]['displacements'];
  participationX: number;
  participationY: number;
  participationZ: number;
  effectiveMassX: number;
  effectiveMassY: number;
  effectiveMassZ: number;
}

/** The modal result, reduced to the fields spectral analysis takes. */
export function spectralModesFrom(modal: Pick<ModalResult3D, 'modes'>): SpectralModeInput3D[] {
  return modal.modes.map((m) => ({
    frequency: m.frequency,
    period: m.period,
    omega: m.omega,
    displacements: m.displacements,
    participationX: m.participationX,
    participationY: m.participationY,
    participationZ: m.participationZ,
    effectiveMassX: m.effectiveMassX,
    effectiveMassY: m.effectiveMassY,
    effectiveMassZ: m.effectiveMassZ,
  }));
}

/**
 * Running sum of the modal mass ratios, per direction.
 *
 * What the "cumulative" columns claim to be, and what a code's 90 % rule is written against.
 * The panel used to accumulate |Γ| instead, which has units of √mass and no 90 % to reach.
 */
export function cumulativeMassRatios(modes: ReadonlyArray<{ massRatioX?: number; massRatioY?: number; massRatioZ?: number }>): {
  x: number[]; y: number[]; z: number[];
} {
  let x = 0, y = 0, z = 0;
  const out = { x: [] as number[], y: [] as number[], z: [] as number[] };
  for (const m of modes) {
    x += m.massRatioX ?? 0; y += m.massRatioY ?? 0; z += m.massRatioZ ?? 0;
    out.x.push(x); out.y.push(y); out.z.push(z);
  }
  return out;
}

/** The two horizontal directions a building is excited in. Z is vertical in this app. */
export const HORIZONTAL_DIRECTIONS = ['X', 'Y'] as const;
export type HorizontalDirection = (typeof HORIZONTAL_DIRECTIONS)[number];

/** Harmonic ground acceleration, amplitude in g, as the m/s² series the engine samples per step. */
export function sineAccelerogram(ampG: number, freqHz: number, dt: number, nSteps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < nSteps; i++) out.push(ampG * G * Math.sin(2 * Math.PI * freqHz * i * dt));
  return out;
}

/** A typed acceleration list, in g, as m/s². Anything that is not a number is dropped. */
export function parseAccelerogramG(text: string): number[] {
  return text.split(/[,;\s]+/).filter((s) => s.length > 0).map(Number).filter((n) => Number.isFinite(n)).map((a) => a * G);
}

/** HHT-α is defined for α in [−1/3, 0]; outside it the scheme loses unconditional stability. */
export const HHT_ALPHA_RANGE = { min: -1 / 3, max: 0 } as const;

export function isValidHhtAlpha(alpha: number): boolean {
  return Number.isFinite(alpha) && alpha >= HHT_ALPHA_RANGE.min && alpha <= HHT_ALPHA_RANGE.max;
}

export interface TimeHistoryOptions {
  densities: Map<number, number>;
  dt: number;
  nSteps: number;
  direction: 'X' | 'Y' | 'Z';
  /** m/s², one value per step. */
  groundAccel: number[];
  dampingXi: number;
  method: 'newmark' | 'hht';
  /** Only read when `method` is `hht`. */
  alpha?: number;
}

/**
 * The `TimeHistoryInput3D` fields other than `solver`.
 *
 * The engine ignores `method` and switches to HHT-α only when `alpha` is present, so choosing
 * HHT in the panel without sending α ran average-acceleration Newmark under an HHT label.
 */
export function timeHistoryFields(o: TimeHistoryOptions): Record<string, unknown> {
  const hht = o.method === 'hht';
  if (hht && (o.alpha === undefined || !isValidHhtAlpha(o.alpha))) {
    throw new Error(`HHT-α needs α in [${HHT_ALPHA_RANGE.min.toFixed(3)}, 0]`);
  }
  return {
    densities: densityRecord(o.densities),
    timeStep: o.dt,
    nSteps: o.nSteps,
    method: o.method,
    beta: 0.25,
    gamma: 0.5,
    ...(hht ? { alpha: o.alpha } : {}),
    dampingXi: o.dampingXi,
    groundAccelX: o.direction === 'X' ? o.groundAccel : undefined,
    groundAccelY: o.direction === 'Y' ? o.groundAccel : undefined,
    groundAccelZ: o.direction === 'Z' ? o.groundAccel : undefined,
  };
}

/**
 * The largest horizontal base reaction over all supports, kN.
 *
 * The engine reports reactions as `fx/fy/fz/mx/my/mz`. The panel read `rx/ry`, which do not
 * exist on a reaction, so the figure it printed was always 0.
 */
export function peakBaseShear(reactions: ReadonlyArray<{ fx?: number; fy?: number }>): number {
  let sx = 0, sy = 0;
  for (const r of reactions) { sx += r.fx ?? 0; sy += r.fy ?? 0; }
  return Math.hypot(sx, sy);
}
