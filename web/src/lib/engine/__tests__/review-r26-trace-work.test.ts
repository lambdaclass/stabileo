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

for (const sameText of [false, true]) it(`known wrong result: #2080 refused certificates retry without a hold code ${sameText}`, async () => {
  const gate = await import('../codes/argentina/cirsoc201-engine-gate');
  const original = gate.engineRecheckElement;
  let calls = 0;
  const check = vi.spyOn(gate, 'engineRecheckElement').mockImplementation((...args) => {
    const value = original(...args);
    calls++;
    value.engineRecheck.certified = { ok: false, lower: 0, upper: Infinity,
      reason: sameText ? 'Longitudinal torsion reinforcement not checked' : `retry ${calls}` };
    return value;
  });
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy: 0, vz: 1, torsion: 0 } }])[0]!.section('My');
  const input: ConcurrentVerificationInput = { elementId: 1, elementType: 'beam', demand, b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const result = verifyConcurrentElement([input, input]);
  expect(check).toHaveBeenCalledTimes(2);
  expect(result.concurrentChecks!.map(c => c.verification.engineRecheck!.certified!.reason)).toEqual(sameText ? Array(2).fill('Longitudinal torsion reinforcement not checked') : ['retry 1', 'retry 2']);
  expect(result.engineRecheck!.certified).not.toHaveProperty('code');
});

for (const other of ['ok', 'hold', 'refused', 'missing'] as const) it(`known wrong result: #2080 concurrent hold code survives only compatible certificates ${other}`, async () => {
  const gate = await import('../codes/argentina/cirsoc201-engine-gate');
  const original = gate.engineRecheckElement;
  const code = 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED' as const;
  let calls = 0;
  const check = vi.spyOn(gate, 'engineRecheckElement').mockImplementation((...args) => {
    const value = original(...args);
    calls++;
    value.engineRecheck.certified = calls === 1 || other === 'hold'
      ? { ok: false, lower: 0, upper: 0, code, reason: 'Unchecked provision display text' }
      : other === 'missing' ? undefined
        : { ok: other === 'ok', lower: 0, upper: 0, ...(other === 'refused' ? { reason: 'Other refusal' } : {}) };
    return value;
  });
  const inputs: ConcurrentVerificationInput[] = ConcurrentDemand.fromTuples([20, 21].map(my => ({ comboId: 1, comboName: 'C1',
    forces: { t: 0, x: 0, n: 0, my, mz: 0, vy: 0, vz: 1, torsion: 0 } })))
    .map(d => ({ elementId: 1, elementType: 'beam', demand: d.section('My'), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 }));
  const result = verifyConcurrentElement(inputs);
  expect(check).toHaveBeenCalledTimes(2);
  expect(result.engineRecheck!.certified!.ok).toBe(false);
  expect(result.engineRecheck!.certified!.code).toBe(other === 'ok' || other === 'hold' ? code : undefined);
});

it('known wrong result: #2080 repeated held stations reuse the code after wording changes', async () => {
  const gate = await import('../codes/argentina/cirsoc201-engine-gate');
  const original = gate.engineRecheckElement;
  const check = vi.spyOn(gate, 'engineRecheckElement').mockImplementation((...args) => {
    const value = original(...args);
    value.engineRecheck.certified = { ok: false, lower: 0, upper: 0,
      code: 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED', reason: 'Unchecked provision display text' };
    return value;
  });
  const demand = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: { t: 0, x: 0, n: 0, my: 20, mz: 0, vy: 0, vz: 1, torsion: 0 } }])[0]!.section('My');
  const input: ConcurrentVerificationInput = { elementId: 1, elementType: 'beam', demand, b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
  const result = verifyConcurrentElement([input, input]);
  expect(check).toHaveBeenCalledTimes(1);
  expect(result.concurrentChecks).toHaveLength(2);
  expect(result.engineRecheck!.certified).toMatchObject({ ok: false, code: 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED' });
});
