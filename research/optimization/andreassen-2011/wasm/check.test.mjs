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

test('checks every scalar history with the native reference tolerances', async () => {
  const { compareHistory } = await import('./check.mjs');
  compareHistory(frame, frame);
  for (const bad of [{ compliance: 100.01 }, { volume: .500001 }, { change: .20001 }, { iteration: 2 }]) {
    assert.throws(() => compareHistory({ ...frame, ...bad }, frame));
  }
});

test('decodes frame-major, column-major replay cells and rejects truncation', async () => {
  const { decodeReplay } = await import('./check.mjs');
  const { gzipSync } = await import('node:zlib');
  const config = { nelx: 2, nely: 2, volfrac: .5, penal: 3, rmin: 2.4, ft: 1 };
  const header = Buffer.from(JSON.stringify({ config, frames: [frame, { ...frame, iteration: 2 }] }));
  const prefix = Buffer.alloc(12);
  prefix.write('SRPL'); prefix.writeUInt32LE(2, 4); prefix.writeUInt32LE(header.length, 8);
  const bytes = Buffer.concat([prefix, header, Buffer.from([0, 64, 128, 255, 255, 128, 64, 0])]);
  const replay = decodeReplay(gzipSync(bytes));
  assert.deepEqual(replay.config, config);
  assert.deepEqual(replay.frames.map(f => f.iteration), [1, 2]);
  assert.deepEqual(replay.frames.map(f => f.density), [[0, 64/255, 128/255, 1], [1, 128/255, 64/255, 0]]);
  assert.throws(() => decodeReplay(gzipSync(bytes.subarray(0, -1))));
});
