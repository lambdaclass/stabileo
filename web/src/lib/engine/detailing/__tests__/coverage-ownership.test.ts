/**
 * Member-to-assembly OWNERSHIP: nothing verified may disappear silently.
 *
 * Every VERIFIED, applicable member is either owned by exactly one assembly or carries an
 * explicit, translatable reason for its absence. Silence is failure — a member owned by no
 * assembly is invisible to the UI, the schedule and the drawings, and a member owned by two
 * is detailed, scheduled and drawn twice.
 *
 * Split from the bar-output invariants so that each concern pays for ONE detailing run
 * rather than the suite paying for one per test.
 */

import { describe, it, expect } from 'vitest';
import { flagshipDetailing, membersOfKind } from './helpers/flagship';
import { teAt } from '../../../i18n/engine-text';

describe('member-to-assembly coverage invariant', () => {
  it('every detailable member is owned by exactly one assembly, or explicitly excluded', () => {
    const r = flagshipDetailing();

    const owned = new Map<number, string[]>();
    for (const a of r.assemblies) {
      for (const id of a.elementIds) {
        owned.set(id, [...(owned.get(id) ?? []), a.id]);
      }
    }
    const skipped = new Set(r.skipped.map((s) => s.elementId));

    const missing: number[] = [];
    const duplicated: Array<{ id: number; assemblies: string[] }> = [];
    for (const id of r.readiness.detailable) {
      const owners = owned.get(id);
      if (!owners || owners.length === 0) {
        if (!skipped.has(id)) missing.push(id);
        continue;
      }
      if (owners.length > 1) duplicated.push({ id, assemblies: owners });
    }

    expect(missing,
      `${missing.length} verified member(s) vanished with no assembly and no stated reason`)
      .toEqual([]);
    expect(duplicated,
      'a member owned by two assemblies would be detailed, scheduled and drawn twice')
      .toEqual([]);
  }, 300_000);

  it('every skipped member states a reason that renders in both languages', () => {
    const r = flagshipDetailing();
    for (const s of r.skipped) {
      for (const locale of ['en', 'es']) {
        const text = teAt({ key: s.key }, locale);
        expect(text, `${s.key} in ${locale}`).not.toBe(s.key);
      }
    }
  }, 300_000);

  it('every column lift appears in its stack assembly, not just the lowest one', () => {
    const r = flagshipDetailing();
    const columnIds = membersOfKind('column');
    const owned = new Set(r.assemblies.flatMap((a) => a.elementIds));
    const orphanedLifts = columnIds.filter((id) => !owned.has(id)
      && !r.skipped.some((s) => s.elementId === id));
    expect(orphanedLifts,
      `${orphanedLifts.length} column lift(s) are detailed as part of a stack but are not `
      + 'listed on any assembly, so nothing in the UI, the schedule or the drawings owns them')
      .toEqual([]);
  }, 300_000);
});
