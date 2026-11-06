import { describe, it, expect } from 'vitest';
import { teachingPDelta, memberEndForces } from '../pdelta';
import { buildSystem, memberDofs } from '../system';
import { matVec, transpose } from '../dense';
import { rotation } from '../member-matrices';
import { portal } from './fixtures';

describe('the teaching P-Δ solve keeps its joints in equilibrium', () => {
  it('a released member under a span load, with φ: member end forces balance the joint loads at every free DOF', () => {
    const input = portal(4, 6, 300, 10, { hinged: true, extraLoads: [{ type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } }] });
    for (const method of ['phi', 'consistent'] as const) {
      const b = teachingPDelta(input, { method, axialRigid: false });
      if (!b.ok) throw new Error(b.reason.key);
      const { sys, final, history } = b.run;
      expect(b.run.converged).toBe(true);
      const N = history[history.length - 1].N;
      const ends = memberEndForces(sys, final, method, N);
      const nodal = new Array(sys.nTotal).fill(0);
      for (const m of sys.members) {
        const g = matVec(transpose(rotation(m.c, m.s)), ends.get(m.id)!);
        memberDofs(sys, m).forEach((d, k) => { nodal[d] += g[k]; });
      }
      for (const d of sys.free) expect(Math.abs(nodal[d] - sys.Fnodal[d])).toBeLessThan(1e-6);
    }
  });
});

describe('a load on a DOF no member stiffens is refused', () => {
  it('a couple at a joint where every member end is released', () => {
    const input = portal(4, 6, 300, 10, { hinged: true, extraLoads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: 0, my: 5 } }] });
    input.elements.set(3, { ...input.elements.get(3)!, hingeEnd: true });
    const b = buildSystem(input, { method: 'phi', axialRigid: false });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason.key).toBe('course.second-order.refuse.idleLoad');
  });

  it('the same joint without the couple still solves', () => {
    const input = portal(4, 6, 300, 10, { hinged: true });
    input.elements.set(3, { ...input.elements.get(3)!, hingeEnd: true });
    expect(buildSystem(input, { method: 'phi', axialRigid: false }).ok).toBe(true);
  });

  it('a 1 kN·m couple on that joint is refused next to a 1e12 kN force elsewhere', () => {
    const input = portal(4, 6, 300, 1e12, { hinged: true, extraLoads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: 0, my: 1 } }] });
    input.elements.set(3, { ...input.elements.get(3)!, hingeEnd: true });
    const b = buildSystem(input, { method: 'phi', axialRigid: false });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason.key).toBe('course.second-order.refuse.idleLoad');
  });

  it('a span load on the released members leaves no load on the idle rotation, at any scale', () => {
    for (const q of [1e-9, 1, 1e12]) {
      const input = portal(4, 6, 300, 10, { hinged: true, extraLoads: [{ type: 'distributed', data: { elementId: 2, qI: -q, qJ: -q } }, { type: 'distributed', data: { elementId: 3, qI: 0.3 * q, qJ: 0.7 * q } }] });
      input.elements.set(3, { ...input.elements.get(3)!, hingeEnd: true });
      expect(buildSystem(input, { method: 'phi', axialRigid: false }).ok).toBe(true);
      expect(buildSystem(input, { method: 'consistent', axialRigid: false }).ok).toBe(true);
    }
  });
});
