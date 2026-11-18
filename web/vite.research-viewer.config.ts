import { featureDefines, featuresForMode } from './config/public-features.mjs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import en from './src/lib/i18n/locales/en';
import es from './src/lib/i18n/locales/es';
import pt from './src/lib/i18n/locales/pt';
import de from './src/lib/i18n/locales/de';
import fr from './src/lib/i18n/locales/fr';
import tr from './src/lib/i18n/locales/tr';
import hu from './src/lib/i18n/locales/hu';
import * as viewerDictionaries from './src/components/viewport/scalar-viewer-translations';

const coreDictionaries = { en, es, pt, de, fr, tr, hu };
const locales = Object.keys(coreDictionaries) as (keyof typeof coreDictionaries)[];

/**
 * The research viewer as a separate bundle (three.js, the shared scene setup, the scalar-field
 * mesh and the contour legend), served next to the research WASM and loaded only by research
 * pages. Building it apart keeps the application's own chunk graph exactly as it is.
 *   npx vite build -c vite.research-viewer.config.ts --outDir <dir>
 */
export default defineConfig(({ mode }) => ({
  define: featureDefines(featuresForMode(mode)),
  plugins: [
    svelte(),
    {
      // This standalone viewer uses the main app's translator, with only its own keys.
      name: 'scalar-viewer-i18n',
      resolveId(id) {
        // The shared store also imports the lazy browser dictionaries. Their
        // app modules must resolve to this viewer's scoped dictionary as well.
        const ids = ['virtual:public-i18n', 'virtual:app-i18n',
          ...['de', 'fr', 'tr', 'hu'].map(locale => `virtual:app-i18n/${locale}`)];
        return ids.includes(id) ? '\0scalar-viewer-i18n' : null;
      },
      load(id) {
        if (id !== '\0scalar-viewer-i18n') return null;
        return locales.map(locale => {
          const coreViewerStrings = Object.fromEntries(
            Object.entries(coreDictionaries[locale]).filter(([key]) => key.startsWith('scalarViewer.')),
          );
          const dictionary = { ...viewerDictionaries[locale], ...coreViewerStrings };
          return `export const ${locale} = ${JSON.stringify(dictionary)};`;
        }).join('\n') + '\nexport const loaders = {};';
      },
    },
  ],
  publicDir: false,
  build: {
    target: 'esnext',
    minify: 'esbuild',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/components/viewport/scalar-field-viewer-entry.svelte.ts'),
      formats: ['es'],
      fileName: () => 'viewer.js',
      cssFileName: 'viewer',
    },
  },
}));
