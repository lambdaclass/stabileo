/**
 * A steel member's utilisation under CIRSOC 301: the worst demand/capacity among the checks that
 * ran (tension or compression, flexure about each axis, shear on each axis, the H.1 interaction).
 * What the design table and the 3D view show beside the concrete members' ratios.
 *
 * A number, not a verdict: a member whose checks left a limit state out reads `held`
 * (`SteelVerification.overallStatus`) whatever this says, and `steelMemberStatus` is what a
 * surface colours by.
 */
import type { SteelVerification } from '../codes/argentina/cirsoc301';

export function steelUtilization(v: SteelVerification): number {
  const ratios = [v.tension?.ratio, v.compression?.ratio, v.flexureZ?.ratio, v.flexureY?.ratio, v.shear?.ratio, v.shearWeak?.ratio, v.interaction?.ratio]
    .filter((r): r is number => typeof r === 'number');
  return ratios.length ? Math.max(...ratios) : 0;
}

/**
 * The member's local status from its CIRSOC 301 checks, in the words every design surface reads:
 * its verdict (`overallStatus`), with `held` (a limit state not evaluated, or a verdict that
 * depends on an undeclared datum) as `unavailable`, never as a pass or a failure.
 */
export function steelMemberStatus(v: SteelVerification): 'ok' | 'warn' | 'fail' | 'unavailable' {
  return v.overallStatus === 'held' ? 'unavailable' : v.overallStatus;
}
