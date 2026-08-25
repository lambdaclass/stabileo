import { describe, it, expect, beforeEach } from 'vitest';
import { jointDesignStore } from '../joint-design.svelte';
import { modelStore } from '../model.svelte';
import type { BoltLayoutChoice } from '../../connection/bolted-joint';

const bolts: BoltLayoutChoice = {
  diameterMm: 20, grade: 'A325', threads: 'included', count: 4, rows: 2,
  spacingMm: 70, edgeDistanceMm: 40,
};

beforeEach(() => {
  jointDesignStore.reset();
  modelStore.clear();
});

describe('choices are stored, results are not', () => {
  it('a node with no entry is notDesigned, which is a fact and not a placeholder', () => {
    expect(jointDesignStore.choicesFor(1)).toEqual({});
    expect(jointDesignStore.designFor(1, []).state).toBe('notDesigned');
  });

  it('setting one field does not clear the others', () => {
    jointDesignStore.set(1, { bolts });
    jointDesignStore.set(1, { plate: { thicknessMm: 10 } });
    const c = jointDesignStore.choicesFor(1);
    expect(c.bolts).toEqual(bolts);
    expect(c.plate).toEqual({ thicknessMm: 10 });
  });

  it('clearing forgets the joint entirely', () => {
    jointDesignStore.set(1, { bolts });
    expect(jointDesignStore.hasAny).toBe(true);
    jointDesignStore.clear(1);
    expect(jointDesignStore.hasAny).toBe(false);
    expect(jointDesignStore.designFor(1, []).state).toBe('notDesigned');
  });

  it('lists the designed nodes in order, which is what a document iterates', () => {
    jointDesignStore.set(7, { bolts });
    jointDesignStore.set(2, { bolts });
    expect(jointDesignStore.designedNodeIds).toEqual([2, 7]);
  });
});

describe('the design is recomputed, never cached', () => {
  /*
   * Storing a computed capacity is how a joint ends up reporting a check against a member that
   * was deleted. Only the CHOICES persist; everything else follows the model.
   */
  it('holds no capacity or geometry of its own', () => {
    jointDesignStore.set(1, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const json = JSON.stringify(jointDesignStore.choicesFor(1));
    for (const word of ['capacityKN', 'holesM', 'checks', 'demands']) {
      expect(json).not.toContain(word);
    }
  });

  it('answers again after the model changes', () => {
    jointDesignStore.set(1, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const before = jointDesignStore.designFor(1, []);
    // No members and no results: the demands are empty either way, but the call is fresh.
    const after = jointDesignStore.designFor(1, []);
    expect(after).not.toBe(before);
    expect(after.state).toBe(before.state);
  });

  /*
   * `detectJoints` owns which members meet at a node. Two modules deciding that is two modules
   * that can disagree, so the store takes the answer rather than computing its own.
   */
  it('takes the member list from the caller', () => {
    jointDesignStore.set(1, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const d = jointDesignStore.designFor(1, [5, 6]);
    expect(d.demands.membersWithoutForces).toEqual([5, 6]);
  });
});

describe('an unsolved model', () => {
  it('produces a design with no demands rather than refusing', () => {
    jointDesignStore.set(1, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const d = jointDesignStore.designFor(1, []);
    expect(d.demands.combinationsConsidered).toBe(0);
    // Incomplete, because the demand is missing — not `notDesigned`, because bolts were chosen.
    expect(d.state).toBe('incomplete');
  });
});
