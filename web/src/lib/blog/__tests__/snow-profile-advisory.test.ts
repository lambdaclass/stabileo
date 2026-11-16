import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import crossing from '../../provenance/result-changes/snow-crossing-profile.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');

for (const [issue, sa, name, notice] of [[2176, 'SA-2026-073', 'snow-crossing-moment', crossing]] as const) {
  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Pending'], ['es', 'Alta', 'Pendiente'], ['pt', 'Alta', 'Pendente'],
    ['de', 'Hoch', 'Ausstehend'], ['fr', 'Élevée', 'En attente'], ['tr', 'Yüksek', 'Bekleniyor'],
  ])(`#${issue} %s has the assigned advisory and regeneration notice`, (locale, severity, status) => {
    const blocks = findPost('safety-advisories')!.i18n[locale]!.blocks;
    const table = blocks.find(b => b.k === 'table');
    if (table?.k !== 'table') throw new Error('Missing advisory table');
    const rows = table.rows.filter(r => r[0] === sa);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(rows[0]![1]).toContain(`#${issue}`);
    expect(blocks.some(b => b.k === 'note' && b.t === `${sa} — ${status}.`)).toBe(true);
    expect(blocks.some(b => b.k === 'ext' && b.label === sa && b.href.endsWith(`/docs/advisories/${sa}-${name}.md`))).toBe(true);
    expect(notice.explanation[locale]).toContain(sa);
    expect(notice.when).toEqual({ all: ['snow', 'generatedLoads'] });
    expect(document(`advisories/${sa}-${name}.md`)).toContain('| Fix | pending |');
    expect(document('advisories/README.md')).toContain(`[${sa}](${sa}-${name}.md)`);
    expect(document(notice.changelog.file.replace('docs/', ''))).toContain(`#${issue}`);
  });
}
