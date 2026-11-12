import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../production-health.mjs', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('const MODEL ='), source.indexOf('const sites ='));
const timeout = source.match(/const TIMEOUT = ([^;]+);/)[1];
const api = vm.runInNewContext(`const TIMEOUT = ${timeout};\n${section}\n({ close, appCheck, fetchCheck, EXPECTED, REL_TOL })`, { AbortSignal, fetch: async () => ({ status: 200, headers: { get: () => 'text/html' }, text: async () => '<title>Stabileo Blog</title>' }) });
const reference = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/cantilever-results.json', import.meta.url), 'utf8'));

function browser(result, { mime = 'application/wasm', mounts = true } = {}) {
  const events = {};
  const state = { closed: 0 };
  return {
    state,
    async newPage() {
      return {
        on(name, callback) { events[name] = callback; },
        async goto() {
          events.response({ url: () => 'https://example.test/engine.wasm', status: () => 200, headers: () => ({ 'content-type': mime }) });
          return { status: () => 200 };
        },
        getByRole() { return { first: () => ({ waitFor: async () => { if (!mounts) throw new Error('Solve toolbar missing'); } }) }; },
        async evaluate() { return { glue: 'https://example.test/dedaliano_engine.js', result }; },
        async close() { state.closed += 1; },
      };
    },
  };
}

test('#720: the committed cantilever answer passes the deployed-result oracle', async () => {
  const b = browser(structuredClone(reference));
  const notes = await api.appCheck(b, 'https://example.test');
  for (const quantity of ["tip deflection", "tip rotation", "support reaction", "support moment"]) {
    assert.ok(notes.some((note) => note.startsWith(quantity)));
  }
  assert.equal(b.state.closed, 1);
});

test('#720: a planted wrong value in each published quantity fails and closes the page', async () => {
  for (const [collection, index, component] of [['displacements', 1, 'uy'], ['displacements', 1, 'rz'], ['reactions', 0, 'ry'], ['reactions', 0, 'mz']]) {
    const wrong = structuredClone(reference);
    wrong[collection][index][component] *= 2;
    const b = browser(wrong);
    await assert.rejects(api.appCheck(b, 'https://example.test'), /expected/);
    assert.equal(b.state.closed, 1);
  }
});

test('#720: a served WASM file with the wrong MIME type fails', async () => {
  const b = browser(reference, { mime: 'text/html' });
  await assert.rejects(api.appCheck(b, 'https://example.test'), /application\/wasm/);
  assert.equal(b.state.closed, 1);
});

test('#720: an HTML fallback without the application toolbar fails', async () => {
  const b = browser(reference, { mounts: false });
  await assert.rejects(api.appCheck(b, 'https://example.test'), /toolbar missing/);
  assert.equal(b.state.closed, 1);
});

test('#720: both sides of the unchanged numerical tolerance are checked', () => {
  for (const expected of Object.values(api.EXPECTED)) {
    assert.doesNotThrow(() => api.close('control', expected * (1 + api.REL_TOL / 2), expected));
    assert.throws(() => api.close('plant', expected * (1 + 2 * api.REL_TOL), expected), /expected/);
  }
});

test('#720: missing and non-finite quantities fail before a tolerance comparison', () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, '0']) {
    assert.throws(() => api.close('plant', value, api.EXPECTED.reaction), /expected/);
  }
});
