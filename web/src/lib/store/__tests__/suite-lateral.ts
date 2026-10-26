/**
 * The reading of the beams' role in the lateral-force-resisting system the store suites were
 * written under (§9.7.3.8.2, `model/lateral-system.ts`), stated in the project: before the role
 * could be declared nothing set it, and every beam was read outside the system, its positive
 * steel 150 mm into the supports. A suite states that reading instead of relying on it, so what
 * it asserts is unchanged and still exact; a suite about the role states its own, or none.
 * The engine suites' counterpart is `engine/design/__tests__/helpers.ts` `SUITE_LATERAL`.
 */
import { modelStore } from '../model.svelte';
import { designData } from '../design-data';

/**
 * Stated as the project's default for its beams, before the suite solves or designs. Written
 * without an undo step, as the project the suite opens would carry it: a suite that counts or
 * walks its undo steps reads them as it always did.
 */
export function stateSuiteLateral(): void {
  modelStore.model.designData = JSON.parse(JSON.stringify({ ...designData(), lateralSystem: { ...(designData().lateralSystem ?? {}), beams: 'gravity' } }));
}
