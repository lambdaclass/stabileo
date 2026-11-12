/** Sums pointer movement and applies it once per animation frame, so a fast drag redraws at most once per frame. */
export function frameCoalescer(apply: (dx: number, dy: number) => void) {
  let dx = 0, dy = 0, frame = 0;
  const run = () => {
    frame = 0;
    const x = dx, y = dy;
    dx = 0; dy = 0;
    if (x !== 0 || y !== 0) apply(x, y);
  };
  return {
    add(x: number, y: number) {
      dx += x; dy += y;
      if (!frame) frame = requestAnimationFrame(run);
    },
    flush() {
      if (frame) cancelAnimationFrame(frame);
      run();
    },
    cancel() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; dx = 0; dy = 0;
    },
  };
}
