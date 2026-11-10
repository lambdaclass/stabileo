import { appendFileSync } from 'node:fs';
import { expect } from 'vitest';

export async function cableRefusal(path: string, run: () => unknown, cable: number | number[]) {
  let result: unknown;
  try { result = await run(); } catch (error) { result = error; }
  const raw = String((result as Error)?.message ?? result);
  const start = raw.indexOf('{');
  if (start < 0) throw result;
  let data;
  try { data = JSON.parse(raw.slice(start)); } catch { throw result; }
  if (!Array.isArray(data?.structuredDiagnostics) || !data.structuredDiagnostics.some((d: { code?: string }) => d.code === 'cable_analysis_required')) throw result;
  expect(data.structuredDiagnostics, path).toContainEqual(expect.objectContaining({ code: 'cable_analysis_required', severity: 'error', elementIds: Array.isArray(cable) ? [...cable].sort((a, b) => a - b) : [cable] }));
  expect(data.results, path).toBeUndefined();
  expect(data.elementForces, path).toBeUndefined();
  expect(data.perCombo, path).toBeUndefined();
  const observed = { path, refused: true, elementForces: [], diagnostics: data.structuredDiagnostics };
  recordFixedReplay(observed);
  return observed;
}

export function recordFixedReplay(observed: unknown): void {
  if (process.env.SA_059_FIXED_RECORD) appendFileSync(process.env.SA_059_FIXED_RECORD, JSON.stringify(observed) + '\n');
}
