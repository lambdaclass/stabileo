import { accountGate, type GatedAction } from '../store/account-gate.svelte';
import { milestone } from '../tracking/activity.svelte';
import { assertExportCurrent, captureProvenanceToken, ExportChangedError } from '../store/result-provenance';
import { uiStore } from '../store/ui.svelte';
import { exportMessages } from './containment';
import { knownIssueResultDisposition } from '../engine/known-issues';

function exportCheck(action: GatedAction, sources?: unknown): () => boolean {
  const token = captureProvenanceToken();
  return () => {
    try {
      assertExportCurrent(token);
      return action !== 'export' || exportMessages(sources === undefined ? undefined : knownIssueResultDisposition(sources)) !== null;
    } catch (error) {
      if (!(error instanceof ExportChangedError)) throw error;
      uiStore.toast(error.message, 'error');
      return false;
    }
  };
}

export function runFileExport<T>(work: (check: () => boolean) => T | Promise<T>, cancelled: T, action: GatedAction = 'export', sources?: unknown): Promise<T> {
  const check = exportCheck(action, sources);
  return accountGate.run(action, () => check() ? work(check) : cancelled, cancelled);
}

export function saveFile(name: string, build: () => Blob, action: GatedAction = 'export', sources?: unknown): void {
  const check = exportCheck(action, sources);
  accountGate.guard(action, () => {
    if (!check()) return;
    const data = build();
    if (!check()) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    milestone(action === 'save' || /\.ded$/i.test(name) ? 'first_save' : 'first_export');
  });
}
