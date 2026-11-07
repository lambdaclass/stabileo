function createWorkspaceSaveStatus() {
  let failed = $state(false);
  return {
    get failed(): boolean { return failed; },
    report(ok: boolean): void { failed = !ok; },
  };
}

export const workspaceSaveStatus = createWorkspaceSaveStatus();
