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
        const tools = resolve(__dirname, 'src/components/tools/translations.ts');
        this.addWatchFile(tools);
        const toolLines = readFileSync(tools, 'utf8').split('\n');
        const key = (line: string) => line.match(/^\s*['"](scalarViewer\.[\w.]+)['"]/)?.[1];
        return ['en', 'es', 'pt', 'de', 'fr', 'tr'].map((locale) => {
          const file = resolve(__dirname, `src/lib/i18n/locales/${locale}.ts`);
          this.addWatchFile(file);
          const entries = readFileSync(file, 'utf8').split('\n').filter((line) => key(line));
          const start = toolLines.findIndex((line) => line === `  ${locale}: {`);
          const end = toolLines.findIndex((line, i) => i > start && /^  \},?$/.test(line));
          const known = new Set(entries.map(key));
          const viewerOnly = toolLines.slice(start + 1, end).filter((line) => key(line) && !known.has(key(line)));
          return `export const ${locale} = {\n${[...entries, ...viewerOnly].join('\n')}\n};`;
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
});
