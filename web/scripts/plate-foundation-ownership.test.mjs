import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { featuresForMode } from '../config/public-features.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = `
import { mount } from 'svelte';
import Panel from '/src/components/pro/ProFoundationSprings.svelte';
import { modelStore, uiStore } from '/src/lib/store/index.ts';
import { applyPlateMeshes, applyPlateMeshesAsync, createPlate, planPlateMesh, plateShellKeys } from '/src/lib/store/physical-plates.ts';
import { serializeProject, deserializeProject } from '/src/lib/store/file.ts';
import { initSolver } from '/src/lib/engine/wasm-solver.ts';
await initSolver();
modelStore.clear();
uiStore.analysisMode = 'pro';
const nodes = [[0,0],[2,0],[2,2],[0,2]].map(([x,y]) => modelStore.addNode(x,y,0));
const plate = createPlate({ outline: nodes, materialId: 1, thickness: 0.2 });
const id = plate.id;
const first = applyPlateMeshes([planPlateMesh(id, {size: 2, element: 'quad'})]);
if (first.refused.length) throw Error(JSON.stringify(first));
for (const [i, key] of plateShellKeys(id).entries()) uiStore.selectShell(key, i > 0);
window.springState = () => [...modelStore.supports.values()].map(s => ({node: s.nodeId, kz: s.kz, owned: !!s.plateSpring, uplift: !!s.uplift}));
window.refine = async asynchronous => {
  if (asynchronous && !deserializeProject(serializeProject())) throw Error('Could not reopen the spring model');
  const plans = [planPlateMesh(id, {size: 1, element: 'quad'})];
  return asynchronous ? await applyPlateMeshesAsync(plans) : applyPlateMeshes(plans);
};
mount(Panel, {target: document.body});
`;

async function withFoundationForm(mode, script, check) {
  const path = '/foundation-fixture.js';
  const server = await createServer({
    root, mode, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'spring-ownership-fixture',
      resolveId: id => id === path ? id : null,
      load: id => id === path ? script : null,
      configureServer(vite) {
        vite.middlewares.use('/spring-ownership.html', (_request, response) => {
          response.setHeader('Content-Type', 'text/html');
          response.end('<body><script type="module" src="/foundation-fixture.js"></script></body>');
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.addInitScript(features => { globalThis.__PUBLIC_FEATURES__ = features; }, featuresForMode(mode));
    await check(page, new URL('/spring-ownership.html', server.resolvedUrls.local[0]).href);
  } finally {
    await browser?.close();
    await server.close();
  }
}

test('known wrong result: #1928 the foundation form preserves total soil stiffness after a whole plate is remeshed', async () => {
  await withFoundationForm('development', entry, async (page, url) => {
    for (const asynchronous of [false, true]) {
      await page.goto(url);
      await page.getByTestId('fs-apply').click();
      const before = await page.evaluate(() => window.springState());
      assert.equal(before.length, 4);
      const report = await page.evaluate(asynchronous => window.refine(asynchronous), asynchronous);
      assert.deepEqual(report.refused, []);
      const after = await page.evaluate(() => window.springState());
      assert.ok(after.length > before.length);
      const sum = rows => rows.reduce((total, s) => total + s.kz, 0);
      assert.equal(sum(after), sum(before));
      assert.ok(before.every(s => s.owned && s.uplift));
      assert.ok(after.every(s => s.owned && s.uplift));
    }
  });
});

const propertyLineProject = `
import { mount } from 'svelte';
import Panel from '/src/components/pro/ProFoundationModelPanel.svelte';
import { modelStore, uiStore } from '/src/lib/store/index.ts';
import { serializeProject, deserializeProject } from '/src/lib/store/file.ts';
modelStore.clear();
uiStore.analysisMode = 'pro';
for (const [x, y, side] of [[0.15, 0, 0.3], [0.25, 5, 0.5], [6, 2.5, 0.4]]) {
  const base = modelStore.addNode(x, y, 0);
  const top = modelStore.addNode(x, y, 3);
  const sec = modelStore.addSection({name: 'square', b: side, h: side, a: side ** 2, iz: side ** 4 / 12, iy: side ** 4 / 12, shape:'rect'});
  modelStore.updateElement(modelStore.addElement(base, top, 'frame'), {sectionId: sec});
  modelStore.addSupport(base, 'fixed3d');
}
modelStore.setDesignData({propertyLines: {minX: true}});
if (!deserializeProject(serializeProject())) throw Error('Could not reopen the foundation model');
window.placedAnchors = () => [...modelStore.model.footings.values()].map(f => f.anchor ?? [0, 0]);
mount(Panel, {target: document.body});
`;

for (const mode of ['production', 'development']) {
  test(`known wrong result: #1928 ${mode} footing and pile-cap placement uses the applicable property lines`, async () => {
    const sheets = featuresForMode(mode).proRcSheets;
    await withFoundationForm(mode, propertyLineProject, async (page, url) => {
      for (const kind of ['isolated', 'pileCap']) {
        for (const chooseX of [false, true]) {
          await page.goto(url);
          await page.getByTestId('foundation-kind-' + kind).click();
          const minX = page.getByTestId('foundation-line-minX');
          const initial = await minX.isChecked();
          if (chooseX) await minX.check();
          await page.getByTestId('foundation-line-maxY').check();
          await page.getByTestId('foundation-place').click();
          assert.deepEqual(await page.evaluate(() => window.placedAnchors()), [
            [sheets || chooseX ? -1 : 0, 0], [sheets ? -1 : 0, 1], [0, 0],
          ]);
          assert.equal(initial, !!sheets);
        }
      }
    });
  });
}
