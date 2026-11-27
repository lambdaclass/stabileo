import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FloorLoads from '../pro/ProFloorLoadSection.svelte';
import { modelStore, uiStore } from '../../lib/store';
import { applyPlateMeshes, createPlate, planPlateMeshes } from '../../lib/store/physical-plates';

afterEach(() => { uiStore.clearSelection(); modelStore.clear(); });

it.skip('known wrong result: #1928 the published floor load editor offers a slab after it has shell elements and leaves the target explicit', async () => {
  modelStore.clear();
  const ids = [0, 2].map(z => {
    const outline = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, z));
    const created = createPlate({ outline, materialId: 1, thickness: 0.15 });
    if ('problem' in created) throw Error(created.problem);
    return created.id;
  });
  const options = () => render(FloorLoads).body.split('data-testid="fl-target"')[1]!.split('</select>')[0]!;
  for (const selection of [[], ids.slice(0, 1), ids]) {
    uiStore.selectPlates(selection);
    const html = options();
    expect.soft(html).not.toContain('value="plates"');
    for (const id of ids) expect.soft(html).not.toContain(`value="g:${id}"`);
    expect(html).toContain('value="sel"');
  }
  applyPlateMeshes(await planPlateMeshes([ids[0]!], { size: 1 }));
  expect(options()).toContain(`value="g:${ids[0]}"`);
  expect(options()).not.toContain(`value="g:${ids[1]}"`);
});
