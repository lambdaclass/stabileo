/**
 * The engine's known-issue warnings (engine/src/known_issues.rs), and its warnings that a thermal
 * load was solved with a default it did not state, in the reader's language.
 *
 * The engine writes them in English for the API and the MCP server, with the finding's id in
 * `phase` and the issue number in `value`. The app shows its own sentence for the id, so a
 * Spanish or Portuguese reader is warned in their language; an id the app does not know yet
 * keeps the engine's English rather than nothing.
 */
import { t, tp } from '../i18n';

export function knownIssueMessage(d: { code: string; phase?: string; value?: number; message: string; severity?: string }): string {
  // A thermal load solved with a default it did not state (#407): `phase` names the default.
  if (d.code === 'thermal_default_assumed' && d.phase) {
    const key = `thermalDefault.${d.phase}`;
    const text = t(key);
    return text === key ? d.message : text;
  }
  // A cable whose own weight gives most of its tension (#527): `value` the largest share.
  if (d.code === 'cable_self_weight_tension') {
    if (t('cableDiag.selfWeight') === 'cableDiag.selfWeight') return d.message;
    return tp('cableDiag.selfWeight', { pct: Math.round(100 * Math.min(1, d.value ?? 1)) });
  }
  if (d.code !== 'known_issue' || !d.phase) return d.message;
  const key = `knownIssue.${d.phase}${d.phase === 'SH-MITC4-DISTORTION' && d.severity === 'warning' ? '.warning' : ''}`;
  const text = t(key);
  if (text === key) return d.message;
  return d.value !== undefined ? `${text} (#${d.value})` : text;
}

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

export function knownIssueResultDisposition(result: unknown): ReturnType<typeof knownIssueDisposition> {
  const diagnostics: Array<{ code: string; severity: string; phase?: string; value?: number; message: string }> = [];
  const seen = new Set<object>();
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.structuredDiagnostics)) {
      for (const d of record.structuredDiagnostics) {
        if (d && d.code === 'known_issue' && typeof d.message === 'string') diagnostics.push(d);
      }
    }
    for (const key of ['positions', 'results', 'finalResults', 'steps', 'stages', 'X', 'Y', 'caseResults', 'combinationResults']) visit(record[key]);
  }
  visit(result);
  return knownIssueDisposition(diagnostics);
}
