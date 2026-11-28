import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withComponent } from './component-browser-fixture.mjs';

const script = `
import { mount } from 'svelte';
import '/src/lib/i18n/full-dictionaries.ts';
import Panel from '/src/components/pro/plates/PlatePanel.svelte';
import Slabs from '/src/components/pro/building/BuildingSlabs.svelte';
import { modelStore, uiStore } from '/src/lib/store/index.ts';
import { applyPlateMeshes, createPlate, planPlateMesh, plateShellKeys } from '/src/lib/store/physical-plates.ts';
import { initSolver } from '/src/lib/engine/wasm-solver.ts';
import { ensureLocale, setLocale } from '/src/lib/i18n/store.svelte.ts';
await initSolver();
await ensureLocale('en');
setLocale('en');
modelStore.clear();
uiStore.analysisMode = 'pro';
const ids = [0, 8].map(x => {
  const outline = [[x, 0], [x+4, 0], [x+4, 4], [x, 4]].map(([px, py]) => modelStore.addNode(px, py, 0));
  const {id} = createPlate({ name: 'P' + x, outline, materialId: 1, thickness: .2, mesh: { size: 1, element: 'quad', followMembers: false } });
  if (applyPlateMeshes([planPlateMesh(id)]).plates !== 1) throw Error('mesh');
  return id;
});
const last = plateShellKeys(ids[1]).at(-1);
modelStore.addSurfaceLoad3D(Number(last.slice(1)), -2, 1);
uiStore.selectPlates(ids);
const slabs = location.search.includes('slabs');
mount(slabs ? Slabs : Panel, { target: document.body, props: slabs ? { report() {} } : {} });
window.meshState = () => ({ keys: ids.map(plateShellKeys), loads: modelStore.loads.map(l => l.data.id) });
`;

for (const mode of ['production', 'test']) {
  test(`known wrong result: #2461 ${mode} mesh removal reports a refusal and leaves both panels intact`, async () => {
    await withComponent(mode, script, async (page, url) => {
      for (const slabs of mode === 'test' ? [false, true] : [false]) {
        const failed = page.waitForEvent('pageerror').then(error => { throw error; });
        await page.goto(url + (slabs ? '?slabs' : ''));
        const clear = page.getByTestId(slabs ? 'building-slabs-simplify' : 'plate-mesh-clear');
        await Promise.race([clear.waitFor(), failed]);
        const original = await page.evaluate(() => window.meshState());
        await clear.click();
        assert.deepEqual(await page.evaluate(() => window.meshState()), original);
        assert.match(await (slabs ? page.getByRole('status') : page.getByTestId('plate-message')).innerText(), /P8.*load/i);
      }
    });
  });
}
