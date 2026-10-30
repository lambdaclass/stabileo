/**
 * Undo and redo keep a 2D model standing in 3D. A step taken in 2D recorded the 2D workspace's
 * space view ("native"), and undoing it in 3D laid the standing model flat on X–Y.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { uiStore.analysisMode = '2d'; modelStore.clear(); historyStore.clear(); });
afterEach(() => { uiStore.analysisMode = '2d'; });

describe('undo across the 2D → 3D switch', () => {
  it('a step taken in 2D, undone and redone in 3D, leaves the model standing in X–Z', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4);
    modelStore.addElement(a, b);
    modelStore.addElement(b, c);
    expect(modelStore.elements.size).toBe(2);
    uiStore.analysisMode = '3d';
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    historyStore.undo();
    expect(modelStore.elements.size).toBe(1);
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    historyStore.redo();
    expect(modelStore.elements.size).toBe(2);
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  });

  it('a step taken in 3D after the model was rewritten in space keeps its native view', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4);
    modelStore.addElement(a, b);
    uiStore.analysisMode = '3d';
    const c = modelStore.addNode(6, 0, 4);
    modelStore.addElement(b, c);
    expect(uiStore.viewportPresentation3D).toBe('native3d');
    historyStore.undo();
    expect(uiStore.viewportPresentation3D).toBe('native3d');
  });
});
