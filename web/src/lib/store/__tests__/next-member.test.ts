/**
 * The next member: what the pickers show is what is drawn, and in PRO a member is born a frame
 * (truss is a specification); Basic, which draws through the same tool without pickers, keeps
 * the model's defaults and its own frame/truss choice.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { nextMember } from '../next-member.svelte';

describe('next member', () => {
  beforeEach(async () => {
    historyStore.clear(); modelStore.clear();
    await modelStore.loadExample('3d-portal-frame');
    nextMember.materialId = null; nextMember.sectionId = null;
  });

  it('in PRO, unset, takes what the last member has, and is a frame', () => {
    uiStore.analysisMode = 'pro';
    const last = [...modelStore.elements.values()].at(-1)!;
    // A section added after the members is not what the next member takes.
    modelStore.addSection({ ...modelStore.sections.get(last.sectionId)!, name: 'Otra' } as never);
    expect(nextMember.resolvedSectionId).toBe(last.sectionId);
    const e = modelStore.elements.get(nextMember.add(1, 7, 'truss'))!;
    expect(e.sectionId).toBe(last.sectionId);
    expect(e.materialId).toBe(last.materialId);
    expect(e.type).toBe('frame');
  });

  it('in Basic, unset, leaves the member as the model makes it', () => {
    uiStore.analysisMode = '3d';
    const e = modelStore.elements.get(nextMember.add(1, 7, 'truss'))!;
    expect(e.sectionId).toBe(1);
    expect(e.materialId).toBe(1);
    expect(e.type).toBe('truss');
  });
});
