/**
 * The dictionaries the app speaks merge with git's `union` driver (`.gitattributes`): two branches
 * that each add keys keep both sides instead of conflicting, which they did on nearly every
 * parallel merge (the three files changed some 340 times in six weeks).
 *
 * Union is safe only while every entry is one self-contained line, and it fails in one way: two
 * branches that add or change the same key both keep their line. These guard both, so a bad union
 * fails here instead of a later duplicate silently winning.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '../locales');
export const UNION_LOCALES = [
  'en.ts', 'es.ts', 'pt.ts', 'de.ts', 'fr.ts', 'tr.ts',
  ...readdirSync(join(DIR, 'steel')).filter((file) => file.endsWith('.ts')).map((file) => `steel/${file}`),
].sort();

const ENTRY = /^\s*(['"])([^'"]+)\1: (['"`]).*\3,\s*(\/\/.*)?$/;
const OTHER = /^\s*$|^\s*\/\/|^\s*\/?\*|^const |^export |^};|^import |^\s*\.\.\./;

describe('locale dictionaries stay safe to union-merge', () => {
  for (const file of UNION_LOCALES) {
    const lines = readFileSync(join(DIR, file), 'utf8').split('\n');

    it(`${file}: one entry per line`, () => {
      let inComment = false;
      const bad = lines.map((l, i) => [i + 1, l] as const).filter(([, l]) => {
        const wasIn = inComment;
        if (l.includes('/*')) inComment = true;
        if (l.includes('*/')) inComment = false;
        return !wasIn && !l.includes('*/') && !OTHER.test(l) && !ENTRY.test(l);
      });
      expect(bad.map(([n, l]) => `${n}: ${l.slice(0, 80)}`)).toEqual([]);
    });

    it(`${file}: no key twice`, () => {
      const seen = new Map<string, number>();
      const dup: string[] = [];
      lines.forEach((l, i) => {
        const m = ENTRY.exec(l);
        if (!m) return;
        if (seen.has(m[2]!)) dup.push(`${m[2]} (lines ${seen.get(m[2]!)} and ${i + 1})`);
        else seen.set(m[2]!, i + 1);
      });
      expect(dup).toEqual([]);
    });
  }
});
