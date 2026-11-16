import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findPost } from '..';
import crossing from '../../provenance/result-changes/snow-crossing-profile.json';
import panel from '../../provenance/result-changes/snow-panel-geometry.json';
import type { PublicLocale } from '../../i18n/store.svelte';

const regenerationAction: Record<PublicLocale, string> = {
  en: 'Regenerate all affected generated area loads, then rerun analyses, combinations and design checks.',
  es: 'Regenere todas las cargas de área generadas afectadas y repita análisis, combinaciones y verificaciones.',
  pt: 'Gere novamente todas as cargas de área geradas afetadas e repita análises, combinações e verificações.',
  de: 'Alle betroffenen erzeugten Flächenlasten neu erzeugen und Analysen, Kombinationen und Nachweise wiederholen.',
  fr: 'Régénérez toutes les charges surfaciques générées concernées puis relancez analyses, combinaisons et vérifications.',
  tr: 'Etkilenen tüm üretilmiş alan yüklerini yeniden üretip analizleri, birleşimleri ve kontrolleri tekrarlayın.',
};

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');

for (const [issue, sa, name, notice] of [[2176, 'SA-2026-073', 'snow-crossing-moment', crossing], [2172, 'SA-2026-074', 'snow-panel-subdivision', panel]] as const) {
  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'PR #2197; pending merge and release'], ['es', 'Alta', 'PR #2197; pendiente de integración y publicación'], ['pt', 'Alta', 'PR #2197; aguardando integração e publicação'],
    ['de', 'Hoch', 'PR #2197; Zusammenführung und Veröffentlichung ausstehend'], ['fr', 'Élevée', 'PR #2197; fusion et publication en attente'], ['tr', 'Yüksek', 'PR #2197; birleştirme ve yayın bekleniyor'],
  ])(`#${issue} %s has the assigned advisory and regeneration notice`, (locale, severity, status) => {
    const blocks = findPost('safety-advisories')!.i18n[locale]!.blocks;
    const table = blocks.find(b => b.k === 'table');
    if (table?.k !== 'table') throw new Error('Missing advisory table');
    const rows = table.rows.filter(r => r[0] === sa);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(rows[0]![1]).toContain(`#${issue}`);
    expect(rows[0]![1]).toContain(regenerationAction[locale]);
    expect(notice.explanation[locale]).toContain(regenerationAction[locale]);
    expect(document(`advisories/${sa}-${name}.md`).replace(/\s+/g, ' ')).toContain(regenerationAction.en);
    expect(blocks.some(b => b.k === 'note' && b.t === `${sa} — ${status}.`)).toBe(true);
    expect(blocks.some(b => b.k === 'ext' && b.label === sa && b.href.endsWith(`/docs/advisories/${sa}-${name}.md`))).toBe(true);
    expect(notice.explanation[locale]).toContain(sa);
    expect(notice.when).toEqual({ all: issue === 2172 ? ['generatedLoads'] : ['snow', 'generatedLoads'] });
    expect(document(`advisories/${sa}-${name}.md`)).toContain('| Fix | PR [#2197](https://github.com/lambdaclass/stabileo/pull/2197); pending merge and release |');
    expect(document('advisories/README.md')).toContain(`[${sa}](${sa}-${name}.md)`);
    expect(document(notice.changelog.file.replace('docs/', ''))).toContain(`#${issue}`);
  });
}
