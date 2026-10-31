import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resultChangeMetadataPlugin } from './result-change-metadata.mjs';

const PUBLIC = 'virtual:public-i18n';
const APP = 'virtual:app-i18n';
const LAZY_LOCALES = ['de', 'fr', 'tr'];

function localeExport(locale, path) {
  const file = fileURLToPath(new URL(`../src/lib/i18n/locales/${path}.ts`, import.meta.url));
  return `export { default as ${locale} } from ${JSON.stringify(file)};`;
}

// Benchmarks have no public landing page: load dictionaries directly
// instead of the application's public-page-only translation split.
export function benchmarkPlugins() {
  const ids = [PUBLIC, APP, ...LAZY_LOCALES.map(locale => `${APP}/${locale}`)];
  return [resultChangeMetadataPlugin(), {
    name: 'benchmark-i18n',
    resolveId(source) { return ids.includes(source) ? '\0' + source : null; },
    load(resolved) {
      const id = resolved.slice(1);
      if (resolved[0] !== '\0' || !ids.includes(id)) return null;
      if (id === PUBLIC) {
        return ['en', 'es', 'pt', 'de', 'fr', 'tr']
          .map(locale => localeExport(locale, LAZY_LOCALES.includes(locale) ? `full/${locale}` : locale)).join('\n');
      }
      if (id === APP) return ['en', 'es', 'pt'].map(locale => localeExport(locale, locale)).join('\n');
      const locale = id.slice(APP.length + 1);
      return localeExport(locale, locale);
    },
  }, svelte()];
}
