import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

/** @returns {import('vite').Plugin} */
export function resultChangeMetadataPlugin() {
  const id = 'virtual:result-change-metadata';
  const packedId = 'virtual:result-change-packed';
  const file = fileURLToPath(new URL('../src/lib/provenance/result-changes.json', import.meta.url));
  return {
    name: 'result-change-metadata',
    resolveId(source) { return source === id || source === packedId ? '\0' + source : null; },
    load(resolved) {
      if (resolved !== '\0' + id && resolved !== '\0' + packedId) return null;
      this.addWatchFile(file);
      /** @type {import('../src/lib/provenance/registry').ResultChangeRegistry} */
      const registry = JSON.parse(readFileSync(file, 'utf8'));
      if (resolved === '\0' + packedId) {
        const packed = deflateRawSync(JSON.stringify(registry), { level: 9 }).toString('base64');
        return `export default ${JSON.stringify(packed)};`;
      }
      return `export default ${JSON.stringify({ currentResultsVersion: registry.currentResultsVersion })};`;
    },
  };
}
