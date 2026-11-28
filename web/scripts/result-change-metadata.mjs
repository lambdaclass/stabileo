import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { resultChangeLocaleProblems } from './result-changes/locales.mjs';
import { TRANSLATION_FILES, readRegistry } from './result-changes/registry.mjs';

/** @returns {import('vite').Plugin} */
export function resultChangeMetadataPlugin() {
  const ids = ['virtual:result-change-metadata', 'virtual:result-change-packed', 'virtual:result-change-quantities'];
  const dir = fileURLToPath(new URL('../src/lib/provenance/result-changes', import.meta.url));
  return {
    name: 'result-change-metadata',
    resolveId(source) { return ids.includes(source.split('?')[0]) ? '\0' + source : null; },
    load(resolved) {
      const id = resolved.slice(1).split('?')[0];
      if (resolved[0] !== '\0' || !ids.includes(id)) return null;
      for (const path of Object.values(TRANSLATION_FILES)) this.addWatchFile(fileURLToPath(new URL(`../../${path}`, import.meta.url)));
      for (const name of readdirSync(dir)) if (name.endsWith('.json')) this.addWatchFile(join(dir, name));
      /** @type {import('../src/lib/provenance/registry').ResultChangeRegistry} */
      const registry = readRegistry();
      if (id === 'virtual:result-change-packed') {
        const problems = registry.changes.flatMap(resultChangeLocaleProblems);
        if (problems.length) throw new Error(problems.join('\n'));
        const shipped = { ...registry, changes: registry.changes.map(({ quantities: _, ...change }) => change) };
        const packed = deflateRawSync(JSON.stringify(shipped), { level: 9 }).toString('base64');
        return `export default ${JSON.stringify(packed)};`;
      }
      if (id === 'virtual:result-change-quantities') {
        return `export default ${JSON.stringify(Object.fromEntries(registry.changes.filter((c) => c.quantities).map((c) => [c.id, c.quantities])))};`;
      }
      return `export default ${JSON.stringify({ currentResultsVersion: registry.currentResultsVersion })};`;
    },
  };
}
