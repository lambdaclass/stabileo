import { untrack } from 'svelte';

let open = $state(0);

/** Whether a workspace that covers the whole window (the reinforcement sheets) is on screen. */
export const fullScreenWorkspace = {
  get open() { return open > 0; },
  /** Called from an effect: it must not read `open`, or the effect would re-run on its own write. */
  enter(): () => void {
    untrack(() => open++);
    let left = false;
    return () => { if (!left) { left = true; untrack(() => open--); } };
  },
};
