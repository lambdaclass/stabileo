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
import { engineMember, type SteelDesignParams, type SteelVerification } from './cirsoc301';
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
  /**
   * A screening run (a search over candidates): not gated, so not to be shown as a pass. The
   * search confirms the candidate it picks with a gated run.
   */
  screened?: boolean;
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
  return engineGateSteelCases(v, [{ params, demands }]);
}

/**
 * The same, when the verdict was read under more than one input: each case is the exact input
 * of one reading (a Lb per flange, the fabrication or the load height taken each way when the
 * member does not state it) with the demands read under it. The pass stands only if every case
 * is certified to pass; the bounds are the largest over the cases.
 */
export function engineGateSteelCases(
  v: SteelVerification,
  cases: ReadonlyArray<{ params: SteelDesignParams; demands: readonly SteelDemandSet[] }>,
): SteelVerification & { engineRecheck: SteelEngineRecheck } {
  const id = v.elementId;
  const res = engineCertifyMembers(
    cases.map((k, i) => engineMember(i + 1, k.params)),
    cases.flatMap((k, i) => k.demands.map((d) => ({ forces: { elementId: i + 1, ...d } }))),
  );
  const per = res ? cases.map((_, i) => res.find((r) => Number(r.elementId) === i + 1)) : [];
  const all = res !== null && per.every((c) => !!c);
  const certified = all && per.every((c) => c!.certified);
  const top = certified ? per.reduce((a, c) => (c!.utilizationUpper > a!.utilizationUpper ? c : a)) : undefined;
  const why = per.find((c) => c && !c.certified && c.reason);
  const rc: SteelEngineRecheck = {
    certified,
    certifiedOk: certified && per.every((c) => c!.certifiedOk),
    disagrees: false,
    unavailable: !res,
    ...(certified && top ? {
      utilizationLower: Math.max(...per.map((c) => c!.utilizationLower)),
      utilizationUpper: top.utilizationUpper, governingCheck: top.governingCheck,
    } : {}),
    ...(why?.reason ? { reason: why.reason } : {}),
  };
  // Only a pass is confirmed or withdrawn: a failure stands, and a held verdict (a limit state not
  // evaluated, a datum undeclared) has nothing to confirm and stays held.
  const passed = v.overallStatus === 'ok' || v.overallStatus === 'warn';
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
