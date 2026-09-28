/**
 * Why a 3-D solve could not run: the mechanism, named.
 *
 * A structure that is a mechanism used to report "singular matrix" and nothing else, while the
 * engine can say which nodes move and in which directions nothing holds them
 * (`engine/kinematic-3d.ts`, the rank analysis of K_ff). This asks it, when a solve fails, and
 * keeps the answer for the results panel to show — with the nodes one click from selected.
 */
import { modelStore } from './model.svelte';
import { analyzeKinematics3D, type KinematicResult3D } from '../engine/kinematic-3d';

let report = $state<KinematicResult3D | null>(null);
let forVersion = $state<number | null>(null);

export const instability = {
  get report() { return report; },
  /** The report, if it still describes the model as it is. */
  get current() { return report && forVersion === modelStore.modelVersion ? report : null; },

  /** After a failed solve: ask the engine whether the model is a mechanism, and keep what it says. */
  explain(includeSelfWeight: boolean, leftHand: boolean): KinematicResult3D | null {
    report = null;
    const input = modelStore.buildSolverInput3D(includeSelfWeight, leftHand, { expandMemberOffsets: false });
    if (!input) return null;
    let r: KinematicResult3D;
    try {
      r = analyzeKinematics3D(input);
    } catch {
      return null;
    }
    if (r.isSolvable && r.mechanismModes === 0 && r.unconstrainedDofs.length === 0) return null;
    report = r;
    forVersion = modelStore.modelVersion;
    return r;
  },

  clear() { report = null; forVersion = null; },
};
