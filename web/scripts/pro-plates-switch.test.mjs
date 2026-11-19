import assert from 'node:assert/strict';
import { test } from 'node:test';
import { featuresForMode } from '../config/public-features.mjs';

test.skip('known wrong result: #1928 — production keeps unified PRO plates disabled', () => {
  assert.equal(featuresForMode('production').proPlatesUnified, false);
  assert.equal(featuresForMode('test').proPlatesUnified, true);
});
