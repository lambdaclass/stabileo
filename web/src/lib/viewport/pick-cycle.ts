/**
 * Clicking again on the same spot steps to the next thing under the pointer.
 *
 * A click takes the most specific thing there: a node before the members
 * through it, the nearest member before the others. That leaves a member
 * drawn over another one, or a short member hidden under a joint, out of
 * reach without zooming in. Asked again with the same candidates at the same
 * spot, the cycle hands back the next one, and wraps.
 *
 * "Again" means the click just after, on what that click took: within a
 * couple of seconds, and with that thing still selected. Without those, a
 * click on the node selected a minute ago, or after Esc emptied the
 * selection, stepped past it to the member beneath.
 *
 * A double click never steps. Its first click may have (it is a click on the
 * same spot); its second puts back what was there before, so the double click
 * opens what the reader double-clicked. When that is not the first thing
 * there — the reader stepped to it before double-clicking — `steppedTo` tells
 * the double-click handler, which otherwise opens the most specific thing
 * there, as it always has.
 *
 * Shared by both viewports. Pure apart from its own memory of the last click.
 */

export interface PickTarget {
  kind: 'node' | 'element' | 'load';
  id: number;
}

/** How far the pointer may move and still be "the same spot", in pixels. */
export const REPICK_PX = 4;
/** How long after a click the next one on the same spot still steps, in milliseconds. */
export const REPICK_MS = 2000;

export interface PickCycleOptions {
  /** Whether a target is selected now; a cycle whose pick is no longer selected starts over. */
  isSelected?: (t: PickTarget) => boolean;
  /** The clock, in milliseconds. */
  now?: () => number;
}

export interface PickCycle {
  /**
   * The target this click selects. `onStep` is told when a repeated click moved
   * past the first candidate, with the position (1-based) and the count.
   */
  pick(targets: readonly PickTarget[], px: number, py: number, onStep?: (at: number, of: number) => void, clickCount?: number): PickTarget | null;
  /**
   * What the clicks on this spot stepped to, past the first candidate, while it
   * is still selected: what a double click there opens. Null when they did not step.
   */
  steppedTo(px: number, py: number): PickTarget | null;
  /** Forget the last click (the model changed, the view moved). */
  reset(): void;
}

export function createPickCycle(opts: PickCycleOptions = {}): PickCycle {
  const now = opts.now ?? (() => Date.now());
  let last: { px: number; py: number; key: string; targets: readonly PickTarget[]; at: number; before: number; time: number } | null = null;
  const near = (px: number, py: number) => last !== null && Math.hypot(px - last.px, py - last.py) <= REPICK_PX;
  return {
    pick(targets, px, py, onStep, clickCount = 1) {
      if (!targets.length) { last = null; return null; }
      const key = targets.map((p) => `${p.kind}${p.id}`).join(',');
      const time = now();
      const same = last !== null && last.key === key && near(px, py);
      // The second click of a double click: back to what its first click found there.
      if (same && clickCount > 1) {
        last!.at = last!.before;
        last!.time = time;
        return targets[last!.at]!;
      }
      const again = same && time - last!.time <= REPICK_MS && (opts.isSelected?.(last!.targets[last!.at]!) ?? true);
      const at = again ? (last!.at + 1) % targets.length : 0;
      last = { px, py, key, targets, at, before: again ? last!.at : at, time };
      if (again && targets.length > 1) onStep?.(at + 1, targets.length);
      return targets[at]!;
    },
    steppedTo(px, py) {
      if (!last || last.at === 0 || !near(px, py) || now() - last.time > REPICK_MS) return null;
      const t = last.targets[last.at]!;
      return (opts.isSelected?.(t) ?? true) ? t : null;
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
