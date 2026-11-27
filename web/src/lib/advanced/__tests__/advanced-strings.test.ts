import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import '../../engine/steps/methods';
import { allMethods, GROUP_ORDER } from '../../engine/steps/registry';
import { ADV_FUNCTIONS, ADV_GROUPS } from '../catalog';
import { DICTS, LOCALES } from './dictionaries';

const SRC = join(import.meta.dirname, '../../../');
const SURFACE = [
  'components/toolbar/ToolbarAdvanced.svelte', 'components/KinematicPanel.svelte', 'components/WhatIfPanel.svelte',
  'components/SectionStressPanel.svelte', 'components/CirsocFlexPanel.svelte', 'components/DespieceOptions.svelte',
  'components/advanced', 'components/whatif', 'components/steps', 'lib/advanced', 'lib/pro/support-types.ts',
];

function files(rel: string, out: string[] = []): string[] {
  const p = join(SRC, rel);
  if (statSync(p).isDirectory()) { for (const e of readdirSync(p)) if (e !== '__tests__') files(join(rel, e), out); }
  else if (/\.(svelte|ts)$/.test(p)) out.push(p);
  return out;
}

/** Every key the Advanced panel and the step-by-step views ask for. */
function surfaceKeys(): string[] {
  const keys = new Set<string>();
  for (const f of SURFACE.flatMap((r) => files(r))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\b(?:t|tp|tx|tAt)\(\s*['"]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"]/g)) keys.add(m[1]);
    for (const m of s.matchAll(/(?:titleKey|helpKey|labelKey|textKey)\s*:\s*['"]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"]/g)) keys.add(m[1]);
  }
  for (const f of ADV_FUNCTIONS) keys.add(`advCat.fn.${f.id}.desc`);
  for (const g of ADV_GROUPS) keys.add(`advCat.group.${g}`);
  for (const g of GROUP_ORDER) keys.add(`steps.group.${g}`);
  for (const m of allMethods()) {
    for (const part of ['title', 'help', 'requires']) keys.add(`steps.m.${m.id}.${part}`);
    for (const o of m.options ?? []) { keys.add(`steps.m.${m.id}.opt.${o.id}.label`); keys.add(`steps.m.${m.id}.opt.${o.id}.help`); }
  }
  return [...keys].sort();
}

const KEYS = surfaceKeys();
const ALL_KEYS = new Set(Object.values(DICTS).flatMap((d) => Object.keys(d)));
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

describe('the Advanced panel speaks words, not keys', () => {
  it('collects the panel’s keys', () => {
    expect(KEYS).toContain('pro.custom3d');
    expect(KEYS).toContain('whatif.supportType');
    expect(KEYS.length).toBeGreaterThan(400);
    expect(KEYS).toContain('advCat.search.placeholder');
    expect(KEYS).toContain('steps.m.so-buckling-kg.title');
  });

  it('defines every key the panel asks for in every complete language', () => {
    const blank = (loc: string, k: string) => DICTS[loc][k] === undefined || (!DICTS[loc][k].trim() && (DICTS.en[k] ?? '').trim().length > 2);
    const missing = LOCALES.flatMap((loc) => KEYS.filter((k) => blank(loc, k)).map((k) => `${loc}: ${k}`));
    expect(missing).toEqual([]);
  });

  it('never shows another key, an identifier or a placeholder English does not fill', () => {
    const bad: string[] = [];
    for (const loc of LOCALES) {
      for (const k of KEYS) {
        const v = DICTS[loc][k] ?? '';
        const en = placeholders(DICTS.en[k] ?? '');
        for (const p of en) if (!placeholders(v).has(p)) bad.push(`${loc}: ${k} lost {${p}}`);
        for (const p of placeholders(v)) if (!en.has(p)) bad.push(`${loc}: ${k} has {${p}}`);
        for (const m of v.matchAll(/[a-zA-Z][\w-]*(?:\.[\w-]+)+/g)) if (ALL_KEYS.has(m[0])) bad.push(`${loc}: ${k} shows the key ${m[0]}`);
        if (/\b[a-z]+[A-Z][a-z]+[A-Za-z]*\b/.test(v.replace(/\{\w+\}/g, ''))) bad.push(`${loc}: ${k} shows an identifier: ${v.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('names the free-body view in each language, not by its Spanish code name', () => {
    for (const loc of LOCALES.filter((l) => l !== 'es')) {
      for (const k of ['advanced.despiece', 'advHelp.despiece.label', 'advCat.fn.despiece.desc']) expect(DICTS[loc][k], `${loc}: ${k}`).not.toMatch(/despiece/i);
    }
  });
});
