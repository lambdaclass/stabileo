import { modelStore } from './model.svelte';
import type { FoundationSystem } from '../rc-sheets/footing-types';

let pilesOpen = $state(false);
let picked = $state<{ system: FoundationSystem; compare: boolean; epoch: number }>({ system: 'auto', compare: false, epoch: -1 });
const fresh = () => picked.epoch === modelStore.loadEpoch;
const pick = (next: Partial<Pick<typeof picked, 'system' | 'compare'>>) => {
  picked = { system: fresh() ? picked.system : 'auto', compare: fresh() && picked.compare, ...next, epoch: modelStore.loadEpoch };
};

/**
 * The foundation layout the sheets show while none is adopted: the one a footing adopted then
 * belongs to. It is the model's own: another project, a tab switched to or an undo shows the
 * recommended layout again, designing only it.
 */
export const footingPreview = {
  get system(): FoundationSystem { return fresh() ? picked.system : 'auto'; },
  set system(system: FoundationSystem) { pick({ system }); },
  get compare(): boolean { return fresh() && picked.compare; },
  set compare(compare: boolean) { pick({ compare }); },
  /** Whether the available piles' section is open: kept while the sheets are designed again under it. */
  get pilesOpen(): boolean { return pilesOpen; },
  set pilesOpen(open: boolean) { pilesOpen = open; },
};
