// Masonry — TMS 402/602 wrapper

import { isDesignCheckAvailable } from '../../wasm-solver';

export const CODE_ID = 'masonry';
export const CODE_LABEL = 'TMS 402 (Masonry)';

export function isAvailable(): boolean {
  return isDesignCheckAvailable('masonryMembers');
}
