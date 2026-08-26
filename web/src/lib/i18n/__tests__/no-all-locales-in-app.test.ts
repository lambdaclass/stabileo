/**
 * The eleven unoffered dictionaries must not come back into the bundle.
 *
 * `locales/all.ts` imports all fourteen. That is correct for a gate and
 * catastrophic for application code: one import from anywhere reachable by
 * `main.ts` puts 2.0 MB back into the chunk every landing and blog page
 * downloads, and nothing about the app would look or behave differently. The
 * regression would be invisible until someone measured again.
 *
 * So it is asserted structurally rather than by size: no file under `src/`
 * outside a `__tests__` directory may import it.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const SRC = 'src';
const ALL = resolve(SRC, 'lib/i18n/locales/all.ts');

/**
 * Whether a file imports `locales/all`, by RESOLVING the specifier.
 *
 * Matching the text `locales/all` is not enough, and the hole is one directory
 * wide: a module inside `src/lib/i18n/locales/` writes `./all`, which contains
 * no `locales/` at all. That is the single directory where a future locale
 * helper would live, so it is exactly the file this gate would wave through.
 *
 * Resolving against the importer's own directory has no such hole, and covers
 * `./all`, `./all.ts`, `../locales/all` and any other spelling of the same
 * module at once.
 */
function importsAll(file: string, src: string): boolean {
  const specs = [...src.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return specs.some((spec) => {
    if (!spec.startsWith('.')) return false;
    const base = resolve(dirname(file), spec);
    return base === ALL || `${base}.ts` === ALL || resolve(base, 'index.ts') === ALL;
  });
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|svelte|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('the unoffered dictionaries stay out of the application', () => {
  it('no application file imports locales/all', () => {
    const offenders = walk(SRC).filter((f) => {
      if (resolve(f) === ALL) return false;
      return importsAll(f, readFileSync(f, 'utf8'));
    });
    expect(offenders, `these would pull all 14 dictionaries into the bundle:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the detector sees every spelling of the import, not just one', () => {
    // A gate whose matcher is wrong reports a clean scan of nothing. These are
    // the forms a real offender would take, checked against the detector
    // itself so that "no offenders" means "none", not "none I can see".
    const inLocales = join(SRC, 'lib/i18n/locales/helper.ts');
    const elsewhere = join(SRC, 'lib/store/thing.ts');

    expect(importsAll(inLocales, `import { ALL_DICTS } from './all';`)).toBe(true);
    expect(importsAll(inLocales, `export * from './all.ts';`)).toBe(true);
    expect(importsAll(elsewhere, `import { ALL_DICTS } from '../i18n/locales/all';`)).toBe(true);
    expect(importsAll(elsewhere, `const d = await import('../i18n/locales/all');`)).toBe(true);

    // And does not fire on a different module that merely ends in "all".
    expect(importsAll(elsewhere, `import { x } from './recall';`)).toBe(false);
    expect(importsAll(elsewhere, `import { x } from '../codes/all';`)).toBe(false);
  });

  it('the store imports the offered three and their steel companions, and nothing else', () => {
    /*
     * `steel/*` is named here rather than skipped by the pattern. The earlier
     * version matched `locales/(\w+)` and so could not see a nested module at
     * all — it still returned ['en','es','pt'] after #135 folded the metallic
     * dictionaries in, which is a true answer to a question nobody asked. An
     * assertion that cannot see half the imports is not guarding them.
     */
    const src = readFileSync(join(SRC, 'lib/i18n/store.svelte.ts'), 'utf8');
    const imported = [...src.matchAll(/from '\.\/locales\/([\w/]+)'/g)].map((m) => m[1]).sort();
    expect(imported).toEqual(['en', 'es', 'pt', 'steel/en', 'steel/es', 'steel/pt']);
  });
});
