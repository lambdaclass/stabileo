import { knownIssueMessage } from './known-issue-message';

export { knownIssueMessage };

export function knownIssueDisposition(diagnostics: ReadonlyArray<{ code: string; severity: string; phase?: string; value?: number; message: string }> = []) {
  const issues = diagnostics.filter(d => d.code === 'known_issue');
  return {
    refused: issues.some(d => d.severity === 'error'),
    messages: [...new Set(issues.map(knownIssueMessage))],
  };
}

export function knownIssueRefusal(error: unknown): string | null {
  if (error instanceof Error) error = error.message;
  if (typeof error !== 'string') return null;
  try {
    const data = JSON.parse(error.slice(error.indexOf('{')));
    if (!Array.isArray(data?.structuredDiagnostics)) return null;
    const disposition = knownIssueDisposition(data.structuredDiagnostics.filter((d: { severity?: string }) => d.severity === 'error'));
    return disposition.refused ? disposition.messages.join('\n') : null;
  } catch { return null; }
}

export function refusedKnownIssues(error: unknown): Array<{ phase: string; value?: number }> {
  if (error instanceof Error) error = error.message;
  if (typeof error !== 'string') return [];
  try {
    const data = JSON.parse(error.slice(error.indexOf('{')));
    if (!Array.isArray(data?.structuredDiagnostics)) return [];
    return data.structuredDiagnostics.filter((d: { code?: string; severity?: string; phase?: unknown } | null) =>
      d?.code === 'known_issue' && d.severity === 'error' && typeof d.phase === 'string');
  } catch { return []; }
}

export function knownIssueResultDisposition(result: unknown): ReturnType<typeof knownIssueDisposition> {
  const diagnostics: Array<{ code: string; severity: string; phase?: string; value?: number; message: string }> = [];
  const seen = new Set<object>();
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value instanceof Map) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.structuredDiagnostics)) {
      for (const d of record.structuredDiagnostics) {
        if (d && d.code === 'known_issue' && typeof d.message === 'string') diagnostics.push(d);
      }
    }
    for (const key of ['positions', 'results', 'linearResults', 'finalResults', 'steps', 'stages', 'X', 'Y', 'Z', 'perCase', 'perCombo', 'perMode', 'caseResults', 'combinationResults', 'maxAbsResults', 'maxAbsResults3D', 'envelope', 'envelope3D', 'fullEnvelope']) visit(record[key]);
  }
  visit(result);
  return knownIssueDisposition(diagnostics);
}
