import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localeBytes, measureRouteFiles } from './route-locale-bytes.mjs';
import { reviewRouteGrowth } from './research-route-budget.mjs';

const route = '/en/';
function footprint(copy, shared, includeDutch = true) {
  const chunks = new Map([['en', 1000], ...(includeDutch ? [['nl', copy + shared]] : [])]);
  return measureRouteFiles([], new Set(chunks.keys()), file => chunks.get(file), new Map([['nl', { nl: copy, it: 0 }]]));
}

function compare(before, after, limit) {
  return reviewRouteGrowth({ [route]: before.bytes }, { [route]: after.bytes }, 'true',
    { [route]: { bytes: limit, localeLimits: { it: 0, nl: limit } } },
    { [route]: before.localeSizes }, { [route]: after.localeSizes });
}

test('known wrong result: #2613 — first public payload pays for every Dutch byte', () => {
  const base = footprint(0, 0, false);
  compare(base, footprint(10, 0), 10);
  assert.throws(() => compare(base, footprint(11, 0), 10), /nl resource/);
  assert.throws(() => compare(base, footprint(1000, 0), 10), /nl resource/);
});

test('known wrong result: #2613 — shared growth in a smaller public dictionary has its own limit', () => {
  const base = footprint(900, 100);
  compare(base, footprint(900, 228), 1000);
  assert.throws(() => compare(base, footprint(900, 229), 1000), /shared/);
  assert.throws(() => compare(base, footprint(900, 600), 1000), /shared/);
});

test('known wrong result: #2613 — a binding used by application code cannot earn translation credit', () => {
  const dictionary = 'const msg="shared text"; const table={en:"Hello",nl:msg}; publish(table);';
  assert.equal(localeBytes(dictionary, ['shared.ts']).nl, Buffer.byteLength('"shared text"'));
  assert.equal(localeBytes(dictionary + 'log(msg);', ['shared.ts']).nl, 0);
});

test('known wrong result: #2613 — the shipped Dutch introduction allowance cannot renew', () => {
  const limit = 1321348;
  const app = '/app/basic';
  const check = n => reviewRouteGrowth({ [app]: limit }, { [app]: n }, 'true', undefined,
    { [app]: { it: 0, nl: limit } }, { [app]: { it: 0, nl: n } });
  check(limit);
  assert.throws(() => check(limit + 1), /nl resource/);
});

test('known wrong result: #2613 — the migration comparison obtains its meter independently of candidate files', async () => {
  const { readFileSync } = await import('node:fs');
  const script = readFileSync(new URL('../../.github/scripts/check-initial-locale-budget.sh', import.meta.url), 'utf8');
  assert.match(script, /git .*archive "\$METER_REV"/);
  assert.equal((script.match(/node "\$meter"/g) ?? []).length, 2);
});

test('known wrong result: #2613 — landing dictionary introductions pay only for the selected chunk', () => {
  const before = footprint(0, 0, false);
  const allowances = { [route]: { bytes: 5, localeLimits: { it: 0, nl: 5 }, introduction: true, publicDictionaryLimits: { nl: 10 } } };
  function check(copy, outside, shared) {
    const after = footprint(copy, shared);
    after.localeSizes.nl += outside;
    reviewRouteGrowth({ [route]: before.bytes }, { [route]: after.bytes + outside }, 'true', allowances,
      { [route]: before.localeSizes }, { [route]: after.localeSizes });
  }
  check(10, 5, 128);
  assert.throws(() => check(11, 0, 0), /nl public dictionary/);
  assert.throws(() => check(9, 6, 0), /nl resource/);
  assert.throws(() => check(10, 5, 129), /shared/);
});

test('each shipped landing dictionary is capped at its measured translated bytes', () => {
  for (const route of ['/en/', '/es/', '/pt/']) {
    for (const [locale, cap] of Object.entries({ it: 10768, nl: 10545 })) {
      const snapshot = size => measureRouteFiles([], new Map([['dictionary.js', locale]]), () => size,
        new Map([['dictionary.js', { it: 0, nl: 0, [locale]: size }]]));
      const check = size => {
        const before = snapshot(cap), after = snapshot(size);
        reviewRouteGrowth({ [route]: before.bytes }, { [route]: after.bytes }, 'true', undefined,
          { [route]: before.localeSizes }, { [route]: after.localeSizes });
      };
      check(cap);
      assert.throws(() => check(cap + 1), /public dictionary size/);
    }
  }
});
