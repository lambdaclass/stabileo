/**
 * Whether the browser refused the last copy of the workspace, and whether the reader closed the
 * notice that says so: closed, it stays away while saves keep failing and comes back once a save
 * has gone through and another fails.
 */
function createWorkspaceSaveStatus() {
  let failed = $state(false);
  let dismissed = $state(false);
  return {
    get failed(): boolean { return failed; },
    get shown(): boolean { return failed && !dismissed; },
    report(ok: boolean): void { failed = !ok; if (ok) dismissed = false; },
    dismiss(): void { dismissed = true; },
  };
}

export const workspaceSaveStatus = createWorkspaceSaveStatus();
