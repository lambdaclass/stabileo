/**
 * Objective 6 — what a pin is, and how far it reaches.
 *
 * The assertions that matter are the ones about REACH. The rest of the module is a two-state
 * toggle; the part that can be got wrong in a way nobody notices is that pinning one bar
 * freezes every member it belongs to, and that two pins on one member freeze one member.
 */

import { describe, it, expect } from 'vitest';
import {
  rcBarLock, rcBarLockCensus, rcHasPins, rcLockToggle, type RcBarLockLike,
} from '../rc-bar-lock';

const bar = (id: string, owners: number[], locked?: boolean): RcBarLockLike =>
  ({ id, ownerElementIds: owners, locked });

describe('rcBarLock — the two states', () => {
  it('an unpinned bar offers to pin, and says it is free', () => {
    const l = rcBarLock(bar('b1', [50]));
    expect(l.state).toBe('free');
    expect(l.locked).toBe(false);
    expect(l.stateKey).toBe('detailing.bar.lock.free');
    expect(l.actionKey).toBe('detailing.lockBar');
  });

  it('a pinned bar offers to release, and says it is pinned', () => {
    const l = rcBarLock(bar('b1', [50], true));
    expect(l.state).toBe('pinned');
    expect(l.stateKey).toBe('detailing.bar.lock.pinned');
    expect(l.actionKey).toBe('detailing.unlockBar');
  });

  /*
   * The control's label and the row's state are opposite statements and must never collapse
   * into one key. A toggle that labels itself with its own state reads `Pinned` while pinning.
   */
  it('the state key and the action key are never the same key', () => {
    for (const locked of [true, false, undefined]) {
      const l = rcBarLock(bar('b1', [50], locked));
      expect(l.stateKey).not.toBe(l.actionKey);
    }
  });

  it('each state carries a distinct glyph, so the tint is not load-bearing', () => {
    expect(rcBarLock(bar('b1', [50], true)).glyph)
      .not.toBe(rcBarLock(bar('b1', [50])).glyph);
  });

  /*
   * The visible label and the accessible name are different strings on purpose: the row is the
   * subject for a sighted reader and there is no row for a screen reader tabbing the list.
   */
  it('the accessible name is its own key, distinct from the visible action', () => {
    for (const locked of [true, false]) {
      const l = rcBarLock(bar('b1', [50], locked));
      expect(l.actionLabelKey).not.toBe(l.actionKey);
      expect(l.actionLabelKey).not.toBe(l.stateKey);
    }
  });

  it('a free bar names no consequence, because it has none', () => {
    expect(rcBarLock(bar('b1', [50, 60])).freezesKey).toBeNull();
  });

  it('one member frozen and several are different sentences', () => {
    expect(rcBarLock(bar('b1', [50], true)).freezesKey)
      .toBe('detailing.bar.lock.freezesOne');
    expect(rcBarLock(bar('b1', [50, 60], true)).freezesKey)
      .toBe('detailing.bar.lock.freezesMany');
  });

  it('`locked: false` is free, exactly like an absent flag', () => {
    expect(rcBarLock(bar('b1', [50], false)).state).toBe('free');
  });
});

describe('rcBarLock — what a pin freezes', () => {
  /*
   * The defect this module exists for. `lockedMemberIds()` walks `ownerElementIds`, so pinning
   * a bar continuous over a support stops the repair loop touching the column as well as the
   * beam — and nothing said so.
   */
  it('a pin freezes every member the bar belongs to, not only the one it was designed for', () => {
    const l = rcBarLock(bar('b1', [50, 60], true));
    expect(l.frozenMembers).toEqual([50, 60]);
    expect(l.reaches).toBe(true);
  });

  it('a pin on a bar inside one member reaches no further, and says so', () => {
    const l = rcBarLock(bar('b1', [50], true));
    expect(l.frozenMembers).toEqual([50]);
    expect(l.reaches).toBe(false);
  });

  it('a free bar freezes nothing, whatever it owns', () => {
    const l = rcBarLock(bar('b1', [50, 60, 70]));
    expect(l.frozenMembers).toEqual([]);
    expect(l.reaches).toBe(false);
  });

  it('the frozen members are unique and ascending, so two readings compare equal', () => {
    expect(rcBarLock(bar('b1', [60, 50, 60], true)).frozenMembers).toEqual([50, 60]);
  });
});

describe('rcBarLock — a pin on a proposal', () => {
  it('is reported, because the pin and the proposal say opposite things', () => {
    expect(rcBarLock(bar('b1', [50], true), { provisional: true }).pinnedProvisional).toBe(true);
  });

  it('is not reported when the bar is not pinned', () => {
    expect(rcBarLock(bar('b1', [50]), { provisional: true }).pinnedProvisional).toBe(false);
  });

  it('is not reported when the caller says nothing about provenance', () => {
    expect(rcBarLock(bar('b1', [50], true)).pinnedProvisional).toBe(false);
  });
});

