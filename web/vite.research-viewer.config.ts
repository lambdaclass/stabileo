import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

/**
 * The research viewer as a separate bundle (three.js, the shared scene setup, the scalar-field
 * mesh and the contour legend), served next to the research WASM and loaded only by research
 * pages. Building it apart keeps the application's own chunk graph exactly as it is.
 *   npx vite build -c vite.research-viewer.config.ts --outDir <dir>
 */
export default defineConfig({
  plugins: [svelte()],
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
