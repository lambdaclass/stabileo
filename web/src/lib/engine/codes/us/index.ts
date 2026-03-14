// United States — ACI 318 + AISC 360 design code wrappers
// These use the Rust/WASM engine for actual computation

import { checkSteelMembers, checkRcMembers, isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'aci-aisc';
export const CODE_LABEL = 'ACI 318 / AISC 360';

/** Check if WASM functions for ACI/AISC are compiled and available */
export function isAvailable(): boolean {
  return isDesignCheckAvailable('rcMembers') || isDesignCheckAvailable('steelMembers');
}

/** ACI 318 reinforced concrete member checks */
export function verifyRcMembers(input: any): any | null {
  return checkRcMembers(input);
}

/** AISC 360 LRFD steel member checks */
export function verifySteelMembers(input: any): any | null {
  return checkSteelMembers(input);
}
