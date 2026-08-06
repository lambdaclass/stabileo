/**
 * The keyed-`{#each}` identity for message lists.
 *
 * ── The crash this pins ─────────────────────────────────────────────
 *
 * Clicking "Design and detail floors" on a project with an undimensioned footing threw:
 *
 *     each_key_duplicate: Keyed each block has duplicate key
 *     `footing.issue.planDimension` at indexes 0 and 1
 *
 * `validateFooting` raises two blocking issues for a footing with neither plan dimension set —
 * the same i18n key with `axis: 'B'` and with `axis: 'L'` — `run-footing-design` carries both into
 * the outcome's unsupported list, and `FloorFamiliesPanel` keyed the list on `r.key`. The i18n key
 * is not the record.
 *
 * The fix must keep BOTH records: "B is not positive" and "L is not positive" are two findings with
 * two remedies, and collapsing them would hide one.
 */
import { describe, it, expect } from 'vitest';
import { identifyMessages, messageListKeys, msg } from '../message';
import { validateFooting } from '../../model/footing';
import type { Footing } from '../../model/footing';

/** A footing as `addFooting` creates one: on a node, with nothing dimensioned yet. */
function undimensionedFooting(): Footing {
  return {
    id: 1, name: 'Z1', nodeId: 7, kind: 'isolated',
    B: 0, L: 0, thickness: 0, cover: 0.05,
    rotationDeg: 0, eccentricityB: 0, eccentricityL: 0,
    foundingElevation: -1.2, columnElementId: null, soilProfileId: null,
    pedestal: null, revision: 1,
  } as unknown as Footing;
}

describe('the exact list that crashed', () => {
  it('validateFooting really does raise two planDimension issues', () => {
    // The premise. If this ever stops being true the regression below is testing nothing, so it is
    // asserted rather than assumed.
    const issues = validateFooting(undimensionedFooting())
      .filter((i) => i.severity === 'blocking');
    const plan = issues.filter((i) => i.message.key === 'footing.issue.planDimension');
    expect(plan).toHaveLength(2);
    expect(plan.map((i) => i.message.params?.axis).sort()).toEqual(['B', 'L']);
  });

  it('gives the two planDimension issues distinct keys', () => {
    const messages = validateFooting(undimensionedFooting())
      .filter((i) => i.severity === 'blocking')
      .map((i) => i.message);
    const keys = messageListKeys(messages);
    // Unique — which is what Svelte requires and what threw before.
    expect(new Set(keys).size).toBe(keys.length);
    // And the two planDimension keys differ by the axis, not by a position counter.
    const planKeys = keys.filter((k) => k.startsWith('footing.issue.planDimension'));
    expect(planKeys).toHaveLength(2);
    expect(planKeys.some((k) => k.includes('axis=B'))).toBe(true);
    expect(planKeys.some((k) => k.includes('axis=L'))).toBe(true);
    expect(planKeys.every((k) => !k.includes('#'))).toBe(true);
  });

  it('renders every record, in order, with its own parameters intact', () => {
    const messages = validateFooting(undimensionedFooting())
      .filter((i) => i.severity === 'blocking')
      .map((i) => i.message);
    const rows = identifyMessages(messages);
    // Nothing merged, nothing dropped, nothing reordered.
    expect(rows).toHaveLength(messages.length);
    expect(rows.map((r) => r.message)).toEqual([...messages]);
    // Both axes are still readable off the rows a template would render.
    const axes = rows
      .filter((r) => r.message.key === 'footing.issue.planDimension')
      .map((r) => r.message.params?.axis);
    expect(axes).toEqual(['B', 'L']);
  });

  it('is deterministic across repeated rendering', () => {
    const messages = validateFooting(undimensionedFooting())
      .filter((i) => i.severity === 'blocking')
      .map((i) => i.message);
    const once = messageListKeys(messages);
    // Same input, same keys — three times, and from a fresh array with the same content, because a
    // key that depended on object identity would survive the first check and fail the second.
    expect(messageListKeys(messages)).toEqual(once);
    expect(messageListKeys([...messages])).toEqual(once);
    expect(messageListKeys(messages.map((m) => ({ ...m })))).toEqual(once);
  });
});

