/**
 * A span hinge under a distributed load moves with the peak of the moment, so at no step does any
 * section pass Mp, and the history still ends at the certified collapse factor.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import * as peaks from '../plastic/span-peaks';
import * as wasm from '../wasm-solver';
import { memberPlasticMoments, runPlasticCollapse } from '../../actions/plastic';
import { initSolver } from '../wasm-solver';
import { computeDiagramValueAt } from '../diagrams';
import { hingePlaceAt } from '../plastic/hinge-place';

beforeAll(async () => { await initSolver(); });

const SAMPLES = 20_000;

async function collapse(example: string) {
  historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
  await modelStore.loadExample(example);
  const run = runPlasticCollapse()!;
  const members = memberPlasticMoments(modelStore.buildSolverInput(false)!, run.mps);
  const mp = (id: number) => members.get(id)!;
  const peaks = run.result.steps.map(step => {
    expect(step.results.elementForces.map(ef => ef.elementId).sort()).toEqual([...members.keys()].sort());
    return Math.max(...step.results.elementForces.map(ef => {
      let worst = 0;
      for (let i = 0; i <= SAMPLES; i++) worst = Math.max(worst, Math.abs(computeDiagramValueAt('moment', i / SAMPLES, ef)));
      return worst / mp(ef.elementId);
    }));
  });
  return { r: run.result, mp, peaks };
}

describe('the moment stays within Mp at every step of the hinge history', () => {
  it('"Portal Frame": the beam hinge forms where the moment first peaks and ends at midspan, at 1925/27', async () => {
    const { r, peaks } = await collapse('portal-frame');
    expect(peaks).toHaveLength(4);
    for (const p of peaks) expect(p).toBeLessThanOrEqual(1 + 1e-6);
    expect(r.isMechanism && !r.unresolved && !r.limit && !r.withheld).toBe(true);
    expect(r.collapseFactor).toBeCloseTo(1925 / 27, 9);
    expect(Math.abs(r.steps.at(-1)!.loadFactor / r.collapseFactor - 1)).toBeLessThan(1e-9);
    expect(r.hinges.length).toBeLessThanOrEqual(r.degree + 1);
    expect(r.hinges.every((h) => h.unloadedAt === undefined)).toBe(true);
    const beam = r.hinges.find((h) => h.elementId === 2)!;
    expect(hingePlaceAt(beam, beam.step).x).toBeLessThan(3 - 0.05);
    expect(beam.x).toBeCloseTo(3, 9);
  });

  it('"Spring Support": the span hinge moves from the elastic peak to (√2 − 1)L from the pin, at (6 + 4√2)Mp/(qL²)', async () => {
    const { r, mp, peaks } = await collapse('spring-support');
    for (const p of peaks) expect(p).toBeLessThanOrEqual(1 + 1e-6);
    expect(r.isMechanism && !r.unresolved && !r.limit && !r.withheld).toBe(true);
    const L = 3, q = 20;
    expect(r.collapseFactor).toBeCloseTo(((6 + 4 * Math.SQRT2) * mp(1)) / (q * L * L), 6);
    expect(Math.abs(r.steps.at(-1)!.loadFactor / r.collapseFactor - 1)).toBeLessThan(1e-9);
    expect(r.hinges.length).toBeLessThanOrEqual(r.degree + 1);
    expect(r.hinges.every((h) => h.unloadedAt === undefined)).toBe(true);
    const span = r.hinges.find((h) => h.elementId === 1 && h.x > 1e-9 && h.x < L - 1e-9)!;
    expect(hingePlaceAt(span, span.step).x).toBeGreaterThan(1.8);
    expect(span.x).toBeCloseTo((Math.SQRT2 - 1) * L, 6);
    expect(r.steps.at(-1)!.trace.moved?.map((m) => m.to)).toEqual([expect.closeTo((Math.SQRT2 - 1) * L, 6)]);
  });
});

describe('#758 — history evidence', () => {
  it('keeps the event at its formation coordinate after the portal hinge moves', async () => {
    const { r } = await collapse('portal-frame');
    const moved = r.hinges.find(h => h.track?.length)!;
    const formation = r.steps[moved.step].hingesFormed.find(h => h.elementId === moved.elementId)!;
    expect(formation.x).toBeCloseTo(moved.track![0].x, 9);
    expect(formation.position).toBeCloseTo(moved.track![0].position, 9);
    expect(formation.x).not.toBe(moved.x);
  });

  it('withholds a history whose hinge location never settles', async () => {
    historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
    await modelStore.loadExample('portal-frame');
    const original = peaks.interiorMinimum;
    let moves = 0;
    const search = vi.spyOn(peaks, 'interiorMinimum').mockImplementation((...args) => {
      const found = original(...args);
      if (!found || found.value >= 0) return found;
      const t = ++moves % 2 ? 0.48 : 0.49;
      return { t, value: args[0](t) };
    });
    try {
      const result = runPlasticCollapse()!.result;
      expect(result.historyUnavailable).toBe(true);
      expect(result.withheld).toBeFalsy();
      expect(result.collapseFactor).toBeCloseTo(1925 / 27, 9);
      expect(result.hinges).toEqual([]);
      expect(result.steps).toEqual([]);
      expect(moves).toBeGreaterThan(1);
    } finally { search.mockRestore(); }
  });

  it.each([[0.9995, true], [1.0005, true], [1, false]] as const)('qualifies the history when its endpoint differs from the certificate by a factor of %s', async (ratio, approximate) => {
    const original = wasm.plasticLimit2D;
    const limit = vi.spyOn(wasm, 'plasticLimit2D').mockImplementation((...args) => {
      const result = original(...args);
      return { ...result, lambda: result.lambda / ratio };
    });
    try {
      const { r } = await collapse('portal-frame');
      expect(Boolean(r.limit)).toBe(approximate);
    } finally { limit.mockRestore(); }
  });
});
