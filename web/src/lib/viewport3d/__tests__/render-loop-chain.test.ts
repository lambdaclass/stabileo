/**
 * The 3D viewport's render loop stays ONE chain of frames.
 *
 * `Viewport3D.renderOnce` asks for its next frame in two places: at its end when
 * rendering must continue (a held navigation key, damping, an animation), and
 * through `invalidate()` when `controls.update()` fires `change` mid-frame. When
 * both went straight to `requestAnimationFrame`, every continuing frame that moved
 * the camera queued two successors, and a held arrow key doubled the number of
 * chains on every tick: viewport-perf.spec counted 8192 renders in one
 * keyboard-orbit window on a 24-member model. Both requests now go through one
 * `createFrameCoalescer`; this pins the property the loop relies on, with the
 * loop's own shape reproduced.
 */
import { describe, it, expect } from 'vitest';
import { createFrameCoalescer } from '../frame-coalesce';

function harness() {
  const queue: Array<() => void> = [];
  let renders = 0;
  let needsRender = true;
  const continuous = { on: true };
  const frame = createFrameCoalescer<void>(
    () => renderOnce(),
    (cb) => { queue.push(cb); return queue.length; },
    () => { queue.length = 0; },
  );
  function invalidate() { needsRender = true; frame.schedule(); }
  function renderOnce() {
    if (!needsRender && !continuous.on) return;
    needsRender = false;
    // controls.update() moved the camera → `change` → invalidate()
    if (continuous.on) invalidate();
    renders++;
    if (continuous.on || needsRender) frame.schedule();
  }
  /** Run every callback queued for the current tick, as the browser does. */
  function tick() { const now = queue.splice(0); for (const cb of now) cb(); }
  frame.schedule();
  return { queue, tick, continuous, invalidate, renders: () => renders };
}

describe('the 3D render loop', () => {
  it('renders once per tick while a navigation key is held, however long', () => {
    const h = harness();
    for (let i = 0; i < 20; i++) {
      expect(h.queue.length).toBe(1);
      h.tick();
    }
    // One render per tick. Two schedulers made this 2^20 - 1.
    expect(h.renders()).toBe(20);
  });

  it('stops when nothing needs a frame, and restarts as one chain', () => {
    const h = harness();
    h.tick();
    h.continuous.on = false;
    h.tick(); // the last continuing frame: renders, queues nothing more
    h.tick();
    expect(h.queue.length).toBe(0);
    const before = h.renders();
    h.invalidate(); h.invalidate(); h.invalidate();
    expect(h.queue.length).toBe(1);
    h.tick();
    expect(h.renders()).toBe(before + 1);
    expect(h.queue.length).toBe(0);
  });
});
