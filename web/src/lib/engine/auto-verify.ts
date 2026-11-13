/**
 * Extracted auto-verification utility.
 *
 * Runs CIRSOC 201 (RC) verification on 3D analysis results.
 * Optionally annotates each result with governing-combo metadata.
 *
 * When station-based demands are provided (from station-design-forces.ts),
 * uses sign-aware interior station forces instead of endpoint-only max(abs).
 * This captures midspan moments, preserves Mz+/Mz- sign for top/bottom
 * reinforcement, and keeps the concurrent force tuple per demand category.
 *
 * This is a pure function: no store reads, no side effects.
 */

import { concreteFc } from '../model/design-data';
import { CONCRETE_E_BAND_MPA } from '../model/material-family';
import type { AnalysisResults3D } from './types-3d';
import type { GoverningPerElement3D } from './governing-case';
import type { ElementDesignDemands } from './station-design-forces';
import { classifyElement, computeJointPsiFromModel } from './codes/argentina/cirsoc201';
import type { ElementVerification } from './codes/argentina/cirsoc201';
import { isDesignedMember } from './design/behaviour-demands';
import { primaryAxis } from './design/design-axes';
import { verifyConcurrentElement } from './concurrent-verification';
import { ConcurrentDemand } from './concurrent-demand';
import { CIRSOC201_DESIGN_EDITION } from './codes/argentina/cirsoc201-basis';
import type { RegulationEdition } from '../codes/regulation';

// ─── Input/Output types ─────────────────────────────────────

export interface AutoVerifyModelData {
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; type: string }>;
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  sections: Map<number, { id: number; name: string; b?: number; h?: number }>;
  materials: Map<number, { id: number; name: string; fy?: number; fc?: number; e?: number }>;
  supports: Map<number, { id: number; nodeId: number; type: string }>;
}

export interface AutoVerifyOptions {
  rebarFy?: number;    // MPa, default 420
  cover?: number;      // m, default 0.025
  /** The clear cover of a column, m; absent: `cover`. */
  columnCover?: number;
  stirrupDia?: number; // mm, default 8
  /** Edition the designer sizes to and the engine re-check applies. Default: `CIRSOC201_DESIGN_EDITION`. */
  edition?: RegulationEdition;
}

// ─── Which members this verifier can check, and why not ──────────

/**
 * The highest characteristic strength, MPa, that is read as concrete rather than steel.
 *
 * `Material.fy` carries f'c for a concrete material and f_y for a steel one — one field, two
 * meanings, distinguished by magnitude. 80 MPa is comfortably above any concrete this code
 * covers and far below any structural steel grade, so the split is unambiguous in practice.
 */
const CONCRETE_FY_CEILING = 80;

/**
 * Can CIRSOC 201 check this member at all?
 *
 * ── Why this is a named function and not four inline `continue`s ───
 *
 * Because the answer is needed in two places that must never disagree: the loop that DOES
 * the checking, and the command layer that has to explain to a user why nothing was checked.
 * A steel tower reported "CIRSOC 201-2025 verified no member in this model", which is true,
 * unhelpful, and indistinguishable from a bug — and the only way to keep the explanation
 * honest is for it to be computed from the same predicate that produced the silence.
 */
export function rcCheckability(
  elem: { sectionId: number; materialId: number },
  model: Pick<AutoVerifyModelData, 'sections' | 'materials'>,
): 'checkable' | 'noSection' | 'noMaterial' | 'noStrength' | 'notConcrete' | 'noRectangle' {
  const section = model.sections.get(elem.sectionId);
  if (!section) return 'noSection';
  const material = model.materials.get(elem.materialId);
  if (!material) return 'noMaterial';
  const fc = concreteFc(material);
  if (fc === undefined || fc === null || !Number.isFinite(fc) || fc <= 0) {
    const e = material.e;
    const concreteStiffness = e === undefined || (e >= CONCRETE_E_BAND_MPA.min && e <= CONCRETE_E_BAND_MPA.max);
    return concreteStiffness ? 'noStrength' : 'notConcrete';
  }
  if (fc > CONCRETE_FY_CEILING) return 'notConcrete';
  if (!section.b || !section.h) return 'noRectangle';
  return 'checkable';
}

/** Why the RC check found nothing to do, as a census over the whole model. */
export interface RcCheckabilityCensus {
  total: number;
  checkable: number;
  notConcrete: number;
  noRectangle: number;
  noSection: number;
  noMaterial: number;
  noStrength: number;
  noStrengthMaterials: string[];
}

