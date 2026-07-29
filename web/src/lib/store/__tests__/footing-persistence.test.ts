import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { compressSnapshot, decompressSnapshot } from '../../utils/url-sharing';
import { historyStore } from '../history.svelte';

/**
 * A footing is a modelled entity, so it has to behave like one: survive every persistence
 * path, be selectable and deletable, cascade when what it depends on disappears, and carry
 * a revision that lets its design go stale when it is edited.
 *
 * These are the tests that separate "a footing type exists" from "a footing is part of the
 * project". The engine has been complete since PR18 opened; what was missing was exactly
 * this.
 */
describe('footings and geotechnical data on the model', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  const nodeWithFooting = () => {
    const nodeId = modelStore.addNode(0, 0, 0);
    const profileId = modelStore.addSoilProfile('Arena densa');
    modelStore.updateSoilProfile(profileId, {
      bearing: { kind: 'allowablePressure', allowableBearingKPa: 250 },
      provenance: { source: 'report', reference: 'EG-2026-14' },
    });
    const footingId = modelStore.addFooting(nodeId, 'Z1');
    modelStore.updateFooting(footingId, { B: 1.8, L: 1.8, thickness: 0.45 });
    return { nodeId, profileId, footingId };
  };

  it('a new project has no strata and no footings', () => {
    expect(modelStore.model.footings.size).toBe(0);
    expect(modelStore.model.geotechnical?.profiles).toEqual([]);
  });

  it('a new footing takes the project default stratum and the node elevation', () => {
    const nodeId = modelStore.addNode(3, 0, -1.5);
    const profileId = modelStore.addSoilProfile('S1');
    const footingId = modelStore.addFooting(nodeId);
    const f = modelStore.model.footings.get(footingId)!;
    expect(f.soilProfileId).toBe(profileId);
    expect(f.foundingElevation).toBe(-1.5);
    expect(f.nodeId).toBe(nodeId);
  });

  it('round-trips footings and strata through snapshot/restore', () => {
    const { footingId, profileId } = nodeWithFooting();
    const snap = modelStore.snapshot();
    modelStore.clear();
    expect(modelStore.model.footings.size).toBe(0);

    modelStore.restore(snap);
    const f = modelStore.model.footings.get(footingId)!;
    expect(f.B).toBe(1.8);
    expect(f.thickness).toBe(0.45);
    expect(f.soilProfileId).toBe(profileId);
    const p = modelStore.model.geotechnical!.profiles.find((x) => x.id === profileId)!;
    expect(p.bearing).toEqual({ kind: 'allowablePressure', allowableBearingKPa: 250 });
    expect(p.provenance.reference).toBe('EG-2026-14');
  });

  it('survives the JSON round-trip that .ded and autosave perform', () => {
    const { footingId } = nodeWithFooting();
    modelStore.updateFooting(footingId, { pedestal: { B: 0.5, L: 0.5, height: 0.6 } });

    const wire = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(wire);

    expect(modelStore.model.footings.get(footingId)!.pedestal)
      .toEqual({ B: 0.5, L: 0.5, height: 0.6 });
  });

  it('survives a URL share, together with its soil', () => {
    // A shared footing without its stratum is a foundation whose bearing check cannot run,
    // which is worse than not sharing it at all — so both travel or neither does.
    const { footingId, profileId } = nodeWithFooting();
    const packed = compressSnapshot(modelStore.snapshot());
    modelStore.clear();
    const decoded = decompressSnapshot(packed);
    expect(decoded).not.toBeNull();
    modelStore.restore(decoded!);

    expect(modelStore.model.footings.get(footingId)!.B).toBe(1.8);
    expect(modelStore.model.geotechnical!.profiles.find((p) => p.id === profileId)?.bearing)
      .toEqual({ kind: 'allowablePressure', allowableBearingKPa: 250 });
  });

  it('does not share a pedestal object between the snapshot and the live model', () => {
    // A shallow clone would let a later pedestal edit silently rewrite the undo entry.
    const { footingId } = nodeWithFooting();
    modelStore.updateFooting(footingId, { pedestal: { B: 0.5, L: 0.5, height: 0.6 } });
    const snap = modelStore.snapshot();

    modelStore.updateFooting(footingId, { pedestal: { B: 0.9, L: 0.9, height: 0.6 } });

    const captured = snap.footings!.find(([id]) => id === footingId)![1];
    expect(captured.pedestal!.B).toBe(0.5);
  });

  it('bumps the footing revision on every edit, and only that footing', () => {
    // Targeted invalidation depends on this: editing Z7 must retire Z7's design and leave
    // the others alone, which a single project-wide counter cannot express.
    const { nodeId, footingId } = nodeWithFooting();
    const otherId = modelStore.addFooting(nodeId, 'Z2');
    const beforeOther = modelStore.model.footings.get(otherId)!.revision;
    const before = modelStore.model.footings.get(footingId)!.revision;

    modelStore.updateFooting(footingId, { thickness: 0.6 });

    expect(modelStore.model.footings.get(footingId)!.revision).toBe(before + 1);
    expect(modelStore.model.footings.get(otherId)!.revision).toBe(beforeOther);
  });

  it('deletes a footing when its node goes', () => {
    // Otherwise a dimensioned foundation stays in the schedule and on the plan under a
    // column that no longer exists.
    const { nodeId, footingId } = nodeWithFooting();
    modelStore.removeNode(nodeId);
    expect(modelStore.model.footings.has(footingId)).toBe(false);
  });

  it('keeps a footing when its COLUMN goes, and clears the dangling reference', () => {
    // The footing still has a node, dimensions and soil, so bearing and thickness remain
    // checkable. What it loses is the punching perimeter and the dowel geometry.
    const nodeA = modelStore.addNode(0, 0, 0);
    const nodeB = modelStore.addNode(0, 0, 3);
    const columnId = modelStore.addElement(nodeA, nodeB);
    const footingId = modelStore.addFooting(nodeA, 'Z1');
    modelStore.updateFooting(footingId, { B: 1.5, L: 1.5, columnElementId: columnId });

    modelStore.removeElement(columnId);

    const f = modelStore.model.footings.get(footingId);
    expect(f).toBeDefined();
    expect(f!.columnElementId).toBeUndefined();
  });

  it('orphans footings on a deleted stratum instead of re-pointing them', () => {
    // Silently moving a foundation onto ground the engineer never chose for it is the one
    // outcome worse than a visible failure.
    const { footingId, profileId } = nodeWithFooting();
    const other = modelStore.addSoilProfile('Otro');

    modelStore.removeSoilProfile(profileId);

    expect(modelStore.model.footings.get(footingId)!.soilProfileId).toBeNull();
    expect(modelStore.model.footings.get(footingId)!.soilProfileId).not.toBe(other);
  });

  it('moves the project default off a deleted stratum', () => {
    const first = modelStore.addSoilProfile('S1');
    const second = modelStore.addSoilProfile('S2');
    expect(modelStore.model.geotechnical!.defaultProfileId).toBe(first);

    modelStore.removeSoilProfile(first);

    expect(modelStore.model.geotechnical!.defaultProfileId).toBe(second);
  });

  it('clear() drops the previous project\'s soil', () => {
    nodeWithFooting();
    modelStore.clear();
    // Carrying it over would found this building on someone else's borehole.
    expect(modelStore.model.geotechnical?.profiles).toEqual([]);
    expect(modelStore.model.footings.size).toBe(0);
  });

  it('restore(snapshot()) is a no-op for footings and strata', () => {
    nodeWithFooting();
    const first = modelStore.snapshot();
    modelStore.restore(first);
    const second = modelStore.snapshot();
    expect(second.footings).toEqual(first.footings);
    expect(second.geotechnical).toEqual(first.geotechnical);
  });

  it('finds the footings founded on a node', () => {
    const { nodeId, footingId } = nodeWithFooting();
    expect(modelStore.footingsOnNode(nodeId).map((f) => f.id)).toEqual([footingId]);
    expect(modelStore.footingsOnNode(nodeId + 999)).toEqual([]);
  });
});

