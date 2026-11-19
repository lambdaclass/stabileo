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
  ["en", "High", "Fixed in 0.6.2"],
  ["es", "Alta", "Corregido en 0.6.2"],
  ["pt", "Alta", "Corrigido em 0.6.2"],
  ["de", "Hoch", "Behoben in 0.6.2"],
  ["fr", "Élevée", "Corrigé dans 0.6.2"],
  ["tr", "Yüksek", "0.6.2 sürümünde düzeltildi"],
  ['hu', 'Magas', 'Javítva a 0.6.2 verzióban'],
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
  expect(post.updated).toBe('2026-11-18');
}

it('#2144 follows the assigned advisory structure and retains only the recorded main witness', () => {
  const structure = (text: string) => text.split('\n').filter(line => line.startsWith('## ') || /^\| [A-Z][^|]+ \|/.test(line)).map(line => line.startsWith('## ') ? line : line.split('|')[1]!.trim());
  expect(structure(advisory)).toEqual(structure(document('advisories/SA-2026-068-provided-torsion-stirrups.md')));
  expect(advisory).toContain('Published 2026-11-18; drafted 2026-11-15');
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

it('known wrong result: #2099 — Hungarian snow guidance preserves subdivision, ridge-side loads and the unsplit-member limitation', () => {
  expect(notice.explanation.hu).toContain('tetőélek egyenlőtlen felosztása');
  expect(notice.explanation.hu).toContain('gerinc helyzetét');
  expect(notice.explanation.hu).toContain('Minden rúdszakasz');
  expect(notice.explanation.hu).toContain('gerincet felosztás nélkül keresztező tetőrudak');
  expect(notice.explanation.hu).toContain('(#2176)');
});
