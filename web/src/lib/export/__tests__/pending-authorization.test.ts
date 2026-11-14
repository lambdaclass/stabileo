import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ saveRequiresAccount: true, isAuthenticated: false }));
vi.mock('../../store/auth.svelte', () => ({ authStore: auth }));
vi.mock('../../features', async original => ({ ...(await original<typeof import('../../features')>()), accounts: () => true }));
vi.mock('../../tracking/activity.svelte', () => ({ milestone: vi.fn() }));
import { accountGate } from '../../store/account-gate.svelte';
import { modelStore, resultsStore, uiStore } from '../../store';
import { saveFile } from '../save-file';
import { downloadReport } from '../report-download';

beforeEach(() => {
  modelStore.clear(); resultsStore.clear();
  auth.saveRequiresAccount = true; auth.isAuthenticated = false;
  vi.useFakeTimers();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('document', { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } });
});
afterEach(() => {
  accountGate.open = false;
  vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it.skip.each(['2d', 'pro'] as const)('known wrong result: #2099 refuses a %s file when the model changes during sign-in', mode => {
  uiStore.analysisMode = mode;
  const toast = vi.spyOn(uiStore, 'toast');
  saveFile('results.csv', new Blob(['old results']));
  expect(accountGate.open).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  modelStore.addNode(2, 3);
  auth.isAuthenticated = true; accountGate.open = false;
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
});

it.skip.each(['html', 'pdf', 'docx', 'csv', 'xlsx'] as const)('known wrong result: #2099 refuses a %s report when the model changes during sign-in', async format => {
  const opened = vi.fn(() => null);
  vi.stubGlobal('window', { open: opened });
  const pending = downloadReport(format, { title: 'Old results', stem: 'old', html: '<p>old results</p>', blocks: [] });
  await vi.waitFor(() => expect(accountGate.open).toBe(true));
  modelStore.addNode(2, 3);
  auth.isAuthenticated = true; accountGate.open = false;
  await pending;
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(opened).not.toHaveBeenCalled();
});
