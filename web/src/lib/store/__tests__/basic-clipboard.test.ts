/**
 * Basic's copy and paste go through PRO's clipboard (`model-clipboard.ts`): what is selected and
 * nothing more, placed with a ghost, and in the right axes across the plane and space workspaces.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { placementStore } from '../placement.svelte';
import { copySelection, paste } from '../model-clipboard';
import '../index';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => {
  uiStore.analysisMode = '2d';
  modelStore.clear();
  historyStore.clear();
  placementStore.cancel();
});
afterEach(() => { placementStore.cancel(); uiStore.analysisMode = '2d'; });

/** A portal frame drawn in Basic 2D: the vertical is `y`. */
function portal() {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4);
  const e1 = modelStore.addElement(a, b), e2 = modelStore.addElement(b, c);
  return { a, b, c, e1, e2 };
}
const positions = (ids: number[]) => ids.map((id) => { const n = modelStore.nodes.get(id)!; return [n.x, n.y, n.z ?? 0]; });

describe('Basic copies what is selected', () => {
  it('nodes alone come without the members between them', () => {
    const { a, b, c } = portal();
    uiStore.setSelection(new Set([a, b, c]), new Set());
    copySelection();
    paste(false);
    expect(placementStore.active).toBe(true);
    expect(placementStore.fragment!.elements).toHaveLength(0);
    const r = placementStore.commitAt([10, 0, 0])!;
    expect(r.nodes).toHaveLength(3);
    expect(r.elements).toHaveLength(0);
    expect(modelStore.elements.size).toBe(2);
  });

  it('a selected member brings its two nodes, and the ghost lands where it is placed', () => {
    const { e1 } = portal();
    uiStore.setSelection(new Set(), new Set([e1]));
    copySelection();
    paste(false);
    const r = placementStore.commitAt([10, 2, 0])!;
    expect(r.elements).toHaveLength(1);
    expect(positions(r.nodes).sort((p, q) => p[1]! - q[1]!)).toEqual([[10, 2, 0], [10, 6, 0]]);
  });
});

describe('a copy keeps its axes across the plane and space workspaces', () => {
  it('copied in 2D and pasted in 3D, it stands in X–Z with the model, not turned onto the floor', () => {
    const { a, b, c } = portal();
    uiStore.setSelection(new Set([a, b, c]), new Set());
    copySelection();
    uiStore.analysisMode = '3d';
    uiStore.useUpright2DIn3DPresentation();
    paste(false);
    const r = placementStore.commitAt([10, 0, 0])!;
    for (const [, y] of positions([...modelStore.nodes.keys()])) expect(y).toBe(0);
    expect(positions(r.nodes).sort((p, q) => p[0]! - q[0]! || p[2]! - q[2]!)).toEqual([[10, 0, 0], [10, 0, 4], [16, 0, 4]]);
    expect(positions([b])).toEqual([[0, 0, 4]]);
  });

  it('copied in 3D standing up and pasted there, it stays standing', () => {
    const { a, b, c } = portal();
    uiStore.analysisMode = '3d';
    uiStore.useUpright2DIn3DPresentation();
    uiStore.setSelection(new Set([a, b, c]), new Set());
    copySelection();
    paste(false);
    const r = placementStore.commitAt([0, 0, 5])!;
    expect(positions(r.nodes).sort((p, q) => p[0]! - q[0]! || p[2]! - q[2]!)).toEqual([[0, 0, 5], [0, 0, 9], [6, 0, 9]]);
  });

  it('a copy from a 3D model is not pasted into a 2D one', () => {
    uiStore.analysisMode = '3d';
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 3, 2);
    uiStore.setSelection(new Set([a, b]), new Set());
    copySelection();
    uiStore.analysisMode = '2d';
    expect(paste(false)).toBe(false);
    expect(placementStore.active).toBe(false);
  });
});
