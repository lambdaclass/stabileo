/**
 * The plates being meshed right now, for the progress card at the viewer's foot: what for (the
 * analysis or the plates' own dialog), planned, then put in, of how many. Null when none.
 */
export type MeshProgressFor = 'analysis' | 'plates';
export const meshProgress = $state<{ now: { phase: 'planning' | 'meshing'; done: number; total: number; for: MeshProgressFor } | null }>({ now: null });

export function setMeshProgress(phase: 'planning' | 'meshing', done: number, total: number, why: MeshProgressFor = 'analysis'): void {
  meshProgress.now = { phase, done, total, for: why };
}

export function endMeshProgress(): void {
  meshProgress.now = null;
}

/**
 * Resolves after the page has drawn a frame: a bare `setTimeout(0)` can run before any paint. A
 * hidden tab draws none, so it also resolves after 50 ms.
 */
export function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return new Promise((r) => setTimeout(r, 0));
  return new Promise((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 50);
  });
}
