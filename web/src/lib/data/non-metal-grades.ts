/**
 * non-metal-grades.ts — concrete and timber, across codes.
 *
 * # The same distinction the metals make, and a sharper case of it
 *
 * `structural-grades.ts` separates the GRADE (what the producer certifies) from
 * the DESIGN CODE (what the engineer applies), because the same steel can be
 * checked to several codes. Concrete makes that distinction unavoidable, and in
 * a way steel never does:
 *
 *   **the elastic modulus is not a property of the concrete — it is a property
 *   of the code you are working to.**
 *
 * For a 25 MPa concrete:
 *
 * ```text
 *   CIRSOC 201 / ACI 318   E = 4700·sqrt(f'c)          = 23 500 MPa
 *   EN 1992-1-1            Ecm = 22000·((fck+8)/10)^0,3 = 31 500 MPa
 *   NBR 6118               Eci = 5600·sqrt(fck)         = 28 000 MPa
 * ```
 *
 * That is a 34% spread on the same material, and it goes straight into every
 * deflection the solver reports. It is not a rounding or a philosophical
 * difference: each code calibrated its own expression against its own tests and
 * its own safety format, and using one code's modulus inside another's checks is
 * simply wrong. So the code is part of the grade's identity here, not a filter
 * applied afterwards.
 *
 * # Strength classes are named differently, and not equivalently
 *
 * Argentina writes H-25 for a 25 MPa characteristic CYLINDER strength. Eurocode
 * writes C25/30, naming the cylinder AND the cube, because the cube test gives a
 * higher number for the same concrete. Brazil writes C25, cylinder. Reading
 * "C25/30" as "25 or 30, take your pick" is a common and expensive confusion,
 * so both figures are carried and labelled.
 *
 * # Timber
 *
 * EN 338 strength classes are the cleanest available: C for softwood, D for
 * hardwood, the number being the characteristic bending strength in MPa. The
 * class carries a whole property set — bending, tension, compression, shear,
 * modulus, density — which is what makes it a class rather than a grade.
 *
 * Timber is ORTHOTROPIC and a beam model is not, so the single `nu` and `e`
 * here are the along-the-grain values. That is the right simplification for a
 * frame analysis and the wrong one for anything that loads across the grain,
 * which is stated rather than left for a reader to discover.
 */

export type NonMetalFamily = 'concrete' | 'timber';
export type NonMetalRegion = 'AR' | 'EU' | 'US' | 'BR';

export interface ConcreteGrade {
  id: string;
  /** As written on a drawing: H-25, C25/30, f'c 4000 psi. */
  designation: string;
  family: 'concrete';
  region: NonMetalRegion;
  /** The design code whose modulus expression produced `e`. */
  code: string;
  /** Characteristic CYLINDER strength, MPa. The one every code checks against. */
  fck: number;
  /** Characteristic CUBE strength, MPa, where the code names it. */
  fckCube?: number;
  /** Elastic modulus, MPa — computed by that code's own expression. */
  e: number;
  nu: number;
  /** Weight density, kN/m³. Reinforced concrete runs about 1 kN/m³ heavier. */
  rho: number;
  note?: string;
}

