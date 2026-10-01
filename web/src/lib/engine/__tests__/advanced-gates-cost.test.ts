/**
 * The gates in front of the advanced analyses answer "would the static solve refuse this?"
 * without paying for a static solve each time: the influence line checks without solving, and
 * the space gate solves a given input once, however often a caller asks (PRO's modes-until-90 %
 * asks on every step).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const solves3D = { n: 0 }, solves2D = { n: 0 };
vi.mock('../wasm-solver', async (importOriginal) => {
  const real = await importOriginal<typeof import('../wasm-solver')>();
  return {
    ...real,
    solve3D: (...a: Parameters<typeof real.solve3D>) => { solves3D.n++; return real.solve3D(...a); },
    solve: (...a: Parameters<typeof real.solve>) => { solves2D.n++; return real.solve(...a); },
  };
});

import { modelStore } from '../../store/model.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { advancedRefusal3D, buildSolverInput3D } from '../solver-service';
import { computeInfluenceLine } from '../influence-service';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
}) as never;

describe('the cost of the advanced gates', () => {
  it('the space gate solves one input once, however many times it is asked', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(4, 0, 0);
    for (const [i, j] of [[a, b], [b, c], [c, d]]) modelStore.addElement(i!, j!, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
    const input = buildSolverInput3D(md(), false, false, { expandMemberOffsets: false })!;
    solves3D.n = 0;
    for (let k = 0; k < 4; k++) expect(advancedRefusal3D(input)).toBeNull();
    expect(solves3D.n).toBe(1);
  });

  it('an influence line checks the model without a static solve of it', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    solves2D.n = 0;
    const r = computeInfluenceLine(md(), 'Rz' as never, a);
    expect(typeof r).not.toBe('string');
    // A beam: the engine's sweep takes it whole, so any static solve would be the gate's.
    expect(solves2D.n).toBe(0);
  });
});
