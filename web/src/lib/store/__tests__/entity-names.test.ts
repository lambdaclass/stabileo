/**
 * A name on a node or a member: kept in the file, read from a workbook, shown by the labels,
 * carried through a move, and undone as one step that leaves the analysis standing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import '../index';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { memberLabelText, nodeLabelText } from '../view-state.svelte';
import { parseWorkbook } from '../../excel-import/parse';
import { loadFixture } from '../../templates/load-fixture';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function frame() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  return { a, b, e };
}

describe('names on nodes and members', () => {
  it('kept by a snapshot and given back by a restore; a file without names still opens', () => {
    const { a, e } = frame();
    modelStore.renameNode(a, '  A1 ');
    modelStore.renameElement(e, 'V101');
    const snap = modelStore.snapshot();
    expect((snap.nodes.find(([id]) => id === a)![1] as { name?: string }).name).toBe('A1');
    expect((snap.elements.find(([id]) => id === e)![1] as { name?: string }).name).toBe('V101');
    modelStore.clear();
    modelStore.restore(snap);
    expect(modelStore.nodes.get(a)!.name).toBe('A1');
    expect(modelStore.elements.get(e)!.name).toBe('V101');

    // No names in it: nothing to read, nothing breaks.
    const bare = JSON.parse(JSON.stringify(snap));
    for (const [, n] of bare.nodes) delete n.name;
    for (const [, el] of bare.elements) delete el.name;
    modelStore.restore(bare);
    expect(modelStore.nodes.get(a)!.name).toBeUndefined();
  });

  it('an empty name takes it away; a move keeps it', () => {
    const { a } = frame();
    modelStore.renameNode(a, 'A1');
    modelStore.updateNode(a, 1, 0, 0);
    expect(modelStore.nodes.get(a)).toMatchObject({ x: 1, name: 'A1' });
    modelStore.renameNode(a, '   ');
    expect('name' in modelStore.nodes.get(a)!).toBe(false);
  });

  it('is one undo step that does not retire the results', () => {
    const { e } = frame();
    historyStore.clear();
    const version = modelStore.modelVersion;
    modelStore.renameElement(e, 'V1');
    expect(modelStore.modelVersion).toBe(version);
    expect(historyStore.canUndo).toBe(true);
    historyStore.undo();
    expect(modelStore.elements.get(e)!.name).toBeUndefined();
    expect(modelStore.modelVersion).toBe(version);
    historyStore.redo();
    expect(modelStore.elements.get(e)!.name).toBe('V1');
  });

  it('labels read the name when asked for names, and the number otherwise', () => {
    const none = new Map<number, { name: string }>();
    expect(memberLabelText('name', { id: 3, sectionId: 1, materialId: 1, name: 'V3' }, none, none)).toBe('V3');
    expect(memberLabelText('name', { id: 4, sectionId: 1, materialId: 1 }, none, none)).toBe('4');
    expect(memberLabelText('id', { id: 3, sectionId: 1, materialId: 1, name: 'V3' }, none, none)).toBe('3');
    expect(nodeLabelText('name', { id: 7, name: 'A1' })).toBe('A1');
    expect(nodeLabelText('name', { id: 8 })).toBe('8');
    expect(nodeLabelText('section', { id: 7, name: 'A1' })).toBe('7');
  });

  it('a workbook names nodes and members, and the loader keeps the names', () => {
    const parsed = parseWorkbook({
      Nodes: [['id', 'x [m]', 'y [m]', 'z [m]', 'name'], [1, 0, 0, 0, 'A1'], [2, 6, 0, 0, '']],
      Materials: [['id', 'name', 'E [MPa]', 'nu'], [1, 'H-25', 25000, 0.2]],
      Sections: [['id', 'name', 'b [m]', 'h [m]'], [1, 'V', 0.2, 0.4]],
      Members: [['id', 'type', 'nodeI', 'nodeJ', 'material', 'section', 'name'], [1, 'frame', 1, 2, 1, 1, 'V101']],
    });
    expect(parsed.model.nodes[0]).toMatchObject({ id: 1, name: 'A1' });
    expect('name' in parsed.model.nodes[1]!).toBe(false);
    expect(parsed.model.elements[0]).toMatchObject({ id: 1, name: 'V101' });
    modelStore.bulkMutate(() => loadFixture(parsed.model as never, modelStore.fixtureApi() as never));
    expect([...modelStore.nodes.values()].map((n) => n.name)).toContain('A1');
    expect([...modelStore.elements.values()][0]!.name).toBe('V101');
  });
});
