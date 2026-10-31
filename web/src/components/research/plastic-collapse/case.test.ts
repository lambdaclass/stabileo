import { afterEach, describe, expect, it, vi } from 'vitest';
import { checks, compare, cornerMoment, cumulativeStep, events, fixed, hingeNode, mechanisms, portal, residual, run, viewer, type Result } from './case';
import { fill, plasticLocale, ps, strings } from './i18n';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';
import replayFile from '../../../../../research/benchmarks/plastic-collapse/results/stabileo_results.json';
vi.mock('../../../lib/engine/wasm-solver', () => ({ initSolver: vi.fn(), solvePlastic3D: vi.fn() }));
import { initSolver, solvePlastic3D } from '../../../lib/engine/wasm-solver';

const replay = replayFile.result as Result;
const original = publicI18n.locale;
afterEach(() => setLocale(original));

describe('portal mechanism benchmark', () => {
  it('derives all three bounds from the shared case', () => {
    expect(mechanisms()).toEqual(portal.reference);
    expect(Math.min(...Object.values(mechanisms()))).toBe(portal.reference.combined);
    expect(mechanisms().combined).toBe(600 / 7);
  });
  it('solves the model the formulas describe', () => {
    const { nodes, elements, supports, loads } = portal.input.solver;
    const at = (id: number) => Object.values(nodes).find(n => n.id === id)!;
    expect(Object.values(nodes).map(n => [n.id, n.x, n.y, n.z])).toEqual([
      [1, 0, 0, 0], [2, 0, 0, portal.height], [3, portal.span, 0, portal.height], [4, portal.span, 0, 0], [5, portal.span / 2, 0, portal.height],
    ]);
    expect(Object.values(elements).map(e => [e.id, e.nodeI, e.nodeJ])).toEqual([[1, 1, 2], [2, 2, 5], [3, 4, 3], [4, 5, 3]]);
    expect(Object.values(elements).every(e => e.sectionId === 1 && !e.releaseMyStart && !e.releaseMyEnd && !e.releaseMzStart && !e.releaseMzEnd)).toBe(true);
    expect(Object.values(supports).map(s => [s.nodeId, s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz])).toEqual([[1, true, true, true, true, true, true], [4, true, true, true, true, true, true]]);
    expect(loads.map(l => l.data)).toEqual([
      { nodeId: 2, fx: portal.horizontal, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
      { nodeId: 5, fx: 0, fy: 0, fz: -portal.vertical, mx: 0, my: 0, mz: 0 },
    ]);
    expect(at(5).x).toBe(portal.span / 2);
    expect(portal.input.mpOverrides).toEqual({ 1: [portal.mp, portal.mp] });
    expect(portal.leftCornerMoment).toBeCloseTo(300 / 7, 12);
    expect(cornerMoment(mechanisms().combined)).toBeCloseTo(portal.leftCornerMoment, 12);
  });
  it('shows signed differences from all bounds, not three collapse predictions', () => {
    const rows = compare({ collapseFactor: 600 / 7, isMechanism: true, steps: [{ loadFactor: 1, results: { displacements: [] } }] });
    expect(rows[2].difference).toBe(0);
    expect(rows[0].difference).toBeCloseTo(-100 / 7, 10);
    expect(() => compare({ collapseFactor: NaN, isMechanism: false, steps: [] })).toThrow();
  });
  it('uses the production 3D WASM wrapper and propagates refusals', async () => {
    vi.mocked(solvePlastic3D).mockImplementation(() => { throw new Error('refused'); });
    await expect(run()).rejects.toThrow('refused');
    expect(initSolver).toHaveBeenCalled();
    expect(solvePlastic3D).toHaveBeenCalledWith(portal.input);
  });
  it('maps the XZ frame to the shared viewer without losing the split beam', () => {
    const data = viewer();
    expect(data.xy).toEqual([0, 0, 0, 3, 4, 3, 4, 0, 2, 3]);
    expect(data.cells).toEqual([0, 1, 1, 4, 3, 2, 4, 2]);
    const frame = viewer({ loadFactor: 1, results: { displacements: [1, 2, 3, 4, 5].map(nodeId => ({ nodeId, ux: nodeId, uz: -10 * nodeId })) } });
    expect(frame.displacement).toEqual([1, -10, 2, -20, 3, -30, 4, -40, 5, -50]);
    expect(() => viewer({ loadFactor: 1, results: { displacements: [] } })).toThrow('Missing');
  });
  it('accumulates event displacement increments', () => {
    const steps = [1, 2].map(n => ({ loadFactor: n, results: { displacements: [{ nodeId: 1, ux: n, uz: -n }] } }));
    expect(cumulativeStep(steps, 1)?.results.displacements).toEqual([{ nodeId: 1, ux: 3, uz: -3 }]);
    expect(cumulativeStep([], 0)).toBeUndefined();
  });
});

describe('the recorded replay', () => {
  it('matches the native expectations event by event', () => {
    expect(replay.steps).toHaveLength(portal.events.length);
    replay.steps.forEach((step, i) => {
      const expected = portal.events[i];
      expect(step.hingesFormed).toHaveLength(1);
      const [hinge] = step.hingesFormed!;
      expect([hinge.elementId, hinge.end, Math.sign(hinge.momentY)]).toEqual([expected.elementId, expected.end, expected.momentSign]);
      expect(Math.abs(Math.abs(hinge.momentY) - portal.mp)).toBeLessThan(portal.yieldTolerance * portal.mp);
      expect(Math.abs(step.loadFactor - expected.loadFactor)).toBeLessThan(portal.tolerance);
    });
    expect(Math.abs(replay.collapseFactor - portal.reference.combined)).toBeLessThan(portal.tolerance);
  });
  it('locates the hinges of the combined mechanism, with the left roof corner cancelled', () => {
    expect(events(replay).map(e => e.hinges.map(h => [h.place, Math.sign(h.momentY)]))).toEqual([
      [['rightCorner', -1]], [['midspan', 1]], [['rightBase', 1]], [['leftBase', 1]],
    ]);
    expect(hingeNode({ elementId: 1, end: 'end' })).toBe(2);
    expect(() => hingeNode({ elementId: 9, end: 'start' })).toThrow();
  });
  it('passes every displayed check and balances the loads', () => {
    expect(checks(replay).map(c => [c.id, c.passed])).toEqual([
      ['collapse', true], ['mechanism', true], ['hinges', true], ['yield', true], ['equilibrium', true], ['corner', true],
    ]);
    const r = residual(replay);
    for (const v of [r.fx, r.fz, r.my]) expect(Math.abs(v)).toBeLessThan(portal.equilibriumTolerance);
  });
  it('fails the checks a wrong result would break', () => {
    const shifted = { ...replay, collapseFactor: replay.collapseFactor + 1e-3 };
    expect(checks(shifted).filter(c => !c.passed).map(c => c.id)).toEqual(['collapse', 'equilibrium', 'corner']);
    const wrongHinge = { ...replay, steps: replay.steps.map((s, i) => (i === 3 ? { ...s, hingesFormed: [{ ...s.hingesFormed![0], elementId: 2, end: 'start' }] } : s)) };
    expect(checks(wrongHinge).find(c => c.id === 'hinges')!.passed).toBe(false);
    const overYield = { ...replay, steps: replay.steps.map((s, i) => (i === 0 ? { ...s, results: { ...s.results, elementForces: s.results.elementForces!.map(f => (f.elementId === 2 ? { ...f, myStart: f.myStart - 200 } : f)) } } : s)) };
    expect(checks(overYield).find(c => c.id === 'yield')!.passed).toBe(false);
    expect(checks({ ...replay, warnings: ['x'] }).find(c => c.id === 'mechanism')!.passed).toBe(false);
  });
});

describe('page text', () => {
  it('formats a rounded zero without a sign', () => {
    expect(fixed(-1.41824330057716e-11, 'en')).toBe('0.000000');
    expect(fixed(-14.285714285728, 'en')).toBe('-14.285714');
    expect(fixed(85.71428571427153, 'es')).toBe('85,714286');
    expect(fixed(NaN, 'en')).toBe('NaN');
  });
  it('has the same keys in every public locale', () => {
    const shape = (o: object): unknown => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === 'object' ? shape(v) : typeof v]));
    for (const code of PUBLIC_LOCALES) {
      const locale = strings[code as keyof typeof strings];
      expect(locale, code).toBeDefined();
      expect(shape(locale)).toEqual(shape(strings.en));
      const flat = JSON.stringify(locale);
      expect(flat).not.toMatch(/"\s*"/);
    }
    expect(Object.keys(strings).sort()).toEqual(['de', 'en', 'es', 'fr', 'pt', 'tr']);
  });
  it('builds the model description from the solved parameters', () => {
    for (const locale of Object.values(strings)) {
      const text = fill(locale.model, { span: portal.span, height: portal.height, mp: portal.mp, horizontal: portal.horizontal, vertical: portal.vertical });
      expect(text).not.toMatch(/[{}]/);
      for (const n of [portal.span, portal.height, portal.mp, portal.horizontal, portal.vertical]) expect(text).toContain(`${n} `);
      expect(fill(locale.checks.corner, { corner: 1 })).not.toMatch(/[{}]/);
      expect(fill(locale.nodalHeading, { event: 4 })).toContain('4');
      expect(fill(locale.amplified, { scale: 10 })).toContain('10');
    }
  });
  it('follows the visitor language for every public locale', () => {
    for (const code of PUBLIC_LOCALES) {
      setLocale(code);
      expect(plasticLocale()).toBe(code);
      expect(ps()).toBe(strings[code as keyof typeof strings]);
    }
  });
});
