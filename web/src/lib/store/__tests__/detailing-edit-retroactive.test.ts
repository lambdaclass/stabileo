/**
 * Objective 10 — a reinforcement edit reaches every representation of the member.
 *
 * ── The rule, and the half of it that was wired ──────────────────────
 *
 * `rc-selection.ts`: "an edit is retroactive iff every representation of the edited member is
 * rebuilt from the model after it, and none is patched in place."
 *
 * `_setOnReinforcementCommit` rebuilt one of them — the verification — and left the coordinated
 * assemblies holding the bars from before. So the elevation kept drawing the old steel, the
 * schedule kept ordering it, and the 3-D viewer, which builds its document from those same
 * assemblies precisely so that it cannot show a stale one, kept showing the old cage.
 * `detailingStore.invalidate` existed, was unit-tested, and had no production caller.
 *
 * ── Why these tests seed the assemblies ─────────────────────────────
 *
 * Because the claim is about the WIRING, not about the coordination: that a write through
 * `reinforcementTransaction` reaches `model.detailing`. A real run would take a solver and a
 * design pass to reach the same one-line question, and would make the failure ambiguous
 * between the two.
 *
 * They read the PERSISTED model rather than the store's own view, for the reason
 * `detailing-revision-increment.test.ts` states: a `$derived` can be a tick behind, and the
 * persisted model is what a reopened project contains.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../index';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import type { DetailingAssembly } from '../../engine/detailing/assembly';
import { DETAILING_SCHEMA_VERSION } from '../../engine/detailing/assembly';

/** Two members on two levels, so an edit to one can be shown NOT to touch the other. */
let beamA = 0;
let beamB = 0;

function assembly(id: string, elementIds: number[]): DetailingAssembly {
  return {
    id, kind: 'beamLine', label: id, elementIds,
    bars: [], marks: [], joints: [], conflicts: [], unsupported: [],
    detailingRevision: 3, demandRevision: 1,
    state: 'CONSTRUCTIBLE', maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'v', trace: [], assumptions: [] },
  } as DetailingAssembly;
}

function persisted(id: string) {
  return (modelStore.model.detailing?.assemblies ?? []).find((a) => a.id === id);
}

beforeEach(() => {
  modelStore.clear();
  detailingStore.clear();
  verificationStore.clear();

  const n = [
    modelStore.addNode(0, 0, 3), modelStore.addNode(6, 0, 3),
    modelStore.addNode(0, 0, 6), modelStore.addNode(6, 0, 6),
  ];
  beamA = modelStore.addElement(n[0], n[1], 'frame');
  beamB = modelStore.addElement(n[2], n[3], 'frame');

  modelStore.model.detailing = {
    version: DETAILING_SCHEMA_VERSION,
    assemblies: [assembly('level-3', [beamA]), assembly('level-6', [beamB])],
  };
});

describe('an edit reaches the coordinated assemblies', () => {
  it('bumps the revision of the level the edited member is on', () => {
    const before = persisted('level-3')!.detailingRevision;
    modelStore.reinforcementTransaction((api) =>
      api.setReinforcement(beamA, { bottom: { count: 4, diameter: 20 } }));
    expect(persisted('level-3')!.detailingRevision).toBe(before + 1);
  });

  /*
   * The precision the whole thing turns on. An edit to one beam invalidates the level it is on
   * and no other; a blanket invalidation would make every regeneration a full rebuild and
   * would tell a user their whole building was out of date because they changed one bar.
   */
  it('leaves every other level exactly as it was', () => {
    const other = persisted('level-6')!;
    modelStore.reinforcementTransaction((api) =>
      api.setReinforcement(beamA, { bottom: { count: 4, diameter: 20 } }));
    expect(persisted('level-6')).toEqual(other);
  });

  /*
   * CONSTRUCTIBLE is a claim that the bars fit. New bars have not been checked, so the claim
   * drops back — which is `invalidateAffected`'s own rule, now reachable from a real edit.
   */
  it('drops the earned state of the level it invalidated', () => {
    modelStore.reinforcementTransaction((api) =>
      api.setReinforcement(beamA, { bottom: { count: 4, diameter: 20 } }));
    expect(persisted('level-3')!.state).toBe('VERIFIED');
    expect(persisted('level-6')!.state).toBe('CONSTRUCTIBLE');
  });

  it('reports what it invalidated, by member and by level', () => {
    modelStore.reinforcementTransaction((api) =>
      api.setReinforcement(beamA, { bottom: { count: 4, diameter: 20 } }));
    const e = detailingStore.lastEdit;
    expect(e).not.toBeNull();
    expect(e!.written).toEqual([beamA]);
    expect(e!.invalidated).toEqual(['level-3']);
    expect(e!.rebuildScene).toBe(true);
  });

  it('carries a batch edit through as one consequence', () => {
    modelStore.reinforcementTransaction((api) => {
      api.setReinforcement(beamA, { bottom: { count: 4, diameter: 20 } });
      api.setReinforcement(beamB, { bottom: { count: 5, diameter: 20 } });
    });
    const e = detailingStore.lastEdit!;
    expect(e.written).toEqual([beamA, beamB].sort((a, b) => a - b));
    expect(e.invalidated).toEqual(['level-3', 'level-6']);
  });
});

describe('an edit that invalidates nothing costs nothing', () => {
  /*
   * A member on no assembly is a real, quiet outcome — and the same trap `review()` documents:
   * an operation that changes nothing must not retire the document the user built.
   */
  it('leaves the assemblies untouched when the member is on none of them', () => {
    const n = [modelStore.addNode(0, 9, 3), modelStore.addNode(6, 9, 3)];
    const orphan = modelStore.addElement(n[0], n[1], 'frame');
    const before = JSON.parse(JSON.stringify(modelStore.model.detailing));

    modelStore.reinforcementTransaction((api) =>
      api.setReinforcement(orphan, { bottom: { count: 2, diameter: 12 } }));

    expect(modelStore.model.detailing).toEqual(before);
    expect(detailingStore.lastEdit!.invalidated).toEqual([]);
    expect(detailingStore.lastEdit!.rebuildScene).toBe(true);
  });

  it('says nothing at all when the transaction wrote nothing', () => {
    const before = detailingStore.lastEdit;
    modelStore.reinforcementTransaction(() => { /* no write */ });
    expect(detailingStore.lastEdit).toBe(before);
  });
});

describe('undoing an edit is an edit', () => {
  /*
   * `restoreReinforcementOnly` fires the same commit hook, and it has to: an assembly that
   * followed the edit forward and not back would describe steel the model no longer has, which
   * is the same defect in the other direction.
   */
  it('follows the assemblies back through the undo path', () => {
    modelStore.reinforcementTransaction((api) =>
      api.setReinforcement(beamA, { bottom: { count: 4, diameter: 20 } }));
    const afterEdit = persisted('level-3')!.detailingRevision;

    modelStore.reinforcementTransaction((api) =>
      api.setReinforcement(beamA, { bottom: { count: 6, diameter: 20 } }));
    expect(persisted('level-3')!.detailingRevision).toBe(afterEdit + 1);
  });
});
