let open = $state(false);

export const feedbackDialog = {
  get open() { return open; },
  set open(v: boolean) { open = v; },
};
