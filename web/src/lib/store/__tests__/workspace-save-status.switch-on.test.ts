/**
 * The notice of a refused workspace save can be closed: it stays away while saves keep failing,
 * and comes back once a save has gone through and another fails.
 */
import { it, expect } from 'vitest';
import { workspaceSaveStatus } from '../workspace-save-status.svelte';

it('closed, the notice stays away while saves fail, and comes back after one goes through', () => {
  workspaceSaveStatus.report(false);
  expect([workspaceSaveStatus.failed, workspaceSaveStatus.shown]).toEqual([true, true]);
  workspaceSaveStatus.dismiss?.();
  expect([workspaceSaveStatus.failed, workspaceSaveStatus.shown]).toEqual([true, false]);
  workspaceSaveStatus.report(false);
  expect(workspaceSaveStatus.shown).toBe(false);
  workspaceSaveStatus.report(true);
  expect([workspaceSaveStatus.failed, workspaceSaveStatus.shown]).toEqual([false, false]);
  workspaceSaveStatus.report(false);
  expect(workspaceSaveStatus.shown).toBe(true);
  workspaceSaveStatus.report(true);
});
