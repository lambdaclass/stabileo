/**
 * Selection identity, which is what makes "go back" work.
 *
 * ── Why this has its own test ──────────────────────────────────────
 *
 * It shipped wrong once, and it failed in the quietest possible way. Identity was compared on
 * `barId` and `solidId` alone, which is correct for a click in the viewport — bar ids differ —
 * and catastrophic for a click in the member list, where BOTH fields are `undefined` on every
 * selection. Two different members therefore compared as the same thing, nothing was ever
 * pushed onto the history, and the "previous" control simply never appeared. No error, no
 * warning: a feature that was present in the code and absent from the screen.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { rebarWorkspace, sameSelection } from '../rebar-workspace.svelte';
import type { SceneConflictMarker } from '../../engine/detailing/scene-model';

describe('two selections are the same thing only when they are', () => {
  it('tells two MEMBERS apart when neither names a bar or a solid', () => {
    // The list case. Both have undefined barId and solidId; only the member differs.
    expect(sameSelection({ elementIds: [1] }, { elementIds: [2] })).toBe(false);
  });

  it('recognises the same member selected twice', () => {
    expect(sameSelection({ elementIds: [1] }, { elementIds: [1] })).toBe(true);
  });

  it('tells two bars apart', () => {
    expect(sameSelection(
      { barId: 'b1', elementIds: [1] },
      { barId: 'b2', elementIds: [1] },
    )).toBe(false);
  });

  it('tells a bar apart from the member it sits in', () => {
    // Clicking a bar and then clicking its own beam are two different questions, and the
    // second must be able to step back to the first.
    expect(sameSelection(
      { barId: 'b1', elementIds: [1] },
      { solidId: 'member:1', elementIds: [1] },
    )).toBe(false);
  });

  it('distinguishes a continuous bar from a single-member one', () => {
    expect(sameSelection({ elementIds: [1, 2] }, { elementIds: [1] })).toBe(false);
  });

  it('treats order as significant rather than sorting behind the caller’s back', () => {
    // The producer emits owner ids in a stable order; re-sorting here would hide a change in
    // what the selection actually names.
    expect(sameSelection({ elementIds: [1, 2] }, { elementIds: [2, 1] })).toBe(false);
  });

  it('handles null on either side', () => {
    expect(sameSelection(null, null)).toBe(true);
    expect(sameSelection(null, { elementIds: [1] })).toBe(false);
    expect(sameSelection({ elementIds: [1] }, null)).toBe(false);
  });
});

/**
 * Clicking a red dot in a cage of twenty thousand bars.
 *
 * ── Why one call and not three ─────────────────────────────────────
 *
 * A user who clicks a conflict marker is asking two things at once: what is this, and where am
 * I. Answering only the first leaves them with a fuller panel and the same wall of steel, so
 * `selectConflict` selects, points the camera, and — when asked — isolates the two members the
 * conflict names.
 *
 * The isolation is opt-in because the same conflict is also reached from the detailing panel's
 * list, where a user stepping through rows would not thank a viewport that changes what it
 * shows between one row and the next.
 */
