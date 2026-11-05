import { expect } from 'vitest';

export function expectPlasticRefusal(run: () => unknown): void {
  let error: unknown;
  try { run(); } catch (e) { error = e; }
  expect(typeof error, 'unsafe plastic result must be withheld').toBe('string');
  const value = JSON.parse(error as string);
  const message = 'Results withheld: the 2D plastic collapse factor can change by up to 4.6 times with numbering, member direction or units. Use an independently verified collapse analysis (known issue #758, PL-2D-INVARIANCE)';
  expect(value.message).toBe(message);
  expect(value.structuredDiagnostics).toContainEqual(expect.objectContaining({
    code: 'known_issue', severity: 'error', phase: 'PL-2D-INVARIANCE', value: 758, message,
  }));
}

export function expectMembraneRefusal(run: () => unknown): void {
  let error: unknown;
  try { error = run(); } catch (e) { error = e; }
  const text = error instanceof Error ? error.message : error;
  expect(typeof text, 'distorted membrane-bending result must be withheld').toBe('string');
  const value = JSON.parse((text as string).slice((text as string).indexOf('{"message"')));
  const message = 'Results withheld: distorted MITC4 quadrilaterals can be about ten times too stiff in membrane bending. Remesh with rectangular elements and check mesh convergence (known issue #798, SH-MITC4-DISTORTION)';
  expect(value.message).toBe(message);
  expect(value.structuredDiagnostics).toContainEqual(expect.objectContaining({ code: 'known_issue', severity: 'error', phase: 'SH-MITC4-DISTORTION', value: 798, message }));
}

export async function expectMembraneRefusalAsync(run: () => Promise<unknown>): Promise<void> {
  let error: unknown;
  try { error = await run(); } catch (e) { error = e; }
  expectMembraneRefusal(() => error);
}
