/**
 * The desktop app's build (`vite build --mode desktop`, which loads `.env.desktop`; see
 * docs/desktop/README.md). Everything the desktop build changes lives here, and each plugin does
 * nothing outside that mode, so every other build (stabileo.com, admin, a base-path build) is
 * untouched.
 *
 * In desktop mode:
 *  - output goes to `dist-desktop/` at base `/` (whatever BASE_PATH says), without the third-party script and the files only the web
 *    host serves;
 *  - IFC parsing runs in a worker (src/lib/ifc/ifc-worker.ts), so workers also get the
 *    dictionaries' plugins (a `.svelte.ts` store and the public entries' virtual module);
 *  - the notices also list the Tauri packages the desktop bundle contains.
 * In every other mode, the desktop-only module that creates that worker is left out (an external
 * nobody reaches: its callers test VITE_DESKTOP first), so the worker stays out of the bundle.
 */
import type { Plugin, PluginOption } from 'vite';
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { resolve } from 'path';

const STUB = 'desktop-only:parse-in-worker';

/** The `@tauri-apps/*` JS packages in node_modules, with their licence texts, for the notices. */
function tauriNotices(root: string): string {
  const scope = resolve(root, 'node_modules/@tauri-apps');
  if (!existsSync(scope)) return '';
  const lines = ['', '---', '', '# Desktop app', '',
    'The desktop app (desktop/) also bundles these packages, each under its own licence.', ''];
  for (const dir of readdirSync(scope).sort()) {
    const pkgFile = resolve(scope, dir, 'package.json');
    if (dir === 'cli' || dir.startsWith('cli-') || !existsSync(pkgFile)) continue;
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    lines.push(`## ${pkg.name} ${pkg.version}`, '', `- **Licence:** ${pkg.license ?? 'UNKNOWN'}`, '');
    for (const f of readdirSync(resolve(scope, dir)).filter((x) => /^LICEN[CS]E/i.test(x)).sort()) {
      lines.push(`<details><summary>${f}</summary>`, '', '```', readFileSync(resolve(scope, dir, f), 'utf8').trimEnd(), '```', '', '</details>', '');
    }
  }
  return lines.join('\n');
}

export function desktopPlugins(workerPlugins: () => PluginOption[]): Plugin[] {
  let on = false;
  let root = '';
  let out = '';
  const main: Plugin = {
    name: 'desktop',
    config(cfg, env) {
      on = env.mode === 'desktop';
      if (!on) return undefined;
      const base = cfg.worker?.plugins;
      return {
        // The app loads its files from its own origin's root, whatever base a web build uses.
        base: '/',
        build: { outDir: 'dist-desktop' },
        worker: { plugins: () => [...(base ? base() : []), ...workerPlugins()] },
      };
    },
    configResolved(cfg) {
      root = cfg.root;
      out = resolve(cfg.root, cfg.build.outDir);
    },
    transformIndexHtml(html) {
      return on ? html.replace(/\s*<script src="https:\/\/challenges\.cloudflare\.com[^"]*"[^>]*><\/script>/, '') : html;
    },
    closeBundle() {
      if (!on || !existsSync(out)) return;
      for (const f of readdirSync(out)) {
        if (f === '404.html' || /^google.*\.html$/.test(f)) rmSync(resolve(out, f));
      }
      const notices = resolve(out, 'third-party-notices.txt');
      if (existsSync(notices)) appendFileSync(notices, tauriNotices(root));
    },
  };
  const stub: Plugin = {
    name: 'desktop-only-stub',
    enforce: 'pre',
    // External, so nothing is emitted for it: the branches that import it are dropped as dead
    // code, and an import that survived would fail loudly instead of loading the worker.
    resolveId(id) {
      if (!on && /\/parse-in-worker(\.ts)?$/.test(id)) return { id: STUB, external: true };
    },
  };
  return [main, stub];
}
