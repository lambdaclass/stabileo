import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('audits production and transitive Tauri packages, excluding unrelated development tooling', () => {
  const dir = mkdtempSync(join(tmpdir(), 'desktop-audit-'));
  try {
    const lock = { packages: {
      '': { dependencies: { runtime: '1' }, devDependencies: { '@tauri-apps/api': '1', tooling: '1' } },
      'node_modules/runtime': {},
      'node_modules/@tauri-apps/api': { dependencies: { transport: '1' } },
      'node_modules/transport': {},
      'node_modules/tooling': {},
    } };
    writeFileSync(join(dir, 'lock.json'), JSON.stringify(lock));
    for (const [name, expected] of [['runtime', 1], ['transport', 1], ['@tauri-apps/api', 1], ['tooling', 0]]) {
      writeFileSync(join(dir, 'audit.json'), JSON.stringify({ vulnerabilities: {
        [name]: { severity: 'high', nodes: ['node_modules/' + name] },
      } }));
      const result = spawnSync(process.execPath, [new URL('./audit-web.mjs', import.meta.url).pathname, join(dir, 'lock.json'), join(dir, 'audit.json')]);
      assert.equal(result.status, expected, name);
    }
    writeFileSync(join(dir, 'audit.json'), JSON.stringify({ error: { message: 'offline' } }));
    assert.equal(spawnSync(process.execPath, [new URL('./audit-web.mjs', import.meta.url).pathname, join(dir, 'lock.json'), join(dir, 'audit.json')]).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
