/**
 * Load-boundary gates in `store/file.ts`:
 *  - a session (file or localStorage workspace) passes the same structural checks as a `.ded`;
 *  - detailing assemblies read back from storage never count as generated against THIS
 *    session's demands (`demandRevision` is a per-session counter).
 */
import { describe, expect, it, vi } from 'vitest';
import { acceptSessionTabs, deserializeProject, forgetSessionDemandRevisions, acceptAutosavePayload, loadFile, sessionPayload } from '../store/file';
import { tabManager } from '../store/tabs.svelte';
import { uiStore } from '../store/ui.svelte';
import { modelStore } from '../store/model.svelte';

function snapshot(extra: Record<string, unknown> = {}) {
  return {
    name: 'p',
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3, rho: 78.5 }]],
    sections: [[1, { id: 1, name: 'S', a: 0.01, iz: 0.001 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
    loads: [],
    nextId: { node: 3, material: 2, section: 2, element: 2, support: 2, load: 1, loadCase: 1, combination: 1 },
    ...extra,
  };
}

function assembly(demandRevision: number) {
  return {
    id: 'A1', kind: 'beamLine', label: 'A1', elementIds: [1], bars: [], marks: [], joints: [],
    conflicts: [], unsupported: [], detailingRevision: 1, demandRevision, state: 'DRAFT',
  };
}

function tab(snap: unknown, extra: Record<string, unknown> = {}) {
  return { id: 't1', name: 'Tab', modelSnapshot: snap, analysisMode: '2d', undoStack: [], redoStack: [], ...extra };
}

describe('acceptSessionTabs', () => {
  it('accepts a well-formed session', () => {
    expect(acceptSessionTabs([tab(snapshot())]).tabs).toHaveLength(1);
  });

  // Changed expectation: this used to refuse the whole session (null). All or nothing cost the
  // localStorage workspace every valid tab (App restored nothing, the next save wrote over it),
  // so the gate now refuses the tab, keeps the others and reports the refused one by name.
  it('refuses a tab whose element references a missing node, and keeps the others', () => {
    const bad = snapshot({ elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 99, materialId: 1, sectionId: 1 }]] });
    const verdict = acceptSessionTabs([tab(snapshot()), tab(bad, { id: 't2', name: 'Bad' })]);
    expect(verdict.tabs.map((t) => t.id)).toEqual(['t1']);
    expect(verdict.dropped).toEqual([{ index: 1, name: 'Bad' }]);
  });

  it('refuses malformed shapes without throwing', () => {
    expect(acceptSessionTabs([tab(snapshot({ elements: [[1, null]] }))]).tabs).toEqual([]);
    expect(acceptSessionTabs([tab(snapshot(), { analysisMode: 'nope' })]).tabs).toEqual([]);
    expect(acceptSessionTabs([null])).toEqual({ tabs: [], dropped: [{ index: 0, name: null }] });
    expect(acceptSessionTabs([])).toEqual({ tabs: [], dropped: [] });
    expect(acceptSessionTabs('x')).toEqual({ tabs: [], dropped: [] });
  });

  it('drops undo/redo stacks containing an invalid snapshot', () => {
    const [t] = acceptSessionTabs([tab(snapshot(), { undoStack: [snapshot(), { nodes: 'x' }], undoKinds: ['structural', 'structural'] })]).tabs;
    expect(t.undoStack).toEqual([]);
    expect(t.redoStack).toEqual([]);
  });

  it('marks stored detailing assemblies as stale, stacks included', () => {
    const [t] = acceptSessionTabs([tab(
      snapshot({ detailing: { version: 1, assemblies: [assembly(0)] } }),
      { undoStack: [snapshot({ detailing: { version: 1, assemblies: [assembly(2)] } })] },
    )]).tabs;
    expect((t.modelSnapshot as any).detailing.assemblies[0].demandRevision).toBe(-1);
    expect((t.undoStack[0] as any).detailing.assemblies[0].demandRevision).toBe(-1);
  });
});

describe('session file opened from disk', () => {
  const sessionFile = (tabs: unknown[]) => ({
    text: async () => JSON.stringify({ version: '1.0', type: 'session', timestamp: '', activeTabId: 't2', tabs }),
  }) as unknown as File;
  const bad = () => snapshot({ elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 99, materialId: 1, sectionId: 1 }]] });

  // The file stays on disk unchanged, so opening the valid tabs loses nothing; refusing the
  // file over one tab kept every good one out of reach. The refused tabs are named in a toast.
  it('opens the valid tabs and names the refused one', async () => {
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
    try {
      const r = await loadFile(sessionFile([tab(snapshot(), { name: 'Good' }), tab(bad(), { id: 't2', name: 'Bad' })]));
      expect(r).toEqual({ type: 'session', count: 1 });
      expect(tabManager.tabs.map((x) => x.name)).toEqual(['Good']);
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('Bad'), 'error');
    } finally {
      toast.mockRestore();
    }
  });

  it('a session with no valid tab is still refused as a format error', async () => {
    await expect(loadFile(sessionFile([tab(bad())]))).rejects.toThrow();
  });
});

describe('session payload', () => {
  // `$state.snapshot` in this plain .ts module was a ReferenceError: Guardar sesión threw and the
  // workspace was never written. The payload is now a plain copy of the tabs.
  it('serialises every tab without throwing', () => {
    tabManager.restoreSession(acceptSessionTabs([tab(snapshot(), { name: 'One' })]).tabs, 't1');
    const { content } = sessionPayload();
    expect(JSON.parse(content).tabs.map((x: { name: string }) => x.name)).toEqual(['One']);
  });
});

describe('demand revisions at the load boundaries', () => {
  it('forgetSessionDemandRevisions tolerates snapshots without detailing', () => {
    expect(() => forgetSessionDemandRevisions(undefined)).not.toThrow();
    expect(() => forgetSessionDemandRevisions({ detailing: { assemblies: 'x' } })).not.toThrow();
  });

  it('a .ded whose assembly claims the fresh-session revision opens stale', () => {
    const file = { version: '2.0', name: 'p', timestamp: '', snapshot: snapshot({ detailing: { version: 1, assemblies: [assembly(0)] } }) };
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    expect(modelStore.model.detailing?.assemblies[0]?.demandRevision).toBe(-1);
  });

  it('an autosave payload is stamped the same way', () => {
    const data = acceptAutosavePayload({ version: '2.0', name: 'p', timestamp: '', snapshot: snapshot({ detailing: { version: 1, assemblies: [assembly(0)] } }) });
    expect((data!.snapshot as any).detailing.assemblies[0].demandRevision).toBe(-1);
  });

  it('a .ded with a null element record is refused, not thrown', () => {
    const file = { version: '2.0', name: 'p', timestamp: '', snapshot: snapshot({ elements: [[1, null]] }) };
    expect(deserializeProject(JSON.stringify(file))).toBe(false);
  });
});