export interface TimberGrade {
  id: string;
  designation: string;
  family: 'timber';
  region: NonMetalRegion;
  code: string;
  /** Characteristic bending strength, MPa — the number that names the class. */
  fmk: number;
  /** Mean modulus parallel to the grain, MPa. */
  e: number;
  nu: number;
  /** Weight density from the MEAN density, kN/m³ — the one for self-weight. */
  rho: number;
  /** Characteristic density, kg/m³ — the one connections are designed from. */
  rhoK: number;
  /** Characteristic shear strength, MPa. */
  fvk: number;
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Concrete
// ─────────────────────────────────────────────────────────────────────

/** ACI 318 and CIRSOC 201 share this expression. */
const eAci = (fck: number) => Math.round(4700 * Math.sqrt(fck));
/** EN 1992-1-1 table 3.1, from the MEAN strength `fcm = fck + 8`. */
const eEn = (fck: number) => Math.round(22000 * ((fck + 8) / 10) ** 0.3);
/**
 * NBR 6118:2014 §8.2.8, granite aggregate (alpha_E = 1,0): the SECANT modulus
 * Ecs = alpha_i · Eci, alpha_i = 0,8 + 0,2 fck/80 ≤ 1, Eci = 5600 √fck. Ecs is
 * the one the code prescribes for elastic analysis; this held Eci, 8-18 % stiffer.
 */
const eNbr = (fck: number) => Math.round(Math.min(1, 0.8 + 0.2 * fck / 80) * 5600 * Math.sqrt(fck));

const concrete = (
  id: string, designation: string, region: NonMetalRegion, code: string,
  fck: number, e: number, rho = 24, fckCube?: number, note?: string,
): ConcreteGrade => ({ id, designation, family: 'concrete', region, code, fck, fckCube, e, nu: 0.2, rho, note });

export const CONCRETE: ConcreteGrade[] = [
  // ── Argentina, CIRSOC 201 ──
  ...[20, 25, 30, 35, 40, 45, 50].map((f) =>
    // Unit weight: CIRSOC 101-2025 Tabla 3.1, «hormigón … armado» 25 kN/m³ (23,5 sin armar).
    // A frame member is reinforced; this held 24, 4 % light on self-weight.
    concrete(`cirsoc-h${f}`, `H-${f}`, 'AR', 'CIRSOC 201', f, eAci(f), 25)),

  // ── Europe, EN 1992-1-1. The pair is cylinder/cube for the SAME concrete:
  //    the cube test reads higher, it is not a second option. ──
  ...([[20, 25], [25, 30], [30, 37], [35, 45], [40, 50], [45, 55], [50, 60]] as const).map(
    ([f, cube]) => concrete(`en-c${f}`, `C${f}/${cube}`, 'EU', 'EN 1992-1-1', f, eEn(f), 25, cube)),  // EN 1991-1-1 Table A.1, reinforced

  // ── United States, ACI 318. Specified in psi, which is why the MPa values
  //    are the odd ones — 4000 psi is 27,6 MPa, not 25. ──
  concrete('aci-3000', "f'c 3000 psi", 'US', 'ACI 318', 20.7, eAci(20.7), 24, undefined, '3000 psi = 20,7 MPa.'),
  concrete('aci-4000', "f'c 4000 psi", 'US', 'ACI 318', 27.6, eAci(27.6), 24, undefined, '4000 psi = 27,6 MPa.'),
  concrete('aci-5000', "f'c 5000 psi", 'US', 'ACI 318', 34.5, eAci(34.5), 24, undefined, '5000 psi = 34,5 MPa.'),
  concrete('aci-6000', "f'c 6000 psi", 'US', 'ACI 318', 41.4, eAci(41.4), 24.5, undefined, '6000 psi = 41,4 MPa.'),

  // ── Brazil, NBR 6118. Modulus for granite aggregate; NBR scales it by the
  //    aggregate type, which no other code here does. ──
  ...[20, 25, 30, 35, 40, 45, 50].map((f) =>
    concrete(`nbr-c${f}`, `C${f}`, 'BR', 'NBR 6118', f, eNbr(f), 25,  // NBR 6120: concreto armado 25
      undefined, 'Ecs (secante) para agregado de granito (αE = 1,0).')),
];

// ─────────────────────────────────────────────────────────────────────
// Timber — EN 338 strength classes
// ─────────────────────────────────────────────────────────────────────

const timber = (
  id: string, designation: string, region: NonMetalRegion, code: string,
  fmk: number, e: number, rhoK: number, rhoMean: number, fvk: number, note?: string,
): TimberGrade => ({
  id, designation, family: 'timber', region, code, fmk, e,
  // Along the grain. A frame model has one modulus and timber has three, so
  // this is the one that governs a beam — and the wrong one for cross-grain.
  nu: 0.3,
  rho: Math.round((rhoMean * 9.81) / 100) / 10,
  rhoK, fvk, note,
});

export const TIMBER: TimberGrade[] = [
  // Softwood. C24 is the European default for structural framing.
  timber('en338-c16', 'C16', 'EU', 'EN 338', 16, 8000, 310, 370, 3.2),
  timber('en338-c18', 'C18', 'EU', 'EN 338', 18, 9000, 320, 380, 3.4),
  timber('en338-c20', 'C20', 'EU', 'EN 338', 20, 9500, 330, 390, 3.6),
  timber('en338-c22', 'C22', 'EU', 'EN 338', 22, 10000, 340, 410, 3.8),
  timber('en338-c24', 'C24', 'EU', 'EN 338', 24, 11000, 350, 420, 4.0, 'La clase corriente en estructuras europeas.'),
  timber('en338-c27', 'C27', 'EU', 'EN 338', 27, 11500, 370, 450, 4.0),
  timber('en338-c30', 'C30', 'EU', 'EN 338', 30, 12000, 380, 460, 4.0),
  timber('en338-c35', 'C35', 'EU', 'EN 338', 35, 13000, 400, 480, 4.0),
  timber('en338-c40', 'C40', 'EU', 'EN 338', 40, 14000, 420, 500, 4.0),
  // Hardwood: denser, stiffer, and the classes run higher.
  timber('en338-d30', 'D30', 'EU', 'EN 338', 30, 11000, 530, 640, 4.0),
  timber('en338-d40', 'D40', 'EU', 'EN 338', 40, 13000, 550, 660, 4.0),
  timber('en338-d50', 'D50', 'EU', 'EN 338', 50, 14000, 620, 750, 4.0),
  timber('en338-d60', 'D60', 'EU', 'EN 338', 60, 17000, 700, 840, 4.0),
];

export const ALL_CONCRETE = CONCRETE;
export const ALL_TIMBER = TIMBER;

/** Design codes that appear for a non-metal family. */
export function concreteCodes(): string[] {
  return [...new Set(CONCRETE.map((c) => c.code))];
}
export function timberCodes(): string[] {
  return [...new Set(TIMBER.map((c) => c.code))];
}

/**
 * The same concrete strength under each code's own modulus expression.
 *
 * Exposed because the spread IS the lesson: the identical material comes out
 * up to 40% stiffer under Eurocode than under ACI, and every deflection the
 * solver reports moves with it.
 */
export function modulusByCode(fck: number): Array<{ code: string; e: number }> {
  return [
    { code: 'CIRSOC 201 / ACI 318', e: eAci(fck) },
    { code: 'EN 1992-1-1', e: eEn(fck) },
    { code: 'NBR 6118', e: eNbr(fck) },
  ];
}
