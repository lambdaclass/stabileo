type Refusal = { message?: unknown; structuredDiagnostics: Array<{ code?: string; severity?: string } | null> };

function refusal(error: unknown): Refusal | null {
  const text = error instanceof Error ? error.message : error;
  if (typeof text !== 'string') return null;
  try {
    const data = JSON.parse(text.slice(text.indexOf('{')));
    return Array.isArray(data?.structuredDiagnostics) ? data : null;
  } catch { return null; }
}

export class CodedRefusal extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

export function refusedWithCode(error: unknown, code: string): boolean {
  if (error instanceof CodedRefusal) return error.code === code;
  return refusal(error)?.structuredDiagnostics.some((d) => d?.code === code && d.severity === 'error') ?? false;
}

/** Locale-free refusal detection, also safe in the solver worker. Keep the original error intact. */
export function isContainmentRefusal(error: unknown): boolean {
  return refusedWithCode(error, 'known_issue');
}

export function asCodedRefusal(error: unknown, code: string): unknown {
  if (error instanceof CodedRefusal || !refusedWithCode(error, code)) return error;
  const message = refusal(error)?.message;
  return typeof message === 'string' ? new CodedRefusal(message, code) : error;
}

export class ContainmentExportError extends Error {}
