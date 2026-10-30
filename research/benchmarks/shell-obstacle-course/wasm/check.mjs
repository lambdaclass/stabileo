import { readFileSync } from 'node:fs';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import assert from 'node:assert/strict';

const server = await createServer({ root: new URL('../../../../web/', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { cases, runCases, finest } = await server.ssrLoadModule('/src/components/research/shell1985/cases.ts');
  const rows = await runCases();
  assert.equal(rows.length, cases.length);
  for (const row of rows) {
    const ref = JSON.parse(readFileSync(`${process.argv[2]}/${row.id}.json`, 'utf8'));
    assert.equal(ref.id, row.id);
    assert.ok(row.value !== null && Number.isFinite(row.value), `${row.id}: ${row.failure}`);
    assert.equal(row.pass, ref.pass, `${row.id}: WASM/native pass mismatch`);
    assert.ok(Math.abs(row.value - ref.value) <= Math.max(Math.abs(ref.value) * 1e-8, 1e-12), `${row.id}: WASM/native value mismatch`);
  }
  console.log(JSON.stringify(rows.map(({ displacement, ...row }) => row), null, 2));
  console.log(`Finest selected meshes: ${finest.filter(c => rows.find(r => r.id === c.id).pass).length}/3 pass`);
} finally { await server.close(); }
