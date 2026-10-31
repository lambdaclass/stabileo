import { afterEach, describe, expect, it } from 'vitest';
import data from '../../../../../../engine/tests/benchmarks/macneal_harder.json';
import { cases, compare, counts, nativeOnly, runCases, tolerance, verdict, viewerData, type Case, type Result } from '../cases';
import { editorSnapshot, editorURL } from '../editor';
import { caseLabel, nativeReason, pageLocale, strings } from '../i18n';
import { prepareSharedSnapshot } from '../../../../lib/utils/share-snapshot';
import { buildSolverInput2D, buildSolverInput3D, type ModelData } from '../../../../lib/engine/solver-service';
import { initSolver, solve, solve3D } from '../../../../lib/engine/wasm-solver';
import { scalarViewerTranslations } from '../../../viewport/scalar-viewer-i18n';
import { t } from '../../../../lib/i18n';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';
import LZString from 'lz-string';

const byId = (id: string) => cases.find(c => c.id === id)!;
const tip = (c: Case, v: number) => c.measurement.nodes.map(nodeId => ({ nodeId, [c.measurement.component]: v }));
const originalLocale = publicI18n.locale;
afterEach(() => setLocale(originalLocale));

describe('engine benchmark evidence', () => {
  const c = cases[0];
  it('does not hide missing or nonfinite measurements', () => {
    expect(() => compare(c, [])).toThrow();
    expect(() => compare(c, [{ nodeId: 2, uz: NaN }])).toThrow();
  });
  it('computes accuracy independently of native regression bounds', () => {
    expect(compare(c, [{ nodeId: 2, uz: c.reference }]).pass).toBe(true);
    expect(compare(c, [{ nodeId: 2, uz: c.reference * 0.5 }]).pass).toBe(false);
    expect(compare(c, [{ nodeId: 2, uz: c.reference * 1.03 }]).error).toBeCloseTo(.03);
  });
  it.each(['frame-shear-1-uz', 'frame-moment-4-uz', 'frame-moment-4-ry', 'mitc4-regular-out', 'mitc4-regular-in'])('fails %s when the response is reversed', id => {
    const k = byId(id);
    expect(compare(k, tip(k, k.reference)).pass).toBe(true);
    const reversed = compare(k, tip(k, -k.reference));
    expect(reversed.pass).toBe(false);
    expect(reversed.error).toBeCloseTo(2);
  });
  it('stores signed references along the load: downward force, counter-clockwise moment, positive shell loads', () => {
    expect(byId('frame-shear-1-uz').reference).toBe(-0.0036);
    expect(byId('frame-shear-1-uz').input.loads[0].data.fz).toBe(-1);
    expect(byId('frame-moment-4-uz').reference).toBe(0.009);
    expect(byId('frame-moment-4-ry').reference).toBe(0.003);
    expect(byId('frame-moment-4-ry').input.loads[0].data.my).toBe(10);
    for (const k of cases.filter(k => k.element === 'MITC4')) {
      const load = k.input.loads[0].data as Record<string, number>;
      expect(load[k.measurement.component === 'uz' ? 'fz' : 'fy']).toBeGreaterThan(0);
      expect(k.reference).toBeGreaterThan(0);
    }
  });
  it('applies one strict 2% limit, the one the headline shows', () => {
    expect(tolerance).toBe(0.02);
    for (const k of cases) expect('tolerance' in k).toBe(false);
    const k = byId('frame-shear-1-uz');
    expect(compare(k, tip(k, k.reference * (1 + tolerance))).pass).toBe(false);
    expect(compare(k, tip(k, k.reference * (1 + tolerance * 0.999))).pass).toBe(true);
  });
  it('marks a verdict that changes within the printed reference’s rounding as marginal', () => {
    const out = byId('mitc4-regular-out');
    expect(out.referenceRounding).toBe(5e-5);
    const atBoundary = compare(out, tip(out, 0.42348564363974367));
    expect(atBoundary.pass).toBe(true);
    expect(atBoundary.marginal).toBe(true);
    const clear = compare(out, tip(out, out.reference * 0.99));
    expect(clear.marginal).toBe(false);
    const k = byId('frame-shear-1-uz');
    expect(k.referenceRounding).toBe(0);
    expect(compare(k, tip(k, k.reference * 1.0199)).marginal).toBe(false);
  });
  it('separates documented limitations, unexpected mismatches and engine errors', () => {
    const distorted = byId('mitc4-trapezoidal-in');
    const fail = (k: Case): Result => ({ ...compare(k, tip(k, k.reference * 0.5)) });
    expect(verdict(distorted, fail(distorted))).toBe('documented');
    expect(verdict(byId('mitc4-regular-in'), fail(byId('mitc4-regular-in')))).toBe('mismatch');
    expect(verdict(byId('frame-shear-1-uz'), fail(byId('frame-shear-1-uz')))).toBe('mismatch');
    expect(verdict(distorted, { id: distorted.id, value: null, error: null, pass: false, failure: 'Error: refused' })).toBe('error');
    for (const k of cases) expect('knownIssue' in k).toBe(!k.expectedPass);
  });
  it('measures the mean tip displacement, not the best node', () => {
    const shell = byId('mitc4-regular-out');
    const r = compare(shell, [{ nodeId: 13, uz: shell.reference }, { nodeId: 14, uz: 0 }]);
    expect(r.value).toBe(shell.reference / 2);
    expect(r.pass).toBe(false);
  });
  it('shares the selected geometry, material, supports and loads without enabling self weight', () => {
    for (const c of cases) {
      const url = editorURL(c, 'https://stabileo.com/app');
      const snapshot = JSON.parse(LZString.decompressFromEncodedURIComponent(url.split('#data=')[1]));
      expect(prepareSharedSnapshot(snapshot)).not.toBeNull();
      expect(snapshot).toEqual(editorSnapshot(c));
      expect(snapshot.nodes).toHaveLength(Object.keys(c.input.nodes).length);
      expect(snapshot.materials[0][1].e).toBe(Object.values(c.input.materials)[0].e);
      expect(snapshot.includeSelfWeight).toBe(false);
      expect(snapshot.loads).toHaveLength(c.input.loads.length);
    }
  });
  it('names the editor model in the page language', () => {
    const snapshot = editorSnapshot(byId('mitc4-regular-in'), strings.es);
    expect(snapshot.name).toBe('MacNeal–Harder: MITC4 · regular · en el plano');
    expect((snapshot.materials[0][1] as { name: string }).name).toBe('Material del ensayo');
    expect(snapshot.loadCases[0].name).toBe('Ensayo');
  });
  it('runs every case live with the pinned outcome, sign and per-category counts', async () => {
    const rows = await runCases();
    for (const c of cases) {
      const r = rows.find(r => r.id === c.id)!;
      expect(r.failure).toBeUndefined();
      expect(r.pass).toBe(c.expectedPass);
      expect(Math.sign(r.value!)).toBe(Math.sign(c.reference));
      const bounds = c.nativeBounds as { pinnedValue?: number; relativeTolerance?: number; relativeErrorLessThan?: number };
      if (bounds.pinnedValue !== undefined) expect(Math.abs(r.value! / bounds.pinnedValue - 1)).toBeLessThan(bounds.relativeTolerance!);
      else expect(r.error!).toBeLessThan(bounds.relativeErrorLessThan!);
    }
    expect(rows.filter(r => r.marginal).map(r => r.id)).toEqual(['mitc4-regular-out']);
    expect((100 * rows.find(r => r.id === 'mitc4-regular-out')!.error!).toFixed(2)).toBe('1.99');
    expect(counts(rows)).toEqual({ shell: { passed: 2, total: 6 }, frame: { passed: 6, total: 6 } });
    expect(cases.filter(c => !c.expectedPass).map(c => c.id)).toEqual(['mitc4-trapezoidal-out', 'mitc4-trapezoidal-in', 'mitc4-parallelogram-out', 'mitc4-parallelogram-in']);
  });
  it('editor model solves to the same signed measurements through the product input builders', async () => {
    await initSolver();
    const directResults = await runCases();
    for (const c of cases) {
      const snap = editorSnapshot(c);
      const model = { ...snap, connectors: new Map(), plates: new Map() } as unknown as ModelData;
      for (const key of ['nodes', 'materials', 'sections', 'elements', 'supports', 'quads'] as const) {
        (model as unknown as Record<string, unknown>)[key] = new Map(snap[key] as [number, unknown][]);
      }
      const input = c.dimension === 2 ? buildSolverInput2D(model, false) : buildSolverInput3D(model, false);
      expect(input).not.toBeNull();
      const result = c.dimension === 2 ? solve(input as Parameters<typeof solve>[0]) : solve3D(input as Parameters<typeof solve3D>[0]);
      const measured = compare(c, result.displacements as unknown as Record<string, number>[]);
      const direct = directResults.find(r => r.id === c.id)!;
      expect(measured.value).toBeCloseTo(direct.value!, 10);
      expect(Math.sign(measured.value!)).toBe(Math.sign(c.reference));
    }
  });
  it('uses actual mesh connectivity in the shared viewer and draws the mesh before results arrive', () => {
    expect(viewerData(c).cells).toEqual([0, 1]);
    expect(viewerData(byId('mitc4-regular-out')).cells).toHaveLength(24);
    expect(viewerData(c).displacement).toBeNull();
    expect(viewerData(c).displayMode).toBe('geometry');
    const shell = byId('mitc4-regular-out');
    expect(viewerData(shell, { id: shell.id, value: null, error: null, pass: false, failure: 'x' }).displayMode).toBe('geometry');
    const r = compare(shell, Object.values(shell.input.nodes).map(n => ({ nodeId: n.id, ux: 0, uy: 0, uz: shell.reference })));
    expect(viewerData(shell, r).displayMode).toBe('field');
  });
  it('fixes the labels the review found', () => {
    expect(caseLabel('frame-shear-1-uz', strings.en)).toBe('Frame adaptation · tip force · 1 element · uz');
    expect(caseLabel('mitc4-trapezoidal-in', strings.en)).toBe('MITC4 · trapezoidal · in-plane');
    expect(data.cases.map(c => c.label).join(' ')).not.toMatch(/in-of-plane|1 elements/);
    expect(data.nativeOnly.map(c => c.label).join(' ')).not.toMatch(/in-of-plane|1 elements/);
  });
});

