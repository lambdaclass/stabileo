#!/usr/bin/env node
// Applies translations from JSON patch files to generate locale .ts files
// Usage: node scripts/translate.mjs <lang> <json_dir>
// Reads en.ts, applies translations from <json_dir>/<lang>_*.json, writes <lang>.ts

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', 'src', 'lib', 'i18n', 'locales');

const lang = process.argv[2];
const jsonDir = process.argv[3] || join(__dirname, 'translations');

if (!lang) { console.error('Usage: node translate.mjs <lang> [json_dir]'); process.exit(1); }

// Read en.ts
const enContent = readFileSync(join(localesDir, 'en.ts'), 'utf8');

// Load all translation patches for this language
const patches = {};
const files = readdirSync(jsonDir).filter(f => f.startsWith(`${lang}_`) && f.endsWith('.json')).sort();
for (const f of files) {
  const data = JSON.parse(readFileSync(join(jsonDir, f), 'utf8'));
  Object.assign(patches, data);
}

console.log(`Loaded ${Object.keys(patches).length} translations for ${lang}`);

// Replace values in en.ts content
let output = enContent;

// Change variable name and type annotation
output = output.replace(
  /^const en: Record<string, string> = \{/m,
  `import type { Translations } from '../types';\nconst ${lang}: Translations = {`
);
output = output.replace(/^export default en;$/m, `export default ${lang};`);

// Replace each key's value line by line for robustness with escaped quotes
const lines = output.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Match lines like:  'some.key': 'some value',
  const lineMatch = line.match(/^(\s*'([^']+)':\s*')(.*)',?\s*$/);
  if (!lineMatch) continue;
  const [, prefix, lineKey] = lineMatch;
  if (patches[lineKey] === undefined) continue;
  // Escape the new value for TS single-quoted string
  const escaped = patches[lineKey].replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/'/g, "\\'");
  // Preserve trailing comma
  const hasComma = line.trimEnd().endsWith(',');
  lines[i] = `${prefix}${escaped}'${hasComma ? ',' : ''}`;
}
output = lines.join('\n');

writeFileSync(join(localesDir, `${lang}.ts`), output, 'utf8');

// Count how many keys are still in English
const enLines = enContent.match(/'([^']+)':\s*'([^']*(?:\\'[^']*)*)'/g) || [];
const outLines = output.match(/'([^']+)':\s*'([^']*(?:\\'[^']*)*)'/g) || [];
const totalKeys = enLines.length;
const translatedKeys = Object.keys(patches).length;
console.log(`Written ${lang}.ts: ${totalKeys} total keys, ${translatedKeys} translated (${Math.round(translatedKeys/totalKeys*100)}%)`);
