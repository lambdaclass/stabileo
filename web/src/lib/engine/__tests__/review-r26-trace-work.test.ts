import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import type { ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';

afterEach(() => vi.restoreAllMocks());

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  it(`known wrong result: #2080 discarded station traces do not scale with duplicate inputs ${edition} ${axis} ${elementType}`, () => {
    const inputs: ConcurrentVerificationInput[] = ConcurrentDemand.fromTuples([20, 100].map((m, i) => ({ comboId: i + 1, comboName: `C${i + 1}`,
      forces: { t: i, x: i * 0.4, n: 0, my: m, mz: m, vy: 1, vz: 1, torsion: 0 } })))
      .map(d => ({ elementId: 1, elementType, edition, demand: d.section(axis), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 }));
    const format = vi.spyOn(Number.prototype, 'toFixed');
    const small = verifyConcurrentElement(inputs);
    for (const key of ['flexure', 'shear', 'column', 'biaxial'] as const) void small[key]?.steps;
    const once = format.mock.calls.length;
    expect(once).toBeGreaterThan(0);
    format.mockClear();
    const many = verifyConcurrentElement(Array.from({ length: 32 }, () => inputs).flat());
    for (const key of ['flexure', 'shear', 'column', 'biaxial'] as const) expect(many[key]).toEqual(small[key]);
    expect(format.mock.calls.length).toBeLessThanOrEqual(once);
    expect(many.concurrentChecks).toHaveLength(64);
    for (const [i, check] of many.concurrentChecks!.entries()) expect(check.verification).toEqual(small.concurrentChecks![i % 2]!.verification);
  });
}

it('known wrong result: #2080 numeric beam checks do not format discarded calculation steps', async () => {
  const { checkFlexure, checkShear } = await import('../codes/argentina/cirsoc201');
  const params = { b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const format = vi.spyOn(Number.prototype, 'toFixed');
  const flexure = checkFlexure(params, 20);
  const shear = checkShear(params, 1);
  expect(format).not.toHaveBeenCalled();
  expect(flexure.steps.length).toBeGreaterThan(0);
  expect(shear.steps.length).toBeGreaterThan(0);
  expect(format.mock.calls.length).toBeGreaterThan(0);
});

it('deferred beam steps retain the checked inputs after a caller changes its proposed cage', async () => {
  const { checkFlexure, verifyElement } = await import('../codes/argentina/cirsoc201');
  const params = { b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const fixed = { flexure: checkFlexure(params, 100) };
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy: 0, vz: 1, torsion: 0 } }])[0]!.section('My');
  const input: ConcurrentVerificationInput = { ...params, elementId: 1, elementType: 'beam', demand };
  const expected = verifyElement(input, fixed).flexure.steps;
  const value = verifyElement(input, fixed);
  fixed.flexure.AsProv *= 2;
  fixed.flexure.bars = 'edited';
  expect(value.flexure.steps).toEqual(expected);
});

it('repeated station checks own their steps before a sibling is read', () => {
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy: 0, vz: 1, torsion: 0 } }])[0]!.section('My');
  const input: ConcurrentVerificationInput = { elementId: 1, elementType: 'beam', demand, b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const expected = [...verifyConcurrentElement([input]).concurrentChecks![0]!.verification.flexure.steps];
  const result = verifyConcurrentElement([input, input]);
  result.concurrentChecks![0]!.verification.flexure.steps.push('edited first station');
  expect(result.concurrentChecks![1]!.verification.flexure.steps).toEqual(expected);
});

it('refused certificates are retried for repeated station inputs', async () => {
  const gate = await import('../codes/argentina/cirsoc201-engine-gate');
  const original = gate.engineRecheckElement;
  let calls = 0;
  const check = vi.spyOn(gate, 'engineRecheckElement').mockImplementation((...args) => {
    const value = original(...args);
    value.engineRecheck.certified = { ok: false, lower: 0, upper: Infinity, reason: `retry ${++calls}` };
    return value;
  });
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy: 0, vz: 1, torsion: 0 } }])[0]!.section('My');
  const input: ConcurrentVerificationInput = { elementId: 1, elementType: 'beam', demand, b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const result = verifyConcurrentElement([input, input]);
  expect(check).toHaveBeenCalledTimes(2);
  expect(result.concurrentChecks!.map(c => c.verification.engineRecheck!.certified!.reason)).toEqual(['retry 1', 'retry 2']);
});
