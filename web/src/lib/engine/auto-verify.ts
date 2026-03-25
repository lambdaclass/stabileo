/**
 * Extracted auto-verification utility.
 *
 * Runs CIRSOC 201 (RC) verification on 3D analysis results.
 * Optionally annotates each result with governing-combo metadata.
 *
 * This is a pure function: no store reads, no side effects.
 */

import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import type { GoverningPerElement3D } from './governing-case';
import { verifyElement, classifyElement, computeJointPsiFromModel } from './codes/argentina/cirsoc201';
import type { ElementVerification, VerificationInput } from './codes/argentina/cirsoc201';

// ─── Input/Output types ─────────────────────────────────────

export interface AutoVerifyModelData {
  elements: Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; type: string }>;
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  sections: Map<number, { id: number; name: string; b?: number; h?: number }>;
  materials: Map<number, { id: number; name: string; fy?: number }>;
  supports: Map<number, { id: number; nodeId: number; type: string }>;
}

export interface AutoVerifyOptions {
  rebarFy?: number;    // MPa, default 420
  cover?: number;      // m, default 0.025
  stirrupDia?: number; // mm, default 8
}

export interface AutoVerifyResult {
  concrete: ElementVerification[];
}

// ─── Main function ──────────────────────────────────────────

/**
 * Run CIRSOC 201 verification on all concrete elements in the results.
 * If `governing` is provided, attaches governing combo metadata to each verification.
 */
export function autoVerifyFromResults(
  results: AnalysisResults3D,
  model: AutoVerifyModelData,
  governing: Map<number, GoverningPerElement3D> | null,
  options?: AutoVerifyOptions,
): AutoVerifyResult {
  const rebarFy = options?.rebarFy ?? 420;
  const cover = options?.cover ?? 0.025;
  const stirrupDia = options?.stirrupDia ?? 8;
  const verifs: ElementVerification[] = [];

  for (const ef of results.elementForces) {
    const elem = model.elements.get(ef.elementId);
    if (!elem) continue;
    const nodeI = model.nodes.get(elem.nodeI);
    const nodeJ = model.nodes.get(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;
    const section = model.sections.get(elem.sectionId);
    const material = model.materials.get(elem.materialId);
    if (!section || !material) continue;
    if (!section.b || !section.h) continue;
    const fc = material.fy;
    if (!fc || fc > 80) continue;

    const dx = nodeJ.x - nodeI.x, dy = nodeJ.y - nodeI.y, dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const elemType = classifyElement(nodeI.x, nodeI.y, nodeI.z ?? 0, nodeJ.x, nodeJ.y, nodeJ.z ?? 0, section.b, section.h);
    // Take the dominant bending/shear from both local planes.
    // Under the current local-axis convention, gravity on a +X beam produces My+Vz,
    // while on a +Y beam it produces Mz+Vy. Reading only one plane misses the other.
    const MzMax = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
    const MyMax = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
    const VyMax = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
    const VzMax = Math.max(Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
    const MuMax = Math.max(MzMax, MyMax);
    const VuMax = Math.max(VyMax, VzMax);
    const NuMax = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
    // For biaxial column check: the secondary moment is the lesser plane
    const MuyMax = Math.min(MzMax, MyMax);
    const TuMax = Math.max(Math.abs(ef.mxStart), Math.abs(ef.mxEnd));
    const isVertical = elemType === 'column' || elemType === 'wall';

    let M1: number | undefined, M2: number | undefined;
    if (isVertical) {
      if (Math.abs(ef.mzStart) >= Math.abs(ef.mzEnd)) {
        M2 = Math.abs(ef.mzStart);
        M1 = Math.sign(ef.mzStart) === Math.sign(ef.mzEnd) ? Math.abs(ef.mzEnd) : -Math.abs(ef.mzEnd);
      } else {
        M2 = Math.abs(ef.mzEnd);
        M1 = Math.sign(ef.mzStart) === Math.sign(ef.mzEnd) ? Math.abs(ef.mzStart) : -Math.abs(ef.mzStart);
      }
    }

    let psiA: number | undefined, psiB: number | undefined;
    if (isVertical) {
      const psi = computeJointPsiFromModel(
        ef.elementId,
        model.nodes as any, model.elements as any,
        model.sections as any, model.materials as any,
        model.supports as any,
      );
      psiA = psi.psiA;
      psiB = psi.psiB;
    }

    const input: VerificationInput = {
      elementId: ef.elementId, elementType: elemType,
      Mu: MuMax, Vu: VuMax, Nu: NuMax,
      b: section.b, h: section.h, fc, fy: rebarFy, cover, stirrupDia,
      Muy: isVertical ? MuyMax : undefined,
      Vz: VzMax > 0.01 ? VzMax : undefined,
      Tu: TuMax > 0.001 ? TuMax : undefined,
      Lu: isVertical ? L : undefined, M1, M2, psiA, psiB,
    };

    const v = verifyElement(input);

    // Attach governing combo metadata if available
    const gov = governing?.get(ef.elementId);
    if (gov) {
      v.governingCombos = {};
      if (gov.momentZ) v.governingCombos.flexure = { comboId: gov.momentZ.comboId, comboName: gov.momentZ.comboName };
      if (gov.shearY) v.governingCombos.shear = { comboId: gov.shearY.comboId, comboName: gov.shearY.comboName };
      if (gov.axial) v.governingCombos.axial = { comboId: gov.axial.comboId, comboName: gov.axial.comboName };
    }

    verifs.push(v);
  }

  return { concrete: verifs };
}
