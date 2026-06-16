// PR [10] PART 1 — local-axis convention metadata + old-model handling.
//
// New models carry localAxisConvention='zUpStrongAxis'. Models saved before
// this metadata existed load WITHOUT it and are evaluated under the corrected
// convention (no legacy mode), surfacing a concise one-time note for 3D/PRO
// models with members.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { serializeProject, deserializeProject } from '../file';

function buildSmall3DModel() {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0, 0);
  const n2 = modelStore.addNode(0, 5, 0); // a Y-beam — the case the fix corrects
  modelStore.addElement(n1, n2, 'frame');
  modelStore.addSupport(n1, 'fixed');
  uiStore.analysisMode = 'pro';
}

describe('local-axis convention metadata', () => {
  beforeEach(() => buildSmall3DModel());
  afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '2d'; });

  it('new models snapshot with the corrected convention stamped', () => {
    expect(modelStore.snapshot().localAxisConvention).toBe('zUpStrongAxis');
  });

  it('a saved file with the metadata loads without the note', () => {
    const ded = serializeProject();
    expect(ded).toContain('zUpStrongAxis');
    const toast = vi.spyOn(uiStore, 'toast');
    expect(deserializeProject(ded)).toBe(true);
    expect(modelStore.model.localAxisConvention).toBe('zUpStrongAxis');
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/convention/i), expect.anything());
  });

  it('an old 3D file WITHOUT the metadata loads under the corrected convention + surfaces the note', () => {
    const obj = JSON.parse(serializeProject());
    delete obj.snapshot.localAxisConvention; // simulate a pre-PR save
    const toast = vi.spyOn(uiStore, 'toast');

    expect(deserializeProject(JSON.stringify(obj))).toBe(true);
    // No legacy mode: the loaded model is stamped with the corrected convention.
    expect(modelStore.model.localAxisConvention).toBe('zUpStrongAxis');
    // The review note was shown exactly once (concise, info severity).
    const calls = toast.mock.calls.filter((c) => /local-axis convention/i.test(String(c[0])));
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toBe('info');
  });

  it('an old BASIC 3D file (analysisMode "3d") WITHOUT the metadata also surfaces the note (not PRO-only)', () => {
    uiStore.analysisMode = '3d';
    const obj = JSON.parse(serializeProject());
    delete obj.snapshot.localAxisConvention;
    obj.analysisMode = '3d';
    const toast = vi.spyOn(uiStore, 'toast');
    expect(deserializeProject(JSON.stringify(obj))).toBe(true);
    expect(modelStore.model.localAxisConvention).toBe('zUpStrongAxis');
    const calls = toast.mock.calls.filter((c) => /local-axis convention/i.test(String(c[0])));
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toBe('info');
  });

  it('a 2D file without the metadata does NOT trigger the note (2D is unaffected)', () => {
    uiStore.analysisMode = '2d';
    const obj = JSON.parse(serializeProject());
    delete obj.snapshot.localAxisConvention;
    obj.analysisMode = '2d';
    const toast = vi.spyOn(uiStore, 'toast');
    expect(deserializeProject(JSON.stringify(obj))).toBe(true);
    const calls = toast.mock.calls.filter((c) => /local-axis convention/i.test(String(c[0])));
    expect(calls.length).toBe(0);
  });
});
