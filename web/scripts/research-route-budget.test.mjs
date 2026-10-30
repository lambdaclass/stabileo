import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

for (const [route, budget] of Object.entries({
  '/en/': 128, '/es/': 128, '/pt/': 128,
  '/app/basic': 128, '/app/education': 128, '/app/pro': 128,
})) {
  test(`${route} product growth passes at the budget and fails one byte over`, () => {
    compareRouteSizes({ [route]: 1000 }, { [route]: 1000 + budget }, false);
    assert.throws(() => compareRouteSizes({ [route]: 1000 }, { [route]: 1001 + budget }, false), /grew/);
    compareRouteSizes({ [route]: 1000 }, { [route]: 1128 }, true);
    assert.throws(() => compareRouteSizes({ [route]: 1000 }, { [route]: 1129 }, true), /128 byte tolerance/);
  });
}

test('environment selects product budgets only when isolation is explicitly false', () => {
  for (const [mode, growth, status] of [
    ['false', 128, 0], ['false', 129, 1],
    ['true', 128, 0], ['true', 129, 1],
    [undefined, 129, 1], ['', 129, 1],
  ]) {
    const env = { ...process.env };
    delete env.RESEARCH_ISOLATION;
    if (mode !== undefined) env.RESEARCH_ISOLATION = mode;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { compareRouteSizes } from ${JSON.stringify(new URL('./research-route-budget.mjs', import.meta.url).href)};
      compareRouteSizes({ '/en/': 1000 }, { '/en/': ${1000 + growth} });
    `], { env, encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    if (status) assert.match(result.stderr, /grew/);
  }
});
