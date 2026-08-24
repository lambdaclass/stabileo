/**
 * The selection vocabulary, and the two ways it could quietly stop being one channel.
 *
 * The assertion that matters most here is negative: this module must not hold a selection.
 * `rebarWorkspace.selection` is the channel, and the whole defect §3 names is that a second
 * one appears the moment a panel finds it inconvenient to use the first.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RC_ELEMENT_GROUPS, RC_RETOUCH_UNKNOWN, rcEditConsequence, rcFamiliesIn, rcGroupCounts,
  rcGroupLabelKey, rcGroupOf, rcResolveTarget, rcRetouch,
} from '../rc-selection';
import { SCENE_SOLID_KINDS, type SceneSolidKind } from '../../engine/detailing/scene-model';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

/** A small model with every family in it, so no group is empty by accident. */
const MEMBERSHIP = new Map<number, SceneSolidKind>([
  [1, 'beam'], [2, 'beam'], [3, 'column'],
  [4, 'slab'], [5, 'wall'],
  [6, 'footing'], [7, 'pedestal'],
]);

describe('this module holds no selection', () => {
  /*
   * The negative assertion the module exists for. A `$state`, a module-level `let`, or an
   * exported mutable would each be a second channel — and a second channel is how a panel
   * comes to highlight one thing while the viewport highlights another.
   */
  it('declares no state and no module-level mutable', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../rc-selection.ts'), 'utf8');
    expect(src, 'no runes').not.toMatch(/=\s*\$(state|derived)\b/);
    expect(src, 'no module-level let').not.toMatch(/^let /m);
  });
});

describe('the three groups cover the six families, exhaustively', () => {
  /*
   * The check that survives a seventh family being added to the scene. `rcGroupOf` is a
   * switch over a union, so TypeScript catches a missing case at compile time — but only if
   * the union is what grew. This asserts the runtime consequence: every family the scene
   * declares lands in exactly one group, so none can silently vanish from the list.
   */
  it('every scene family belongs to exactly one group', () => {
    for (const kind of SCENE_SOLID_KINDS) {
      const groups = RC_ELEMENT_GROUPS.filter((g) => rcFamiliesIn(g).includes(kind));
      expect(groups, `${kind} belongs to ${groups.length} groups`).toHaveLength(1);
      expect(groups[0]).toBe(rcGroupOf(kind));
    }
  });

  it('the groups partition the families with none left over', () => {
    const covered = RC_ELEMENT_GROUPS.flatMap((g) => rcFamiliesIn(g));
    expect(covered.sort()).toEqual([...SCENE_SOLID_KINDS].sort());
  });

  it('a pedestal is a foundation, not a linear element', () => {
    // Grouped by where the work happens: the footing pass designs it, and a user looking for
    // it looks under Fundaciones.
    expect(rcGroupOf('pedestal')).toBe('foundation');
    expect(rcGroupOf('column')).toBe('linear');
  });

  it('each group has a heading in es and en', () => {
    for (const g of RC_ELEMENT_GROUPS) {
      const k = rcGroupLabelKey(g);
      expect(es[k as keyof typeof es], k).toBeTruthy();
      expect(en[k as keyof typeof en], k).toBeTruthy();
    }
  });

  /*
   * `design.group.*` already holds twenty-one keys about how a BATCH EDIT groups members.
   * Reusing that prefix would put two unrelated meanings under one namespace.
   */
  it('the headings live in their own namespace', () => {
    for (const g of RC_ELEMENT_GROUPS) expect(rcGroupLabelKey(g)).toMatch(/^design\.elementGroup\./);
  });
});

