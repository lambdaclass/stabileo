import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export function checkFrame(frame, n, iteration) {
  assert.equal(frame.iteration, iteration);
  assert.ok(Number.isFinite(frame.compliance) && frame.compliance > 0);
  assert.ok(Number.isFinite(frame.volume) && Math.abs(frame.volume - .5) < 5e-4);
  assert.ok(Number.isFinite(frame.change) && frame.change >= 0 && frame.change <= .20000000001);
  assert.equal(frame.density.length, n);
  assert.ok(frame.density.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
}
export function decodeReplay(compressed) {
  const bytes = gunzipSync(compressed);
  assert.equal(bytes.toString('ascii', 0, 4), 'SRPL');
  assert.equal(bytes.readUInt32LE(4), 2);
  const size = bytes.readUInt32LE(8);
  const header = JSON.parse(bytes.toString('utf8', 12, 12 + size));
  const n = header.config.nelx * header.config.nely;
  assert.equal(bytes.length, 12 + size + n * header.frames.length);
  return { config: header.config, frames: header.frames.map((frame, i) => ({ ...frame,
    density: Array.from(bytes.subarray(12 + size + i * n, 12 + size + (i + 1) * n), b => b / 255) })) };
}
export function compareHistory(frame, ref) {
  assert.equal(frame.iteration, ref.iteration);
  assert.ok(Math.abs(frame.compliance - ref.compliance) / ref.compliance < 1e-6, 'compliance');
  assert.ok(Math.abs(frame.volume - ref.volume) <= 1e-8, 'volume');
  assert.ok(Math.abs(frame.change - ref.change) <= 1e-6, 'change');
}
export async function check(directory) {
  const mod = await import(pathToFileURL(path.resolve(directory, 'topopt.js')));
  await mod.default({ module_or_path: fs.readFileSync(path.join(directory, 'topopt_bg.wasm')) });
  for (const ft of [1, 2]) {
    const config = { nelx: 60, nely: 20, volfrac: .5, penal: 3, rmin: 2.4, ft };
    const solver = new mod.Topopt(JSON.stringify(config));
    const root = fileURLToPath(new URL('../', import.meta.url));
    const native = JSON.parse(execFileSync('cargo', ['run', '--release', '--locked', '--quiet', '--bin', 'reproduce', '--', String(ft)], { cwd: root, maxBuffer: 32_000_000 }));
    const fullRefs = JSON.parse(fs.readFileSync(path.join(root, `reference-results/ft${ft}.json`)));
    const replay = decodeReplay(fs.readFileSync(path.join(directory, `ft${ft}.srpl`)));
    assert.deepEqual(replay.config, config);
    assert.equal(replay.frames.length, native.length);
    replay.frames.forEach((frame, i) => {
      checkFrame(frame, 1200, i + 1);
      compareHistory(frame, native[i]);
      frame.density.forEach((value, cell) => assert.ok(Math.abs(value - native[i].density[cell]) <= .5 / 255, `ft${ft} frame ${i} cell ${cell}: quantization`));
    });
    const refs = JSON.parse(fs.readFileSync(path.join(directory, `ft${ft}.json`)));
    assert.equal(refs.length, native.length);
    assert.equal(refs.length, fullRefs.length);
    let final;
    try {
      for (const ref of refs) {
        const frame = JSON.parse(solver.step());
        checkFrame(frame, 1200, ref.iteration);
        compareHistory(frame, ref);
        compareHistory(frame, native[frame.iteration - 1]);
        compareHistory(ref, fullRefs[frame.iteration - 1]);
        final = frame;
      }
      assert.ok(solver.finished());
      for (const ref of [native.at(-1), fullRefs.at(-1)]) final.density.forEach((value, cell) => assert.ok(Math.abs(value - ref.density[cell]) <= 1e-5, 'final density'));
    } finally { solver.free(); }
  }
  console.log('topopt WASM: both filters: all reference/native histories, final densities and replay config/order/quantization match');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await check(process.argv[2]);
