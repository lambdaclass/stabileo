import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import huBody from '../translations/hu/safety-advisories';
import notice from '../../provenance/result-changes/snow-ridge-mesh.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');
const advisory = document('advisories/SA-2026-072-snow-ridge-subdivision.md');
const record = document('results-changes/2026-11-snow-ridge-mesh.md');

it.each<[PublicLocale, string, string]>([
  ["en", "High", "Fixed in PR #2175, pending release"],
  ["es", "Alta", "Corregido en PR #2175, pendiente de publicación"],
  ["pt", "Alta", "Corrigido no PR #2175, aguardando publicação"],
  ["de", "Hoch", "In PR #2175 behoben, Veröffentlichung ausstehend"],
  ["fr", "Élevée", "Corrigé dans la PR #2175, publication en attente"],
  ["tr", "Yüksek", "PR #2175 ile düzeltildi, yayın bekleniyor"],
  ['hu', 'Magas', 'Javítva a #2175 PR-ben, kiadásra vár'],
])('#2144 %s lists the snow advisory and regeneration notice', checkAdvisory);

function checkAdvisory(locale: PublicLocale, severity: string, status: string) {
  const post = findPost('safety-advisories')!;
  const blocks = (locale === 'hu' ? huBody : post.i18n[locale]!).blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-072');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.slice(2)).toEqual([severity, status]);
  expect(rows[0]![1]).toContain('#2144');
  expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-072 — ${status}.`)).toBe(true);
  expect(blocks.some(b => b.k === 'ext' && b.label === 'SA-2026-072' && b.href.endsWith('/docs/advisories/SA-2026-072-snow-ridge-subdivision.md'))).toBe(true);
  expect(notice.title[locale].trim()).not.toBe('');
  expect(notice.explanation[locale]).toContain('SA-2026-072');
  expect(post.updated).toBe('2026-11-16');
}
