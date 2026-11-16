import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPost } from '..';
import notice from '../../provenance/result-changes/interior-member-couples.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const advisoryFile = 'SA-2026-070-interior-member-couples.md';
const readAdvisory = (file: string) => readFileSync(new URL(`../../../../../docs/advisories/${file}`, import.meta.url), 'utf8');

describe('SA-2026-070 interior member recovery', () => {
  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Fixed in PR #2170, pending merge and release'],
    ['es', 'Alta', 'Corregido en PR #2170, pendiente de integración y publicación'],
    ['pt', 'Alta', 'Corrigido no PR #2170, aguardando integração e publicação'],
    ['de', 'Hoch', 'Behoben in PR #2170, Zusammenführung und Veröffentlichung ausstehend'],
    ['fr', 'Élevée', 'Corrigé dans PR #2170, fusion et publication en attente'],
    ['tr', 'Yüksek', 'PR #2170 içinde düzeltildi, birleştirme ve yayın bekleniyor'],
  ])('%s lists the pending fix in the catalog, status, link and saved-project notice', (locale, severity, status) => {
    const post = findPost('safety-advisories')!;
    const blocks = post.i18n[locale]!.blocks;
    const table = blocks.find(b => b.k === 'table');
    if (table?.k !== 'table') throw new Error('Missing advisory table');
    const rows = table.rows.filter(r => r[0] === 'SA-2026-070');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(rows[0]![1]).toContain('#2143');
    expect(blocks.some(b => b.k === 'note' && b.t === `SA-2026-070 — ${status}.`)).toBe(true);
    expect(blocks.some(b => b.k === 'ext' && b.label === 'SA-2026-070' && b.href.endsWith(`/docs/advisories/${advisoryFile}`))).toBe(true);
    expect(notice.explanation[locale]).toContain('SA-2026-070');
    expect(post.updated).toBe('2026-11-15');
  });

  it('retains the reference structure and distinguishes an unmerged fix from a released version', () => {
    const text = readAdvisory(advisoryFile);
    const reference = readAdvisory('SA-2026-068-provided-torsion-stirrups.md');
    expect(text.match(/^## .+$/gm)).toEqual(reference.match(/^## .+$/gm));
    const fields = (s: string) => [...s.matchAll(/^\| ([^|]+) \|/gm)].map(m => m[1]);
    expect(fields(text)).toEqual(fields(reference));
    expect(text).toContain('| Severity | High |');
    expect(text).toContain('Draft 2026-11-15; fixed in PR #2170, pending merge and release');
    expect(text).toContain('| Fixed release | Not yet released |');
    expect(text).toContain('44966b6e75f72ce268ec87798d5cd880a6dba144');
    expect(readAdvisory('README.md')).toContain(`[SA-2026-070](${advisoryFile})`);
    expect(notice.prs).toEqual([2170]);
    expect(notice.when).toEqual({ all: ['members', 'memberLoads'] });
  });

  it('discloses the witness, trapezoid and missing-EI behavior, and the check consumers', () => {
    const text = readAdvisory(advisoryFile);
    for (const evidence of [
      '−3.6e−6 m', 'partial trapezoid', 'full trapezoid', 'missing', 'nonfinite', '1e-6',
      'serviceability checks consumed', 'No strength design check consumed',
      'service-deflection.ts', 'serviceability.ts', '2D', '3D', 'education',
      'not a bound', 'historical release binaries',
    ]) expect(text).toContain(evidence);
  });
});
