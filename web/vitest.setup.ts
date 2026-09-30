import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initSolver, solve, hasCanonicalGeometryExport, hasSectionFieldExport } from './src/lib/engine/wasm-solver';
import type { SolverInput } from './src/lib/engine/types';

/**
 * Test bootstrap: initialise the WASM engine once per worker.
 *
 * The whole suite depends on the engine — `initSolver()` reads
 * `src/lib/wasm/dedaliano_engine_bg.wasm` directly with `readFileSync` on the
 * Node path, and `vite.config.ts`'s `wasmStubPlugin` only substitutes the
 * generated `.js` glue, never the binary. So a checkout without a local build
 * cannot collect a single test file, not even a pure-UI one.
 *
 * Left alone that surfaces as a bare `ENOENT ... dedaliano_engine_bg.wasm`
 * stack, which reads like a broken test rather than a missing setup step. The
 * two guards below turn both failure modes into instructions.
 *
 * Nothing here changes runtime solver behaviour or the generated bindings —
 * these are pre-flight checks around the same `initSolver()` call the suite
 * has always made.
 */

/*
 * The unit environment is CI's: Node 20, which has no global `localStorage`. Node 22+ defines one —
 * on Node 25, without `--localstorage-file`, an object with no methods (`setItem is not a function`);
 * with the flag, a file shared by every worker and every run. The app asks for storage by feature
 * (`typeof localStorage.getItem === 'function'`), so either kind made a developer's run differ from
 * CI's: the broken one failed tests that stubbed storage with `??=`, a working one would persist
 * settings between tests only locally. So it is removed, and a test that wants storage installs its
 * own (`vi.stubGlobal`).
 */
if ('localStorage' in globalThis) {
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
  delete (globalThis as { localStorage?: unknown }).localStorage;
}

const WASM_DIR = fileURLToPath(new URL('./src/lib/wasm/', import.meta.url));
const WASM_BINARY = `${WASM_DIR}dedaliano_engine_bg.wasm`;
const WASM_GLUE = `${WASM_DIR}dedaliano_engine.js`;

const BUILD_INSTRUCTION = [
  '',
  '  The WASM engine has not been built in this checkout.',
  '',
  '  Run:  npm run wasm        (from the web/ directory)',
  '',
  '  It compiles engine/ with wasm-pack into web/src/lib/wasm/, which is',
  '  gitignored and therefore never present after a fresh clone or a new',
  '  git worktree. The build needs a Rust toolchain and wasm-pack; the',
  '  required toolchain is pinned in rust-toolchain.toml.',
  '',
  '  Do NOT copy web/src/lib/wasm/ from another worktree: builds from other',
  '  branches can use a different JS<->WASM boundary, and mixing them traps',
  '  with "memory access out of bounds" on nearly every test.',
  '',
].join('\n');

if (!existsSync(WASM_BINARY) || !existsSync(WASM_GLUE)) {
  throw new Error(BUILD_INSTRUCTION);
}

try {
  await initSolver();
} catch (err) {
  throw new Error(
    `${BUILD_INSTRUCTION}\n  Underlying initialisation error: ${(err as Error)?.message ?? String(err)}\n`,
  );
}

// Compatibility smoke test: a 2-node cantilever, the smallest model that
// exercises the JsValue boundary end to end. A build produced from a
// different engine revision parses the wire differently and traps here
// instead of failing 1000+ assertions with an unrelated-looking message.
const SMOKE_MODEL = {
  nodes: new Map([
    [1, { id: 1, x: 0, z: 0 }],
    [2, { id: 2, x: 1, z: 0 }],
  ]),
  materials: new Map([[1, { id: 1, e: 210000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-5 }]]),
  elements: new Map([
    [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
  ]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -1, my: 0 } }],
} as unknown as SolverInput;

try {
  const smoke = solve(SMOKE_MODEL);
  if (!smoke?.reactions?.length) {
    throw new Error('the engine returned no reactions for a fixed-end cantilever');
  }
} catch (err) {
  throw new Error(
    [
      '',
      '  The WASM engine in web/src/lib/wasm/ is present but INCOMPATIBLE with',
      '  this branch — a minimal cantilever solve failed.',
      '',
      '  This is what a package built from a different engine revision looks',
      '  like (for example one copied from another worktree). Rebuild it:',
      '',
      '    rm -rf src/lib/wasm && npm run wasm',
      '',
      `  Underlying error: ${(err as Error)?.message ?? String(err)}`,
      '',
    ].join('\n'),
  );
}

// Canonical-section export check. The section engine tests skip themselves
// when the export is absent (so an old WASM build does not fail the suite),
// but a skip in CI means the section engine went untested. Fail loudly in CI;
// warn locally so a contributor without a fresh build can still work.
if (!hasCanonicalGeometryExport() || !hasSectionFieldExport()) {
  const msg = [
    '',
    '  The WASM engine is present but STALE: it does not export the full',
    '  canonical section API (build_section_geometry, analyze_section_*_field).',
    '',
    '  Without build_section_geometry the section-engine tests SKIP themselves,',
    '  passing without verifying anything. Without the field exports the stress',
    '  tests still run (per-point fallback) but the field-cache parity tests',
    '  skip. Either way the suite is greener than the truth. Rebuild:',
    '',
    '    rm -rf src/lib/wasm && npm run wasm',
    '',
  ].join('\n');
  if (process.env.CI) {
    throw new Error(msg);
  } else {
    console.warn(msg);
  }
}