/**
 * A footing is not part of the analytical model.
 *
 * It CARRIES a support reaction; it does not change the stiffness that produced one. So
 * editing one must not discard the solve — and routing footing CRUD through the ordinary
 * `_pushUndo` did exactly that, which made every footing report "no reaction" at design
 * time no matter how carefully it had been dimensioned.
 *
 * These tests pin the analysis-neutrality by watching `modelVersion`, which is what the
 * app's reactive effect uses to clear stale results.
 */
describe('footing and geotechnical edits are analysis-neutral', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  const versionAcross = (fn: () => void): { before: number; after: number } => {
    const before = modelStore.modelVersion;
    fn();
    return { before, after: modelStore.modelVersion };
  };

  it('adding a footing does not bump modelVersion', () => {
    const nodeId = modelStore.addNode(0, 0, 0);
    const v = versionAcross(() => { modelStore.addFooting(nodeId, 'Z1'); });
    expect(v.after).toBe(v.before);
  });

  it('editing a footing does not bump modelVersion', () => {
    const nodeId = modelStore.addNode(0, 0, 0);
    const id = modelStore.addFooting(nodeId, 'Z1');
    const v = versionAcross(() => { modelStore.updateFooting(id, { B: 2, L: 2 }); });
    expect(v.after).toBe(v.before);
  });

  it('editing the ground does not bump modelVersion', () => {
    const p = modelStore.addSoilProfile('S1');
    const v = versionAcross(() => {
      modelStore.updateSoilProfile(p, {
        bearing: { kind: 'allowablePressure', allowableBearingKPa: 250 },
      });
    });
    expect(v.after).toBe(v.before);
  });

  it('deleting a footing does not bump modelVersion', () => {
    const nodeId = modelStore.addNode(0, 0, 0);
    const id = modelStore.addFooting(nodeId, 'Z1');
    const v = versionAcross(() => { modelStore.removeFooting(id); });
    expect(v.after).toBe(v.before);
  });

  it('but a real structural change still does', () => {
    // The control: if this did not move, the test above would be vacuous.
    const v = versionAcross(() => { modelStore.addNode(1, 1, 1); });
    expect(v.after).toBeGreaterThan(v.before);
  });

  it('is still UNDOABLE — silent means analysis-neutral, not unrecorded', () => {
    // Asserted by actually undoing rather than by counting entries: the history stack is
    // capped at 50, so a count comparison is vacuous once the cap is reached.
    const nodeId = modelStore.addNode(0, 0, 0);
    const id = modelStore.addFooting(nodeId, 'Z1');
    modelStore.updateFooting(id, { B: 2.5 });
    expect(modelStore.model.footings.get(id)!.B).toBe(2.5);

    historyStore.undo();

    expect(modelStore.model.footings.get(id)!.B).toBe(0);
  });
});
