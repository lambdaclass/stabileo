/**
 * The joint list only offers joints this panel can say something about.
 *
 * `connection-design.ts` computes two things — a bolt group and a fillet weld — and both are
 * steel. It mentions no other material anywhere. Before the filter, `detectJoints` returned
 * every joint in the model, so a reinforced-concrete beam-column joint was offered a bolt
 * diameter, a grade 8.8 and an Fexx. The arithmetic was not wrong. It was being offered for a
 * joint that has no bolts in it.
 *
 * The classification is the CALLER's, not this module's: `materialFamilyOf` needs the
 * material, the grade catalogue and the inference rules, and a geometry helper that reached
 * for three stores would stop being testable like this.
 */

import { describe, it, expect } from 'vitest';
import { detectJoints } from '../connection-design';

/**
 * A two-bay frame: node 2 joins elements 1 and 2, node 3 joins elements 2 and 3.
 *
 *   1 ──e1── 2 ──e2── 3 ──e3── 4
 */
const nodes = new Map([
  [1, { id: 1, x: 0, y: 0, z: 0 }],
  [2, { id: 2, x: 1, y: 0, z: 0 }],
  [3, { id: 3, x: 2, y: 0, z: 0 }],
  [4, { id: 4, x: 3, y: 0, z: 0 }],
]);
const elements = new Map([
  [1, { id: 1, nodeI: 1, nodeJ: 2 }],
  [2, { id: 2, nodeI: 2, nodeJ: 3 }],
  [3, { id: 3, nodeI: 3, nodeJ: 4 }],
]);
const supports = new Map<number, { nodeId: number }>();

describe('detectJoints without a material predicate', () => {
  it('is unchanged — every existing caller keeps its behaviour', () => {
    const joints = detectJoints(nodes, elements, supports);
    expect(joints.map((j) => j.nodeId).sort()).toEqual([2, 3]);
    // Unfiltered, every member counts as one this panel may speak about.
    for (const j of joints) {
      expect(j.metallicElementIds).toEqual(j.elementIds);
      expect(j.nonMetallicElementIds).toEqual([]);
    }
  });
});

describe('detectJoints with a material predicate', () => {
  it('drops a joint whose every member is non-metallic', () => {
    // Only element 3 is steel, so node 2 (elements 1 and 2) has nothing metallic at all.
    const joints = detectJoints(nodes, elements, supports, { isMetallic: (id) => id === 3 });
    expect(joints.map((j) => j.nodeId)).toEqual([3]);
  });

  it('keeps a MIXED joint, because a steel beam into a concrete column is a real detail', () => {
    const joints = detectJoints(nodes, elements, supports, { isMetallic: (id) => id === 2 });
    // Node 2 and node 3 both touch element 2.
    expect(joints.map((j) => j.nodeId).sort()).toEqual([2, 3]);
    const n2 = joints.find((j) => j.nodeId === 2)!;
    // And it says WHICH half is which, so the panel can be specific rather than vague.
    expect(n2.metallicElementIds).toEqual([2]);
    expect(n2.nonMetallicElementIds).toEqual([1]);
  });

  it('drops everything when nothing is metallic, rather than falling back to all', () => {
    // The failure mode worth guarding: a predicate that matches nothing must give an empty
    // list, not quietly revert to the unfiltered one.
    expect(detectJoints(nodes, elements, supports, { isMetallic: () => false })).toEqual([]);
  });

  it('keeps everything when everything is metallic', () => {
    const joints = detectJoints(nodes, elements, supports, { isMetallic: () => true });
    expect(joints.map((j) => j.nodeId).sort()).toEqual([2, 3]);
    for (const j of joints) expect(j.nonMetallicElementIds).toEqual([]);
  });

  it('the count of what it removed is recoverable, which is what the panel reports', () => {
    const all = detectJoints(nodes, elements, supports);
    const steelOnly = detectJoints(nodes, elements, supports, { isMetallic: (id) => id === 3 });
    // The panel prints this difference rather than showing a shorter list with no explanation.
    expect(all.length - steelOnly.length).toBe(1);
  });
});
