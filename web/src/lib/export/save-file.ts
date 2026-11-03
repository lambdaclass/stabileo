import { accountGate } from '../store/account-gate.svelte';

/**
 * Hands a file to the browser under a name, once an account allows it (`account-gate.svelte.ts`).
 * The link is made inside the allowed action, so a sign-in that takes a while never finds it revoked.
 */
export function saveFile(name: string, data: Blob): void {
  accountGate.guard('export', () => {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
}
