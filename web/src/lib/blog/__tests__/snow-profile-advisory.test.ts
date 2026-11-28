import hu from '../translations/hu/safety-advisories';
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
  hu: 'Állítsa elő újra az összes érintett generált felületi terhet, majd futtassa újra az analíziseket, kombinációkat és méretezési ellenőrzéseket.',
  tr: 'Etkilenen tüm üretilmiş alan yüklerini yeniden üretip analizleri, birleşimleri ve kontrolleri tekrarlayın.',
  zh: '请重新生成所有受影响的生成面荷载，然后重新运行分析、组合和设计验算。',
  ko: '영향받는 생성된 면하중을 모두 다시 생성한 뒤 해석, 조합, 설계 검토를 다시 실행하십시오.',
};

const document = (path: string) => readFileSync(new URL(`../../../../../docs/${path}`, import.meta.url), 'utf8');

for (const [issue, sa, name, notice] of [[2176, 'SA-2026-073', 'snow-crossing-moment', crossing], [2172, 'SA-2026-074', 'snow-panel-subdivision', panel]] as const) {
  it.each<[PublicLocale, string, string]>([
    ['en', 'High', 'Fixed in 0.6.2'], ['es', 'Alta', 'Corregido en 0.6.2'], ['pt', 'Alta', 'Corrigido em 0.6.2'],
    ['hu', 'Magas', 'Javítva a 0.6.2 verzióban'],
    ['de', 'Hoch', 'Behoben in 0.6.2'], ['fr', 'Élevée', 'Corrigé dans 0.6.2'], ['tr', 'Yüksek', '0.6.2 sürümünde düzeltildi'],
    ['zh', '高', '已在 0.6.2 中修复'],
    ['ko', '높음', '0.6.2에서 수정됨'],
  ])(`#${issue} %s has the assigned advisory and regeneration notice`, (locale, severity, status) => {
    const blocks = (locale === 'hu' ? hu : findPost('safety-advisories')!.i18n[locale]!).blocks;
    const table = blocks.find(b => b.k === 'table');
    if (table?.k !== 'table') throw new Error('Missing advisory table');
    const rows = table.rows.filter(r => r[0] === sa);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(2)).toEqual([severity, status]);
    expect(rows[0]![1]).toContain(`#${issue}`);
    if (issue === 2172) {
      const unsplit = { en: 'unsplit sloped rafter', es: 'sin subdividir', pt: 'sem subdivisão', de: 'ungeteilter geneigter Sparren', fr: 'non subdivisé', tr: 'bölünmemiş eğimli mertek', hu: 'felosztatlan ferde szarufa', zh: '未拆分的坡屋面斜梁', ko: '분할되지 않은 경사 서까래' };
      expect(rows[0]![1]).toContain(unsplit[locale]);
      expect(notice.explanation[locale]).toContain(unsplit[locale]);
    }

    expect(rows[0]![1]).toContain(regenerationAction[locale]);
    expect(notice.explanation[locale]).toContain(regenerationAction[locale]);
    expect(document(`advisories/${sa}-${name}.md`).replace(/\s+/g, ' ')).toContain(regenerationAction.en);
    expect(blocks.some(b => b.k === 'note' && b.t === `${sa} — ${status}${locale === 'zh' ? '。' : '.'}`)).toBe(true);
    expect(blocks.some(b => b.k === 'ext' && b.label === sa && b.href.endsWith(`/docs/advisories/${sa}-${name}.md`))).toBe(true);
    expect(notice.explanation[locale]).toContain(sa);
    expect(notice.when).toEqual({ all: issue === 2172 ? ['generatedLoads'] : ['snow', 'generatedLoads'] });
    expect(document(`advisories/${sa}-${name}.md`)).toContain('| Fix | PR [#2197](https://github.com/lambdaclass/stabileo/pull/2197); released in 0.6.2 |');
    expect(document('advisories/README.md')).toContain(`[${sa}](${sa}-${name}.md)`);
    expect(document(notice.changelog.file.replace('docs/', ''))).toContain(`#${issue}`);
  });
}
