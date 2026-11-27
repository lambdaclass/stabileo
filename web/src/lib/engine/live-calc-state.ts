import { isBasicWorkspace, type AnalysisMode } from '../utils/workspace';

let inFlight = 0;

/** Whether an edit in this mode is followed by a live re-solve (App.svelte schedules it). */
export function liveCalcFollowsEdits(liveCalc: boolean, mode: AnalysisMode): boolean {
  return liveCalc && isBasicWorkspace(mode);
}

export function liveSolveBusy(): boolean {
  return inFlight > 0;
}

export async function trackLiveSolve<T>(run: () => Promise<T>): Promise<T> {
  inFlight++;
  try {
    return await run();
  } finally {
    inFlight--;
  }
}
