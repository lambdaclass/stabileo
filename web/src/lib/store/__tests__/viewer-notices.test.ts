/**
 * The fold on the viewer's standing notices — and the two ways it must not work.
 *
 * The store is four lines of bookkeeping; the specification is in the KEY. Folding is allowed to
 * hide an explanation and forbidden to hide a change, so the interesting cases are the ones where
 * the count moves under a fold, and the one where a caller asks about a notice it never folded.
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { viewerNotices } from '../viewer-notices.svelte';

beforeEach(() => { viewerNotices.reset(); });

describe('a notice starts open', () => {
  it('is not folded before anyone folds it', () => {
    expect(viewerNotices.folded('provisional', 5)).toBe(false);
    expect(viewerNotices.folded('torsion', 119)).toBe(false);
  });
});

describe('folding is per notice, and survives while the count does', () => {
  it('folds the one asked for and leaves the other alone', () => {
    viewerNotices.fold('provisional', 5);
    expect(viewerNotices.folded('provisional', 5)).toBe(true);
    /**
     * The two are separate facts about separate members — `TorsionBanner` writes down that "a
     * member can be either, both, or neither". One fold governing both would let a reader put
     * away a proposal warning and lose an unchecked-torsion warning with it.
     */
    expect(viewerNotices.folded('torsion', 5)).toBe(false);
  });

  it('stays folded across repeated reads', () => {
    viewerNotices.fold('torsion', 119);
    expect(viewerNotices.folded('torsion', 119)).toBe(true);
    expect(viewerNotices.folded('torsion', 119)).toBe(true);
  });

  it('unfolds again', () => {
    viewerNotices.fold('provisional', 5);
    viewerNotices.unfold('provisional');
    expect(viewerNotices.folded('provisional', 5)).toBe(false);
  });

  it('toggles both ways from the same call', () => {
    viewerNotices.toggle('provisional', 5);
    expect(viewerNotices.folded('provisional', 5)).toBe(true);
    viewerNotices.toggle('provisional', 5);
    expect(viewerNotices.folded('provisional', 5)).toBe(false);
  });
});

describe('a fold cannot outlive the statement it was applied to', () => {
  it('re-opens when the count changes', () => {
    /**
     * The failure this key exists to prevent.
     *
     * A reader folds "5 members carry a provisional proposal", regenerates the detailing, and 60
     * members are now proposals. A fold remembered per NOTICE would keep that folded and the
     * reader would never be shown the new number — the one case where folding an explanation
     * amounts to hiding a change.
     */
    viewerNotices.fold('provisional', 5);
    expect(viewerNotices.folded('provisional', 60), 'a different count is a different statement')
      .toBe(false);
  });

  it('re-folds at the new count only if the reader folds it again', () => {
    viewerNotices.fold('provisional', 5);
    expect(viewerNotices.folded('provisional', 60)).toBe(false);
    viewerNotices.fold('provisional', 60);
    expect(viewerNotices.folded('provisional', 60)).toBe(true);
    /**
     * And the old count does NOT come back folded. It cannot recur in practice — a count is read
     * from the document, not chosen — but a store that answered "folded" for a value it had been
     * asked to forget would be remembering two states under one key.
     */
    expect(viewerNotices.folded('provisional', 5)).toBe(false);
  });

  it('treats zero as a count like any other', () => {
    /**
     * Zero never reaches a fold, because both banners render nothing at zero. Pinned anyway: the
     * obvious implementation of `folded` is a truthiness test, and `foldedAt[kind] || count` would
     * report a folded zero as open — a defect that only shows up the day a third notice with a
     * meaningful zero is added.
     */
    viewerNotices.fold('torsion', 0);
    expect(viewerNotices.folded('torsion', 0)).toBe(true);
    expect(viewerNotices.folded('torsion', 1)).toBe(false);
  });
});

describe('nothing here is persisted', () => {
  it('holds no reference to storage', () => {
    /**
     * Asserted as a property of the MODULE rather than by spying on `localStorage`.
     *
     * Folding is a reading gesture, not a property of the works — the same line
     * `document-scope.svelte.ts` draws about which elements a document covers. Persisting it
     * would mean a project reopened weeks later hid a construction warning because somebody once
     * folded it. A reload must show both notices in full, and the way to guarantee that is for
     * this file to contain no way to write anything down.
     */
    const src = new URL('../viewer-notices.svelte.ts', import.meta.url);
    const text = readFileSync(src, 'utf8');
    expect(text).not.toMatch(/localStorage|sessionStorage|indexedDB|requestAutosave/);
  });
});
