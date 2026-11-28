import { describe, it, expect, vi } from 'vitest';
import { createRecheckStore } from '../recheck.svelte';
import '../index';
import { RESULT_CHANGES } from '../../provenance/full-registry';

import { steelTruss } from './recheck-fixtures';

describe('remembered acknowledgement', () => {
  it('a notice read once is not asked again after a reload, while another project stamp still is', async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) });
    try {
      const stamp = createRecheckStore(undefined, false).capture()!;
      const project = (id: string) => ({ ...steelTruss() as object, solvedWith: { ...stamp, id, resultsVersion: 0, analyses: ['linear'] } });
      const first = createRecheckStore();
      first.openProject(project('read-once'), 'pro');
      await vi.waitFor(() => expect(first.pending).toBe(false));
      expect(first.noticeOpen).toBe(true);
      first.acknowledge();
      expect(first.noticeOpen).toBe(false);
      const afterReload = createRecheckStore();
      afterReload.openProject(project('read-once'), 'pro');
      await vi.waitFor(() => expect(afterReload.pending).toBe(false));
      expect(afterReload.noticeOpen).toBe(false);
      expect(afterReload.stale).toBe(true);
      afterReload.openProject(project('never-read'), 'pro');
      await vi.waitFor(() => expect(afterReload.pending).toBe(false));
      expect(afterReload.noticeOpen).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a change registered after the acknowledgement reopens the notice for the same stamp', async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) });
    try {
      const applicability = await import('../../provenance/applicability');
      const stamp = createRecheckStore(undefined, false).capture()!;
      const project = { ...steelTruss() as object, solvedWith: { ...stamp, id: 'file-stamp', resultsVersion: 0, analyses: ['linear'] } } as never;
      const first = createRecheckStore();
      first.openProject(project, 'pro');
      await vi.waitFor(() => expect(first.pending).toBe(false));
      const shown = first.assessment!.changes;
      expect(shown.length).toBeGreaterThan(0);
      first.acknowledge();
      expect(first.noticeOpen).toBe(false);

      const sameSet = createRecheckStore();
      sameSet.openProject(project, 'pro');
      await vi.waitFor(() => expect(sameSet.pending).toBe(false));
      expect(sameSet.noticeOpen).toBe(false);

      const extra = { ...shown[shown.length - 1], id: 'registered-later' };
      const registry = { ...RESULT_CHANGES, changes: [...RESULT_CHANGES.changes, extra] };
      const assessProject: typeof applicability.assessProject = (model, s, mode, _registry, features, loads) =>
        applicability.assessProject(model, s, mode, registry, features, loads);
      const afterUpdate = createRecheckStore(async () => ({ ...applicability, assessProject }));
      afterUpdate.openProject(project, 'pro');
      await vi.waitFor(() => expect(afterUpdate.pending).toBe(false));
      expect(afterUpdate.assessment!.changes.map((c) => c.id)).toContain('registered-later');
      expect(afterUpdate.noticeOpen).toBe(true);
      expect(afterUpdate.captureNotice()?.stamp.id).toBe('file-stamp');
      afterUpdate.acknowledge();
      expect(afterUpdate.noticeOpen).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
