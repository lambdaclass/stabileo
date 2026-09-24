/**
 * The hinge toggle of the element editor, read from and written back to an
 * end's per-axis release.
 *
 * In 3D a hinge is both bending moments (see modelStore.toggleHinge3D), and
 * either one counts as hinged. The editor has to use that same reading to
 * decide whether the user changed anything: comparing against `mz` alone made
 * an end that releases only My — a per-axis release from a file, the AI build
 * or the tables — look edited on open, so OK with nothing touched pushed an
 * undo step, cleared the results and added an Mz release.
 */
import { NO_RELEASE, type Release } from './model.svelte';

export function isHinged(rel: Release | undefined, is3D: boolean): boolean {
  return rel?.mz === true || (is3D && rel?.my === true);
}

/**
 * The end's release as saved. The per-axis flags are rewritten only when the
 * hinge toggle itself changed; otherwise a material or section edit would
 * turn an Mz-only (or My-only) end into a full hinge.
 */
export function releaseAfterEdit(rel: Release | undefined, hinge: boolean, is3D: boolean): Release {
  const base = { ...(rel ?? NO_RELEASE) };
  if (hinge === isHinged(rel, is3D)) return base;
  return { ...base, mz: hinge, ...(is3D ? { my: hinge } : {}) };
}
