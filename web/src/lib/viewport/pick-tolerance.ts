/**
 * How near the pointer has to be, in the 2D view, measured on the screen.
 *
 * A node or member is as easy to hit zoomed out on a long bridge as zoomed in
 * on a small part. The tolerances were metres (0.3, 0.4 and 0.5), which at
 * the old default of 50 px/m are these same pixels, so nothing changes at
 * that zoom; at 50 000 px/m every click within half a metre took the nearest
 * node, and at 0.5 px/m nothing was ever close enough to split.
 */

export const PICK_PX = { tight: 15, mid: 20, loose: 25 } as const;

/** A distance in screen pixels, in metres at this zoom (px/m). */
export function pickTolAt(zoom: number, px: number): number {
  return px / Math.max(zoom, 1e-9);
}

/**
 * The node tool's reaches, in metres at this zoom: the existing node a click
 * lands on (or drags), the member midpoint it snaps to, and the member an
 * auto-split takes. They were the last of the metre tolerances.
 */
export function nodeToolTolerances(zoom: number): { node: number; midpoint: number; split: number } {
  return { node: pickTolAt(zoom, PICK_PX.loose), midpoint: pickTolAt(zoom, PICK_PX.mid), split: pickTolAt(zoom, PICK_PX.tight) };
}
