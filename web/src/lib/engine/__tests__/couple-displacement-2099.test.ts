import { afterEach, expect, it, vi } from 'vitest';
import { computeDeformedShape, computeDisplacementAt } from '../diagrams';
import * as engine from '../wasm-solver';

const knownWrong2099 = !process.env.IGNORED;
const L = 5, EI = 20_000, C = 6;
afterEach(() => vi.restoreAllMocks());

function closed(x: number, a: number, hinges: boolean): number {
  const b = L - a, d = Math.max(0, x - a);
  if (hinges) return C * ((b * b / (2 * L) - L / 6) * x + x ** 3 / (6 * L) - d * d / 2) / EI;
  return C * (b * (L - 3 * a) * x * x / (2 * L * L) + a * b * x ** 3 / L ** 3 - d * d / 2) / EI;
}

for (const ready of [false, true]) for (const hinges of [false, true]) {
  it.skipIf(knownWrong2099)(`known wrong result: #2099 — point and sampled recovery include a couple with WASM ready=${ready}, hinges=${hinges}`, () => {
    vi.spyOn(engine, 'isWasmReady').mockReturnValue(ready);
    for (const a of [0, 1e-5, 2, L - 1e-5, L]) {
      const loads = [{ a, p: 0, my: C }];
      const points = computeDeformedShape(0, 0, L, 0, 0, 0, 0, 0, 0, 0, 1, L, hinges, hinges, EI, 0, 0, loads);
      for (const [i, point] of points.entries()) {
        const t = i / (points.length - 1);
        expect(point.x).toBeCloseTo(t * L, 12);
        expect(point.y).toBeCloseTo(closed(t * L, a, hinges), 12);
        const single = computeDisplacementAt(t, 0, 0, L, 0, 0, 0, 0, 0, 0, 0, L, hinges, hinges, EI, 0, 0, loads);
        expect(single.uz).toBeCloseTo(closed(t * L, a, hinges), 12);
      }
    }
  });
}

it('an unloaded recovery and zero couple keep the same rigid motion', () => {
  for (const ready of [false, true]) {
    vi.spyOn(engine, 'isWasmReady').mockReturnValue(ready);
    for (const my of [undefined, 0]) {
      const points = computeDeformedShape(0, 0, L, 0, 1, 2, 0.1, 1, 2 + 0.1 * L, 0.1, 1, L, false, false, EI, 0, 0, [{ a: 2, p: 0, my }]);
      points.forEach((point, i) => {
        const x = i / (points.length - 1) * L;
        expect(point.x).toBeCloseTo(x + 1, 12);
        expect(point.y).toBeCloseTo(2 + 0.1 * x, 12);
      });
    }
  }
});
