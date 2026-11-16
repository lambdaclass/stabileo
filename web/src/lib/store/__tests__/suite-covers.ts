/**
 * The covers the store and detailing suites were written under: 25 mm to the stirrups of beams and
 * columns and under footings, the defaults before they became CIRSOC 201-2025 Table 20.5.1.3.1's
 * (30, 30 and 55 mm). A suite whose fixture was drawn, designed and asserted at those covers states
 * them, as `stateSuiteLateral` states the beams' role, so what it asserts stays exact; a suite about
 * the covers states its own, or none.
 */
import { modelStore } from '../model.svelte';
import { designData } from '../design-data';

export const SUITE_COVERS = { beam: 0.025, column: 0.025, footing: 0.025 } as const;

/** Stated without an undo step, as the project the suite opens would carry it. */
export function stateSuiteCovers(): void {
  modelStore.model.designData = JSON.parse(JSON.stringify({ ...designData(), covers: { ...designData().covers, ...SUITE_COVERS } }));
}
