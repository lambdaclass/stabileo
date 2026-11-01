import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRouteSizes } from './research-route-budget.mjs';

test('unchanged routes and small build noise pass', () => {
  compareRouteSizes({ '/en/': 1000, '/app/basic': 2000 }, { '/en/': 1000, '/app/basic': 2128 });
});
test('real landing or app growth fails', () => {
  for (const route of ['/en/', '/app/basic']) {
    const baseline = { '/en/': 1000, '/app/basic': 2000 };
    assert.throws(() => compareRouteSizes(baseline, { ...baseline, [route]: baseline[route] + 129 }), /grew/);
  }
});
test('missing and non-finite measurements fail', () => {
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, {}), /coverage/);
  assert.throws(() => compareRouteSizes({ '/en/': 1000 }, { '/en/': NaN }), /grew/);
});
