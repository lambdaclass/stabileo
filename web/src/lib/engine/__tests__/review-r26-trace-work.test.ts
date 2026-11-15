import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import type { ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';

afterEach(() => vi.restoreAllMocks());

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  it.fails(`known wrong result: #2080 discarded station traces do not scale with duplicate inputs ${edition} ${axis} ${elementType}`, () => {
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
