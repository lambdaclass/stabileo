import { describe, expect, it } from 'vitest';
import { cases, tolerance, withinTolerance, compare, inputFor, runCases, viewerData, type Output } from '../cases';
import { editorSnapshot, editorURL } from '../editor';
import { prepareSharedSnapshot } from '../../../../lib/utils/share-snapshot';
import { buildSolverInput2D, type ModelData } from '../../../../lib/engine/solver-service';
import { initSolver, solveCorotational2D } from '../../../../lib/engine/wasm-solver';
import '../../../tools/register-i18n';
import { tAt } from '../../../../lib/i18n/store.svelte';
import { toolTranslations } from '../../../tools/translations';
import { strings } from '../i18n';
import LZString from 'lz-string';

const c = cases.find(c => c.parameter === 1 && c.kind === 'force')!;
function output(): Output {
  return { converged: true, loadFactor: 1, results: { displacements: Object.values(c.input.nodes).map(n => ({ nodeId: n.id, ux: -c.reference![0] * c.length, uz: -c.reference![1] * c.length, ry: 0 })) } };
}
describe('Mattiasson evidence', () => {
  it('uses independently checked elliptic-integral references and separates intermediate and regression cases', () => {
    expect(cases.filter(c => c.reference && c.kind === 'force').map(c => [c.parameter, c.reference])).toEqual([[1,[.056433236283377,.301720773799814]],[2,[.160641720825167,.493457480396712]],[5,[.387628360724430,.713791523611913]],[10,[.554995597753751,.810609024880296]]]);
    expect(cases.at(-1)!.input.loads[0].data.my).toBe(10000);
    expect(cases.at(-1)!.reference).toEqual([1 - Math.sin(1), Math.cos(1) - 1]);
  });
  it('requires both signed components, complete loading and finite shape', () => {
    expect(compare(c, output()).pass).toBe(true);
    const wrong = output(); wrong.results.displacements.at(-1)!.ux *= -1;
    expect(compare(c, wrong).pass).toBe(false);
    const wrongZ = output(); wrongZ.results.displacements.at(-1)!.uz *= -1;
    expect(compare(c, wrongZ).pass).toBe(false);
    // The engine's final load factor is n/n, exactly 1: anything else is an incomplete load path.
    expect(() => compare(c, { ...output(), loadFactor: 1 - 1e-7 })).toThrow('incomplete');
    const missing = output(); missing.results.displacements.pop();
    expect(() => compare(c, missing)).toThrow();
    const nonfinite = output(); nonfinite.results.displacements[0].uz = NaN;
    expect(() => compare(c, nonfinite)).toThrow();
    expect(() => compare(c, { ...output(), converged: false })).toThrow();
    expect(() => compare(c, { ...output(), loadFactor: .9 })).toThrow();
    expect(() => compare(c, { ...output(), loadFactor: NaN })).toThrow();
    expect(viewerData(c).displacement).toBeNull();
    expect(viewerData(c, compare(c, output())).cells).toHaveLength(32);
  });
  it('preserves geometry, units, clamp, force direction and solver policy', () => {
    expect(tolerance).toBe(.001);
    for (const c of cases) {
      expect(c.length).toBe(2);
      expect(c.tipNode).toBe(17);
      expect(Object.values(c.input.nodes).map(n => [n.id, n.x, n.z])).toEqual(Array.from({ length: 17 }, (_, i) => [i + 1, i / 8, 0]));
      expect(Object.values(c.input.elements)).toHaveLength(16);
      Object.values(c.input.elements).forEach((e, i) => { expect(e.nodeI).toBe(i + 1); expect(e.nodeJ).toBe(i + 2); expect(e.materialId).toBe(1); expect(e.sectionId).toBe(1); });
      expect(c.input.supports).toEqual({ '1': { id: 1, nodeId: 1, type: 'fixed' } });
      expect(c.input.materials['1'].e).toBe(200000);
      expect(c.input.sections['1'].iz).toBe(.0001);
      expect(c.input.sections['1'].a).toBe(c.kind === 'force' ? 1 : .01);
      const load = c.input.loads[0].data;
      expect(load.nodeId).toBe(17); expect(load.fx).toBe(0);
      expect(load.fz).toBe(c.kind === 'force' ? -5000 * c.parameter : 0);
      expect(load.my).toBe(c.kind === 'moment' ? 10000 : 0);
      if (c.kind === 'force') expect(c.solver).toEqual({ maxIter: 50, tolerance: 1e-8, nIncrements: 100 });
    }
  });
  it('uses a strict boundary and rejects nonfinite errors', () => {
    expect(withinTolerance(tolerance - Number.EPSILON)).toBe(true);
    expect(withinTolerance(tolerance)).toBe(false);
    expect(withinTolerance(tolerance + Number.EPSILON)).toBe(false);
    expect(withinTolerance(NaN)).toBe(false);
    for (const ratio of [.999, 1.001]) {
      const o = output(); o.results.displacements.at(-1)!.uz *= 1 + tolerance * ratio;
      expect(compare(c, o).pass).toBe(ratio < 1);
    }
  });
  it('has six complete, translated dictionaries and no unresolved claims', () => {
    expect(Object.keys(strings)).toEqual(['en', 'es', 'pt', 'de', 'fr', 'tr']);
    for (const [locale, dictionary] of Object.entries(strings)) {
      expect(Object.keys(dictionary)).toEqual(Object.keys(strings.en));
      expect(Object.values(dictionary).every(s => s.length > 0)).toBe(true);
      expect(JSON.stringify(dictionary)).not.toMatch(/provisional|not checked|pending|Questions for the authors/i);
      if (locale !== 'en') for (const key of ['lead', 'modelDescription', 'solverDescription', 'publishedWhy', 'momentDescription'] as const) expect(dictionary[key]).not.toBe(strings.en[key]);
    }
  });
  it('round trips the shared input through the editor without changing the solve', async () => {
    await initSolver();
    for (const c of [cases[1], cases.at(-1)!]) {
      const snap = editorSnapshot(c);
      expect(JSON.parse(LZString.decompressFromEncodedURIComponent(editorURL(c, '/app').split('#data=')[1]))).toEqual(snap);
      expect(prepareSharedSnapshot(snap)).not.toBeNull();
      expect(snap.includeSelfWeight).toBe(false);
      const model = { ...snap, connectors: new Map(), plates: new Map(), quads: new Map() } as unknown as ModelData;
      for (const key of ['nodes','materials','sections','elements','supports'] as const) (model as unknown as Record<string, unknown>)[key] = new Map(snap[key] as [number, unknown][]);
      const input = buildSolverInput2D(model, false)!;
      const args = [c.solver.maxIter, c.solver.tolerance, c.solver.nIncrements] as const;
      const direct = solveCorotational2D(inputFor(c), ...args);
      const shared = solveCorotational2D(input, ...args);
      expect(shared.converged).toBe(direct.converged);
      expect(shared.results.displacements).toEqual(direct.results.displacements);
    }
  });
  it('keeps failures visible and supports cancellation between solves', async () => {
    const rows = await runCases();
    expect(rows).toHaveLength(cases.length);
    let stop = false;
    expect(await runCases(() => { stop = true; }, () => stop)).toHaveLength(1);
    expect(rows.filter(r => r.pass).map(r => r.id)).toEqual(['force-1', 'force-2', 'force-5', 'force-10', 'moment-1']);
    expect(rows.find(r => r.id === 'force-1')!.u).toBeCloseTo(.056390264074, 9);
    expect(rows.every(r => r.failure ? r.pass === false && r.displacement === undefined : Number.isFinite(r.u) && Number.isFinite(r.v))).toBe(true);
    expect(await runCases(undefined, () => true)).toEqual([]);
  });
});

it('registers viewer strings for a fresh research visit in every locale', () => {
  for (const locale of Object.keys(strings)) {
    for (const key of Object.keys(toolTranslations.en).filter(key => key.startsWith('scalarViewer.'))) {
      expect(tAt(key, locale)).not.toBe(key);
    }
  }
});
