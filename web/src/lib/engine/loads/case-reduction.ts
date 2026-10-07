/**
 * The reduction of an imposed load typed by hand into a case (`LoadCase.reduction`), worked out
 * by the bound loads code (`ImposedLoadCode.reduce`) from what the code needs to know:
 *
 *   Lo and the row's exclusions   from the occupancy of Table 4.1 the user names: §4.7.3 (Lo over
 *                                 5 kN/m²), §4.7.4 (passenger garages), §4.7.5 (public assembly)
 *                                 and Table 4.1 note (a) are read off the row. The case's details
 *                                 gave the code Lo = 1 and every exclusion false, so none of them
 *                                 ever applied: an 80 m² interior beam of a 7,5 kN/m² machine
 *                                 room came out at 0,611 instead of 1.
 *   only L                        §4.7 reduces the imposed load of floors. A roof's (Lr) follows
 *                                 §4.8, and a crane's or a vehicle's load (Cr, Tr) is not reduced
 *                                 by tributary area; it was offered for all four.
 *   not twice                     loads the generator wrote with its reduction on are reduced
 *                                 already (`load-plan.ts`, `applyLiveReduction`); a case holding
 *                                 them is not reduced again.
 *
 * Pure: the code, the case's loads and the generator's settings come in.
 */
import type { OccupancyEntry, ElementKind } from '../../codes/cirsoc101/live-loads';
import type { ImposedLoadCode } from '../../codes/families/load-codes';
import type { EngineMessage } from '../../codes/message';

/** Why a case's reduction is not offered. */
export type CaseReductionRefusal =
  /** Not a floor imposed load (L). */
  | 'notImposed'
  /** It holds loads the generator reduced already. */
  | 'generatorReduced';

/** Whether the case's loads can be reduced by hand, or why not. */
export function caseReductionRefusal(type: string | undefined, generatorReduced: boolean): CaseReductionRefusal | null {
  if ((type ?? '').toUpperCase() !== 'L') return 'notImposed';
  if (generatorReduced) return 'generatorReduced';
  return null;
}

/**
 * Whether a case holds loads the generator wrote with its reduction on: loads it marked
 * (`generatedBy`), under a loads role whose settings do not turn the reduction off (it is on by
 * default, `auto-loads-memory.ts`).
 */
export function holdsGeneratorReducedLoads(
  loads: ReadonlyArray<{ data: { caseId?: number; generatedBy?: string } }>,
  caseId: number,
  loadsSettings: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (loadsSettings?.applyLiveReduction === false) return false;
  return loads.some((l) => (l.data.caseId ?? 1) === caseId && !!l.data.generatedBy);
}

export interface CaseReductionInput {
  /** The row of Table 4.1 the loads are: Lo and its exclusions. */
  occupancy: OccupancyEntry | undefined;
  tributaryAreaM2: number;
  elementKind: ElementKind;
  floorsSupported: number;
}

/** The ratio the case's loads are multiplied by, and why; null without a usable Lo or area. */
export function caseReduction(code: ImposedLoadCode, input: CaseReductionInput): { ratio: number; lo: number; reason: EngineMessage } | null {
  const lo = input.occupancy?.uniformKNm2;
  if (!input.occupancy || lo === null || lo === undefined || !(lo > 0) || !(input.tributaryAreaM2 > 0)) return null;
  const floors = Math.max(1, Math.round(input.floorsSupported));
  const r = code.reduce({
    loKNm2: lo, tributaryAreaM2: input.tributaryAreaM2, elementKind: input.elementKind, floorsSupported: floors,
    passengerGarage: input.occupancy.assemblyKind === 'passengerGarage',
    publicAssembly: input.occupancy.assemblyKind === 'publicAssembly',
    noReduction: input.occupancy.noReduction === true,
  });
  return { ratio: r.lKNm2 / lo, lo, reason: r.reason };
}
