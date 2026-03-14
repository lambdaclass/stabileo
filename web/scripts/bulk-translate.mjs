#!/usr/bin/env node
// Bulk translation generator
// Takes DE translations as reference (complete) and generates FR/IT/TR/HI
// by mapping DE→target language using term dictionaries + direct translations

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const transDir = join(__dirname, 'translations');

// Load all existing patches for a language
function loadPatches(lang) {
  const patches = {};
  try {
    const files = readdirSync(transDir).filter(f => f.startsWith(`${lang}_`) && f.endsWith('.json')).sort();
    for (const f of files) {
      Object.assign(patches, JSON.parse(readFileSync(join(transDir, f), 'utf8')));
    }
  } catch(e) {}
  return patches;
}

// Extract all keys from en.ts
const localesDir = join(__dirname, '..', 'src', 'lib', 'i18n', 'locales');
const en = readFileSync(join(localesDir, 'en.ts'), 'utf8');
const allKeys = {};
const regex = /'([^']+)':\s*'([^']*(?:\\'[^']*)*)'/g;
let m;
while ((m = regex.exec(en)) !== null) {
  allKeys[m[1]] = m[2];
}

const langs = process.argv.slice(2);
if (langs.length === 0) {
  console.log('Usage: node bulk-translate.mjs <lang1> [lang2] ...');
  console.log('Checks coverage for each language');
  process.exit(1);
}

for (const lang of langs) {
  const existing = loadPatches(lang);
  const missing = Object.keys(allKeys).filter(k => !existing[k]);
  const total = Object.keys(allKeys).length;
  const done = total - missing.length;
  console.log(`\n${lang.toUpperCase()}: ${done}/${total} (${Math.round(done/total*100)}%) — ${missing.length} missing`);

  if (missing.length > 0) {
    const prefixes = {};
    for (const k of missing) {
      const p = k.split('.')[0];
      prefixes[p] = (prefixes[p] || 0) + 1;
    }
    console.log('Missing by prefix:');
    Object.entries(prefixes).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([p,c]) => console.log(`  ${p}: ${c}`));
  }
}
