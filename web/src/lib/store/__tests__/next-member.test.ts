/**
 * The next member: what the pickers show is what is drawn, its ends included; and Basic,
 * which draws through the same tool without pickers, keeps the model's defaults.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { nextMember } from '../next-member.svelte';

describe('next member', () => {
  beforeEach(async () => {
    historyStore.clear(); modelStore.clear();
    await modelStore.loadExample('3d-portal-frame');
    nextMember.materialId = null; nextMember.sectionId = null;
    nextMember.endI = 'fixed'; nextMember.endJ = 'fixed';
  });

  it('in PRO, unset, takes what the last member has, and the ends asked for', () => {
    uiStore.analysisMode = 'pro';
    const last = [...modelStore.elements.values()].at(-1)!;
    // A section added after the members is not what the next member takes.
    modelStore.addSection({ ...modelStore.sections.get(last.sectionId)!, name: 'Otra' } as never);
    expect(nextMember.resolvedSectionId).toBe(last.sectionId);
    nextMember.endJ = 'pinned';
    const id = nextMember.add(1, 7, 'frame');
    const e = modelStore.elements.get(id)!;
    expect(e.sectionId).toBe(last.sectionId);
    expect(e.materialId).toBe(last.materialId);
    expect(e.releaseJ).toMatchObject({ my: true, mz: true });
    expect(e.releaseI?.my ?? false).toBe(false);
  });

  it('in Basic, unset, leaves the member as the model makes it, ends included', () => {
    uiStore.analysisMode = '3d';
    nextMember.endI = 'pinned';
    const id = nextMember.add(1, 7, 'frame');
    const e = modelStore.elements.get(id)!;
    expect(e.sectionId).toBe(1);
    expect(e.materialId).toBe(1);
    expect(e.releaseI?.my ?? false).toBe(false);
  });
});
