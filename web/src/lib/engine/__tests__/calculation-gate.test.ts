import { describe, expect, it } from 'vitest';
import { calculationsBusy, guardExports, unwrapCalculation } from '../calculation-gate';

class Kernel { constructor(public n: number) {} free() {} }

describe('guardExports', () => {
  it('leases plain functions and leaves classes constructible', () => {
    let busyInside = false;
    const module = guardExports({
      solve: (x: number) => { busyInside = calculationsBusy(); return x * 2; },
      Kernel,
      initSync: () => 'init',
    }, () => true);
    expect(module.solve(2)).toBe(4);
    expect(busyInside).toBe(true);
    expect(calculationsBusy()).toBe(false);
    expect(new module.Kernel(3).n).toBe(3);
    expect(module.Kernel).toBe(Kernel);
    expect(module.initSync()).toBe('init');
    expect(module.solve).toBe(module.solve);
  });

  it('returns the module itself outside the desktop app', () => {
    let busyInside = true;
    const solve = () => { busyInside = calculationsBusy(); return 1; };
    const guarded = guardExports({ solve }, () => false).solve;
    expect(guarded()).toBe(1);
    expect(busyInside).toBe(false);
    expect(unwrapCalculation(guarded)).toBe(solve);
  });

  it('releases the lease when the call throws', () => {
    const module = guardExports({ fail: () => { throw new Error('boom'); } }, () => true);
    expect(() => module.fail()).toThrow('boom');
    expect(calculationsBusy()).toBe(false);
  });
});
