import { knownIssueResultDisposition } from '../engine/known-issues';
import { resultsStore } from '../store/results.svelte';
import { uiStore } from '../store/ui.svelte';

export class ContainmentExportError extends Error {}

export function exportWarnings(sources: unknown): string[] {
  const disposition = knownIssueResultDisposition(sources);
  if (disposition.refused) throw new ContainmentExportError(disposition.messages.join('\n'));
  return disposition.messages;
}

/** Default for exports assembled from the workspace; explicit sources narrow independent exports. */
export function workspaceExportDisposition() {
  return uiStore.is3DWorkspace ? resultsStore.knownIssues3D : resultsStore.knownIssues;
}

export function exportMessages(disposition = workspaceExportDisposition()): string[] | null {
  if (disposition.refused) { uiStore.toast(disposition.messages.join('\n'), 'error'); return null; }
  return disposition.messages;
}
