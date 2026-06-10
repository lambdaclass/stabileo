// Timber — NDS (National Design Specification) wrapper

import { isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'nds';
export const CODE_LABEL = 'NDS (Timber)';

export function isAvailable(): boolean {
  return isDesignCheckAvailable('timberMembers');
}
