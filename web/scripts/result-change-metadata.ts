import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ResultChangeRegistry } from '../src/lib/provenance/registry';

export function resultChangeMetadataPlugin(): Plugin {
  const id = 'virtual:result-change-metadata';
  const file = fileURLToPath(new URL('../src/lib/provenance/result-changes.json', import.meta.url));
  return {
    name: 'result-change-metadata',
    resolveId(source) { return source === id ? '\0' + id : null; },
    load(resolved) {
      if (resolved !== '\0' + id) return null;
      this.addWatchFile(file);
      const registry = JSON.parse(readFileSync(file, 'utf8')) as ResultChangeRegistry;
      const { schema, currentResultsVersion } = registry;
      const changes = registry.changes.map(({ title, explanation, ...metadata }) => metadata);
      return `export default ${JSON.stringify({ schema, currentResultsVersion, changes })};`;
    },
  };
}
