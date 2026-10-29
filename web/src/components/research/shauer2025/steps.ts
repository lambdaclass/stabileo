/** Mirror Solver::advance: time starts at zero and the next dt must not exceed totalTime.
 * Do not divide or add an epsilon: repeated floating-point addition sets the stopping point. */
export function solverStepCount(dt: number, totalTime: number): number {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(totalTime) || totalTime < 0) {
    throw new RangeError('Invalid load-step controls');
  }
  let time = 0;
  let count = 0;
  while (time + dt <= totalTime) {
    if (time + dt === time) throw new RangeError('Load step cannot advance time');
    time += dt;
    count++;
  }
  return count;
}
