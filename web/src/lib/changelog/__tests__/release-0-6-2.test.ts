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
const current = readRegistryAt('c4c7761200759068b73a2226cb2fea7c8c7dd31c');
if (!current) throw new Error('Missing 0.6.2 source registry');
const previousIds = new Set(baseline.changes.map(change => change.id));
const changes = current.changes.filter(change => !previousIds.has(change.id));
const locales = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu'] as const;
const advisoryFiles = [
  'SA-2026-069-torsion-secondary-shear.md',
  'SA-2026-070-interior-member-couples.md',
  'SA-2026-071-incomplete-concurrent-demands.md',
  'SA-2026-072-snow-ridge-subdivision.md',
  'SA-2026-073-snow-crossing-moment.md',
  'SA-2026-074-snow-panel-subdivision.md',
  'SA-2026-075-cirsoc201-secondary-stirrup-legs.md',
  'SA-2026-076-wind-enclosure.md',
  'SA-2026-077-wind-wall-height-transfer.md',
  'SA-2026-078-wind-roof-pressure-zones.md',
  'SA-2026-079-gravity-shell-coverage.md',
  'SA-2026-080-floor-zone-eccentricity.md',
  'SA-2026-082-snow-companion-basis.md',
  'SA-2026-083-concentrated-live-actions.md',
  'SA-2026-089-roller-z-fixed.md',
];
const linkedEvidence = {
  'SA-2026-088': '2026-11-gravity-core.md#combined-member-diagram-extrema',
  'SA-2026-090': '2026-11-gravity-core.md#width-mode-level-mass-follows-loaded-carriers',
};
const fixedIssues = [2171, 2199, 2200, 2201, 2203, 2204, 2205, 2206, 2207, 2210, 2211, 2222];
const openIssues = [2202, 2208, 2209, 2212, 2213, 2214, 2215, 2216, 2217, 2218, 2225, 2226, 2227, 2125];

describe('release 0.6.2 disclosures', () => {
  it('preserves the source results versions in the release build', () => {
    const built = readRegistry();
    const builtVersions = new Map(built.changes.map(change => [change.id, change.resultsVersion]));
    expect(built.currentResultsVersion).toBeGreaterThanOrEqual(current.currentResultsVersion);
    expect(current.changes.map(change => builtVersions.get(change.id)))
      .toEqual(current.changes.map(change => change.resultsVersion));
  });

  it.each(locales)('%s lists the exact new registry notices and all fixed advisories', locale => {
    const notes = read(`docs/releases/v0.6.2${locale === 'en' ? '' : `.${locale}`}.md`);
    expect(baseline.currentResultsVersion).toBe(80);
    expect(current.currentResultsVersion).toBe(95);
    expect(changes).toHaveLength(57);
    const resultRows = notes.split('\n').filter(line => /^\| \d+ \|/.test(line));
    expect(resultRows).toHaveLength(changes.length);
    const remaining = [...resultRows];
    for (const change of changes) {
      const title = change.title[locale];
      const file = change.changelog.file.split('/').pop();
      const row = remaining.findIndex(line => title
        ? line === `| ${change.resultsVersion} | [${title}](../results-changes/${file}) |`
        : line.startsWith(`| ${change.resultsVersion} | [`) && line.endsWith(`](../results-changes/${file}) |`));
      expect(row, `${locale}: missing ${change.id}`).toBeGreaterThanOrEqual(0);
      remaining.splice(row, 1);
    }
    expect(resultRows.every(line => /\[[^\]]+\]\(/.test(line))).toBe(true);
    expect(remaining).toEqual([]);
    for (const file of advisoryFiles) {
      expect(notes.split('\n').filter(line => line.startsWith(`| [${file.slice(0, 11)}]`))).toHaveLength(1);
      expect(notes).toContain(`](../advisories/${file})`);
    }
    for (const [id, record] of Object.entries(linkedEvidence)) {
      expect(notes.split('\n').filter(line => line.startsWith(`| [${id}]`))).toHaveLength(1);
      expect(notes).toContain(`[${id}](../results-changes/${record})`);
    }
    for (const issue of fixedIssues) expect(notes).not.toContain(`https://github.com/lambdaclass/stabileo/issues/${issue})`);
    for (const issue of openIssues) expect(notes).toContain(`https://github.com/lambdaclass/stabileo/issues/${issue}`);
    expect(notes).toContain('SA-2026-056');
    expect(notes).toContain('SA-2026-044');
    expect(notes).toContain('2026-11-18');
    expect(notes).toContain('**v0.6.1**');
    expect(notes).not.toMatch(/SA-2026-06[4-8]/);
  });

  it.each(locales)('%s publishes all documented fixed advisories with their user action', locale => {
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
    for (const [id, record] of Object.entries(linkedEvidence)) {
      expect(blocks.filter(block => block.k === 'note' && block.t === `${id} — ${status}.`)).toHaveLength(1);
      expect(blocks.filter(block => block.k === 'ext' && block.label === id &&
        block.href.endsWith(`/docs/results-changes/${record}`))).toHaveLength(1);
      expect(read('docs/SAFETY_ADVISORIES.md')).toContain(`[${id}](results-changes/${record})`);
      expect(read('docs/advisories/README.md')).toContain(`[${id}](../results-changes/${record})`);
    }
  });

  it.each(advisoryFiles)('%s records publication and the fixed release in both catalogs', file => {
    const advisory = read(`docs/advisories/${file}`);
    expect(advisory).toContain('| Status | Published 2026-11-18; drafted ');
    expect(advisory).toContain('| Fixed release | 0.6.2 |');
    expect(advisory.split('## Fixed in')[1]?.split('##')[0]).toContain('0.6.2');
    expect(advisory).toContain('; released in 0.6.2 |');
    expect(advisory).not.toMatch(/pending merge and release|pending release|remains outside this correction/);
    const row = read('docs/advisories/README.md').split('\n').find(line => line.startsWith(`| [${file.slice(0, 11)}]`));
    expect(row).toContain('| 0.6.2 | Published 2026-11-18;');
    expect(read('docs/SAFETY_ADVISORIES.md')).toContain(`](advisories/${file})`);
  });

  it('leads with regeneration and discloses the ongoing audit and includes the audit notice', () => {
    const notes = read('docs/releases/v0.6.2.md');
    expect(notes).toContain('**regenerate the loads first**');
    expect(notes).toContain('Re-solving stored loads alone does not repair them.');
    expect(notes).toContain('An internal audit of load generation and concrete design is in progress, with open findings.');
    expect(notes).toContain('now carry an audit notice');
    const changelog = read('CHANGELOG.md').split('## 0.6.2 (2026-11-18)\n')[1]?.split('\n## ')[0];
    expect(changelog).toBeTruthy();
    for (const id of [...advisoryFiles.map(file => file.slice(0, 11)), ...Object.keys(linkedEvidence)]) {
      expect(changelog).toContain(id);
    }
    expect(changelog).not.toMatch(/\b(?:CI|E2E|prerender|Playwright|Vitest|typecheck|round \d+|review round|pending merge)\b/i);
    for (const locale of locales) expect(changelog).toContain(`docs/releases/v0.6.2${locale === 'en' ? '' : `.${locale}`}.md`);
    expect(read('VERSION').trim()).toBe('0.6.2');
    expect(JSON.parse(read('web/package.json')).version).toBe('0.6.2');
  });
});
