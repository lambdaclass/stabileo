import { accountGate, type GatedAction } from '../store/account-gate.svelte';
import { milestone } from '../tracking/activity.svelte';

/** Hands a file to the browser once the account gate lets it through; the link is made only then, so a long sign-in never finds it revoked. */
export function saveFile(name: string, data: Blob, action: GatedAction = 'export'): void {
  accountGate.guard(action, () => {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    milestone(action === 'save' || /\.ded$/i.test(name) ? 'first_save' : 'first_export');
  });
}
