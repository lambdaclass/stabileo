/**
 * Run the plastic collapse analysis on the model as it stands.
 *
 * Mp of each frame member from its section's own plastic modulus
 * (plastic-moments.ts); Np = fy·A for a truss bar, with fy from its material
 * (250 MPa if it has none, and said so by `plasticMoments`).
 *
 * The collapse factor is the limit analysis's, released only where the exact plastic certificate
 * confirms it (engine `plastic_limit_2d`); anything else stays withheld with the PL-2D-INVARIANCE
 * message (#758).
 */
import { modelStore, uiStore } from '../store';
import { plasticMoments, DEFAULT_FY, type SectionMp } from '../engine/plastic-moments';
import { plasticCollapse2D, type PlasticCollapseResult } from '../engine/plastic-collapse';
import { advancedRefusal2D, variableRefusal2D } from '../engine/solver-service';
import { t } from '../i18n';
import { input2DToWireObject } from '../engine/wasm-solver';
import { axialSpanToNodal2D } from '../engine/axial-span-2d';
import { tagCertifyJob } from '../engine/certify-tags';
import type { SolverInput } from '../engine/types';
import { knownIssueMessage } from '../engine/known-issue-message';

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
 * refused too: its λc = 0 read as "does not collapse". A collapse factor the
 * exact certificate does not confirm throws `PlasticWithheld`.
 */
export function runPlasticCollapse(): PlasticRun | null {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input) return null;
  const refusal = variableRefusal2D(modelStore.model) ?? advancedRefusal2D(input);
  if (refusal) throw new Error(refusal);
  const mps = plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements);
  const mpOfSection = new Map(mps.map((m) => [m.sectionId, m.mp]));
  let result: PlasticCollapseResult;
  try {
    result = plasticCollapse2D(input, {
      mp: (id) => mpOfSection.get(input.elements.get(id)!.sectionId) ?? Infinity,
      np: (id) => {
        const e = input.elements.get(id)!;
        const fy = modelStore.materials.get(e.materialId)?.fy || DEFAULT_FY;
        const a = input.sections.get(e.sectionId)?.a ?? 0;
        return fy * 1000 * a;
      },
    });
  } catch {
    throw withheld();
  }
  if (result.unloaded) throw new Error(t('advanced.plasticNoLoads'));
  if (result.withheld) throw withheld();
  tagPlasticCertificate(result, input, mpOfSection);
  return { result, mps };
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
  // The certificate refuses temperatures, settlements and axial span loads. None changes the
  // bending collapse factor (an axial span load does the same work as its shares at the nodes),
  // so it certifies the model without them, as the limit analysis solves it.
  const mechanical: SolverInput = {
    ...input,
    supports: new Map([...input.supports].map(([k, s]) => [k, { ...s, dx: undefined, dz: undefined, dry: undefined }])),
    loads: input.loads.flatMap((l) => (l.type === 'thermal' ? [] : l.type === 'axialDistributed' ? axialSpanToNodal2D(input, l.data) : [l])),
  };
  const json = JSON.stringify({ solver: input2DToWireObject(mechanical), sections, materials, mpOverrides });
  tagCertifyJob(result, { name: 'certify_plastic_2d', args: [json] });
}

export function memberPlasticMoments(input: SolverInput, mpOfSection?: Map<number, number>): Map<number, number> {
  const bySection = mpOfSection ?? new Map(plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements).map((m) => [m.sectionId, m.mp]));
  return new Map([...input.elements.values()].filter((e) => e.type === 'frame').map((e) => [e.id, bySection.get(e.sectionId) ?? Infinity]));
}
