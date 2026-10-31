/** Locale-free refusal detection, also safe in the solver worker. Keep the original error intact. */
export function isContainmentRefusal(error: unknown): boolean {
  const text = error instanceof Error ? error.message : error;
  if (typeof text !== 'string') return false;
  try {
    const data = JSON.parse(text.slice(text.indexOf('{')));
    return Array.isArray(data?.structuredDiagnostics) && data.structuredDiagnostics.some(
      (d: { code?: string; severity?: string } | null) => d?.code === 'known_issue' && d.severity === 'error',
    );
  } catch { return false; }
}
