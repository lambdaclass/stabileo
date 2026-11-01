import { readFileSync } from 'node:fs';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import assert from 'node:assert/strict';

const native = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const server = await createServer({ root: new URL('../../../../web/', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { cases, runCases } = await server.ssrLoadModule('/src/components/research/macneal1985/cases.ts');
  const rows = await runCases();
  assert.equal(rows.length, cases.length);
  assert.equal(native.length, cases.length);
  assert.equal(new Set(native.map(r => r.id)).size, cases.length);
  for (const row of rows) {
    const ref = native.find(r => r.id === row.id);
    assert.ok(ref, row.id);
    assert.ok(row.value !== null && Number.isFinite(row.value), `${row.id}: ${row.failure}`);
    assert.equal(row.pass, ref.pass, `${row.id}: WASM/native pass mismatch`);
    assert.ok(Math.abs(row.value - ref.value) <= Math.max(Math.abs(ref.value) * 1e-8, 1e-12), `${row.id}: WASM/native value mismatch`);
  }
  console.log(JSON.stringify(rows.map(({ displacement, ...row }) => row), null, 2));
} finally { await server.close(); }
