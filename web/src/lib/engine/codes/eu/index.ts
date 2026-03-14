// European Union — Eurocode 2 + Eurocode 3 design code wrappers

import { checkEc2Members, checkEc3Members, isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'eurocode';
export const CODE_LABEL = 'Eurocode 2/3';

export function isAvailable(): boolean {
  return isDesignCheckAvailable('ec2Members') || isDesignCheckAvailable('ec3Members');
}

/** Eurocode 2 reinforced concrete member checks */
export function verifyRcMembers(input: any): any | null {
  return checkEc2Members(input);
}

/** Eurocode 3 steel member checks */
export function verifySteelMembers(input: any): any | null {
  return checkEc3Members(input);
}
