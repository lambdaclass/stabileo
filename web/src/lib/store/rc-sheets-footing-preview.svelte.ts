import type { FoundationSystem } from '../rc-sheets/footing-types';

/** The foundation layout the sheets show while none is adopted: the one a footing adopted then belongs to. */
export const footingPreview = $state<{ system: FoundationSystem }>({ system: 'auto' });
