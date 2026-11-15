import { expect, it } from 'vitest';
import { findPost } from '..';
import type { PublicLocale } from '../../i18n/store.svelte';

it.each<[PublicLocale, string, string]>([
  ['en', 'High', 'Fixed in 0.6.1'],
  ['es', 'Alta', 'Corregido en 0.6.1'],
  ['pt', 'Alta', 'Corrigido em 0.6.1'],
  ['de', 'Hoch', 'Behoben in 0.6.1'],
  ['fr', 'Élevée', 'Corrigé dans 0.6.1'],
  ['tr', 'Yüksek', '0.6.1 sürümünde düzeltildi'],
])('#2089 %s lists the transverse-load Cm advisory', (locale, severity, status) => {
  const blocks = findPost('safety-advisories')!.i18n[locale]!.blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-066');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.slice(2)).toEqual([severity, status]);
  expect(rows[0]![1]).toContain('Cm');
  expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-066 — ${status}.`)).toBe(true);
});
