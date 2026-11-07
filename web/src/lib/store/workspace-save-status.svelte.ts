export type WorkspaceSavePart = 'text' | 'detailing';

function createWorkspaceSaveStatus() {
  let failedParts = $state<WorkspaceSavePart[]>([]);
  return {
    get failed(): boolean { return failedParts.length > 0; },
    report(part: WorkspaceSavePart, ok: boolean): void {
      const has = failedParts.includes(part);
      if (ok && has) failedParts = failedParts.filter((p) => p !== part);
      else if (!ok && !has) failedParts = [...failedParts, part];
    },
    reset(): void { failedParts = []; },
  };
}

export const workspaceSaveStatus = createWorkspaceSaveStatus();
