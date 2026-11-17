import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');

test('empty legacy environment variables do not expose account UI in production', { skip: 'known wrong result: #2099' }, async t => {
  const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME'];
  const previous = keys.map(key => process.env[key]);
  for (const key of keys) process.env[key] = '';
  t.after(() => {
    for (const [index, key] of keys.entries()) {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }
  });

  const entry = 'public-accounts-dictionary';
  const result = await build({
    root,
    plugins: [{
      name: entry,
      resolveId: id => id === entry ? '\0' + entry : null,
      load: id => id === '\0' + entry ? "import { en } from 'virtual:app-i18n/en'; console.log(en);" : null,
    }],
    build: { write: false, rollupOptions: { input: entry } },
    logLevel: 'silent',
  });
  const code = result.output.filter(output => output.type === 'chunk').map(output => output.code).join('\n');
  assert.ok(code.includes('disclaimer.report'));
  assert.equal(code.includes('account.name'), false, 'production must strip the account UI dictionary');
});
