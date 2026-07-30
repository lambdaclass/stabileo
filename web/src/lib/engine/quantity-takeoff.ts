/**
 * LEGACY, VERIFICATION-ONLY quantity takeoff — NOT the coordinated source.
 *
 * ── What this is, and what it must never be used for ───────────────
 *
 * This estimates steel from VERIFICATION RECORDS: an `AsProv` in cm², a stirrup spacing, and
 * an assumed perimeter with `+ 0,2` added for the hooks. That is a reasonable estimate for a
 * model that has been checked but never detailed, and it is the only thing available there.
 *
 * It is NOT the answer once coordinated detailing has run. A detailed assembly contains the
 * actual `BarPath`s — real bends at the Table 25.3.2 mandrel, real hook extensions, real
 * stations, real crossties and joint ties that no `AsProv` knows about — and its quantities
 * come from `assignMarks` → `buildSchedule`, which reads those paths. Two estimators over one
 * cage disagree by construction: this one cannot see a crosstie, and it invents a hook
 * allowance the geometry already states exactly.
 *
 * So the two are kept apart deliberately:
 *
 *   coordinated detailing   `assignMarks(assembly.bars)` → `buildSchedule(marks)`.
 *                           The ONLY source for piece count, mark, diameter, cutting length,
 *                           total length and mass. Reconciled against the paths by
 *                           `transverse-marks.test.ts` and `quantity-reconciliation.test.ts`.
 *   no detailing yet        this module, for a rough bill against verification output.
 *
 * There is currently NO production caller. It is retained for the un-detailed workflow and
 * named so that wiring it into a detailed one is an obvious mistake rather than a silent one.
 * If it ever acquires a caller in the detailing path, that is the defect.
 *
 * Does NOT touch the solver.
 */

import type { ElementVerification } from './codes/argentina/cirsoc201';

export interface ElementQuantity {
  elementId: number;
  elementType: 'beam' | 'column' | 'wall';
  length: number;          // m
  concreteVolume: number;  // m³
  rebarWeight: number;     // kg (longitudinal)
  stirrupWeight: number;   // kg
  totalSteelWeight: number; // kg
}

export interface QuantitySummary {
  elements: ElementQuantity[];
  totalConcreteVolume: number;  // m³
  totalRebarWeight: number;     // kg
  totalStirrupWeight: number;   // kg
  totalSteelWeight: number;     // kg
  steelRatio: number;           // kg steel / m³ concrete
}

/**
 * Estimate quantities from verification results — see the module note before using this.
 *
 * Named for what it reads. `computeQuantities` invited exactly the confusion this module
 * exists to prevent: it sounds like the quantities, and it is an estimate made without the
 * geometry.
 */
export function estimateQuantitiesFromVerification(
  verifications: ElementVerification[],
  elementLengths: Map<number, number>,
): QuantitySummary {
  const elements: ElementQuantity[] = [];
  let totalConcreteVolume = 0;
  let totalRebarWeight = 0;
  let totalStirrupWeight = 0;

  for (const v of verifications) {
    const L = elementLengths.get(v.elementId) ?? 0;
    if (L <= 0) continue;

    // Concrete volume
    const concreteVolume = v.b * v.h * L;

    // Longitudinal rebar weight
    // Steel density = 7850 kg/m³
    const STEEL_DENSITY = 7850; // kg/m³
    let AsProv_m2: number;
    if (v.column) {
      AsProv_m2 = v.column.AsProv * 1e-4; // cm² → m²
    } else {
      AsProv_m2 = v.flexure.AsProv * 1e-4;
    }
    const rebarWeight = AsProv_m2 * L * STEEL_DENSITY;

    // Stirrup weight
    const stirrupPerimeter = 2 * (v.b - 2 * v.cover) + 2 * (v.h - 2 * v.cover) + 0.2; // + hooks
    const stirrupDia_m = v.shear.stirrupDia / 1000;
    const stirrupArea_m2 = Math.PI / 4 * stirrupDia_m * stirrupDia_m * v.shear.stirrupLegs;
    const nStirrups = Math.ceil(L / v.shear.spacing);
    const stirrupWeight = nStirrups * stirrupPerimeter * (stirrupArea_m2 / v.shear.stirrupLegs) * STEEL_DENSITY;

    const totalSteelWeight = rebarWeight + stirrupWeight;

    elements.push({
      elementId: v.elementId,
      elementType: v.elementType,
      length: L,
      concreteVolume,
      rebarWeight,
      stirrupWeight,
      totalSteelWeight,
    });

    totalConcreteVolume += concreteVolume;
    totalRebarWeight += rebarWeight;
    totalStirrupWeight += stirrupWeight;
  }

  const totalSteelWeight = totalRebarWeight + totalStirrupWeight;
  const steelRatio = totalConcreteVolume > 0 ? totalSteelWeight / totalConcreteVolume : 0;

  return {
    elements,
    totalConcreteVolume,
    totalRebarWeight,
    totalStirrupWeight,
    totalSteelWeight,
    steelRatio,
  };
}
