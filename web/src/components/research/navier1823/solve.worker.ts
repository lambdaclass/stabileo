import { initSolver, solve3D } from '../../../lib/engine/wasm-solver';
import { build, cases, downward, toSolverInput, validPlate, type Plate, type Row } from './model';

export type WorkerError = 'init' | 'solve' | 'displacement';
export type WorkerRequest = { run: true } | { plate: Plate; token: number };

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let stage: WorkerError = 'init';
  const token = 'token' in data ? data.token : undefined;
  try {
    await initSolver();
    if ('plate' in data) {
      if (!validPlate(data.plate)) throw new Error('invalid plate');
      const { family, n, hard, thickness } = data.plate;
      const { input, center } = build(family, n, hard, thickness);
      stage = 'solve';
      const result = solve3D(toSolverInput(input));
      stage = 'displacement';
      const values = downward(input, result.displacements);
      const row: Row = { family, n, center_mm: values[center - 1], values };
      self.postMessage({ plateRow: row, token });
      return;
    }
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      stage = 'solve';
      const result = solve3D(toSolverInput(c.input));
      stage = 'displacement';
      const values = downward(c.input, result.displacements);
      const row: Row = { family: c.family, n: c.n, center_mm: values[c.center - 1], values };
      self.postMessage({ row, index: i });
    }
    self.postMessage({ done: true });
  } catch (error) {
    console.error('navier worker', error);
    self.postMessage({ error: stage, token });
  }
};
