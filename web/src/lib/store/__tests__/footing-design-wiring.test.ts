/**
 * Regression pin: `checkFooting` must be reachable through the STORE.
 *
 * `foundation-check.ts` was complete and unit-tested from the day PR18 opened, and its only
 * caller in the whole repository was dead code in a component that never mounts. The
 * blocker was data: the model carried no footing and no soil, so there was nothing to
 * check.
 *
 * This file drives the production command — `detailingStore.generateFloors()` — over a
 * model built entirely through `modelStore`'s own API, and asserts that a real footing
 * check with real dowels comes out. Nothing is seeded and no store is injected.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { resultsStore } from '../results.svelte';
import { verificationStore } from '../verification.svelte';
import type { MemberDesignOutcome } from '../../engine/design/outcome';

/**
 * A single column on a footing, solved.
 *
 * Reactions are published through the same setters the solve path uses. `perCase3D` carries
 * the D and L cases the service bearing sum needs; `perCombo3D` carries the strength
 * combination the strength checks need.
 */
function buildFootingModel(opts: { withCases?: boolean; withColumnBars?: boolean } = {}) {
  modelStore.clear();
  detailingStore.clear();
  const base = modelStore.addNode(0, 0, 0);
  const top = modelStore.addNode(0, 0, 3);
  modelStore.addSupport(base, 'fixed3d');
  const column = modelStore.addElement(base, top, 'frame');

  // A 400 × 400 column section, so the punching perimeter has real dimensions.
  const sectionId = modelStore.addSection({ name: '40×40', a: 0.16, iz: 0.00213, b: 0.4, h: 0.4 });
  modelStore.updateElementSection(column, sectionId);

  const profileId = modelStore.addSoilProfile('Arena densa');
  modelStore.updateSoilProfile(profileId, {
    bearing: { kind: 'allowablePressure', allowableBearingKPa: 250 },
    provenance: { source: 'report', reference: 'EG-2026-14' },
  });

  const footingId = modelStore.addFooting(base, 'Z1');
  modelStore.updateFooting(footingId, {
    B: 2.0, L: 2.0, thickness: 0.5, columnElementId: column, foundingElevation: -1.2,
  });

  if (opts.withColumnBars !== false) {
    // The starters must lap with the bars the verifier ACCEPTED, so a VERIFIED outcome is
    // published the way the design run publishes one.
    verificationStore.setDesignOutcomes({
      outcomes: new Map<number, MemberDesignOutcome>([[column, {
        elementId: column, elementType: 'column', codeId: 'cirsoc', codeVersion: '2025',
        outcome: 'VERIFIED',
        accepted: {
          column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
          stirrups: { diameter: 8, legs: 4, spacing: 0.15 },
        },
      } as MemberDesignOutcome]]),
    } as never);
  }

  const res = (fz: number) => ({
    displacements: [], elementForces: [], quadStresses: [],
    reactions: [{ nodeId: base, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0 }],
  }) as never;
  // The same setter the combination solve path uses — per-case AND per-combination in one
  // call, which is exactly how the real solve publishes them.
  resultsStore.setCombinationResults3D(
    opts.withCases === false ? new Map() : new Map([[1, res(-400)], [2, res(-200)]]),
    new Map([[1, res(-900)]]),
    {} as never,
  );
  return { base, column, footingId, profileId };
}

const keysOf = (msgs: { key: string }[]) => msgs.map((m) => m.key);

describe('detailingStore.generateFloors — footings reach the engine', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    // Design outcomes live in their own store and are not reset by `modelStore.clear()`.
    // Element ids restart at 1 for each model built here, so without this an earlier test's
    // accepted column reinforcement would be found for a later test's element 1.
    verificationStore.clear();
  });

  it('checks a real footing from real model data, seeding nothing', () => {
    buildFootingModel();
    detailingStore.generateFloors();

    const run = detailingStore.lastFootingRun;
    expect(run).not.toBeNull();
    expect(run!.outcomes).toHaveLength(1);
    const o = run!.outcomes[0];
    expect(o.check, 'the footing must actually be checked').not.toBeNull();
    expect(o.check!.bearing.qMax).toBeGreaterThan(0);
    expect(o.governingCombination).toBeTruthy();
  });

  it('puts the footing bars into an assembly, so they can be coordinated', () => {
    const { footingId } = buildFootingModel();
    const result = detailingStore.generateFloors();

    expect(result).not.toBeNull();
    const bars = result!.assemblies.flatMap((a) => a.bars);
    // Dowels and starter ties are real physical pieces owned by the footing connection.
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.some((b) => b.id.includes(`F${footingId}`))).toBe(true);
  });

  it('persists the footing assembly onto the model', () => {
    buildFootingModel();
    detailingStore.generateFloors();
    const ids = (modelStore.model.detailing?.assemblies ?? []).map((a) => a.id);
    expect(ids.some((id) => id.startsWith('FLOOR-'))).toBe(true);
  });

  it('reports the footing as NOT verified when its stratum states no pressure', () => {
    const { profileId } = buildFootingModel();
    modelStore.updateSoilProfile(profileId, { bearing: { kind: 'unstated' } });

    detailingStore.generateFloors();

    const notVerified = detailingStore.footingsNotVerified;
    expect(notVerified).toHaveLength(1);
    expect(keysOf(notVerified[0].reasons)).toContain('footing.run.bearingUnstated');
  });

  it('reports the footing as NOT verified when the model was solved without per-case results', () => {
    // Bearing is a service check. Dividing the factored reaction by an assumed 1,4 would
    // invent the load factor the project states elsewhere, so the footing is not verified.
    buildFootingModel({ withCases: false });
    detailingStore.generateFloors();

    const notVerified = detailingStore.footingsNotVerified;
    expect(notVerified).toHaveLength(1);
    expect(keysOf(notVerified[0].reasons)).toContain('footing.run.noServiceCases');
  });

  it('reports the footing as NOT verified when its node has no reaction', () => {
    buildFootingModel();
    resultsStore.setCombinationResults3D(new Map(), new Map(), {} as never);
    resultsStore.setResults3D({
      displacements: [], reactions: [], elementForces: [], quadStresses: [],
    });

    detailingStore.generateFloors();

    expect(keysOf(detailingStore.footingsNotVerified[0].reasons))
      .toContain('footing.run.noReaction');
  });

  it('generates no dowels when the column has no accepted reinforcement', () => {
    // Starters lapping into steel that was never accepted would be detailing a column that
    // does not exist yet.
    buildFootingModel({ withColumnBars: false });
    detailingStore.generateFloors();

    const o = detailingStore.lastFootingRun!.outcomes[0];
    expect(o.entry?.dowels).toBeUndefined();
    expect(keysOf(o.unsupported)).toContain('footing.run.noColumnBars');
  });

  it('carries the geotechnical provenance through to the run', () => {
    const { profileId } = buildFootingModel();
    modelStore.updateSoilProfile(profileId, {
      provenance: { source: 'assumed', reference: 'comparable site, pending study' },
    });
    detailingStore.generateFloors();

    expect(keysOf(detailingStore.lastFootingRun!.outcomes[0].assumptions))
      .toContain('geotechnical.assumption.assumed');
  });

  it('a footing with no shells still gets its own level assembly', () => {
    // Otherwise its bars would be checked, marked and then dropped before coordination.
    buildFootingModel();
    const result = detailingStore.generateFloors();
    expect(result!.slabs).toHaveLength(0);
    expect(result!.assemblies.length).toBeGreaterThan(0);
  });
});
