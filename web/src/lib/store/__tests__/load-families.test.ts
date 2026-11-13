import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { regulationsStore } from '../regulations.svelte';
import { FAMILY_STACKS, LOAD_FAMILY_CHOICES, loadFamilyOfRegulations } from '../../codes/families/stacks';
import { findOption, validateStack } from '../../codes/roles';
import { sheetCode } from '../rc-sheets.svelte';

describe('choosing a family of load codes', () => {
  beforeEach(() => { modelStore.clear(); });

  it('lists only adapters of the catalogue, each for its own role and of one family per stack', () => {
    for (const f of LOAD_FAMILY_CHOICES) {
      const fams = new Set<string>();
      for (const [role, id] of Object.entries(FAMILY_STACKS[f])) {
        if (id === null || id === undefined) continue;
        const o = findOption(id);
        expect(o, `${f}: ${id}`).toBeDefined();
        expect(o!.role).toBe(role);
        fams.add(o!.family);
      }
      expect(fams.size, f).toBe(1);
    }
  });

  it('binds every load role at once, which one role at a time refuses, and the sheets follow the family', () => {
    expect(regulationsStore.requestChange('basis', 'en1990').kind).toBe('refused');
    for (const f of LOAD_FAMILY_CHOICES) {
      const r = regulationsStore.requestStack(FAMILY_STACKS[f]);
      expect(r.kind, f).toBe('needsLoadReview');
      regulationsStore.applyPending('loadRegulation');
      expect(loadFamilyOfRegulations(regulationsStore.roles)).toBe(f);
      expect(validateStack(regulationsStore.roles).problems.filter((p) => p.severity === 'error')).toEqual([]);
      for (const [role, id] of Object.entries(FAMILY_STACKS[f])) expect(regulationsStore.binding(role as never).adapterId ?? null).toBe(id ?? null);
    }
    expect(sheetCode()).toBe('ts500-2000');
    regulationsStore.requestStack(FAMILY_STACKS.uk); regulationsStore.applyPending('loadRegulation');
    expect(sheetCode()).toBe('bs-en1992-1-1');
  });

  it('puts every role back when the staged family is cancelled', () => {
    const before = JSON.stringify(regulationsStore.roles);
    regulationsStore.requestStack(FAMILY_STACKS.us);
    regulationsStore.cancelPending();
    expect(JSON.stringify(regulationsStore.roles)).toBe(before);
  });
});
