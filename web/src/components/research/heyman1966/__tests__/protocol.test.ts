import { describe, expect, it } from 'vitest';
import replay from '../../../../../../research/mechanics/heyman-1966/reference-results/replay.json';
import { archFigure, archView, decodeRun, FIGURE, solverOutcome, type ArchFrame, type ArchRun } from '../protocol';

const weight = decodeRun(replay.self_weight);
const load = decodeRun(replay.point_load);
const runs: [string, ArchRun][] = [['self-weight', weight], ['point load', load]];

const quads = (figure: ReturnType<typeof archFigure>) =>
  figure.values.map((value, c) => ({ value, corners: [0, 1, 2, 3].map(k => figure.cells[4 * c + k]).map(n => [figure.xy[2 * n], figure.xy[2 * n + 1]] as const) }));
const area = (corners: readonly (readonly [number, number])[]) =>
  Math.abs(corners.reduce((a, [x, y], i) => { const [u, v] = corners[(i + 1) % corners.length]; return a + x * v - u * y; }, 0)) / 2;
const centre = (corners: readonly (readonly [number, number])[]) => corners.reduce(([a, b], [x, y]) => [a + x / 4, b + y / 4], [0, 0]);
const hinges = (run: ArchRun, frame: ArchFrame) => quads(archFigure(run, frame)).filter(q => q.value === FIGURE.hinge && area(q.corners) > 0);

describe('the arch figure', () => {
  it.each(runs)('keeps one topology for every frame of the %s run, so frames displace one mesh', (_, run) => {
    const cells = archFigure(run, run.frames[0]).cells;
    for (const frame of run.frames) {
      const figure = archFigure(run, frame);
      expect(figure.cells).toEqual(cells);
      expect(figure.values.length * 4).toBe(cells.length);
      expect(figure.xy.every(Number.isFinite)).toBe(true);
    }
  });

  it.each(runs)('only uses the figure categories in the %s run', (_, run) => {
    const allowed = new Set<number>([...FIGURE.stone, FIGURE.line, FIGURE.outside, FIGURE.hinge, FIGURE.load, FIGURE.support, FIGURE.ground]);
    for (const frame of run.frames) for (const v of archFigure(run, frame).values) expect(allowed.has(v)).toBe(true);
  });

  it.each(runs)('fits every frame of the %s run, its ground and its load arrow inside the view', (_, run) => {
    const [x0, y0, x1, y1] = archView(run);
    for (const frame of run.frames) {
      const { xy } = archFigure(run, frame);
      for (let i = 0; i < xy.length; i += 2) {
        expect(xy[i]).toBeGreaterThanOrEqual(x0);
        expect(xy[i]).toBeLessThanOrEqual(x1);
        expect(xy[i + 1]).toBeGreaterThanOrEqual(y0);
        expect(xy[i + 1]).toBeLessThanOrEqual(y1);
      }
    }
  });

  it('draws hinges only once they form, each on the face it forms on', () => {
    for (const run of [weight, load]) {
      const before = run.frames.find(f => f.kind === 'bisection' || f.kind === 'load')!;
      expect(hinges(run, before)).toHaveLength(0);
      const formed = run.frames.find(f => f.kind === 'least' || f.kind === 'collapse')!;
      const markers = hinges(run, formed);
      expect(markers).toHaveLength(run.result.hinges.length);
      markers.forEach((m, i) => {
        const [x, y] = centre(m.corners);
        const rho = Math.hypot(x, y);
        if (run.result.hinges[i].side === 'extrados') expect(rho).toBeGreaterThan(run.r + formed.t / 2);
        else expect(rho).toBeLessThan(run.r - formed.t / 2);
      });
    }
  });

  it('turns the line of thrust red only where it leaves the stone', () => {
    const outside = (frame: ArchFrame) => archFigure(weight, frame).values.filter(v => v === FIGURE.outside).length;
    const thin = weight.frames.find(f => f.kind === 'bisection' && !f.feasible)!;
    expect(outside(thin)).toBeGreaterThan(0);
    expect(outside(weight.frames.find(f => f.kind === 'least')!)).toBe(0);
    for (const f of load.frames) expect(outside(f)).toBe(0);
  });

  it('separates the voussoirs with open joints and alternates their shade', () => {
    const figure = archFigure(weight, weight.frames.find(f => f.kind === 'least')!);
    const stones = quads(figure).filter(q => (FIGURE.stone as readonly number[]).includes(q.value));
    expect(new Set(stones.map(q => q.value)).size).toBe(2);
    const stoneArea = stones.reduce((a, q) => a + area(q.corners), 0);
    const ring = (weight.alpha / 180) * Math.PI * 2 * weight.r * weight.result.eta!;
    expect(stoneArea).toBeLessThan(ring);
    expect(stoneArea).toBeGreaterThan(0.6 * ring);
  });

  it('grows the load arrow with the load and keeps it vertical while the ring collapses', () => {
    const arrow = (frame: ArchFrame) => quads(archFigure(load, frame)).filter(q => q.value === FIGURE.load);
    const length = (frame: ArchFrame) => { const ys = arrow(frame).flatMap(q => q.corners.map(c => c[1])); return Math.max(...ys) - Math.min(...ys); };
    const ramp = load.frames.filter(f => f.kind === 'load');
    expect(length(ramp[0])).toBeLessThan(length(ramp[ramp.length - 1]));
    const [shaft] = arrow(load.frames[load.frames.length - 1]);
    expect(Math.abs(shaft.corners[0][0] - shaft.corners[3][0]) + Math.abs(shaft.corners[1][0] - shaft.corners[2][0])).toBeLessThan(1e-9);
  });
});

describe('the solver outcome', () => {
  it('names an infeasible arch, an unbounded load and a broken result', () => {
    expect(solverOutcome({ error: 'Infeasible' })).toEqual({ error: 'infeasible' });
    expect(solverOutcome({ error: 'Unbounded' })).toEqual({ error: 'unbounded' });
    expect(solverOutcome({ error: 'Singular' })).toEqual({ error: 'solver' });
    expect(solverOutcome({ error: 'Numerical' })).toEqual({ error: 'solver' });
    expect(solverOutcome({ error: 'Input', field: 'voussoirs' } as never)).toEqual({ error: 'solver' });
    expect(solverOutcome({ case: 'self-weight' } as never)).toEqual({ error: 'solver' });
    expect(solverOutcome(replay.point_load as { error?: unknown })).toEqual({ result: load });
  });
});
