/**
 * Reconciliation, on its own — the pure half of I-06 and I-07.
 *
 * `joint-design-store.test.ts` proves the same properties through the store and the model, which
 * is where a user meets them. This file tests the function underneath, because the store test
 * cannot reach the cases that matter most: a stored file whose shape is wrong, a joint list with
 * a hundred entries, a fingerprint that a hand-edited `.ded` left out.
 */

import { describe, it, expect } from 'vitest';
import {
  JOINT_DESIGNS_SCHEMA_VERSION, cloneStoredJointDesigns, fingerprintNode,
  incidentMemberCount, reconcileJointDesigns,
  type JointChoices, type StoredJointDesigns,
} from '../joint-choices';

const NODES = new Map([
  [1, { x: 0, y: 0 }],
  [2, { x: 4, y: 3 }],
  [3, { x: 8, y: 0 }],
]);
const ELEMENTS = [
  { nodeI: 1, nodeJ: 2 },
  { nodeI: 2, nodeJ: 3 },
];

const choices: JointChoices = { plate: { thicknessMm: 10 } };

function stored(joints: StoredJointDesigns['joints']): StoredJointDesigns {
  return { version: JOINT_DESIGNS_SCHEMA_VERSION, joints };
}

/** A joint stored against node 2 as the fixture has it: (4, 3), two members. */
function atApex(overrides: Partial<StoredJointDesigns['joints'][number]> = {}) {
  return stored([{
    nodeId: 2, atMm: { x: 4000, y: 3000, z: 0 }, memberCount: 2, choices, ...overrides,
  }]);
}

describe('fingerprinting', () => {
  it('rounds a position to the millimetre, so a round trip is exact', () => {
    expect(fingerprintNode({ x: 4.0004, y: 3, z: 0 }, 2).atMm).toEqual({ x: 4000, y: 3000, z: 0 });
    // An absent z is zero, not NaN: a 2-D model is a 3-D model at z = 0.
    expect(fingerprintNode({ x: 1, y: 2 }, 0).atMm.z).toBe(0);
  });

  it('counts the members incident on a node', () => {
    expect(incidentMemberCount(ELEMENTS, 1)).toBe(1);
    expect(incidentMemberCount(ELEMENTS, 2)).toBe(2);
    expect(incidentMemberCount(ELEMENTS, 99)).toBe(0);
  });
});

describe('reconciliation is total', () => {
  it('an absent store yields nothing, and refuses nothing', () => {
    const r = reconcileJointDesigns(undefined, NODES, ELEMENTS);
    expect(r.live.size).toBe(0);
    expect(r.obsolete.size).toBe(0);
  });

  it('every stored joint lands in exactly one map', () => {
    const r = reconcileJointDesigns(stored([
      { nodeId: 1, atMm: { x: 0, y: 0, z: 0 }, memberCount: 1, choices },
      { nodeId: 2, atMm: { x: 4000, y: 3000, z: 0 }, memberCount: 2, choices },
      { nodeId: 9, atMm: { x: 0, y: 0, z: 0 }, memberCount: 1, choices },
    ]), NODES, ELEMENTS);
    expect([...r.live.keys()].sort()).toEqual([1, 2]);
    expect([...r.obsolete.keys()]).toEqual([9]);
    expect(r.live.size + r.obsolete.size).toBe(3);
  });

  it('a matching joint returns the choices it stored', () => {
    const r = reconcileJointDesigns(atApex(), NODES, ELEMENTS);
    expect(r.live.get(2)).toEqual(choices);
  });
});

describe('the three ways a node id lies', () => {
  it('nodeMissing when no node carries the id', () => {
    const r = reconcileJointDesigns(atApex({ nodeId: 42 }), NODES, ELEMENTS);
    expect(r.obsolete.get(42)).toBe('nodeMissing');
  });

  it('nodeMoved when a node with that id sits elsewhere', () => {
    const r = reconcileJointDesigns(atApex({ atMm: { x: 4500, y: 3000, z: 0 } }), NODES, ELEMENTS);
    expect(r.obsolete.get(2)).toBe('nodeMoved');
  });

  it('topologyChanged when the fan of members differs', () => {
    const r = reconcileJointDesigns(atApex({ memberCount: 3 }), NODES, ELEMENTS);
    expect(r.obsolete.get(2)).toBe('topologyChanged');
  });

  /*
   * Order matters, and it is asserted because the reason is what the panel turns into a sentence.
   * A missing node also has no members, so checking the count first would report every deleted
   * node as a topology change and send the user looking for a member they never removed.
   */
  it('reports the outermost reason when more than one applies', () => {
    const r = reconcileJointDesigns(
      stored([{ nodeId: 42, atMm: { x: 0, y: 0, z: 0 }, memberCount: 9, choices }]),
      NODES, ELEMENTS,
    );
    expect(r.obsolete.get(42)).toBe('nodeMissing');

    const moved = reconcileJointDesigns(
      atApex({ atMm: { x: 9999, y: 0, z: 0 }, memberCount: 9 }), NODES, ELEMENTS,
    );
    expect(moved.obsolete.get(2)).toBe('nodeMoved');
  });
});

