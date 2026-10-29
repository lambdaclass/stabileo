import { describe, expect, it, vi } from 'vitest';
import { benchmark, euler, fit, inputFor, readRow, viewerData, editorURL, compute } from '../benchmark';
import { translations } from '../i18n';
import LZString from 'lz-string';
const engine = vi.hoisted(() => ({ initSolver: vi.fn(), solveBuckling: vi.fn(), solveCorotational2D: vi.fn() }));
vi.mock('../../../../lib/engine/wasm-solver', () => engine);
const displacements = Object.values(benchmark.input.nodes).map(n => ({ nodeId: n.id, ux: 0, uz: .001, ry: 0 }));

describe('Southwell', () => {
  it('recovers the critical load and imperfection from the exact imperfect-column relation', () => {
    const rows = benchmark.loadFractions.map(f => ({ load: f * euler, delta: benchmark.imperfection * f / (1 - f) }));
    const result = fit(rows);
    expect(result.estimated).toBeCloseTo(euler, 10);
    expect(result.intercept * result.estimated).toBeCloseTo(benchmark.imperfection, 12);
    expect(euler).toBeCloseTo(219.324542246, 7);
  });
  it('refuses degenerate fits and incomplete solver results', () => {
    expect(() => fit([{ load: 1, delta: 1 }, { load: 2, delta: 1 }])).toThrow();
    expect(() => fit([{ load: 0, delta: 1 }, { load: 2, delta: 2 }])).toThrow();
    expect(() => readRow(1, { converged: false, loadFactor: 1, results: { displacements } })).toThrow();
    expect(() => readRow(1, { converged: true, loadFactor: .9, results: { displacements } })).toThrow();
    expect(() => readRow(1, { converged: true, loadFactor: 1, results: { displacements: [] } })).toThrow();
  });
  it('keeps the reference geometry, load sign, and viewer displacement consistent', () => {
    const input = inputFor(100);
    expect(input.nodes.get(11)?.z).toBe(benchmark.imperfection);
    expect(inputFor(1, true).nodes.get(11)?.z).toBe(0);
    expect(input.loads[0]).toMatchObject({ data: { fx: -100 } });
    expect(benchmark.input.loads[0].data.fx).toBe(-1);
    const row = readRow(100, { converged: true, loadFactor: 1, results: { displacements } });
    expect(viewerData(row).displacement[21]).toBe(.001);
    const encoded = editorURL(100, '/app').split('#data=')[1];
    const model = JSON.parse(LZString.decompressFromEncodedURIComponent(encoded));
    expect(model.nodes[10][1].y).toBe(benchmark.imperfection);
    expect(model.supports[1][1].type).toBe('rollerX');
    expect(model.loads[0].data.fx).toBe(-100);
  });
  it('uses both production wrappers and permits cancellation between loads', async () => {
    engine.solveBuckling.mockReturnValue({ modes: [{ loadFactor: euler }] });
    engine.solveCorotational2D.mockImplementation((input) => {
      const load = -input.loads[0].data.fx;
      const delta = benchmark.imperfection * load / (euler - load);
      return { converged: true, loadFactor: 1, results: { displacements: displacements.map(d => ({ ...d, uz: delta })) } };
    });
    const result = await compute(() => {}, () => false);
    expect(result?.estimated).toBeCloseTo(euler, 8);
    expect(engine.solveCorotational2D).toHaveBeenCalledTimes(7);
    let cancelled = false;
    expect(await compute(() => { cancelled = true; }, () => cancelled)).toBeNull();
    expect(engine.solveCorotational2D).toHaveBeenCalledTimes(8);
  });
  it('has complete experiment translations', () => {
    for (const locale of [translations.es, translations.pt]) {
      expect(Object.keys(locale).sort()).toEqual(Object.keys(translations.en).sort());
      expect(locale.limitations).toHaveLength(3);
    }
  });
});