describe('page language coverage', () => {
  const locales = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
  it.each(locales)('%s has every key, non-empty, with case labels and native reasons', locale => {
    const s = strings[locale];
    expect(Object.keys(s).sort()).toEqual(Object.keys(strings.en).sort());
    for (const [k, v] of Object.entries(s)) expect(v.trim(), k).not.toBe('');
    for (const c of [...cases, ...nativeOnly]) expect(caseLabel(c.id, s)).not.toBe('');
    for (const c of nativeOnly) expect(nativeReason(c.id, s)).not.toBe('');
    expect(pageLocale(locale)).toBe(locale);
  });
  it.each(locales.filter(l => l !== 'en'))('%s translates the article instead of copying English', locale => {
    for (const key of ['title', 'lead', 'publishedWhy', 'testedDescription', 'modelDescription', 'accuracyDescription', 'referenceProvenance', 'shells', 'frames', 'documented', 'mismatch', 'caption'] as const) {
      expect(strings[locale][key], key).not.toBe(strings.en[key]);
    }
  });
  it('falls back to English for other locales', () => {
    expect(pageLocale('ja')).toBe('en');
  });
  it.each(locales)('registers the shared viewer strings for %s on research pages', locale => {
    expect(Object.keys(scalarViewerTranslations[locale]).sort()).toEqual(Object.keys(scalarViewerTranslations.en).sort());
    expect(scalarViewerTranslations[locale]['scalarViewer.keyboard']).toBeTruthy();
    setLocale(locale);
    for (const key of Object.keys(scalarViewerTranslations.en)) expect(t(key)).not.toBe(key);
  });
});
