import { initSolver, solve3D } from '../../../lib/engine/wasm-solver';
import { cases, solverInput, type Row } from './model';

export type WorkerError = 'init' | 'solve' | 'displacement';

self.onmessage = async () => {
  let stage: WorkerError = 'init';
  try {
    await initSolver();
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      stage = 'solve';
      const result = solve3D(solverInput(i));
      stage = 'displacement';
      const values = Object.values(c.input.nodes).sort((a, b) => a.id - b.id).map(n => {
        const d = result.displacements.find(d => d.nodeId === n.id);
        if (!d || !Number.isFinite(d.uz)) throw new Error(`node ${n.id}`);
        return -1000 * d.uz;
      });
      const row: Row = { family: c.family, n: c.n, center_mm: values[c.center - 1], values };
      self.postMessage({ row, index: i });
    }
    self.postMessage({ done: true });
  } catch (error) {
    console.error('navier worker', error);
    self.postMessage({ error: stage });
  }
};
