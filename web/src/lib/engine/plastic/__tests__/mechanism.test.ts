/**
 * A mechanism the user draws, checked the way the course does; the mechanism
 * the step-by-step analysis ends in; and the plastic rotation each hinge
 * accumulates on the way, against a hand calculation.
 */
import { describe, it, expect } from 'vitest';
import { evaluateUserMechanism, collapseMechanism } from '../mechanism';
import { plasticCollapse2D } from '../../plastic-collapse';
import { model, portal, fixedBeam, pOn, uniformMp, MP } from './helpers';
import { curveSeries, defaultAxis, niceTicks, curveCsv } from '../curve';

// Portal: members 1 (base 1 → top 2), 2 (beam 2 → 3, V at midspan), 3 (top 3 → base 4).
const SWAY = [{ member: 1, t: 0 }, { member: 1, t: 1 }, { member: 3, t: 0 }, { member: 3, t: 1 }];
const COMBINED = [{ member: 1, t: 0 }, { member: 2, t: 0.5 }, { member: 3, t: 0 }, { member: 3, t: 1 }];
const BEAM = [{ member: 1, t: 1 }, { member: 2, t: 0.5 }, { member: 3, t: 0 }];

describe('a mechanism chosen by the user', () => {
  it('sway on the classic portal: complete, λ = 4Mp/(Hh), moments past Mp at midspan → upper bound', () => {
    const u = evaluateUserMechanism(portal(1, 1), uniformMp, SWAY);
    expect(u.gh).toBe(3);
    expect(u.n).toBe(4);
    const v = u.verdict;
    expect(v.kind).toBe('mechanism');
    if (v.kind !== 'mechanism') return;
    expect(v.type).toBe('complete');
    expect(v.mech.lambda).toBeCloseTo(100, 9);
    expect(v.admissible).toBe(false);
    expect(v.dist!.worst!.member).toBe(2);
    expect(v.dist!.worst!.t).toBeCloseTo(0.5, 6);
    // M at midspan = λ·VL/4 = 150 (the corner moments cancel there): lower bound 100·100/150.
    expect(Math.abs(v.dist!.worst!.M)).toBeCloseTo(150, 6);
    expect(v.lower).toBeCloseTo((100 * MP) / 150, 6);
    expect(v.lower).toBeLessThan(600 / 7);
  });

  it('the combined mechanism is admissible: λ is the collapse load', () => {
    const v = evaluateUserMechanism(portal(1, 1), uniformMp, COMBINED).verdict;
    expect(v.kind).toBe('mechanism');
    if (v.kind !== 'mechanism') return;
    expect(v.type).toBe('complete');
    expect(v.mech.lambda).toBeCloseTo(600 / 7, 9);
    expect(v.admissible).toBe(true);
    expect(v.lower).toBeCloseTo(v.mech.lambda, 9);
  });

  it('the beam mechanism is partial (3 hinges < GH + 1): the free redundant is chosen by the static theorem, still above Mp', () => {
    const v = evaluateUserMechanism(portal(1, 1), uniformMp, BEAM).verdict;
    expect(v.kind).toBe('mechanism');
    if (v.kind !== 'mechanism') return;
    expect(v.type).toBe('partial');
    expect(v.mech.lambda).toBeCloseTo(800 / 6, 9);
    expect(v.dist!.free).toBe(1);
    expect(v.admissible).toBe(false);
    expect(v.lower).toBeLessThanOrEqual(600 / 7 + 1e-9);
  });

  it('a partial mechanism that governs is recognised as the collapse load', () => {
    // A strong lateral load on a pinned-base portal: the sway mechanism of two corner hinges.
    const m = model([[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]], [[1, 1, 2], [2, 2, 3], [3, 4, 3]],
      [[1, 'pinned'], [4, 'pinned']], [{ type: 'nodal', data: { nodeId: 2, fx: 10, fz: 0, my: 0 } }]);
    const u = evaluateUserMechanism(m, uniformMp, [{ member: 1, t: 1 }, { member: 3, t: 1 }]);
    expect(u.gh).toBe(1);
    const v = u.verdict;
    expect(v.kind).toBe('mechanism');
    if (v.kind !== 'mechanism') return;
    expect(v.type).toBe('complete');
    expect(v.mech.lambda).toBeCloseTo((2 * MP) / 40, 9);
    expect(v.admissible).toBe(true);
  });

  it('too few hinges: not a mechanism, and how many redundants remain', () => {
    const u = evaluateUserMechanism(portal(1, 1), uniformMp, [{ member: 1, t: 0 }, { member: 2, t: 0.5 }]);
    expect(u.verdict).toEqual({ kind: 'notMechanism', remaining: 1 });
  });

  it('five hinges on the portal: a mechanism of two degrees of freedom, or the least-λ combination', () => {
    const five = [...SWAY, { member: 2, t: 0.5 }];
    const u = evaluateUserMechanism(portal(1, 1), uniformMp, five);
    expect(u.verdict).toEqual({ kind: 'multi', dof: 2 });
    const c = evaluateUserMechanism(portal(1, 1), uniformMp, five, { combine: true }).verdict;
    expect(c.kind).toBe('mechanism');
    if (c.kind !== 'mechanism') return;
    expect(c.combined).toBe(true);
    expect(c.type).toBe('overcomplete');
    expect(c.mech.lambda).toBeCloseTo(600 / 7, 9);
    expect(c.still).toEqual([1]);
    expect(c.admissible).toBe(true);
  });

  it('hinges where nothing bends or twice at the same joint are set aside, and said why', () => {
    const m = model([[1, 0, 0], [2, 6, 0], [3, 8, 0]], [[1, 1, 2], [2, 2, 3], [3, 1, 3, 'truss']], [[1, 'pinned'], [2, 'rollerX']], [pOn(1, 3, -10)]);
    const u = evaluateUserMechanism(m, uniformMp, [{ member: 2, t: 1 }, { member: 3, t: 0.5 }, { member: 1, t: 0.5 }, { member: 1, t: 1 }, { member: 2, t: 0 }]);
    expect(u.ignored).toEqual([{ hinge: 0, why: 'zero' }, { hinge: 1, why: 'truss' }, { hinge: 4, why: 'duplicate' }]);
  });

  it('a fixed-fixed beam with a central load: three hinges is GH + 1 for bending (the axial redundant does not count)', () => {
    const v = evaluateUserMechanism(fixedBeam(6, 10), uniformMp, [{ member: 1, t: 0 }, { member: 1, t: 0.5 }, { member: 1, t: 1 }]).verdict;
    expect(v.kind).toBe('mechanism');
    if (v.kind !== 'mechanism') return;
    expect(v.type).toBe('complete');
    expect(v.mech.lambda).toBeCloseTo(800 / 60, 9);
    expect(v.admissible).toBe(true);
  });
});

