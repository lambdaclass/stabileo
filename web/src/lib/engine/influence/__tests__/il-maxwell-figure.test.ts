import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import * as wasm from '../../wasm-solver';
import { planeModel } from '../../steps/plane-model';
import { maxwellSketch, maxwellField, peakLabels } from '../../steps/influence-figs';
import { UNIT_LOAD_DIR } from '../../influence-service';
import type { InfluenceQuantity } from '../../../store/model.svelte';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

function beam() {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(8, 0);
  modelStore.addElement(a, b); modelStore.addElement(b, c);
  modelStore.addSupport(a, 'pinned'); modelStore.addSupport(c, 'rollerX');
  return { a, b, c };
}

describe('Maxwell\'s figure is the deflection under the unit action it draws', () => {
  for (const [q, at, action] of [['uz', 'b', { fx: 0, fz: 1, my: 0 }], ['ry', 'a', { fx: 0, fz: 0, my: 1 }]] as const) {
    it(`${q}: the drawn shape moves the way the structure does under the drawn unit ${q === 'ry' ? 'couple' : 'force'}`, () => {
      const n = beam();
      const target = n[at];
      const il = modelStore.computeInfluenceLine(q as InfluenceQuantity, target, undefined, 0.5, 20, 'vertical');
      if (typeof il === 'string') throw new Error(il);
      const input = modelStore.buildSolverInput(false)!;
      const pm = planeModel(input);
      const field = maxwellField(input, q, { kind: 'node', nodeId: target }, il.points);
      const sk = maxwellSketch(pm, q, { kind: 'node', nodeId: target }, il.points, field);
      if (q === 'ry') expect(sk.couples![0].m).toBe(1);
      else expect(sk.forces![0].fz).toBe(1);
      const res = wasm.solve({ ...input, loads: [{ type: 'nodal', data: { nodeId: target, ...action } }] });
      const uMid = res.displacements.find((d) => d.nodeId === n.b)!.uz;
      expect(Math.abs(uMid)).toBeGreaterThan(1e-9);
      const drawn = sk.deformed!.flatMap((d) => d.points);
      const k = il.points.findIndex((p) => Math.abs(p.x - 4) < 1e-9);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(Math.sign(drawn[k].z)).toBe(Math.sign(uMid));
      const ratios = il.points.map((p, i) => ({ p, d: drawn[i].z - p.y })).filter(({ p }) => Math.abs(p.value) > 1e-12);
      for (const { p, d } of ratios) expect(Math.sign(d)).toBe(Math.sign(p.value * UNIT_LOAD_DIR.vertical.z));
      const labels = peakLabels(pm, il.points, UNIT_LOAD_DIR.vertical, true, field);
      const far = drawn.reduce((m, x) => (Math.abs(x.z) > Math.abs(m.z) ? x : m), drawn[0]);
      const peak = labels.find((l) => Math.abs(l.z - far.z) < 1e-12 && Math.abs(l.x - far.x) < 1e-12);
      expect(peak).toBeDefined();
      expect(peak!.anchor).toBe(far.z > 0 ? 'n' : 's');
    });
  }
});

describe('Maxwell\'s figure on a frame draws both components of the deflection', () => {
  it('an L frame under a unit vertical force at the tip: the column sways sideways as the solve says, not only along the load', () => {
    const base = modelStore.addNode(0, 0), top = modelStore.addNode(0, 3), tip = modelStore.addNode(4, 3);
    modelStore.addElement(base, top); modelStore.addElement(top, tip);
    modelStore.addSupport(base, 'fixed');
    const il = modelStore.computeInfluenceLine('uz' as InfluenceQuantity, tip, undefined, 0.5, 20, 'vertical');
    if (typeof il === 'string') throw new Error(il);
    const input = modelStore.buildSolverInput(false)!;
    const pm = planeModel(input);
    const field = maxwellField(input, 'uz', { kind: 'node', nodeId: tip }, il.points);
    const sk = maxwellSketch(pm, 'uz', { kind: 'node', nodeId: tip }, il.points, field);
    const res = wasm.solve({ ...input, loads: [{ type: 'nodal', data: { nodeId: tip, fx: 0, fz: 1, my: 0 } }] });
    const sway = res.displacements.find((d) => d.nodeId === top)!.ux;
    expect(Math.abs(sway)).toBeGreaterThan(1e-9);
    const drawn = sk.deformed!.flatMap((d) => d.points);
    const k = il.points.findIndex((p) => Math.abs(p.x) < 1e-9 && Math.abs(p.y - 3) < 1e-9);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(field[k].ux).toBeCloseTo(sway, 12);
    expect(Math.sign(drawn[k].x)).toBe(Math.sign(sway));
    il.points.forEach((p, i) => expect(field[i].ux * UNIT_LOAD_DIR.vertical.x + field[i].uz * UNIT_LOAD_DIR.vertical.z).toBeCloseTo(p.value, 12));
  });
});
