import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { historyStore, modelStore, tabManager, uiStore } from '..';
import { whatIf } from '../whatif.svelte';
import { buildSolverInput3D } from '../../engine/solver-service';

const spaceNodes = () => [...buildSolverInput3D(modelStore.model)!.nodes.values()];

beforeEach(async () => {
  whatIf.abandon(); historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
  await modelStore.loadExample('portal-frame');
  uiStore.analysisMode = '3d';
  uiStore.liveCalc = true;
  vi.useFakeTimers();
});
afterEach(() => { whatIf.abandon(); vi.clearAllTimers(); vi.useRealTimers(); });

it('keeps the standing frame and loads through repeated support edits, Reset and Close', async () => {
  const nodes = spaceNodes();
  const snapshot = modelStore.snapshot();
  const supportId = [...modelStore.supports.keys()][0];
  whatIf.open();
  whatIf.setSupportType(supportId, 'fixed3d');
  vi.advanceTimersByTime(61);
  expect(spaceNodes()).toEqual(nodes);
  expect(uiStore.viewportPresentation3D).toBe('native3d');
  const loads = buildSolverInput3D(modelStore.model)!.loads;
  whatIf.setAll('e', 2);
  vi.advanceTimersByTime(61);
  expect(spaceNodes()).toEqual(nodes);
  expect(buildSolverInput3D(modelStore.model)!.loads).toEqual(loads);
  whatIf.reset();
  vi.advanceTimersByTime(61);
  expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  expect(modelStore.snapshot()).toEqual(snapshot);
  whatIf.setSupportType(supportId, 'pinned3d');
  vi.advanceTimersByTime(61);
  expect(spaceNodes()).toEqual(nodes);
  await whatIf.close();
  expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  expect(modelStore.snapshot()).toEqual(snapshot);
});

it('returns to the original presentation when a tab is left during a space support edit', () => {
  const nodes = spaceNodes();
  tabManager.init();
  const original = tabManager.activeTabId!;
  whatIf.open();
  whatIf.setSupportType([...modelStore.supports.keys()][0], 'fixed3d');
  vi.advanceTimersByTime(61);
  tabManager.createTab();
  tabManager.switchTab(original);
  expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  expect(spaceNodes()).toEqual(nodes);
});
