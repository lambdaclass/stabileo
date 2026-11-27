import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import init, { recompute } from '../../../../web/public/research-wasm/fairclough-2026/gridshell_fairclough_2026.js';

const web = new URL('../../../../web/', import.meta.url);
await init({ module_or_path: readFileSync(new URL('public/research-wasm/fairclough-2026/gridshell_fairclough_2026_bg.wasm', web)) });
const server = await createServer({ root: web.pathname, configFile: false, server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { validateLayout, paperComparison } = await server.ssrLoadModule('/src/components/research/fairclough2026/model.ts');

test('recovery at the requested weight checks both elevations and the section areas', () => {
  for (const weight of [0.5, 1.66, 1.85, 2.2]) {
    const layout = JSON.parse(recompute(weight));
    assert.equal(validateLayout(layout, weight), layout);
    const moved = structuredClone(layout);
    moved.nodes[4][2] += 1;
    assert.throws(() => validateLayout(moved, weight), /endpoint/);
    layout.curves[0][16][3] *= 2;
    assert.throws(() => validateLayout(layout, weight), /area/);
  }
});

test('a paper disagreement retains the solved volume and a failed comparison', () => {
  const weight = 1.85;
  const layout = JSON.parse(recompute(weight));
  const published = JSON.parse(readFileSync(new URL('../reference-results/published_comparison.json', import.meta.url))).checks;
  const row = published.find(r => Number(r.id.slice('table1-v5-'.length)) === weight);
  layout.volume = row.reference + 2 * row.tolerance;
  assert.equal(validateLayout(layout, weight).volume, layout.volume);
  const comparison = paperComparison(layout, weight);
  assert.equal(comparison.computed, layout.volume);
  assert.equal(comparison.passed, false);
});

const knownWrong = { skip: process.env.RUN_KNOWN_WRONG ? false : 'known wrong result: #2505' };

test('omitted weight solves the paper case and invalid explicit weights are refused', knownWrong, () => {
  assert.equal(recompute(), recompute(1.65));
  for (const weight of [NaN, Infinity, -Infinity, 0, -1, 2.5]) {
    assert.throws(() => recompute(weight), /outside/);
  }
});

for (const weight of [1.66, 1.85]) {
  for (const [name, mutate] of Object.entries({
    volume: layout => { layout.volume *= 2; },
    elevation: layout => { layout.curves[0][16][2] += 0.5; },
    plan: layout => { layout.curves[0][16][1] += 0.5; },
    equilibrium: layout => {
      const edge = layout.forces.findIndex(force => force[0] > 1e-5);
      layout.forces[edge] = [0, 0, 0];
      layout.curves.shift();
    },
  })) {
    test(`the ${weight} result rejects altered ${name}`, knownWrong, () => {
      const layout = JSON.parse(recompute(weight));
      assert.equal(validateLayout(layout, weight), layout);
      mutate(layout);
      assert.throws(() => validateLayout(layout, weight), new RegExp(name));
    });
  }
}
