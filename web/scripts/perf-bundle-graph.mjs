import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
export const GRAPH_FILE = resolve(webRoot, '.perf', 'bundle-graph.json');

/** Writes the production bundle graph next to dist, never into it, for scripts/perf-budget.mjs. */
export function bundleGraphPlugin(file = GRAPH_FILE) {
  return {
    name: 'perf-bundle-graph',
    apply: 'build',
    writeBundle(options, bundle) {
      const chunks = {};
      const assets = [];
      for (const out of Object.values(bundle)) {
        if (out.type === 'asset') {
          assets.push(out.fileName);
          continue;
        }
        chunks[out.fileName] = {
          name: out.name,
          module: out.facadeModuleId ? relative(webRoot, out.facadeModuleId).split('\\').join('/') : null,
          imports: out.imports,
          dynamicImports: out.dynamicImports,
          css: [...(out.viteMetadata?.importedCss ?? [])],
          assets: [...(out.viteMetadata?.importedAssets ?? [])],
        };
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ outDir: resolve(options.dir), chunks, assets: assets.sort() }, null, 1) + '\n');
    },
  };
}
