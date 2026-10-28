/**
 * `virtual:research-build`: the SHA-256 of the WASM binaries a research page cites ("Cite this",
 * src/components/research/shell/CiteThis.svelte), computed from the files this build ships:
 *
 *  - `engineWasmSha256`: the engine (`src/lib/wasm/dedaliano_engine_bg.wasm`), the same hash
 *    `lib/provenance/build-identity.ts` reports once the application has loaded it;
 *  - `researchWasmSha256[<id>]`: each experiment's own bundle (`public/research-wasm/<id>/`).
 *
 * null / absent when the binary was not built (unit tests, a build without `make wasm`): the page
 * then says so rather than citing a hash it does not have. Imported only by the research chunk,
 * so the rest of the bundle is unchanged.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function researchBuildPlugin(root: string): Plugin {
  const id = 'virtual:research-build';
  return {
    name: 'research-build',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(resolved) {
      if (resolved !== '\0' + id) return null;
      const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
      const engine = resolve(root, 'src/lib/wasm/dedaliano_engine_bg.wasm');
      const research: Record<string, string> = {};
      const dir = resolve(root, 'public/research-wasm');
      if (existsSync(dir)) {
        for (const exp of readdirSync(dir)) {
          const wasm = readdirSync(resolve(dir, exp)).find((f) => f.endsWith('_bg.wasm'));
          if (wasm) research[exp] = sha(resolve(dir, exp, wasm));
        }
      }
      return `export const engineWasmSha256 = ${JSON.stringify(existsSync(engine) ? sha(engine) : null)};\nexport const researchWasmSha256 = ${JSON.stringify(research)};\n`;
    },
  };
}
