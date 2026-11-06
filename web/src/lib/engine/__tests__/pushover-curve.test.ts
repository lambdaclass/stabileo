/**
 * The pushover curve against the real engine, on a fixed-base portal pushed sideways: the sway
 * mechanism forms at 4·Mp/(H·h), the curve's first segment is the elastic stiffness, and every
 * point is in equilibrium with the load factor the engine reports.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { buildSolverInput3D } from '../solver-service';
import * as wasmSolver from '../wasm-solver';
import { solvePlastic3D, solve3D } from '../wasm-solver';
import { capacityCurve, defaultControl, hingesThrough, pushoverFrames, hingePoints, stoppedAtJoint } from '../pushover-curve';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const h = 3, L = 5, H = 10, MP = 100;

function portal() {
  modelStore.clear();
  const I = 1e-4;
  modelStore.restore({
    nodes: [
      [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: h }],
      [3, { id: 3, x: L, y: 0, z: h }], [4, { id: 4, x: L, y: 0, z: 0 }],
    ],
    materials: [[1, { id: 1, name: 's', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]],
    sections: [[1, { id: 1, name: 'p', a: 0.005, iz: I, iy: I, j: 2 * I }]],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
      [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1 }],
    ],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 4, type: 'fixed3d' }]],
    loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: H, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, caseId: 1 } }],
    loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
    nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 10 },
  } as never);
  const input = buildSolverInput3D({
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
    connectors: modelStore.connectors,
  } as never, false, false, { expandMemberOffsets: false })!;
  const res = solvePlastic3D({
    solver: input,
    sections: { 1: { a: 0.005, iy: I, iz: I, materialId: 1 } },
    materials: { 1: { fy: 250 } },
    maxHinges: 20,
    mpOverrides: { 1: [MP, MP] },
  });
  return { input, res };
}

describe('pushover curve', () => {
  // The engine used to release every end that reached Mp in the same step: at the top-left
  // joint the column and the beam reached it together, the joint's rotation was left with no
  // stiffness, the next solve failed and was read as a mechanism (13,31 instead of 13,33). It now
  // forms one hinge at such a joint and runs on to the sway mechanism.
  it('collapses at 4·Mp/(H·h), the sway mechanism', () => {
    const { res } = portal();
    const exact = (4 * MP) / (H * h);
    expect(Math.abs(res.collapseFactor - exact)).toBeLessThan(1e-9 * exact);
    expect(res.isMechanism).toBe(true);
    expect(res.warnings ?? []).toEqual([]);
  });

  it('no longer stops at a joint where every end yielded at once', () => {
    const { res } = portal();
    expect(stoppedAtJoint(res, modelStore.elements)).toBeNull();
  });

  it('does not flag a run that ended in a true mechanism', () => {
    const one = { elementId: 1, end: 'start', momentY: 1, momentZ: 0, interactionRatio: 1, loadFactor: 1, step: 0 };
    const res = { collapseFactor: 1, isMechanism: true, hinges: [one], steps: [{ loadFactor: 1, hingesFormed: [one], results: { displacements: [], reactions: [] } }] };
    expect(stoppedAtJoint(res, new Map([[1, { nodeI: 1, nodeJ: 2 }]]))).toBeNull();
  });

  it('carries the load factor as base shear at every point, and softens step by step', () => {
    const { res } = portal();
    const ctl = defaultControl(res)!;
    expect(ctl.dir).toBe('x');
    const curve = capacityCurve(res, ctl);
    expect(curve[0]).toMatchObject({ step: -1, displacement: 0, baseShear: 0 });
    expect(curve.length).toBe(res.steps.length + 1);
    for (const p of curve.slice(1)) expect(p.baseShear).toBeCloseTo(p.loadFactor * H, 6);
    // Softening: each segment is less stiff than the one before, and displacement only grows.
    const k = curve.slice(1).map((p, i) => (p.baseShear - curve[i]!.baseShear) / (p.displacement - curve[i]!.displacement));
    for (let i = 1; i < k.length; i++) expect(k[i]!).toBeLessThan(k[i - 1]! * (1 + 1e-9));
    expect(hingesThrough(res, res.steps.length - 1).length).toBe(4);
    expect(hingesThrough(res, -1)).toEqual([]);
  });

  it('starts on the elastic stiffness, and sums the increments into the state at a step', () => {
    const { input, res } = portal();
    const lin = solve3D(input as never) as any;
    const d1 = lin.displacements.find((d: any) => d.nodeId === 2).ux;
    const curve = capacityCurve(res, { nodeId: 2, dir: 'x' });
    expect(curve[1]!.baseShear / curve[1]!.displacement).toBeCloseTo(H / d1, 3);
    const last = res.steps.length - 1;
    const frames = pushoverFrames(res);
    expect(frames.timeSteps.length).toBe(res.steps.length + 1);
    const n2 = frames.nodeHistories.find((x) => x.nodeId === 2)!;
    expect(n2.ux[0]).toBe(0);
    expect(n2.ux[last + 1]).toBeCloseTo(curve[curve.length - 1]!.displacement, 12);
    expect(n2.ux[1]).toBeCloseTo(curve[1]!.displacement, 12);
    // The last increment alone is smaller than the total: the old readout showed only it.
    expect(Math.abs(res.steps[last].results.displacements.find((d: any) => d.nodeId === 2).ux)).toBeLessThan(curve[curve.length - 1]!.displacement);
  });

  it('draws each hinge on its member, just in from the end it formed at', () => {
    const pts = hingePoints(
      [{ elementId: 1, end: 'start' } as never, { elementId: 1, end: 'end' } as never],
      new Map([[1, { nodeI: 1, nodeJ: 2 }]]),
      new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 10 }]]),
    );
    expect(pts).toEqual([[0, 0, 0.8], [0, 0, 9.2]]);
  });
});

describe('pushover with stiffness modifiers', () => {
  it('the modified columns still form hinges: the sway mechanism does not depend on stiffness', async () => {
    const { withSolveSections } = await import('../member-behaviour');
    const { res: plain } = portal();
    for (const id of [1, 3]) modelStore.updateElement(id, { stiffness: { preset: 'column', iy: 0.7, iz: 0.7 } } as never);
    const input = buildSolverInput3D({
      nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
      loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
      quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
      connectors: modelStore.connectors,
    } as never, false, false, { expandMemberOffsets: false })!;
    expect(input.elements.get(1)!.sectionId).not.toBe(1);
    const I = 1e-4;
    const res = solvePlastic3D({
      solver: input,
      sections: withSolveSections({ 1: { a: 0.005, iy: I, iz: I, materialId: 1 } }, input, modelStore.elements),
      materials: { 1: { fy: 250 } },
      maxHinges: 20,
      mpOverrides: withSolveSections({ 1: [MP, MP] as [number, number] }, input, modelStore.elements),
    });
    expect(res.hinges.some((h: { elementId: number }) => h.elementId === 1 || h.elementId === 3)).toBe(true);
    expect(res.collapseFactor).toBeCloseTo(plain.collapseFactor, 1);
  });
});

it('actual pushover conversion carries run and step diagnostics into viewport/export disposition', async () => {
  const { resultsStore, uiStore } = await import('../../store');
  const { timeHistoryView } = await import('../../store/time-history-view.svelte');
  const { workspaceExportDisposition } = await import('../../export/containment');
  const { res: result } = portal();
  result.structuredDiagnostics = [...(result.structuredDiagnostics ?? []), { code: 'known_issue', severity: 'warning', phase: 'PL-3D-INVARIANCE', value: 758, message: 'numbering' }];
  result.steps[0]!.results.structuredDiagnostics = [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', value: 762, message: 'conditioning' }];
  const frames = pushoverFrames(result);
  expect(frames.structuredDiagnostics).toEqual(expect.arrayContaining(result.structuredDiagnostics ?? []));
  expect(frames.structuredDiagnostics!.some(d => d.phase === 'NUM-INVARIANCE')).toBe(true);
  uiStore.analysisMode = 'pro';
  timeHistoryView.set(frames, modelStore.modelVersion, 'pushover');
  timeHistoryView.setShown(true);
  expect(resultsStore.knownIssues3D.messages.join()).toContain('#762');
  expect(workspaceExportDisposition().messages.join()).toContain('#762');
  expect(workspaceExportDisposition().messages.join()).toContain('#758');
  timeHistoryView.clear(); resultsStore.clear();
});
