import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { examCodeFromPath } from '../lib/app-mode';
import { restoreMovedRoute } from '../lib/legacy-routes';
import { restoreUnpublishedResearchRoute } from '../lib/research-fallback';
import main from './fixtures/origin-main-public-surface.json';

const entries = [
  ['Root.svelte', 'sync'],
  ['App.svelte', 'syncRouteState'],
] as const;

function script(file: string) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const script = file.endsWith('.svelte') ? source.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1] : source;
  return ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function navigation(file: string, name: string): string {
  const ast = script(file);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing navigation function: ${file} ${name}`);
  return ts.transpileModule(`${declaration.getText(ast)}; ${name}();`.replaceAll("import('./lib/research-fallback')", 'loadResearchFallback()'), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
}

function navigationState(location: URL) {
  return { location, revision: 0, publicRevision: 0, examCodeFromPath, examCode: examCodeFromPath(location.pathname) };
}

async function resolve(file: string, name: string, flag: string, path: string, expected: string, lazy = false) {
  const location = new URL(`https://stabileo.test${path}?round=2#checks`);
  const state = { navigation: 'retained' };
  const replaceState = vi.fn((_: unknown, __: string, address: string) => { location.href = new URL(address, location).href; });
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', { state, replaceState });
  vi.stubGlobal('__PUBLIC_FEATURES__', { ...__PUBLIC_FEATURES__, research: flag === '1' });
  const loadResearchFallback = vi.fn(async () => ({ restoreUnpublishedResearchRoute }));
  const checkpoint = new Error('route resolution');
  const routeKind = vi.fn(() => { throw checkpoint; });
  await expect(runInNewContext(navigation(file, name), {
    __PUBLIC_FEATURES__: { ...__PUBLIC_FEATURES__, research: flag === '1', tools: false },
    ...navigationState(location),
    loadResearchFallback,
    restoreMovedRoute,
    restoreUnpublishedResearchRoute,
    routeKind,
  })).rejects.toBe(checkpoint);
  expect(routeKind).toHaveBeenCalledOnce();
  if (lazy) expect(loadResearchFallback).toHaveBeenCalledTimes(path.startsWith('/hu/') ? 1 : 0);
  expect(location.pathname + location.search + location.hash).toBe(`${expected}?round=2#checks`);
  if (path === expected) expect(replaceState).not.toHaveBeenCalled();
  else expect(replaceState).toHaveBeenCalledExactlyOnceWith(state, '', `${expected}?round=2#checks`);
}

afterEach(() => { vi.unstubAllGlobals(); });

it.each(entries.flatMap(([file, name]) => ['', '0'].map(flag => [file, name, flag] as const)))('known wrong result: #2099 — %s %s restores unpublished Hungarian research with research=%j', async (file, name, flag) => {
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

it.each([...entries.map(([file]) => file), 'main.ts'])('known wrong result: #2099 — %s keeps the research fallback out of static imports', (file) => {
  for (const node of script(file).statements) {
    if (!ts.isImportDeclaration(node)) continue;
    expect(node.importClause?.getText() ?? '').not.toContain('restoreUnpublishedResearchRoute');
    expect((node.moduleSpecifier as ts.StringLiteral).text).not.toContain('research-fallback');
  }
});

it.each(entries)('known wrong result: #2099 — %s loads the fallback only on Hungarian paths', async (file, name) => {
  for (const flag of ['', '0', '1']) {
    for (const path of ['/hu/', '/hu/research', '/hu/research/', '/hu/researching/', '/hu/tools/', '/hu/blog/']) {
      const expected = flag !== '1' && /^\/hu\/research(?:\/|$)/.test(path) ? path.replace('/hu/', '/en/') : path;
      await resolve(file, name, flag, path, expected, true);
    }
    for (const path of ['/en/', '/es/', '/pt/', '/en/research/', '/hue/research/', '/hu', '/research/']) {
      await resolve(file, name, flag, path, path, true);
    }
  }
});

it.each(entries)('%s discards Hungarian navigation superseded while the helper loads', async (file, name) => {
  const location = new URL('https://stabileo.test/hu/research/?round=2#checks');
  const restore = vi.fn();
  let loaded!: (module: { restoreUnpublishedResearchRoute: typeof restore }) => void;
  const pending = new Promise<{ restoreUnpublishedResearchRoute: typeof restore }>(resolve => { loaded = resolve; });
  const checkpoint = new Error('current route resolution');
  const routeKind = vi.fn(() => { throw checkpoint; });
  const context = {
    __PUBLIC_FEATURES__: { ...__PUBLIC_FEATURES__, research: false, tools: false },
    ...navigationState(location),
    loadResearchFallback: vi.fn(() => pending),
    restoreMovedRoute: vi.fn(() => false),
    routeKind,
  };
  const first = runInNewContext(navigation(file, name), context);
  expect(context.loadResearchFallback).toHaveBeenCalledOnce();
  expect(routeKind).not.toHaveBeenCalled();
  location.pathname = '/en/';
  await expect(runInNewContext(navigation(file, name), context)).rejects.toBe(checkpoint);
  loaded({ restoreUnpublishedResearchRoute: restore });
  await first;
  expect(routeKind).toHaveBeenCalledOnce();
  expect(restore).not.toHaveBeenCalled();
  expect(location.pathname).toBe('/en/');
});
