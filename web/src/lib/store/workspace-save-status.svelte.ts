interface WorkspaceSaveStatus {
  readonly failed: boolean;
  readonly shown?: boolean;
  report(ok: boolean): void;
  dismiss?(): void;
}

function createWorkspaceSaveStatus(): WorkspaceSaveStatus {
  let failed = $state(false);
  if (!__PUBLIC_FEATURES__.proPlatesUnified) return {
    get failed() { return failed; },
    report(ok) { failed = !ok; },
  };
  let dismissed = $state(false);
  return {
    get failed() { return failed; },
    get shown() { return failed && !dismissed; },
    report(ok) { failed = !ok; if (ok) dismissed = false; },
    dismiss() { dismissed = true; },
  };
}

export const workspaceSaveStatus = createWorkspaceSaveStatus();
