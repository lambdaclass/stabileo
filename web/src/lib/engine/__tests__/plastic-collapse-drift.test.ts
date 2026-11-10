import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { runLegacyPlasticCollapse } from './legacy-plastic-helper';
import { solveLimit } from '../plastic/solve-limit';
import { initSolver } from '../wasm-solver';
import { generate, type Family } from './helpers/random-models-2d';
import type { SolverInput, SolverSupport } from '../types';

beforeAll(async () => { await initSolver(); });

function verticalSpringAsRoller(input: SolverInput): SolverInput {
  const supports = new Map<number, SolverSupport>();
  for (const [k, s] of input.supports) {
    const verticalOnly = s.type === 'spring' && (s.ky ?? 0) > 0 && !(s.kx ?? 0) && !(s.kz ?? 0);
    supports.set(k, verticalOnly ? { id: s.id, nodeId: s.nodeId, type: 'rollerX' } : s);
  }
  return { ...input, supports };
}

function collapseAndLimit() {
  const run = runLegacyPlasticCollapse()!;
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight)!;
  const mpOf = new Map(run.mps.map((m) => [m.sectionId, m.mp]));
  const limit = solveLimit(verticalSpringAsRoller(input), (id) => mpOf.get(input.elements.get(id)!.sectionId) ?? Infinity)!;
  return { r: run.result, limit };
}

describe('a hinge under a distributed load sits at the peak of the collapse state', () => {
  it('the spring-support example ends at the rigid-plastic collapse load, with one span hinge at √2 − 1', async () => {
    uiStore.analysisMode = '2d';
    historyStore.clear();
    await modelStore.loadExample('spring-support');
    const { r, limit } = collapseAndLimit();
    expect(r.unresolved).toBeUndefined();
    expect(r.isMechanism).toBe(true);
    expect(r.hinges.every((h) => h.unloadedAt === undefined)).toBe(true);
    expect(r.hinges.length).toBeLessThanOrEqual(r.degree + 1);
    expect(limit.positions.get(1)).toBeCloseTo(Math.SQRT2 - 1, 2);
    const open = r.hinges.filter((h) => h.unloadedAt === undefined && h.elementId === 1 && (h.position ?? 0) > 0 && (h.position ?? 1) < 1);
    expect(open.map((h) => h.position)).toEqual([expect.closeTo(Math.SQRT2 - 1, 2)]);
    expect(Math.abs(r.collapseFactor - limit.best.lambda)).toBeLessThan(1e-5 * limit.best.lambda);
  });

  it.each([['beam', 22], ['mixed', 29], ['arch', 46]] as Array<[Family, number]>)('%s#%i resolves, and agrees with the limit analysis to the station spacing', (family, seed) => {
    uiStore.analysisMode = '2d';
    historyStore.clear();
    generate(family, seed);
    const { r, limit } = collapseAndLimit();
    expect(r.unresolved).toBeUndefined();
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor).toBeLessThanOrEqual(limit.best.lambda * (1 + 1e-5));
    expect(r.collapseFactor).toBeGreaterThan(limit.best.lambda * (1 - 2e-3));
  });
});
