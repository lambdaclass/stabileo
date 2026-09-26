/**
 * Placement: the transform the ghost shows is the one the commit applies, welds are what the
 * preview said, the model's supports win on a weld, and a placement is one undo step that redo
 * repeats with the same ids. The clipboard carries a fragment into another project by definition.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { placementStore } from '../placement.svelte';
import { copySelection, cutSelection, paste } from '../model-clipboard';
import { detach, fragmentOf } from '../../model/edit/fragment';
import { fragmentFromCode, fragmentToCode } from '../../model/edit/fragment-code';

beforeEach(() => { placementStore.cancel(); modelStore.clear(); historyStore.clear(); uiStore.clearSelection(); });

/** A 4 m cantilever along X from (0,0,0), fixed at its root, with a load at its tip. */
function cantilever() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d' as never);
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
  return { a, b, e };
}
const pos = (id: number) => { const n = modelStore.nodes.get(id)!; return [n.x, n.y, n.z ?? 0].map((v) => Math.round(v * 1e9) / 1e9); };

describe('placing a fragment', () => {
  it('rotates about the anchor and lands the anchor on the target', () => {
    const { a, b, e } = cantilever();
    const frag = detach(fragmentOf({ nodes: [], elements: [e] }, { withLoads: true, withSupports: true }));
    placementStore.start({ fragment: frag, label: 'test' });
    expect(placementStore.anchor).toEqual([0, 0, 0]);
    placementStore.rotate(90);
    placementStore.setTarget([10, 0, 3]);
    const r = placementStore.commit()!;
    expect(r.nodes).toHaveLength(2);
    expect(pos(r.nodes[0]!)).toEqual([10, 0, 3]);
    expect(pos(r.nodes[1]!)).toEqual([10, 4, 3]);
    expect(placementStore.active).toBe(false);
    // The copy is selected; the originals are untouched.
    expect([...uiStore.selectedElements]).toEqual(r.elements);
    expect(pos(a)).toEqual([0, 0, 0]);
    expect(pos(b)).toEqual([4, 0, 0]);
  });

  it('Tab moves the anchor to the next point, mirror flips across it', () => {
    const { e } = cantilever();
    const frag = detach(fragmentOf({ nodes: [], elements: [e] }));
    placementStore.start({ fragment: frag, label: 'test' });
    placementStore.cycleAnchor();
    expect(placementStore.anchor).toEqual([4, 0, 0]);
    placementStore.mirror();
    placementStore.setTarget([20, 0, 0]);
    const r = placementStore.commit()!;
    expect(r.nodes.map(pos)).toEqual([[24, 0, 0], [20, 0, 0]]);
  });

  it('welds where the preview says, and keeps the model support there', () => {
    const { e } = cantilever();
    const frag = detach(fragmentOf({ nodes: [], elements: [e] }, { withSupports: true }));
    placementStore.start({ fragment: frag, label: 'test' });
    // Root of the copy on the tip of the original: one weld, and the copy's fixed support is not
    // added on top of whatever the tip has.
    placementStore.setTarget([4, 0, 0]);
    const preview = placementStore.mergePreview();
    expect(preview.welds).toEqual([[4, 0, 0]]);
    expect(preview.supportKept).toBe(1);
    const before = modelStore.supports.size;
    const r = placementStore.commit()!;
    expect(r.welded).toBe(1);
    expect(r.supportKept).toBe(1);
    expect(modelStore.supports.size).toBe(before);
  });

  it('is one undo step that restores the selection, and redo gives the same ids', () => {
    const { a, e } = cantilever();
    uiStore.setSelection(new Set([a]), new Set());
    const frag = detach(fragmentOf({ nodes: [], elements: [e] }));
    const nodes0 = modelStore.nodes.size, undo0 = historyStore.undoCount;
    placementStore.start({ fragment: frag, label: 'test' });
    placementStore.setTarget([0, 5, 0]);
    // Moving the ghost touches neither the model nor the history.
    expect(modelStore.nodes.size).toBe(nodes0);
    expect(historyStore.undoCount).toBe(undo0);
    const r = placementStore.commit()!;
    expect(historyStore.undoCount).toBe(undo0 + 1);
    historyStore.undo();
    expect(modelStore.nodes.size).toBe(nodes0);
    expect([...uiStore.selectedNodes]).toEqual([a]);
    historyStore.redo();
    expect([...modelStore.nodes.keys()].filter((id) => r.nodes.includes(id))).toEqual(r.nodes);
    expect([...uiStore.selectedElements]).toEqual(r.elements);
  });

  it('Shift keeps placing: each copy is its own undo step', () => {
    const { e } = cantilever();
    placementStore.start({ fragment: detach(fragmentOf({ nodes: [], elements: [e] })), label: 'test' });
    const undo0 = historyStore.undoCount;
    placementStore.setTarget([0, 5, 0]); placementStore.commit(true);
    placementStore.setTarget([0, 10, 0]); placementStore.commit(true);
    expect(placementStore.active).toBe(true);
    expect(historyStore.undoCount).toBe(undo0 + 2);
    expect(modelStore.elements.size).toBe(3);
  });

  it('move mode moves the originals instead of copying', () => {
    const { a, b, e } = cantilever();
    const set = { nodes: [], elements: [e] };
    placementStore.start({ fragment: detach(fragmentOf(set)), label: 'move', mode: 'move', moveSet: set });
    placementStore.setTarget([1, 1, 0]);
    placementStore.commit();
    expect(pos(a)).toEqual([1, 1, 0]);
    expect(pos(b)).toEqual([5, 1, 0]);
    expect(modelStore.elements.size).toBe(1);
  });
});

describe('the clipboard', () => {
  it('model code round-trips a fragment', () => {
    const { e } = cantilever();
    const frag = detach(fragmentOf({ nodes: [], elements: [e] }, { withLoads: true, withSupports: true }));
    const back = fragmentFromCode(fragmentToCode(frag))!;
    expect(back.nodes).toEqual(frag.nodes);
    expect(back.elements.map((x) => [x.nodeI, x.nodeJ, x.sectionId])).toEqual(frag.elements.map((x) => [x.nodeI, x.nodeJ, x.sectionId]));
    expect(back.loads).toHaveLength(1);
    expect(back.supports).toHaveLength(1);
    expect(fragmentFromCode('not model code')).toBeNull();
  });

  it('pastes into another project with its section, support and load', () => {
    const { e } = cantilever();
    modelStore.updateSection(1, { name: 'Viga copiada' } as never);
    uiStore.setSelection(new Set(), new Set([e]));
    expect(copySelection()).toBe(true);
    modelStore.clear();
    expect(paste(true)).toBe(true);
    expect(modelStore.elements.size).toBe(1);
    expect(modelStore.supports.size).toBe(1);
    expect(modelStore.loads).toHaveLength(1);
    const el = [...modelStore.elements.values()][0]!;
    expect(modelStore.sections.get(el.sectionId)?.name).toBe('Viga copiada');
  });

  it('cut removes the members and the nodes nothing else uses, in one step', () => {
    const { e } = cantilever();
    uiStore.setSelection(new Set(), new Set([e]));
    const undo0 = historyStore.undoCount;
    expect(cutSelection()).toBe(true);
    expect(modelStore.elements.size).toBe(0);
    expect(modelStore.nodes.size).toBe(0);
    expect(historyStore.undoCount).toBe(undo0 + 1);
    paste(false);
    expect(placementStore.active).toBe(true);
  });
});
