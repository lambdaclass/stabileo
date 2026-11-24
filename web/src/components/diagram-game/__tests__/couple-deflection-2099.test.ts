import { expect, it } from 'vitest';
import { EI, solveGame, type GameModel } from '../game-model';
import { diagramOf, shapeDistance, type Diagram } from '../traces';

const L = 5;
const couple = 6;

function model(a: number, m = couple, p = 0): GameModel {
  return {
    nodes: [[0, 0], [L, 0]], elements: [[0, 1]],
    supports: [{ node: 0, type: 'fixed' }],
    pointLoads: [{ element: 0, a, m, p }],
  };
}

function cantilever(x: number, a: number, m: number, p = 0): number {
  const d = Math.max(x - a, 0);
  return (m * (x * x - d * d) / 2 + p * (x * x * (3 * a - x) + d ** 3) / 6) / EI;
}

it('#2099 — an interior couple retains the analytical cantilever shape and curvature jump', () => {
  const a = 2;
  const solved = solveGame(model(a))!;
  expect(solved).not.toBeNull();
  const actual = diagramOf(solved, 'D');
  const analytical: Diagram = { kind: 'D', traces: [{ at: t => [0, cantilever(t * L, a, couple)], breaks: [a / L] }] };
  for (const x of [0, 1, a - 0.01, a, a + 0.01, 4, L]) {
    expect(actual.traces[0]!.at(x / L)[1]).toBeCloseTo(cantilever(x, a, couple), 12);
  }
  expect(shapeDistance(actual, analytical)).toBeLessThan(1e-10);
  const curvature = (x: number) => {
    const h = 0.001;
    const y = (at: number) => actual.traces[0]!.at(at / L)[1];
    return (y(x + h) - 2 * y(x) + y(x - h)) / (h * h);
  };
  expect(curvature(a - 0.01)).toBeCloseTo(couple / EI, 10);
  expect(curvature(a + 0.01)).toBeCloseTo(0, 10);
});

for (const a of [0, 1e-5, L / 2, L - 1e-5, L]) {
  it(`#2099 — signed and combined couples at a=${a}`, () => {
    for (const m of [-couple, couple]) for (const p of [0, -3]) {
      const solved = solveGame(model(a, m, p))!;
      expect(solved).not.toBeNull();
      const trace = diagramOf(solved, 'D').traces[0]!;
      for (const t of [0, 0.1, 0.4, 0.7, 1]) expect(trace.at(t)[1]).toBeCloseTo(cantilever(t * L, a, m, p), 12);
    }
  });
}

it('a force-only game keeps its analytical answer', () => {
  const a = 2;
  const solved = solveGame(model(a, 0, -3))!;
  expect(solved).not.toBeNull();
  const trace = diagramOf(solved, 'D').traces[0]!;
  for (const t of [0, 0.1, 0.4, 0.7, 1]) expect(trace.at(t)[1]).toBeCloseTo(cantilever(t * L, a, 0, -3), 12);
});

it('#2099 — an interior couple agrees with the equivalent nodal couple on a split simply supported beam', () => {
  const a = 2;
  const single: GameModel = { ...model(a), supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }] };
  const split: GameModel = {
    nodes: [[0, 0], [a, 0], [L, 0]], elements: [[0, 1], [1, 2]],
    supports: [{ node: 0, type: 'pinned' }, { node: 2, type: 'rollerX' }],
    nodalLoads: [{ node: 1, mz: couple }],
  };
  const one = solveGame(single), two = solveGame(split);
  expect(one).not.toBeNull();
  expect(two).not.toBeNull();
  const trace = diagramOf(one!, 'D').traces[0]!;
  const pieces = diagramOf(two!, 'D').traces;
  for (const x of [0, 0.5, a - 0.001, a, a + 0.001, 3.5, L]) {
    const d = Math.max(0, x - a), b = L - a;
    const expected = couple * ((b * b / (2 * L) - L / 6) * x + x ** 3 / (6 * L) - d * d / 2) / EI;
    expect(trace.at(x / L)[1]).toBeCloseTo(expected, 12);
    expect(pieces[x <= a ? 0 : 1]!.at(x <= a ? x / a : (x - a) / (L - a))[1]).toBeCloseTo(expected, 12);
  }
});

it('#2099 — the recovered couple rotates with the member axis', () => {
  for (const [cos, sin] of [[0, 1], [0, -1], [-1, 0], [0.6, 0.8]]) {
    const a = 2;
    const rotated: GameModel = { ...model(a), nodes: [[0, 0], [L * cos!, L * sin!]] };
    const solved = solveGame(rotated);
    expect(solved).not.toBeNull();
    const trace = diagramOf(solved!, 'D').traces[0]!;
    for (const t of [0, 0.1, 0.4, 0.7, 1]) {
      const displacement = cantilever(t * L, a, couple);
      expect(trace.at(t)[0]).toBeCloseTo(-sin! * displacement, 12);
      expect(trace.at(t)[1]).toBeCloseTo(cos! * displacement, 12);
    }
  }
});
