import { buildFeatures } from '../../../../config/public-features.mjs';
import { MAIN_TOOL_IDS } from '../../../lib/main-tool-routes';
import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { loadToolsPage } from '../load-page';
import { BATCH_IDS } from '../batch';
import { TOOL_IDS } from '../calculators';
import { batchTranslations } from '../batch-i18n';
import { hubTranslations } from '../hub-i18n';
import { TOOLS, TOPICS } from '../registry';
import { setPublicLocale } from '../../../lib/i18n/store.svelte';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';

const { tools } = buildFeatures();
const indexTools = tools ? TOOLS.map(tool => tool.id) : MAIN_TOOL_IDS;

afterEach(() => setPublicLocale('en'));

for (const locale of PUBLIC_LOCALES) {
  for (const id of BATCH_IDS) {
    it(`renders ${id} in ${locale}`, async () => {
      setPublicLocale(locale);
      const ToolsPage = await loadToolsPage(`/tools/${id}`);
      const { body } = render(ToolsPage, { props: { path: `/tools/${id}` } });
      expect(body).toContain(batchTranslations[locale][`tools.${id}`]);
      expect(body).toContain('class="tool-layout');
      expect(body).toContain(tools ? 'class="tool-main' : 'class="tool-inputs');
      expect(body).toContain('<form');
      expect(body).toContain(`href="/${locale}/tools/"`);
      expect(body).not.toMatch(/>tools\.[\w.-]+</);
    });
  }
}

for (const locale of PUBLIC_LOCALES) {
  for (const id of TOOL_IDS) {
    it(`renders the ${id} calculator with its viewer in ${locale}`, async () => {
      setPublicLocale(locale);
      const ToolsPage = await loadToolsPage(`/tools/${id}`);
      const { body } = render(ToolsPage, { props: { path: `/tools/${id}` } });
      expect(body).toContain('class="tool-layout');
      expect(body).toContain(tools ? 'class="tool-main' : 'class="tool-inputs');
      expect(body).not.toMatch(/>tools\.[\w.-]+</);
    });
  }
}

for (const locale of PUBLIC_LOCALES) {
  for (const tool of TOOLS.filter(entry => tools && entry.kind === 'model')) {
    it(`renders the ${tool.id} model as a tool in ${locale}`, async () => {
      setPublicLocale(locale);
      const ToolsPage = await loadToolsPage(`/tools/${tool.id}`);
      const { body } = render(ToolsPage, { props: { path: `/tools/${tool.id}` } });
      expect(body).toContain(hubTranslations[locale][`tools.${tool.id}`]);
      expect(body).toContain('class="tool-layout');
      expect(body).toContain('data-testid="share-link"');
      expect(body).toContain(`/${locale}/tools/${tool.id}/`);
      expect(body).not.toContain('/examples/');
      expect(body).not.toMatch(/>tools\.[\w.-]+</);
    });
  }
  it(`links exactly the configured tools in ${locale}`, async () => {
    setPublicLocale(locale);
    const ToolsPage = await loadToolsPage('/tools');
    const { body } = render(ToolsPage, { props: { path: '/tools' } });
    for (const topic of TOPICS) {
      expect(body.includes(hubTranslations[locale][`tools.topic.${topic}`])).toBe(tools);
    }
    for (const tool of TOOLS) {
      expect(body.includes(`href="/${locale}/tools/${tool.id}/"`)).toBe(indexTools.some(id => id === tool.id));
    }
    expect(body.match(/<li class="tool-card[ "]/g)).toHaveLength(indexTools.length);
    expect(body).not.toMatch(/>tools\.[\w.-]+</);
  });
}

for (const locale of PUBLIC_LOCALES) it(`shows no first-version or review-round note in ${locale}`, async () => {
  setPublicLocale(locale);
  for (const path of ['/tools', ...indexTools.map(id => `/tools/${id}`)]) {
    const ToolsPage = await loadToolsPage(path);
    const { body } = render(ToolsPage, { props: { path } });
    expect(body).not.toMatch(/First version|Primera versión|Primeira versão|Erste Version|Première version|İlk sürüm|Első verzió|első változat|ellenőrzési kör|felülvizsgálati kör|review round|ronda de revisión|rodada de revisão|Prüfrunde|cycle de revue|inceleme turu/);
    expect(body).not.toContain('class="badge"');
  }
});
