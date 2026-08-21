/**
 * Put a generated model into the app, with its assumptions attached.
 *
 * ── One undo step, one provenance record ───────────────────────────
 *
 * Generating replaces the model. That is a big, deliberate action and it has to be a single
 * undoable one — a user who presses Generate on the wrong parameters must get back exactly
 * what they had, not a half-cleared model.
 *
 * ── The assumptions are the point ──────────────────────────────────
 *
 * A generated shed is 600 members nobody drew, sized by profiles nobody checked, resting on
 * decisions the generator made: chords continuous, web pinned, purlins rolled to the pitch,
 * the torsional constant of a box section not computed. Every one of those is defensible
 * and none of them is obvious from looking at the result.
 *
 * `ModelProvenance` already travels inside `ModelSnapshot`, so it survives save, reload,
 * undo and tab switches. Writing the assumptions there rather than into a toast is the
 * difference between a disclosure and a notification.
 *
 * The clock is a parameter. This module never reads it, so a test gets a deterministic
 * record and the caller owns the timestamp — the same rule the detailing modules follow.
 */

import { modelStore } from './model.svelte';
import { loadFixture } from '../templates/load-fixture';
import type { GeneratedModel } from '../engine/generators/emit';
import type { ModelProvenance, ProvenanceSource } from '../model/provenance';

export interface ApplyOptions {
  source: ProvenanceSource;
  /** ISO timestamp. Supplied by the caller; this module does not read the clock. */
  atIso: string;
  /** The parameters the generator ran with, for regeneration and for argument. */
  params: Record<string, unknown>;
  /** Display name for the model. Defaults to whatever the generator named it. */
  name?: string;
}

export interface ApplyResult {
  nodes: number;
  elements: number;
  sections: number;
  provenance: ModelProvenance;
}

/**
 * Replace the current model with a generated one.
 *
 * Returns what landed, counted from the store rather than from the generator's own report —
 * so a mismatch between what the preview promised and what the model holds shows up here
 * instead of going unnoticed.
 */
export function applyGeneratedModel(g: GeneratedModel, opts: ApplyOptions): ApplyResult {
  const provenance: ModelProvenance = {
    source: opts.source,
    fileName: opts.name ?? g.json.name,
    importedAtIso: opts.atIso,
    status: 'generated-unreviewed',
    // i18n KEYS, not prose — see `ModelProvenance.assumptions`.
    assumptions: [...g.assumptions],
    assumptionsAreKeys: true,
    layerMappings: [],
    generatorParams: { ...opts.params },
  };

  // The same path `loadExample` takes: one undo step, one bulk mutation, and the canonical
  // section state settled once at the end rather than per section as they arrive. The batch
  // wrapper is what makes it ONE undo step — without it `clear()` pushes a snapshot and
  // `bulkMutate()` pushes a second one (of the now-empty model), so the first Ctrl+Z would
  // restore nothing and the promise in `generator.ui.replacesModel` would be a lie.
  const api = modelStore.fixtureApi();
  modelStore.batch(() => {
    modelStore.clear();
    modelStore.bulkMutate(() => {
      loadFixture({ ...g.json, name: opts.name ?? g.json.name }, api as never);
    });
  });
  modelStore.refreshCanonicalSections();
  modelStore.model.provenance = provenance;
  modelStore.bumpModelVersion();

  return {
    nodes: modelStore.nodes.size,
    elements: modelStore.elements.size,
    sections: modelStore.sections.size,
    provenance,
  };
}

/**
 * Whether what landed matches what the preview said.
 *
 * Not a formality: the preview's counts come from the topology and the model's come from the
 * store after a fixture load that remaps every id. If those two ever diverge, the number
 * beside the Generate button is a lie, and this is the assertion that catches it.
 */
export function matchesPreview(g: GeneratedModel, r: ApplyResult): boolean {
  const expected = Object.values(g.counts).reduce((s, n) => s + n, 0);
  return r.elements === expected && r.nodes === g.json.nodes.length;
}
