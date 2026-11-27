import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { featuresForMode } from './public-features.mjs';

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

test.skip('known wrong result: #1928 the foundation form preserves total soil stiffness after a whole plate is remeshed', async () => {
  const path = '/spring-ownership.js';
  const server = await createServer({
    root, mode: 'development', logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'spring-ownership-fixture',
      resolveId: id => id === path ? id : null,
      load: id => id === path ? entry : null,
      configureServer(vite) {
        vite.middlewares.use('/spring-ownership.html', (_request, response) => {
          response.setHeader('Content-Type', 'text/html');
          response.end('<body><script type="module" src="/spring-ownership.js"></script></body>');
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.addInitScript(features => { globalThis.__PUBLIC_FEATURES__ = features; }, featuresForMode('development'));
    for (const asynchronous of [false, true]) {
      await page.goto(new URL('/spring-ownership.html', server.resolvedUrls.local[0]).href);
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
  } finally {
    await browser?.close();
    await server.close();
  }
});
