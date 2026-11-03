import { describe, it, expect, vi } from 'vitest';

const lp = vi.hoisted(() => ({ forceInfeasible: false, emptyMotion: false }));

vi.mock('../steps/sway-modes', async (orig) => {
  const real = await orig<typeof import('../steps/sway-modes')>();
  return { ...real, nullspace: (...a: Parameters<typeof real.nullspace>) => (lp.emptyMotion ? [] : real.nullspace(...a)) };
});

vi.mock('../plastic/lp', async (orig) => {
  const real = await orig<typeof import('../plastic/lp')>();
  return {
    ...real,
    solveLp: (p: Parameters<typeof real.solveLp>[0]) => {
      const last = p.rows[p.rows.length - 1];
      const consistency = p.c.every((v) => v === 0) && last?.op === '=' && last.b === 1;
      return lp.forceInfeasible && consistency ? { status: 'infeasible' as const } : real.solveLp(p);
    },
  };
});

import { plasticCollapse2D } from '../plastic-collapse';
import { verifiedCollapse } from '../../../components/advanced/plastic/user-compare';
import type { SolverInput } from '../types';

const propped = () => ({
  nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
  materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]]),
  loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
}) as unknown as SolverInput;

describe('a mechanism the consistency check cannot accept', () => {
  it('a propped cantilever with a consistent mechanism is a verified collapse', () => {
    lp.forceInfeasible = false;
    const r = plasticCollapse2D(propped(), { mp: () => 100, np: () => Infinity });
    expect(r.isMechanism).toBe(true);
    expect(r.unresolved).toBeUndefined();
  });

  it('an infeasible consistency program with no hinge to close is unresolved, not a verified collapse', () => {
    lp.forceInfeasible = true;
    const r = plasticCollapse2D(propped(), { mp: () => 100, np: () => Infinity });
    lp.forceInfeasible = false;
    expect(r.unresolved).toBe(true);
    expect(verifiedCollapse(r)).toBe(false);
    expect(r.isMechanism).toBe(false);
  });
});

describe('an analysis that runs out of events', () => {
  it('is unresolved, not a structure that does not collapse', () => {
    const cut = plasticCollapse2D(propped(), { mp: () => 100, np: () => Infinity, maxEvents: 1 });
    expect(cut.unresolved).toBe(true);
    expect(cut.isMechanism).toBe(false);
    const whole = plasticCollapse2D(propped(), { mp: () => 100, np: () => Infinity, maxEvents: 2 });
    expect(whole.unresolved).toBeUndefined();
    expect(whole.isMechanism).toBe(true);
  });
});

describe('a mechanism formed by the last allowed event', () => {
  it('goes through the same consistency check as one found inside the loop', () => {
    lp.forceInfeasible = true;
    const r = plasticCollapse2D(propped(), { mp: () => 100, np: () => Infinity, maxEvents: 2 });
    lp.forceInfeasible = false;
    expect(r.hinges).toHaveLength(2);
    expect(r.unresolved).toBe(true);
    expect(verifiedCollapse(r)).toBe(false);
    expect(r.isMechanism).toBe(false);
  });
});

describe('a mechanism the rigid-plastic model finds no motion for', () => {
  it('is unresolved, not a verified collapse', () => {
    lp.emptyMotion = true;
    const r = plasticCollapse2D(propped(), { mp: () => 100, np: () => Infinity });
    lp.emptyMotion = false;
    expect(r.unresolved).toBe(true);
    expect(verifiedCollapse(r)).toBe(false);
    expect(r.isMechanism).toBe(false);
  });
});