export function censusRcCheckability(
  model: Pick<AutoVerifyModelData, 'elements' | 'sections' | 'materials'>,
): RcCheckabilityCensus {
  const out: RcCheckabilityCensus = {
    total: 0, checkable: 0, notConcrete: 0, noRectangle: 0, noSection: 0, noMaterial: 0,
    noStrength: 0, noStrengthMaterials: [],
  };
  for (const elem of model.elements.values()) {
    out.total += 1;
    switch (rcCheckability(elem, model)) {
      case 'checkable': out.checkable += 1; break;
      case 'notConcrete': out.notConcrete += 1; break;
      case 'noRectangle': out.noRectangle += 1; break;
      case 'noSection': out.noSection += 1; break;
      case 'noMaterial': out.noMaterial += 1; break;
      case 'noStrength': {
        out.noStrength += 1;
        const name = model.materials.get(elem.materialId)?.name ?? String(elem.materialId);
        if (!out.noStrengthMaterials.includes(name)) out.noStrengthMaterials.push(name);
        break;
      }
    }
  }
  return out;
}

export interface AutoVerifyResult {
  concrete: ElementVerification[];
}

// ─── Main function ──────────────────────────────────────────

/**
 * Run CIRSOC 201 verification on all concrete elements in the results.
 *
 * When `stationDemands` is provided, uses sign-aware station-based forces
 * (interior peaks, preserved sign, concurrent force tuples) instead of the
 * legacy endpoint-only max(abs(start), abs(end)) extraction.
 *
 * If `governing` is provided, attaches governing combo metadata to each verification.
 */
export function autoVerifyFromResults(
  results: AnalysisResults3D,
  model: AutoVerifyModelData,
  governing: Map<number, GoverningPerElement3D> | null,
  options?: AutoVerifyOptions,
  stationDemands?: Map<number, ElementDesignDemands>,
): AutoVerifyResult {
  const concrete: ElementVerification[] = [];
  for (const ef of results.elementForces) {
    const elem = model.elements.get(ef.elementId);
    if (!elem || rcCheckability(elem, model) !== 'checkable' || !isDesignedMember(elem as never, model.sections as never)) continue;
    const nodeI = model.nodes.get(elem.nodeI), nodeJ = model.nodes.get(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;
    const section = model.sections.get(elem.sectionId)!;
    const material = model.materials.get(elem.materialId)!;
    const b = section.b!, h = section.h!;
    const elementType = classifyElement(nodeI.x, nodeI.y, nodeI.z ?? 0, nodeJ.x, nodeJ.y, nodeJ.z ?? 0, b, h);
    const demands = stationDemands?.get(ef.elementId);
    if ((demands || governing?.has(ef.elementId)) && !demands?.concurrent?.length) {
      throw new Error(`Concurrent demands are required for element ${ef.elementId}; an envelope cannot be verified`);
    }
    const tuples = demands?.concurrent ?? ConcurrentDemand.endpoints(ef);
    const my = Math.max(...tuples.map(d => Math.abs(d.forces.my))), mz = Math.max(...tuples.map(d => Math.abs(d.forces.mz)));
    const axis = primaryAxis(elementType, { b, h }, my, mz);
    const isVertical = elementType !== 'beam';
    const L = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y, (nodeJ.z ?? 0) - (nodeI.z ?? 0));
    const psi = isVertical ? computeJointPsiFromModel(ef.elementId, model.nodes as never, model.elements as never,
      model.sections as never, model.materials as never, model.supports as never) : undefined;
    const inputs = tuples.map(d => ({
      elementId: ef.elementId, elementType, demand: d.section(axis),
      b: axis === 'My' ? b : h, h: axis === 'My' ? h : b,
      fc: concreteFc(material)!, fy: options?.rebarFy ?? 420,
      cover: isVertical ? options?.columnCover ?? options?.cover ?? 0.025 : options?.cover ?? 0.025,
      stirrupDia: options?.stirrupDia ?? 8, edition: options?.edition ?? CIRSOC201_DESIGN_EDITION,
      Lu: isVertical ? L : undefined, psiA: psi?.psiA, psiB: psi?.psiB,
    }));
    const v = verifyConcurrentElement(inputs);
    v.flexureAxis = axis;
    if (demands) v.stationDemands = demands;
    concrete.push(v);
  }
  return { concrete };
}