describe('the mechanism the step-by-step analysis ends in', () => {
  it('portal: the combined mechanism, hinge rotations θ, 2θ, 2θ, θ', () => {
    const m = portal(1, 1);
    const r = plasticCollapse2D(m, { mp: uniformMp, np: () => Infinity });
    const v = collapseMechanism(m, r)!;
    expect(v.dof).toBe(1);
    expect(v.hinges.map((h) => Math.abs(h.theta)).sort()).toEqual([1, 1, 2, 2]);
    // Sway to the right: the top-left node moves +x by h·θ.
    expect(v.d[2 * v.km.nodePoint.get(2)!]).toBeCloseTo(4, 9);
  });
});

describe('plastic rotation at the hinges', () => {
  it('fixed-fixed beam with an off-centre load: −5·10⁻³ at the near wall, +5·10⁻³ under the load, 0 at the last hinge', () => {
    // EI = 2·10⁴ kN·m², P = 10 at 2 m of 6 m. Step 2 is a propped cantilever (θ_A = −1.333 P/EI per unit λ over
    // Δλ = 3.214); step 3 a 4 m cantilever with a link (link −PL³/3EI/2, tip slope PL²/2EI, over Δλ = 0.536).
    const r = plasticCollapse2D(model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [pOn(1, 2, -10)]), { mp: uniformMp, np: () => Infinity });
    expect(r.steps.map((s) => s.trace.dLambda)).toEqual([expect.closeTo(11.25, 9), expect.closeTo(45 / 14, 9), expect.closeTo(15 / 28, 9)]);
    expect(r.steps[1].rotations[0]).toBeCloseTo(-(4 / 3) * 10 / 2e4 * (45 / 14), 12);
    const last = r.steps[2].rotations;
    expect(last[0]).toBeCloseTo(-5e-3, 12);
    expect(last[1]).toBeCloseTo(5e-3, 12);
    expect(last[2]).toBe(0);
    // Each hinge turns the way its moment does: the plastic work is positive.
    r.hinges.forEach((h, i) => expect(-h.moment * last[i]).toBeGreaterThanOrEqual(0));
  });

  it('the trace explains each event: Δλ = (Mp − |M|)/|m| at the section that forms', () => {
    const r = plasticCollapse2D(portal(1, 1), { mp: uniformMp, np: () => Infinity });
    for (const st of r.steps) {
      for (const ev of st.trace.events) {
        expect(Math.abs(ev.before + st.trace.dLambda * ev.perUnit)).toBeCloseTo(ev.limit, 6);
      }
      expect(st.trace.lambdaBefore + st.trace.dLambda).toBeCloseTo(st.loadFactor, 12);
    }
  });
});

