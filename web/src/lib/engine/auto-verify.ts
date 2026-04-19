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

import type { AnalysisResults3D, ElementForces3D } from './types-3d';
import type { GoverningPerElement3D } from './governing-case';
import type { ElementDesignDemands } from './station-design-forces';
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
    const isVertical = elemType === 'column' || elemType === 'wall';

    // ─── Force extraction: station-based (preferred) or endpoint fallback ───
    let MuMax: number, VuMax: number, NuMax: number;
    let MuyMax: number, VzMax: number, TuMax: number;
    // Station-based governing combo refs (richer than endpoint-only governing-case.ts)
    let stationGovCombos: ElementVerification['governingCombos'] | undefined;

    const demands = stationDemands?.get(ef.elementId);
    if (demands && demands.demands.length > 0) {
      // ── Station-based extraction: sign-aware, interior stations, per-combo ──
      const demandMap = new Map(demands.demands.map(d => [d.category, d]));

      // Moment: take the larger of Mz+/Mz- (both are real interior maxima)
      const mzPos = demandMap.get('Mz+');
      const mzNeg = demandMap.get('Mz-');
      const myPos = demandMap.get('My+');
      const myNeg = demandMap.get('My-');
      const MzMax = Math.max(mzPos?.absValue ?? 0, mzNeg?.absValue ?? 0);
      const MyMax = Math.max(myPos?.absValue ?? 0, myNeg?.absValue ?? 0);
      MuMax = Math.max(MzMax, MyMax);
      MuyMax = Math.min(MzMax, MyMax);

      // Shear: station-based absolute max (includes interior points)
      const vyDemand = demandMap.get('Vy');
      const vzDemand = demandMap.get('Vz');
      const VyAbs = vyDemand?.absValue ?? 0;
      VzMax = vzDemand?.absValue ?? 0;
      VuMax = Math.max(VyAbs, VzMax);

      // Axial: max of compression and tension absolute values
      const nComp = demandMap.get('N_compression');
      const nTens = demandMap.get('N_tension');
      NuMax = Math.max(nComp?.absValue ?? 0, nTens?.absValue ?? 0);

      // Torsion
      const tDemand = demandMap.get('Torsion');
      TuMax = tDemand?.absValue ?? 0;

      // Build station-aware governing combo refs from the actual demand data
      const govMz = (mzPos?.absValue ?? 0) >= (mzNeg?.absValue ?? 0) ? mzPos : mzNeg;
      const govMy = (myPos?.absValue ?? 0) >= (myNeg?.absValue ?? 0) ? myPos : myNeg;
      stationGovCombos = {};
      if (govMz) stationGovCombos.flexure = { comboId: govMz.comboId, comboName: govMz.comboName };
      if (vyDemand) stationGovCombos.shear = { comboId: vyDemand.comboId, comboName: vyDemand.comboName };
      if (nComp || nTens) {
        const govN = (nComp?.absValue ?? 0) >= (nTens?.absValue ?? 0) ? nComp : nTens;
        if (govN) stationGovCombos.axial = { comboId: govN.comboId, comboName: govN.comboName };
      }
      if (govMy) stationGovCombos.momentY = { comboId: govMy.comboId, comboName: govMy.comboName };
      if (vzDemand) stationGovCombos.shearZ = { comboId: vzDemand.comboId, comboName: vzDemand.comboName };
      if (tDemand) stationGovCombos.torsion = { comboId: tDemand.comboId, comboName: tDemand.comboName };
    } else {
      // ── Legacy endpoint-only fallback ──
      const MzMax = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
      const MyMax = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
      const VyAbs = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
      VzMax = Math.max(Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
      MuMax = Math.max(MzMax, MyMax);
      MuyMax = Math.min(MzMax, MyMax);
      VuMax = Math.max(VyAbs, VzMax);
      NuMax = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
      TuMax = Math.max(Math.abs(ef.mxStart), Math.abs(ef.mxEnd));
    }

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

    // Attach governing combo metadata — prefer station-based (richer) over legacy
    if (stationGovCombos) {
      v.governingCombos = stationGovCombos;
    } else {
      const gov = governing?.get(ef.elementId);
      if (gov) {
        v.governingCombos = {};
        if (gov.momentZ) v.governingCombos.flexure = { comboId: gov.momentZ.comboId, comboName: gov.momentZ.comboName };
        if (gov.shearY) v.governingCombos.shear = { comboId: gov.shearY.comboId, comboName: gov.shearY.comboName };
        if (gov.axial) v.governingCombos.axial = { comboId: gov.axial.comboId, comboName: gov.axial.comboName };
        if (gov.momentY) v.governingCombos.momentY = { comboId: gov.momentY.comboId, comboName: gov.momentY.comboName };
        if (gov.shearZ) v.governingCombos.shearZ = { comboId: gov.shearZ.comboId, comboName: gov.shearZ.comboName };
        if (gov.torsion) v.governingCombos.torsion = { comboId: gov.torsion.comboId, comboName: gov.torsion.comboName };
      }
    }

    // Attach station-based demand summary for downstream consumers
    if (demands) {
      v.stationDemands = demands;
    }

    verifs.push(v);
  }

  return { concrete: verifs };
}
