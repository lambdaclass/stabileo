import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
for (const script of ['bench-design.mjs', 'bench-collision-worker.mjs']) {
  test(`${script} builds its standalone entry`, async () => {
    await run(process.execPath, [`scripts/${script}`, '--build-only'], {
      cwd: root, maxBuffer: 10 * 1024 * 1024,
    });
  }, 120_000);
}
