import { assertFiniteWire, finiteWireJson } from './wasm-solver';
import { finishSolve3D } from './solve-finish';

/** Native operations only. Active-set decisions stay in the shared generator. */
export function nonlinearWorkerSession(wasm: Record<string, any>) {
  let initial: string | undefined;
  let session: { solve(loads: unknown): any; free(): void } | undefined;
  return {
    solve(step: { kind: string; input: any; reuse?: boolean; soilSprings?: unknown[]; densities?: unknown; pretension?: unknown }) {
      const { input } = step;
      if (step.kind === 'ssi') return JSON.parse(wasm.solve_ssi_3d(finiteWireJson({ solver: input, soilSprings: step.soilSprings })));
      if (step.kind === 'cable') return JSON.parse(wasm.solve_cable_3d(finiteWireJson({ solver: input, densities: step.densities, pretension: step.pretension }), 50, 1e-8));
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
    free() {
      const owned = session;
      session = undefined; initial = undefined;
      owned?.free();
    },
  };
}

/** Always answer the job, even when releasing its native session also fails. */
export function nonlinearWorkerReply(
  sessions: Map<number, ReturnType<typeof nonlinearWorkerSession>>,
  wasm: Record<string, any>,
  msg: { type: string; sessionId: number; input?: any },
): { result?: any; error?: string; fatal?: boolean } {
  const release = () => {
    const session = sessions.get(msg.sessionId);
    sessions.delete(msg.sessionId);
    session?.free();
  };
  try {
    if (msg.type === 'nonlinear-free') { release(); return { result: null }; }
    let session = sessions.get(msg.sessionId);
    if (!session) { session = nonlinearWorkerSession(wasm); sessions.set(msg.sessionId, session); }
    return { result: session.solve(msg.input) };
  } catch (error: any) {
    let fatal = msg.type === 'nonlinear-free';
    try { release(); } catch { fatal = true; }
    // A failed native release leaves allocation ownership uncertain: retire this worker.
    return { error: error?.message ?? String(error), fatal };
  }
}