describe('a target resolves to element ids and nothing else', () => {
  it('an element resolves to itself', () => {
    expect(rcResolveTarget({ kind: 'element', elementId: 3 }, MEMBERSHIP)).toEqual([3]);
  });

  /*
   * An id that is not in the scene resolves to nothing rather than to itself. Returning it
   * anyway would let the list select a member the viewport cannot show, which is the same
   * divergence in a different direction.
   */
  it('an element that is not in the scene resolves to nothing', () => {
    expect(rcResolveTarget({ kind: 'element', elementId: 99 }, MEMBERSHIP)).toEqual([]);
  });

  it('a family resolves to its members, sorted', () => {
    expect(rcResolveTarget({ kind: 'family', family: 'beam' }, MEMBERSHIP)).toEqual([1, 2]);
  });

  it('a group resolves to every member of its families', () => {
    expect(rcResolveTarget({ kind: 'group', group: 'foundation' }, MEMBERSHIP)).toEqual([6, 7]);
    expect(rcResolveTarget({ kind: 'group', group: 'linear' }, MEMBERSHIP)).toEqual([1, 2, 3]);
  });

  /*
   * The reason the result is sorted: a selection is a set. Two clicks that name the same
   * members must produce the same array, or `sameSelection` in the store compares two orders
   * of the same thing and reports a change that did not happen.
   */
  it('a group and its families name the same members', () => {
    const viaGroup = rcResolveTarget({ kind: 'group', group: 'surface' }, MEMBERSHIP);
    const viaFamilies = rcFamiliesIn('surface')
      .flatMap((f) => rcResolveTarget({ kind: 'family', family: f }, MEMBERSHIP))
      .sort((a, b) => a - b);
    expect(viaGroup).toEqual(viaFamilies);
  });

  it('an empty scene resolves everything to nothing', () => {
    const empty = new Map<number, SceneSolidKind>();
    for (const g of RC_ELEMENT_GROUPS) {
      expect(rcResolveTarget({ kind: 'group', group: g }, empty)).toEqual([]);
    }
  });
});

describe('group counts name every group, including the empty ones', () => {
  it('counts each group', () => {
    expect(rcGroupCounts(MEMBERSHIP)).toEqual({ linear: 3, surface: 2, foundation: 2 });
  });

  /*
   * A group missing from the record would let the list drop its heading, and "this model has
   * no walls" would become indistinguishable from "the walls have not been designed" — the
   * distinction the floor tabs already make with a dash rather than a zero.
   */
  it('an empty model still names all three groups', () => {
    expect(rcGroupCounts(new Map())).toEqual({ linear: 0, surface: 0, foundation: 0 });
  });
});

describe('an edit rebuilds rather than patches', () => {
  it('anything written rebuilds the scene', () => {
    expect(rcEditConsequence([7, 3], ['a1']).rebuildScene).toBe(true);
  });

  it('nothing written rebuilds nothing', () => {
    const c = rcEditConsequence([], []);
    expect(c.rebuildScene).toBe(false);
    expect(c.written).toEqual([]);
  });

  it('deduplicates and sorts what it reports', () => {
    const c = rcEditConsequence([5, 1, 5], ['b', 'a', 'b']);
    expect(c.written).toEqual([1, 5]);
    expect(c.invalidated).toEqual(['a', 'b']);
  });

  /*
   * Deliberately NOT "only when a bar count changed". The scene draws diameters, lengths,
   * hooks and spacings; a rule that decided which edits the scene cares about would be a
   * second model of what the scene draws, and it would be wrong the first time someone added
   * a hook.
   */
  it('does not try to guess which edits the scene cares about', () => {
    expect(rcEditConsequence([1], []).rebuildScene).toBe(true);
    expect(rcEditConsequence([1], ['x', 'y', 'z']).rebuildScene).toBe(true);
  });
});

describe('unknown retouch provenance is not the same as none', () => {
  /*
   * The gap this type exists for: `designRunStore.manualOverrides` is $state and nothing
   * captures it, so it does not survive saving and reopening a project. An export that
   * printed "manually retouched: none" for a project full of hand edits would be a false
   * statement in the one place whose purpose is to say what is in the drawing.
   */
  it('a reopened project reports unknown, with no members', () => {
    expect(RC_RETOUCH_UNKNOWN.known).toBe(false);
    expect(RC_RETOUCH_UNKNOWN.members).toEqual([]);
  });

  it('an empty live set reports known-and-none, which is a different claim', () => {
    const live = rcRetouch([]);
    expect(live.known).toBe(true);
    expect(live.members).toEqual([]);
    // The two are only distinguishable by `known`. That is the whole point of the field.
    expect(live).not.toEqual(RC_RETOUCH_UNKNOWN);
  });

  it('a live set reports its members, deduplicated and sorted', () => {
    expect(rcRetouch([9, 2, 9, 4]).members).toEqual([2, 4, 9]);
  });
});
