/**
 * Canonical section state management for the model store.
 *
 * Extracted from model.svelte.ts to keep the store focused on model data.
 * This module owns the lifecycle of the `canonical` cache on Section:
 * creation, update, migration, and the async refresh that runs once the WASM
 * engine is ready.
 */

import type { Section } from './model.svelte';
import { resolveSectionState } from '../section/state';
import { restoreSections } from '../section/migration';

/** Resolve canonical state for a section being created. */
export function resolveOnCreate(sec: Section): Section {
  return { ...sec, canonical: resolveSectionState(sec, { torsion: true }) };
}

/** Resolve canonical state for a section being updated. */
export function resolveOnUpdate(sec: Section): Section {
  return { ...sec, canonical: resolveSectionState(sec, { torsion: true }) };
}

/**
 * Re-resolve a section and mirror the resolved values back into its declared scalars.
 *
 * Declared values are the designed fallback — engine down, feature-flag rollback, readers that
 * cannot see canonical state — and on a geometry-backed section nothing else keeps them current.
 * `j` is mirrored even when the resolution found none: the previous constant describes another
 * section, and keeping it would hand it back, as that section's own, to the next resolve.
 */
export function resolveAndMirror(sec: Section): Section {
  const next = resolveOnUpdate(sec);
  const st = next.canonical;
  if (st?.kind === 'geometry-backed') {
    next.a = st.a;
    next.iy = st.iy;
    next.iz = st.iz;
    next.j = st.j ?? undefined;
  }
  return next;
}

/**
 * Re-resolve canonical state for every section in the map.
 *
 * The engine initialises asynchronously, so at app start — and for a model
 * loaded before the WASM module is ready — `resolveSectionState` can only
 * report properties-only. Nothing would ever revisit that decision, leaving
 * otherwise fine catalogue profiles permanently without geometry.
 *
 * This runs once the engine is ready, and is a no-op for sections whose
 * resolved digest matches the stored one. It never invalidates results:
 * refreshing geometry is not a model edit.
 *
 * A section already geometry-backed WITH a torsion answer is skipped without
 * recomputing: within a session the engine build cannot change, so a fully
 * resolved state cannot go stale, and re-resolving it would pay a WASM
 * geometry build (and possibly a Saint-Venant solve) per section per load
 * just to learn nothing changed. `jProvenance === 'unavailable'` is the
 * marker of "restored before the torsion pass ran" — those are retried, as
 * are genuine torsion failures, which is bounded and correct.
 *
 * Returns the updated map, or null if nothing changed.
 */
export function refreshCanonicalSections(
  sections: Map<number, Section>,
): Map<number, Section> | null {
  let changed = false;
  const m = new Map(sections);
  for (const [id, sec] of m) {
    const before = sec.canonical;
    if (before?.kind === 'geometry-backed' && before.jProvenance !== 'unavailable') continue;
    const next = resolveSectionState(sec, { torsion: true });
    const sameKind = before?.kind === next.kind;
    const sameDigest =
      before?.kind === 'geometry-backed' && next.kind === 'geometry-backed'
        ? before.digest === next.digest
        : sameKind;
    // The digest does not cover torsion: a retry that succeeds with unchanged
    // geometry must still be published, or the section would stay
    // `unavailable` and every future refresh would re-solve and re-discard.
    const sameTorsion =
      before?.kind === 'geometry-backed' && next.kind === 'geometry-backed'
        ? before.j === next.j && before.jProvenance === next.jProvenance
        : true;
    if (!sameDigest || !sameTorsion) {
      m.set(id, { ...sec, canonical: next });
      changed = true;
    }
  }
  return changed ? m : null;
}

/** Restore sections from a snapshot, re-deriving canonical state. */
export function restoreCanonicalSections(
  sections: Map<number, Section>,
): Map<number, Section> {
  // Torsion included: restoring is the one moment every section is resolved
  // anyway, and doing it here means the post-load refresh finds nothing to
  // repair instead of re-resolving every section a second time.
  return restoreSections(sections, { torsion: true }).sections;
}

/** Resolve the default section's canonical state for a fresh model. */
export function resolveDefaultSection(defaultSection: Section): Section {
  return {
    ...defaultSection,
    canonical: resolveSectionState({ ...defaultSection }, { torsion: true }),
  };
}
