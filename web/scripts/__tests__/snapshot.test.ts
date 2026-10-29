import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { snapshotPlugin, snapshotRuntime } from '../snapshot';

import { autosaveWrite, autosaveRead, resetAutosaveDbForTests } from '../../src/lib/store/autosave-db';

afterEach(() => vi.unstubAllGlobals());

const snapshot = { prefix: '/@abcdef0', short: 'abcdef0', commit: 'abcdef0123456789', date: '2026-10-28' };
function backingStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
    clear: () => data.clear(),
  };
}
function runtime(backing = backingStorage(), config = snapshot) {
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
    Object.defineProperty(context, key, { get: () => backing, configurable: true });
  }
  vm.runInContext(snapshotRuntime(config), context);
  return { context, backing };
}

it('snapshot storage operations leave production keys untouched', () => {
  const { context, backing } = runtime();
  backing.setItem('stabileo-autosave', 'production');
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
  expect(backing.getItem('stabileo-autosave')).toBe('production');
  expect(runtime().context.localStorage.length).toBe(0);
});

it('both Web Storage namespaces persist only for their full commit', () => {
  for (const name of ['localStorage', 'sessionStorage']) {
    const backing = backingStorage();
    backing.setItem('token', 'live');
    const first = runtime(backing).context[name] as Storage;
    first.setItem('token', 'snapshot');
    expect(runtime(backing).context[name].getItem('token')).toBe('snapshot');
    const other = runtime(backing, { ...snapshot, commit: snapshot.commit + '1' }).context[name] as Storage;
    expect(other.getItem('token')).toBeNull();
    other.clear();
    expect(first.getItem('token')).toBe('snapshot');
    expect(backing.getItem('token')).toBe('live');
  }
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
    write(join(root, 'public/research-wasm/build.json'), JSON.stringify({ build_id: 'example' }));
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
    execFileSync('python3', ['../infra/ansible/scripts/snapshot_store.py', 'index', '--root', join(tmp, 'snapshots')]);
    const entries = JSON.parse(readFileSync(join(tmp, 'snapshots/index.json'), 'utf8')).snapshots;
    expect(entries[0]).toMatchObject({ experimentVersions: { example: v2 }, engineWasmSha256: manifest.engineWasmSha256, researchWasmSha256: manifest.researchWasmSha256 });
    expect(entries[1].experimentVersions).toBeUndefined();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

it('edit → autosave → reload restores changes only in the same snapshot', async () => {
  const { context, backing } = runtime();
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage', context.localStorage);
  await resetAutosaveDbForTests();
  const policy = { accept: (value: unknown) => value, fingerprint: () => ({ nodes: 2 }) };
  const edited = { title: 'Snapshot edit', nodes: [{ x: 1 }, { x: 7 }] };
  expect(await autosaveWrite(edited, policy)).toMatchObject({ ok: true, backend: 'localstorage' });
  vi.stubGlobal('localStorage', runtime(backing).context.localStorage);
  await resetAutosaveDbForTests();
  expect((await autosaveRead(policy)).value).toEqual(edited);
  expect(backing.getItem('stabileo-autosave')).toBeNull();
  const other = runtime(backing, { ...snapshot, commit: '11111112222', prefix: '/@1111111' });
  expect(other.context.localStorage.length).toBe(0);
});

it('propagates storage quota failures instead of reporting a successful autosave', async () => {
  const backing = backingStorage();
  backing.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage', runtime(backing).context.localStorage);
  await resetAutosaveDbForTests();
  expect(await autosaveWrite({ edited: true }, { accept: x => x, fingerprint: () => ({}) }))
    .toMatchObject({ ok: false });
});

it('keeps the Node route-budget suite out of Vitest and in the explicit CI invocation', () => {
  const vite = readFileSync('vite.config.ts', 'utf8');
  expect(vite.match(/const NOT_VITEST = (.*);/)![1]).toContain('scripts/**/*.test.mjs');
  expect(readFileSync('../.github/workflows/research.yml', 'utf8')).toContain('node --test scripts/research-route-budget.test.mjs');
});
