import { expect, it } from 'vitest';
import { findPost } from '..';
import type { PublicLocale } from '../../i18n/store.svelte';

const regression = process.env.RUN_KNOWN_WRONG ? it : it.skip;
regression.each<[PublicLocale, string, string]>([
  ['en', 'High', 'Draft: fixed in PR #2080, pending merge and release'],
  ['es', 'Alta', 'Borrador: corregido en PR #2080, pendiente de integración y publicación'],
  ['pt', 'Alta', 'Rascunho: corrigido no PR #2080, aguardando integração e lançamento'],
  ['de', 'Hoch', 'Entwurf: in PR #2080 behoben, Zusammenführung und Veröffentlichung ausstehend'],
  ['fr', 'Élevée', 'Brouillon : corrigé dans PR #2080, fusion et publication en attente'],
  ['tr', 'Yüksek', 'Taslak: PR #2080 içinde düzeltildi, birleştirme ve yayın bekleniyor'],
])('#[ignore = "known wrong result: #2089"] %s lists the transverse-load Cm advisory', (locale, severity, status) => {
  const blocks = findPost('safety-advisories')!.i18n[locale]!.blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-066');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.slice(2)).toEqual([severity, status]);
  expect(rows[0]![1]).toContain('Cm');
  expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-066 — ${status}.`)).toBe(true);
});
