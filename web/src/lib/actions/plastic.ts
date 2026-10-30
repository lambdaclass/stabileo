/**
 * Run the plastic collapse analysis on the model as it stands.
 *
 * Mp of each frame member from its section's own plastic modulus
 * (plastic-moments.ts); Np = fy·A for a truss bar, with fy from its material
 * (250 MPa if it has none, and said so by `plasticMoments`).
 */
import { modelStore, uiStore } from '../store';
import { plasticMoments, DEFAULT_FY, type SectionMp } from '../engine/plastic-moments';
import { plasticCollapse2D, type PlasticCollapseResult } from '../engine/plastic-collapse';
import { advancedRefusal2D, variableRefusal2D } from '../engine/solver-service';
import { t } from '../i18n';
import { input2DToWireObject } from '../engine/wasm-solver';
import { tagCertifyJob } from '../engine/certify-tags';
import type { SolverInput } from '../engine/types';
import { plasticCourse } from '../store/plastic-course.svelte';

export interface PlasticRun {
  result: PlasticCollapseResult;
  mps: SectionMp[];
}

/**
 * Throws, with the static solve's own message, on a model the static solve
 * refuses: the collapse analysis starts from that solve, and ran on a beam on
 * two rollers or a stray node as if it had one. A model nothing loads is
 * refused too: its λc = 0 read as "does not collapse".
 */
export function runPlasticCollapse(): PlasticRun | null {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input) return null;
  const refusal = variableRefusal2D(modelStore.model) ?? advancedRefusal2D(input);
  if (refusal) throw new Error(refusal);
  const mps = plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements);
  const mpOfSection = new Map(mps.map((m) => [m.sectionId, m.mp]));
  const result = plasticCollapse2D(input, {
    mp: (id) => mpOfSection.get(input.elements.get(id)!.sectionId) ?? Infinity,
    np: (id) => {
      const e = input.elements.get(id)!;
      const fy = modelStore.materials.get(e.materialId)?.fy || DEFAULT_FY;
      const a = input.sections.get(e.sectionId)?.a ?? 0;
      return fy * 1000 * a;
    },
  });
  if (result.unloaded) throw new Error(t('advanced.plasticNoLoads'));
  tagPlasticCertificate(result, input, mpOfSection);
  plasticCourse.remember(input, memberPlasticMoments(input, mpOfSection), result);
  return { result, mps };
}

/** Mp of every frame member of `input`, kN·m (Infinity where its section has none). */
export function memberPlasticMoments(input: SolverInput, mpOfSection?: Map<number, number>): Map<number, number> {
  const bySection = mpOfSection ?? new Map(plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements).map((m) => [m.sectionId, m.mp]));
  return new Map([...input.elements.values()].map((e) => [e.id, bySection.get(e.sectionId) ?? Infinity]));
}

/**
 * Note how to certify the collapse factor (`certify_plastic_2d`, docs/verification/CERTIFY.md):
 * the same model and the same Mp per section, sent as the engine's plastic input. The certificate
 * is of the rigid–plastic model with bending-only yield; `PlasticCertificate.svelte` reads it
 * against λc only when no bar yielded axially. A section with no Mp (one this analysis takes as
 * never yielding) has no counterpart there, and the result is not certified.
 */
function tagPlasticCertificate(result: object, input: SolverInput, mpOfSection: Map<number, number>): void {
  const sections: Record<string, { a: number; iz: number; materialId: number }> = {};
  const mpOverrides: Record<string, number> = {};
  for (const e of input.elements.values()) {
    const s = input.sections.get(e.sectionId);
    if (!s || String(e.sectionId) in sections) continue;
    const mp = mpOfSection.get(e.sectionId);
    if (!(mp !== undefined && Number.isFinite(mp) && mp > 0)) return;
    sections[String(e.sectionId)] = { a: s.a, iz: s.iz, materialId: e.materialId };
    mpOverrides[String(e.sectionId)] = mp;
  }
  const materials = Object.fromEntries([...input.materials.keys()].map((id) => [String(id), { fy: modelStore.materials.get(id)?.fy || DEFAULT_FY }]));
  const json = JSON.stringify({ solver: input2DToWireObject(input), sections, materials, mpOverrides });
  tagCertifyJob(result, { name: 'certify_plastic_2d', args: [json] });
}
