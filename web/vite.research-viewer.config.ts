import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * The research viewer as a separate bundle (three.js, the shared scene setup, the scalar-field
 * mesh and the contour legend), served next to the research WASM and loaded only by research
 * pages. Building it apart keeps the application's own chunk graph exactly as it is.
 *   npx vite build -c vite.research-viewer.config.ts --outDir <dir>
 */
export default defineConfig({
  plugins: [
    svelte(),
    {
      // This standalone viewer uses the main app's translator, with only its own keys.
      name: 'scalar-viewer-i18n',
      resolveId(id) { return id === 'virtual:public-i18n' ? '\0scalar-viewer-i18n' : null; },
      load(id) {
        if (id !== '\0scalar-viewer-i18n') return null;
        return ['en', 'es', 'pt', 'de', 'fr', 'tr'].map((locale) => {
          if (['de', 'fr', 'tr'].includes(locale)) return `export const ${locale} = {};`;
          const file = resolve(__dirname, `src/lib/i18n/locales/${locale}.ts`);
          this.addWatchFile(file);
          const entries = readFileSync(file, 'utf8').split('\n')
            .filter((line) => /^\s*['"]scalarViewer\./.test(line));
          return `export const ${locale} = {\n${entries.join('\n')}\n};`;
        }).join('\n');
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
});
