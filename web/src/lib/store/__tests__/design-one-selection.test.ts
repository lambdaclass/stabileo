/**
 * One selection between the model, design and the 3-D reinforcement view, per project tab.
 *
 * Design's current member used to be a selection of its own (`deskUi.selected`), the 3-D view had
 * another (`rebarWorkspace.selection`), and the model a third. Entering design did not show the
 * member selected in the model, a member deleted in the model stayed selected in the 3-D view,
 * and design's state followed the user into another project tab. These pin the one channel:
 * design reads and writes the model selection, the 3-D view takes it on opening and forwards
 * its own picks, a deletion leaves all of them, and a tab keeps its own.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { modelStore, tabManager, uiStore } from '..';
import { deskUi } from '../design-desk-ui.svelte';
import { designDrafts, type FrameDraft } from '../design-drafts.svelte';
import { rebarWorkspace } from '../rebar-workspace.svelte';
import { pruneDeletedMembers } from '../selection-prune';

/** Three members on two levels: a column 0→3, a beam at 3, a column 3→6. */
function frame(): number[] {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(5, 0, 3), d = modelStore.addNode(0, 0, 6);
  const ids = [modelStore.addElement(a, b), modelStore.addElement(b, c), modelStore.addElement(b, d)];
  modelStore.setGrid({ axes: [], levels: [{ id: 'L0', name: 'PB', z: 0 }, { id: 'L1', name: 'P1', z: 3 }, { id: 'L2', name: 'P2', z: 6 }] });
  return ids;
}

const draft = (key: string, members: number[]): FrameDraft => ({
  key, members, label: `L${key}`,
  draft: { version: 1, members, lengths: members.map(() => 5), bars: [], stirrups: [] } as unknown as FrameDraft['draft'],
  undo: [],
});

beforeEach(() => {
  deskUi.open = false;
  uiStore.nodeCreateZ = 0;
  uiStore.clearSelection();
});
afterEach(() => {
  deskUi.open = false;
  rebarWorkspace.close();
  modelStore.clear();
});

describe('design\'s current member is the model\'s selection', () => {
  it('shows the member selected in the model on entry', () => {
    const [, beam] = frame();
    uiStore.selectElement(beam!);
    deskUi.open = true;
    expect(deskUi.selected).toBe(beam);
  });

  it('selects in the model what is picked in design', () => {
    const [col] = frame();
    deskUi.open = true;
    deskUi.selected = col!;
    expect([...uiStore.selectedElements]).toEqual([col]);
  });

  it('shows the focused one of several selected members, and the first when focus left the selection', () => {
    const ids = frame();
    uiStore.setSelection(new Set(), new Set(ids), true);
    expect(deskUi.selected).toBe(Math.min(...ids));
    deskUi.selected = ids[2]!;
    // Picking one of the selected members keeps it the only one selected in the model.
    expect([...uiStore.selectedElements]).toEqual([ids[2]]);
    uiStore.setSelection(new Set(), new Set([ids[0]!, ids[1]!]), true);
    expect(deskUi.selected).toBe(Math.min(ids[0]!, ids[1]!));
  });

  it('shows nothing once the member is deleted in the model', async () => {
    const [, beam] = frame();
    deskUi.selected = beam!;
    modelStore.removeElement(beam!);
    await Promise.resolve();
    expect(deskUi.selected).toBeNull();
    expect(uiStore.selectedElements.has(beam!)).toBe(false);
  });
});

describe('the active modelling level and design\'s level', () => {
  it('a level chosen in the model is design\'s level on entry, and the default leaves «all levels»', () => {
    frame();
    deskUi.open = true;
    expect(deskUi.levelZ).toBeNull();
    deskUi.open = false;
    uiStore.nodeCreateZ = 3;
    deskUi.open = true;
    expect(deskUi.levelZ).toBe(3);
  });

  it('a level chosen in design survives a visit to the model that did not change the model\'s level', () => {
    frame();
    uiStore.nodeCreateZ = 3;
    deskUi.open = true;
    deskUi.levelZ = 6;
    deskUi.open = false;
    // Leaving writes it back: the model is on the floor design was on.
    expect(uiStore.nodeCreateZ).toBe(6);
    deskUi.open = true;
    expect(deskUi.levelZ).toBe(6);
  });
});

