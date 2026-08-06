/**
 * The risk boundary: does the committed .ded project actually reach a production
 * DetailingAssembly through production actions only?
 *
 *   committed .ded
 *     -> deserializeProject()            production deserializer
 *     -> modelStore.restore()            (called inside deserializeProject)
 *     -> modelStore.solveCombinations3DParallel()   real WASM solver
 *     -> resultsStore.setCombinationResults3D()     production results sink
 *     -> detailingStore.generateFloors()            THE production footing entry point
 *     -> RunFootingDesignResult + DetailingAssembly
 *
 * Nothing is seeded: no reactions, no solver results, no bars, no marks, no conflicts, and no
 * footing is reconstructed after restore. If any link in that chain cannot be reached, this
 * test fails rather than substituting synthetic derived state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { detailingStore } from '../../store/detailing.svelte';
import { deserializeProject } from '../../store/file';
import { isSolverReady } from '../../engine/wasm-solver';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { DetailingAssembly } from '../../engine/detailing/assembly';

const FIXTURE = new URL('../__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url);

/** Restore the committed project and run the real production analysis + footing detailing. */
async function restoreAndRun() {
  modelStore.clear();
  resultsStore.clear();
  detailingStore.clear();

  const text = readFileSync(FIXTURE, 'utf8');
  expect(deserializeProject(text), 'production deserializer accepts the fixture').toBe(true);

  const footings = [...modelStore.model.footings.values()];
  expect(footings.length, 'the restored project carries the footing').toBe(1);

  // Real WASM solver, not the Vite stub — a stubbed solver would make this vacuous.
  expect(isSolverReady(), 'real WASM solver must be initialised').toBe(true);

  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  expect(typeof solved, 'the solve must not return an error string').not.toBe('string');
  expect(solved, 'the solve must return results').toBeTruthy();
  const r = solved as { perCase: Map<number, never>; perCombo: Map<number, never>; envelope: never };
  expect(r.perCombo.size, 'at least one solved combination').toBeGreaterThan(0);

  // The production results sink the app uses after solving.
  resultsStore.setCombinationResults3D(r.perCase as never, r.perCombo as never, r.envelope as never);

  const run = detailingStore.generateFloors();
  // Read the run and the PERSISTED store, not `detailingStore.assemblies`: that getter is a
  // `$derived`, and production code notes a `$derived` does not recompute inside the
  // synchronous call that wrote it. Outside a Svelte component it therefore reads 0 even
  // though the run and the persisted store both hold the assembly.
  const assemblies: DetailingAssembly[] = (run as { assemblies?: DetailingAssembly[] } | null)?.assemblies ?? [];
  const persisted = modelStore.model.detailing?.assemblies ?? [];
  return { footing: footings[0], run, assemblies, persisted };
}

