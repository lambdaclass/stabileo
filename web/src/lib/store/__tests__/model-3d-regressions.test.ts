import { beforeEach, describe, expect, it } from 'vitest';
import { historyStore, modelStore, tabManager, uiStore } from '../index';

describe('3D store regressions', () => {
  beforeEach(() => {
    historyStore.clear();
    uiStore.analysisMode = '2d';
    uiStore.viewportPresentation3D = 'native3d';
    modelStore.clear();
  });

  it('preserves local axis metadata when toggling hinges', () => {
    uiStore.analysisMode = '3d';
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(4, 0, 3);
    const elemId = modelStore.addElement(n1, n2, 'frame');

    modelStore.updateElementLocalY(elemId, 0, 0, 1);
    modelStore.rotateElementLocalAxes(elemId, 30);
    modelStore.toggleRelease(elemId, 'i', 'mz');

    const elem = modelStore.elements.get(elemId)!;
    expect(elem.releaseI.mz).toBe(true);
    expect(elem.localYx).toBe(0);
    expect(elem.localYy).toBe(0);
    expect(elem.localYz).toBe(1);
    expect(elem.rollAngle).toBe(30);
  });

  it('computes 3D element length with z offset', () => {
    uiStore.analysisMode = '3d';
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(3, 4, 5);
    const elemId = modelStore.addElement(n1, n2, 'frame');

    expect(modelStore.getElementLength(elemId)).toBeCloseTo(Math.sqrt(50), 10);
  });

  it('marks flat 2D fixtures for upright display when opened from a 3D workspace', async () => {
    uiStore.analysisMode = '3d';
    await modelStore.loadExample('cantilever');

    expect(uiStore.analysisMode).toBe('3d');
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  });

  it('uses upright XZ presentation when toggling to 3D with a flat 2D model loaded', async () => {
    // Start in 2D and load a flat 2D fixture
    uiStore.analysisMode = '2d';
    await modelStore.loadExample('cantilever');
    expect(uiStore.analysisMode).toBe('2d');

    // User clicks the 3D tab — the model is still flat 2D, so it should
    // land upright in the XZ plane, not lying flat in XY.
    uiStore.analysisMode = '3d';

    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  });

  it('clears the upright-display hint for native 3D fixtures', async () => {
    uiStore.analysisMode = '3d';
    await modelStore.loadExample('cantilever');
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');

    await modelStore.loadExample('3d-cantilever-load');
    expect(uiStore.analysisMode).toBe('3d');
    expect(uiStore.viewportPresentation3D).toBe('native3d');
  });

  it('switches back to native 3D presentation when authoring a new node in 3D', async () => {
    uiStore.analysisMode = '3d';
    await modelStore.loadExample('cantilever');
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');

    modelStore.addNode(0, 5, 0);
    await Promise.resolve();

    expect(uiStore.viewportPresentation3D).toBe('native3d');
  });

  it('restores explicit 3D presentation mode when a saved tab session is reopened', () => {
    tabManager.init();
    uiStore.analysisMode = '3d';
    uiStore.viewportPresentation3D = 'upright2dIn3d';
    tabManager.syncCurrentTab();

    const savedTabs = JSON.parse(JSON.stringify(tabManager.tabs));
    const savedActiveId = tabManager.activeTabId!;

    uiStore.viewportPresentation3D = 'native3d';
    tabManager.restoreSession(savedTabs, savedActiveId);

    expect(uiStore.analysisMode).toBe('3d');
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  });

  it('preserves local axis metadata when splitting a 3D element', () => {
    uiStore.analysisMode = '3d';
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(6, 0, 0);
    const elemId = modelStore.addElement(n1, n2, 'frame');

    modelStore.updateElementLocalY(elemId, 0, 0, 1);
    modelStore.rotateElementLocalAxes(elemId, 15);

    const result = modelStore.splitElementAtPoint(elemId, 0.5);
    expect(result).not.toBeNull();

    const elemA = modelStore.elements.get(result!.elemA)!;
    const elemB = modelStore.elements.get(result!.elemB)!;

    for (const elem of [elemA, elemB]) {
      expect(elem.localYx).toBe(0);
      expect(elem.localYy).toBe(0);
      expect(elem.localYz).toBe(1);
      expect(elem.rollAngle).toBe(15);
    }
  });
});
