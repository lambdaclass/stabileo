/**
 * The rules every CIRSOC 201 calculation in this application shares.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * `beta1` was written five times: in `cirsoc201.ts`, `interaction-diagram.ts`,
 * `losas.ts`, and in the flanged and circular modules added beside them. The
 * five agreed, which is the good case and also the reason nobody noticed — a
 * duplicated rule is invisible until the day one copy is corrected.
 *
 * They will not stay agreed. §10.2.7.3 is a clause with a threshold and a
 * slope, and a reader who finds one of them wrong will fix the file they were
 * reading. The other four keep the old answer, the application quietly holds
 * two opinions about the same section, and which one you get depends on
 * whether you asked as a beam, a slab or a column.
 *
 * So the clause lives here once, and everything imports it. This is not a
 * refactor for tidiness: it is the difference between one correction and four.
 *
 * ── What belongs here, and what does not ───────────────────────────
 *
 * Only the parts of the code that are the same regardless of what is being
 * designed — a factor, a strain limit, a φ curve, an axial cap. The moment a
 * rule needs to know it is looking at a T beam or a circular column it belongs
 * to that module, because putting it here would make this file a second
 * implementation of everything rather than a shared basis for it.
 *
 * Nothing in here touches the solver. These are code provisions applied to
 * forces the solver has already produced.
 */

/** Concrete's assumed ultimate compressive strain, §10.2.3. */
export const EPSILON_CU = 0.003;

/** Steel's modulus, MPa. */
export const ES_MPA = 200_000;

/** Above this f'c, β₁ starts coming down. §10.2.7.3. */
const BETA1_THRESHOLD_MPA = 28;

/** φ for a tension-controlled section, §9.3.2.1. */
export const PHI_TENSION = 0.90;

/** φ for a compression-controlled section with closed ties, §9.3.2.2(b). */
export const PHI_COMPRESSION_TIED = 0.65;

/**
 * φ for a compression-controlled section with a spiral, CIRSOC 201-2005 §9.3.2.2(a).
 *
 * 0.70, which is CIRSOC 201-2005's value, and the one the CIRSOC FLEX
 * workbook computes with: against its own worked example, 0.75 made a 40 cm
 * spiral column come out with 15 % LESS steel than that workbook asks for.
 *
 * CIRSOC 201-2025 Tabla 21.2.2 (a) raised it to 0.75
 * (`PHI_COMPRESSION_SPIRAL_2025`), and that is the value the design paths
 * use (`phiByEdition`, `axialCap` with the edition). Ties stay 0.65 in both.
 */
export const PHI_COMPRESSION_SPIRAL = 0.70;

/** Net tensile strain at which a section is tension-controlled, §10.3.4. */
export const EPSILON_TENSION_CONTROLLED = 0.005;

/**
 * Which CIRSOC 201 edition a φ or an axial cap is computed by.
 *
 * '2005' is the ramp above (§9.3.2, spiral 0,70, tension-controlled at 0,005), which the CIRSOC
 * FLEX workbook and its calculator are validated against. '2025' is Tabla 21.2.2 (spiral 0,75,
 * tension-controlled at εty + 0,003) and Tabla 22.4.2.1, which is what the design verifier
 * applies and what its check rows are labelled with.
 */
export type Cirsoc201Edition = '2005' | '2025';

/** The edition the design paths compute φ and the axial cap by, and label their rows with. */
export const CIRSOC201_DESIGN_EDITION = '2025' as const satisfies Cirsoc201Edition;

/** φ for a compression-controlled section with a spiral, CIRSOC 201-2025 Tabla 21.2.2 (a). */
export const PHI_COMPRESSION_SPIRAL_2025 = 0.75;

/**
 * β₁ — the ratio of the equivalent rectangular stress block to the neutral
 * axis depth. §10.2.7.3.
 *
 * 0.85 up to 28 MPa, then down by 0.05 for every 7 MPa, never below 0.65.
 */
export function beta1(fc: number): number {
  if (fc <= BETA1_THRESHOLD_MPA) return 0.85;
  return Math.max(0.65, 0.85 - (0.05 * (fc - BETA1_THRESHOLD_MPA)) / 7);
}

