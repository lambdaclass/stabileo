/**
 * One step of the Selection panel's walk: the item it reaches, and nothing
 * else, selected.
 *
 * The step set the node and member channels and left the support and load
 * channels as they were, so walking the members of a mixed selection kept
 * every selected support lit (and framed by the zoom), and wrapping from the
 * last load back to the first member kept the load.
 */
import { uiStore } from '../store';

export type WalkKind = 'elements' | 'nodes' | 'supports' | 'loads' | 'shells';

/** `id`: a number, or a plate's key (`p3`, `q7`) for `shells`. */
export function selectWalkItem(kind: WalkKind, id: number | string): void {
  if (kind === 'shells') { uiStore.selectShell(String(id)); return; }
  if (kind === 'supports') { uiStore.selectSupport(Number(id)); return; }
  if (kind === 'loads') { uiStore.selectLoad(Number(id)); return; }
  uiStore.setSelection(kind === 'nodes' ? new Set([Number(id)]) : new Set(), kind === 'elements' ? new Set([Number(id)]) : new Set(), true);
  uiStore.clearSelectedSupports();
  uiStore.clearSelectedLoads();
}
