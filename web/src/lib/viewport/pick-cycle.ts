/**
 * Clicking again on the same spot steps to the next thing under the pointer.
 *
 * A click takes the most specific thing there: a node before the members
 * through it, the nearest member before the others. That leaves a member
 * drawn over another one, or a short member hidden under a joint, out of
 * reach without zooming in. Asked again with the same candidates at the same
 * spot, the cycle hands back the next one, and wraps.
 *
 * Shared by both viewports. Pure apart from its own memory of the last click.
 */

export interface PickTarget {
  kind: 'node' | 'element';
  id: number;
}

/** How far the pointer may move and still be "the same spot", in pixels. */
export const REPICK_PX = 4;

export interface PickCycle {
  /**
   * The target this click selects. `onStep` is told when a repeated click moved
   * past the first candidate, with the position (1-based) and the count.
   */
  pick(targets: readonly PickTarget[], px: number, py: number, onStep?: (at: number, of: number) => void): PickTarget | null;
  /** Forget the last click (the model changed, the view moved). */
  reset(): void;
}

export function createPickCycle(): PickCycle {
  let last: { px: number; py: number; key: string; at: number } | null = null;
  return {
    pick(targets, px, py, onStep) {
      if (!targets.length) { last = null; return null; }
      const key = targets.map((p) => `${p.kind}${p.id}`).join(',');
      const again = last !== null && last.key === key && Math.hypot(px - last.px, py - last.py) <= REPICK_PX;
      const at = again ? (last!.at + 1) % targets.length : 0;
      last = { px, py, key, at };
      if (again && targets.length > 1) onStep?.(at + 1, targets.length);
      return targets[at]!;
    },
    reset() { last = null; },
  };
}

/** Candidates in order, each once: what the ray hit first, then what lies near on screen. */
export function mergeTargets(...lists: readonly PickTarget[][]): PickTarget[] {
  const seen = new Set<string>();
  const out: PickTarget[] = [];
  for (const list of lists) {
    for (const p of list) {
      const k = `${p.kind}${p.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}
