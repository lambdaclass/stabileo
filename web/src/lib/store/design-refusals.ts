/**
 * The design's refusals, kept with the project.
 *
 * A verified member comes back after a reopen from its saved bars: the verification runs again on
 * them. A refused member has no bars, and its outcome (SECTION_INADEQUATE with its proof,
 * SEARCH_EXHAUSTED with what was tried, UNSUPPORTED) was session state: after saving and reopening
 * a project the memoria lost its refusal row and showed the member with its deflection row only,
 * «satisfies» in the summary, the workbook and the IFC.
 *
 * So the refusals are stored on the model, in the detailing store (which every snapshot carries:
 * a `.ded`, an autosave, an undo), with the design fingerprint of the model they were reached on,
 * and read back only while the model is still that one (`design-fingerprint.ts`), like the floor
 * rows (`floor-readings.ts`).
 */
import type { DesignOutcomeKind, MemberDesignOutcome } from '../engine/design/outcome';
import { emptyDetailingStore } from '../engine/detailing/assembly';
import { modelStore } from './model.svelte';
import { designFingerprint } from './design-fingerprint';

const KEPT: ReadonlySet<DesignOutcomeKind> = new Set(['SECTION_INADEQUATE', 'SEARCH_EXHAUSTED', 'UNSUPPORTED']);

/** A refusal the project keeps: the design ran on the member and this was its answer. */
export const isKeptRefusal = (o: MemberDesignOutcome | undefined): boolean => !!o && KEPT.has(o.outcome);

/** JSON that keeps ∞ and NaN (a refused candidate's ratios are often infinite). */
export function encodeOutcomes(outcomes: readonly MemberDesignOutcome[]): string {
  return JSON.stringify(outcomes, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? { $num: String(v) } : v));
}

export function decodeOutcomes(text: string): MemberDesignOutcome[] {
  try {
    const out = JSON.parse(text, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.$num === 'string' ? Number(v.$num) : v));
    return Array.isArray(out) ? out as MemberDesignOutcome[] : [];
  } catch {
    return [];
  }
}

/** Store the refusals of a set of outcomes (the run's, merged with the earlier ones). */
export function recordRefusals(outcomes: Iterable<MemberDesignOutcome>): void {
  const refused = [...outcomes].filter((o) => KEPT.has(o.outcome));
  const current = modelStore.model.detailing ?? emptyDetailingStore();
  modelStore.model.detailing = { ...current, designRefusals: { fingerprint: designFingerprint(), outcomes: encodeOutcomes(refused) } };
  cache = null;
}

let cache: { text: string; fingerprint: string; byId: Map<number, MemberDesignOutcome> } | null = null;

/** A stored refusal, when the model is still the one it was reached on. */
export function storedRefusal(elementId: number): MemberDesignOutcome | undefined {
  const r = modelStore.model.detailing?.designRefusals;
  if (!r || r.fingerprint !== designFingerprint()) return undefined;
  if (!cache || cache.text !== r.outcomes || cache.fingerprint !== r.fingerprint) {
    cache = { text: r.outcomes, fingerprint: r.fingerprint, byId: new Map(decodeOutcomes(r.outcomes).map((o) => [o.elementId, o])) };
  }
  return cache.byId.get(elementId);
}
