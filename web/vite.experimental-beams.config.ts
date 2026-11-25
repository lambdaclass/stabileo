import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// Separate local entry and output: never included in the application build.
export default defineConfig({
  plugins: [svelte()],
  publicDir: false,
  server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [resolve(__dirname, '..')] } },
  build: {
    outDir: 'dist-experimental-beams',
    rollupOptions: { input: resolve(__dirname, 'experimental-beams.html') },
  },
});
