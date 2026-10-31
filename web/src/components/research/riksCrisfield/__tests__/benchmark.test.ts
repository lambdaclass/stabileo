import native from '../../../../../../research/numerical-methods/riks-crisfield/reference-results/native-results.json';
import validation from '../../../../../../research/numerical-methods/riks-crisfield/reference-results/VALIDATION.json';
import { nativeReplay } from '../replay';
import { measuredLimitFrame, compareFrameRun } from '../benchmark';
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

  it('does not claim a limit when a sampled path ends at the peak', () => {
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
    expect(checks[0].passed).toBe(false);
    expect(checks[1].passed).toBe(false);
    expect(checks[2].passed).toBe(true);
    expect(checks[0].error).toBeNaN();
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

it('requires a converged reversal for truncated and failed paths', () => {
  const c = data.cases[1];
  const replay = nativeReplay(c);
  const peak = measuredLimitFrame(replay.frames)!;
  const i = replay.frames.indexOf(peak);
  for (const frames of [replay.frames.slice(0, i + 1), replay.frames.slice(0, i + 2).map((f, j) => j === i + 1 ? { ...f, converged: false } : f)]) {
    const checks = compareRun(c, { ...replay, frames });
    expect(checks[0].reached).toBe(false);
    expect(checks[0].error).toBeNaN();
    expect(checks[1].error).toBeNaN();
    expect(comparisonHeadline(checks)).not.toContain('100.0%');
  }
  expect(compareRun(c, replay).every(c => c.passed)).toBe(true);
});

it('checks every displayed metric and replay number against native evidence', () => {
  for (const c of data.cases) {
    const run = nativeReplay(c);
    const source = native.cases.find(n => n.id === c.id)!;
    const summary = validation.caseSummaries.find(n => n.caseId === c.id)!;
    expect(run.totalIterations).toBe(source.totalIterations);
    expect(run.finalLoadFactor).toBe(source.finalLoadFactor);
    expect(run.converged).toBe(source.converged);
    expect(run.frames).toHaveLength(summary.steps);
    for (const [i, f] of run.frames.entries()) {
      const expected = source.frames[i];
      expect(f.step).toBe(expected.step);
      expect(f.iterations).toBe(expected.iterations);
      expect(f.converged).toBe(expected.converged);
      expect(f.loadFactor).toBe(expected.loadFactor);
      expect(f.load).toBe(expected.loadFactor * c.apex.referenceLoad);
      expect(f.displacement).toBe(-expected.displacements.find(d => d.nodeId === c.apex.nodeId)!.uz);
      expect(f.displacements).toEqual(expected.displacements.toSorted((a,b) => a.nodeId-b.nodeId).flatMap(d => [d.ux,d.uz]));
      expect(Math.abs(f.loadFactor - (run.frames[i-1]?.loadFactor ?? 0))).toBeLessThanOrEqual(c.input.maxDs / c.apex.referenceLoad + 1e-10);
    }
    const checks = c.id === 'shallow-toggle' ? compareFrameRun(c, run) : compareRun(c, run);
    expect(checks.at(-1)!.error).toBeCloseTo(summary.maxEquilibriumPathError, 12);
    expect(checks.every(check => check.passed)).toBe(true);
    if (c.id !== 'shallow-toggle') {
      expect(checks[0].observed).toBeCloseTo(summary.measuredLimitLoad!, 8);
      expect(checks[1].observed).toBeCloseTo(summary.measuredLimitDisplacement!, 12);
      expect(checks[0].error).toBeCloseTo(summary.limitLoadRelativeError!, 12);
      expect(checks[1].error).toBeCloseTo(summary.limitDisplacementRelativeError!, 12);
    }
  }
});
