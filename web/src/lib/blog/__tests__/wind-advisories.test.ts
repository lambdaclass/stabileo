import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import notice from '../../provenance/result-changes/wind-physical-pressure-field.json';
import hu from '../translations/hu/safety-advisories';
import type { PublicLocale } from '../../i18n/store.svelte';

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');
const entries = [
  ['SA-2026-076', 2203, 'wind-enclosure'],
  ['SA-2026-077', 2204, 'wind-wall-height-transfer'],
  ['SA-2026-078', 2205, 'wind-roof-pressure-zones'],
] as const;

it.each<[PublicLocale | 'hu', string, string]>([
  ['en', 'High', 'Fixed in 0.6.2'],
  ['es', 'Alta', 'Corregido en 0.6.2'],
  ['pt', 'Alta', 'Corrigido em 0.6.2'],
  ['de', 'Hoch', 'Behoben in 0.6.2'],
  ['fr', 'Élevée', 'Corrigé dans 0.6.2'],
  ['hu', 'Magas', 'Javítva a 0.6.2 verzióban'],
  ['tr', 'Yüksek', '0.6.2 sürümünde düzeltildi'],
])('%s catalogs the three assigned wind advisories with regeneration instructions', (locale, severity, status) => {
  const post = findPost('safety-advisories')!;
  const blocks = locale === 'hu' ? hu.blocks : post.i18n[locale]!.blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const ids = table.rows.map(row => row[0]!);
  expect(ids).toEqual([...ids].sort());
  for (const id of ['SA-2026-071', 'SA-2026-073', 'SA-2026-074', ...entries.map(([id]) => id)]) expect(ids.filter(value => value === id)).toHaveLength(1);
  for (const [id, issue, slug] of entries) {
    const rows = table.rows.filter(r => r[0] === id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(rows[0]![1]).toContain(`#${issue}`);
    expect(rows[0]![1]).toContain('W'); expect(rows[0]![1]).toContain('Wa');
    expect(blocks.some(b => b.k === 'note' && b.t === `${id} — ${status}.`)).toBe(true);
    expect(blocks.some(b => b.k === 'ext' && b.label === id && b.href.endsWith(`/docs/advisories/${id}-${slug}.md`))).toBe(true);
    expect(notice.explanation[locale]).toContain(id);
  }
  expect(post.updated).toBe('2026-11-20');
  expect(table.rows.some(r => /^SA-2026-07[6-8]$/.test(r[0]!) && r[1]!.includes('#2206'))).toBe(false);
});

it('wind advisories preserve the assigned template and fixed release', () => {
  const structure = (text: string) => text.split('\n').filter(line => line.startsWith('## ') || /^\| [A-Z][^|]+ \|/.test(line)).map(line => line.startsWith('## ') ? line : line.split('|')[1]!.trim());
  for (const [id, issue, slug] of entries) {
    const text = document(`advisories/${id}-${slug}.md`);
    expect(structure(text)).toEqual(structure(document('advisories/SA-2026-072-snow-ridge-subdivision.md')));
    expect(text).toContain(`Issue | [#${issue}]`);
    expect(text).toContain('Published 2026-11-18; drafted 2026-11-16');
    expect(text).toContain('| Fix | PR [#2220](https://github.com/lambdaclass/stabileo/pull/2220); released in 0.6.2 |');
    expect(text).toContain('9d925a780');
    expect(text).toContain('historical release binaries not assessed');
    expect(text).toContain('wind-physical-pressure-field.json');
    expect(document('advisories/README.md')).toContain(`[${id}](${id}-${slug}.md)`);
  }
  expect(document('advisories/SA-2026-077-wind-wall-height-transfer.md')).toContain('only on the unmerged PR #2220 branch');
  expect(notice.when).toEqual({ all: ['generatedWindLoads'] });
});
