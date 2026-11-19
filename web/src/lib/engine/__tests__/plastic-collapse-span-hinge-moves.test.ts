/**
 * A span hinge under a distributed load moves with the peak of the moment, so at no step does any
 * section pass Mp, and the history still ends at the certified collapse factor.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { runPlasticCollapse } from '../../actions/plastic';
import { initSolver } from '../wasm-solver';
import { computeDiagramValueAt } from '../diagrams';
import { hingePlaceAt } from '../plastic/hinge-place';

beforeAll(async () => { await initSolver(); });

const SAMPLES = 20_000;

async function collapse(example: string) {
  historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
  await modelStore.loadExample(example);
  const run = runPlasticCollapse()!;
  const mpOfSection = new Map(run.mps.map((m) => [m.sectionId, m.mp]));
  const mp = (elementId: number) => mpOfSection.get(modelStore.elements.get(elementId)!.sectionId)!;
  const peaks = run.result.steps.map((s) => Math.max(...s.results.elementForces.map((ef) => {
    let worst = 0;
    for (let i = 0; i <= SAMPLES; i++) worst = Math.max(worst, Math.abs(computeDiagramValueAt('moment', i / SAMPLES, ef)));
    return worst / mp(ef.elementId);
  })));
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
