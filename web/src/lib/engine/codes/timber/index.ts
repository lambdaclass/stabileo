// Timber — NDS (National Design Specification) wrapper

import { checkTimberMembers, isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'nds';
export const CODE_LABEL = 'NDS (Timber)';

export function isAvailable(): boolean {
  return isDesignCheckAvailable('timberMembers');
}

/** NDS timber member checks */
export function verifyTimberMembers(input: any): any | null {
  return checkTimberMembers(input);
}
