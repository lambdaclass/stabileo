import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import huBody from '../translations/hu/safety-advisories';
import notice from '../../provenance/result-changes/directional-stirrup-legs.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');
const advisory = document('advisories/SA-2026-075-directional-stirrup-legs.md');
const record = document('results-changes/2026-11-directional-stirrup-legs.md');

it.each<[PublicLocale, string, string]>([
  ["en", "High", "Fixed in PR #2198, pending merge and release"],
  ["es", "Alta", "Corregido en PR #2198, pendiente de integración y publicación"],
  ["pt", "Alta", "Corrigido no PR #2198, aguardando integração e publicação"],
  ["de", "Hoch", "In PR #2198 behoben, Zusammenführung und Veröffentlichung ausstehend"],
  ["fr", "Élevée", "Corrigé dans la PR #2198, fusion et publication en attente"],
  ["hu", "Magas", "Javítva a #2198 PR-ben, összevonásra és kiadásra vár"],
  ["tr", "Yüksek", "PR #2198 ile düzeltildi, birleştirme ve yayın bekleniyor"],
])('#2171 %s lists the draft directional-stirrup advisory and recheck notice', (locale, severity, status) => {
  const post = findPost('safety-advisories')!;
  const blocks = (locale === 'hu' ? huBody : post.i18n[locale]!).blocks;
  const table = blocks.find(b => b.k === 'table');
  if (table?.k !== 'table') throw new Error('Missing advisory table');
  const rows = table.rows.filter(r => r[0] === 'SA-2026-075');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.slice(2)).toEqual([severity, status]);
  expect(rows[0]![1]).toContain('#2171');
  expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-075 — ${status}.`)).toBe(true);
  expect(blocks.some(b => b.k === 'ext' && b.label === 'SA-2026-075' && b.href.endsWith('/docs/advisories/SA-2026-075-directional-stirrup-legs.md'))).toBe(true);
  expect(notice.explanation[locale]).toContain('SA-2026-075');
  expect(post.updated).toBe('2026-11-16');
});

it('#2171 follows the assigned advisory structure and retains only the recorded main witness', () => {
  const structure = (text: string) => text.split('\n').filter(line => line.startsWith('## ') || /^\| [A-Z][^|]+ \|/.test(line)).map(line => line.startsWith('## ') ? line : line.split('|')[1]!.trim());
  expect(structure(advisory)).toEqual(structure(document('advisories/SA-2026-072-snow-ridge-subdivision.md')));
  expect(advisory).toContain('Draft 2026-11-16; fixed in PR #2198, pending merge and release');
  expect(advisory).toContain('historical release binaries not assessed');
  expect(advisory).toContain('directional-stirrup-legs.json');
  for (const value of ['9d925a780', '95.4770355', '141.31601999999998', '90.93051', '1.05']) {
    expect(record).toContain(value);
    expect(advisory).toContain(value);
  }
  expect(document('advisories/README.md')).toContain('[SA-2026-075](SA-2026-075-directional-stirrup-legs.md)');
  expect(notice.when).toEqual({ any: ['concreteMembers'] });
  expect(notice.prs).toEqual([2198]);
  expect(advisory).toContain('| Fix | PR #2198; pending merge and release |');
});


const known = process.env.RUN_KNOWN_WRONG === '2198' ? it : it.skip;
known('known wrong result: #2198 advisory screening includes equal directional counts and omitted checks', () => {
  expect(advisory).toContain('regardless of the relationship between primary and secondary leg counts');
  expect(advisory).toContain('insufficient leg distribution');
  expect(advisory).toContain('omitted secondary-shear checks');
  expect(advisory).toContain('two primary and two secondary legs');
  expect(advisory).not.toContain('Review concrete cages with more than two primary legs');
});
