import { RESULT_CHANGES } from '../../provenance/full-registry';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import hu from '../translations/hu/safety-advisories';
import { buildPublicLocales } from '../../i18n/offered-research';
import type { PublicLocale } from '../../i18n/store.svelte';

const notice = RESULT_CHANGES.changes.find(change => change.id === 'concentrated-live-actions')!;

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');
const advisoryId = 'SA-2026-083';
const filename = `${advisoryId}-concentrated-live-actions.md`;
const locales: [PublicLocale, string, string][] = [
  ['en', 'High', 'Fixed in 0.6.2'],
  ['es', 'Alta', 'Corregido en 0.6.2'],
  ['pt', 'Alta', 'Corrigido em 0.6.2'],
  ['de', 'Hoch', 'Behoben in 0.6.2'],
  ['fr', 'Élevée', 'Corrigé dans 0.6.2'],
  ['tr', 'Yüksek', '0.6.2 sürümünde düzeltildi'],
  ['hu', 'Magas', 'Javítva a 0.6.2 verzióban'],
  ['it', 'Alta', 'Risolto nella 0.6.2'],
  ['zh', '高', '已在 0.6.2 中修复'],
];

it('#2207 covers every public advisory locale', () => {
  expect(locales.map(([locale]) => locale).sort()).toEqual([...buildPublicLocales(false), 'hu'].sort());
});

it.each(locales)('#2207 %s lists the assigned advisory and manual review action', (locale, severity, status) => {
  const blocks = (locale === 'hu' ? hu : findPost('safety-advisories')!.i18n[locale]!).blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === advisoryId);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.slice(2)).toEqual([severity, status]);
  expect(rows[0]![1]).toBe(`${notice.explanation[locale]} (#2207).`);
  expect(blocks.some(b => b.k === 'note' && b.t === `${advisoryId} — ${status}${locale === 'zh' ? '。' : '.'}`)).toBe(true);
  expect(blocks.some(b => b.k === 'ext' && b.label === advisoryId && b.href.endsWith(`/docs/advisories/${filename}`))).toBe(true);
  expect(notice.explanation[locale]).toContain(advisoryId);
  expect(notice.prs).toEqual([2236]);
});

it('#2207 records the silent main witness and requires correcting loads before solving again', () => {
  const advisory = document(`advisories/${filename}`);
  const structure = (text: string) => text.split('\n').filter(line => line.startsWith('## ') || /^\| [A-Z][^|]+ \|/.test(line)).map(line => line.startsWith('## ') ? line : line.split('|')[1]!.trim());
  expect(structure(advisory)).toEqual(structure(document('advisories/SA-2026-073-snow-crossing-moment.md')));
  expect(advisory).toContain('| Fix | PR [#2236](https://github.com/lambdaclass/stabileo/pull/2236); released in 0.6.2 |');
  expect(advisory).toContain('historical release binaries not assessed');
  expect(advisory).toContain('0c375732c8d533b984e6d68f0cddc792f5a6a594');
  expect(advisory).toContain('concentrated-live-actions.json');
  expect(advisory).toContain('Re-solving stored loads alone does not supply an omitted action.');
  const record = document('results-changes/2026-11-concentrated-live-actions.md');
  for (const value of ['1.25 kN·m', '3.65625 kN·m', '0.75 m', '9 kN']) {
    expect(advisory).toContain(value);
    expect(record).toContain(value);
  }
  expect(advisory).toContain('most unfavourable placements');
  expect(advisory).toContain('stairs');
  expect(advisory).toContain('passenger garages');
  expect(document('advisories/README.md')).toContain(`[${advisoryId}](${filename})`);
  expect(notice.when).toEqual({ any: ['generatedLoads'] });
  for (const explanation of Object.values(notice.explanation)) expect(explanation).toContain(advisoryId);
});
