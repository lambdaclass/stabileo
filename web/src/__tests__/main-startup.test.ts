import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  route: 'app', mount: vi.fn(() => ({ mounted: true })), hooks: vi.fn(),
  load: vi.fn(async () => ({ default: 'Editor' })),
}));
vi.mock('../dev-favicon', () => ({}));
vi.mock('../Root.svelte', () => ({ default: 'PublicRoot' }));
vi.mock('svelte', async original => ({ ...await original<object>(), mount: mocks.mount }));
vi.mock('../lib/public-route', () => ({ routeKind: () => ({ kind: mocks.route }), restoreRedirectedRoute: vi.fn() }));
vi.mock('../lib/i18n/store.svelte', () => ({ i18n: { locale: 'en' }, ensureLocale: async () => {} }));
vi.mock('../load-app', () => ({ loadApplication: mocks.load }));
vi.mock('../lib/utils/e2e-hooks', () => ({ installE2EHooks: mocks.hooks }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('VITE_E2E', '1');
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'app' ? {} : null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('loads the named loader and installs hooks after a direct editor mount', async () => {
  mocks.route = 'app';
  await (await import('../main')).default;
  await vi.waitFor(() => expect(mocks.hooks).toHaveBeenCalledOnce());
  expect(mocks.load).toHaveBeenCalledOnce();
  expect(mocks.mount).toHaveBeenCalledWith('Editor', { target: {} });
  expect(mocks.mount.mock.invocationCallOrder[0]).toBeLessThan(mocks.hooks.mock.invocationCallOrder[0]);
});
it('waits for the lazy editor ready event on a public route and installs once', async () => {
  mocks.route = 'research';
  await (await import('../main')).default;
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.hooks).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('stabileo-app-ready'));
  window.dispatchEvent(new Event('stabileo-app-ready'));
  await vi.waitFor(() => expect(mocks.hooks).toHaveBeenCalledOnce());
});
it('does not install hooks in a production build', async () => {
  vi.stubEnv('VITE_E2E', '');
  mocks.route = 'app';
  await (await import('../main')).default;
  expect(mocks.hooks).not.toHaveBeenCalled();
});
