import { describe, expect, it } from 'vitest';
import { cases, compare, viewerData } from '../cases';
import { editorSnapshot, editorURL } from '../editor';
import { prepareSharedSnapshot } from '../../../../lib/utils/share-snapshot';
import { buildSolverInput2D, buildSolverInput3D, type ModelData } from '../../../../lib/engine/solver-service';
import { initSolver, solve, solve3D } from '../../../../lib/engine/wasm-solver';
import LZString from 'lz-string';

describe('engine benchmark evidence', () => {
  const c = cases[0];
  it('does not hide missing or nonfinite measurements', () => {
    expect(() => compare(c, [])).toThrow();
    expect(() => compare(c, [{ nodeId: 2, uz: NaN }])).toThrow();
  });
  it('computes accuracy independently of native regression bounds', () => {
    expect(compare(c, [{ nodeId: 2, uz: -c.reference }]).pass).toBe(true);
    expect(compare(c, [{ nodeId: 2, uz: c.reference * 0.5 }]).pass).toBe(false);
    expect(compare(c, [{ nodeId: 2, uz: c.reference * 1.03 }]).error).toBeCloseTo(.03);
  });
  it('measures the mean tip displacement, not the best node', () => {
    const shell = cases[6];
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
      expect(snapshot.materials[0][1].e).toBe( Object.values(c.input.materials)[0].e);
      expect(snapshot.includeSelfWeight).toBe(false);
      expect(snapshot.loads).toHaveLength(c.input.loads.length);
    }
  });
  it('editor model solves to the same measurements through the product input builders', async () => {
    await initSolver();
    const { runCases } = await import('../cases');
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
    }
  });
  it('uses actual mesh connectivity in the shared viewer', () => {
    expect(viewerData(c).cells).toEqual([0, 1]);
    expect(viewerData(cases[6]).cells).toHaveLength(24);
    expect(viewerData(c).displacement).toBeNull();
  });
});


it('translates all benchmark text with matching numbers in each research locale', async () => {
  const { strings, caseLabel } = await import('../i18n');
  const numbers = (s: string) => s.match(/\d+(?:\.\d+)*/g) ?? [];
  for (const locale of ['es', 'pt'] as const) {
    expect(Object.keys(strings[locale]).sort()).toEqual(Object.keys(strings.en).sort());
    for (const key of Object.keys(strings.en) as (keyof typeof strings.en)[]) {
      expect(strings[locale][key].length).toBeGreaterThan(0);
      expect(numbers(strings[locale][key]), `${locale}.${key}`).toEqual(numbers(strings.en[key]));
    }
    for (const c of cases) expect(caseLabel(c.id, strings[locale])).not.toContain('undefined');
  }
  expect(strings.en.title).toContain('first version');
});
