import type { SolverInput3D } from './types-3d';
import { assertFiniteWire, input3DToWireObject, prepareLoadSession3D, solve3D } from './wasm-solver';

export function repeatedSolve3D() {
  let session: ReturnType<typeof prepareLoadSession3D> | undefined;
  let model: string | undefined;
  let closed = false;
  return {
    solve(input: SolverInput3D) {
      if (closed) throw new Error('Repeated solve has been freed');
      if (input.constraints?.length) return solve3D(input);
      const wire = input3DToWireObject(input);
      assertFiniteWire(wire);
      wire.loads = [];
      const key = JSON.stringify(wire);
      if (!session) {
        model = key;
        session = prepareLoadSession3D(input);
      }
      if (key !== model) return solve3D(input);
      try { return session.solve(input.loads); }
      catch (error) { throw error instanceof Error ? error : new Error(String(error)); }
    },
    free() {
      if (!closed) { closed = true; session?.free(); session = undefined; model = undefined; }
    },
  };
}