/** Yield strain of the reinforcement. */
export function yieldStrain(fy: number): number {
  return fy / ES_MPA;
}

/**
 * φ from the net tensile strain in the extreme layer of tension steel.
 * §9.3.2 with §10.3.3–10.3.4.
 *
 * Compression-controlled below the yield strain, tension-controlled at or
 * above 5 ‰, and linear between — which is what makes the transition zone a
 * ramp rather than a step, and why a section just inside it is not penalised
 * as though it were brittle.
 *
 * `confinement` decides the lower end: a spiral keeps the core together after
 * the shell spalls and a tie does not, so the code credits it with 0.70
 * against 0.65. See `PHI_COMPRESSION_SPIRAL` for why it is 0.70 and not the
 * 0.75 most post-2008 tables print.
 */
export function phiFromStrain(
  epsT: number,
  fy: number,
  confinement: 'ties' | 'spiral' = 'ties',
): number {
  const ey = yieldStrain(fy);
  const phiC = confinement === 'spiral' ? PHI_COMPRESSION_SPIRAL : PHI_COMPRESSION_TIED;
  const eps = Math.abs(epsT);
  if (eps >= EPSILON_TENSION_CONTROLLED) return PHI_TENSION;
  if (eps <= ey) return phiC;
  return phiC + (PHI_TENSION - phiC) * ((eps - ey) / (EPSILON_TENSION_CONTROLLED - ey));
}

/**
 * φ by CIRSOC 201-2025 Tabla 21.2.2, from the net tensile strain εt of the extreme bar: the
 * compression-controlled value up to εty, 0,90 from εty + 0,003, and a straight line between.
 * Ties take 0,65 and spirals 0,75 (rows (b) and (a)). εty is fy/Es (21.2.2.1).
 *
 * Every design path reads it, through `phiByEdition` with `CIRSOC201_DESIGN_EDITION`: the
 * rectangular beams and columns directly, and the general section (shaped columns, walls, the
 * column editor's interaction plot) and the flanged beams through their `edition` argument.
 * `phiFromStrain` above keeps the 2005 values the CIRSOC FLEX calculator is validated against,
 * and is what those functions use when no edition is given.
 */
export function phiTable2122(epsT: number, fy: number, transverse: 'ties' | 'spiral' = 'ties'): number {
  const ety = yieldStrain(fy);
  const phiC = transverse === 'spiral' ? PHI_COMPRESSION_SPIRAL_2025 : PHI_COMPRESSION_TIED;
  const eps = epsT;
  if (eps >= ety + 0.003) return PHI_TENSION;
  if (eps <= ety) return phiC;
  return phiC + (PHI_TENSION - phiC) * ((eps - ety) / 0.003);
}

/**
 * φ by the edition asked for: `phiFromStrain` (2005) or `phiTable2122` (2025). `epsT` is the net
 * tensile strain of the extreme bar, tension positive.
 */
export function phiByEdition(
  epsT: number, fy: number, confinement: 'ties' | 'spiral' = 'ties', edition: Cirsoc201Edition = '2005',
): number {
  return edition === '2025' ? phiTable2122(epsT, fy, confinement) : phiFromStrain(epsT, fy, confinement);
}

/** The net tensile strain from which a section is tension-controlled, by edition. */
export function tensionControlledStrain(fy: number, edition: Cirsoc201Edition = '2005'): number {
  return edition === '2025' ? yieldStrain(fy) + 0.003 : EPSILON_TENSION_CONTROLLED;
}

/**
 * The nominal squash load: every bar yielding, the whole section in
 * compression, and the concrete the bars occupy not counted twice.
 *
 * `Ag` m², `Ast` m², result kN.
 */
export function squashLoad(fc: number, fy: number, Ag: number, Ast: number): number {
  return 0.85 * fc * 1000 * (Ag - Ast) + fy * 1000 * Ast;
}

/**
 * The largest fy, MPa, Po may be computed with: CIRSOC 201-2025 §22.4.2.1, "El valor de fy debe
 * limitarse a un máximo de 500 MPa" (C 22.4.2.1: the concrete reaches its capacity first).
 */
