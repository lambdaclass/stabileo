import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { featuresForMode } from '../../../../config/public-features.mjs';
import DespieceInspector from '../../../components/DespieceInspector.svelte';
import { modelStore, resultsStore, uiStore } from '../../store';
import { solvePDelta3D } from '../../engine/wasm-solver';

const runReproducer = process.env.RUN_KNOWN_WRONG === '2370' ? it : it.skip;
type Vector = [number, number, number];

beforeEach(() => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  uiStore.analysisMode = '3d';
  uiStore.unitSystem = 'SI';
  uiStore.despieceBasis = 'global';
  modelStore.clear();
});

afterEach(() => {
  uiStore.despieceInspect = null;
  modelStore.clear();
  vi.unstubAllGlobals();
});

function cantilever(force: Vector, couple: Vector, nonlinear: boolean) {
  const fixed = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(0, 4, 0);
  const member = modelStore.addElement(fixed, tip, 'frame');
  modelStore.addSupport(fixed, 'fixed3d');
  modelStore.addNodalLoad3D(tip, ...force, ...couple);
  if (nonlinear) {
    const result = solvePDelta3D(modelStore.buildSolverInput3D(false, false)!);
    expect(result.converged).toBe(true);
    expect(result.isStable).toBe(true);
    resultsStore.setPDeltaResult3D(result);
  } else {
    const result = modelStore.solve3D(false, false, false);
    if (!result || typeof result === 'string') throw new Error(`Solve returned ${result}`);
    resultsStore.setResults3D(result);
  }
  resultsStore.diagramType = 'despiece';
  return { fixed, tip, member };
}

function readInspector(type: 'node' | 'member', id: number) {
  uiStore.despieceInspect = { type, id };
  const html = render(DespieceInspector).body.replace(/<!--[\s\S]*?-->/g, '');
  const labels = [...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].slice(1).map(([, text]) => text);
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map(([, row]) =>
    [...row!.matchAll(/<td[^>]*>([^<]+)<\/td>/g)].map(([, text]) => Number(text)));
  return { labels, rows };
}

const globalLabels = ['Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)'];

runReproducer('known wrong result: #2370 the spatial inspector shows torsion on a Y-aligned member under global My', () => {
  const { fixed, member } = cantilever([0, 0, 0], [0, -7, 0], false);
  for (const output of [readInspector('member', member), readInspector('node', fixed)]) {
    expect.soft(output.labels).toEqual(globalLabels);
    expect.soft(output.rows[0]).toEqual([0, 0, 0, 0, 7, 0]);
  }
});

runReproducer('known wrong result: #2370 every spatial end-action column balances its joint and member', () => {
  for (const nonlinear of [false, true]) {
    modelStore.clear();
    const force: Vector = [-3, nonlinear ? 0 : 5, 2], couple: Vector = [2, -3, 4];
    const { fixed, tip, member } = cantilever(force, couple, nonlinear);
    const { labels, rows } = readInspector('member', member);
    expect(labels).toEqual(globalLabels);
    const [atI, atJ] = rows;
    expect(atJ).toEqual([...force, ...couple]);
    expect(atI).toEqual([-force[0], -force[1] + 0, -force[2], -couple[0] - 4 * force[2], -couple[1], -couple[2] + 4 * force[0]]);
    expect(readInspector('node', fixed)).toEqual({ labels, rows: [atI] });
    expect(readInspector('node', tip)).toEqual({ labels, rows: [atJ] });

    uiStore.despieceBasis = 'local';
    const local = readInspector('member', member);
    expect(local.labels).toEqual(['N (kN)', 'Vy (kN)', 'Vz (kN)', 'My (kN·m)', 'Mz (kN·m)', 'T (kN·m)']);
    expect(Math.abs(local.rows[0]![5]!)).toBe(3);
    uiStore.despieceBasis = 'global';
  }
});
