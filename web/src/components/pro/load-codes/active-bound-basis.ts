import { loadCodeFor } from '../../../lib/codes/families';
import { regulationsStore } from '../../../lib/store/regulations.svelte';

export function boundBasis() {
  const code = loadCodeFor(regulationsStore.binding('basis')?.adapterId);
  return code?.role === 'basis' ? code : undefined;
}
