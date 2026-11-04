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
      const { engineWasmSha256, researchWasmSha256 } = researchBuildMetadata(root);
      return `export const engineWasmSha256 = ${JSON.stringify(engineWasmSha256)};\nexport const researchWasmSha256 = ${JSON.stringify(researchWasmSha256)};\n`;
    },
  };
}

/** Metadata from the files shipped by this build, also saved in each snapshot's index entry. */
export function researchBuildMetadata(root: string) {
  const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const engine = resolve(root, 'src/lib/wasm/dedaliano_engine_bg.wasm');
  const research: Record<string, string> = {};
  const dir = resolve(root, 'public/research-wasm');
  if (existsSync(dir)) {
    for (const exp of readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const wasm = readdirSync(resolve(dir, exp.name)).find((f) => f.endsWith('_bg.wasm'));
      if (wasm) research[exp.name] = sha(resolve(dir, exp.name, wasm));
    }
  }
  const experimentVersions: Record<string, { version: number; date: string; commit: string | null }> = {};
  const papers = resolve(root, '../research');
  if (existsSync(papers)) {
    for (const field of readdirSync(papers, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const exp of readdirSync(resolve(papers, field.name), { withFileTypes: true }).filter((d) => d.isDirectory())) {
        const file = resolve(papers, field.name, exp.name, 'versions.json');
        if (!existsSync(file)) continue;
        const latest = JSON.parse(readFileSync(file, 'utf8')).versions.at(-1);
        if (latest) experimentVersions[exp.name] = { version: latest.version, date: latest.date, commit: latest.commit };
      }
    }
  }
  return { engineWasmSha256: existsSync(engine) ? sha(engine) : null, researchWasmSha256: research, experimentVersions };
}
