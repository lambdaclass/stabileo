/**
 * The solver worker must not import a module that uses runes.
 *
 * Runes (`$state`, `$derived`) are compiled in `.svelte.ts` files for the main
 * bundle, not inside a web worker. The worker once reached the i18n store
 * through `orphan-rotations-3d` → `local-axes-3d` → `i18n`, and every worker
 * died at start-up with "$state is not defined" — the combinations fell back to
 * the main thread and nothing said why. This walks the worker's static import
 * graph and fails on any `.svelte.ts` module, or any module importing `i18n`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../solver-worker.ts');

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // packages and the WASM glue are fine
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}/index.ts`]) if (existsSync(c) && c.endsWith('.ts')) return c;
  return null;
}

function walk(): { files: Set<string>; offenders: string[] } {
  const files = new Set<string>();
  const offenders: string[] = [];
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    if (f.endsWith('.svelte.ts')) offenders.push(f);
    const src = readFileSync(f, 'utf8');
    // Static value imports only: `import type` is erased and pulls nothing in.
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      const r = resolveImport(f, m[1]);
      if (r) stack.push(r);
    }
  }
  return { files, offenders };
}

describe('the solver worker import graph', () => {
  it('reaches no rune module', () => {
    const { files, offenders } = walk();
    expect(files.size).toBeGreaterThan(1);
    expect(offenders.map((f) => f.slice(f.indexOf('src/')))).toEqual([]);
    const i18n = [...files].filter((f) => /\/i18n\//.test(f));
    expect(i18n.map((f) => f.slice(f.indexOf('src/')))).toEqual([]);
  });
});
