/**
 * Stairs and post-tensioned slabs through the store.
 *
 * A two-bay frame with its floor declared post-tensioned, solved with a dead and a live case: its
 * panels read in x and in y, checked once the tendon system and the tendons are stated, balanced
 * as the dead moments say, stressed in an order, drawn, and carried in the memoria. A stair saved
 * in the design data: designed, its reactions put on two beams and put again without doubling.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { alongBeam, applyStairReactions, ptPanels, saveStair, setPtPanel, setTendonSystem, stairChecks, stressingPlan } from '../stairs-pt';
import { memoriaInput } from '../memoria-inputs';
import { planContext, workDrawings } from '../work-drawings';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 8 }, { id: 'x2', name: '3', axis: 'x', at: 16 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 8 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

const system = { fpu: 1860, fpy: 1675, eps: 195000, aps: 98.7, jackRatio: 0.8, mu: 0.06, k: 0.0033, seating: 6, longTermLoss: 100, fci: 20, liveEnds: 'one' as const };

describe('post-tensioned slabs and stairs', () => {
  it('panels read, checked, balanced, ordered, drawn and in the memoria', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-30', e: 25700, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.22, materialId: mat, meshSize: 1, typology: 'postTensioned' });
    const lCase = modelStore.addLoadCase('L', 'L');
    for (const q of modelStore.quads.values()) { modelStore.addSurfaceLoad3D(q.id, 6.5, 1); modelStore.addSurfaceLoad3D(q.id, 3, lCase); }
    modelStore.addCombination('1.2D + 1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: lCase, factor: 1.6 }]);
    const combo = modelStore.solveCombinations3D(true, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);

    let ps = ptPanels();
    expect(ps).toHaveLength(2);
    expect(ps[0]!.rows.map((r) => r.titleKey)).toEqual(['check.pt.system', 'check.pt.layout']);

    setTendonSystem(system);
    const layout = { count: 12, yLeft: 0.15, yLow: 0.04, yRight: 0.15 };
    setPtPanel(ps[0]!.key, { x: layout, y: { ...layout, count: 6, banded: true } });
    ps = ptPanels();
    const p = ps[0]!;
    expect(p.balance.x!.wb).toBeGreaterThan(0);
    expect(p.balance.x!.wDead).toBeGreaterThanOrEqual(6.5);
    const keys = p.rows.map((r) => r.titleKey);
    expect(keys).toEqual(expect.arrayContaining(['check.pt.precompression', 'check.pt.classU', 'check.pt.strengthPos', 'check.pt.strengthNeg', 'check.pt.spacing']));
    expect(p.rows.find((r) => r.titleKey === 'check.pt.spacing')!.location).toBe('x');
    // The midspan row sags under dead load, so the balancing load lifts it.
    expect(p.rows.filter((r) => r.titleKey === 'check.pt.precompression')).toHaveLength(2);

    const order = stressingPlan();
    expect(order.map((o) => o.dir)).toEqual(['x', 'y']);
    expect(order[0]!.order).toHaveLength(12);

    const m = memoriaInput((k) => k, 'en');
    expect(m.elements.filter((e) => e.id.startsWith('pt-'))).toHaveLength(2);

    const sets = workDrawings(null, new Set(['tendons']), planContext('en', 'A1'));
    const tendons = sets.get('tendons')!;
    expect(tendons.map((d) => d.key)).toEqual(['tendons-plan', `tendon-${p.key}-x`, `tendon-${p.key}-y`]);
  });

  it('a stair: designed, its reactions on two beams, applied again without doubling, undone in one step', () => {
    saveStair({ id: 'st1', name: 'E1', riser: 0.175, tread: 0.28, steps: 10, waist: 0.18, width: 1.2, landingBottom: 1, landingTop: 1, ends: 'monolithic', finishes: 1, live: 5 });
    const s = stairChecks()[0]!;
    expect(s.design.mu).toBeGreaterThan(0);
    expect(s.rows.map((r) => r.clause)).toEqual(expect.arrayContaining(['7.3.1.1', '22.3', '6.5.2', '7.7.2.3', '24.4.3.2', '22.5.5.1(c)']));

    const beams = [...modelStore.elements.values()].filter((e) => {
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      return Math.abs((a.z ?? 0) - 3) < 1e-6 && Math.abs((b.z ?? 0) - 3) < 1e-6 && Math.abs((a.y ?? 0) - (b.y ?? 0)) < 1e-6;
    }).sort((p, q) => (modelStore.nodes.get(p.nodeI)!.y ?? 0) - (modelStore.nodes.get(q.nodeI)!.y ?? 0)).map((e) => e.id);
    // The foot on the beam along axis A, the head on the one along axis B.
    beams.splice(1, beams.length - 2);
    const before = modelStore.loads.length;
    // The beams are split at the slab's mesh: a 1,2 m wide stair starting 0,5 m along spans two pieces.
    const stretches = alongBeam(beams[0]!, 0.5, 1.2);
    expect(stretches.reduce((t, x) => t + x.to - x.from, 0)).toBeCloseTo(1.2, 9);
    const n = applyStairReactions('st1', { foot: { elementId: beams[0]!, a: 0.5 }, head: { elementId: beams[1]!, a: 0.5 } });
    expect(n).toBeGreaterThanOrEqual(4);
    expect(modelStore.loads.length).toBe(before + n);
    const mine = modelStore.loads.filter((l) => (l.data as { generatedBy?: string }).generatedBy === 'stair:st1');
    expect(mine).toHaveLength(n);
    const d = mine[0]!.data as { qZI: number; frame?: string };
    expect(d.qZI).toBeCloseTo(-s.design.reactions.foot.dead, 6);
    expect(d.frame).toBe('global');
    // The dead reaction times the width is what the foot beam receives.
    const footDead = mine.filter((l) => stretches.some((x) => x.elementId === (l.data as { elementId?: number }).elementId) && (l.data as { caseId?: number }).caseId === 1)
      .reduce((t, l) => { const q = l.data as { qZI: number; a?: number; b?: number }; return t + -q.qZI * ((q.b ?? 0) - (q.a ?? 0)); }, 0);
    expect(footDead).toBeCloseTo(s.design.reactions.foot.dead * 1.2, 6);
    applyStairReactions('st1', { foot: { elementId: beams[0]!, a: 0.5 }, head: { elementId: beams[1]!, a: 0.5 } });
    expect(modelStore.loads.length).toBe(before + n);
    historyStore.undo();
    expect(modelStore.loads.filter((l) => (l.data as { generatedBy?: string }).generatedBy === 'stair:st1')).toHaveLength(n);
    expect(stairChecks()[0]!.entry.supports?.foot?.elementId).toBe(beams[0]);

    const sets = workDrawings(null, new Set(['stairs']), planContext('en', 'A1'));
    expect(sets.get('stairs')!.map((x) => x.key)).toEqual(['stair-st1', 'stairs-bbs']);
    const m = memoriaInput((k) => k, 'en');
    expect(m.elements.find((e) => e.id === 'st-st1')!.rows.length).toBe(s.rows.length);
  });
});
