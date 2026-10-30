import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFrame } from './check.mjs';
const frame = { iteration: 1, compliance: 100, volume: .5, change: .2, density: [.2, .8] };
test('rejects corrupt fields and numerical failures', () => {
  checkFrame(frame, 2, 1);
  for (const change of [{ compliance: NaN }, { volume: .6 }, { change: Infinity }, { density: [0, 2] }, { density: [0] }, { iteration: 2 }]) {
    assert.throws(() => checkFrame({ ...frame, ...change }, 2, 1));
  }
});
