/**
 * A time-history result, and the instant of it on screen.
 *
 * The engine returns every node's full response — twelve series per node, one sample per step —
 * and the panel used to keep one line of peaks and discard the rest. This holds the result and a
 * step index, and produces the displacement field at that step in the shape the 3D deformed-shape
 * renderer already draws.
 *
 * Its own store, not a slot in `resultsStore`: scrubbing is not a solve, and `setResults3D` resets
 * the deformed scale and counts as a structural solve. Nothing here touches the static results.
 */

import type { Displacement3D } from '../engine/types-3d';

export interface NodeTimeHistory3D {
  nodeId: number;
  ux: number[]; uy: number[]; uz: number[];
  rx: number[]; ry: number[]; rz: number[];
}

export interface TimeHistoryResult3D {
  timeSteps: number[];
  nodeHistories: NodeTimeHistory3D[];
  peakDisplacements: Array<{ nodeId: number; ux: number; uy: number; uz: number }>;
  peakReactions: Array<{ nodeId: number; fx?: number; fy?: number; fz?: number }>;
  nSteps: number;
  method: string;
}

function createTimeHistoryView() {
  // Raw: nodes × 12 series × steps is too much to proxy, and it is only ever replaced whole.
  let result = $state.raw<TimeHistoryResult3D | null>(null);
  /** The model version the result describes; a scrub over an edited model would be a lie. */
  let modelVersion = $state<number | null>(null);
  let step = $state(0);
  /** Whether the viewport shows the frame. Off by default: a result is not a view. */
  let shown = $state(false);
  let playing = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * Largest translation any node reaches over the record, m. What the view scales against.
   *
   * Computed when the result is set rather than derived: the result only ever changes through
   * `set` and `clear`, and a module-level derived is not guaranteed to recompute outside a
   * component.
   */
  let peak = $state(0);
  function peakOf(r: TimeHistoryResult3D): number {
    let m = 0;
    for (const h of r.nodeHistories) {
      for (let k = 0; k < h.ux.length; k++) m = Math.max(m, Math.hypot(h.ux[k]!, h.uy[k]!, h.uz[k]!));
    }
    return m;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    playing = false;
  }

  return {
    get result() { return result; },
    get modelVersion() { return modelVersion; },
    get step() { return step; },
    get shown() { return shown; },
    get playing() { return playing; },
    get peak() { return peak; },
    get lastStep() { return Math.max(0, (result?.timeSteps.length ?? 1) - 1); },
    get time() { return result?.timeSteps[step] ?? 0; },

    set(r: TimeHistoryResult3D, version: number) {
      stop();
      result = r;
      peak = peakOf(r);
      modelVersion = version;
      step = 0;
    },
    clear() {
      stop();
      result = null;
      peak = 0;
      modelVersion = null;
      step = 0;
      shown = false;
    },
    setStep(k: number) {
      step = Math.max(0, Math.min(this.lastStep, Math.round(k)));
    },
    setShown(v: boolean) {
      shown = v;
      if (!v) stop();
    },
    /** Play from the current step at roughly real time, capped so a long record stays watchable. */
    play() {
      if (!result || playing) return;
      if (step >= this.lastStep) step = 0;
      shown = true;
      playing = true;
      const dt = result.timeSteps.length > 1 ? result.timeSteps[1]! - result.timeSteps[0]! : 0.01;
      const frameMs = 33;
      const stride = Math.max(1, Math.round(frameMs / 1000 / dt));
      timer = setInterval(() => {
        if (step >= this.lastStep) { stop(); return; }
        step = Math.min(this.lastStep, step + stride);
      }, frameMs);
    },
    stop,

    /** The displacement field at the current step, rotations included, as the renderer reads it. */
    frame(): Displacement3D[] | null {
      if (!result) return null;
      const k = step;
      return result.nodeHistories.map((h) => ({
        nodeId: h.nodeId,
        ux: h.ux[k] ?? 0, uy: h.uy[k] ?? 0, uz: h.uz[k] ?? 0,
        rx: h.rx[k] ?? 0, ry: h.ry[k] ?? 0, rz: h.rz[k] ?? 0,
      }));
    },

    /** One node's history, for the chart. */
    historyOf(nodeId: number): NodeTimeHistory3D | undefined {
      return result?.nodeHistories.find((h) => h.nodeId === nodeId);
    },
  };
}

export const timeHistoryView = createTimeHistoryView();
