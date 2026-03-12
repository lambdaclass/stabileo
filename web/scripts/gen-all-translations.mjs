#!/usr/bin/env node
// Generates complete translation JSON files for FR, IT, TR, HI
// Uses en.ts as source and applies language-specific translations
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', 'src', 'lib', 'i18n', 'locales');

// Extract all keys from en.ts
const en = readFileSync(join(localesDir, 'en.ts'), 'utf8');
const allKeys = {};
const regex = /'([^']+)':\s*'([^']*(?:\\'[^']*)*)'/g;
let m;
while ((m = regex.exec(en)) !== null) {
  allKeys[m[1]] = m[2];
}
console.log(`Total keys: ${Object.keys(allKeys).length}`);

// Load existing translations for a language
function loadExisting(lang) {
  const dir = join(__dirname, 'translations');
  const patches = {};
  try {
    const files = readdirSync(dir).filter(f => f.startsWith(`${lang}_`) && f.endsWith('.json')).sort();
    for (const f of files) {
      Object.assign(patches, JSON.parse(readFileSync(join(dir, f), 'utf8')));
    }
  } catch(e) {}
  return patches;
}

// For each language, generate a complete translation file
// This uses the existing patches + fills missing keys
const languages = ['fr', 'it', 'tr', 'hi'];

for (const lang of languages) {
  const existing = loadExisting(lang);
  const missing = Object.keys(allKeys).filter(k => !existing[k]);
  console.log(`${lang}: ${Object.keys(existing).length} existing, ${missing.length} missing`);
}
