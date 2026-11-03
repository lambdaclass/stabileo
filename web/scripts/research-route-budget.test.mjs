import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compareRouteSizes } from './research-route-budget.mjs';

test('unchanged routes and small build noise pass', () => {
  compareRouteSizes({ '/en/': 1000, '/app/basic': 2000 }, { '/en/': 1000, '/app/basic': 2128 }, true);
});
test('real landing or app growth fails', () => {
  for (const route of ['/en/', '/app/basic']) {
    const baseline = { '/en/': 1000, '/app/basic': 2000 };
    assert.throws(() => compareRouteSizes(baseline, { ...baseline, [route]: baseline[route] + 129 }, true), /grew/);
  }
});
test('missing and non-finite measurements fail', () => {
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, {}), /coverage/);
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, { '/en/': NaN }), /grew/);
});

const shippedBudgets = JSON.parse(readFileSync(new URL('./product-route-growth-budgets.json', import.meta.url), 'utf8'));
test('every landing and app route has a 128 byte budget', () => {
  assert.deepEqual(shippedBudgets, {
    '/en/': 128, '/es/': 128, '/pt/': 128,
    '/app/basic': 128, '/app/education': 128, '/app/pro': 128,
  });
});
for (const [route, budget] of Object.entries(shippedBudgets)) {
  test(`${route} product growth passes at the budget and fails one byte over`, () => {
    compareRouteSizes({ [route]: 1000 }, { [route]: 1000 + budget }, false);
    assert.throws(() => compareRouteSizes({ [route]: 1000 }, { [route]: 1001 + budget }, false), /grew/);
    compareRouteSizes({ [route]: 1000 }, { [route]: 1128 }, true);
    assert.throws(() => compareRouteSizes({ [route]: 1000 }, { [route]: 1129 }, true), /128 byte tolerance/);
  });
}

test('isolation caps a larger product budget at 128 bytes; product mode uses the budget', () => {
  const budgets = { '/en/': 512 };
  compareRouteSizes({ '/en/': 1000 }, { '/en/': 1512 }, false, budgets);
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, { '/en/': 1513 }, false, budgets), /512 byte tolerance/);
  compareRouteSizes({ '/en/': 1000 }, { '/en/': 1128 }, true, budgets);
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, { '/en/': 1129 }, true, budgets), /128 byte tolerance/);
});
test('environment selects product budgets only when isolation is explicitly false', () => {
  for (const [mode, growth, status] of [
    ['false', 512, 0], ['false', 513, 1],
    ['true', 128, 0], ['true', 129, 1],
    [undefined, 129, 1], ['', 129, 1],
  ]) {
    const env = { ...process.env };
    delete env.RESEARCH_ISOLATION;
    if (mode !== undefined) env.RESEARCH_ISOLATION = mode;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { compareRouteSizes } from ${JSON.stringify(new URL('./research-route-budget.mjs', import.meta.url).href)};
      compareRouteSizes({ '/en/': 1000 }, { '/en/': ${1000 + growth} }, undefined, { '/en/': 512 });
    `], { env, encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    if (status) assert.match(result.stderr, /grew/);
  }
});
