import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPost } from '../../blog';
import huBody from '../../blog/translations/hu/safety-advisories';
import { readRegistry, readRegistryAt } from '../../../../scripts/result-changes/registry.mjs';

const root = process.env.RELEASE_062_REPO_ROOT ?? resolve(__dirname, '../../../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const baseline = readRegistryAt('v0.6.1');
if (!baseline) throw new Error('Missing v0.6.1 registry');
const current = readRegistryAt('0c375732c');
if (!current) throw new Error('Missing 0.6.2 source registry');
const localised = new Map(readRegistry().changes.map(change => [change.id, change]));
const previousIds = new Set(baseline.changes.map(c => c.id));
const changes = current.changes.filter(c => !previousIds.has(c.id)).map(change => {
  const entry = localised.get(change.id);
  if (!entry) throw new Error(`Missing registry entry ${change.id}`);
  return { ...change, title: entry.title };
});
const locales = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu'] as const;
const advisoryFiles = [
  'SA-2026-069-torsion-secondary-shear.md',
  'SA-2026-070-interior-member-couples.md',
  'SA-2026-071-incomplete-concurrent-demands.md',
  'SA-2026-072-snow-ridge-subdivision.md',
  'SA-2026-073-snow-crossing-moment.md',
  'SA-2026-074-snow-panel-subdivision.md',
];
const openIssues = [2171, 2199, 2200, 2201, 2202, 2203, 2204, 2205, 2206, 2207, 2208, 2209, 2210, 2211, 2212, 2213, 2214, 2215, 2216, 2217, 2218, 2222, 2225, 2226, 2227, 2125];

describe('release 0.6.2 disclosures', () => {
  it.each(locales)('%s lists the exact new registry notices and all fixed advisories', locale => {
    const notes = read(`docs/releases/v0.6.2${locale === 'en' ? '' : `.${locale}`}.md`);
    expect(baseline.currentResultsVersion).toBe(80);
    expect(current.currentResultsVersion).toBe(86);
    expect(changes).toHaveLength(11);
    const resultRows = notes.split('\n').filter(line => /^\| \d+ \|/.test(line));
    expect(resultRows).toHaveLength(changes.length);
    for (const change of changes) {
      const title = change.title[locale];
      expect(title).toBeTruthy();
      expect(resultRows).toContain(`| ${change.resultsVersion} | [${title}](../results-changes/${change.changelog.file.split('/').pop()}) |`);
    }
    for (const file of advisoryFiles) {
      expect(notes.split('\n').filter(line => line.startsWith(`| [${file.slice(0, 11)}]`))).toHaveLength(1);
      expect(notes).toContain(`](../advisories/${file})`);
    }
    for (const issue of openIssues) expect(notes).toContain(`https://github.com/lambdaclass/stabileo/issues/${issue}`);
    expect(notes).toContain('SA-2026-056');
    expect(notes).toContain('SA-2026-044');
    expect(notes).toContain('2026-11-16');
    expect(notes).toContain('**v0.6.1**');
    expect(notes).not.toMatch(/SA-2026-06[4-8]/);
  });

  it.each(locales)('%s publishes all six fixed advisories with their user action', locale => {
    const status = {
      en: 'Fixed in 0.6.2', es: 'Corregido en 0.6.2', pt: 'Corrigido em 0.6.2',
      de: 'Behoben in 0.6.2', fr: 'Corrigé dans 0.6.2', tr: '0.6.2 sürümünde düzeltildi',
      hu: 'Javítva a 0.6.2 verzióban',
    }[locale];
    const blocks = (locale === 'hu' ? huBody : findPost('safety-advisories')!.i18n[locale]!).blocks;
    const table = blocks.find(block => block.k === 'table');
    if (table?.k !== 'table') throw new Error('Missing advisory table');
    const notes = read(`docs/releases/v0.6.2${locale === 'en' ? '' : `.${locale}`}.md`);
    for (const file of advisoryFiles) {
      const id = file.slice(0, 11);
      const rows = table.rows.filter(row => row[0] === id);
      expect(rows).toHaveLength(1);
      expect(rows[0]![3]).toBe(status);
      expect(notes).toContain(rows[0]![1]);
      expect(blocks.filter(block => block.k === 'note' && block.t === `${id} — ${status}.`)).toHaveLength(1);
    }
  });

  it.each(advisoryFiles)('%s records publication and the fixed release in both catalogs', file => {
    const advisory = read(`docs/advisories/${file}`);
    expect(advisory).toContain('| Status | Published 2026-11-16; drafted ');
    expect(advisory).toContain('| Fixed release | 0.6.2 |');
    expect(advisory).toContain('; released in 0.6.2 |');
    expect(advisory).not.toMatch(/pending merge and release|pending release|remains outside this correction/);
    const row = read('docs/advisories/README.md').split('\n').find(line => line.startsWith(`| [${file.slice(0, 11)}]`));
    expect(row).toContain('| 0.6.2 | Published 2026-11-16;');
    expect(read('docs/SAFETY_ADVISORIES.md')).toContain(`](advisories/${file})`);
  });

  it('leads with regeneration and discloses the ongoing audit without claiming the unmerged notice', () => {
    const notes = read('docs/releases/v0.6.2.md');
    expect(notes).toContain('**regenerate the loads first**');
    expect(notes).toContain('Re-solving stored loads alone does not repair them.');
    expect(notes).toContain('An internal audit of load generation and concrete design is in progress, with open findings.');
    expect(notes).not.toContain('under audit');
    const changelog = read('CHANGELOG.md').split('## 0.6.2 (2026-11-16)\n')[1]?.split('\n## ')[0];
    expect(changelog).toBeTruthy();
    expect(changelog).not.toMatch(/\b(?:CI|E2E|prerender|Playwright|Vitest|typecheck|round \d+|review round|pending merge)\b/i);
    for (const locale of locales) expect(changelog).toContain(`docs/releases/v0.6.2${locale === 'en' ? '' : `.${locale}`}.md`);
    expect(read('VERSION').trim()).toBe('0.6.2');
    expect(JSON.parse(read('web/package.json')).version).toBe('0.6.2');
  });
});