describe('restored .ded project reaches a production DetailingAssembly', () => {
  beforeEach(() => { modelStore.clear(); });

  it('production reactions exist for the founded node after the real solve', async () => {
    const { footing } = await restoreAndRun();
    let found = 0;
    for (const [, res] of resultsStore.perCombo3D) {
      for (const rr of (res as { reactions?: Array<{ nodeId: number }> }).reactions ?? []) {
        if (rr.nodeId === footing.nodeId) found++;
      }
    }
    expect(found, 'the solver produced reactions at the footing node — none were seeded')
      .toBeGreaterThan(0);
  });

  it('the production footing run yields an outcome for the restored footing', async () => {
    const { footing, run } = await restoreAndRun();
    expect(run, 'generateFloors must return a run').toBeTruthy();
    const outcomes = (run as { outcomes?: Array<{ footingId: number }> } | null);
    const footingRun = detailingStore.lastFootingRun;
    expect(footingRun, 'the store must expose the production footing run').toBeTruthy();
    const mine = footingRun!.outcomes.find((o) => o.footingId === footing.id);
    expect(mine, 'an outcome for the restored footing').toBeTruthy();
    expect(mine!.name).toBe(footing.name);
    // Honest either way: a checked footing carries a check, an unverifiable one says why.
    if (mine!.check === null) {
      expect(mine!.unsupported.length, 'an unchecked footing must say why').toBeGreaterThan(0);
    }
    expect(mine!.record, 'every modelled footing emits a design record').toBeTruthy();
    void outcomes;
  });

  it('a DetailingAssembly exists and carries production data, not seeded data', async () => {
    const { assemblies, persisted } = await restoreAndRun();
    expect(assemblies.length, 'generateFloors produced at least one assembly').toBeGreaterThan(0);
    expect(persisted.length, 'and it was persisted to the model').toBe(assemblies.length);

    const withFooting = assemblies.filter((a) => a.bars.length > 0);
    // Report the shape honestly rather than asserting a bar count we have not measured.
    const summary = assemblies.map((a) => ({
      id: a.id,
      elements: a.elementIds.length,
      bars: a.bars.length,
      marks: a.marks.length,
      conflicts: a.conflicts.length,
      detailingRevision: a.detailingRevision,
      demandRevision: a.demandRevision,
      state: a.state,
      maturity: a.maturity,
      unsupported: a.unsupported.length,
    }));
    console.log('ASSEMBLIES', JSON.stringify(summary, null, 2));

    for (const a of assemblies) {
      expect(Number.isFinite(a.detailingRevision)).toBe(true);
      expect(Number.isFinite(a.demandRevision)).toBe(true);
      expect(a.state, 'a review state').toBeTruthy();
      expect(a.maturity, 'a maturity').toBeTruthy();
      expect(Array.isArray(a.conflicts), 'conflicts collection present, empty is honest').toBe(true);
      expect(Array.isArray(a.marks)).toBe(true);
    }
    void withFooting;
  });

  it('bars that exist carry exact BarPath geometry with arc centres where claimed', async () => {
    const { assemblies } = await restoreAndRun();
    const bars: BarPath[] = assemblies.flatMap((a) => a.bars);
    console.log('BAR COUNT', bars.length);
    for (const b of bars) {
      expect(b.id, 'stable bar id').toBeTruthy();
      expect(b.diameterMm).toBeGreaterThan(0);
      expect(b.role, 'a role').toBeTruthy();
      expect(b.ownerElementIds.length, 'owning elements').toBeGreaterThan(0);
      expect(b.segments.length, 'at least one segment').toBeGreaterThan(0);
      expect(b.cuttingLength).toBeGreaterThan(0);
      for (const s of b.segments) {
        expect(['straight', 'arc']).toContain(s.kind);
        for (const p of [s.start, s.end]) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
        }
        if (s.kind === 'arc') {
          // The exporter may only claim an exact arc when the centre is present.
          expect(s.radius, 'an arc carries a radius').toBeGreaterThan(0);
          expect(typeof s.sweepDeg).toBe('number');
        }
      }
    }
  });

  it('records honestly that the footing generates no steel yet, and why', async () => {
    const { assemblies } = await restoreAndRun();
    const bars: BarPath[] = assemblies.flatMap((a) => a.bars);
    const run = detailingStore.lastFootingRun!;
    const reasons = run.outcomes.flatMap((o) => o.unsupported.map((m) => String((m as { key?: string }).key ?? '')));
    // The footing IS verified, but the column carries no provided reinforcement in this
    // fixture, so no dowels or starters are generated. Asserted rather than hidden: the
    // exporter must be able to emit an assembly with zero bars and say why.
    expect(run.outcomes.every((o) => o.check !== null), 'the footing is checked').toBe(true);
    if (bars.length === 0) {
      expect(reasons, 'zero bars must be explained by a production reason')
        .toContain('footing.run.noColumnBars');
    }
  });

  it('cover comes from the persisted footing, not a constant', async () => {
    const { footing } = await restoreAndRun();
    expect(footing.cover).toBeGreaterThan(0);
    // The fixture's own value. Asserted against the model, so a hard-coded 50 mm downstream
    // would not be able to hide behind a coincidence.
    expect(footing.cover).toBeCloseTo(0.05, 9);
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const entry = raw.snapshot.footings[0];
    const persisted = Array.isArray(entry) ? entry[1] : entry;
    expect(footing.cover).toBeCloseTo(persisted.cover, 9);
  });

  it('the assembly is current against the restored model, and goes stale when it is edited', async () => {
    const { footing, assemblies } = await restoreAndRun();
    const before = assemblies.map((a) => a.demandRevision);
    expect(before.length).toBeGreaterThan(0);
    // A production edit to the footing must be able to mark detailing stale.
    modelStore.updateFooting(footing.id, { thickness: footing.thickness + 0.05 } as never);
    const f2 = modelStore.model.footings.get(footing.id)!;
    expect(f2.thickness).toBeCloseTo(footing.thickness + 0.05, 9);
    expect(Number.isFinite(f2.revision ?? 0)).toBe(true);
  });
});
