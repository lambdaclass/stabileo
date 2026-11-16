import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import ts from 'typescript';
import { researchLocaleBuildPlugin } from './research-locale-build.mjs';

const root = resolve(import.meta.dirname, '..');

for (const [name, source] of [
  ['aliased entry', "const optional = { title: cards.hu.title }; export const strings = { en: cards.en, hu: optional };"],
  ['initializer dependency', "const title = cards.hu.title; const hu = { title }; export const strings = { en: cards.en, hu };"],
  ['shadowed binding', "const hu = { title: cards.hu.title }; export const echo = (hu: string) => hu; export const strings = { en: cards.en, hu };"],
]) {
  test(`removed locale owns its private initializer: ${name}`, () => {
    const code = `const cards = { en: { title: 'English' }, hu: { title: 'Hungarian' } }; ${source}`;
    const transformed = researchLocaleBuildPlugin(() => ({})).transform(code, `${root}/src/components/research/fixture.ts`).code;
    const context = { exports: {} };
    runInNewContext(ts.transpileModule(transformed, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
    assert.equal(context.exports.strings.en.title, 'English');
    assert.equal(Object.hasOwn(context.exports.strings, 'hu'), false);
    if (context.exports.echo) assert.equal(context.exports.echo('retained'), 'retained');
  });
}

for (const source of [
  "const hu = { title: 'retained' }; export const get = () => hu; export const strings = { hu };",
  "export const hu = { title: 'retained' }; export const get = () => hu; export const strings = { hu };",
  "const hu = { title: 'retained' }; export { hu as retained }; export const get = () => hu; export const strings = { hu };",
]) {
  test(`locale gate retains initializers with live or exported uses: ${source}`, () => {
    const transformed = researchLocaleBuildPlugin(() => ({})).transform(source, `${root}/src/components/tools/fixture.ts`).code;
    const context = { exports: {} };
    runInNewContext(ts.transpileModule(transformed, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
    assert.equal(context.exports.get().title, 'retained');
    assert.equal(Object.hasOwn(context.exports.strings, 'hu'), false);
  });
}

for (const research of [undefined, '0', '1']) {
  test(`locale initializers execute only for retained locales, research=${research}`, () => {
    const code = `
      const cards = { en: { title: 'English' }, hu: { title: 'Hungarian' } };
      const hu = { title: cards.hu.title };
      export const strings = { en: cards.en, hu };
    `;
    const plugin = researchLocaleBuildPlugin(() => ({ VITE_RESEARCH: research }));
    const transformed = plugin.transform(code, `${root}/src/components/research/fixture.ts`)?.code ?? code;
    const output = ts.transpileModule(transformed, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const context = { exports: {} };
    runInNewContext(output, context);
    assert.equal(context.exports.strings.en.title, 'English');
    assert.equal(context.exports.strings.hu?.title, research === '1' ? 'Hungarian' : undefined);
  });
}

for (const research of [undefined, '0', '1']) {
  for (const e2e of [undefined, '1']) {
    test(`production research dictionaries execute, research=${research}, e2e=${e2e}`, async () => {
      const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME', 'VITE_E2E', 'VITE_APP_TYPE'];
      const previous = keys.map(key => process.env[key]);
      keys.forEach(key => delete process.env[key]);
      if (research !== undefined) process.env.VITE_RESEARCH = research;
      if (e2e !== undefined) process.env.VITE_E2E = e2e;
      try {
        const result = await build({
          root,
          plugins: [{
            name: 'research-dictionary-execution-fixture',
            resolveId: id => id === 'research-dictionary-execution-fixture' ? '\0research-dictionary-execution-fixture' : null,
            load: id => id === '\0research-dictionary-execution-fixture' ? `
              import { translations as feher, shapeStrings } from '/src/components/research/feher2026/strings';
              import { translations as gayNeto } from '/src/components/research/gayNeto2014/strings';
              import { strings as macneal } from '/src/components/research/macneal1985/i18n';
              globalThis.researchDictionaries = { feher, gayNeto, macneal, feherDefault: shapeStrings() };
            ` : null,
          }],
          build: { write: false, rollupOptions: { input: 'research-dictionary-execution-fixture', output: { format: 'iife', inlineDynamicImports: true } } },
          logLevel: 'silent',
        });
        const context = {};
        runInNewContext(result.output.filter(output => output.type === 'chunk').map(output => output.code).join('\n'), context);
        const { feher, gayNeto, macneal, feherDefault } = context.researchDictionaries;
        const mainCopy = JSON.parse(readFileSync(resolve(root, 'src/components/research/feher2026/main-copy.json'), 'utf8'));
        for (const locale of ['en', 'es', 'pt']) {
          assert.ok(feher[locale].title);
          assert.ok(gayNeto[locale].title);
          assert.ok(macneal[locale].error);
          assert.ok(mainCopy[locale]);
        }
        if (research !== '1') for (const [key, value] of Object.entries(mainCopy.en)) assert.equal(feherDefault[key], value, key);
        for (const dictionary of [feher, gayNeto, macneal]) assert.equal(Object.hasOwn(dictionary, 'hu'), research === '1');
      } finally {
        keys.forEach((key, i) => {
          if (previous[i] === undefined) delete process.env[key];
          else process.env[key] = previous[i];
        });
      }
    });
  }
}
