// Masonry — TMS 402/602 wrapper

import { checkMasonryMembers, isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'masonry';
export const CODE_LABEL = 'TMS 402 (Masonry)';

export function isAvailable(): boolean {
  return isDesignCheckAvailable('masonryMembers');
}

/** Masonry member checks */
export function verifyMasonryMembers(input: any): any | null {
  return checkMasonryMembers(input);
}
