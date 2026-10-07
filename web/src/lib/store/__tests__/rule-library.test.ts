/**
 * The browser's library of combination rule templates (`rule-library.svelte.ts`) is shared by
 * every tab open on this computer and outlives any one of them, so a save must not undo what
 * another tab saved, one entry the parser rejects must not take the others with it, and two saves
 * in one millisecond must not share an id.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { rulesToTemplate, type CombinationRule } from '../../engine/loads/combination-rules';

const KEY = 'stabileo-combination-rule-library';
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
afterAll(() => { vi.unstubAllGlobals(); });

const rules = (f: number): CombinationRule[] => [{ id: 'r1', purpose: 'strength', terms: [{ symbol: 'D', factor: f }] }];
const entry = (id: string, name: string, f: number) => ({ id, name, savedAt: '', doc: rulesToTemplate(rules(f), name) });
const stored = () => JSON.parse(mem.get(KEY) ?? '[]') as Array<{ id: string; name: string; doc: string }>;

/** A fresh tab: the module read once at import, as the app does. */
async function tab() {
  vi.resetModules();
  return (await import('../rule-library.svelte')).ruleLibrary;
}

beforeEach(() => { mem.clear(); });

describe('the rule library across tabs', () => {
  it('a save in one tab keeps what another tab saved since this one read the list', async () => {
    const a = await tab();
    const b = await tab();
    expect(a.save('From A', rules(1.2))).toBe(true);
    expect(b.save('From B', rules(1.4))).toBe(true);
    expect(stored().map((x) => x.name).sort()).toEqual(['From A', 'From B']);
    // And a removal in A does not bring back a stale list either.
    a.remove(a.templates.find((x) => x.name === 'From A')!.id);
    expect(stored().map((x) => x.name)).toEqual(['From B']);
    expect(a.templates.map((x) => x.name)).toEqual(['From B']);
  });

  it('one entry the parser rejects is skipped alone, and kept in storage through a save', async () => {
    const bad = { id: 'tbad', name: 'Broken', savedAt: '', doc: JSON.stringify({ kind: 'stabileo.combinationRules', rules: [{ terms: [null] }] }) };
    mem.set(KEY, JSON.stringify([entry('t1', 'Good', 1.2), bad, 'not an entry']));
    const lib = await tab();
    expect(lib.templates.map((x) => x.name)).toEqual(['Good']);
    expect(lib.save('New', rules(1.4))).toBe(true);
    const names = stored().map((x) => (x as { name?: string }).name);
    expect(names).toContain('Good');
    expect(names).toContain('Broken');
    expect(names).toContain('New');
  });

  it('two saves in one millisecond get two ids', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const lib = await tab();
      lib.save('One', rules(1.2));
      lib.save('Two', rules(1.4));
      const ids = lib.templates.map((x) => x.id);
      expect(new Set(ids).size).toBe(2);
    } finally { vi.restoreAllMocks(); }
  });
});
