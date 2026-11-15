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
