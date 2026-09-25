/**
 * One command, one selection, and no second implementation.
 *
 * ── The workflow this pins ─────────────────────────────────────────
 *
 * "Diseñar todo" designed beams and columns and stopped. Slabs, walls and foundations came
 * from a second button in a different disclosure, so the button named "all" produced a
 * building with no floors and said nothing about it — the user found out from the 3-D view.
 *
 * What must hold now is that ONE selection drives ONE run, that the run covers exactly the
 * families chosen, and that the global path and the individual buttons cannot diverge because
 * they are the same functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { designRunStore } from '../../store/design-run.svelte';
import { DEFAULT_DESIGN_FAMILIES, availableDesignFamilies, initialDesignSelection, pruneDesignSelection, DESIGN_FAMILIES } from '../../engine/design/design-families';
import { ready, familyOf, familiesWithSteel } from './design-families-fixture';

// ─── The default ─────────────────────────────────────────────────

describe('what the design command covers when nobody has chosen', () => {
  it('is beams and columns, and nothing that needs an input the user has not given', () => {
    /**
     * Narrowed from `['column', 'beam', 'slab', 'wall']`, and the narrowing is the interesting
     * part rather than the list.
     *
     * The wide default existed to close a real defect: "Design all" designed beams and columns
     * only, slabs came from a second command in another disclosure, and the button named "all"
     * produced a building with no floors without saying so.
     *
     * That defect only stays closed under one condition, which is the same one the footing box
     * already relied on: the scope has to be VISIBLE before the command runs. An unticked family
     * on screen is a choice; an unticked family nobody can see is the old defect with a smaller
     * default. `availableDesignFamilies` and the scope read-out beside the command are what pay
     * for this line.
     */
    expect([...DEFAULT_DESIGN_FAMILIES].sort()).toEqual(['beam', 'column']);
    /*
     * Footings stay out for a reason that is not about defaults at all: they need a ground
     * profile with an allowable bearing pressure, and without one the run records that it could
     * not verify them — a failure the user did not ask for and cannot fix from that screen.
     */
    expect(DEFAULT_DESIGN_FAMILIES).not.toContain('footing');
    // Every family is still OFFERED, so "not designed" is visible rather than absent.
    for (const f of ['slab', 'wall', 'footing']) expect(DESIGN_FAMILIES).toContain(f);
  });
});

describe('a family the model does not have is not offered', () => {
  it('offers only what the model contains', () => {
    expect(availableDesignFamilies({ beam: 4, column: 6 })).toEqual(['column', 'beam']);
    expect(availableDesignFamilies({ beam: 4, column: 6, slab: 2 }))
      .toEqual(['column', 'beam', 'slab']);
  });

  /*
   * Absent, not disabled. A checkbox for something the building does not contain is a question
   * with one answer, and the panel has to keep "this model has no walls" distinguishable from
   * "the walls have not been designed" — a control that could only say the second blurs it.
   */
  it('drops a family whose count is zero as firmly as one that is missing', () => {
    expect(availableDesignFamilies({ beam: 1, wall: 0 })).toEqual(['beam']);
    expect(availableDesignFamilies({})).toEqual([]);
  });

  it('lists them in selector order whatever order they were counted in', () => {
    expect(availableDesignFamilies({ footing: 1, beam: 1, column: 1 }))
      .toEqual(['column', 'beam', 'footing']);
  });

  it('the initial selection is the default intersected with what exists', () => {
    expect(initialDesignSelection({ beam: 2, column: 2, slab: 9 })).toEqual(['column', 'beam']);
    // A frame with no columns must not open with a column ticked.
    expect(initialDesignSelection({ beam: 2 })).toEqual(['beam']);
    expect(initialDesignSelection({})).toEqual([]);
  });

  /*
   * The model can change under a selection made earlier. A family the user ticked and then
   * emptied has to drop out, or the command reports a scope covering something not there.
   */
  it('prunes a selection when the model loses a family', () => {
    expect(pruneDesignSelection(['column', 'beam', 'slab'], { column: 1, beam: 1 }))
      .toEqual(['column', 'beam']);
    expect(pruneDesignSelection(['slab'], { beam: 1 })).toEqual([]);
  });
});

// ─── Scope ───────────────────────────────────────────────────────

describe('the run covers exactly the families chosen', () => {
  beforeEach(async () => { await ready('pro-edificio-7p'); }, 300_000);

  it('columns and beams only: no slab or wall steel is produced', () => {
    const report = designRunStore.designFamilies(['column', 'beam']);
    expect(familyOf(report, 'column').state).toBe('designed');
    expect(familyOf(report, 'beam').state).toBe('designed');
    expect(familyOf(report, 'slab').state).toBe('skipped');
    expect(familyOf(report, 'wall').state).toBe('skipped');
    expect(familyOf(report, 'footing').state).toBe('skipped');
    expect(familiesWithSteel().has('slab')).toBe(false);
  }, 300_000);

  it('columns only: beams are skipped and get no reinforcement from this run', () => {
    const report = designRunStore.designFamilies(['column']);
    expect(familyOf(report, 'beam').state).toBe('skipped');
    expect(familyOf(report, 'column').processed).toBeGreaterThan(50);
    // The split reads `elementType` from the member context — the same authority the search
    // reads — so "columns only" cannot quietly design a beam.
    expect(familyOf(report, 'column').designed).toBeGreaterThan(0);
  }, 300_000);

  it('the frame plus floors produces slab and wall steel', () => {
    const report = designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);
    expect(familyOf(report, 'slab').state).toBe('designed');
    expect(familyOf(report, 'wall').state).toBe('designed');
    expect(familyOf(report, 'slab').designed).toBeGreaterThan(0);
    const steel = familiesWithSteel();
    expect(steel.has('slab')).toBe(true);
    expect(steel.has('wall')).toBe(true);
  }, 300_000);

  it('slabs only: walls are filtered out through the engine’s own classifier', () => {
    const report = designRunStore.designFamilies(['slab']);
    expect(familyOf(report, 'slab').state).toBe('designed');
    expect(familyOf(report, 'wall').state).toBe('skipped');
    expect(familiesWithSteel().has('wall')).toBe(false);
  }, 300_000);

  it('a family the model does not contain reports noElements, not failure', () => {
    // This building has no footings. "You did not ask for them" and "there are none" are
    // different facts, and telling a user to tick a box that would change nothing is the
    // failure this distinction prevents.
    const report = designRunStore.designFamilies(['column', 'footing']);
    expect(familyOf(report, 'footing').state).toBe('noElements');
    expect(report.ok).toBe(true);
  }, 300_000);
});

