import { describe, expect, it } from 'vitest';
import { benchmark, checks, compare, crownOf, frameFor, limitPoint, peakBracket, published, quantities, sampleSteps, study, tolerance, viewerData, type Frame, type Run } from '../case';
import { archStrings, strings } from '../i18n';
import replay from '../../../../../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json';
import convergence from '../../../../../../research/benchmarks/dadeppo-arch-1975/results/convergence.json';
import reference from '../../../../../../research/benchmarks/dadeppo-arch-1975/reference-results/limit-load.json';
import paperYaml from '../../../../../../research/benchmarks/dadeppo-arch-1975/paper.yaml?raw';

const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;

describe('DaDeppo–Schmidt shared benchmark', () => {
  it('defines the 215° clamped–hinged arch of the paper', () => {
    const s = benchmark.input.solver;
    const nodes = Object.values(s.nodes).sort((a, b) => a.id - b.id);
    expect(nodes).toHaveLength(41);
    nodes.forEach((n, i) => {
      const angle = (-107.5 + i * 215 / 40) * Math.PI / 180;
      expect(n.id).toBe(i);
      expect(n.x).toBeCloseTo(Math.sin(angle), 12);
      expect(n.z).toBeCloseTo(Math.cos(angle), 12);
    });
    expect(s.nodes['0'].x).toBeCloseTo(-0.9537169507482269, 12);
    expect(s.nodes['0'].z).toBeCloseTo(-0.3007057995042731, 12);
    expect(s.nodes['40'].x).toBeCloseTo(0.9537169507482269, 12);
    expect(s.nodes['20'].x).toBeCloseTo(0, 12);
    expect(s.nodes['20'].z).toBeCloseTo(1, 12);
    const elements = Object.values(s.elements).sort((a, b) => a.id - b.id);
    expect(elements).toHaveLength(40);
    elements.forEach((e, i) => expect(e).toEqual({ id: i, type: 'frame', nodeI: i, nodeJ: i + 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }));
    expect(Object.values(s.supports)).toEqual([{ id: 0, nodeId: 0, type: 'fixed' }, { id: 40, nodeId: 40, type: 'pinned' }]);
    expect(s.loads).toEqual([{ type: 'nodal', data: { nodeId: 20, fx: 0, fz: -1, my: 0 } }]);
    expect(s.constraints).toEqual([]);
    expect(Object.keys(s.materials)).toEqual(['1']);
    expect(Object.keys(s.sections)).toEqual(['1']);
    const kNPerM2 = s.materials['1'].e * 1000;
    expect(kNPerM2 * s.sections['1'].iz).toBe(1);
    expect(kNPerM2 * s.sections['1'].a).toBe(1e6);
    expect(benchmark.crownNode).toBe(20);
    expect(benchmark.radius).toBe(1);
    expect(benchmark.openingDegrees).toBe(215);
    expect(897 * 100 ** 2 / 1e6).toBeCloseTo(benchmark.reference, 12);
  });

  it('keeps the reference and tolerances identical in every fixture', () => {
    expect(reference.normalizedLimitLoad).toBe(benchmark.reference);
    expect(reference.crownAtLimitPoint).toEqual(benchmark.crownReference);
    expect(paperYaml).toContain(`reference: ${benchmark.reference}, relative_tolerance: ${benchmark.relativeTolerance}`);
    expect(paperYaml).toContain(`u_over_R: ${benchmark.crownReference.uOverR}, v_over_R: ${benchmark.crownReference.vOverR}, rotation: ${benchmark.crownReference.rotation}`);
    expect(paperYaml).toContain(`u_over_R: ${benchmark.crownRelativeTolerance.uOverR}, v_over_R: ${benchmark.crownRelativeTolerance.vOverR}, rotation: ${benchmark.crownRelativeTolerance.rotation}`);
    expect(published).toEqual({ loadFactor: 8.97, uOverR: 0.6116, vOverR: 1.1372, rotation: 0.0498 });
    expect(tolerance).toEqual({ loadFactor: 0.006, uOverR: 0.0011, vOverR: 0.0007, rotation: 0.04 });
  });

  it('compares the full native replay and requires a descending branch', () => {
    const comparison = compare(replay.steps);
    expect(comparison.peak).toBeCloseTo(9.0112911888175, 10);
    expect(comparison.difference).toBeCloseTo(0.0412911888175, 10);
    expect(comparison.relative * 100).toBeCloseTo(0.46032540, 6);
    expect(comparison.pass).toBe(true);
    expect(compare(replay.steps.slice(0, 220)).pass).toBe(false);
    expect(compare(replay.steps.map(s => ({ ...s, loadFactor: s.step }))).pass).toBe(false);
    expect(() => compare([])).toThrow();
    expect(() => compare([{ step: 1, loadFactor: NaN, converged: true }])).toThrow();
    expect(() => compare([{ step: 1, loadFactor: 1, converged: false }])).toThrow();
  });

  it('checks the limit load and crown state against the published table', () => {
    const rows = checks(replay.limitPoint);
    expect(rows.map(r => r.quantity)).toEqual(quantities);
    expect(rows.every(r => r.pass)).toBe(true);
    const by = Object.fromEntries(rows.map(r => [r.quantity, r]));
    expect(replay.limitPoint.peakStep).toBe(267);
    expect(by.loadFactor.value).toBeCloseTo(9.011295412, 8);
    expect(by.loadFactor.relative * 100).toBeCloseTo(0.4604, 4);
    expect(by.uOverR.value).toBeCloseTo(0.611893, 6);
    expect(by.uOverR.relative * 100).toBeCloseTo(0.0479, 4);
    expect(by.vOverR.value).toBeCloseTo(1.137807, 6);
    expect(by.vOverR.relative * 100).toBeCloseTo(0.0534, 4);
    expect(by.rotation.value).toBeCloseTo(0.0513456, 7);
    expect(by.rotation.relative * 100).toBeCloseTo(3.1036, 4);
    const swapped = { ...replay.limitPoint, crown: { ...replay.limitPoint.crown, vOverR: -replay.limitPoint.crown.vOverR } };
    expect(checks(swapped).find(r => r.quantity === 'vOverR')!.pass).toBe(false);
    const axes = { ...replay.limitPoint, crown: { ...replay.limitPoint.crown, uOverR: replay.limitPoint.crown.vOverR, vOverR: replay.limitPoint.crown.uOverR } };
    expect(checks(axes).filter(r => r.pass).map(r => r.quantity)).toEqual(['loadFactor', 'rotation']);
  });

  it('places the limit point from the replayed path', () => {
    const bracket = peakBracket(replay.steps);
    expect(bracket.prefixes).toEqual([266, 267, 268]);
    expect(bracket.peakStep).toBe(replay.limitPoint.peakStep);
    expect(bracket.offset).toBeCloseTo(replay.limitPoint.offset, 8);
    expect(bracket.loadFactor).toBeCloseTo(replay.limitPoint.loadFactor, 8);
    expect(() => peakBracket(replay.steps.slice(0, 200))).toThrow();
  });

  it('reproduces the mesh study and the tolerance budget', () => {
    expect(convergence.meshes.map(m => m.elements)).toEqual([20, 40, 80]);
    expect(convergence.meshes[1].loadFactor).toBeCloseTo(replay.limitPoint.loadFactor, 9);
    expect(convergence.meshes[1].uOverR).toBeCloseTo(replay.limitPoint.crown.uOverR, 9);
    const rows = Object.fromEntries(study().map(r => [r.quantity, r]));
    for (const r of Object.values(rows)) {
      expect(r.order).toBeGreaterThan(1.5);
      expect(r.order).toBeLessThan(2.5);
      expect(r.tolerance).toBeGreaterThanOrEqual(r.budget);
      expect(r.tolerance).toBeLessThanOrEqual(1.25 * r.budget);
    }
    expect(rows.loadFactor.extrapolated).toBeCloseTo(8.972642, 5);
    expect(rows.loadFactor.relative * 100).toBeCloseTo(0.0295, 3);
    expect(rows.uOverR.extrapolated).toBeCloseTo(0.611428, 5);
    expect(rows.vOverR.extrapolated).toBeCloseTo(1.137280, 5);
    expect(rows.rotation.extrapolated).toBeCloseTo(0.049870, 5);
    expect(rows.loadFactor.rounding).toBeCloseTo(0.005 / 8.97, 12);
  });

  it('uses actual endpoint displacements in the shared viewer', () => {
    expect(replay.frames.map(f => f.step)).toEqual(sampleSteps);
    const frame = replay.frames.at(-1)!;
    const view = viewerData(frame);
    expect(view.xy).toHaveLength(82);
    expect(view.cells).toHaveLength(80);
    expect(view.displacement[41]).toBe(frame.displacements.find(d => d.nodeId === 20)!.uz);
    expect(view.values[20]).toBeCloseTo(Math.hypot(view.displacement[40], view.displacement[41]), 12);
    expect(viewerData().values.every(v => v === 0)).toBe(true);
    const crownNode = frame.displacements.find(d => d.nodeId === 20)!;
    expect(crownOf(frame)).toEqual({ uOverR: crownNode.ux, vOverR: -crownNode.uz, rotation: crownNode.ry });
    expect(() => frameFor({ converged: false } as Run, 20)).toThrow();
    expect(() => frameFor({ converged: true, steps: replay.steps, results: { displacements: [] } } as unknown as Run, 400)).toThrow();
  });

  it('runs the shared case and its limit point through the production WASM wrapper', async () => {
    const engine = await import('../../../../lib/engine/wasm-solver');
    await engine.initSolver();
    const run = engine.solveArcLength(benchmark.input) as Run;
    expect(run.converged).toBe(true);
    expect(compare(run.steps).pass).toBe(true);
    expect(compare(run.steps).peak).toBeCloseTo(compare(replay.steps).peak, 6);
    const frame = frameFor(run, benchmark.input.maxSteps);
    const crown = frame.displacements.find(d => d.nodeId === benchmark.crownNode)!;
    expect(crown.uz).toBeCloseTo(replay.frames.at(-1)!.displacements.find(d => d.nodeId === benchmark.crownNode)!.uz, 8);
    const frames = peakBracket(run.steps).prefixes.map(step => frameFor(engine.solveArcLength({ ...benchmark.input, maxSteps: step }) as Run, step)) as [Frame, Frame, Frame];
    const live = limitPoint(run.steps, frames);
    expect(live.peakStep).toBe(replay.limitPoint.peakStep);
    expect(live.loadFactor).toBeCloseTo(replay.limitPoint.loadFactor, 8);
    for (const key of ['uOverR', 'vOverR', 'rotation'] as const) expect(live.crown[key]).toBeCloseTo(replay.limitPoint.crown[key], 8);
    expect(checks(live).every(r => r.pass)).toBe(true);
  });

  it('provides complete experiment translations in every locale', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(strings[locale]).sort()).toEqual(Object.keys(strings.en).sort());
      expect(strings[locale].limitations).toHaveLength(strings.en.limitations.length);
      expect(archStrings(locale)).toBe(strings[locale]);
      for (const [key, value] of Object.entries(strings[locale])) {
        if (locale !== 'en' && typeof value === 'string' && value.length > 12) expect(value, `${locale}.${key}`).not.toBe(strings.en[key as keyof typeof strings.en]);
      }
      expect(strings[locale].incomplete).toContain('{n}');
      expect(strings[locale].incomplete).toContain('{total}');
      expect(strings[locale].slider).toContain('{step}');
      expect(strings[locale].slider).toContain('{load}');
    }
    expect(archStrings('xx')).toBe(strings.en);
  });
});
