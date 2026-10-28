import { expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { snapshotPlugin, snapshotRuntime } from '../snapshot';

const snapshot = { prefix: '/@abcdef0', short: 'abcdef0', commit: 'abcdef0123456789', date: '2026-10-28' };
function runtime() {
  const access = vi.fn(() => { throw new Error('production storage accessed'); });
  const context = vm.createContext({
    URL, Map, location: new URL('https://stabileo.com/@abcdef0/app/basic'),
    history: { pushState() {}, replaceState() {} },
    Node: class {}, Element: class {}, CharacterData: class {}, DocumentFragment: class {},
    MutationObserver: class { observe() {} },
    document: { documentElement: {}, readyState: 'loading', addEventListener() {} },
    addEventListener() {},
  });
  context.window = context;
  for (const key of ['localStorage', 'sessionStorage', 'indexedDB']) {
    Object.defineProperty(context, key, { get: access, configurable: true });
  }
  vm.runInContext(snapshotRuntime(snapshot), context);
  return { context, access };
}

it('snapshots never read or write production storage, including clear and legacy keys', () => {
  const { context, access } = runtime();
  for (const name of ['localStorage', 'sessionStorage']) {
    const storage = context[name] as Storage;
    expect(storage.length).toBe(0);
    for (const key of ['stabileo-workspace', 'stabileo-autosave', 'dedaliano-autosave', 'token']) {
      expect(storage.getItem(key)).toBeNull();
      storage.setItem(key, 'snapshot edit');
      expect(storage.getItem(key)).toBe('snapshot edit');
      storage.removeItem(key);
      expect(storage.getItem(key)).toBeNull();
    }
    storage.setItem('a', 'b');
    expect(storage.key(0)).toBe('a');
    storage.clear();
    expect(storage.length).toBe(0);
  }
  expect(context.indexedDB).toBeUndefined();
  expect(access).not.toHaveBeenCalled();
  expect(runtime().context.localStorage.length).toBe(0);
});

it('rewrites routing location but preserves the actual address for exported URLs', async () => {
  const root = resolve('.');
  const transform = snapshotPlugin(snapshot, root)[0].transform as Function;
  const result = await transform('globalThis.result = [location.pathname, globalThis.location.origin + globalThis.location.pathname];', resolve(root, 'src/share.ts'));
  const { context } = runtime();
  vm.runInContext(result.code, context);
  expect([...context.result]).toEqual(['/app/basic', 'https://stabileo.com/@abcdef0/app/basic']);
  expect(snapshotPlugin(null, root)).toEqual([]);
});

it('snapshot failures and cancellation fail CI OK', () => {
  const ci = readFileSync('../.github/workflows/ci.yml', 'utf8').split('  ci-ok:')[1];
  expect(ci.split('    steps:')[0]).toContain('      - site-snapshot');
  const script = ci.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
  for (const result of ['failure', 'cancelled']) {
    expect(() => execFileSync('bash', ['-c', script], { env: { ...process.env, RESULTS: `success ${result} skipped` } })).toThrow();
  }
  expect(() => execFileSync('bash', ['-c', script], { env: { ...process.env, RESULTS: 'success skipped' } })).not.toThrow();
});

it('deploy snapshots include shared viewer and build dependencies', () => {
  const deploy = readFileSync('../.github/workflows/deploy.yml', 'utf8');
  const paths = new RegExp(deploy.match(/paths='([^']+)'/)![1]);
  for (const path of [
    'research/fracture/shauer-2025/src/lib.rs', 'engine/src/lib.rs',
    'web/src/lib/viewport3d/scene-setup.ts', 'web/src/lib/viewport3d/axis-gizmo.ts',
    'web/src/lib/three/shell-colors.ts', 'web/src/lib/canvas/draw-loads.ts',
    'web/src/lib/geometry/coordinate-system.ts', 'web/src/lib/store/ui.svelte.ts',
    'web/src/components/viewport/ScalarField.svelte', 'web/src/components/Viewport3D.svelte',
    'web/src/components/ribbon/Ribbon.svelte', 'web/src/styles/theme.css',
    'web/package-lock.json', 'web/vite.config.ts', 'flake.lock', 'rust-toolchain.toml', 'Makefile',
  ]) expect(path, path).toMatch(paths);
  expect('backend/lib/example.ex').not.toMatch(paths);
});
