import { describe, expect, it } from 'vitest';
import caseData from '../../../../../../research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json';
import { axialRigidity, compareRun, comparisonHeadline, DEFAULT_PARAMETERS, inputFor, limitPoint, referencePath, type BenchmarkRun, type CaseFile } from '../benchmark';

const data = caseData as CaseFile;
const toggle = data.cases.find((c) => c.id === 'shallow-toggle')!;

describe('Riks–Crisfield closed-form benchmark', () => {
  it('matches the shared exact limit point', () => {
    const limit = limitPoint(toggle.geometry.halfSpan, toggle.geometry.rise, axialRigidity(toggle), toggle.apex.referenceLoad);
    expect(limit.displacement).toBeCloseTo(toggle.reference.upperLimit.displacement, 12);
    expect(limit.load).toBeCloseTo(toggle.reference.upperLimit.load, 10);
    expect(limit.loadFactor).toBeCloseTo(toggle.reference.upperLimit.loadFactor, 12);
  });

  it('changes rise, load direction and arc step without altering the base case', () => {
    const original = structuredClone(toggle.input);
    const parameters = { ...DEFAULT_PARAMETERS(toggle), riseSpan: 0.04, direction: 'upward' as const, initialDs: 0.025 };
    const input = inputFor(toggle, parameters);
    expect(input.solver.nodes[String(toggle.apex.nodeId)].z).toBeCloseTo(0.16, 12);
    expect(input.solver.loads[0].data.fz).toBe(50);
    expect(input.initialDs).toBe(0.025);
    expect(toggle.input).toEqual(original);
  });

  it('places the exact limit on the reference curve', () => {
    const points = referencePath(toggle);
    const limit = toggle.reference.upperLimit;
    expect(points.some(([x, y]) => Math.abs(x - limit.displacement) < 1e-12 && Math.abs(y - limit.load) < 1e-8)).toBe(true);
    expect(Math.min(...points.map((p) => p[0]))).toBeLessThan(0);
    expect(Math.max(...points.map((p) => p[0]))).toBeGreaterThan(limit.displacement);
  });

  it('passes an actual sampled closed-form path', () => {
    const limit = toggle.reference.upperLimit;
    const run: BenchmarkRun = {
      caseId: toggle.id,
      parameters: DEFAULT_PARAMETERS(toggle),
      frames: [
        { step: 1, loadFactor: limit.loadFactor / 2, displacement: limit.displacement / 2, load: limit.load / 2, iterations: 2, converged: true, displacements: [] },
        { step: 2, loadFactor: limit.loadFactor, displacement: limit.displacement, load: limit.load, iterations: 3, converged: true, displacements: [] },
      ],
      converged: true,
      totalIterations: 5,
      finalLoadFactor: limit.loadFactor,
    };
    run.frames[0].load = 2 * axialRigidity(toggle) * (1 - Math.hypot(toggle.geometry.halfSpan, toggle.geometry.rise - run.frames[0].displacement) / toggle.geometry.initialLength) * ((toggle.geometry.rise - run.frames[0].displacement) / Math.hypot(toggle.geometry.halfSpan, toggle.geometry.rise - run.frames[0].displacement));
    run.frames[0].loadFactor = run.frames[0].load / toggle.apex.referenceLoad;
    const checks = compareRun(toggle, run);
    expect(checks.every((check) => check.passed)).toBe(true);
    expect(comparisonHeadline(checks)).toBe('Stabileo traces the snap-through: 3/3 checks within 5%');
  });

  it('uses the first load reversal, not later post-snap hardening, as the limit', () => {
    const limit = toggle.reference.upperLimit;
    const frame = (step: number, displacement: number, load: number) => ({ step, displacement, load, loadFactor: load / toggle.apex.referenceLoad, iterations: 3, converged: true, displacements: [] });
    const run: BenchmarkRun = {
      caseId: toggle.id,
      parameters: DEFAULT_PARAMETERS(toggle),
      frames: [frame(1, limit.displacement, limit.load), frame(2, limit.displacement * 1.2, 0), frame(3, limit.displacement * 1.4, limit.load * 2)],
      converged: true,
      totalIterations: 9,
      finalLoadFactor: limit.loadFactor * 2,
    };
    expect(compareRun(toggle, run)[0].observed).toBe(limit.load);
  });

  it('reports an unreached limit instead of passing it', () => {
    const run: BenchmarkRun = { caseId: toggle.id, parameters: DEFAULT_PARAMETERS(toggle), frames: [], converged: false, totalIterations: 0, finalLoadFactor: 0 };
    const checks = compareRun(toggle, run);
    expect(checks[0].reached).toBe(false);
    expect(checks[0].passed).toBe(false);
    expect(checks[0].observed).toBeNaN();
    expect(comparisonHeadline(checks)).toContain('0/3 pass');
  });
});
