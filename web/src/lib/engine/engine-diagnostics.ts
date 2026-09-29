/**
 * The engine's older diagnostics, read into the app's shape.
 *
 * The linear solver still reports its path and conditioning as `{ category, message, severity }`
 * with an English sentence and no `source` or `code`. Shown as they came, the Diagnostics panel
 * printed a raw key ("DIAG.SOURCE.UNDEFINED") beside an English line in every language. Each
 * known sentence is matched and translated with its numbers; anything else keeps its text.
 *
 * Pure: the translator is passed in.
 */
import type { SolverDiagnostic } from './types';

type Legacy = Partial<SolverDiagnostic> & { category?: string; message: string; severity: SolverDiagnostic['severity'] };
type T = (k: string) => string;

const PATTERNS: Array<[RegExp, string, (m: RegExpMatchArray) => Record<string, string>]> = [
  [/^Sparse Cholesky solver \((\d+) free DOFs/, 'diag.engine.sparse', (m) => ({ n: m[1]! })],
  [/^Dense solver \((\d+) free DOFs/, 'diag.engine.dense', (m) => ({ n: m[1]! })],
  [/^Sparse Cholesky residual too large \(([^)]+)\)/, 'diag.engine.residualFallback', (m) => ({ r: m[1]! })],
  [/^Sparse Cholesky failed even with regularization/, 'diag.engine.regularizationFallback', () => ({})],
  [/^Extremely high diagonal ratio (\S+)/, 'diag.engine.illConditioned', (m) => ({ r: m[1]! })],
  [/^High diagonal ratio (\S+)/, 'diag.engine.conditioning', (m) => ({ r: m[1]! })],
];

export function readSolverDiagnostic(d: Legacy, t: T): SolverDiagnostic {
  let message = d.message;
  for (const [re, key, args] of PATTERNS) {
    const m = d.message.match(re);
    if (!m) continue;
    message = Object.entries(args(m)).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t(key));
    break;
  }
  return { ...d, source: d.source ?? 'solver', code: d.code ?? (d.category ? `SOLVER_${d.category.toUpperCase()}` : 'SOLVER'), message } as SolverDiagnostic;
}
