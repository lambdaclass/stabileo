import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../SpringsPage.svelte', import.meta.url), 'utf8').split('<script lang="ts">')[1].split('</script>')[0];
const ast = ts.createSourceFile('page.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'loadEditor')!;
const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

it.each([false, true])('records the exported strip only after accepted loads (%s)', async (accepted) => {
  const strip = { name: 'new' };
  const previous = { name: 'old' };
  let complete!: (accepted: boolean) => void;
  const context = {
    strip, editorStrip: previous, exportDisabled: false, simulation: { result: {} },
    labelParams: () => ({}), e2e: false,
    editor: { load: () => new Promise<boolean>((resolve) => { complete = resolve; }) },
  };
  const load = runInNewContext(`${js}; loadEditor`, context);
  const pending = load();
  expect(context.editorStrip).toBe(previous);
  complete(accepted);
  await pending;
  expect(context.editorStrip).toBe(accepted ? strip : previous);
});