describe('the λ–displacement curve', () => {
  it('starts at the origin, has one point per step, and reads the plastic rotations of a hinge', () => {
    const r = plasticCollapse2D(model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [pOn(1, 2, -10)]), { mp: uniformMp, np: () => Infinity });
    const ax = defaultAxis(r)!;
    expect(ax).toEqual({ kind: 'hinge', hinge: 0 });
    const hinge = curveSeries(r, { kind: 'hinge', hinge: 0 });
    expect(hinge.map((p) => p.lambda)).toEqual([0, expect.closeTo(11.25, 9), expect.closeTo(14.4642857, 6), expect.closeTo(15, 9)]);
    expect(hinge[3].x).toBeCloseTo(-5e-3, 12);
    expect(curveCsv(hinge, 'theta').split('\n')).toHaveLength(5);
    expect(niceTicks(0, 77)).toEqual([0, 20, 40, 60, 80]);
  });
});

describe('placing hinges and drawing their moments', () => {
  it('a tap snaps to the member end, the load point, or stays where it was', async () => {
    const { pickHinge } = await import('../pick');
    const m = portal(1, 1);
    expect(pickHinge(m, { x: 0.02, z: 0.3 }, 0.2)).toEqual({ member: 1, t: 0 });
    expect(pickHinge(m, { x: 3.1, z: 4.02 }, 0.2)).toEqual({ member: 2, t: 0.5 });
    expect(pickHinge(m, { x: 1.734, z: 4 }, 0.2)!.t * 6).toBeCloseTo(1.73, 9);
    expect(pickHinge(m, { x: 3, z: 2 }, 0.2)).toBeNull();
  });

  it('the moments of a chosen mechanism reach the canvas as element forces with the same diagram', async () => {
    const { distributionResults } = await import('../../../canvas/draw-plastic-course');
    const { momentAt } = await import('../sections');
    const { computeDiagramValueAt } = await import('../../diagrams');
    const m = portal(1, 1);
    const u = evaluateUserMechanism(m, uniformMp, COMBINED);
    const v = u.verdict;
    if (v.kind !== 'mechanism' || !v.dist) throw new Error('no mechanism');
    const res = distributionResults(m, u.lm, v.dist.M, v.mech.lambda);
    const beam = res.elementForces.find((f) => f.elementId === 2)!;
    for (const t of [0, 0.25, 0.5, 0.8, 1]) {
      expect(-computeDiagramValueAt('moment', t, beam)).toBeCloseTo(momentAt(u.lm.sm, 2, t, v.dist.M, v.mech.lambda), 9);
    }
  });
});
