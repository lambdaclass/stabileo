/**
 * Work that follows the pointer, done once a frame on the latest event.
 *
 * Mouse moves arrive faster than frames on a fast mouse or a high-rate
 * pointer; anything that raycasts or rebuilds a geometry on each of them does
 * the work several times for one picture. The hover raycast already waits
 * for the frame this way; the member-drawing snap now does too.
 */
export interface FrameCoalescer<T> {
  /** Run on this value at the next frame; a later call before then replaces it. */
  schedule(value: T): void;
  /** Drop what is waiting. */
  cancel(): void;
}

export function createFrameCoalescer<T>(
  run: (latest: T) => void,
  request: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
  cancelFrame: (id: number) => void = (id) => cancelAnimationFrame(id),
): FrameCoalescer<T> {
  let pending: { value: T } | null = null;
  let id: number | null = null;
  return {
    schedule(value) {
      pending = { value };
      if (id !== null) return;
      id = request(() => {
        id = null;
        const p = pending;
        pending = null;
        if (p) run(p.value);
      });
    },
    cancel() {
      if (id !== null) cancelFrame(id);
      id = null;
      pending = null;
    },
  };
}
