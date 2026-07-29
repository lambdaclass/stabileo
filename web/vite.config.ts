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

/** Not Vitest's business: dependencies, build output, and Playwright's own specs. */
const NOT_VITEST = ['**/node_modules/**', '**/dist/**', 'e2e/**'];

/**
 * Tests that shell out to a real `vite build`.
 *
 * These run in their own SERIAL pass rather than inside the general pool — see
 * `scripts/test-all.mjs` for the measurements behind that. Listed explicitly rather than
 * matched by a naming convention so that adding one is a deliberate act: a build test that
 * lands in the general pool by accident is how the whole suite started exiting 1 with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` while every assertion passed.
 *
 * `harness-architecture.test.ts` fails if a test spawns a build without being listed here.
 */
const PRODUCTION_BUILD_TESTS = ['src/lib/utils/__tests__/e2e-hook-gating.test.ts'];


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
  test: {
    // Playwright owns `e2e/`. Vitest would otherwise try to collect those specs and
    // fail on `test.describe()` from a different runner.
    exclude: NOT_VITEST,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          setupFiles: ['./vitest.setup.ts'],
          // Everything except the production-build tests, which get their own pass.
          exclude: [...NOT_VITEST, ...PRODUCTION_BUILD_TESTS],
          // THREADS, NOT FORKS — and this is the line that fixed the RPC timeout.
          //
          // `onTaskUpdate` is the worker → coordinator RPC, and birpc gives it a SIXTY
          // second budget. Losing it does not mean a slow test; it means the coordinator
          // was not scheduled for a full minute. With `forks` the coordinator is a
          // separate process, so every ack needs the OS to schedule a process that is
          // competing with its own CPU-bound children (measured: coordinator 25.8 % CPU
          // while seven workers held 44–68 % each). With `threads` the workers are
          // worker_threads inside the coordinator's own process, so the ack is an
          // in-process postMessage and cannot be starved out by the workers it is waiting
          // on.
          //
          // Measured back to back on 8 cores with 6 unrelated CPU hogs running:
          //   forks    exit 1  73.07 s  216 files passed + Timeout calling "onTaskUpdate"
          //   threads  exit 0  82.82 s  216 files passed, zero RPC errors
          //
          // ~13 % slower under that load, and it is the difference between a green suite
          // and a suite that throws away a correct result.
          pool: 'threads',
        },
      },
      {
        extends: true,
        test: {
          name: 'build',
          setupFiles: ['./vitest.setup.ts'],
          include: PRODUCTION_BUILD_TESTS,
          // Forks here on purpose: this test shells out to real builds, and a child
          // process tree belongs to a process, not to a thread of the coordinator.
          pool: 'forks',
          // One at a time, and nothing else alongside them. A `vite build` is itself a
          // parallel rollup/esbuild job: it does not occupy one worker slot, it occupies
          // the machine. Measured at 58.9 s of a 60.3 s run — it set the wall-clock floor
          // for the whole suite by itself, and it peaked at 1.75 GB RSS / 78 % CPU.
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});
