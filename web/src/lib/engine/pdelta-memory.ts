/** Temporary browser guard until the 3D P-Delta assembly is sparse. */
export const PDELTA_MEMORY_MESSAGE = 'P-Delta is not available for a model this large yet. Select linear analysis explicitly or reduce the model.';

/** The serialized input shared by the main thread and the solver worker. */
export function assertPDeltaMemoryBudget(input: Record<string, any>, message = PDELTA_MEMORY_MESSAGE): void {
  // Match DofNumbering::build_3d: restrained DOFs still occupy the full dense assembly.
  const values = (key: string): any[] => Object.values(input[key] ?? {});
  const rotations = values('elements').some(e => e.type === 'frame')
    || ['plates', 'quads', 'quad9s', 'curvedShells'].some(k => values(k).length > 0);
  const warping = values('sections').some(s => s.cw != null);
  const dofs = values('nodes').length * (warping ? 7 : rotations ? 6 : 3);
  // Assembly, geometric-stiffness copy, free block and factorization workspace coexist.
  // A conservative 512 MiB working budget avoids known browser OOMs; this is not an
  // assurance that smaller models fit every device. Remove with sparse P-Delta assembly.
  if (4 * 8 * dofs ** 2 > 512 * 1024 ** 2) throw new Error(message);
}
