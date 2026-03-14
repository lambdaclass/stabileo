import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Stub out the WASM glue module when it hasn't been built yet.
 * This lets CI run `npm run build` without `wasm-pack build` first.
 */
function wasmStubPlugin(): Plugin {
  const wasmGlue = resolve(__dirname, 'src/lib/wasm/dedaliano_engine.js');
  return {
    name: 'wasm-stub',
    resolveId(id) {
      if (id.includes('wasm/dedaliano_engine') && id.endsWith('.js') && !existsSync(wasmGlue)) {
        return '\0wasm-stub';
      }
    },
    load(id) {
      if (id === '\0wasm-stub') {
        return 'export function initSync() {} export function solve_3d() { return "{}"; }';
      }
    },
  };
}

export default defineConfig({
  plugins: [wasmStubPlugin(), svelte()],
  base: process.env.BASE_PATH || '/',
  server: {
    port: 4000,
  },
  worker: {
    format: 'es',
    plugins: () => [wasmStubPlugin()],
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['dedaliano-engine', 'web-ifc'],
  },
});
