/** The plates being meshed right now, for a progress bar: planned, then put in, of how many. Null when none. */
export const meshProgress = $state<{ now: { phase: 'planning' | 'meshing'; done: number; total: number } | null }>({ now: null });

export function setMeshProgress(phase: 'planning' | 'meshing', done: number, total: number): void {
  meshProgress.now = { phase, done, total };
}

export function endMeshProgress(): void {
  meshProgress.now = null;
}
