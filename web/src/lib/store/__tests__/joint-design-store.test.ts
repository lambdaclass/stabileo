import { describe, it, expect, beforeEach } from 'vitest';
import { jointDesignStore } from '../joint-design.svelte';
import { modelStore } from '../model.svelte';
import type { BoltLayoutChoice } from '../../connection/bolted-joint';

const bolts: BoltLayoutChoice = {
  diameterMm: 20, grade: 'A325', threads: 'included', count: 4, rows: 2,
  spacingMm: 70, edgeDistanceMm: 40,
};

/**
 * A model with real nodes, which these tests did not use to build.
 *
 * They designed joints on node ids that existed in no model, and that passed for as long as the
 * store trusted the integer. It does not any more — a choice keyed to a node the model does not
 * have reconciles as `nodeMissing`, which is the whole of I-07 — so the fixture has to be a
 * model. The joint under test is `apex`, where two rafters meet.
 *
 *     apex (4 m, 3 m)
 *      /  \
 *   left  right      + a third member, added by `addBrace`, to change the fan
 *  (0,0)  (8,0)
 */
function buildFrame(): { left: number; right: number; apex: number } {
  const left = modelStore.addNode(0, 0);
  const right = modelStore.addNode(8, 0);
  const apex = modelStore.addNode(4, 3);
  modelStore.addElement(left, apex);
  modelStore.addElement(apex, right);
  return { left, right, apex };
}

let frame: { left: number; right: number; apex: number };

beforeEach(() => {
  modelStore.clear();
  jointDesignStore.reset();
  frame = buildFrame();
});

describe('choices are stored, results are not', () => {
  it('a node with no entry is notDesigned, which is a fact and not a placeholder', () => {
    expect(jointDesignStore.choicesFor(frame.apex)).toEqual({});
    expect(jointDesignStore.designFor(frame.apex, []).state).toBe('notDesigned');
  });

  it('setting one field does not clear the others', () => {
    jointDesignStore.set(frame.apex, { bolts });
    jointDesignStore.set(frame.apex, { plate: { thicknessMm: 10 } });
    const c = jointDesignStore.choicesFor(frame.apex);
    expect(c.bolts).toEqual(bolts);
    expect(c.plate).toEqual({ thicknessMm: 10 });
  });

  it('clearing forgets the joint entirely', () => {
    jointDesignStore.set(frame.apex, { bolts });
    expect(jointDesignStore.hasAny).toBe(true);
    jointDesignStore.clear(frame.apex);
    expect(jointDesignStore.hasAny).toBe(false);
    expect(jointDesignStore.designFor(frame.apex, []).state).toBe('notDesigned');
  });

  it('lists the designed nodes in order, which is what a document iterates', () => {
    jointDesignStore.set(frame.apex, { bolts });
    jointDesignStore.set(frame.left, { bolts });
    expect(jointDesignStore.designedNodeIds)
      .toEqual([frame.left, frame.apex].sort((a, b) => a - b));
  });
});

