import type { StructuredDiagnostic } from './types';

export function selfCheckWarnings(results: ReadonlyArray<{ structuredDiagnostics?: StructuredDiagnostic[] } | null | undefined>): StructuredDiagnostic[] {
  return results.flatMap((r) => r?.structuredDiagnostics ?? [])
    .filter((d) => d.phase?.startsWith('self_check:') && d.severity !== 'info');
}
