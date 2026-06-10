// Cold-Formed Steel — AISI S100 wrapper

import { isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'cfs';
export const CODE_LABEL = 'AISI S100 (CFS)';

export function isAvailable(): boolean {
  return isDesignCheckAvailable('cfsMembers');
}
