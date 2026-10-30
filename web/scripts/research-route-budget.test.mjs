import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRouteSizes, compareProductRouteSizes } from './research-route-budget.mjs';

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

test('product growth has a separate explicit budget; isolation remains strict', () => {
  const baseline = { '/en/': 1000 };
  const measured = { '/en/': 1256 };
  compareProductRouteSizes(baseline, measured, { max_growth_bytes: 256 });
  assert.throws(() => compareProductRouteSizes(baseline, measured, { max_growth_bytes: 255 }), /product growth budget/);
  assert.throws(() => compareRouteSizes(baseline, measured), /128 byte tolerance/);
});
test('product budget rejects missing measurements and invalid configuration', () => {
  assert.throws(() => compareProductRouteSizes({ '/en/': 1000 }, {}, { max_growth_bytes: 256 }), /coverage/);
  for (const allowance of [undefined, -1, NaN, Infinity, 1.5, '256']) {
    assert.throws(() => compareProductRouteSizes({}, {}, { max_growth_bytes: allowance }), /invalid/);
  }
  for (const bytes of [NaN, Infinity]) {
    assert.throws(() => compareProductRouteSizes({ '/en/': 1000 }, { '/en/': bytes }, { max_growth_bytes: 256 }), /grew/);
  }
});
