/**
 * In Basic mode each dictionary speaks one variant of its language: US
 * English, Brazilian Portuguese and Rioplatense Spanish (voseo). A dedicated
 * audit found all three mixed with their neighbours, colour next to color,
 * ficheiro next to arquivo, "seleccione" next to "seleccioná", because each
 * string had been written on its own. These are the forms that audit removed;
 * a new Basic string that brings one back fails here.
 *
 * Scoped to what Basic can show: the keys asked for by the files App.svelte
 * reaches without going through PRO, the landing page or the blog, plus the
 * step-by-step dictionaries. PRO has its own translation work.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';
import steelEn from '../locales/steel/en';
import steelEs from '../locales/steel/es';
import steelPt from '../locales/steel/pt';
import { stepsEn, stepsEs, stepsPt } from '../locales/steps';

const merged = {
  en: { ...en, ...steelEn, ...stepsEn } as Record<string, string>,
  es: { ...es, ...steelEs, ...stepsEs } as Record<string, string>,
  pt: { ...pt, ...steelPt, ...stepsPt } as Record<string, string>,
};

const SRC = join(import.meta.dirname, '../../..');
const OUTSIDE_BASIC = /[\\/]components[\\/](pro|landing|blog)[\\/]|[\\/]lib[\\/]pro[\\/]|LandingPage\.svelte$/;

/** The source files App.svelte reaches, following relative imports, without entering PRO, the landing page or the blog. */
function basicFiles(): string[] {
  const seen = new Set<string>();
  const stack = [join(SRC, 'App.svelte')];
  const resolve = (from: string, spec: string) => {
    const p = normalize(join(dirname(from), spec));
    for (const c of [p, `${p}.ts`, `${p}.svelte`, `${p}.svelte.ts`, join(p, 'index.ts')]) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
  };
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"`;]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const r = resolve(f, m[1] ?? m[2]);
      if (r && !OUTSIDE_BASIC.test(r) && !r.includes('/locales/')) stack.push(r);
    }
  }
  return [...seen];
}

/** Keys those files ask for: written out in full, or as a prefix a template completes. */
function basicKeys(): Set<string> {
  const all = new Set([...Object.keys(merged.en), ...Object.keys(merged.es), ...Object.keys(merged.pt)]);
  const keys = new Set<string>(Object.keys(stepsEs));
  const prefixes: string[] = [];
  for (const f of basicFiles()) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/['"`]([a-zA-Z][\w]*\.[\w.]+)['"`]/g)) if (all.has(m[1])) keys.add(m[1]);
    for (const m of src.matchAll(/`([a-zA-Z][\w]*\.[\w.]*)\$\{/g)) prefixes.push(m[1]);
  }
  for (const k of all) if (prefixes.some((p) => k.startsWith(p))) keys.add(k);
  return keys;
}
/*
 * The detailing, design, footing, generator, steel and connection engines are
 * imported by shared code (the model store keeps their data), but what they
 * say is shown only by PRO's panels.
 */
const PRO_ONLY = /^(detailing|design|footing|generator|steel|bolt|conn|battens|regulations|codes|seismic)\./;
const BASIC = new Set([...basicKeys()].filter((k) => !PRO_ONLY.test(k)));

function offenders(dict: Record<string, string>, re: RegExp): string[] {
  return Object.entries(dict).filter(([k, v]) => BASIC.has(k) && re.test(v)).map(([k, v]) => `${k}: ${v.match(re)![0]}`);
}

describe('in Basic mode each dictionary speaks one variant', () => {
  it('finds the keys Basic mode shows', () => {
    expect(BASIC.size).toBeGreaterThan(2000);
    expect(BASIC.has('steps.catalog.title')).toBe(true);
    expect(BASIC.has('detailing.migration.corrupt')).toBe(false);
  });
  it('English is US English', () => {
    const british = /\b(colours?|centres?|centred|utilisation|fibres?|metres?|catalogues?|behaviours?|modell(?:ing|ed)|analys(?:e|ed|ing)|counter-clockwise|neighbours?|favourable|aluminium|storeys?)\b/i;
    expect(offenders(merged.en, british)).toEqual([]);
  });
  it('Portuguese is Brazilian Portuguese', () => {
    const european = /\b(ficheiros?|ecrãs?|registos?|utilizadores?|encurvadura|noutro|percentagem)\b/i;
    expect(offenders(merged.pt, european)).toEqual([]);
  });
  it('Spanish addresses the reader with vos', () => {
    // "se verifique" and "haga falta" are not addressed to the reader.
    const usted = /\b(haga(?! falta)|elija|seleccione|presione|ingrese|(?<!se )verifique|asegúrese|revise|intente|elimínelo|conéctelo|cambie a|considere|sepárelas)\b/i;
    expect(offenders(merged.es, usted)).toEqual([]);
  });
});
