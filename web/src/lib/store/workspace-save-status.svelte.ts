function createWorkspaceSaveStatus() {
  let failed = $state(false);
  let dismissed = $state(false);
  return {
    get failed(): boolean { return failed; },
    get shown(): boolean { return failed && !(__PUBLIC_FEATURES__.proPlatesUnified && dismissed); },
    report(ok: boolean): void { failed = !ok; if (__PUBLIC_FEATURES__.proPlatesUnified && ok) dismissed = false; },
    dismiss(): void { if (__PUBLIC_FEATURES__.proPlatesUnified) dismissed = true; },
  };
}

export const workspaceSaveStatus = createWorkspaceSaveStatus();
