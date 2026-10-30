import fs from 'node:fs';
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
export async function check(directory) {
  const mod = await import(pathToFileURL(path.resolve(directory, 'topopt.js')));
  await mod.default({ module_or_path: fs.readFileSync(path.join(directory, 'topopt_bg.wasm')) });
  for (const ft of [1, 2]) {
    const solver = new mod.Topopt(JSON.stringify({ nelx: 60, nely: 20, volfrac: .5, penal: 3, rmin: 2.4, ft }));
    const refs = JSON.parse(fs.readFileSync(path.join(directory, `ft${ft}.json`)));
    try {
      for (const ref of refs) {
        const frame = JSON.parse(solver.step());
        checkFrame(frame, 1200, ref.iteration);
        assert.ok(Math.abs(frame.compliance - ref.compliance) / ref.compliance < 1e-6);
      }
      assert.ok(solver.finished());
    } finally { solver.free(); }
  }
  console.log('topopt WASM: both default reference histories match');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await check(process.argv[2]);
