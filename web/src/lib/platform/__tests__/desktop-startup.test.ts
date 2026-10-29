import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../dev-favicon', () => ({}));
vi.mock('../../../Root.svelte', () => ({ default: {} }));
vi.mock('../../../App.svelte', () => ({ default: {} }));
vi.mock('../../public-route', () => ({ routeKind: () => ({ kind: 'app' }), restoreRedirectedRoute: vi.fn() }));
vi.mock('svelte', async original => ({ ...await original<object>(), mount: vi.fn() }));
vi.mock('../desktop.svelte', () => ({ startDesktop: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../engine/wasm-solver', async original => ({ ...await original<object>(), initSolver: vi.fn(), solve: vi.fn(), input2DToWireObject: vi.fn() }));
vi.mock('../../engine/solver-pool', async original => ({ ...await original<object>(), solve2DInWorker: vi.fn() }));

import { mount } from 'svelte';
import { initSolver } from '../../engine/wasm-solver';
import { guardedCalculation } from '../../engine/calculation-gate';
import { tabManager } from '../../store/tabs.svelte';
import '../../store/index';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('waits for a delayed failing self-check before mounting a recovered hadResults tab', async () => {
  vi.stubEnv('VITE_DESKTOP', '1');
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'app' ? {} : null });
  const events = new EventTarget();
  vi.stubGlobal('window', events);
  const publish = vi.fn();
  const calculate = guardedCalculation(publish);
  const refused = vi.fn();
  events.addEventListener('stabileo-solve', () => {
    try { calculate(); } catch (error) { refused(error); }
  });
  tabManager.createTab();
  const recovered = tabManager.tabs.map(tab => ({ ...tab, hadResults: true }));
  let fail!: (error: Error) => void;
  vi.mocked(initSolver).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  vi.mocked(mount).mockImplementationOnce(() => {
    tabManager.restoreSession(recovered, recovered[0].id);
    return {};
  });
  const boot = import('../../../main');
  await vi.waitFor(() => expect(initSolver).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 80));
  expect(mount).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
  fail(new Error('delayed self-check failure'));
  await boot;
  expect(mount).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(refused).toHaveBeenCalled());
  expect(publish).not.toHaveBeenCalled();
});
