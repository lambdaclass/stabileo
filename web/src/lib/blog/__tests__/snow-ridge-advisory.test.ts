import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import notice from '../../provenance/result-changes/snow-ridge-mesh.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');
const advisory = document('advisories/SA-2026-072-snow-ridge-subdivision.md');
const record = document('results-changes/2026-11-snow-ridge-mesh.md');

it.each<[PublicLocale, string, string]>([
  ["en", "High", "Fixed in PR #2175, pending merge and release"],
  ["es", "Alta", "Corregido en PR #2175, pendiente de integración y publicación"],
  ["pt", "Alta", "Corrigido no PR #2175, aguardando integração e publicação"],
  ["de", "Hoch", "In PR #2175 behoben, Zusammenführung und Veröffentlichung ausstehend"],
  ["fr", "Élevée", "Corrigé dans la PR #2175, fusion et publication en attente"],
  ["tr", "Yüksek", "PR #2175 ile düzeltildi, birleştirme ve yayın bekleniyor"],
])('#2144 %s lists the draft snow advisory and regeneration notice', (locale, severity, status) => {
  const post = findPost('safety-advisories')!;
  const blocks = post.i18n[locale]!.blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-072');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.slice(2)).toEqual([severity, status]);
  expect(rows[0]![1]).toContain('#2144');
  expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-072 — ${status}.`)).toBe(true);
  expect(blocks.some(b => b.k === 'ext' && b.label === 'SA-2026-072' && b.href.endsWith('/docs/advisories/SA-2026-072-snow-ridge-subdivision.md'))).toBe(true);
  expect(notice.explanation[locale]).toContain('SA-2026-072');
  expect(post.updated).toBe('2026-11-16');
});

it('#2144 follows the assigned advisory structure and retains only the recorded main witness', () => {
  const structure = (text: string) => text.split('\n').filter(line => line.startsWith('## ') || /^\| [A-Z][^|]+ \|/.test(line)).map(line => line.startsWith('## ') ? line : line.split('|')[1]!.trim());
  expect(structure(advisory)).toEqual(structure(document('advisories/SA-2026-068-provided-torsion-stirrups.md')));
  expect(advisory).toContain('Draft 2026-11-15; fixed in PR #2175, pending merge and release');
  expect(advisory).toContain('historical release binaries not assessed');
  expect(advisory).toContain('snow-ridge-mesh.json');
  for (const value of ['8e5c026b7', '16 by 4 m', '20 degrees', 'eight members', '0.8076923076923077', '0.40384615384615385']) {
    expect(record).toContain(value);
    expect(advisory).toContain(value);
  }
  expect(document('advisories/README.md')).toContain('[SA-2026-072](SA-2026-072-snow-ridge-subdivision.md)');
  expect(notice.when).toEqual({ all: ['snow', 'generatedLoads'] });
  expect(record).toContain('RUN_KNOWN_WRONG=2172');
});
