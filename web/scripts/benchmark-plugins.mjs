import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resultChangeMetadataPlugin } from './result-change-metadata.mjs';

// Benchmarks have no public landing page: load dictionaries directly
// instead of the application's public-page-only translation split.
export function benchmarkPlugins() {
  const id = 'virtual:public-i18n';
  return [resultChangeMetadataPlugin(), {
    name: 'benchmark-i18n',
    resolveId(source) { return source === id ? '\0' + id : null; },
    load(resolved) {
      if (resolved !== '\0' + id) return null;
      return ['en', 'es', 'pt', 'de', 'fr', 'tr'].map(locale => {
        const directory = ['en', 'es', 'pt'].includes(locale) ? '' : 'full/';
        const file = fileURLToPath(new URL(`../src/lib/i18n/locales/${directory}${locale}.ts`, import.meta.url));
        return `export { default as ${locale} } from ${JSON.stringify(file)};`;
      }).join('\n');
    },
  }, svelte()];
}
