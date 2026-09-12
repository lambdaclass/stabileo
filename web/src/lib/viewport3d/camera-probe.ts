/**
 * A way to ask the 3D viewport where its camera is.
 *
 * ── Why this exists rather than a window global ────────────────────
 *
 * Views and orbiting are decided by three vectors and none of them reaches
 * the DOM, so a test that wants to know which way "up" ended up has to read
 * an axis gizmo out of a screenshot — which is guessing with extra steps.
 *
 * The obvious fix, hanging a `__stabileo…` function off `window` from inside
 * the viewport, is the one thing that must not happen: `e2e-hook-gating`
 * forbids that name anywhere in a production bundle, and it is right to. The
 * viewport is always shipped; only the hooks module is behind the build flag.
 *
 * So the viewport publishes into this tiny registry — no reserved names, no
 * globals, nothing to strip — and the hooks module, which only exists under
 * `VITE_E2E`, is the one that exposes it.
 */

export interface CameraSnapshot {
  up: [number, number, number];
  pos: [number, number, number];
  target: [number, number, number];
  /** Angle from the world up axis, in degrees. 0 is straight overhead. */
  polarDeg: number;
}

let probe: (() => CameraSnapshot | null) | null = null;

/** Called by the 3D viewport while it is mounted, and with null when it is not. */
export function setCameraProbe(fn: (() => CameraSnapshot | null) | null): void {
  probe = fn;
}

/** Null when no 3D viewport is mounted, which is most of Basic's life. */
export function readCamera(): CameraSnapshot | null {
  return probe ? probe() : null;
}
