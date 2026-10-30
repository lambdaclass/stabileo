import { initSolver, solve3D } from '../../../lib/engine/wasm-solver';
import { cases, solverInput, type Row } from './model';

self.onmessage = async () => {
  try {
    await initSolver();
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const result = solve3D(solverInput(i));
      const values = Object.values(c.input.nodes).sort((a, b) => a.id - b.id).map(n => {
        const d = result.displacements.find(d => d.nodeId === n.id);
        if (!d || !Number.isFinite(d.uz)) throw new Error('Missing displacement');
        return -1000 * d.uz;
      });
      const row: Row = { family: c.family, n: c.n, center_mm: values[c.center - 1], values };
      self.postMessage({ row, index: i });
    }
    self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
