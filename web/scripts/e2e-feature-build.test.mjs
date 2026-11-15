import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME'];

for (const value of [undefined, '0', '1']) {
  test(`E2E artifact records its resolved switches=${value}`, { skip: process.env.IGNORED !== '1' && 'known wrong result: #2099' }, async () => {
    const previous = { ...process.env };
    try {
      for (const key of keys) delete process.env[key];
      if (value !== undefined) for (const key of keys) process.env[key] = value;
      process.env.VITE_E2E = '1';
      const result = await build({
        root,
        logLevel: 'silent',
        plugins: [{
          name: 'e2e-feature-fixture',
          resolveId: id => id === 'e2e-feature-fixture' ? '\0e2e-feature-fixture' : null,
          load: id => id === '\0e2e-feature-fixture' ? 'console.log("fixture");' : null,
        }],
        build: { write: false, rollupOptions: { input: 'e2e-feature-fixture' } },
      });
      const metadata = result.output.find(output => output.fileName === 'e2e-features.json');
      assert.ok(metadata, 'prebuilt tests must detect the switches of the artifact they serve');
      assert.deepEqual(JSON.parse(metadata.source), Object.fromEntries(keys.map(key => [key, value === '1' ? '1' : '0'])));
    } finally {
      for (const key of [...keys, 'VITE_E2E']) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
}
