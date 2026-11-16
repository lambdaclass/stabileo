import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { restoreMovedRoute, restoreUnpublishedResearchRoute } from '../lib/legacy-routes';
import main from './fixtures/origin-main-public-surface.json';

const entries = [
  ['Root.svelte', 'sync'],
  ['App.svelte', 'syncRouteState'],
] as const;

function navigation(file: string, name: string): string {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing navigation function: ${file} ${name}`);
  return ts.transpileModule(`${declaration.getText(ast)}; ${name}();`.replaceAll('import.meta.env', 'env'), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
}

async function resolve(file: string, name: string, flag: string, path: string, expected: string) {
  const location = new URL(`https://stabileo.test${path}?round=2#checks`);
  const state = { navigation: 'retained' };
  const replaceState = vi.fn((_: unknown, __: string, address: string) => { location.href = new URL(address, location).href; });
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', { state, replaceState });
  vi.stubEnv('VITE_RESEARCH', flag);
  const checkpoint = new Error('route resolution');
  const routeKind = vi.fn(() => { throw checkpoint; });
  await expect(runInNewContext(navigation(file, name), {
    env: { VITE_RESEARCH: flag, VITE_TOOLS: '0' },
    revision: 0,
    publicRevision: 0,
    restoreMovedRoute,
    restoreUnpublishedResearchRoute,
    routeKind,
  })).rejects.toBe(checkpoint);
  expect(routeKind).toHaveBeenCalledOnce();
  expect(location.pathname + location.search + location.hash).toBe(`${expected}?round=2#checks`);
  if (path === expected) expect(replaceState).not.toHaveBeenCalled();
  else expect(replaceState).toHaveBeenCalledExactlyOnceWith(state, '', `${expected}?round=2#checks`);
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.skip.each(entries.flatMap(([file, name]) => ['', '0'].map(flag => [file, name, flag] as const)))('known wrong result: #2099 — %s %s restores unpublished Hungarian research with research=%j', async (file, name, flag) => {
  for (const path of main.research) {
    for (const slash of ['', '/']) await resolve(file, name, flag, `/hu${path}${slash}`, `/en${path}${slash}`);
  }
});

it.each(entries)('%s retains published Hungarian research and unrelated addresses', async (file, name) => {
  for (const path of ['/hu/research/', '/hu/research/benchmarks/lee-frame-1968/']) await resolve(file, name, '1', path, path);
  for (const flag of ['', '0', '1']) {
    for (const path of ['/hu/', '/hu/tools/', '/en/research/', '/hu/researching/']) await resolve(file, name, flag, path, path);
  }
});