export const PO_FY_LIMIT_2025_MPA = 500;

/** The fy Po (22.4.2.2) is computed with: limited by §22.4.2.1 in 2025, as given in 2005. */
export function squashLoadFy(fy: number, edition: Cirsoc201Edition = '2005'): number {
  return edition === '2025' ? Math.min(fy, PO_FY_LIMIT_2025_MPA) : fy;
}

/**
 * The ceiling on design axial load: §10.3.6 (2005), Tabla 22.4.2.1 (2025).
 *
 * No column is loaded at a truly zero eccentricity, so the code refuses to
 * credit the pure-compression ordinate: 0.80 of it for ties, 0.85 for a
 * spiral, times the compression-controlled φ of the same edition (spiral
 * 0.70 in 2005, 0.75 in 2025; ties 0.65 in both). In 2025 the fy in Po is
 * limited to 500 MPa (§22.4.2.1).
 */
export function axialCap(
  fc: number, fy: number, Ag: number, Ast: number,
  confinement: 'ties' | 'spiral' = 'ties',
  edition: Cirsoc201Edition = '2005',
): number {
  const spiral = confinement === 'spiral';
  const phiC = !spiral ? PHI_COMPRESSION_TIED : edition === '2025' ? PHI_COMPRESSION_SPIRAL_2025 : PHI_COMPRESSION_SPIRAL;
  return phiC * (spiral ? 0.85 : 0.80) * squashLoad(fc, squashLoadFy(fy, edition), Ag, Ast);
}

/**
 * √f'c, MPa, in the concrete's share of one-way shear (Vc) and in torsion's Tth and Tcr: CIRSOC
 * 201-2025 §22.5.3.1, "Los valores de √f´c usados para calcular Vc, Vci y Vcw para corte en una
 * dirección no deben exceder 8,3 MPa, excepto en lo permitido en el artículo 22.5.3.2", and
 * §22.7.2.1, "Los valores de √f´c usados para calcular Tth y Tcr no deben exceder 8,3 MPa".
 * §22.5.3.2's permission (beams with the minimum web steel may go above it) is not taken: it is
 * a permission, and staying under the limit is always allowed.
 */
export const SQRT_FC_SHEAR_LIMIT_MPA = 8.3;
export const shearSqrtFc = (fc: number): number => Math.min(Math.sqrt(fc), SQRT_FC_SHEAR_LIMIT_MPA);

/**
 * fy and fyt, MPa, in Vs and in the transverse and longitudinal steel for torsion: §22.5.3.3 and
 * §22.7.2.2 send them to the limits of §20.2.1.3, the characteristic yield stress of Tablas 20.2.1
 * and 20.2.2, which for bars is 420 MPa (AL 220, ADN 420, ADN 420 S); 500 MPa is welded wire
 * (ATR 500 N, AM 500 N), which no stirrup here is. A 500 MPa bar (§20.2.1.4) is outside those
 * tables, so its Vs and its torsion steel read 420.
 */
export const SHEAR_FY_LIMIT_MPA = 420;
export const shearFy = (fy: number): number => Math.min(fy, SHEAR_FY_LIMIT_MPA);

/**
 * §10.9.1's bounds on longitudinal steel in a column, as a fraction of Ag.
 *
 * Exposed as a pair because sizing routines need both ends of the search and
 * a reader needs to be told which one they hit.
 */
export const COLUMN_STEEL_RATIO = { min: 0.01, max: 0.08 } as const;

/**
 * §9.6.1.2's minimum flexural steel, cm².
 *
 * `bw` is the WEB width and `d` the effective depth, both m. A flanged section
 * asked with its flange width would be told to place several times the steel
 * the clause wants — the flange is in compression and contributes nothing to a
 * minimum written for the tension side.
 */
export function minFlexuralSteelCm2(fc: number, fy: number, bw: number, d: number): number {
  const rhoMin = Math.max((0.25 * Math.sqrt(fc)) / fy, 1.4 / fy);
  return rhoMin * bw * d * 1e4;
}
