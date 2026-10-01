/**
 * The results CSV writes what the solver gave, as the Excel and the tables do.
 *
 * It used to negate every moment, reactions and member ends alike, and round to four decimals:
 * the same result read with the opposite sign in the CSV and in the workbook.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { exportResultsCSV } from '../file';

beforeAll(async () => { await initSolver(); });

describe('the results CSV', () => {
  it('keeps the solver\'s sign and every digit', async () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3.3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 7.3, 2.1, -40, 0, 0, 0);
    const r = await modelStore.solve3DAsync(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    const lines = exportResultsCSV().split('\n');
    const reaction = r.reactions[0]!;
    const row = lines.find((l) => l.startsWith(`${reaction.nodeId},${reaction.fx},`))!;
    expect(row.split(',').slice(4).map(Number)).toEqual([reaction.mx, reaction.my, reaction.mz].map((v) => v + 0));
    const f = r.elementForces[0]!;
    const forces = lines.find((l) => l.startsWith(`${f.elementId},${f.length},`))!.split(',').map(Number);
    // `+ 0` turns −0, which a CSV writes as 0, into 0.
    expect(forces.slice(8)).toEqual([f.mxStart, f.mxEnd, f.myStart, f.myEnd, f.mzStart, f.mzEnd].map((v) => v + 0));
    expect(Math.abs(f.myStart)).toBeGreaterThan(1);
  });
});
