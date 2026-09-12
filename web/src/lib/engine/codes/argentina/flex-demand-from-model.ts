/**
 * The model's resultants at a station → the demand fields of one Case.
 *
 * ── Why this is its own function ───────────────────────────────────
 *
 * Two things happen on the way from a solved member to the calculator's
 * inputs, and both are easy to get wrong in a way that looks fine.
 *
 * The SIGN. The solver reports axial negative in compression — measured, not
 * assumed: a 3 m column carrying 100 kN downward comes back n = −100. The
 * workbook's Pu is positive in compression. So there is exactly one flip in
 * the whole path, and a flip that is missing, or applied twice, yields a
 * number no reader would question.
 *
 * The RESTRAINT. A Case is a question, and filling in a quantity the
 * question does not contain changes what is being asked. Simple bending has
 * no axial term; handing it one would either be ignored (confusing) or
 * silently turn a beam check into a column check (worse). So each Case takes
 * what it uses and nothing else, and says so in one table rather than in
 * scattered `if`s at the call site.
 *
 * Pulled out of the panel so both can be tested on their own. Clicking a
 * member in a viewport is not where you want to discover a sign error.
 */

import type { FlexCase } from './cirsoc-flex';

/** What `stationForces2D` / `stationForces3D` return, in kN and kN·m. */
export interface StationForces {
  /** Axial. NEGATIVE in compression, as the solver reports it. */
  n: number;
  /** Bending about the section's strong axis. */
  my: number;
  /** Bending about the weak axis. Always 0 in a plane frame. */
  mz: number;
}

/** The calculator's demand fields, in its own conventions. */
export interface FlexDemand {
  /** kN, POSITIVE in compression. Absent when the Case has no axial term. */
  Pu?: number;
  /** kN·m, a magnitude — the Case has no side. */
  Mu: number;
  /** kN·m about the second axis. Absent unless the Case is biaxial. */
  Muy?: number;
}

/**
 * Which terms each Case actually contains.
 *
 * `FSR`/`FST` are simple bending: a moment and nothing else. `FCR` and
 * `FCR-CIR` add the axial force. `FCO` adds the second moment as well.
 */
export const CASE_TAKES: Record<FlexCase, { axial: boolean; biaxial: boolean }> = {
  'FSR': { axial: false, biaxial: false },
  'FST': { axial: false, biaxial: false },
  'FCR': { axial: true, biaxial: false },
  'FCR-CIR': { axial: true, biaxial: false },
  'FCO': { axial: true, biaxial: true },
};

/** Two decimals: these are kN off a diagram, not a tolerance. */
const round2 = (v: number) => Math.round(v * 100) / 100;

export function demandForCase(f: StationForces, kase: FlexCase): FlexDemand {
  const takes = CASE_TAKES[kase];
  const out: FlexDemand = { Mu: round2(Math.abs(f.my)) };
  /*
   * The one sign flip. Compression is what a column carries and what the
   * sheet calls positive, so the solver's sign is inverted here — in one
   * place, named, rather than at each call site.
   */
  if (takes.axial) out.Pu = round2(-f.n);
  if (takes.biaxial) out.Muy = round2(Math.abs(f.mz));
  return out;
}
