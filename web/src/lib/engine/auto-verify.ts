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
import { isDesignedMember } from './design/behaviour-demands';

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
): 'checkable' | 'noSection' | 'noMaterial' | 'notConcrete' | 'noRectangle' {
  const section = model.sections.get(elem.sectionId);
  if (!section) return 'noSection';
  const material = model.materials.get(elem.materialId);
  if (!material) return 'noMaterial';
  const fc = material.fy;
  if (!fc || fc > CONCRETE_FY_CEILING) return 'notConcrete';
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
}

export function censusRcCheckability(
  model: Pick<AutoVerifyModelData, 'elements' | 'sections' | 'materials'>,
): RcCheckabilityCensus {
  const out: RcCheckabilityCensus = {
    total: 0, checkable: 0, notConcrete: 0, noRectangle: 0, noSection: 0, noMaterial: 0,
  };
  for (const elem of model.elements.values()) {
    out.total += 1;
    switch (rcCheckability(elem, model)) {
      case 'checkable': out.checkable += 1; break;
      case 'notConcrete': out.notConcrete += 1; break;
      case 'noRectangle': out.noRectangle += 1; break;
      case 'noSection': out.noSection += 1; break;
      case 'noMaterial': out.noMaterial += 1; break;
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
    // One predicate, shared with the command layer that has to explain the silence.
    if (rcCheckability(elem, model) !== 'checkable') continue;
    // Design's own rule (`design/behaviour-demands.ts`): a member of variable section is left out,
    // not checked at end I's b and h with its end forces, which design no longer gives it.
    if (!isDesignedMember(elem as never, model.sections as never)) continue;
    /**
     * Re-read after the guard, with the guarantees it just established made local.
     *
     * `rcCheckability` has proved b, h and f'c are all present, but it proved it behind a
     * function call and the compiler cannot follow that. Narrowing once here — rather than
     * scattering `!` over the twenty-odd uses below — keeps the assertion in one place, next
     * to the check that earns it.
     */
    const section = model.sections.get(elem.sectionId) as
      { id: number; name: string; b: number; h: number };
    const material = model.materials.get(elem.materialId) as
      { id: number; name: string; fy: number };
    const fc = material.fy;

    const dx = nodeJ.x - nodeI.x, dy = nodeJ.y - nodeI.y, dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const elemType = classifyElement(nodeI.x, nodeI.y, nodeI.z ?? 0, nodeJ.x, nodeJ.y, nodeJ.z ?? 0, section.b, section.h);
    const isVertical = elemType === 'column' || elemType === 'wall';

    // ─── Force extraction: station-based (preferred) or endpoint fallback ───
    let MzMax: number, MyMax: number, VyAbs: number;
    let NuMax: number, VzMax: number, TuMax: number;
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
      MzMax = Math.max(mzPos?.absValue ?? 0, mzNeg?.absValue ?? 0);
      MyMax = Math.max(myPos?.absValue ?? 0, myNeg?.absValue ?? 0);

      // Shear: station-based absolute max (includes interior points)
      const vyDemand = demandMap.get('Vy');
      const vzDemand = demandMap.get('Vz');
      VyAbs = vyDemand?.absValue ?? 0;
      VzMax = vzDemand?.absValue ?? 0;

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
      MzMax = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
      MyMax = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
      VyAbs = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
      VzMax = Math.max(Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
      NuMax = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
      TuMax = Math.max(Math.abs(ef.mxStart), Math.abs(ef.mxEnd));
    }

    // ─── Flexure axis selection ───────────────────────────────
    // SEAM-3 identity is preserved: My and Mz are NEVER magnitude-sorted into a
    // single "Mu". For COLUMNS, the strong axis stays Mz (Mu, paired shear Vy)
    // and My is the weak/biaxial moment (Muy, paired shear Vz) — unchanged.
    //
    // For BEAMS, the primary flexural axis is chosen per element: in this
    // solver's local frame a horizontal beam's vertical-plane (gravity) bending
    // is My (depth = h, paired shear Vz), while horizontal-plane (lateral)
    // bending is Mz (depth = b, paired shear Vy). We pick the governing axis by
    // an elastic-stress proxy Mu/(width·depth²) that embeds the correct b/h, then
    // run the full CIRSOC check on that axis with the axis-correct section
    // orientation + paired shear. Columns previously "worked" only because their
    // gravity+lateral demand is genuinely Mz; beams were stuck at Mz → 0.
    const MuyMax = MyMax; // column weak-axis moment (biaxial) — unchanged
    let MuMax: number, VuMax: number, bFlex: number, hFlex: number;
    let flexureAxis: 'My' | 'Mz';
    if (isVertical) {
      MuMax = MzMax; VuMax = VyAbs; bFlex = section.b; hFlex = section.h; flexureAxis = 'Mz';
    } else {
      // My bends about local-y → depth h; Mz bends about local-z → depth b.
      const stressMy = MyMax / (section.b * section.h * section.h);
      const stressMz = MzMax / (section.h * section.b * section.b);
      if (stressMy >= stressMz) {
        flexureAxis = 'My'; MuMax = MyMax; VuMax = VzMax;
        bFlex = section.b; hFlex = section.h;            // standard orientation (depth h)
        // Re-point flexure/shear governing combos to the My/Vz pairing.
        if (stationGovCombos) {
          if (stationGovCombos.momentY) stationGovCombos.flexure = stationGovCombos.momentY;
          if (stationGovCombos.shearZ) stationGovCombos.shear = stationGovCombos.shearZ;
        }
      } else {
        flexureAxis = 'Mz'; MuMax = MzMax; VuMax = VyAbs;
        bFlex = section.h; hFlex = section.b;            // rotated orientation (depth b)
      }
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
      // Axis-correct section orientation for the governing beam axis (columns
      // keep their real b/h since they always use Mz).
      b: bFlex, h: hFlex, fc, fy: rebarFy, cover, stirrupDia,
      Muy: isVertical ? MuyMax : undefined,
      Vz: VzMax > 0.01 ? VzMax : undefined,
      Tu: TuMax > 0.001 ? TuMax : undefined,
      Lu: isVertical ? L : undefined, M1, M2, psiA, psiB,
    };

    const v = verifyElement(input);
    v.flexureAxis = flexureAxis;

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
