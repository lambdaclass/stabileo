// Text written straight into a component's markup never reaches the dictionaries, so no language
// can translate it. What is left is symbols and units (qYI, krx, Vyi, kN·m); a word slips in as a
// new file or a higher count here, and the fix is a key, not a raised allowance.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dirname, '../../..');
const ALLOWED: Record<string, number> = JSON.parse(readFileSync(join(import.meta.dirname, 'hardcoded-text-allowed.json'), 'utf8'));

const WORD = /[A-Za-zÀ-ÿ]{3,}/g;
const NOT_WORDS = new Set(
  'kN MPa mm cm kg Pa kPa GPa rad mrad deg max min Ctrl Shift Alt Enter Esc Tab Del Cmd PDF DXF IFC CSV XLSX SVG PNG JPG JSON CIRSOC ACI AISC API ASCE NBR Stabileo PRO GitHub Discord sin cos tan log exp'.split(' '),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'admin' && name !== 'node_modules') walk(p, out);
    } else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

function withoutExpressions(s: string): string {
  let depth = 0;
  let out = '';
  for (const c of s) {
    if (c === '{') { depth++; if (depth === 1) out += ' '; } else if (c === '}' && depth > 0) depth--;
    else if (depth === 0) out += c;
  }
  return out;
}

export function literalTexts(source: string): string[] {
  const markup = source
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const attributes = [...markup.matchAll(/\b(?:title|placeholder|aria-label|alt|label)="([^"{}]*)"/g)].map((m) => m[1]);
  const text = withoutExpressions(markup).replace(/<[^>]*>/g, '\n').split('\n');
  return [...text, ...attributes]
    .map((t) => t.replace(/&\w+;/g, ' ').trim())
    .filter((t) => (t.match(WORD) ?? []).some((w) => !NOT_WORDS.has(w)));
}

describe('text written into component markup', () => {
  const found = Object.fromEntries(
    walk(SRC)
      .map((f) => [relative(SRC, f), literalTexts(readFileSync(f, 'utf8'))] as const)
      .filter(([, texts]) => texts.length > 0),
  );

  it('finds the literals it is meant to find', () => {
    expect(literalTexts('<p>Hello there</p><b>{t("x")}</b><i title="Save it">kN</i>')).toEqual(['Hello there', 'Save it']);
  });

  it('grows in no file', () => {
    const grown = Object.entries(found)
      .filter(([file, texts]) => texts.length > (ALLOWED[file] ?? 0))
      .map(([file, texts]) => `${file}: ${texts.join(' | ')}`);
    expect(grown).toEqual([]);
  });

  it('keeps the allowance at what is left', () => {
    const stale = Object.entries(ALLOWED)
      .filter(([file, n]) => (found[file]?.length ?? 0) < n)
      .map(([file, n]) => `${file}: allowed ${n}, found ${found[file]?.length ?? 0}`);
    expect(stale).toEqual([]);
  });
});
