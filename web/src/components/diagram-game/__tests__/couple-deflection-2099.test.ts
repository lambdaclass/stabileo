import { expect, it } from 'vitest';
import { EI, solveGame, type GameModel } from '../game-model';
import { diagramOf, shapeDistance, type Diagram } from '../traces';

const knownWrong2099 = !process.env.IGNORED;
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

it.skipIf(knownWrong2099)('known wrong result: #2099 — an interior couple retains the analytical cantilever shape and curvature jump', () => {
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
  it.skipIf(knownWrong2099)(`known wrong result: #2099 — signed and combined couples at a=${a}`, () => {
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
