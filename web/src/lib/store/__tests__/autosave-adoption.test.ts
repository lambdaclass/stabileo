/**
 * Restoring the autosave adopts the project as a .ded open does (`adoptStoredProject`): its record
 * of members edited by hand comes with it. It used to restore the model only, so the record was the
 * session's empty one and «Size…» replaced the bars edited by hand.
 */
import { describe, it, expect } from 'vitest';
import { adoptStoredProject } from '../file';
import { designRunStore } from '../design-run.svelte';
import { modelStore } from '../model.svelte';

describe('an autosave restored', () => {
  it('brings its hand-edit record and its name', () => {
    modelStore.clear();
    designRunStore.resetMarks();
    const snap = { ...modelStore.snapshot(), manualEdits: [7, 3] };
    adoptStoredProject(snap as never, 'Restaurado');
    expect([...designRunStore.manualOverrides].sort((a, b) => a - b)).toEqual([3, 7]);
    expect(modelStore.model.name).toBe('Restaurado');
  });
});