describe('the superseded key strategy, pinned as broken', () => {
  /**
   * Executable proof that the fix is a fix.
   *
   * Svelte's duplicate-key guard is emitted ONLY in dev builds — `EachBlock.js` gates it on
   * `if (dev && node.metadata.keyed)` — so a Playwright run over a production build cannot
   * reproduce the throw at all, whatever it asserts. This is where the regression actually lives:
   * the old strategy collides on the real list, the new one does not.
   */
  const realList = () =>
    validateFooting(undimensionedFooting())
      .filter((i) => i.severity === 'blocking')
      .map((i) => i.message);

  it('keying on the message key alone DOES collide, which is the crash', () => {
    const messages = realList();
    const supersededKeys = messages.map((m) => m.key);
    expect(new Set(supersededKeys).size).toBeLessThan(supersededKeys.length);
    // And the colliding key is exactly the one the error named.
    const dupes = supersededKeys.filter((k, i) => supersededKeys.indexOf(k) !== i);
    expect(dupes).toContain('footing.issue.planDimension');
  });

  it('keying on key + only the axis param is narrower than it looks', () => {
    /**
     * `FoundationsPanel` keyed its footing-issue list on `i.message.key + i.message.params?.axis`,
     * and on the list above that IS sufficient — the two planDimension issues differ in `axis`, and
     * the one remaining blocking issue has a different key. So that block was not the crash site,
     * which matches the error naming a bare `footing.issue.planDimension`.
     *
     * It is still the wrong key, because it only works while at most one issue per key lacks an
     * axis. Two issues sharing a key and differing in any OTHER param collide, since `params?.axis`
     * is `undefined` for both and `'k' + undefined` is a single value.
     */
    const supersededKey = (m: { key: string; params?: Record<string, unknown> }) =>
      m.key + (m.params?.axis as string | undefined);

    // Sufficient here.
    const real = realList().map(supersededKey);
    expect(new Set(real).size).toBe(real.length);

    // And insufficient the moment two records share a key without an axis between them — which is
    // the shape of most of this project's message lists.
    const sameKeyNoAxis = [
      msg('footing.anchorage.insufficient', { footing: 'Z1', side: 'low' }),
      msg('footing.anchorage.insufficient', { footing: 'Z1', side: 'high' }),
    ];
    const collided = sameKeyNoAxis.map(supersededKey);
    expect(new Set(collided).size).toBe(1);
    // The new strategy separates them on the param that actually differs.
    expect(new Set(messageListKeys(sameKeyNoAxis)).size).toBe(2);
  });

  it('the new strategy is collision-free on that same list', () => {
    const keys = messageListKeys(realList());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('keys that must not collide', () => {
  it('separates the same key by any differing param, not only by axis', () => {
    const keys = messageListKeys([
      msg('footing.issue.planDimension', { footing: 'Z1', axis: 'B', value: 0 }),
      msg('footing.issue.planDimension', { footing: 'Z1', axis: 'L', value: 0 }),
      msg('footing.issue.planDimension', { footing: 'Z2', axis: 'B', value: 0 }),
    ]);
    expect(new Set(keys).size).toBe(3);
  });

  it('falls back to a position suffix only when key AND params are identical', () => {
    // Two genuinely identical records. They must still both render — the list is the producer's,
    // and this helper's job is unique keys, not deduplication.
    const same = msg('footing.issue.planDimension', { footing: 'Z1', axis: 'B', value: 0 });
    const keys = messageListKeys([same, same, same]);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).not.toContain('#');
    expect(keys[1]).toContain('#1');
    expect(keys[2]).toContain('#2');
  });

  it('does not put a position suffix on a list that needs none', () => {
    // The property that makes this a KEY rather than an index: a list of distinct records keeps
    // stable keys, so inserting at the front does not remount every row below it.
    const a = msg('a.one', { x: 1 });
    const b = msg('b.two', { x: 2 });
    expect(messageListKeys([a, b]).every((k) => !k.includes('#'))).toBe(true);
    const before = messageListKeys([a, b]);
    const after = messageListKeys([msg('c.zero'), a, b]);
    expect(after.slice(1)).toEqual(before);
  });

  it('distinguishes a message with no params from one with params', () => {
    const keys = messageListKeys([msg('same.key'), msg('same.key', { a: 1 })]);
    expect(new Set(keys).size).toBe(2);
  });

  it('is stable against param insertion order', () => {
    // The identity sorts its params, so two producers building the same message in a different
    // order agree. Without that, a key would change when a field was added upstream.
    const one = messageListKeys([msg('k', { a: 1, b: 2 })]);
    const two = messageListKeys([msg('k', { b: 2, a: 1 })]);
    expect(one).toEqual(two);
  });
});
