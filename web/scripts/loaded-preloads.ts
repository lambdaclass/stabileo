import type { Plugin, ResolveModulePreloadDependenciesFn } from 'vite';

/** A module's static dependencies are already loaded when its dynamic import runs. */
export function loadedPreloads() {
  const imports = new Map<string, string[]>();
  const plugin: Plugin = {
    name: 'already-loaded-preloads',
    enforce: 'pre',
    generateBundle(_options, bundle) {
      imports.clear();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        imports.set(chunk.fileName, [...chunk.imports]);
      }
    },
  };
  const resolveDependencies: ResolveModulePreloadDependenciesFn = (_filename, deps, { hostId, hostType }) => {
    if (hostType !== 'js') return deps;
    const loaded = new Set<string>();
    function visit(file: string) {
      if (loaded.has(file)) return;
      loaded.add(file);
      for (const dep of imports.get(file) ?? []) visit(dep);
    }
    visit(hostId);
    // CSS is intentionally retained: Rollup's import graph only proves JS is loaded.
    return deps.filter(dep => !loaded.has(dep));
  };
  return { plugin, resolveDependencies };
}
