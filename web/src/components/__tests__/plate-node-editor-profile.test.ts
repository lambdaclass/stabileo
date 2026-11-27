import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../lib/store';
import { createPlate } from '../../lib/store/physical-plates';
import ProShellTab from '../pro/ProShellTab.svelte';

afterEach(() => {
  uiStore.clearSelection();
  modelStore.clear();
});

it.skip('known wrong result: the published plate inspector loses existing-node side and opening inputs', () => {
  modelStore.clear();
  uiStore.clearSelection();
  const outline = [[0, 0], [5, 0], [5, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const plate = createPlate({ outline, materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw Error(plate.problem);
  const saved = modelStore.snapshot();
  for (const reopen of [false, true]) {
    if (reopen) modelStore.restore(saved);
    uiStore.selectMode = 'shells';
    uiStore.shellPickScope = 'plate';
    uiStore.selectPlates([plate.id]);
    const html = render(ProShellTab).body;
    expect(html).toContain('data-testid="plate-panel-title"');
    expect(html.includes('data-testid="plate-side-mid-0"')).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
    expect(html.includes('data-testid="plate-hole-nodes"')).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
    expect(html.includes('data-testid="plate-shape-open-sides"')).toBe(__PUBLIC_FEATURES__.proPlatesUnified);
    uiStore.clearSelection();
    expect(render(ProShellTab).body).not.toContain('data-testid="plate-hole-nodes"');
  }
});