describe('rcBarLockCensus', () => {
  it('counts nothing on a list with no pins', () => {
    const c = rcBarLockCensus([bar('b1', [50]), bar('b2', [50])].map((b) => rcBarLock(b)));
    expect(c).toEqual({ pinned: 0, frozenMembers: [], pinnedProvisional: 0 });
    expect(rcHasPins(c)).toBe(false);
  });

  /*
   * The union, not the sum. Two pins on one beam freeze one member, and `lockedMemberIds()` is
   * a `Set` — a census that added them would print a bigger number than the engine receives.
   */
  it('reports the frozen members as a union, so two pins on one member freeze one', () => {
    const c = rcBarLockCensus([
      rcBarLock(bar('b1', [50], true)),
      rcBarLock(bar('b2', [50], true)),
    ]);
    expect(c.pinned).toBe(2);
    expect(c.frozenMembers).toEqual([50]);
  });

  it('unions across bars that reach different members', () => {
    const c = rcBarLockCensus([
      rcBarLock(bar('b1', [50, 60], true)),
      rcBarLock(bar('b2', [60, 70], true)),
      rcBarLock(bar('b3', [99])),
    ]);
    expect(c.pinned).toBe(2);
    expect(c.frozenMembers).toEqual([50, 60, 70]);
    expect(rcHasPins(c)).toBe(true);
  });

  it('counts pinned proposals separately from pins', () => {
    const c = rcBarLockCensus([
      rcBarLock(bar('b1', [50], true), { provisional: true }),
      rcBarLock(bar('b2', [60], true)),
    ]);
    expect(c.pinned).toBe(2);
    expect(c.pinnedProvisional).toBe(1);
  });

  /*
   * The census is built exactly the way `lockedMemberIds()` builds its set: walk every locked
   * bar's owners into a Set. Restated here as a property so a future edit that switched the
   * census to counting bars-per-member cannot pass.
   */
  it('agrees with the set the repair loop receives', () => {
    const bars = [
      bar('b1', [50, 60], true), bar('b2', [50], true),
      bar('b3', [70]), bar('b4', [80, 60], true),
    ];
    const engineSet = new Set<number>();
    for (const b of bars) {
      if (!b.locked) continue;
      for (const id of b.ownerElementIds) engineSet.add(id);
    }
    const c = rcBarLockCensus(bars.map((b) => rcBarLock(b)));
    expect(c.frozenMembers).toEqual([...engineSet].sort((a, z) => a - z));
  });
});

/**
 * D1 — a press flips the whole member, not the bar it landed on.
 *
 * The rule was four lines inside `detailingStore.toggleLock` under a paragraph explaining what
 * they meant, which is exactly the shape of thing that gets "simplified" back to
 * `b.id === barId` by somebody reading the code and not the paragraph.
 */
describe('rcLockToggle', () => {
  const beam = [
    bar('b1', [50]), bar('b2', [50]), bar('b3', [50]),
    bar('c1', [60]),
    // Continuous over the support: it belongs to the beam AND the column.
    bar('through', [50, 60]),
  ];

  it('flips every bar of the member, not only the one pressed', () => {
    const f = rcLockToggle(beam, 'b2');
    expect(f.locked).toBe(true);
    expect([...f.barIds].sort()).toEqual(['b1', 'b2', 'b3', 'through']);
  });

  /*
   * The reach, as an operation rather than as a sentence: pressing a continuous bar freezes the
   * column's bars too, because the column is one of its owners and `lockedMemberIds()` will
   * report it frozen either way. Flipping only the beam's would leave the two disagreeing.
   */
  it('flips both members’ bars when the pressed bar is continuous', () => {
    const f = rcLockToggle(beam, 'through');
    expect([...f.barIds].sort()).toEqual(['b1', 'b2', 'b3', 'c1', 'through']);
    expect(f.members).toEqual([50, 60]);
  });

  it('releases from the state of the bar that was PRESSED', () => {
    const locked = beam.map((b) => ({ ...b, locked: true }));
    expect(rcLockToggle(locked, 'b1').locked).toBe(false);
  });

  /*
   * A member half-locked cannot happen through this function — but if a stored project ever
   * carried one, the press still resolves from the bar under the user's finger, which is the
   * only state they can see.
   */
  it('resolves a half-locked member from the pressed bar', () => {
    const mixed = [
      { ...bar('b1', [50]), locked: true },
      { ...bar('b2', [50]), locked: false },
    ];
    expect(rcLockToggle(mixed, 'b2').locked).toBe(true);
    expect(rcLockToggle(mixed, 'b1').locked).toBe(false);
  });

  it('does nothing for a bar this assembly does not hold', () => {
    expect(rcLockToggle(beam, 'ghost')).toEqual({ barIds: [], locked: false, members: [] });
  });
});
