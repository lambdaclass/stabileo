type Refusal = { message?: unknown; structuredDiagnostics: Array<{ code?: string; severity?: string } | null> };

function refusal(error: unknown): Refusal | null {
  const text = error instanceof Error ? error.message : error;
  if (typeof text !== 'string') return null;
  try {
    const data = JSON.parse(text.slice(text.indexOf('{')));
    return Array.isArray(data?.structuredDiagnostics) ? data : null;
  } catch { return null; }
}

export function refusedWithCode(error: unknown, code: string): boolean {
  return refusal(error)?.structuredDiagnostics.some((d) => d?.code === code && d.severity === 'error') ?? false;
}

/** Locale-free refusal detection, also safe in the solver worker. Keep the original error intact. */
export function isContainmentRefusal(error: unknown): boolean {
  return refusedWithCode(error, 'known_issue');
}

export function plainRefusal(error: unknown): unknown {
  const r = refusal(error);
  return r && typeof r.message === 'string' ? new Error(r.message) : error;
}

export class ContainmentExportError extends Error {}
