/**
 * The public pages render before the application loads, with only the dictionary entries under
 * PUBLIC_KEY_PREFIXES (`public-prefixes.ts`, built into `virtual:public-i18n` by vite.config.ts). A key they use outside those
 * prefixes would show as the bare key on the landing or the blog. Every string literal in their
 * sources that is a dictionary key must be a public one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../locales/en';
import { PUBLIC_KEY_PREFIXES } from '../public-prefixes';

const SRC = join(import.meta.dirname, '../../..');
/** What Root.svelte renders without the application, and what it imports. */
const PUBLIC = ['Root.svelte', 'components/LandingPage.svelte', 'components/landing', 'components/site', 'components/blog', 'components/LocaleSelect.svelte', 'lib/blog', 'lib/contact', 'lib/page-meta.ts'];

function files(p: string): string[] {
  const full = join(SRC, p);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).filter((f) => f !== '__tests__').flatMap((f) => files(join(p, f)))
    .filter((f) => /\.(ts|svelte)$/.test(f));
}

describe('the public pages use public dictionary keys only', () => {
  it('every key-like literal in their sources is under a public prefix', () => {
    const outside: string[] = [];
    for (const f of PUBLIC.flatMap(files)) {
      // Comments name keys without using them.
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of code.matchAll(/['"`]([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)['"`]/g)) {
        const key = m[1]!;
        if (key in en && !PUBLIC_KEY_PREFIXES.some((p) => key.startsWith(p))) outside.push(`${f.slice(SRC.length + 1)}: ${key}`);
      }
    }
    expect(outside).toEqual([]);
  });
});
