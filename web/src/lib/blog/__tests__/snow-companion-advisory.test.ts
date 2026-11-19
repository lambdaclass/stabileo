import hu from '../translations/hu/safety-advisories';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import notice from '../../provenance/result-changes/snow-combination-validation.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const name = 'SA-2026-082-snow-companion-basis.md';
const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');

it.each<[PublicLocale, string, string]>([
  ['en', 'High', 'Fixed in 0.6.2'], ['es', 'Alta', 'Corregido en 0.6.2'], ['pt', 'Alta', 'Corrigido em 0.6.2'], ['de', 'Hoch', 'Behoben in 0.6.2'], ['fr', 'Élevée', 'Corrigé dans 0.6.2'], ['tr', 'Yüksek', '0.6.2 sürümünde düzeltildi'], ['hu', 'Magas', 'Javítva a 0.6.2 verzióban'],
])('#2211 %s catalogs SA-2026-082 with its localized action and fixed release', (locale, severity, status) => {
  const blocks = (locale === 'hu' ? hu : findPost('safety-advisories')!.i18n[locale]!).blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-082');
  expect(rows).toHaveLength(1);
  expect(rows[0]![1]).toContain('#2211');
  expect(rows[0]![2]).toBe(severity);
  expect(rows[0]![3]).toBe(status);
  expect(blocks.filter(b => b.k === 'note' && b.t === `SA-2026-082 — ${rows[0]![3]}.`)).toHaveLength(1);
  expect(blocks.filter(b => b.k === 'ext' && b.label === 'SA-2026-082' && b.href.endsWith(`/docs/advisories/${name}`))).toHaveLength(1);
  expect(notice.explanation[locale]).toContain(rows[0]![1]);
  expect(notice.explanation[locale]).toContain('SA-2026-082');
});

it('#2211 records the main-source scope separately from unmerged review defects', () => {
  const advisory = document(`advisories/${name}`);
  expect(advisory.match(/^## .+$/gm)).toEqual(document('advisories/SA-2026-073-snow-crossing-moment.md').match(/^## .+$/gm));
  expect(advisory).toContain('7170713acf5c52e0cb83d31c4572da382781bee5');
  expect(advisory).toContain('aa75ce1db');
  expect(advisory).toContain('unmerged-branch reinterpretation is not claimed as a released defect');
  expect(document('advisories/README.md')).toContain(`[SA-2026-082](${name})`);
  expect(document('SAFETY_ADVISORIES.md')).toContain(`[SA-2026-082](advisories/${name})`);
  expect(notice.when).toEqual({ all: ['snow'] });
  expect(notice.requiresLoadRegeneration).toBe(true);
  expect(document(notice.changelog.file.replace('docs/', ''))).toContain('#2233');
});
