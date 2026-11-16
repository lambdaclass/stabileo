import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const fixture = `
  import { mount, unmount } from 'svelte';
  import Calculator from './src/components/tools/CalculatorTool.svelte';
  import Batch from './src/components/tools/BatchTool.svelte';
  import { EXAMPLE, TOOL_IDS } from './src/components/tools/calculators';
  import { DEFAULT_BATCH, BATCH_IDS } from './src/components/tools/batch';
  import { serializePrerenderedResult } from './src/components/tools/prerendered-result';
  window.tools = [...TOOL_IDS.map(id => ['calculator', id]), ...BATCH_IDS.map(id => ['batch', id])];
  window.pending = [];
  window.started = [];
  window.answer = (value) => ({ value, x: 0, warnings: [], difference: 0, absolute: false,
    charts: { deflection: [], shear: [], moment: [] }, maxima: { shear: [0, value], moment: [0, value] },
    modes: [{ frequency: value, displacements: [] }], maximum: [0, value / (window.defaults?.load ?? 1)], influence: [], shapes: [], maxDeflection: value, maxMoment: value, sagging: value, hogging: value,
    comparisons: [{ engine: value, reference: value, label: 'tools.deflection', unit: 'm', difference: 0 }],
    linear: { reactions: [], elementForces: [], structuredDiagnostics: [] },
    model: { nodes: new Map(), elements: new Map(), supports: new Map(), materials: new Map(), sections: new Map(), loads: [] } });
  window.start = (kind, cache, requestedId) => {
    const calculator = kind === 'calculator';
    const id = requestedId ?? (calculator ? 'simply-supported-beam' : 'portal-frame');
    const params = calculator ? EXAMPLE : DEFAULT_BATCH;
    window.defaults = params;
    if (cache) {
      const script = document.createElement('script');
      script.type = 'application/json';
      script.dataset.prerenderedResult = id;
      script.textContent = serializePrerenderedResult({ ...params, e: params.e + 1 }, window.answer(202));
      document.head.appendChild(script);
    }
    window.defaults = params;
    window.instance = mount(calculator ? Calculator : Batch, { target: document.body, props: { id } });
  };
  window.finish = async (failed = false, value = 101) => {
    const next = window.pending.shift();
    if (failed) next.reject(new Error('late failure')); else next.resolve(window.answer(value));
    await new Promise(resolve => requestAnimationFrame(resolve));
  };
  window.dispose = () => unmount(window.instance);
`;

test('known wrong result: #2099 — tool completions belong to the current inputs', async t => {
  const built = await build({
    root,
    plugins: [{
      name: 'tool-current-result-fixture', enforce: 'pre',
      resolveId(id, importer) {
        if (id === 'tool-current-result-fixture') return '\0tool-current-result-fixture';
        if (importer?.endsWith('Tool.svelte') && ['./solve', './batch-solve'].includes(id)) return '\0deferred-tool-solve';
        if (importer?.endsWith('Tool.svelte') && id === './share') return '\0tool-share';
        if (importer?.endsWith('Tool.svelte') && id === './figures/FigureBoard.svelte') return resolve(root, 'scripts/tests/.empty-tool-figure-2099.svelte');
      },
      load(id) {
        if (id === '\0tool-current-result-fixture') return fixture.replaceAll("from './src/", `from '${root}/src/`);
        if (id.endsWith('/.empty-tool-figure-2099.svelte')) return '<div></div>';
        if (id === '\0tool-share') return 'export const editorUrl = () => "#editor";';
        if (id === '\0deferred-tool-solve') return `
          const solve = (id, values) => new Promise((resolve, reject) => { window.started.push({id, values}); window.pending.push({resolve, reject}); });
          export { solve as calculate, solve as calculateBatch };
        `;
      },
    }],
    build: { write: false, rollupOptions: { input: 'tool-current-result-fixture' } },
    logLevel: 'silent',
  });
  const files = new Map(built.output.map(item => [item.fileName, item.type === 'chunk' ? item.code : item.source]));
  const entry = built.output.find(item => item.type === 'chunk' && item.isEntry).fileName;
  const browser = await chromium.launch({ headless: true });
  try {
    async function open() {
      const page = await browser.newPage();
      await page.route('http://tool.test/**', route => {
        const path = new URL(route.request().url()).pathname.slice(1);
        return route.fulfill({ contentType: path ? 'text/javascript' : 'text/html', body: path ? files.get(path) ?? '' : `<script type="module" src="/${entry}"></script>` });
      });
      await page.goto('http://tool.test/');
      await page.waitForFunction(() => !!window.start);
      return page;
    }
    const index = await open();
    const tools = await index.evaluate(() => window.tools);
    await index.close();
    for (const [kind, id] of tools) {
      for (const failed of [false, true]) {
        await t.test(`${id}: cached B survives late ${failed ? 'failure' : 'success'} for A`, async () => {
          const page = await open();
          try {
            await page.evaluate(([kind, id]) => window.start(kind, true, id), [kind, id]);
            await page.waitForFunction(() => window.pending.length === 1);
            await page.locator('[data-testid="e"]').fill(String(await page.evaluate(() => window.defaults.e + 1)));
            await page.waitForFunction(() => document.querySelector('[data-testid="engine-value"]')?.textContent.includes('202'));
            await page.evaluate(failed => window.finish(failed), failed);
            assert.match(await page.evaluate(() => document.querySelector('[data-testid="engine-value"]')?.textContent ?? ''), /202/);
            assert.equal(await page.locator('[data-testid="tool-results"]').getAttribute('aria-busy'), 'false');
            assert.equal(await page.locator('[role="alert"]').count(), 0);
          } finally { await page.close(); }
        });
      }
      await t.test(`${id}: uncached B waits for its own answer after late A`, async () => {
        const page = await open();
        try {
          await page.evaluate(([kind, id]) => window.start(kind, false, id), [kind, id]);
          await page.waitForFunction(() => window.pending.length === 1);
          await page.locator('[data-testid="e"]').fill(String(await page.evaluate(() => window.defaults.e + 2)));
          await page.evaluate(() => window.finish());
          await page.waitForFunction(() => window.started.length === 2);
          assert.equal(await page.locator('[data-testid="tool-results"]').getAttribute('aria-busy'), 'true');
          assert.equal(await page.locator('[data-testid="engine-value"]').count(), 0);
          await page.evaluate(() => window.finish(false, 303));
          await page.waitForFunction(() => document.querySelector('[data-testid="engine-value"]')?.textContent.includes('303'));
          assert.equal(await page.locator('[data-testid="tool-results"]').getAttribute('aria-busy'), 'false');
          assert.equal(await page.locator('[role="alert"]').count(), 0);
        } finally { await page.close(); }
      });
      await t.test(`${id}: a current error is shown and cached B recovers`, async () => {
        const page = await open();
        try {
          await page.evaluate(([kind, id]) => window.start(kind, true, id), [kind, id]);
          await page.waitForFunction(() => window.pending.length === 1);
          await page.evaluate(() => window.finish(true));
          await page.waitForSelector('[role="alert"]');
          assert.equal(await page.locator('[data-testid="tool-results"]').getAttribute('aria-busy'), 'true');
          await page.locator('[data-testid="e"]').fill(String(await page.evaluate(() => window.defaults.e + 1)));
          await page.waitForFunction(() => document.querySelector('[data-testid="engine-value"]')?.textContent.includes('202'));
          assert.equal(await page.locator('[data-testid="tool-results"]').getAttribute('aria-busy'), 'false');
          assert.equal(await page.locator('[role="alert"]').count(), 0);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
});
