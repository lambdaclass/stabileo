import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ToolsPage from '../ToolsPage.svelte';
import { BATCH_IDS } from '../batch';
import { batchTranslations } from '../batch-i18n';
import { setPublicLocale } from '../../../lib/i18n/store.svelte';

afterEach(() => setPublicLocale('en'));

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
  for (const id of BATCH_IDS) {
    it(`renders ${id} in ${locale}`, () => {
      setPublicLocale(locale);
      const { body } = render(ToolsPage, { props: { path: `/tools/${id}` } });
      expect(body).toContain(batchTranslations[locale][`tools.${id}`]);
      expect(body).toContain('class="tool-viewer');
      expect(body).toContain('<form');
      expect(body).toContain(`href="/${locale}/tools/"`);
      expect(body).not.toMatch(/>tools\.[\w.-]+</);
    });
  }
}