describe('the tolerance is on the millimetre', () => {
  it('accepts a sub-millimetre difference and refuses a millimetre-plus one', () => {
    const ok = reconcileJointDesigns(atApex({ atMm: { x: 4001, y: 3000, z: 0 } }), NODES, ELEMENTS);
    expect(ok.live.has(2)).toBe(true);
    const no = reconcileJointDesigns(atApex({ atMm: { x: 4002, y: 3000, z: 0 } }), NODES, ELEMENTS);
    expect(no.obsolete.get(2)).toBe('nodeMoved');
  });

  it('checks all three axes', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const at = { x: 4000, y: 3000, z: 0 };
      at[axis] += 500;
      const r = reconcileJointDesigns(atApex({ atMm: at }), NODES, ELEMENTS);
      expect(r.obsolete.get(2), axis).toBe('nodeMoved');
    }
  });
});

/**
 * A `.ded` is a file on someone's disk and can be malformed — hand-edited, truncated, or written
 * by a version that did not have this field. Reconciliation is the boundary, so it survives.
 */
describe('a malformed stored file does not take the app down', () => {
  it('skips an entry with no numeric node id', () => {
    const r = reconcileJointDesigns(
      { version: 1, joints: [{ nodeId: 'two' } as never, atApex().joints[0]] },
      NODES, ELEMENTS,
    );
    expect(r.live.has(2)).toBe(true);
    expect(r.obsolete.size).toBe(0);
  });

  /*
   * `null` coordinates, which is what `NaN` becomes across a `JSON` boundary — and `null` coerces
   * to `0` in arithmetic. Without the finiteness check this entry matched any node at the origin.
   */
  it('refuses a fingerprint whose coordinates are not finite', () => {
    const origin = new Map([[7, { x: 0, y: 0 }]]);
    const r = reconcileJointDesigns(
      { version: 1, joints: [{
        nodeId: 7, atMm: { x: null, y: null, z: null }, memberCount: 0, choices,
      } as never] },
      origin, [],
    );
    expect(r.obsolete.get(7)).toBe('nodeMoved');
    expect(r.live.has(7)).toBe(false);
  });

  it('treats a missing fingerprint as a joint that cannot be vouched for', () => {
    const r = reconcileJointDesigns(
      { version: 1, joints: [{ nodeId: 2, memberCount: 2, choices } as never] },
      NODES, ELEMENTS,
    );
    // Not silently matched on the id alone. That IS the finding.
    expect(r.obsolete.get(2)).toBe('nodeMoved');
    expect(r.live.has(2)).toBe(false);
  });

  it('survives a joints field that is not an array', () => {
    const r = reconcileJointDesigns({ version: 1, joints: null } as never, NODES, ELEMENTS);
    expect(r.live.size).toBe(0);
    expect(r.obsolete.size).toBe(0);
  });

  it('reads an absent choices object as no choices rather than throwing', () => {
    const r = reconcileJointDesigns(
      { version: 1, joints: [{ nodeId: 2, atMm: { x: 4000, y: 3000, z: 0 }, memberCount: 2 } as never] },
      NODES, ELEMENTS,
    );
    expect(r.live.get(2)).toEqual({});
  });
});

describe('cloning, for the snapshot boundary', () => {
  /*
   * A shallow copy would leave the saved project sharing `battens` with the live model, so
   * editing a batten gap would rewrite the undo entry meant to go back before it.
   */
  it('copies the nested choices, not their references', () => {
    const s = stored([{
      nodeId: 2, atMm: { x: 4000, y: 3000, z: 0 }, memberCount: 2,
      choices: { battens: { arrangement: 'doubleBack', gapMm: 12, segments: 3 } },
    }]);
    const copy = cloneStoredJointDesigns(s);
    copy.joints[0].choices.battens!.gapMm = 99;
    expect(s.joints[0].choices.battens!.gapMm).toBe(12);
    expect(copy.joints[0]).not.toBe(s.joints[0]);
  });
});

describe('a large model is walked once', () => {
  /*
   * The element table is counted once rather than once per joint. Asserted as a result and not a
   * timing: 200 joints over 400 members reconcile correctly, which is the only thing a test can
   * honestly claim — but the loop it goes through is the one that made it worth writing.
   */
  it('reconciles 200 joints against 400 members', () => {
    const nodes = new Map<number, { x: number; y: number }>();
    const elements: Array<{ nodeI: number; nodeJ: number }> = [];
    for (let i = 1; i <= 401; i++) nodes.set(i, { x: i, y: 0 });
    for (let i = 1; i <= 400; i++) elements.push({ nodeI: i, nodeJ: i + 1 });
    const joints = [];
    for (let i = 2; i <= 201; i++) {
      joints.push({ nodeId: i, atMm: { x: i * 1000, y: 0, z: 0 }, memberCount: 2, choices });
    }
    const r = reconcileJointDesigns(stored(joints), nodes, elements);
    expect(r.live.size).toBe(200);
    expect(r.obsolete.size).toBe(0);
  });
});