describe('the design is recomputed, never cached', () => {
  /*
   * Storing a computed capacity is how a joint ends up reporting a check against a member that
   * was deleted. Only the CHOICES persist; everything else follows the model.
   */
  it('holds no capacity or geometry of its own', () => {
    jointDesignStore.set(frame.apex, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const json = JSON.stringify(jointDesignStore.choicesFor(frame.apex));
    for (const word of ['capacityKN', 'holesM', 'checks', 'demands']) {
      expect(json).not.toContain(word);
    }
  });

  it('answers again after the model changes', () => {
    jointDesignStore.set(frame.apex, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const before = jointDesignStore.designFor(frame.apex, []);
    // No results: the demands are empty either way, but the call is fresh.
    const after = jointDesignStore.designFor(frame.apex, []);
    expect(after).not.toBe(before);
    expect(after.state).toBe(before.state);
  });

  /*
   * `detectJoints` owns which members meet at a node. Two modules deciding that is two modules
   * that can disagree, so the store takes the answer rather than computing its own.
   */
  it('takes the member list from the caller', () => {
    jointDesignStore.set(frame.apex, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const d = jointDesignStore.designFor(frame.apex, [5, 6]);
    expect(d.demands.membersWithoutForces).toEqual([5, 6]);
  });
});

describe('an unsolved model', () => {
  it('produces a design with no demands rather than refusing', () => {
    jointDesignStore.set(frame.apex, { bolts, plate: { thicknessMm: 10, fuMPa: 400 } });
    const d = jointDesignStore.designFor(frame.apex, []);
    expect(d.demands.combinationsConsidered).toBe(0);
    // Incomplete, because the demand is missing — not `notDesigned`, because bolts were chosen.
    expect(d.state).toBe('incomplete');
  });
});

/**
 * I-06 — the choices survive a save and an open.
 *
 * They used to live in a `$state` Map and in nothing else: not in `snapshot()`, not in
 * `restore()`, not in the URL codec. Designing twenty joints of a nave and closing the tab lost
 * all twenty. The repair is that they live on the model, so all four persistence paths carry them
 * without any of them being told about joints.
 *
 * `snapshot()` / `restore()` is the pair every one of the four goes through — `.ded` save/open,
 * undo/redo, tab capture and autosave — which is why testing that pair tests all of them.
 */
describe('I-06 · a designed joint survives save and open', () => {
  const full = {
    bolts,
    plate: { thicknessMm: 12, fuMPa: 400 },
    weld: { legMm: 6, lengthMm: 200 },
    battens: { arrangement: 'doubleBack' as const, gapMm: 12, segments: 3, chordRiMm: 24 },
  };

  it('the snapshot carries the choices', () => {
    jointDesignStore.set(frame.apex, full);
    const snap = modelStore.snapshot();
    expect(snap.jointDesigns?.joints).toHaveLength(1);
    const j = snap.jointDesigns!.joints[0];
    expect(j.nodeId).toBe(frame.apex);
    expect(j.choices.bolts).toEqual(bolts);
    expect(j.choices.plate).toEqual({ thicknessMm: 12, fuMPa: 400 });
    expect(j.choices.weld).toEqual({ legMm: 6, lengthMm: 200 });
    expect(j.choices.battens?.gapMm).toBe(12);
  });

  it('a save/open round trip returns every choice', () => {
    jointDesignStore.set(frame.apex, full);
    // Through JSON, because that is what a `.ded` actually is — a spread would not prove it.
    const onDisk = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    expect(jointDesignStore.hasAny).toBe(false);
    modelStore.restore(onDisk);

    const c = jointDesignStore.choicesFor(frame.apex);
    expect(c.bolts).toEqual(bolts);
    expect(c.plate).toEqual({ thicknessMm: 12, fuMPa: 400 });
    expect(c.weld).toEqual({ legMm: 6, lengthMm: 200 });
    expect(c.battens?.segments).toBe(3);
    expect(c.battens?.chordRiMm).toBe(24);
    expect(jointDesignStore.designedNodeIds).toEqual([frame.apex]);
    expect(jointDesignStore.obsolete).toEqual([]);
  });

  /*
   * A restored joint is `incomplete` rather than `notDesigned`, which is the point: the choices
   * came back and the capacities did not, so the joint has to be recomputed against this model
   * and it says so.
   */
  it('comes back designed, and is recomputed rather than restored', () => {
    jointDesignStore.set(frame.apex, full);
    const onDisk = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(onDisk);
    const d = jointDesignStore.designFor(frame.apex, []);
    expect(d.state).not.toBe('notDesigned');
    // Nothing computed was stored, so nothing computed was trusted.
    const stored = JSON.stringify(jointDesignStore.storedDesigns);
    for (const word of ['capacityKN', 'holesM', 'checks', 'utilisation']) {
      expect(stored, word).not.toContain(word);
    }
  });

  /* `restore(snapshot())` has to be a no-op, which is what Cancel on a CAD draft relies on. */
  it('is idempotent, and leaves the field absent when nothing was designed', () => {
    expect(modelStore.snapshot().jointDesigns).toBeUndefined();
    modelStore.restore(modelStore.snapshot());
    expect(modelStore.model.jointDesigns).toBeUndefined();

    jointDesignStore.set(frame.apex, { bolts });
    const once = JSON.stringify(modelStore.snapshot().jointDesigns);
    modelStore.restore(modelStore.snapshot());
    expect(JSON.stringify(modelStore.snapshot().jointDesigns)).toBe(once);
  });

  /* Clearing the last joint puts the field back to absent, not to an empty container. */
  it('goes back to absent when the last joint is cleared', () => {
    jointDesignStore.set(frame.apex, { bolts });
    expect(modelStore.model.jointDesigns).toBeDefined();
    jointDesignStore.clear(frame.apex);
    expect(modelStore.model.jointDesigns).toBeUndefined();
  });

  /*
   * A project saved before this existed has no `jointDesigns`, and it must open unchanged rather
   * than refusing or materialising an empty stack.
   */
  it('opens a project saved before joints were persisted', () => {
    const old = JSON.parse(JSON.stringify(modelStore.snapshot()));
    delete old.jointDesigns;
    expect(() => modelStore.restore(old)).not.toThrow();
    expect(jointDesignStore.hasAny).toBe(false);
    expect(jointDesignStore.hasObsolete).toBe(false);
    expect(jointDesignStore.obsolete).toEqual([]);
  });

  /*
   * The saved project must not share `choices.battens` with the live model. A shallow copy would
   * mean editing a batten gap silently rewrote the undo entry meant to go back before it.
   */
  it('does not alias the live choices into the snapshot', () => {
    jointDesignStore.set(frame.apex, full);
    const snap = modelStore.snapshot();
    jointDesignStore.setBattens(frame.apex, { gapMm: 99 });
    expect(snap.jointDesigns!.joints[0].choices.battens?.gapMm).toBe(12);
  });
});

/**
 * I-07 — a node id is not an identity.
 *
 * The store exposed `reset()` and nobody called it, so a second model loaded in the same session
 * inherited the first one's choices by id coincidence. The failure is not that a capacity would
 * be wrong — `designFor` recomputes, so it cannot report against a deleted member — but that the
 * panel would present as CHOSEN something the user never chose for this model. That is the defect
 * shape this branch chased three times: a plausible value in the place of an absent one.
 */
describe('I-07 · joints are not carried into another model', () => {
  it('a second model does not inherit the first one\'s joints', () => {
    jointDesignStore.set(frame.apex, { bolts, plate: { thicknessMm: 12 } });
    expect(jointDesignStore.hasAny).toBe(true);

    // Load another model, without reloading the page and without anybody calling reset().
    modelStore.clear();
    const second = buildFrame();
    expect(second.apex).toBe(frame.apex); // the same integer, deliberately

    expect(jointDesignStore.choicesFor(second.apex)).toEqual({});
    expect(jointDesignStore.designFor(second.apex, []).state).toBe('notDesigned');
    expect(jointDesignStore.hasAny).toBe(false);
    // And not as a lingering obsolete entry either: `clear()` replaced the field.
    expect(jointDesignStore.hasObsolete).toBe(false);
  });

  /*
   * The example loader, which is the path a user actually takes to a second model — and the one
   * my first E2E for this missed, because it named an example id that does not exist and so
   * loaded nothing at all. `loadExample` goes through `clear()`, so this holds, but it holds by
   * consequence rather than by intent and is worth pinning where the consequence is visible.
   */
  it('loading another example drops the joints', async () => {
    jointDesignStore.set(frame.apex, { bolts, plate: { thicknessMm: 12 } });
    expect(jointDesignStore.hasAny).toBe(true);

    await modelStore.loadExample('3d-portal-frame');

    expect(modelStore.model.jointDesigns).toBeUndefined();
    expect(jointDesignStore.hasAny).toBe(false);
    expect(jointDesignStore.hasObsolete).toBe(false);
    // And the example really loaded, so the assertion above is not vacuous.
    expect(modelStore.elements.size).toBeGreaterThan(0);
  });

  /*
   * A .ded opened over a session that had joints of its own. `restore` REPLACES the field, so the
   * open project's joints are the ones on screen and the previous session's are gone.
   */
  it('opening another project replaces the joints rather than merging them', () => {
    jointDesignStore.set(frame.apex, { bolts });
    jointDesignStore.set(frame.left, { plate: { thicknessMm: 8 } });

    modelStore.clear();
    const other = buildFrame();
    jointDesignStore.set(other.apex, { plate: { thicknessMm: 20 } });
    const otherOnDisk = JSON.parse(JSON.stringify(modelStore.snapshot()));

    // Back to the first project, then open the second over it.
    modelStore.clear();
    buildFrame();
    jointDesignStore.set(frame.apex, { bolts });
    modelStore.restore(otherOnDisk);

    expect(jointDesignStore.designedNodeIds).toEqual([other.apex]);
    expect(jointDesignStore.choicesFor(other.apex).plate).toEqual({ thicknessMm: 20 });
    // The bolts from the session before are not on the joint.
    expect(jointDesignStore.choicesFor(other.apex).bolts).toBeUndefined();
  });

  /*
   * The three ways an id can lie, each producing a different reason. The reason is what the panel
   * turns into a sentence, so it is asserted rather than merely «obsolete».
   */
  it('a deleted node makes its joint obsolete, not silently gone', () => {
    jointDesignStore.set(frame.apex, { bolts });
    const onDisk = JSON.parse(JSON.stringify(modelStore.snapshot()));
    // A project whose apex was removed after the joints were designed.
    onDisk.nodes = onDisk.nodes.filter((entry: [number, unknown]) => entry[0] !== frame.apex);
    onDisk.elements = [];
    modelStore.restore(onDisk);

    expect(jointDesignStore.choicesFor(frame.apex)).toEqual({});
    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBe('nodeMissing');
    expect(jointDesignStore.hasObsolete).toBe(true);
    // Kept, so the user can still see the work and decide. Not applied, and not iterated.
    expect(jointDesignStore.designedNodeIds).toEqual([]);
    expect(jointDesignStore.storedDesigns?.joints).toHaveLength(1);
  });

  it('a node with the same id somewhere else is a different node', () => {
    jointDesignStore.set(frame.apex, { bolts });
    const onDisk = JSON.parse(JSON.stringify(modelStore.snapshot()));
    // Same id, moved half a metre. This is the id-coincidence case in its purest form.
    onDisk.nodes = onDisk.nodes.map((entry: [number, { x: number; y: number }]) =>
      entry[0] === frame.apex ? [entry[0], { ...entry[1], x: entry[1].x + 0.5 }] : entry);
    modelStore.restore(onDisk);

    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBe('nodeMoved');
    expect(jointDesignStore.choicesFor(frame.apex)).toEqual({});
  });

  it('a different fan of members at the same place is a different joint', () => {
    jointDesignStore.set(frame.apex, { bolts });
    // A brace added to the apex after its joint was designed: same node, three members now.
    const foot = modelStore.addNode(4, 0);
    modelStore.addElement(foot, frame.apex);

    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBe('topologyChanged');
    expect(jointDesignStore.choicesFor(frame.apex)).toEqual({});
  });

  /* Sub-millimetre float noise is not a move. A millimetre of nudge is. */
  it('tolerates float noise but not a real nudge', () => {
    jointDesignStore.set(frame.apex, { bolts });
    const onDisk = JSON.parse(JSON.stringify(modelStore.snapshot()));
    const nudge = (dx: number) => onDisk.nodes.map(
      (entry: [number, { x: number; y: number }]) =>
        entry[0] === frame.apex ? [entry[0], { ...entry[1], x: 4 + dx }] : entry,
    );

    modelStore.restore({ ...onDisk, nodes: nudge(0.0000001) });
    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBeNull();

    modelStore.restore({ ...onDisk, nodes: nudge(0.005) });
    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBe('nodeMoved');
  });

  /**
   * The invalidation signal the store's memo depends on.
   *
   * Reconciliation is memoised on REFERENCE identity of `jointDesigns`, `nodes` and `elements`,
   * because reading them on every access over a 400-member nave would walk the element table once
   * per joint. That is only sound while the model keeps reassigning each Map wholesale on
   * mutation — the convention `CLAUDE.md` states, and the reason `updateNode` ends with
   * `model.nodes = new Map(model.nodes)`.
   *
   * Asserted through the OBSERVABLE consequence rather than by comparing references: a node moved
   * through the store's own API has to turn its joint obsolete on the next read. A mutation path
   * that started editing a Map in place would break Svelte's rendering long before it broke this,
   * but this is the assertion that names the dependency.
   */
  it('notices a node moved through the store API, not only through a reload', () => {
    jointDesignStore.set(frame.apex, { bolts });
    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBeNull();

    modelStore.updateNode(frame.apex, 4.5, 3);

    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBe('nodeMoved');
    expect(jointDesignStore.choicesFor(frame.apex)).toEqual({});
    expect(jointDesignStore.designFor(frame.apex, []).state).toBe('notDesigned');
  });

  /* And a member added through the API, which is the other input the memo keys on. */
  it('notices a member added through the store API', () => {
    jointDesignStore.set(frame.apex, { bolts });
    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBeNull();

    const foot = modelStore.addNode(4, 0);
    modelStore.addElement(foot, frame.apex);

    expect(jointDesignStore.obsolescenceFor(frame.apex)).toBe('topologyChanged');
  });

  /* The two remedies, which is what makes «obsolete» a state rather than a dead end. */
  it('an obsolete joint can be discarded, one at a time or all at once', () => {
    jointDesignStore.set(frame.apex, { bolts });
    jointDesignStore.set(frame.left, { plate: { thicknessMm: 8 } });
    const onDisk = JSON.parse(JSON.stringify(modelStore.snapshot()));
    onDisk.nodes = onDisk.nodes.filter((entry: [number, unknown]) => entry[0] !== frame.apex);
    modelStore.restore(onDisk);

    expect(jointDesignStore.obsolete.map((o) => o.nodeId)).toEqual([frame.apex]);
    // `left` still reconciles: discarding must not touch it.
    jointDesignStore.discardObsolete();
    expect(jointDesignStore.hasObsolete).toBe(false);
    expect(jointDesignStore.designedNodeIds).toEqual([frame.left]);
    expect(jointDesignStore.choicesFor(frame.left).plate).toEqual({ thicknessMm: 8 });

    // And `clear` reaches an obsolete entry too, which is the per-joint remedy.
    jointDesignStore.set(frame.left, { bolts });
    const again = JSON.parse(JSON.stringify(modelStore.snapshot()));
    again.nodes = [];
    again.elements = [];
    modelStore.restore(again);
    expect(jointDesignStore.hasObsolete).toBe(true);
    jointDesignStore.clear(frame.left);
    expect(jointDesignStore.hasObsolete).toBe(false);
    expect(modelStore.model.jointDesigns).toBeUndefined();
  });

  /*
   * The explicit reset still works and is still exported — but it is no longer the thing that has
   * to be remembered. That was the defect: a `reset()` nobody called.
   */
  it('the explicit reset drops everything', () => {
    jointDesignStore.set(frame.apex, { bolts });
    jointDesignStore.reset();
    expect(jointDesignStore.hasAny).toBe(false);
    expect(jointDesignStore.hasObsolete).toBe(false);
    expect(modelStore.model.jointDesigns).toBeUndefined();
  });
});
