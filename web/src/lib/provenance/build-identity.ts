/**
 * Which build produced a result: app version, web commit, engine version and commit, and the
 * SHA-256 of the WASM binary that actually ran.
 *
 * The engine half is learned when the WASM module is initialised (`engine/wasm-solver.ts` calls
 * `noteEngineBuild`), from the bytes it was given and the engine's own `engine_build_info`
 * export. Until then those fields read `not-loaded`, which is what a report written without the
 * engine ever running should say. The worker pool is fed the same bytes (`getWasmBytes`), so one
 * hash covers the main thread and every worker.
 */
import { BUILD_COMMIT } from '../build-info';
import { sha256Hex } from './sha256';

declare const __STABILEO_APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __STABILEO_APP_VERSION__ === 'string' && __STABILEO_APP_VERSION__ ? __STABILEO_APP_VERSION__ : 'dev';

export interface BuildIdentity {
  appVersion: string;
  /** Commit of the web bundle (`vite.config.ts`). */
  commit: string;
  engineVersion: string;
  /** Commit the engine was compiled from (`engine/build.rs`). */
  engineCommit: string;
  /** SHA-256 of the WASM binary in use. */
  wasmHash: string;
}

let engine: { engineVersion: string; engineCommit: string; wasmHash: string } = {
  engineVersion: 'not-loaded', engineCommit: 'not-loaded', wasmHash: 'not-loaded',
};

/** Record the engine that was just initialised. `info`: the parsed `engine_build_info()`. */
export function noteEngineBuild(wasmBytes: ArrayBuffer | Uint8Array | null, info: { engineVersion?: string; engineCommit?: string } | null): void {
  const bytes = wasmBytes ? (wasmBytes instanceof Uint8Array ? wasmBytes : new Uint8Array(wasmBytes)) : null;
  engine = {
    engineVersion: info?.engineVersion || 'unknown',
    engineCommit: info?.engineCommit || 'unknown',
    wasmHash: bytes ? sha256Hex(bytes) : 'unknown',
  };
}

export function buildIdentity(): BuildIdentity {
  return { appVersion: APP_VERSION, commit: BUILD_COMMIT, ...engine };
}
