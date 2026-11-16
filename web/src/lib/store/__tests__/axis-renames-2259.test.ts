import { afterEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { axesStore } from '../../axes/axes.svelte';
import { caseNameShown, combinationNameShown } from '../../axes/case-names';

afterEach(() => { axesStore.reset(); modelStore.clear(); });

it.skip('known wrong result: #2259 explicit renames compare against displayed case and combination names', () => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  axesStore.choice = { up: '+Z', right: '+Y', hand: 'left' };
  const id = modelStore.addLoadCase('Wind +X', 'W', { axisNamed: true });
  const lc = modelStore.loadCases.find(c => c.id === id)!;
  expect(caseNameShown(lc)).toBe('Wind +Y');
  modelStore.updateLoadCase(id, 'Wind +Y');
  expect(lc.axisNamed).toBe(true);
  modelStore.updateLoadCase(id, 'Wind +X');
  expect(caseNameShown(lc)).toBe('Wind +X');
  expect(lc.axisNamed).toBeUndefined();
  const cid = modelStore.addCombination('Wind +X', [], { code: 'test' } as never);
  const combo = modelStore.combinations.find(c => c.id === cid)!;
  expect(combinationNameShown(combo)).toBe('Wind +Y');
  modelStore.updateCombination(cid, { name: 'Wind +Y' });
  expect(combo.nameTyped).toBeUndefined();
  modelStore.updateCombination(cid, { name: 'Wind +X' });
  expect(combinationNameShown(combo)).toBe('Wind +X');
  expect(combo.nameTyped).toBe(true);
  axesStore.reset();
  expect(caseNameShown(lc)).toBe('Wind +X');
  expect(combinationNameShown(combo)).toBe('Wind +X');
});
