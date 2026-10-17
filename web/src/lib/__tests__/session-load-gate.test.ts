/**
 * Load-boundary gates in `store/file.ts`:
 *  - a session (file or localStorage workspace) passes the same structural checks as a `.ded`;
 *  - detailing assemblies read back from storage never count as generated against THIS
 *    session's demands (`demandRevision` is a per-session counter).
 */
import { describe, expect, it } from 'vitest';
import { acceptSessionTabs, deserializeProject, forgetSessionDemandRevisions, acceptAutosavePayload } from '../store/file';
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
    expect(acceptSessionTabs([tab(snapshot())])).toHaveLength(1);
  });

  it('refuses a tab whose element references a missing node', () => {
    const bad = snapshot({ elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 99, materialId: 1, sectionId: 1 }]] });
    expect(acceptSessionTabs([tab(snapshot()), tab(bad, { id: 't2' })])).toBeNull();
  });

  it('refuses malformed shapes without throwing', () => {
    expect(acceptSessionTabs([tab(snapshot({ elements: [[1, null]] }))])).toBeNull();
    expect(acceptSessionTabs([tab(snapshot(), { analysisMode: 'nope' })])).toBeNull();
    expect(acceptSessionTabs([null])).toBeNull();
    expect(acceptSessionTabs([])).toBeNull();
    expect(acceptSessionTabs('x')).toBeNull();
  });

  it('drops undo/redo stacks containing an invalid snapshot', () => {
    const [t] = acceptSessionTabs([tab(snapshot(), { undoStack: [snapshot(), { nodes: 'x' }], undoKinds: ['structural', 'structural'] })])!;
    expect(t.undoStack).toEqual([]);
    expect(t.redoStack).toEqual([]);
  });

  it('marks stored detailing assemblies as stale, stacks included', () => {
    const [t] = acceptSessionTabs([tab(
      snapshot({ detailing: { version: 1, assemblies: [assembly(0)] } }),
      { undoStack: [snapshot({ detailing: { version: 1, assemblies: [assembly(2)] } })] },
    )])!;
    expect((t.modelSnapshot as any).detailing.assemblies[0].demandRevision).toBe(-1);
    expect((t.undoStack[0] as any).detailing.assemblies[0].demandRevision).toBe(-1);
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
