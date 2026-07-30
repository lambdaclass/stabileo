/**
 * Candidate-generator contract.
 *
 * The generator is FEEDBACK-DRIVEN rather than a plain iterable: the search hands
 * back the authoritative verdict for each candidate, and the generator escalates
 * only the knobs that actually failed. That is what keeps the search bounded
 * (coordinate descent over independent regions) while still covering the
 * code-permitted envelope before any SECTION_INADEQUATE claim is made.
 *
 * Determinism contract: the same context + the same feedback sequence must produce
 * the same candidate sequence. Feedback is itself deterministic (it comes from the
 * pure verifier), so a whole run is reproducible. Pinned by a determinism test.
 */

import type { ProvidedReinforcement } from '../../store/model.svelte';
import type { ProvidedRebarResult } from '../station-design-forces';
import type { CandidateCost, LimitingConstraint } from './outcome';

export interface CandidateFeedback {
  verdict: ProvidedRebarResult;
  /** demand/capacity across strength checks. */
  worstUtilization: number;
  /** Coarse failure classes present in the verdict. */
  limiting: LimitingConstraint[];
}

export interface CandidateMeta {
  /** Enumeration index — the final deterministic tie-break. */
  index: number;
  /** Cost vector for the optimizer. */
  cost: CandidateCost;
  /** Human-readable knob state, for diagnostics. */
  label: string;
}

export interface Candidate {
  reinforcement: ProvidedReinforcement;
  meta: CandidateMeta;
}

export interface CandidateGenerator {
  /**
   * Produce the next candidate. Pass `null` on the first call, then the feedback
   * for the candidate just returned. Returns null when the generator is done.
   */
  next(feedback: CandidateFeedback | null): Candidate | null;
  /** True once every knob has been driven to the end of its permitted range. */
  readonly envelopeExhausted: boolean;
  /** Total candidates produced so far. */
  readonly produced: number;
}
