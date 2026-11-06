import { knownIssueMessage } from './known-issue-message';
import { diagnosticKeys, mapKeys, opaqueKeys, recordKeys } from './generated/result-sites';
import { tsDiagnosticKeys, tsMapKeys, tsRecordKeys } from './generated/result-sites-ts';

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
    const errors = data.structuredDiagnostics.filter((d: { severity?: string }) => d.severity === 'error');
    const disposition = knownIssueDisposition(errors);
    if (disposition.refused) return disposition.messages.join('\n');
    const refusals = errors.filter((d: { code?: string }) => d.code === 'plastic_capacity_missing');
    return refusals.length > 0 ? [...new Set(refusals.map(knownIssueMessage))].join('\n') : null;
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

type Diagnostic = { code: string; severity: string; phase?: string; value?: number; message: string };

const DIAGNOSTIC_KEYS = [...new Set<string>([...diagnosticKeys, ...tsDiagnosticKeys])];
const RECORD_KEYS = [...new Set<string>([...recordKeys, ...tsRecordKeys])];
const MAP_KEYS = [...new Set<string>([...mapKeys, ...tsMapKeys])];
const OPAQUE_KEYS: readonly string[] = opaqueKeys;

const isKnownIssue = (d: unknown): d is Diagnostic =>
  !!d && typeof d === 'object' && (d as Diagnostic).code === 'known_issue' && typeof (d as Diagnostic).message === 'string';

export function knownIssueDiagnosticsIn(result: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<object>();
  const scanned = new Set<object>();
  function collect(value: unknown): void {
    if (Array.isArray(value)) value.forEach(collect);
    else if (isKnownIssue(value)) diagnostics.push(value);
  }
  function scan(value: unknown): void {
    if (!value || typeof value !== 'object' || scanned.has(value)) return;
    scanned.add(value);
    if (isKnownIssue(value)) diagnostics.push(value);
    (value instanceof Map ? [...value.values()] : Object.values(value)).forEach(scan);
  }
  function values(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(values); return; }
    (value instanceof Map ? [...value.values()] : Object.values(value)).forEach(visit);
  }
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value instanceof Map) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    for (const key of DIAGNOSTIC_KEYS) collect(record[key]);
    for (const key of OPAQUE_KEYS) scan(record[key]);
    for (const key of MAP_KEYS) values(record[key]);
    for (const key of RECORD_KEYS) visit(record[key]);
  }
  visit(result);
  return diagnostics;
}

export function knownIssueResultDisposition(result: unknown): ReturnType<typeof knownIssueDisposition> {
  return knownIssueDisposition(knownIssueDiagnosticsIn(result));
}
