// Cold-Formed Steel — AISI S100 wrapper

import { checkCfsMembers, isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'cfs';
export const CODE_LABEL = 'AISI S100 (CFS)';

export function isAvailable(): boolean {
  return isDesignCheckAvailable('cfsMembers');
}

/** Cold-formed steel member checks */
export function verifyCfsMembers(input: any): any | null {
  return checkCfsMembers(input);
}
