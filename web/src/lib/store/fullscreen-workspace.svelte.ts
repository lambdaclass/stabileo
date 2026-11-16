let open = $state(0);

/** Whether a workspace that covers the whole window (the reinforcement sheets) is on screen. */
export const fullScreenWorkspace = {
  get open() { return open > 0; },
  enter(): () => void {
    open++;
    let left = false;
    return () => { if (!left) { left = true; open--; } };
  },
};
