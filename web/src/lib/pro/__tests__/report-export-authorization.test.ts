import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ saveRequiresAccount: true, isAuthenticated: false }));
vi.mock('../../store/auth.svelte', () => ({ authStore: auth }));
vi.mock('../../features', async original => ({ ...(await original<typeof import('../../features')>()), accounts: () => true }));
import { accountGate } from '../../store/account-gate.svelte';
import { modelStore, resultsStore, uiStore } from '../../store';
import * as inputs from '../../engine/pro-report-inputs';
import * as report from '../../engine/pro-report';
import * as provenance from '../../store/result-provenance';
import { t } from '../../i18n';
import { exportReportAs } from '../report-export';

beforeEach(() => {
  vi.stubEnv('VITE_ACCOUNTS', '1');
  auth.isAuthenticated = false;
  modelStore.clear(); resultsStore.clear();
  vi.spyOn(inputs, 'buildProReportData').mockReturnValue({
    projectName: 'Original model', date: '', nodes: [], elements: [], materials: [], sections: [], supports: [], loadCount: 0,
    verifications: [], t,
  } as never);
  vi.spyOn(provenance, 'provenanceForExport').mockResolvedValue(undefined as never);
  vi.spyOn(report, 'openReport').mockImplementation(() => {});
  vi.spyOn(uiStore, 'toast');
});

afterEach(() => {
  auth.isAuthenticated = false; accountGate.open = false;
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  modelStore.clear(); resultsStore.clear();
});

const cases = (['2d', 'pro'] as const).flatMap(mode =>
  ([undefined, 'pdf'] as const).flatMap(format =>
    (['edit', 'switch'] as const).map(change => ({ mode, format, change })),
  ),
);

it.each(cases)(
  'known wrong result: #2099 — refuses $mode/$format report after $change during sign-in',
  async ({ mode, format, change }) => {
    uiStore.analysisMode = mode;
    modelStore.addNode(0, 0);
    await exportReportAs({ config: { sections: { modelData: false } } as never, advancedResults: {}, t, format });
    expect(accountGate.open).toBe(true);
    expect(report.openReport).not.toHaveBeenCalled();
    if (change === 'switch') modelStore.clear();
    else modelStore.addNode(2, 3);
    auth.isAuthenticated = true; accountGate.open = false;
    expect(report.openReport).not.toHaveBeenCalled();
    expect(uiStore.toast).toHaveBeenCalledWith(t('provenance.exportChanged'), 'error');
  },
);

it.each(['2d', 'pro'] as const)('opens an unchanged %s report once after sign-in', async mode => {
  uiStore.analysisMode = mode;
  await exportReportAs({ config: { sections: { modelData: false } } as never, advancedResults: {}, t, format: 'pdf' });
  expect(accountGate.open).toBe(true);
  expect(report.openReport).not.toHaveBeenCalled();
  auth.isAuthenticated = true; accountGate.open = false;
  expect(report.openReport).toHaveBeenCalledOnce();
  expect(report.openReport).toHaveBeenCalledWith(expect.objectContaining({ projectName: 'Original model' }));
  expect(uiStore.toast).not.toHaveBeenCalled();
});

it('opens a current report immediately for an authenticated user', async () => {
  auth.isAuthenticated = true;
  await exportReportAs({ config: { sections: { modelData: false } } as never, advancedResults: {}, t });
  expect(accountGate.open).toBe(false);
  expect(report.openReport).toHaveBeenCalledOnce();
});

it('cancelling sign-in opens no report', async () => {
  await exportReportAs({ config: { sections: { modelData: false } } as never, advancedResults: {}, t });
  expect(accountGate.open).toBe(true);
  accountGate.open = false;
  expect(report.openReport).not.toHaveBeenCalled();
});
