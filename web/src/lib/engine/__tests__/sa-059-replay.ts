import { expect } from 'vitest';

export async function cableRefusal(path: string, run: () => unknown, cable: number) {
  let result: unknown;
  try { result = await run(); } catch (error) { result = error; }
  const raw = String((result as Error)?.message ?? result);
  const start = raw.indexOf('{');
  if (start < 0) throw result;
  let data;
  try { data = JSON.parse(raw.slice(start)); } catch { throw result; }
  expect(data.structuredDiagnostics, path).toContainEqual(expect.objectContaining({ code: 'cable_analysis_required', severity: 'error', elementIds: [cable] }));
  expect(data.results, path).toBeUndefined();
  expect(data.elementForces, path).toBeUndefined();
  expect(data.perCombo, path).toBeUndefined();
  return { path, refused: true, elementForces: [], diagnostics: data.structuredDiagnostics };
}
