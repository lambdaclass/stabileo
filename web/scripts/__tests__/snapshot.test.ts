import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
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

it('records snapshot experiment versions and hashes and preserves them in the host index', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'snapshot-metadata-'));
  try {
    const root = join(tmp, 'web');
    const write = (file: string, body: string) => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
    };
    const v1 = { version: 1, date: '2025-01-01', commit: null };
    const v2 = { version: 2, date: '2026-10-28', commit: null };
    write(join(tmp, 'research/fracture/example/versions.json'), JSON.stringify({ versions: [v1, v2] }));
    write(join(root, 'src/lib/wasm/dedaliano_engine_bg.wasm'), 'engine');
    write(join(root, 'public/research-wasm/example/example_bg.wasm'), 'experiment');
    const emitFile = vi.fn();
    const hook = snapshotPlugin(snapshot, root)[0].generateBundle!;
    const handler = typeof hook === 'function' ? hook : hook.handler;
    await handler.call({ emitFile } as unknown as Parameters<typeof handler.call>[0], {} as never, {}, false);
    const manifest = JSON.parse(emitFile.mock.calls[0][0].source);
    expect(manifest.experimentVersions).toEqual({ example: v2 });
    expect(manifest.engineWasmSha256).toBe(createHash('sha256').update('engine').digest('hex'));
    expect(manifest.researchWasmSha256).toEqual({ example: createHash('sha256').update('experiment').digest('hex') });
    write(join(tmp, 'snapshots/abcdef0/SNAPSHOT.json'), JSON.stringify(manifest));
    write(join(tmp, 'snapshots/1111111/SNAPSHOT.json'), JSON.stringify({ short: '1111111', commit: '11111112222', date: '2025-01-01', prefix: '/@1111111/' }));
    const deploy = readFileSync('../infra/ansible/deploy-app.yml', 'utf8');
    const task = deploy.split('- name: Write the snapshot index (/@/)')[1];
    const script = task.split("<<'PY'\n")[1].split('\n        PY')[0].replace(/^        /gm, '');
    execFileSync('python3', ['-', join(tmp, 'snapshots')], { input: script });
    const entries = JSON.parse(readFileSync(join(tmp, 'snapshots/index.json'), 'utf8')).snapshots;
    expect(entries[0]).toMatchObject({ experimentVersions: { example: v2 }, engineWasmSha256: manifest.engineWasmSha256, researchWasmSha256: manifest.researchWasmSha256 });
    expect(entries[1].experimentVersions).toBeUndefined();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
