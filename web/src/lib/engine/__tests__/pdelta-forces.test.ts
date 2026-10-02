/**
 * P-Delta member forces with the geometric stiffness restored, against the exact elastic solution
 * of a cantilever with a head load, in both planes and with one and with four elements; and the
 * engine's own forces pinned as they are, so fixing them there shows up here.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver, solvePDelta3D as solvePDelta3DRaw } from '../wasm-solver';
import { buildSolverInput3D } from '../solver-service';
import { correctPDeltaForces, solvePDelta3DCorrected as solvePDelta3D } from '../pdelta-forces';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const L = 4, P = 60, H = 0.12;
function cantilever(segments: number, alongX: boolean) {
  const ids = Array.from({ length: segments + 1 }, (_, i) => modelStore.addNode(0, 0, (L * i) / segments));
  for (let i = 0; i < segments; i++) modelStore.addElement(ids[i]!, ids[i + 1]!, 'frame');
  modelStore.addSupport(ids[0]!, 'fixed3d');
  const m = modelStore.model;
  const input = buildSolverInput3D({ nodes: m.nodes, elements: m.elements, supports: m.supports, loads: [], materials: m.materials, sections: m.sections } as never, false, false)!;
  const full = { ...input, loads: [{ type: 'nodal' as const, data: { nodeId: ids[segments]!, fx: alongX ? H : 0, fy: alongX ? 0 : H, fz: -P, mx: 0, my: 0, mz: 0 } }] };
  const sec = [...m.sections.values()][0]!, E = [...m.materials.values()][0]!.e * 1000;
  const I = alongX ? sec.iy! : sec.iz;
  const k = Math.sqrt(P / (E * I));
  /** Exact bending moment at height z of an elastic cantilever with a head load. */
  const exact = (z: number) => (H * Math.sin(k * (L - z))) / (k * Math.cos(k * L));
  return { input: full, exact, baseId: [...modelStore.elements.values()].find((e) => e.nodeI === ids[0])!.id, headId: [...modelStore.elements.values()].find((e) => e.nodeJ === ids[segments])!.id };
}
/** The engine lists members in its own order, so they are found by id. */
const byId = (r: { elementForces: Array<{ elementId: number }> }, id: number) => r.elementForces.find((f) => f.elementId === id) as never as { myStart: number; mzStart: number; myEnd: number; mzEnd: number; vyStart: number; vzStart: number };
const moment = (f: { myStart: number; mzStart: number }) => Math.max(Math.abs(f.myStart), Math.abs(f.mzStart));
const shear = (f: { vyStart: number; vzStart: number }) => Math.max(Math.abs(f.vyStart), Math.abs(f.vzStart));

