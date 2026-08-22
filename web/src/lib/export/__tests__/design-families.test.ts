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
  DEFAULT_DESIGN_FAMILIES, DESIGN_FAMILIES, totalsOf,
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

describe('what "design all" means when nobody has chosen', () => {
  it('covers the frame and the floors, and leaves foundations out', () => {
    /**
     * Documented rather than assumed. Everything in the default is decided by the analysis
     * the user has already run; a footing additionally needs a ground profile with an
     * allowable bearing pressure, and including it by default would make the default action
     * report a failure the user did not ask for and cannot fix from that screen.
     */
    expect([...DEFAULT_DESIGN_FAMILIES].sort())
      .toEqual(['beam', 'column', 'slab', 'wall']);
    expect(DEFAULT_DESIGN_FAMILIES).not.toContain('footing');
    // But the family exists and is offered, so "not designed" is visible rather than absent.
    expect(DESIGN_FAMILIES).toContain('footing');
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
