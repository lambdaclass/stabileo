import { uiStore } from './ui.svelte';
import { requestAutosave } from './autosave-service';
import { saveWorkspaceSettled } from './file';
import { t } from '../i18n';

/** The viewed model becomes an ordinary PRO tab, saved as one before it is said to be. */
export async function duplicateViewed(write: { autosave: typeof requestAutosave; workspace: () => boolean | Promise<boolean> } = { autosave: requestAutosave, workspace: saveWorkspaceSettled }): Promise<boolean> {
  uiStore.viewerMode = false;
  const saved = await write.autosave('manual').catch(() => ({ ok: false }));
  const kept = await write.workspace();
  const ok = saved?.ok === true && kept;
  uiStore.toast(t(ok ? 'viewer.duplicated' : 'viewer.duplicateNotSaved'), ok ? 'success' : 'error');
  return ok;
}
