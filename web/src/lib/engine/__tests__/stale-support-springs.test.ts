/**
 * #488: a support drawn as restrained is solved as restrained.
 *
 * The engine frees a 3D DOF that carries a positive spring even when its
 * restraint flag is set. The store kept a support's spring constants when its
 * type changed, so a spring support switched to fixed was sent to the solver
 * as "fixed + springs" and solved as elastic: 14 mm at an end drawn as fixed.
 *
 * Each case fails on the old code: the switched support moved, or the solver
 * received the spring.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../store';
import { isSolverReady } from '../wasm-solver';
import { withoutSpringsOnRestrained } from '../solver-service';
import { resetModel3D, support, DOF } from './helpers/random-models-3d';

const ALL_K = { kx: 100, ky: 100, kz: 100, krx: 100, kry: 100, krz: 100 };

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
});

/** Beam 0–4–8 m along x, fixed at 0, 10 kN down at 4 m; `place` puts the support at 8 m. */
function beam(place: (node: number) => void): { end: number } {
  resetModel3D();
  let end = 0;
  modelStore.batch(() => {
    const a = modelStore.addNode(0, 0, 0);
    const b = modelStore.addNode(4, 0, 0);
    end = modelStore.addNode(8, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(b, end, 'frame');
    support(a, 'fixed3d' as never);
    place(end);
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
  });
  return { end };
}

function solved(end: number) {
  const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
  const sups: any[] = input.supports instanceof Map ? [...input.supports.values()] : Object.values(input.supports as object);
  const r = modelStore.solve3D(false, false, false) as any;
  expect(typeof r).toBe('object');
  return { sup: sups.find((s) => s.nodeId === end), d: r.displacements.find((x: any) => x.nodeId === end) };
}

describe('#488 springs on restrained support DOFs', () => {
  it('a spring support switched to fixed is solved as fixed', () => {
    const { end } = beam((n) => {
      const s = support(n, 'spring3d' as never, undefined, ALL_K);
      modelStore.updateSupport(s, { type: 'fixed3d' as never });
    });
    const { sup, d } = solved(end);
    for (const k of ['kx', 'ky', 'kz', 'krx', 'kry', 'krz']) expect(sup[k]).toBeUndefined();
    expect(Math.abs(d.uz)).toBe(0);
    expect(Math.abs(d.ry)).toBe(0);
    // The store no longer carries them either, so unticking a DOF later
    // does not bring back a spring nobody sees.
    const stored = [...modelStore.supports.values()].find((s) => s.nodeId === end)!;
    expect([stored.kx, stored.ky, stored.kz, stored.krx, stored.kry, stored.krz]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it('a spring support switched to pinned keeps only the springs on its free rotations', () => {
    const { end } = beam((n) => {
      const s = support(n, 'spring3d' as never, undefined, ALL_K);
      modelStore.updateSupport(s, { type: 'pinned3d' as never });
    });
    const stored = [...modelStore.supports.values()].find((s) => s.nodeId === end)!;
    expect([stored.kx, stored.ky, stored.kz]).toEqual([undefined, undefined, undefined]);
    expect([stored.krx, stored.kry, stored.krz]).toEqual([100, 100, 100]);
    const { d } = solved(end);
    expect(d.uz).toBe(0);
  });

  it('ticking a DOF on a custom support drops that DOF\'s spring and keeps the others', () => {
    const { end } = beam((n) => {
      const s = support(n, 'spring3d' as never, DOF('xy'), { kz: 100, kry: 50 });
      modelStore.updateSupport(s, { dofRestraints: DOF('xyz'), type: 'custom3d' as never } as never);
    });
    const stored = [...modelStore.supports.values()].find((s) => s.nodeId === end)!;
    expect(stored.kz).toBeUndefined();
    expect(stored.kry).toBe(50);
    expect(solved(end).d.uz).toBe(0);
  });

  it('a project saved with springs on fixed DOFs is solved as fixed (export filter)', () => {
    const { end } = beam((n) => {
      const s = support(n, 'fixed3d' as never);
      // What an older version left in a saved project: bypass the store's cleanup.
      const old = modelStore.supports.get(s)!;
      modelStore.supports.set(s, { ...old, ...ALL_K });
    });
    const { sup, d } = solved(end);
    expect(sup.kz).toBeUndefined();
    expect(d.uz).toBe(0);
  });

  it('a genuine spring support still deflects on its springs', () => {
    const { end } = beam((n) => { support(n, 'spring3d' as never, undefined, ALL_K); });
    const { sup, d } = solved(end);
    expect(sup.kz).toBe(100);
    expect(d.uz).toBeLessThan(-1e-3);
  });

  it('leaves inclined supports alone: they restrain along their normal', () => {
    const s = { rx: true, ry: false, rz: false, rrx: false, rry: false, rrz: false, kx: 5, isInclined: true };
    expect(withoutSpringsOnRestrained(s)).toEqual(s);
    expect(withoutSpringsOnRestrained({ ...s, isInclined: false })).not.toHaveProperty('kx');
  });
});
