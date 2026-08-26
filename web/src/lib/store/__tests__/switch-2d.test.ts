/**
 * The 3D backup must die with the model it was taken from.
 *
 * The backup behind "restore 3D" is module-level (switch-2d.ts), so without a
 * reset it survives whatever replaces the model: slice model A, open project
 * B, and the ribbon's dim-up button would "restore" A over B, wiping it. The
 * reset is wired into the two funnels every wholesale replacement goes
 * through — `modelStore.clear()` (new project, example load) and
 * `deserializeProject()` in file.ts (file open, not exercised here: it needs
 * the file machinery, and it calls the same `resetSwitchBackup()`).
 *
 * Undo/redo (`modelStore.restore()`) is deliberately NOT a hook: its
 * snapshots are of the SAME model, where the backup is still the only way
 * back to the 3D original.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { hasBackup, restore3D, resetSwitchBackup, sliceAt } from '../switch-2d';

/** The smallest 3D model a slice can take: one column in the y = 0 plane. */
function build3DColumn() {
  modelStore.addNode(0, 0, 0);
  modelStore.addNode(0, 0, 3);
  modelStore.addElement(1, 2, 'frame');
}

describe('the 3D backup dies with its model', () => {
  beforeEach(() => {
    modelStore.clear();
    resetSwitchBackup();
  });

  it('exists once a slice has been taken, and restores on demand', () => {
    build3DColumn();
    const r = sliceAt('xz', 0);
    expect(r.ok).toBe(true);
    expect(hasBackup()).toBe(true);
    expect(uiStore.simplified2DMode).toBe(true);

    restore3D();
    expect(hasBackup()).toBe(false);
    expect(uiStore.simplified2DMode).toBe(false);
  });

  it('does not survive a wholesale model replacement (clear)', () => {
    build3DColumn();
    expect(sliceAt('xz', 0).ok).toBe(true);
    expect(hasBackup()).toBe(true);

    // New project / example load: a DIFFERENT model now occupies the store,
    // and the old backup would overwrite it on "restore 3D".
    modelStore.clear();
    expect(hasBackup()).toBe(false);
    expect(uiStore.simplified2DMode).toBe(false);
    expect(uiStore.simplified2DStats).toBeNull();
  });

  it('does not survive a resetSwitchBackup() call (the file-open hook)', () => {
    build3DColumn();
    expect(sliceAt('xz', 0).ok).toBe(true);
    expect(hasBackup()).toBe(true);

    resetSwitchBackup();
    expect(hasBackup()).toBe(false);
    // And a restore with nothing held is a no-op, not a wipe.
    modelStore.addNode(5, 5, 5);
    restore3D();
    expect(modelStore.nodes.has(3)).toBe(true);
  });
});
