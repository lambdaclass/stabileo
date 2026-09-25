/**
 * A project reopens solved the way it was saved.
 *
 * `includeSelfWeight` was not written to the `.ded`, and the default is ON. So a model
 * solved WITHOUT its own weight came back with it: on a frame whose applied load is
 * 1500 kN, reopening added 465 kN of concrete and nobody was told. Every number
 * downstream moves with that — reactions, member forces, and the D/C the drawings were
 * accepted on.
 *
 * The share link has carried the flag since it was written. The `.ded` is the format
 * people keep, and it was the one dropping it.
 */
import { describe, it, expect } from 'vitest';
import { buildProjectFile, deserializeProject, type DedalFile } from '../file';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';

function tinyModel(): void {
  modelStore.clear?.();
  const m = modelStore.addMaterial({ name: 'S', e: 200000, nu: 0.3, rho: 78.5, fy: 355 });
  const s = modelStore.addSection({ name: 'R', b: 0.1, h: 0.2, a: 0.02, iy: 1e-5, iz: 1e-5, j: 1e-5, shape: 'rect' });
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementSection(e, s);
  modelStore.updateElementMaterial(e, m);
  modelStore.addSupport(a, 'fixed');
}

describe('the project file and self-weight', () => {
  it('writes the flag, both ways round', () => {
    tinyModel();
    uiStore.includeSelfWeight = false;
    expect(buildProjectFile().includeSelfWeight).toBe(false);
    uiStore.includeSelfWeight = true;
    expect(buildProjectFile().includeSelfWeight).toBe(true);
  });

  it('a model saved without its own weight comes back without it', () => {
    tinyModel();
    uiStore.includeSelfWeight = false;
    const text = JSON.stringify(buildProjectFile());

    // The session moves on, as it does between saving and reopening.
    uiStore.includeSelfWeight = true;

    expect(deserializeProject(text)).toBe(true);
    expect(uiStore.includeSelfWeight).toBe(false);
  });

  it('restores false, which is the value truthiness would have thrown away', () => {
    // `if (data.includeSelfWeight)` would skip exactly the case this fixes. The guard is
    // `!== undefined`, and this is the test that holds it there.
    tinyModel();
    uiStore.includeSelfWeight = true;
    const file = { ...buildProjectFile(), includeSelfWeight: false };
    uiStore.includeSelfWeight = true;
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    expect(uiStore.includeSelfWeight).toBe(false);
  });

  it('a file written before the field existed leaves the toggle alone', () => {
    // Absent is not false. An older project states nothing about self-weight, and
    // inventing an answer for it would be its own silent change.
    tinyModel();
    uiStore.includeSelfWeight = true;
    const file = buildProjectFile() as Partial<DedalFile>;
    delete file.includeSelfWeight;
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    expect(uiStore.includeSelfWeight).toBe(true);
  });
});
