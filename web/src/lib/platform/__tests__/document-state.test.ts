import { describe, expect, it } from 'vitest';
import { DocumentState, type TabDoc } from '../document-state';

/** A tab whose content is a mutable number, as a fingerprint would be. */
function tab(id: string, content: { v: number }): TabDoc {
  return { id, fingerprint: () => content.v };
}

describe('desktop document state: which file a tab saves to, and whether it has unsaved changes', () => {
  it('a session restored over open tabs keeps none of their files (a reused tab id cannot save over another project)', () => {
    const s = new DocumentState();
    const b = { v: 2 };
    // Tab t1 holds project B, opened from /x/B.ded.
    s.track([tab('t1', b)]);
    s.markSaved(tab('t1', b), '/x/B.ded');
    expect(s.path('t1')).toBe('/x/B.ded');
    // Session A is restored; its saved tab reuses the id t1.
    const a = { v: 1 };
    s.replaceAll([tab('t1', a)]);
    expect(s.path('t1')).toBeUndefined(); // so Save asks where, and /x/B.ded is not written
    expect(s.isUnsaved(tab('t1', a))).toBe(false);
  });

  it('each restored tab gets its own baseline, so tabs with different contents are each clean, and an edit to one shows', () => {
    const s = new DocumentState();
    const one = { v: 10 };
    const two = { v: 20 };
    s.replaceAll([tab('a', one), tab('b', two)]);
    expect(s.unsaved([tab('a', one), tab('b', two)])).toEqual([]);
    two.v = 21;
    expect(s.unsaved([tab('a', one), tab('b', two)]).map((t) => t.id)).toEqual(['b']);
  });

  it('an edit counts at once, with no timer between the edit and the question', () => {
    const s = new DocumentState();
    const c = { v: 5 };
    s.track([tab('t', c)]);
    c.v = 6;
    expect(s.isUnsaved(tab('t', c))).toBe(true);
    c.v = 5; // undone: the same content as the file
    expect(s.isUnsaved(tab('t', c))).toBe(false);
  });

  it('a tab never given a baseline counts as unsaved', () => {
    expect(new DocumentState().isUnsaved(tab('x', { v: 1 }))).toBe(true);
  });

  it('a new tab is clean from the content it was created with; closed tabs are forgotten', () => {
    const s = new DocumentState();
    const c = { v: 1 };
    s.track([tab('t', c)]);
    s.markSaved(tab('t', c), '/x/t.ded');
    s.track([]);
    expect(s.path('t')).toBeUndefined();
    expect(s.isUnsaved(tab('t', c))).toBe(true); // a tab with that id again would start over
  });

  it('saving moves the baseline and keeps the file; Save As changes the file', () => {
    const s = new DocumentState();
    const c = { v: 1 };
    s.track([tab('t', c)]);
    c.v = 2;
    s.markSaved(tab('t', c), '/x/one.ded');
    expect(s.isUnsaved(tab('t', c))).toBe(false);
    s.markSaved(tab('t', c), '/x/two.ded');
    expect(s.path('t')).toBe('/x/two.ded');
  });

  it('rebase keeps a clean tab clean across representations, and leaves a changed tab changed', () => {
    const s = new DocumentState();
    s.track([tab('t', { v: 100 })]);
    s.rebase('t', 100, 200);
    expect(s.isUnsaved(tab('t', { v: 200 }))).toBe(false);
    s.rebase('t', 999, 300); // it was not clean as 999: nothing moves
    expect(s.isUnsaved(tab('t', { v: 300 }))).toBe(true);
  });
});
