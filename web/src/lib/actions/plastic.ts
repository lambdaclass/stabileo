/**
 * Run the plastic collapse analysis on the model as it stands.
 *
 * Mp of each frame member from its section's own plastic modulus
 * (plastic-moments.ts); Np = fy·A for a truss bar, with fy from its material
 * (250 MPa if it has none, and said so by `plasticMoments`).
 *
 * The collapse factor is the limit analysis's, released only where the exact plastic certificate
 * confirms it (engine `plastic_limit_2d`).
 */
import { modelStore, uiStore } from '../store';
import { plasticMoments, capacitiesByMember, plasticMaterials, plasticWireSections, DEFAULT_FY, type SectionMp } from '../engine/plastic-moments';
import { plasticCollapse2D, type PlasticCollapseResult } from '../engine/plastic-collapse';
import { advancedRefusal2D, variableRefusal2D } from '../engine/solver-service';
import { t } from '../i18n';
import { input2DToWireObject } from '../engine/wasm-solver';
import { axialSpanToNodal2D } from '../engine/axial-span-2d';
import { tagCertifyJob } from '../engine/certify-tags';
import type { SolverInput } from '../engine/types';
import { knownIssueMessage } from '../engine/known-issue-message';
import { plasticCourse } from '../store/plastic-course.svelte';

export interface PlasticRun {
  result: PlasticCollapseResult;
  mps: SectionMp[];
}

export class PlasticWithheld extends Error {
  readonly issue = 758;
}

function withheld(): PlasticWithheld {
  return new PlasticWithheld(knownIssueMessage({
    code: 'known_issue',
    severity: 'error',
    phase: 'PL-2D-INVARIANCE',
    value: 758,
    message: 'Results withheld: independently verify 2D plastic collapse.',
  }));
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
  const mp = memberPlasticMoments(input, mps);
  const result = plasticCollapse2D(input, {
    mp: (id) => mp.get(id) ?? Infinity,
    np: (id) => {
      const e = input.elements.get(id)!;
      const fy = modelStore.materials.get(e.materialId)?.fy || DEFAULT_FY;
      const a = input.sections.get(e.sectionId)?.a ?? 0;
      return fy * 1000 * a;
    },
  });
  if (result.unloaded) throw new Error(t('advanced.plasticNoLoads'));
  if (result.withheld) throw withheld();
  tagPlasticCertificate(result, input, mps);
  plasticCourse.remember(input, mp, result);
  return { result, mps };
}

/**
 * Note how to certify the collapse factor (`certify_plastic_2d`, docs/verification/CERTIFY.md):
 * the same model and the same Mp per section, sent as the engine's plastic input. The certificate
 * is of the rigid–plastic model with bending-only yield; `PlasticCertificate.svelte` reads it
 * against λc only when no bar yielded axially. A section with no Mp (one this analysis takes as
 * never yielding) has no counterpart there, and the result is not certified.
 */
function tagPlasticCertificate(result: object, input: SolverInput, moments: SectionMp[]): void {
  if (moments.some(m => !(m.mp > 0 && Number.isFinite(m.mp)))) return;
  const { elements, elastic, sections, mpOverrides } = plasticWireSections(input, moments, m => m.mp);
  const materials = plasticMaterials(modelStore.materials);
  // The certificate refuses temperatures, settlements and axial span loads. None changes the
  // bending collapse factor (an axial span load does the same work as its shares at the nodes),
  // so it certifies the model without them, as the limit analysis solves it.
  const mechanical: SolverInput = {
    ...input, elements, sections: elastic,
    supports: new Map([...input.supports].map(([k, s]) => [k, { ...s, dx: undefined, dz: undefined, dry: undefined }])),
    loads: input.loads.flatMap((l) => (l.type === 'thermal' ? [] : l.type === 'axialDistributed' ? axialSpanToNodal2D(input, l.data) : [l])),
  };
  const json = JSON.stringify({ solver: input2DToWireObject(mechanical), sections, materials, mpOverrides });
  tagCertifyJob(result, { name: 'certify_plastic_2d', args: [json] });
}

export function memberPlasticMoments(input: SolverInput, moments = plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements)): Map<number, number> {
  const byMember = capacitiesByMember(moments);
  return new Map([...input.elements.values()].filter(e => e.type === 'frame').map(e => {
    const capacity = byMember.get(e.id);
    if (!capacity || capacity.materialId !== e.materialId) {
      throw new Error(knownIssueMessage({ code: 'plastic_capacity_missing', severity: 'error', elementIds: [e.id],
        value: e.sectionId, message: `No matching plastic capacity for member ${e.id}, section ${e.sectionId}, material ${e.materialId}` }));
    }
    return [e.id, capacity.mp];
  }));
}
