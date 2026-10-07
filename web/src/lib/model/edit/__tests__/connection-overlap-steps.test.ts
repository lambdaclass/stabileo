/**
 * The overlap question and the undo steps around it.
 *
 * "Delete" on a member just drawn over another undoes the drawing: one step, with the nodes and
 * splits the drawing made. Anything else is not the drawing's to take back:
 *  - a question asked when a file is opened or a model imported is its own step, so Ctrl+Z after
 *    "Delete" goes back to the file as it was, duplicate and all, not to before the open;
 *  - an edit in between that takes an undo step without changing the analysed model (a named
 *    view, a footing, reinforcement) leaves the version alone, and "Delete" must not undo it;
 *  - a member edited in the table onto another: the one offered for deletion is the one edited,
 *    not the other, which was there first and carries its loads.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { uiStore } from '../../../store/ui.svelte';
import { connectionPrompt } from '../../../store/connection-prompt.svelte';
import { buildProjectFile, deserializeProject } from '../../../store/file';
import { askAboutNewMember, askAboutOverlaps, askAboutOverlapsInModel } from '../connection-questions';
import { t } from '../../../i18n';
import { compactLoses } from '../../../utils/url-sharing';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => {
  uiStore.analysisMode = '2d';
  modelStore.clear(); historyStore.clear(); connectionPrompt.clear();
});

/** A beam 0→4 with its two nodes. */
function beam() {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
  return { a, b, beam: modelStore.addElement(a, b) };
}

describe('a model opened with a member doubled', () => {
  it('"Delete" is a step of its own: undo goes back to the file, not to before it was opened', () => {
    const { a, b } = beam();
    modelStore.addElement(b, a);
    const text = JSON.stringify(buildProjectFile());
    modelStore.clear(); historyStore.clear();

    expect(deserializeProject(text)).toBe(true);
    askAboutOverlapsInModel();
    expect(connectionPrompt.count).toBe(1);
    connectionPrompt.accept();
    expect(modelStore.elements.size).toBe(1);

    historyStore.undo();
    // The file as opened: both members.
    expect(modelStore.elements.size).toBe(2);
    historyStore.undo();
    expect(modelStore.elements.size).toBe(0);
  });
});

describe('a member drawn over another', () => {
  it('"Delete" right away undoes the drawing', () => {
    const { a, b } = beam();
    const drawn = modelStore.addElement(b, a);
    const steps = historyStore.undoCount;
    askAboutNewMember(drawn);
    connectionPrompt.accept();
    expect(modelStore.elements.has(drawn)).toBe(false);
    expect(modelStore.elements.size).toBe(1);
    // It took the drawing's step back rather than adding one.
    expect(historyStore.undoCount).toBe(steps - 1);
  });

  it('after an edit that takes a step without changing the model, "Delete" removes the member and keeps that edit', () => {
    const { a, b } = beam();
    const drawn = modelStore.addElement(b, a);
    askAboutNewMember(drawn);
    // A named view: undoable, and the analysed model (its version) does not change.
    const version = modelStore.modelVersion;
    modelStore.saveView('Front', { x: 0, y: -10, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(modelStore.modelVersion).toBe(version);

    connectionPrompt.accept();
    expect(modelStore.elements.has(drawn)).toBe(false);
    expect(modelStore.model.views?.map((v) => v.name)).toEqual(['Front']);
  });
});

describe('a member edited in the table onto another', () => {
  /** What ElementsTable's node cell does. */
  function editInTable(id: number, end: 'i' | 'j', nodeId: number) {
    historyStore.pushState({ notifyMutation: false });
    modelStore.updateElement(id, end === 'i' ? { nodeI: nodeId } : { nodeJ: nodeId });
    askAboutOverlaps([id]);
  }

  it('offers to delete the member edited, not the one that was there', () => {
    // Member 1 edited onto member 2, which carries the load: member 1 is the one offered.
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(0, 3);
    const first = modelStore.addElement(c, b);
    const second = modelStore.addElement(a, b);
    modelStore.addDistributedLoad(second, -10, -10);
    editInTable(first, 'i', a);
    expect(connectionPrompt.current?.accept).toBe(t('overlap.removeOne').replace('{b}', String(first)));
    connectionPrompt.accept();
    expect(modelStore.elements.has(first)).toBe(false);
    expect(modelStore.elements.has(second)).toBe(true);
    expect(modelStore.loads).toHaveLength(1);
  });

  it('the newer member edited onto the older: still the edited one', () => {
    const { b, beam: first } = beam();
    const c = modelStore.addNode(0, 3);
    const second = modelStore.addElement(c, b);
    editInTable(second, 'i', modelStore.elements.get(first)!.nodeI);
    expect(connectionPrompt.current?.accept).toBe(t('overlap.removeOne').replace('{b}', String(second)));
  });
});

describe('"Keep both"', () => {
  it('a member drawn over part of another and kept is then asked about its connections', () => {
    // A beam 0→6 and a member drawn 3→9 along it: its start lies on the beam, the beam's end on it.
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    modelStore.addElement(a, b);
    const c = modelStore.addNode(3, 0), d = modelStore.addNode(9, 0);
    const drawn = modelStore.addElement(c, d);
    askAboutNewMember(drawn);
    expect(connectionPrompt.current?.decline).toBe(t('overlap.keepBoth'));
    connectionPrompt.decline();
    // Not left floating: the connection question the overlap had held back.
    expect(connectionPrompt.current?.accept).toBe(t('connect.connect'));
    connectionPrompt.accept();
    expect(modelStore.elements.size).toBeGreaterThan(2);
  });

  it('is remembered with the model: opening it again does not ask again', () => {
    const { a, b } = beam();
    modelStore.addElement(b, a);
    let text = JSON.stringify(buildProjectFile());
    modelStore.clear(); historyStore.clear();

    deserializeProject(text);
    askAboutOverlapsInModel();
    expect(connectionPrompt.count).toBe(1);
    const steps = historyStore.undoCount, version = modelStore.modelVersion;
    connectionPrompt.decline();
    // Not an edit: no step, and the solve is not retired.
    expect(historyStore.undoCount).toBe(steps);
    expect(modelStore.modelVersion).toBe(version);

    text = JSON.stringify(buildProjectFile());
    connectionPrompt.clear();
    deserializeProject(text);
    askAboutOverlapsInModel();
    expect(connectionPrompt.count).toBe(0);
    // Another pair is still asked about.
    const c = modelStore.addNode(0, 3);
    const e1 = modelStore.addElement(a, c);
    modelStore.addElement(c, a);
    askAboutOverlapsInModel();
    expect(connectionPrompt.count).toBe(1);
    expect(connectionPrompt.current?.message).toContain(String(e1));
  });

  it('travels in a share link too', () => {
    const { a, b } = beam();
    modelStore.addElement(b, a);
    askAboutOverlapsInModel();
    connectionPrompt.decline();
    expect([...modelStore.elements.values()].some((e) => e.keptOver?.length)).toBe(true);
    // The compact link carries it, so it is not turned into a code link to keep it.
    expect(compactLoses(modelStore.snapshot())).toBe(false);
  });
});
