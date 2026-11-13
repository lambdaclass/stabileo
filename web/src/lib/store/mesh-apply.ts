/**
 * The plates' own meshing, run in the model behind a closed dialog: the progress card at the
 * viewer's foot while it runs (`mesh-progress.svelte.ts`), the plates selected and a toast after.
 */
import { tp } from '../i18n';
import { uiStore } from './ui.svelte';
import { applyPlateMeshesAsync, type PlateMeshPlan, type PlateMeshReport } from './physical-plates';
import { endMeshProgress, meshProgress, setMeshProgress } from './mesh-progress.svelte';

export async function meshPlatesInModel(plans: readonly PlateMeshPlan[], ids: readonly number[]): Promise<PlateMeshReport | null> {
  if (meshProgress.now) return null;
  const total = plans.filter((p) => p.mesh).length;
  setMeshProgress('meshing', 0, total, 'plates');
  let r: PlateMeshReport;
  try {
    r = await applyPlateMeshesAsync(plans, (done, n) => setMeshProgress('meshing', done, n, 'plates'));
  } finally {
    endMeshProgress();
  }
  uiStore.selectPlates(ids);
  const msg = tp('plates.meshApplied', { plates: r.plates, cells: r.cells })
    + (r.refused.length ? ' ' + tp('plates.meshRefusedSome', { n: r.refused.length }) : '')
    + (r.droppedLocalLoads ? ' ' + tp('plates.localLoadsDropped', { n: r.droppedLocalLoads }) : '');
  uiStore.toast(msg, r.refused.length ? 'error' : 'success');
  return r;
}
