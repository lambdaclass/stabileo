import { expect } from 'vitest';

export function expectPDeltaEquilibriumRefusal(error: string, tolerance: number) {
  const refusal = JSON.parse(error);
  expect(refusal.structuredDiagnostics).toEqual([
    expect.objectContaining({
      code: 'result_quantity_unavailable',
      severity: 'error',
      phase: 'equilibrium',
      threshold: tolerance,
    }),
  ]);
  const { value } = refusal.structuredDiagnostics[0];
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThan(tolerance);
}
