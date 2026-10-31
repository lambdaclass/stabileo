import type { AnalysisResults3D } from './types-3d';

type Diagnostics = Pick<AnalysisResults3D, 'diagnostics' | 'solverDiagnostics' | 'structuredDiagnostics'>;

export function mergeResultDiagnostics(results: readonly Diagnostics[]): Diagnostics {
  const out: Diagnostics = {};
  for (const key of ['diagnostics', 'solverDiagnostics', 'structuredDiagnostics'] as const) {
    const entries = results.flatMap<NonNullable<Diagnostics[keyof Diagnostics]>[number]>(result => result[key] ?? []);
    if (entries.length) {
      Object.assign(out, { [key]: [...new Map(entries.map(entry => [JSON.stringify(entry), entry])).values()] });
    }
  }
  return out;
}
