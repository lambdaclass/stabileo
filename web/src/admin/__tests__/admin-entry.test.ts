import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(WEB_ROOT, 'src');
const ADMIN_DIR = join(SRC, 'admin');
const CONFIG_PATH = join(WEB_ROOT, 'vite.config.ts');

type LoadedConfig = {
  plugins?: unknown[];
  define?: Record<string, string>;
  server?: { port?: number };
  build?: { outDir?: string; rollupOptions?: { input?: unknown } };
};

async function loadConfig(appType: string | undefined, inst = '0'): Promise<LoadedConfig> {
  if (appType === undefined) vi.stubEnv('VITE_APP_TYPE', '');
  else vi.stubEnv('VITE_APP_TYPE', appType);
  vi.stubEnv('INST', inst);
  vi.stubEnv('VITE_API_URL', '');
  vi.resetModules();
  const mod = (await import(/* @vite-ignore */ CONFIG_PATH)) as { default: LoadedConfig };
  return mod.default;
}

function pluginNames(config: LoadedConfig): string[] {
  return (config.plugins ?? []).flat(Infinity).map((p) => (p as { name?: string } | null)?.name ?? '');
}

function inputs(config: LoadedConfig): string[] {
  const input = config.build?.rollupOptions?.input;
  if (input === undefined) return [];
  if (typeof input === 'string') return [input];
  return Array.isArray(input) ? input.map(String) : Object.values(input as Record<string, string>);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the admin entry in vite.config.ts', () => {
  it('the product build has no admin input, output or dev rewrite', async () => {
    const config = await loadConfig(undefined);
    expect(inputs(config).some((p) => p.endsWith('admin.html'))).toBe(false);
    expect(config.build?.rollupOptions?.input).toBeUndefined();
    expect(config.build?.outDir).toBeUndefined();
    expect(config.server?.port).toBe(4000);
    expect(pluginNames(config)).not.toContain('admin-root');
    expect(pluginNames(config)).toContain('wasm-stub');
  });

  it('an app type other than admin is the product build', async () => {
    const config = await loadConfig('app');
    expect(inputs(config)).toEqual([]);
    expect(config.server?.port).toBe(4000);
  });

  it('VITE_APP_TYPE=admin builds only admin.html into dist-admin on port 4001', async () => {
    const config = await loadConfig('admin');
    expect(inputs(config)).toEqual([join(WEB_ROOT, 'admin.html')]);
    expect(config.build?.outDir).toBe('dist-admin');
    expect(config.server?.port).toBe(4001);
    expect(pluginNames(config)).toContain('admin-root');
  });

  it('every dev port and the dev API URL shift with the instance', async () => {
    const app = await loadConfig(undefined, '2');
    expect(app.server?.port).toBe(4020);
    expect(app.define?.__STABILEO_DEV_API_URL__).toBe(JSON.stringify('http://localhost:4120'));

    const admin = await loadConfig('admin', '2');
    expect(admin.server?.port).toBe(4021);

    const zero = await loadConfig(undefined, '0');
    expect(zero.define?.__STABILEO_DEV_API_URL__).toBe(JSON.stringify('http://localhost:4100'));
  });

  it('an explicit VITE_API_URL wins over the instance default', async () => {
    vi.stubEnv('VITE_API_URL', 'http://example.test:9999');
    vi.stubEnv('INST', '3');
    vi.stubEnv('VITE_APP_TYPE', '');
    vi.resetModules();
    const mod = (await import(/* @vite-ignore */ CONFIG_PATH)) as { default: LoadedConfig };
    expect(mod.default.define?.__STABILEO_DEV_API_URL__).toBe(JSON.stringify('http://example.test:9999'));
  });

  it('the admin dev and preview servers serve admin.html for every admin client route', async () => {
    const config = await loadConfig('admin');
    const plugin = (config.plugins ?? []).flat(Infinity)
      .find((p) => (p as { name?: string } | null)?.name === 'admin-root') as Record<string, unknown>;
    type Middleware = (req: { url?: string }, res: unknown, next: () => void) => void;
    const middlewares: Middleware[] = [];
    const server = { middlewares: { use: (fn: Middleware) => void middlewares.push(fn) } };
    (plugin.configureServer as (s: unknown) => void)(server);
    (plugin.configurePreviewServer as (s: unknown) => void)(server);
    expect(middlewares).toHaveLength(2);

    const cases: [string, string][] = [
      ['/', '/admin.html'],
      ['/?page=2&q=ada', '/admin.html?page=2&q=ada'],
      ['/settings', '/admin.html'],
      ['/settings/', '/admin.html'],
      ['/allowlist?q=grace&removed=1', '/admin.html?q=grace&removed=1'],
      ['/oauth/callback?code=abc.def', '/admin.html?code=abc.def'],
      ['/oauth/callback?oauth_error=email_not_allowed', '/admin.html?oauth_error=email_not_allowed'],
      ['/src/admin/main.ts', '/src/admin/main.ts'],
      ['/favicon.svg', '/favicon.svg'],
      ['/oauth', '/oauth'],
      ['/oauth/callback/extra', '/oauth/callback/extra'],
      ['/@vite/client', '/@vite/client'],
    ];
    for (const use of middlewares) {
      const out = cases.map(([url]) => {
        const req = { url };
        let called = 0;
        use(req, {}, () => void called++);
        expect(called).toBe(1);
        return req.url;
      });
      expect(out).toEqual(cases.map(([, to]) => to));
    }
  });

  it('admin.html loads the admin entry and nothing else', () => {
    const html = readFileSync(join(WEB_ROOT, 'admin.html'), 'utf8');
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    expect(scripts).toEqual(['/src/admin/main.ts']);
  });

  it('the npm scripts set the app type and the product build does not', () => {
    const pkg = JSON.parse(readFileSync(join(WEB_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['dev:admin']).toBe('VITE_APP_TYPE=admin vite');
    expect(pkg.scripts['build:admin']).toBe('VITE_APP_TYPE=admin vite build');
    expect(pkg.scripts.build).not.toMatch(/admin/);
  });
});

const IMPORT_RE = /(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function specifiers(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]);
}

