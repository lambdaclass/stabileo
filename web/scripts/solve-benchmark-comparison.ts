const metadata = new Set(['timings', 'diagnostics', 'solverDiagnostics', 'structuredDiagnostics']);

export function compareSolveResults(actual: unknown, expected: unknown, path = 'results'): void {
  const fail = () => { throw new Error(`Solve results differ at ${path}: ${String(actual)} vs ${String(expected)}`); };
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (!Number.isFinite(actual) || !Number.isFinite(expected)
      || Math.abs(actual - expected) > 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected))) fail();
    return;
  }
  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size !== expected.size) fail();
    for (const [key, value] of actual) {
      if (!expected.has(key)) fail();
      compareSolveResults(value, expected.get(key), `${path}[${key}]`);
    }
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) fail();
    actual.forEach((value, i) => compareSolveResults(value, expected[i], `${path}[${i}]`));
    return;
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    if (Array.isArray(actual) !== Array.isArray(expected) || actual instanceof Map || expected instanceof Map) fail();
    const a = actual as Record<string, unknown>, b = expected as Record<string, unknown>;
    const keys = (o: Record<string, unknown>) => Object.keys(o).filter(k => !metadata.has(k) && o[k] !== undefined).sort();
    const ak = keys(a), bk = keys(b);
    if (JSON.stringify(ak) !== JSON.stringify(bk)) fail();
    for (const key of ak) compareSolveResults(a[key], b[key], `${path}.${key}`);
    return;
  }
  if (actual !== expected) fail();
}
