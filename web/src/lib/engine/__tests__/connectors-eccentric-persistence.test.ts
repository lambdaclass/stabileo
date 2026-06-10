/**
 * Phase C verification — persistence round-trip for the new primitives:
 *  - EccentricConnectionConstraint (5th Constraint3D variant, with releases[])
 *  - ConnectorElement (joint/spring/bearing primitive)
 *
 * Covers two persistence paths:
 *  1. modelStore.snapshot() → restore() — used by file.ts save/load
 *  2. compressSnapshot() → decompressSnapshot() — share-URL round-trip
 */

import { describe, it, expect } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { compressSnapshot, decompressSnapshot } from '../../utils/url-sharing';

describe('Phase C: persistence round-trip for eccentric + connector', () => {
  it('snapshot/restore preserves an EccentricConnectionConstraint with releases[]', () => {
    modelStore.clear();
    // Need at least 2 real nodes so validators downstream don't reject
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(5, 0, 0);
    modelStore.addConstraint({
      type: 'eccentricConnection',
      masterNode: 1,
      slaveNode: 2,
      offsetX: 0, offsetY: 0.5, offsetZ: 0,
      releases: [true, false, false, false, false, false],
    });
    expect(modelStore.constraints.length).toBe(1);

    const snap = modelStore.snapshot();
    modelStore.clear();
    expect(modelStore.constraints.length).toBe(0);

    modelStore.restore(snap);
    expect(modelStore.constraints.length).toBe(1);
    const c = modelStore.constraints[0] as any;
    expect(c.type).toBe('eccentricConnection');
    expect(c.masterNode).toBe(1);
    expect(c.slaveNode).toBe(2);
    expect(c.offsetX).toBe(0);
    expect(c.offsetY).toBe(0.5);
    expect(c.offsetZ).toBe(0);
    expect(c.releases).toEqual([true, false, false, false, false, false]);
  });

  it('snapshot/restore preserves a ConnectorElement with all stiffness fields', () => {
    modelStore.clear();
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(5, 0, 0);
    const cid = modelStore.addConnector({
      nodeI: 1, nodeJ: 2,
      kAxial: 1e6, kShear: 1e3, kMoment: 0,
      kShearZ: 1e6, kBendY: 0, kBendZ: 0,
    });
    expect(modelStore.connectors.size).toBe(1);

    const snap = modelStore.snapshot();
    modelStore.clear();
    expect(modelStore.connectors.size).toBe(0);

    modelStore.restore(snap);
    expect(modelStore.connectors.size).toBe(1);
    const c = modelStore.connectors.get(cid)!;
    expect(c.nodeI).toBe(1);
    expect(c.nodeJ).toBe(2);
    expect(c.kAxial).toBe(1e6);
    expect(c.kShear).toBe(1e3);
    expect(c.kMoment).toBe(0);
    expect(c.kShearZ).toBe(1e6);
    expect(c.kBendY).toBe(0);
    expect(c.kBendZ).toBe(0);
  });

  it('share-URL compress/decompress preserves both new primitives', () => {
    modelStore.clear();
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(5, 0, 0);
    modelStore.addConstraint({
      type: 'eccentricConnection',
      masterNode: 1, slaveNode: 2,
      offsetX: 0.1, offsetY: 0.2, offsetZ: 0.3,
      releases: [false, true, false, false, false, true],
    });
    modelStore.addConnector({
      nodeI: 1, nodeJ: 2,
      kAxial: 0, kShear: 5e5, kMoment: 0,
    });

    const snap = modelStore.snapshot();
    const encoded = compressSnapshot(snap);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decompressSnapshot(encoded);
    expect(decoded).not.toBeNull();
    if (!decoded) return;

    // Restore and read back
    modelStore.clear();
    modelStore.restore(decoded);

    expect(modelStore.constraints.length).toBe(1);
    const c = modelStore.constraints[0] as any;
    expect(c.type).toBe('eccentricConnection');
    expect(c.releases).toEqual([false, true, false, false, false, true]);
    expect(c.offsetX).toBeCloseTo(0.1);
    expect(c.offsetY).toBeCloseTo(0.2);
    expect(c.offsetZ).toBeCloseTo(0.3);

    expect(modelStore.connectors.size).toBe(1);
    const conn = Array.from(modelStore.connectors.values())[0];
    expect(conn.nodeI).toBe(1);
    expect(conn.nodeJ).toBe(2);
    expect(conn.kAxial).toBe(0);
    expect(conn.kShear).toBe(5e5);
  });
});
