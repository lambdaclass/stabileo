/**
 * A member specified as a cable, solved through the app: the engine's cable analysis carries it,
 * in tension only and softened by its own weight, and the result reports its tension, thrust, sag
 * and equivalent modulus. A tripod of three cables holds a node: statically determinate, so each
 * cable's tension is the load over three times the sine of its slope. A fourth cable ties the node
 * down and would be compressed: it goes slack and carries nothing.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

const P = 120;
function tripod(tieDown: boolean) {
  const top = [0, 1, 2].map((k) => modelStore.addNode(6 * Math.cos((2 * Math.PI * k) / 3), 6 * Math.sin((2 * Math.PI * k) / 3), 10));
  const hub = modelStore.addNode(0, 0, 2);
  const ground = modelStore.addNode(0, 0, 0);
  const ids = top.map((n) => modelStore.addElement(n, hub, 'truss'));
  if (tieDown) ids.push(modelStore.addElement(ground, hub, 'truss'));
  const sec = [...modelStore.sections.keys()][0]!;
  modelStore.updateSection(sec, { a: 1e-3, iy: 1e-10, iz: 1e-10, j: 1e-10 } as never);
  for (const id of ids) modelStore.updateElement(id, { behaviour: 'cable' } as never);
  for (const n of [...top, ground]) modelStore.addSupport(n, 'pinned3d');
  const c = modelStore.addLoadCase('Load', 'L');
  modelStore.addNodalLoad3D(hub, 0, 0, -P, 0, 0, 0, c);
  modelStore.adoptAnalysis({ selfWeight: [] });
  modelStore.addCombination('1.0 L', [{ caseId: c, factor: 1 }]);
  return { ids, hub };
}

describe('a cable', () => {
  it('carries the statics tension, and reports its sag and modulus', () => {
    const { ids } = tripod(false);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const res = [...r.perCombo.values()][0]!;
    const cables = res.nonlinear?.cables ?? [];
    expect(cables.map((c) => c.elementId).sort()).toEqual([...ids].sort());
    const tension = P / (3 * 0.8);
    for (const c of cables) {
      expect(Math.abs(c.tension - tension)).toBeLessThan(5e-4 * tension);
      expect(c.sag).toBeGreaterThan(0);
      expect(c.ernstModulus).toBeLessThan(modelStore.materials.values().next().value!.e * 1000);
    }
    // The member force is the cable's tension.
    for (const id of ids) expect(Math.abs(res.elementForces.find((f) => f.elementId === id)!.nStart - tension)).toBeLessThan(5e-4 * tension);
    expect(res.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(P, 6);
  });

  it('goes slack where it would be compressed', () => {
    const { ids } = tripod(true);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const res = [...r.perCombo.values()][0]!;
    const tie = res.nonlinear!.cables!.find((c) => c.elementId === ids[3])!;
    expect(Math.abs(tie.tension)).toBeLessThan(1e-9 * P);
  });

  it('is a truss to the other analyses', async () => {
    tripod(false);
    const { buildSolverInput3D } = await import('../solver-service');
    const m = modelStore.model;
    const input = buildSolverInput3D({ nodes: m.nodes, elements: m.elements, supports: m.supports, loads: [], materials: m.materials, sections: m.sections } as never, false, false)!;
    for (const e of input.elements.values()) expect(e.type).toBe('truss');
  });
});

describe('a cable whose iteration does not settle', () => {
  /*
   * A horizontal 6 m rod from the head of a cantilever column to an anchor, the head pulled away
   * from it. The cable shares the pull with the column and carries little tension for its own
   * weight: the engine's equivalent-modulus iteration oscillates there, and more iterations do
   * not help. That used to abort the whole analysis with "the cable analysis did not converge".
   */
  function headTie(pull: number) {
    const foot = modelStore.addNode(0, 0, 0), head = modelStore.addNode(0, 0, 4), anchor = modelStore.addNode(6, 0, 4);
    modelStore.addElement(foot, head, 'frame');
    const rod = modelStore.addSection({ name: 'rod', a: 1e-3, iy: 1e-10, iz: 1e-10, j: 1e-10 } as never);
    const cable = modelStore.addElement(head, anchor, 'truss');
    modelStore.updateElement(cable, { behaviour: 'cable', sectionId: rod } as never);
    modelStore.addSupport(foot, 'fixed3d'); modelStore.addSupport(anchor, 'pinned3d');
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    modelStore.addNodalLoad3D(head, -pull, 0, 0, 0, 0, 0);
    return cable;
  }

  it('is reported, with the results of the last iteration, and does not abort the analysis', async () => {
    const cable = headTie(5);
    const r = await modelStore.solve3DAsync(false, false, true);
    expect(typeof r, String(r)).toBe('object');
    const res = r as import('../types-3d').AnalysisResults3D;
    expect(res.nonlinear?.converged).toBe(false);
    expect(res.nonlinear?.cablesConverged).toBe(false);
    expect(res.nonlinear?.cables?.map((c) => c.elementId)).toEqual([cable]);
    // Whatever the cable did, the statics still close on the pull.
    expect(res.reactions.reduce((s, x) => s + x.fx, 0)).toBeCloseTo(5, 6);
  });
});

