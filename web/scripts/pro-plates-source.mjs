import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(root, 'config/pro-plates-off.json');
const productionMesher = 'src/components/pro/ProMesher.svelte';
const relativePath = path => relative(root, path).split(sep).join('/');
const sha = source => createHash('sha256').update(source).digest('hex');

export function readProPlatesProfile(enabled) {
  const files = enabled ? {} : JSON.parse(readFileSync(manifestPath, 'utf8')).files;
  const overrides = new Map();
  const unavailable = new Set();
  const restored = new Set();
  for (const [name, entry] of Object.entries(files)) {
    if (entry === null) {
      unavailable.add(name);
      continue;
    }
    if (!entry.source) {
      restored.add(name);
      overrides.set(name, entry.original);
      continue;
    }
    const source = readFileSync(resolve(root, name), 'utf8');
    if (sha(source) !== entry.source) throw new Error(`Unified PRO plates off profile is stale for ${name}. Review the changes to both profiles before updating the manifest.`);
    const lines = source.split('\n');
    for (const [at, count, text] of entry.changes.toReversed()) lines.splice(at, count, ...text);
    const original = lines.join('\n');
    if (sha(original) !== entry.original) throw new Error(`Unified PRO plates off profile failed verification for ${name}.`);
    overrides.set(name, original);
  }
  return { overrides, unavailable, restored };
}

export function proPlatesSource(enabled) {
  let profile;
  const source = () => profile ??= readProPlatesProfile(enabled());
  const override = path => path === productionMesher ? undefined : source().overrides.get(path);
  return {
    read(path) {
      return override(relativePath(path)) ?? readFileSync(path, 'utf8');
    },
    plugin: {
      name: 'pro-plates-source',
      enforce: 'pre',
      buildStart() {
        profile = readProPlatesProfile(enabled());
        if (!enabled()) this.addWatchFile(manifestPath);
      },
      resolveId(id, importer) {
        if (!importer || !id.startsWith('.')) return null;
        const target = resolve(dirname(importer.split('?')[0]), id);
        return source().restored.has(relativePath(target)) ? target : null;
      },
      load(id) {
        const [path, query] = id.split('?');
        if (!isAbsolute(path)) return null;
        const name = relativePath(path);
        if (source().unavailable.has(name)) this.error(`Unified PRO plates are disabled, but the build reached ${name}.`);
        const code = override(name);
        if (code === undefined) return null;
        if (query === 'raw') return `export default ${JSON.stringify(code)};`;
        return query ? null : { code, map: null };
      },
    },
  };
}
