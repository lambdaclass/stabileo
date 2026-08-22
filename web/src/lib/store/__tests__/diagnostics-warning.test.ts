/**
 * When the model-diagnostics warning is allowed to speak, and what hiding it may never do.
 *
 * ── The defect these pin ───────────────────────────────────────────
 *
 * PRO opened with a yellow "⚠ 3" over the right panel before the user had touched anything,
 * because `checkModel` reports `MODEL_FEW_NODES`, `MODEL_NO_ELEMENTS` and `MODEL_NO_SUPPORTS`
 * for an empty model and the chip rendered on `count > 0`. An empty workspace is not a defect.
 *
 * The last test in this file is the one that matters most: a dismissal is allowed to quieten a
 * notification and is never allowed to change what the design does. `checkModel` is the
 * authority the commands consult, and it does not know this module exists.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { diagnosticsWarning } from '../diagnostics-warning.svelte';
import { checkModel } from '../../engine/model-diagnostics';

/** A model that exists and is still missing something the analysis needs. */
function twoNodesNoSupports() {
  modelStore.clear();
  modelStore.addNode(0, 0, 0);
  modelStore.addNode(4, 0, 0);
}

function readModelErrors() {
  return checkModel({
    nodes: modelStore.nodes,
    elements: modelStore.elements,
    materials: modelStore.materials,
    sections: modelStore.sections,
    supports: modelStore.supports,
    loads: modelStore.loads as never,
    loadCases: modelStore.model.loadCases,
    plates: modelStore.model.plates,
    quads: modelStore.model.quads,
    connectors: modelStore.model.connectors,
    constraints: modelStore.model.constraints,
  }).filter((d) => d.severity === 'error');
}

describe('the diagnostics warning', () => {
  beforeEach(() => {
    modelStore.clear();
    diagnosticsWarning.resetForTests();
  });

  it('says nothing in a PRO that has just been opened', () => {
    // The whole bug report, in one assertion. `checkModel` is shouting; the chip is not.
    expect(readModelErrors().length, 'checkModel does report errors for an empty model')
      .toBeGreaterThan(0);
    expect(diagnosticsWarning.visible).toBe(false);
    expect(diagnosticsWarning.kind).toBe('empty');
  });

  it('stays silent on an empty model even after the user presses something', () => {
    // "No model yet" is not a fault to fix, and pressing Calculate on nothing must not be
    // answered with a warning about the nothing. The solve gate says so in its own words.
    diagnosticsWarning.arm();
    expect(diagnosticsWarning.visible).toBe(false);
    expect(diagnosticsWarning.kind).toBe('empty');
  });

  it('speaks once a model exists, because a model does not appear by itself', () => {
    // Loading, restoring or drawing are all covered by this, without instrumenting any of them.
    twoNodesNoSupports();
    expect(diagnosticsWarning.armed).toBe(true);
    expect(diagnosticsWarning.visible).toBe(true);
    expect(diagnosticsWarning.count).toBe(readModelErrors().length);
  });

  it('separates a model that is missing inputs from one that is faulty', () => {
    twoNodesNoSupports();
    // No elements and no supports yet: incomplete, not broken.
    expect(diagnosticsWarning.kind).toBe('incomplete');
  });

  it('hides for the diagnostics the user dismissed', () => {
    twoNodesNoSupports();
    expect(diagnosticsWarning.visible).toBe(true);
    diagnosticsWarning.dismiss();
    expect(diagnosticsWarning.visible).toBe(false);
    expect(diagnosticsWarning.dismissed).toBe(true);
  });

  it('comes back when the diagnostics change', () => {
    twoNodesNoSupports();
    const before = diagnosticsWarning.signature;
    diagnosticsWarning.dismiss();
    expect(diagnosticsWarning.visible).toBe(false);

    // A new node changes nothing about which codes are raised…
    modelStore.addNode(8, 0, 0);
    expect(diagnosticsWarning.signature, 'the signature is codes and counts, not element ids')
      .toBe(before);
    expect(diagnosticsWarning.visible, 'so the dismissal still holds').toBe(false);

    // …but giving the model a support removes one, and a different set of facts gets to
    // interrupt again. This is the part a plain boolean "hidden" flag would get wrong.
    modelStore.addSupport(1, 'fixed');
    expect(diagnosticsWarning.signature).not.toBe(before);
    expect(diagnosticsWarning.visible).toBe(true);
  });

  it('can be un-hidden — the control in Diagnostics is a toggle, not a one-way door', () => {
    twoNodesNoSupports();
    diagnosticsWarning.dismiss();
    expect(diagnosticsWarning.visible).toBe(false);
    diagnosticsWarning.restore();
    expect(diagnosticsWarning.visible).toBe(true);
  });

  it('following the chip to Diagnostics does not count as dismissing it', () => {
    twoNodesNoSupports();
    diagnosticsWarning.markSeen();
    // They went to look. The chip is still true, so it is still there when they come back.
    expect(diagnosticsWarning.visible).toBe(true);
    expect(diagnosticsWarning.dismissed).toBe(false);
  });

  it('NEVER changes what the design is allowed to do', () => {
    /**
     * The one invariant that would be dangerous to get wrong. `dismiss()` may quieten a
     * notification; it may not make a blocked model look designable. The commands and the
     * pre-solve gate read `checkModel` directly — this module is consulted by the chip and by
     * nothing else — so the count they see is unchanged by anything the user hides.
     */
    twoNodesNoSupports();
    const errorsBefore = readModelErrors().length;
    expect(errorsBefore).toBeGreaterThan(0);

    diagnosticsWarning.dismiss();

    expect(readModelErrors().length, 'the authority is untouched').toBe(errorsBefore);
    expect(diagnosticsWarning.count, 'and the store still reports the true count').toBe(errorsBefore);
    expect(diagnosticsWarning.errors.length).toBe(errorsBefore);
    // Only the one predicate the chip reads has changed.
    expect(diagnosticsWarning.visible).toBe(false);
  });
});