describe('selecting a conflict marker', () => {
  function marker(over: Partial<SceneConflictMarker> = {}): SceneConflictMarker {
    return {
      assemblyId: 'line-1',
      at: { x: 1, y: 2, z: 3 },
      barIds: ['bar-a', 'bar-b'],
      clearance: 0.011,
      required: 0.025,
      shortfall: 0.014,
      severity: 'clearance',
      pairClass: 'sameLayerSpacing',
      elementIds: [88, 12],
      ...over,
    };
  }

  beforeEach(() => {
    rebarWorkspace.reset();
  });

  it('carries the whole conflict on the selection, not an index into a buffer', () => {
    const c = marker();
    rebarWorkspace.selectConflict(c);
    // An instance slot means nothing outside the render that produced it — the filter
    // compacts the buffer. The conflict itself is what downstream needs.
    expect(rebarWorkspace.selection?.conflict).toBe(c);
    expect(rebarWorkspace.selection?.elementIds).toEqual([88, 12]);
  });

  it('points the camera at the conflict without being asked twice', () => {
    rebarWorkspace.selectConflict(marker());
    expect(rebarWorkspace.focusRequest?.elementId).toBe(88);
  });

  it('re-focuses when the same conflict is picked again', () => {
    const c = marker();
    rebarWorkspace.selectConflict(c);
    const first = rebarWorkspace.focusRequest!.nonce;
    rebarWorkspace.selectConflict(c);
    // Picking the same marker twice is a real request — the user has moved the camera since.
    expect(rebarWorkspace.focusRequest!.nonce).toBeGreaterThan(first);
  });

  it('isolates the two members only when asked', () => {
    rebarWorkspace.selectConflict(marker());
    expect(rebarWorkspace.isolated, 'a plain pick changes nothing about visibility').toEqual([]);

    rebarWorkspace.selectConflict(marker(), { isolateMembers: true });
    expect(rebarWorkspace.isolated).toEqual([88, 12]);

    rebarWorkspace.clearIsolation();
    expect(rebarWorkspace.isolated).toEqual([]);
  });

  it('survives a conflict whose members are unknown', () => {
    // A conflict between two family bars carries no frame member. It must still be selectable
    // rather than throwing on the way to the inspector.
    rebarWorkspace.selectConflict(marker({ elementIds: [] }));
    expect(rebarWorkspace.selection?.conflict).toBeTruthy();
    expect(rebarWorkspace.focusRequest).toBeNull();
    expect(rebarWorkspace.isolated).toEqual([]);
  });

  it('goes back to what was selected before the marker', () => {
    rebarWorkspace.select({ barId: 'b1', elementIds: [1] });
    rebarWorkspace.selectConflict(marker());
    rebarWorkspace.goBack();
    expect(rebarWorkspace.selection?.barId).toBe('b1');
    expect(rebarWorkspace.selection?.conflict).toBeUndefined();
  });
});

/**
 * Selecting from the detailing list — §8 objective 3.
 *
 * The list writes this channel and holds nothing of its own, so these are the assertions that
 * stand behind "there is one source of truth". They exercise the store rather than the component
 * on purpose: a rune, a browser and a WebGL context are not needed to prove which member is
 * selected, and `rebar-workspace-open.spec.ts` already pays for the ones that are.
 */
describe('selecting a member from the list', () => {
  beforeEach(() => rebarWorkspace.reset());

  it('selects exactly the member asked for, by id and not by position', () => {
    rebarWorkspace.selectAndFocus(42);
    expect(rebarWorkspace.selection?.elementIds).toEqual([42]);
    // No bar and no solid: a list selection names the MEMBER, which is what `sameSelection`
    // had to be taught to compare on.
    expect(rebarWorkspace.selection?.barId).toBeUndefined();
    expect(rebarWorkspace.selection?.solidId).toBeUndefined();
  });

  it('points the camera at that member in the same gesture', () => {
    rebarWorkspace.selectAndFocus(7);
    expect(rebarWorkspace.focusRequest?.elementId).toBe(7);
  });

  it('re-focuses when the same member is picked again', () => {
    rebarWorkspace.selectAndFocus(7);
    const first = rebarWorkspace.focusRequest?.nonce;
    rebarWorkspace.selectAndFocus(7);
    // The nonce advances even though the selection did not, or clicking the row a second time
    // would not bring the camera back to a member the user had panned away from.
    expect(rebarWorkspace.focusRequest?.nonce).toBeGreaterThan(first!);
  });

  it('changing the selection replaces it rather than accumulating members', () => {
    rebarWorkspace.selectAndFocus(1);
    rebarWorkspace.selectAndFocus(2);
    expect(rebarWorkspace.selection?.elementIds).toEqual([2]);
  });

  it('keeps the previous member on the history stack, so going back works from the list', () => {
    rebarWorkspace.selectAndFocus(1);
    rebarWorkspace.selectAndFocus(2);
    rebarWorkspace.goBack();
    expect(rebarWorkspace.selection?.elementIds).toEqual([1]);
  });

  it('clears through the same channel, leaving no residue behind', () => {
    rebarWorkspace.selectAndFocus(5);
    rebarWorkspace.select(null);
    expect(rebarWorkspace.selection).toBeNull();
  });
});