function resolveRelative(from: string, spec: string): string | null {
  const p = normalize(join(dirname(from), spec));
  for (const c of [p, `${p}.ts`, `${p}.svelte`, `${p}.svelte.ts`, join(p, 'index.ts')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'wasm') continue;
      sourceFiles(full, out);
    } else if (/\.(ts|svelte)$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('the admin and product bundles stay apart', () => {
  it('no product source imports admin code', () => {
    const adminModules = new Set([join(SRC, 'lib/api/admin.ts')]);
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.startsWith(ADMIN_DIR)) continue;
      for (const spec of specifiers(file)) {
        if (!spec.startsWith('.')) continue;
        const target = resolveRelative(file, spec);
        if (target && (target.startsWith(ADMIN_DIR) || adminModules.has(target))) {
          offenders.push(`${relative(WEB_ROOT, file)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the admin entry does not reach the engine, the WASM glue or the product stores', () => {
    const seen = new Set<string>();
    const stack = [join(ADMIN_DIR, 'main.ts')];
    const bare = new Set<string>();
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      if (!/\.(ts|svelte)$/.test(file)) continue;
      for (const spec of specifiers(file)) {
        if (!spec.startsWith('.')) {
          bare.add(spec);
          continue;
        }
        const target = resolveRelative(file, spec);
        if (target) stack.push(target);
      }
    }
    const reached = [...seen].map((f) => relative(SRC, f));
    expect(reached.filter((f) => /^lib\/(engine|wasm|store)\//.test(f))).toEqual([]);
    expect([...bare].filter((s) => /dedaliano|web-ifc|three/.test(s))).toEqual([]);
    expect(reached).toContain('admin/AdminApp.svelte');
    expect(reached).toContain('lib/api/admin.ts');
  });
});
