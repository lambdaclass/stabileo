/** JSON encodes the engine's infinite B₂ as null, including saved results. */
export function formatPDeltaFactor(value: number | null | undefined, digits = 3): string {
  if (value === null || value === Infinity) return '∞';
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}