describe('P-Delta member forces', () => {
  for (const alongX of [true, false]) {
    for (const segments of [1, 4]) {
      it(`${alongX ? 'strong' : 'weak'} axis, ${segments} element(s): the base moment is the exact one, the shear the applied load`, () => {
        const { input, exact, baseId, headId } = cantilever(segments, alongX);
        const r = solvePDelta3D(input as never).results;
        // The wrapper's correction is the module's; applying it by hand to the raw answer agrees.
        expect(byId(correctPDeltaForces(input as never, solvePDelta3DRaw(input as never).results), baseId).myStart).toBeCloseTo(byId(r, baseId).myStart, 12);
        const base = byId(r, baseId);
        expect(Math.abs(moment(base) - exact(0)) / exact(0)).toBeLessThan(0.01);
        expect(Math.abs(shear(base) - H) / H).toBeLessThan(0.02);
        const head = byId(r, headId);
        expect(Math.max(Math.abs(head.myEnd), Math.abs(head.mzEnd))).toBeLessThan(0.01 * exact(0));
      });
    }
  }

  for (const alongX of [true, false]) {
    it(`${alongX ? 'strong' : 'weak'} axis: the base reactions balance the head load and hold the exact moment`, () => {
      const { input, exact } = cantilever(4, alongX);
      const r = solvePDelta3D(input as never).results;
      const base = r.reactions[0]!;
      // Horizontal: the reaction is the applied load, exactly, whatever the sway.
      expect((alongX ? base.fx : base.fy) + H).toBeCloseTo(0, 9);
      expect(base.fz - P).toBeCloseTo(0, 9);
      // And the base moment is the second-order one, P·Δ included.
      expect(Math.abs(Math.abs(alongX ? base.my : base.mx) - exact(0)) / exact(0)).toBeLessThan(0.01);
    });
  }

  // A braced frame whose brace is a truss: the brace's string force reaches the support too.
  it('a truss at a support takes its share of the second-order reaction', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(0, 0, 4), d = modelStore.addNode(4, 0, 4);
    modelStore.addElement(a, c, 'frame'); modelStore.addElement(b, d, 'frame'); modelStore.addElement(c, d, 'frame');
    modelStore.addElement(a, d, 'truss');
    for (const n of [a, b]) modelStore.addSupport(n, 'pinned3d');
    const m = modelStore.model;
    const input = buildSolverInput3D({ nodes: m.nodes, elements: m.elements, supports: m.supports, loads: [], materials: m.materials, sections: m.sections } as never, false, false)!;
    const full = { ...input, loads: [c, d].map((n) => ({ type: 'nodal' as const, data: { nodeId: n, fx: 5, fy: 0, fz: -400, mx: 0, my: 0, mz: 0 } })) };
    const r = solvePDelta3D(full as never).results;
    const sum = (k: 'fx' | 'fy' | 'fz') => r.reactions.reduce((s: number, x: Record<string, number>) => s + x[k]!, 0);
    expect(sum('fx') + 10).toBeCloseTo(0, 6);
    expect(sum('fz') - 800).toBeCloseTo(0, 6);
  });

  // The engine's reactions had the same defect as the member forces (0.198 kN against 0.12
  // applied, 0.824 against the exact 0.778) until it was fixed on its side. The wrapper must
  // leave them untouched: adding the geometric terms again would double-count them.
  it('reactions balance the applied loads, and agree with the corrected member forces', () => {
    const { input, exact } = cantilever(1, false);
    const r = solvePDelta3D(input as never).results;
    const base = r.reactions.find((x: { nodeId: number }) => x.nodeId === 1)!;
    expect(Math.abs(base.fy + H) / H).toBeLessThan(0.02);
    expect(Math.abs(base.fz - P) / P).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(base.mx) - exact(0)) / exact(0)).toBeLessThan(0.01);
    // The support agrees with the corrected member it holds, sign included: for this member
    // the base moment about global x is the local-z end moment.
    const member = byId(r, [...modelStore.elements.values()][0]!.id);
    const memberBase = Math.abs(member.myStart) > Math.abs(member.mzStart) ? member.myStart : member.mzStart;
    expect(Math.abs(base.mx - memberBase)).toBeLessThan(1e-9);
  });

  for (const alongX of [true, false]) {
    it(`one released end preserves shear and reaction equilibrium (${alongX ? 'x' : 'y'})`, () => {
      const { input, baseId } = cantilever(1, alongX);
      const member = input.elements.get(baseId)!;
      input.elements.set(baseId, { ...member, releaseMyEnd: true, releaseMzEnd: true });
      input.supports.set(2, { nodeId: 2, rx: false, ry: false, rz: false, rrx: true, rry: true, rrz: true });
      const r = solvePDelta3D(input as never, 30, 1e-8);
      expect(r.converged && r.isStable).toBe(true);
      const f = byId(r.results, baseId);
      expect(shear(f)).toBeCloseTo(H, 8);
      expect(f.myEnd).toBeCloseTo(0, 10);
      expect(f.mzEnd).toBeCloseTo(0, 10);
      const reaction = r.results.reactions.find((x: { nodeId: number }) => x.nodeId === 1)!;
      expect(moment(f)).toBeCloseTo(Math.max(Math.abs(reaction.mx), Math.abs(reaction.my)), 8);
    });
  }

  // The engine's own forces leave the geometric part out. When this starts passing, the engine
  // has been fixed and `pdelta-forces.ts` must go, or it will count Kg·u twice.
  it.fails('the engine reports the weak-axis base moment of a P-Delta solve within 1 %', () => {
    const { input, exact, baseId } = cantilever(1, false);
    const base = byId(solvePDelta3DRaw(input as never).results, baseId);
    expect(Math.abs(moment(base) - exact(0)) / exact(0)).toBeLessThan(0.01);
  });

  // The known gap, bounded: the engine's own moment is about 6 % off (without Kg·u), not some
  // other failure the it.fails above would also accept.
  it('the engine\'s own weak-axis moment is off by the geometric part alone', () => {
    const { input, exact, baseId } = cantilever(1, false);
    const base = byId(solvePDelta3DRaw(input as never).results, baseId);
    const err = Math.abs(moment(base) - exact(0)) / exact(0);
    expect(err).toBeGreaterThan(0.01);
    expect(err).toBeLessThan(0.1);
  });
});
