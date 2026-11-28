import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { tabManager } from '../tabs.svelte';
import type { ModelSnapshot } from '../history.svelte';
import {
  basicCopySnapshot, basicSelfWeight, currentWorkspace, enterPlane, enterPro, enterSpace,
  leaveProInPlace, moveCutToNewTab, needsBasicCopy, openBasicCopy, proOnlyContent,
} from '../workspace-switch';
import { sliceAt } from '../switch-2d';

function portal2D() {
  modelStore.addNode(0, 0);
  modelStore.addNode(0, 4);
  modelStore.addNode(6, 4);
  modelStore.addNode(6, 0);
  modelStore.addElement(1, 2, 'frame');
  modelStore.addElement(2, 3, 'frame');
  modelStore.addElement(3, 4, 'frame');
  modelStore.addSupport(1, 'fixed');
  modelStore.addSupport(4, 'fixed');
}

const geometry = () => ({
  nodes: [...modelStore.nodes.values()].map((n) => [n.x, n.y, n.z ?? 0]),
  elements: [...modelStore.elements.values()].map((e) => [e.nodeI, e.nodeJ]),
  supports: modelStore.supports.size,
});

describe('one model, three ways of working on it', () => {
  beforeEach(() => {
    tabManager.init();
    uiStore.analysisMode = '2d';
    modelStore.clear();
  });

  it('goes up from 2D to 3D to PRO and back down without touching the model', () => {
    portal2D();
    const before = geometry();
    expect(currentWorkspace()).toBe('plane');

    enterSpace();
    expect(currentWorkspace()).toBe('space');
    enterPro();
    expect(currentWorkspace()).toBe('pro');
    expect(geometry()).toEqual(before);
    expect(needsBasicCopy()).toBe(false);

    leaveProInPlace();
    expect(currentWorkspace()).toBe('space');
    expect(enterPlane()).toBe('done');
    expect(currentWorkspace()).toBe('plane');
    expect(geometry()).toEqual(before);
  });

  it('gives an empty model PRO’s material pair, and leaves a model with members as it is', () => {
    enterPro();
    expect(modelStore.materials.size).toBeGreaterThan(1);
    modelStore.clear();
    uiStore.analysisMode = '2d';
    portal2D();
    const materials = modelStore.materials.size;
    enterPro();
    expect(modelStore.materials.size).toBe(materials);
  });
});

describe('what PRO holds that Basic computes differently', () => {
  beforeEach(() => {
    tabManager.init();
    uiStore.analysisMode = 'pro';
    modelStore.clear();
  });

  it('reads a plain gravity rule as Basic’s toggle, and anything else as a difference', () => {
    expect(basicSelfWeight([])).toEqual({ on: false, caseId: null });
    expect(basicSelfWeight([{ caseId: 2, direction: 'Z', factor: -1 }])).toEqual({ on: true, caseId: 2 });
    expect(basicSelfWeight([{ caseId: 2, direction: 'Z', factor: -1, groupId: 1 }])).toBeNull();
    expect(basicSelfWeight([{ caseId: 2, direction: 'X', factor: 1 }])).toBeNull();
    expect(basicSelfWeight([{ caseId: 1, direction: 'Z', factor: -1 }, { caseId: 2, direction: 'Z', factor: -1 }])).toBeNull();
  });

  it('counts shells and constraints, and asks for a copy when there are any', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const c = modelStore.addNode(4, 4, 0), d = modelStore.addNode(0, 4, 0);
    modelStore.addQuad([a, b, c, d], 1, 0.2);
    expect(proOnlyContent().shells).toBe(1);
    expect(needsBasicCopy()).toBe(true);
  });

  it('copies the model without shells, their loads, constraints or a PRO self-weight rule', () => {
    const snap: ModelSnapshot = {
      ...modelStore.snapshot(),
      plates: [[1, { id: 1, nodes: [1, 2, 3], materialId: 1, thickness: 0.2 }]],
      quads: [[1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2 }]],
      constraints: [{ type: 'rigidDiaphragm' }],
      loads: [
        { type: 'surface3d', data: { quadId: 1, q: -2 } },
        { type: 'nodal3d', data: { nodeId: 1, fz: -10 } },
      ],
      groups: [[1, { id: 1, name: 'slab', kind: 'custom', origin: 'user', members: { elements: [3], quads: [1] } }]],
      analysis: { selfWeight: [{ caseId: 1, direction: 'Z', factor: -1, groupId: 1 }] },
    };
    const copy = basicCopySnapshot(snap);
    expect(copy.plates).toEqual([]);
    expect(copy.quads).toEqual([]);
    expect(copy.constraints).toEqual([]);
    expect(copy.loads.map((l) => l.type)).toEqual(['nodal3d']);
    expect(copy.groups?.[0]?.[1].members).toEqual({ elements: [3], plates: undefined, quads: undefined });
    expect(copy.analysis).toBeUndefined();
  });

  it('opens the copy in a new tab and leaves the PRO tab as it was', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const c = modelStore.addNode(4, 4, 0), d = modelStore.addNode(0, 4, 0);
    modelStore.addQuad([a, b, c, d], 1, 0.2);
    const tabsBefore = tabManager.tabs.length;
    const proTab = tabManager.activeTabId;

    openBasicCopy('Basic');
    expect(tabManager.tabs.length).toBe(tabsBefore + 1);
    expect(tabManager.activeTabId).not.toBe(proTab);
    expect(currentWorkspace()).toBe('space');
    expect(modelStore.quads.size).toBe(0);
    expect(modelStore.nodes.size).toBe(4);

    tabManager.switchTab(proTab!);
    expect(currentWorkspace()).toBe('pro');
    expect(modelStore.quads.size).toBe(1);
  });
});

describe('a cut into the plane goes to its own tab', () => {
  beforeEach(() => {
    tabManager.init();
    uiStore.analysisMode = '3d';
    modelStore.clear();
  });

  it('keeps the space model in its tab, and the cut and its banner in the new one', () => {
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(0, 0, 3);
    modelStore.addNode(0, 5, 0);
    modelStore.addNode(0, 5, 3);
    modelStore.addElement(1, 2, 'frame');
    modelStore.addElement(3, 4, 'frame');
    modelStore.addElement(2, 4, 'frame');
    const spaceTab = tabManager.activeTabId!;

    expect(sliceAt('xz', 0).ok).toBe(true);
    moveCutToNewTab('2D');

    expect(tabManager.activeTabId).not.toBe(spaceTab);
    expect(currentWorkspace()).toBe('plane');
    expect(modelStore.elements.size).toBe(1);
    expect(uiStore.simplified2DMode).toBe(true);

    tabManager.switchTab(spaceTab);
    expect(currentWorkspace()).toBe('space');
    expect(modelStore.elements.size).toBe(3);
    expect(uiStore.simplified2DMode).toBe(false);
  });
});
