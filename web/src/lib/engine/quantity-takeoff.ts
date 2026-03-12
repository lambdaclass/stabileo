// Material Quantity Takeoff — computes concrete volumes and rebar weights
// from verification results + model geometry. Does NOT touch the solver.

import type { ElementVerification } from './codes/argentina/cirsoc201';

export interface ElementQuantity {
  elementId: number;
  elementType: 'beam' | 'column';
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
 * Compute material quantities from verification results and element lengths
 * @param verifications array of element verifications
 * @param elementLengths Map<elementId, length in m>
 */
export function computeQuantities(
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
