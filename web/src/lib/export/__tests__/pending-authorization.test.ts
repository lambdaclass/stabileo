import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const serialization = vi.hoisted(() => ({ builds: 0, pause: null as null | (() => Promise<void>) }));
vi.mock('../report-formats', async original => {
  const real = await original<typeof import('../report-formats')>();
  return { ...real, reportFile: async (...args: Parameters<typeof real.reportFile>) => {
    serialization.builds++;
    await serialization.pause?.();
    return real.reportFile(...args);
  } };
});
const auth = vi.hoisted(() => ({ saveRequiresAccount: true, isAuthenticated: false }));
vi.mock('../../store/auth.svelte', () => ({ authStore: auth }));
vi.mock('../../features', async original => ({ ...(await original<typeof import('../../features')>()), accounts: () => true }));
vi.mock('../../tracking/activity.svelte', () => ({ milestone: vi.fn() }));
import { accountGate } from '../../store/account-gate.svelte';
import { modelStore, resultsStore, uiStore } from '../../store';
import { saveFile } from '../save-file';
import { downloadReport } from '../report-download';
import { exportToExcel } from '../excel';

beforeEach(() => {
  modelStore.clear(); resultsStore.clear();
  serialization.builds = 0; serialization.pause = null;
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

it.each(['2d', 'pro'] as const)('known wrong result: #2099 refuses a %s file when the model changes during sign-in', mode => {
  uiStore.analysisMode = mode;
  const toast = vi.spyOn(uiStore, 'toast');
  saveFile('results.csv', () => new Blob(['old results']));
  expect(accountGate.open).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  modelStore.addNode(2, 3);
  auth.isAuthenticated = true; accountGate.open = false;
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
});

it.each(['html', 'pdf', 'docx', 'csv', 'xlsx'] as const)('known wrong result: #2099 refuses a %s report when the model changes during sign-in', async format => {
  const opened = vi.fn(() => null);
  vi.stubGlobal('window', { open: opened });
  const pending = downloadReport(format, { title: 'Old results', stem: 'old', html: '<p>old results</p>', blocks: [] });
  await vi.waitFor(() => expect(accountGate.open).toBe(true));
  expect(serialization.builds).toBe(0);
  modelStore.addNode(2, 3);
  auth.isAuthenticated = true; accountGate.open = false;
  await pending;
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(opened).not.toHaveBeenCalled();
});

it('builds an unchanged file only after authorization and downloads it once', () => {
  const build = vi.fn(() => new Blob(['current results']));
  saveFile('results.csv', build);
  expect(build).not.toHaveBeenCalled();
  auth.isAuthenticated = true; accountGate.open = false;
  expect(build).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});

it('cancelling authorization builds and downloads nothing', () => {
  const build = vi.fn(() => new Blob(['current results']));
  saveFile('results.csv', build);
  accountGate.open = false;
  expect(build).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('rechecks provenance after building and before making the download URL', () => {
  auth.isAuthenticated = true;
  saveFile('results.csv', () => { modelStore.addNode(2, 3); return new Blob(['old results']); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it.each(['2d', 'pro'] as const)('rechecks %s containment after building', mode => {
  uiStore.analysisMode = mode;
  auth.isAuthenticated = true;
  saveFile('results.csv', () => {
    const result = { displacements: [], elementForces: [], reactions: [], structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' }] };
    if (mode === 'pro') resultsStore.setResults3D(result as never);
    else resultsStore.setResults(result as never);
    return new Blob(['unsafe results']);
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it.each(['html', 'pdf', 'docx', 'csv', 'xlsx'] as const)('an unchanged %s report downloads after sign-in', async format => {
  const opened = vi.fn(() => ({ document: { write() {}, close() {} }, focus() {}, print() {} }));
  vi.stubGlobal('window', { open: opened });
  const pending = downloadReport(format, { title: 'Current', stem: 'current', html: '<p>current results</p>', blocks: [] });
  expect(accountGate.open).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(opened).not.toHaveBeenCalled();
  auth.isAuthenticated = true; accountGate.open = false;
  expect(await pending).toBe(format === 'csv' ? 'current-csv.zip' : `current.${format}`);
  if (format === 'pdf') expect(opened).toHaveBeenCalledOnce();
  else expect(URL.createObjectURL).toHaveBeenCalledOnce();
});

it('an independent result keeps its own containment scope at the real download boundary', async () => {
  const { captureAnalysisProvenance } = await import('../../store/result-provenance');
  const { downloadResultText } = await import('../provenance-attach');
  uiStore.analysisMode = 'pro';
  const refused = { displacements: [], elementForces: [], reactions: [], structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' }] };
  resultsStore.setResults3D(refused as never);
  const clean = { structuredDiagnostics: [] };
  const record = captureAnalysisProvenance('independent', { step: 1 })(clean);
  const pending = downloadResultText('current results', 'results.csv', 'text/csv', record, clean);
  expect(await pending).toBe(true);
  expect(accountGate.open).toBe(true);
  auth.isAuthenticated = true; accountGate.open = false;
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});

it.each(['html', 'docx', 'csv', 'xlsx'] as const)('refuses a %s report if the model changes while serialization is pending', async format => {
  auth.isAuthenticated = true;
  let resume!: () => void;
  serialization.pause = () => new Promise<void>(resolve => { resume = resolve; });
  const pending = downloadReport(format, { title: 'Old', stem: 'old', html: '<p>old results</p>', blocks: [] });
  expect(serialization.builds).toBe(1);
  modelStore.addNode(2, 3);
  resume();
  expect(await pending).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it.each(['2d', 'pro'] as const)('refuses a %s workbook if the model changes during authorization', async mode => {
  uiStore.analysisMode = mode;
  const pending = exportToExcel({ onlyExtras: true });
  expect(accountGate.open).toBe(true);
  modelStore.addNode(2, 3);
  auth.isAuthenticated = true; accountGate.open = false;
  expect(await pending).toBe(false);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it.each(['2d', 'pro'] as const)('downloads an unchanged %s workbook after authorization', async mode => {
  uiStore.analysisMode = mode;
  const pending = exportToExcel({ onlyExtras: true, extraSheets: [{ name: 'Values', rows: [['value'], [42]] }] });
  expect(accountGate.open).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  auth.isAuthenticated = true; accountGate.open = false;
  expect(await pending).toBe(true);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});
