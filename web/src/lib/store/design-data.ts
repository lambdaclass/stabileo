/**
 * The project's design data as the design reads it, and changing it: the solve is kept, the
 * design it fed is retired (the `materialSpec` stage of the revision graph), so nothing designed
 * under the old cover or steel stays on screen as if it held.
 */
import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { defaultDesignData, migrateDesignData, type DesignKind, type ProjectDesignData } from '../model/design-data';
import { bump, emptyRevisions } from '../codes/revisions';

/** The design data in force: the project's, or the defaults where it states none. */
export function designData(): ProjectDesignData {
  return modelStore.designData ? migrateDesignData(modelStore.designData) : defaultDesignData();
}

export function setDesignData(next: ProjectDesignData | null): void {
  modelStore.setDesignData(next);
  modelStore.model.revisions = bump(modelStore.model.revisions ?? emptyRevisions(), 'materialSpec');
  verificationStore.invalidateForCodeChange();
}

export function patchDesignData(patch: Partial<ProjectDesignData>): void {
  setDesignData({ ...designData(), ...patch });
}

/**
 * Change the parts of the design data that only their own checks read (the special slabs, the
 * stairs, the post-tensioning, the fire settings, the particular elements). Undone like any other
 * change, but the design the rest of the project holds stays: no cover, steel or code moved.
 */
export function patchOwnDesignData(patch: Partial<Pick<ProjectDesignData, 'specialFloors' | 'stairs' | 'postTension' | 'fire' | 'specialElements' | 'foreignCodes' | 'budget' | 'federation' | 'architecture' | 'site'>>): void {
  modelStore.setDesignData({ ...designData(), ...patch });
}

/** The cover of a kind of element, m. */
export const coverOf = (kind: DesignKind): number => designData().covers[kind];

/** What the member contexts take from the design data. */
export function designContextOptions() {
  const d = designData();
  return {
    coverFor: (kind: 'beam' | 'column') => d.covers[kind],
    stirrupDia: d.stirrupDiaMm, rebarFy: d.rebarFy,
    longDiametersMm: d.longDiametersMm, stirrupDiametersMm: d.stirrupDiametersMm,
    columnEndZones: d.columnEndZones === true,
  };
}

/** What the code check takes from it. */
export function verifyOptions() {
  const d = designData();
  return { rebarFy: d.rebarFy, cover: d.covers.beam, columnCover: d.covers.column, stirrupDia: d.stirrupDiaMm };
}

/**
 * What the checks under other codes take from it: the cover of beams and of columns and the bar
 * steel's fy. They read the CIRSOC design's defaults (25 mm, 420 MPa) whatever the project
 * stated, so a project with 40 mm of cover and ADN 500 was checked under ACI 318 and EN 1992 with
 * other bars at other depths than the ones it designs with.
 */
export function otherCodesDesignData(): { cover: { beam: number; column: number }; rebarFy: number } {
  const d = designData();
  return { cover: { beam: d.covers.beam, column: d.covers.column }, rebarFy: d.rebarFy };
}
