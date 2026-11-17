/**
 * The works by phases through the store: a two-storey frame with its slabs, its phases proposed by
 * level, the model shown at the end of a phase, the safety items per level, the budget phase by
 * phase adding up to the whole, the stages for the staged analysis and the sheets.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { generatePhases, phaseScopes, showUpTo, siteData, siteSafetyItems, stagesForAnalysis } from '../site.svelte';
import { viewVisibility } from '../view-state.svelte';
import { saveBase, workItems } from '../budget';
import { priceBudget } from '../../engine/budget/budget';
import { planContext, workDrawings } from '../work-drawings';
import type { StructuralGrid } from '../../model/grid';

const grid: StructuralGrid = {
  axes: [{ id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 }, { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 }],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};
const tr = (k: string, p?: Record<string, string | number>) => (p?.level ? `${k}:${p.level}` : k);

describe('works by phases', () => {
  it('phases, animation, safety, budget by phase, stages and sheets', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    modelStore.setGrid(grid);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    placeSlabs(grid, { levels: ['N1', 'N2'], thickness: 0.15, materialId: mat, meshSize: 1 });

    const phases = generatePhases('2026-11-02', 10, tr);
    expect(phases.map((p) => p.name)).toEqual(['site.phase.verticals:P1', 'site.phase.horizontals:P1', 'site.phase.verticals:P2', 'site.phase.horizontals:P2']);
    expect(Object.keys(siteData().assign).length).toBeGreaterThan(0);

    showUpTo(0);
    const column = [...modelStore.elements.values()].find((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.max(a.z ?? 0, b.z ?? 0) > 5; })!;
    expect(viewVisibility.isElementHidden(column.id)).toBe(true);
    showUpTo(null);
    expect(viewVisibility.active).toBe(false);

    const safety = siteSafetyItems();
    expect(safety.filter((s) => s.kind === 'guardrail').map((s) => s.quantity)).toEqual([22, 22]);
    expect(safety.find((s) => s.kind === 'shoring')!.quantity).toBeCloseTo(30, 9);
    expect(safety.every((s) => s.phaseId === phases[1]!.id || s.phaseId === phases[3]!.id)).toBe(true);

    saveBase({ id: 'b', name: 'B', location: 'X', currency: 'ARS', date: '2026-10-01', locationFactor: 1, prices: { 'HOR.COLUMN.H-30': 100, 'HOR.BEAM.H-30': 100, 'HOR.SLAB.H-30': 100, 'SEG.GUARDRAIL': 10, 'SEG.SHORING': 5 } });
    const base = { id: 'b', name: 'B', location: 'X', currency: 'ARS', date: '2026-10-01', locationFactor: 1, prices: { 'HOR.COLUMN.H-30': 100, 'HOR.BEAM.H-30': 100, 'HOR.SLAB.H-30': 100, 'SEG.GUARDRAIL': 10, 'SEG.SHORING': 5 } };
    const whole = priceBudget(workItems(), base).directCost;
    const parts = phaseScopes().reduce((s, p) => s + priceBudget(workItems({ only: { elements: p.elements, shells: p.shells }, safety: p.safety }), base).directCost, 0);
    expect(parts).toBeCloseTo(whole, 6);

    expect(stagesForAnalysis()).toHaveLength(4);
    const sheets = workDrawings(null, new Set(['phases']), planContext('en', 'A1')).get('phases')!;
    expect(sheets[0]!.key).toBe('phases-schedule');
    expect(sheets.filter((d) => d.key.startsWith('phase-'))).toHaveLength(4);
  });
});
