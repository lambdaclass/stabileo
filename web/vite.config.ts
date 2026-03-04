import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: process.env.BASE_PATH || '/',
  server: {
    port: 4000,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['dedaliano-engine', 'web-ifc'],
  },
});
