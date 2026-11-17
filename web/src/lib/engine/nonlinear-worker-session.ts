import { assertFiniteWire } from './wasm-solver';
import { finishSolve3D } from './solve-finish';

/** Native operations only. Active-set decisions stay in the shared generator. */
export function nonlinearWorkerSession(wasm: Record<string, any>) {
  let initial: string | undefined;
  let session: { solve(loads: unknown): any; free(): void } | undefined;
  return {
    solve(step: { kind: string; input: any; reuse?: boolean; soilSprings?: unknown[]; densities?: unknown; pretension?: unknown }) {
      const { input } = step;
      if (step.kind === 'ssi') return JSON.parse(wasm.solve_ssi_3d(JSON.stringify({ solver: input, soilSprings: step.soilSprings })));
      if (step.kind === 'cable') return JSON.parse(wasm.solve_cable_3d(JSON.stringify({ solver: input, densities: step.densities, pretension: step.pretension }), 50, 1e-8));
      assertFiniteWire(input);
      if (step.reuse && !input.constraints?.length && wasm.LoadSession3D) {
        const structure = { ...input, loads: [] };
        const key = JSON.stringify(structure);
        if (!session) {
          session = new wasm.LoadSession3D(structure);
          initial = key;
        }
        if (key === initial) return finishSolve3D(session!.solve(input.loads), input);
      }
      return finishSolve3D(wasm.solve_3d(input), input);
    },
    free() { session?.free(); session = undefined; initial = undefined; },
  };
}
