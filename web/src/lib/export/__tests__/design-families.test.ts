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
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { designRunStore } from '../../store/design-run.svelte';
import { verificationStore } from '../../store/verification.svelte';
import { isSolverReady } from '../../engine/wasm-solver';
import {
  DEFAULT_DESIGN_FAMILIES, availableDesignFamilies, initialDesignSelection,
  pruneDesignSelection, DESIGN_FAMILIES, totalsOf,
  type DesignFamily, type DesignRunReport,
} from '../../engine/design/design-families';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

/** Load and solve, ready for a design run. */
async function ready(example: string) {
  modelStore.clear();
  resultsStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();
  verificationStore.clear();
  await modelStore.loadExample(example);
  expect(isSolverReady()).toBe(true);
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  const r = solved as { perCase: Map<number, never>; perCombo: Map<number, never>; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase as never, r.perCombo as never, r.envelope as never);
}

function familyOf(report: DesignRunReport, f: DesignFamily) {
  return report.families.find((x) => x.family === f)!;
}

/** Every family that produced steel in the persisted detailing. */
function familiesWithSteel(): Set<string> {
  const out = new Set<string>();
  for (const a of modelStore.model.detailing?.assemblies ?? []) {
    for (const rec of a.families ?? []) {
      if ((rec.barIds ?? []).length > 0) out.add(rec.family);
    }
  }
  return out;
}

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

// ─── Equivalence and idempotence ─────────────────────────────────

describe('the global command is the individual commands', () => {
  it('reaches the same steel as running each pass by hand', async () => {
    /**
     * The rule that stops two implementations drifting. The global path calls `autoDesign`,
     * `generate` and `generateFloors` — the same functions the individual buttons call — so
     * the two must land on the same families with the same bar counts.
     */
    await ready('pro-edificio-7p');
    designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);
    const viaGlobal = (modelStore.model.detailing?.assemblies ?? [])
      .flatMap((a) => a.bars).length;
    const globalFamilies = [...familiesWithSteel()].sort();

    await ready('pro-edificio-7p');
    designRunStore.designAll();
    detailingStore.generate({ verifierId: 'cirsoc201.provided.v2.2025' });
    detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025', families: ['slab', 'wall'] });
    const viaButtons = (modelStore.model.detailing?.assemblies ?? [])
      .flatMap((a) => a.bars).length;

    expect(globalFamilies).toEqual([...familiesWithSteel()].sort());
    expect(viaGlobal).toBe(viaButtons);
  }, 600_000);

  it('running it twice does not duplicate steel', async () => {
    await ready('pro-edificio-7p');
    designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);
    const first = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.bars);
    designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);
    const second = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.bars);

    expect(second.length).toBe(first.length);
    // Ids are stable, so a repeat cannot append a second copy under new names either.
    expect(second.map((b) => b.id).sort()).toEqual(first.map((b) => b.id).sort());
  }, 600_000);
});

// ─── The report ──────────────────────────────────────────────────

describe('the run reports what happened, family by family', () => {
  it('counts processed, designed, refused and not-modelled members', async () => {
    await ready('pro-edificio-7p');
    const report = designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);

    // 5 of this building's 119 beams are refused by the secondary-axis refusal. It was 117
    // while the fixture's transposed iy/iz went straight to the solver; the canonical-section
    // work that arrived with the merge derives them from geometry instead, which removed the
    // spurious secondary moments. See beam-reinforcement-audit.test.ts for the full account.
    // A refusal is a design outcome either way, and the report must say so rather than
    // presenting a silent zero.
    const beams = familyOf(report, 'beam');
    expect(beams.processed).toBeGreaterThan(100);
    expect(beams.refused, 'refusals are counted, not swallowed').toBe(5);
    expect(beams.designed, 'and the beams that DID design are counted too').toBeGreaterThan(100);
    expect(beams.designed + beams.refused + beams.notModelled).toBe(beams.processed);

    const totals = totalsOf(report);
    expect(totals.processed).toBeGreaterThan(beams.processed);
    expect(totals.refused).toBeGreaterThanOrEqual(beams.refused);
  }, 300_000);

  it('lists the families in selector order, whatever order they ran in', async () => {
    await ready('rc-qa-diagnostic');
    const report = designRunStore.designFamilies(['slab', 'column']);
    expect(report.families.map((f) => f.family)).toEqual([...DESIGN_FAMILIES]);
  }, 300_000);
});
