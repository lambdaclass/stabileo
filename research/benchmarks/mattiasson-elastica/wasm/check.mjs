import { readFileSync } from 'node:fs';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import assert from 'node:assert/strict';

const native = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const server = await createServer({ root: new URL('../../../../web/', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { cases, runCases, compare } = await server.ssrLoadModule('/src/components/research/mattiasson1981/cases.ts');
  const rows = await runCases();
  assert.equal(rows.length, cases.length);
  assert.equal(native.length, cases.length);
  assert.equal(new Set(native.map(r => r.id)).size, cases.length);
  for (const c of cases) {
    const raw = native.find(r => r.id === c.id);
    assert.ok(raw, c.id);
    let ref;
    try { if (raw.failure) throw new Error(raw.failure); ref = compare(c, raw.result); }
    catch { ref = { pass: false, failure: true }; }
    const row = rows.find(r => r.id === c.id);
    assert.equal(Boolean(row.failure), Boolean(ref.failure), `${c.id}: solve outcome mismatch`);
    assert.equal(row.pass, ref.pass, `${c.id}: classification mismatch`);
    if (!ref.failure) {
      for (const key of ['u', 'v']) assert.ok(Math.abs(row[key] - ref[key]) <= Math.max(Math.abs(ref[key]) * 1e-8, 1e-12), `${c.id}: ${key} mismatch`);
      for (const d of ref.displacement) {
        const w = row.displacement.find(w => w.nodeId === d.nodeId);
        assert.ok(w, `${c.id}: missing node ${d.nodeId}`);
        for (const key of ['ux', 'uz', 'ry']) assert.ok(Math.abs(w[key] - d[key]) <= Math.max(Math.abs(d[key]) * 1e-8, 1e-12), `${c.id}: shape mismatch`);
      }
    }
  }
  console.log(JSON.stringify(rows.map(({ displacement, ...row }) => row), null, 2));
} finally { await server.close(); }
