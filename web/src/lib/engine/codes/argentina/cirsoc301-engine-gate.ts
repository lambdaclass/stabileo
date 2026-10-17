/**
 * The engine has the last word on a CIRSOC 301 pass.
 *
 * `cirsoc301.ts` is an adapter over the engine's checker, but the app still builds the input
 * (the section's constants, Cb from the moment diagram, the end connection's Ae, the axis cross)
 * and decides what to show from the result (the worse of the compression and tension runs, the
 * optimiser's target). This gate takes the exact input the app checked and every demand set it
 * checked it under, and asks the engine's CERTIFIED check (`certify_cirsoc301_members`: the same
 * formulas in outward-rounded interval arithmetic, docs/verification/CERTIFY.md) whether the
 * member passes. A pass stands only if the certified utilization is provably below 1.
 *
 * A pass the engine does not confirm becomes a FAILURE with `VERIF_ENGINE_DISAGREES` and the
 * engine's bounds. An engine that cannot be asked gives `VERIF_ENGINE_UNAVAILABLE`, also a
 * failure — never the unchecked verdict by default. Mirrors `cirsoc201-engine-gate.ts`.
 */
import type { SolverDiagnostic } from '../../types';
import type { SteelDesignParams, SteelVerification } from './cirsoc301';
import { engineCertifyMembers, type EngineForces } from './cirsoc301-kernel';

export interface SteelEngineRecheck {
  /** The certified check ran and enclosed the utilization. */
  certified: boolean;
  /** The exact utilization lies in [lower, upper]. */
  utilizationLower?: number;
  utilizationUpper?: number;
  /** Certified to pass: upper < 1. */
  certifiedOk: boolean;
  governingCheck?: string;
  /** Why it could not be certified (engine message key or reason). */
  reason?: string;
  /** The app's pass was not confirmed: the verification was turned into a failure. */
  disagrees: boolean;
  /** The engine could not be asked. */
  unavailable: boolean;
}

/** The demand sets of a steel member check, + compression as the checker reads them. */
export type SteelDemandSet = Omit<EngineForces, 'elementId'>;

/**
 * Re-check one verification. Returns it with statuses lowered where the engine does not confirm
 * a pass, and `engineRecheck` attached. Pure apart from the engine call.
 */
export function engineGateSteel(
  v: SteelVerification,
  params: SteelDesignParams,
  demands: readonly SteelDemandSet[],
): SteelVerification & { engineRecheck: SteelEngineRecheck } {
  const id = v.elementId;
  const res = engineCertifyMembers(
    [{ ...params, elementId: id }],
    demands.map((d) => ({ forces: { elementId: id, ...d } })),
  );
  const c = res?.[0];
  const rc: SteelEngineRecheck = {
    certified: !!c?.certified,
    certifiedOk: !!c?.certifiedOk,
    disagrees: false,
    unavailable: !res,
    ...(c?.certified ? { utilizationLower: c.utilizationLower, utilizationUpper: c.utilizationUpper, governingCheck: c.governingCheck } : {}),
    ...(c && !c.certified && c.reason ? { reason: c.reason } : {}),
  };
  const passed = v.overallStatus !== 'fail';
  if (!passed || rc.certifiedOk) return { ...v, engineRecheck: rc };

  // A pass the engine did not confirm: every passing check becomes a failure.
  rc.disagrees = !rc.unavailable;
  const lower = <T extends { status: string }>(x: T | undefined): T | undefined => (x && x.status !== 'fail' ? { ...x, status: 'fail' } : x);
  const diag: SolverDiagnostic = rc.unavailable
    ? { severity: 'error', code: 'VERIF_ENGINE_UNAVAILABLE', message: 'diag.verifEngineUnavailable', source: 'verification', elementIds: [id] }
    : {
      severity: 'error', code: 'VERIF_ENGINE_DISAGREES', message: 'diag.verifEngineDisagrees', source: 'verification', elementIds: [id],
      details: {
        checks: rc.governingCheck ?? 'all',
        ...(rc.utilizationUpper !== undefined ? { utilizationUpper: rc.utilizationUpper } : {}),
        ...(rc.reason ? { reason: rc.reason } : {}),
      },
    };
  return {
    ...v,
    flexureZ: lower(v.flexureZ)!,
    shear: lower(v.shear)!,
    tension: lower(v.tension),
    compression: lower(v.compression),
    flexureY: lower(v.flexureY),
    interaction: lower(v.interaction),
    overallStatus: 'fail',
    diagnostics: [...(v.diagnostics ?? []), diag],
    engineRecheck: rc,
  };
}