describe('the 3-D reinforcement view uses the same selection', () => {
  it('opens on the members selected in the model', () => {
    const [, beam] = frame();
    uiStore.selectElement(beam!);
    rebarWorkspace.openWorkspace();
    expect(rebarWorkspace.selection?.elementIds).toEqual([beam]);
    expect(rebarWorkspace.focusRequest?.elementId).toBe(beam);
  });

  it('keeps a bar of the selected member as it is', () => {
    const [, beam] = frame();
    rebarWorkspace.select({ barId: 'b7', elementIds: [beam!] });
    rebarWorkspace.close();
    rebarWorkspace.openWorkspace();
    expect(rebarWorkspace.selection?.barId).toBe('b7');
  });

  it('forwards its picks to the model, so design shows them', () => {
    const [col] = frame();
    rebarWorkspace.select({ barId: 'b1', elementIds: [col!] });
    expect([...uiStore.selectedElements]).toEqual([col]);
    expect(deskUi.selected).toBe(col);
  });

  it('drops a deleted member from its selection, history and isolation', () => {
    const [col, beam] = frame();
    rebarWorkspace.select({ elementIds: [col!] });
    rebarWorkspace.select({ elementIds: [beam!] });
    rebarWorkspace.isolate([col!, beam!]);
    modelStore.removeElement(beam!);
    pruneDeletedMembers();
    expect(rebarWorkspace.selection).toBeNull();
    expect(rebarWorkspace.history.every((s) => !s.elementIds.includes(beam!))).toBe(true);
    expect(rebarWorkspace.isolated).toEqual([col]);
  });
});

describe('drafts', () => {
  it('outlive closing design, and are dropped with a deleted member', () => {
    const [col, beam] = frame();
    designDrafts.setFrame(draft('a', [beam!]));
    designDrafts.setFrame(draft('b', [col!]));
    deskUi.open = true;
    deskUi.open = false;
    expect(designDrafts.count).toBe(2);
    modelStore.removeElement(beam!);
    pruneDeletedMembers();
    expect(designDrafts.frames.map((d) => d.key)).toEqual(['b']);
  });

  it('are said when design is left, not applied', () => {
    const [, beam] = frame();
    const before = JSON.stringify(modelStore.elements.get(beam!)?.reinforcement ?? null);
    designDrafts.setFrame(draft('a', [beam!]));
    deskUi.open = true;
    const toasts = uiStore.toasts.length;
    deskUi.open = false;
    expect(uiStore.toasts.length).toBe(toasts + 1);
    expect(JSON.stringify(modelStore.elements.get(beam!)?.reinforcement ?? null)).toBe(before);
  });
});

describe('a project tab keeps its own design state', () => {
  it('a new tab starts from the defaults; coming back restores the level, view, filter, member and drafts', () => {
    tabManager.init();
    const first = tabManager.activeTabId!;
    const [, beam] = frame();
    deskUi.open = true;
    deskUi.levelZ = 3;
    deskUi.tab = 'levels';
    deskUi.filter = 'ok';
    deskUi.selected = beam!;
    designDrafts.setFrame(draft('a', [beam!]));

    tabManager.createTab();
    expect(deskUi.levelZ).toBeNull();
    expect(deskUi.tab).toBe('plan');
    expect(deskUi.filter).toBe('all');
    expect(deskUi.selected).toBeNull();
    expect(designDrafts.count).toBe(0);
    expect(rebarWorkspace.selection).toBeNull();

    tabManager.switchTab(first);
    expect(deskUi.levelZ).toBe(3);
    expect(deskUi.tab).toBe('levels');
    expect(deskUi.filter).toBe('ok');
    expect(deskUi.selected).toBe(beam);
    expect(designDrafts.frames.map((d) => d.key)).toEqual(['a']);
  });
});
