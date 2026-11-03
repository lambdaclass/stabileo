import type { StructuredDiagnostic } from './types';

type CheckResult = { structuredDiagnostics?: StructuredDiagnostic[] } | null | undefined;

export function selfCheckWarnings(results: ReadonlyArray<CheckResult>): StructuredDiagnostic[] {
  return [...new Set(results)].flatMap((r) => r?.structuredDiagnostics ?? [])
    .filter((d) => d.phase?.startsWith('self_check:') && d.severity !== 'info');
}

/** Case entries come first so an active result alias retains its case label. */
export function selfCheckGroups(results: ReadonlyArray<CheckResult>, labels: ReadonlyArray<string> = []) {
  const seen = new Set<CheckResult>();
  return results.flatMap((result, i) => {
    if (!result || seen.has(result)) return [];
    seen.add(result);
    const warnings = selfCheckWarnings([result]);
    return warnings.length ? [{ label: labels[i] ?? '', warnings }] : [];
  });
}
