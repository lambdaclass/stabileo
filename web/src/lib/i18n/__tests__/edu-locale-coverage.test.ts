/**
 * Education renders in English, Spanish and Portuguese with nothing missing.
 *
 * `t()` falls back to English for an absent key, silently. That is the right
 * behaviour for a half-translated locale — better English than a raw key — but
 * it means a mode can lose half its translation and look fine to whoever is
 * reading it in English. Portuguese was in exactly that state: 196 of the 388
 * keys Education renders were absent, so a Brazilian teacher writing an
 * exercise met an English form.
 *
 * The three languages this test names are the ones the product commits to.
 * The other locales are deliberately NOT checked: they sit around 57% overall
 * and their gap is a separate piece of work, not something to fail this gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dictFor } from '../store.svelte';
import { EXPLAIN_KEYS } from '../../../components/edu/exam-explain';

const SUPPORTED = ['en', 'es', 'pt'] as const;

const ROOT = join(__dirname, '..', '..', '..');

/** Files that make up the Education surface, including the shared components
 *  the mode mounts — the drawing bar is Basic's, but Education shows it. */
const SOURCES = [
  ...readdirSync(join(ROOT, 'components', 'edu'))
    .filter((f) => f.endsWith('.svelte') || f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts'))
    .map((f) => join(ROOT, 'components', 'edu', f)),
  join(ROOT, 'components', 'FloatingTools.svelte'),
  join(ROOT, 'components', 'StatusBar.svelte'),
  ...readdirSync(join(ROOT, 'components', 'floating-tools'))
    .filter((f) => f.endsWith('.svelte'))
    .map((f) => join(ROOT, 'components', 'floating-tools', f)),
];

/**
 * Keys the source asks for literally.
 *
 * Keys built by concatenation — `t('edu.' + difficulty)` — cannot be found this
 * way, so the ones that exist are listed explicitly below. A test that silently
 * skipped them would pass while the exercise list showed `edu.easy`.
 */
function literalKeys(): Set<string> {
  const out = new Set<string>();
  for (const file of SOURCES) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) out.add(m[1]);
    for (const m of src.matchAll(/\btr\(\s*'([^']+)'/g)) out.add(m[1]);
    for (const m of src.matchAll(/nameKey:\s*'([^']+)'/g)) out.add(m[1]);
  }
  /*
   * Keys a data table hands to `t()` rather than the source asking for them
   * literally: `STATIONS`, the steel grades, the shape hints. The first pass
   * of this gate missed them, and Portuguese was missing all fourteen while
   * the test reported full coverage.
   */
  for (const file of ['exercise-presets.ts', 'exercise-source.ts', 'exercise-data.ts']) {
    const src = readFileSync(join(ROOT, 'components', 'edu', file), 'utf8');
    for (const m of src.matchAll(/\w*[Kk]ey\s*:\s*'([^']+)'/g)) out.add(m[1]);
    for (const m of src.matchAll(/^\s*\w+:\s*'(edu\.[^']+)'/gm)) out.add(m[1]);
  }

  // Built at runtime, so they have to be named here.
  for (const d of ['easy', 'medium', 'hard']) out.add(`edu.${d}`);
  for (const s of ['zero', 'constant', 'linear', 'quadratic', 'cubic']) {
    out.add(`edu.shape.${s}`);
    out.add(`edu.sketch.power.${s}`);
  }
  for (const s of ['above', 'below']) out.add(`edu.sketch.side.${s}`);
  for (const k of EXPLAIN_KEYS) out.add(k);
  // Concatenation stubs the scan picks up but which are never asked for whole.
  out.delete('edu.');
  out.delete('edu.shape.');
  out.delete('edu.sketch.power.');
  out.delete('edu.sketch.side.');
  return out;
}

describe('Education is fully translated in the supported languages', () => {
  const keys = literalKeys();

  it('finds the keys to check at all', () => {
    // A regex that stops matching would make every assertion below vacuous.
    expect(keys.size).toBeGreaterThan(300);
    expect(keys.has('edu.author.title')).toBe(true);
    expect(keys.has('edu.sketch.verify')).toBe(true);
    // One from each indirect source, so a broken scan cannot pass quietly.
    expect(keys.has('edu.author.atMid'), 'a STATIONS key').toBe(true);
    expect(keys.has('edu.author.shapeQuadraticHint'), 'a SHAPE_HINTS key').toBe(true);
  });

  for (const locale of SUPPORTED) {
    it(`${locale} has every key Education renders`, () => {
      const dict = dictFor(locale);
      const missing = [...keys].filter((k) => !(k in dict)).sort();
      expect(missing, `${locale} is missing ${missing.length} keys`).toEqual([]);
    });

    it(`${locale} has no empty strings among them`, () => {
      const dict = dictFor(locale);
      const blank = [...keys].filter((k) => k in dict && !String(dict[k]).trim());
      expect(blank).toEqual([]);
    });
  }

  it('Spanish and Portuguese are actually translated, not English copied over', () => {
    // A locale that "has" every key by copying English reads as complete and
    // is not. Sampling the longest strings catches that without pretending to
    // judge translation quality: identical prose in two languages is the tell.
    const en = dictFor('en');
    const sample = [...keys]
      .filter((k) => typeof en[k] === 'string' && en[k].length > 40)
      .sort((a, b) => en[b].length - en[a].length)
      .slice(0, 40);
    for (const locale of ['es', 'pt'] as const) {
      const dict = dictFor(locale);
      const copied = sample.filter((k) => dict[k] === en[k]);
      expect(copied, `${locale} repeats the English text for: ${copied.join(', ')}`).toEqual([]);
    }
  });
});
