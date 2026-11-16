let count = $state(0);
let lastOk = $state(false);

export const solveSignal = {
  get count() { return count; },
  get lastOk() { return lastOk; },
  bump(ok: boolean): void {
    lastOk = ok;
    count += 1;
  },
};
