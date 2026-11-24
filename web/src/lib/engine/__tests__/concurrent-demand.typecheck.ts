import type { TorsionInput } from '../../codes/cirsoc201/torsion';
import type { ConcurrentDemand, ConcurrentSectionDemand } from '../concurrent-demand';
import type { ElementDesignDemands } from '../station-design-forces';
import type { VerificationInput, verifyElement, checkColumn, checkBiaxial, checkTorsion } from '../codes/argentina/cirsoc201';
import type { checkSteelInteraction, verifySteelElement, SteelVerificationInput } from '../codes/argentina/cirsoc301';

type Assert<T extends true> = T;
type Refuses<T, U> = T extends U ? false : true;
export const envelopeCannotBeConcurrent: Assert<Refuses<ElementDesignDemands, ConcurrentDemand>> = true;
export const scalarCaseCannotBeVerified: Assert<Refuses<VerificationInput, Parameters<typeof verifyElement>[0]>> = true;
export const envelopeCannotReachColumn: Assert<Refuses<ElementDesignDemands, Parameters<typeof checkColumn>[1]>> = true;
export const envelopeCannotReachBiaxial: Assert<Refuses<ElementDesignDemands, Parameters<typeof checkBiaxial>[1]>> = true;
export const envelopeCannotReachTorsion: Assert<Refuses<ElementDesignDemands, Parameters<typeof checkTorsion>[1]>> = true;
export const envelopeCannotReachSteel: Assert<Refuses<ElementDesignDemands, Parameters<typeof checkSteelInteraction>[1]>> = true;
export const stationForcesNeedProvenance: Assert<Refuses<ConcurrentDemand['forces'], ConcurrentSectionDemand>> = true;
export const envelopeCannotReachSteelVerifier: Assert<Refuses<SteelVerificationInput, Parameters<typeof verifySteelElement>[0]>> = true;

export const scalarTorsionCannotReachSection: Assert<Refuses<{ Vu: number; Tu: number }, TorsionInput['demand']>> = true;
export const partialTorsionCannotReachSection: Assert<Refuses<Pick<ConcurrentSectionDemand, 'Vu' | 'Tu'>, TorsionInput['demand']>> = true;
export const numericSecondaryDepthIsRefused: Assert<Refuses<number, TorsionInput['dSecondary']>> = true;
import type { CompleteDemandSet, ScopedDemand, DemandScope, DemandInventory } from '../complete-demand-set';
import type { CompleteMemberContexts } from '../member-demand-gate';
import type { MemberContext } from '../design/other-codes/types';
export const rawRowsCannotBeComplete: Assert<Refuses<ScopedDemand[], CompleteDemandSet<ScopedDemand>>> = true;
export const rawContextsCannotBeComplete: Assert<Refuses<MemberContext[], CompleteMemberContexts>> = true;
export const forgedSetCannotBeComplete: Assert<Refuses<{ values: ScopedDemand[] }, CompleteDemandSet<ScopedDemand>>> = true;

export const cartesianScopeCannotReachGate: Assert<Refuses<{ combinations: { comboId: number }[]; members: { elementId: number; stationTs: number[] }[] }, DemandScope>> = true;
export const rawTuplesCannotUseVerifiedConversion: Assert<Refuses<ScopedDemand[], Parameters<typeof ConcurrentDemand.fromCompleteTuples>[0]>> = true;
export const forgedInventoryCannotBeDeclared: Assert<Refuses<{ scope: DemandScope }, DemandInventory>> = true;
