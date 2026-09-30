import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { explainedSteps, methodContext } from '../explained-steps.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  explainedSteps.close();
  uiStore.analysisMode = '2d';
  uiStore.includeSelfWeight = false;
});

it('marks the document stale in either direction when self-weight changes and refreshes the snapshot', () => {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
  modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed');
  modelStore.addNodalLoad(b, 0, -10, 0);
  explainedSteps.openMethod('virtualWork');
  expect(explainedSteps.error).toBeNull();
  expect(explainedSteps.doc).not.toBeNull();
  expect(explainedSteps.stale).toBe(false);
  const originalDoc = JSON.stringify(explainedSteps.doc);
  const version = modelStore.modelVersion;
  const without = methodContext()!.ref!.displacements.get(b)!.uz;

  uiStore.includeSelfWeight = true;
  expect(modelStore.modelVersion).toBe(version);
  expect(methodContext()!.ref!.displacements.get(b)!.uz).not.toBe(without);
  expect(explainedSteps.stale).toBe(true);
  expect(JSON.stringify(explainedSteps.doc)).toBe(originalDoc);
  uiStore.includeSelfWeight = false;
  expect(explainedSteps.stale).toBe(false);
  uiStore.includeSelfWeight = true;
  explainedSteps.refresh();
  expect(explainedSteps.error).toBeNull();
  expect(explainedSteps.stale).toBe(false);
  expect(JSON.stringify(explainedSteps.doc)).not.toBe(originalDoc);

  uiStore.includeSelfWeight = false;
  expect(explainedSteps.stale).toBe(true);
  explainedSteps.refresh();
  expect(explainedSteps.stale).toBe(false);
  expect(JSON.stringify(explainedSteps.doc)).toBe(originalDoc);
  explainedSteps.close();
  uiStore.includeSelfWeight = true;
  expect(explainedSteps.stale).toBe(false);
});
