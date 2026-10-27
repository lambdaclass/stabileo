/**
 * The desktop app's startup self-check: the engine loads from the bundled files and solves a
 * cantilever whose answer is known in closed form, on the main thread and in a worker. The
 * verdict goes to the shell's log (`stabileo-selfcheck ok|FAILED …`), which the launch test in
 * `.github/workflows/desktop.yml` reads.
 */
import { invoke } from '@tauri-apps/api/core';
import { initSolver, input2DToWireObject, solve } from '../engine/wasm-solver';
import { solve2DInWorker } from '../engine/solver-pool';
import { buildIdentity } from '../provenance/build-identity';
import type { AnalysisResults, SolverInput } from '../engine/types';

/** P L³ / (3 E I) for P = 10 kN, L = 2 m, E = 200 000 MPa, I = 1e-4 m⁴. */
const EXPECTED_TIP = (10 * 2 ** 3) / (3 * 200_000 * 1000 * 1e-4);

function cantilever(): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 2, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
  };
}

function tip(r: AnalysisResults): number {
  const d = r.displacements.find((x) => x.nodeId === 2);
  if (!d) throw new Error('no displacement at the tip');
  return Math.abs(d.uz);
}

function close(got: number): boolean {
  return Math.abs(got - EXPECTED_TIP) <= 1e-9 * EXPECTED_TIP;
}

async function log(line: string): Promise<void> {
  console.info(line);
  try {
    await invoke('log_line', { line });
  } catch {
    /* the log is a convenience; the console has the line */
  }
}

export async function runSelfCheck(): Promise<boolean> {
  try {
    await initSolver();
    const main = tip(solve(cantilever()));
    const worker = tip(await solve2DInWorker(input2DToWireObject(cantilever())));
    const id = buildIdentity();
    const ok = close(main) && close(worker);
    await log(`stabileo-selfcheck ${ok ? 'ok' : 'FAILED'} tip=${main} worker=${worker} expected=${EXPECTED_TIP} wasm=${id.wasmHash} engine=${id.engineVersion}`);
    return ok;
  } catch (err) {
    await log(`stabileo-selfcheck FAILED ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
