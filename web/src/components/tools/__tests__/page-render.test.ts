import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { loadToolsPage } from '../load-page';
import { BATCH_IDS } from '../batch';
import { TOOL_IDS } from '../calculators';
import { batchTranslations } from '../batch-i18n';
import { setPublicLocale } from '../../../lib/i18n/store.svelte';

afterEach(() => setPublicLocale('en'));

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
  for (const id of BATCH_IDS) {
    it(`renders ${id} in ${locale}`, async () => {
      setPublicLocale(locale);
      const ToolsPage = await loadToolsPage(`/tools/${id}`);
      const { body } = render(ToolsPage, { props: { path: `/tools/${id}` } });
      expect(body).toContain(batchTranslations[locale][`tools.${id}`]);
      expect(body).toContain('class="tool-viewer');
      expect(body).toContain('class="viewer-heading');
      expect(body).toContain('<form');
      expect(body).toContain(`href="/${locale}/tools/"`);
      expect(body).not.toMatch(/>tools\.[\w.-]+</);
    });
  }
}

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
  for (const id of TOOL_IDS) {
    it(`renders the ${id} calculator with its viewer in ${locale}`, async () => {
      setPublicLocale(locale);
      const ToolsPage = await loadToolsPage(`/tools/${id}`);
      const { body } = render(ToolsPage, { props: { path: `/tools/${id}` } });
      expect(body).toContain('class="tool-viewer');
      expect(body).toContain('class="viewer-heading');
      expect(body).not.toMatch(/>tools\.[\w.-]+</);
    });
  }
}

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) it(`shows no first-version or review-round note in ${locale}`, async () => {
  setPublicLocale(locale);
  for (const path of ['/tools', '/tools/simply-supported-beam', '/tools/column-buckling', ...BATCH_IDS.map(id => `/tools/${id}`)]) {
    const ToolsPage = await loadToolsPage(path);
    const { body } = render(ToolsPage, { props: { path } });
    expect(body).not.toMatch(/First version|Primera versión|Primeira versão|Erste Version|Première version|İlk sürüm|review round|ronda de revisión|rodada de revisão|Prüfrunde|cycle de revue|inceleme turu/);
    expect(body).not.toContain('class="badge"');
  }
});
