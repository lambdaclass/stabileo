import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pierSteps, type PierDesign } from '../pier-row';
import { makeFmt } from '../format';

const ROOT = join(__dirname, '..');
const ENGLISH = new Set(['table', 'about', 'along', 'wall', 'walls', 'at', 'of', 'where', 'every', 'other', 'over', 'under', 'minimum', 'maximum', 'main', 'distribution', 'held',
  'bar', 'bars', 'single', 'curvature', 'in', 'or', 'and', 'the', 'for', 'with', 'when', 'each', 'per', 'from', 'to', 'between', 'if', 'column', 'columns', 'beam', 'slab',
  'edge', 'face', 'top', 'bottom', 'required', 'provided', 'inside', 'outside', 'both', 'than', 'less', 'more']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : sources(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

function formulas(src: string): string[] {
  const out: string[] = [];
  const re = /formula:\s*(['"`])/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const q = m[1]!;
    let i = re.lastIndex, text = '', depth = 0;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if (depth) { if (c === '{') depth++; else if (c === '}') depth--; continue; }
      if (c === '\\') { text += src[++i] ?? ''; continue; }
      if (q === '`' && c === '$' && src[i + 1] === '{') { depth = 1; i++; text += ' '; continue; }
      if (c === q) break;
      text += c;
    }
    out.push(text);
    re.lastIndex = i + 1;
  }
  return out;
}

const englishIn = (text: string) => (text.match(/(?<![,A-Za-z])[A-Za-z]+/g) ?? []).filter((w) => ENGLISH.has(w) || (/^[A-Z][a-z]{3,}$/.test(w) && ENGLISH.has(w.toLowerCase())));

describe('the steps\' formulas', () => {
  it('are symbols and numbers, with no English words a reader in another language would meet untranslated', () => {
    const found: string[] = [];
    for (const file of sources(ROOT)) for (const f of formulas(readFileSync(file, 'utf8'))) if (englishIn(f).length) found.push(`${relative(ROOT, file)}: ${f}`);
    expect(found).toEqual([]);
  });

  it('reads the formulas the scan relies on', () => {
    const all = sources(ROOT).flatMap((file) => formulas(readFileSync(file, 'utf8')));
    expect(all.length).toBeGreaterThan(150);
    expect(all).toContain('Σ (Acol ∩ Aw) · hw');
  });

  it('writes a pier\'s working with no English words', () => {
    const p = {
      pier: { key: 'pier:w1', name: 'M1 + C1', z: 0, height: 3, walls: [], columns: [{ key: 'c', name: 'C1', corners: [], overlap: 0.08, legs: ['w1'] }], outline: { outer: [], holes: [] }, area: 1.2, centroid: { x: 1, y: 0.1 } },
      legs: [], zones: [], check: { ok: true, ratio: 0.4, ratios: [0.4], combo: 'U1', bars: '8 Ø16', ast: 16 }, combos: [{ combo: 'U1', n: 900, mx: 120, my: 40 }], missing: [],
    } as unknown as PierDesign;
    const words = pierSteps(p, makeFmt(',')).steps.flatMap((s) => englishIn(s.formula ?? ''));
    expect(words).toEqual([]);
  });
});
