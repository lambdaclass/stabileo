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

/** φ for a compression-controlled section with a spiral, §9.3.2.2(a). */
export const PHI_COMPRESSION_SPIRAL = 0.75;

/** Net tensile strain at which a section is tension-controlled, §10.3.4. */
export const EPSILON_TENSION_CONTROLLED = 0.005;

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
 * the shell spalls and a tie does not, so the code credits it with 0.75
 * against 0.65.
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
 * The nominal squash load: every bar yielding, the whole section in
 * compression, and the concrete the bars occupy not counted twice.
 *
 * `Ag` m², `Ast` m², result kN.
 */
export function squashLoad(fc: number, fy: number, Ag: number, Ast: number): number {
  return 0.85 * fc * 1000 * (Ag - Ast) + fy * 1000 * Ast;
}

/**
 * §10.3.6's ceiling on design axial load.
 *
 * No column is loaded at a truly zero eccentricity, so the code refuses to
 * credit the pure-compression ordinate: 0.80 of it for ties, 0.85 for a
 * spiral, times the compression-controlled φ.
 */
export function axialCap(
  fc: number, fy: number, Ag: number, Ast: number,
  confinement: 'ties' | 'spiral' = 'ties',
): number {
  const spiral = confinement === 'spiral';
  const phiC = spiral ? PHI_COMPRESSION_SPIRAL : PHI_COMPRESSION_TIED;
  return phiC * (spiral ? 0.85 : 0.80) * squashLoad(fc, fy, Ag, Ast);
}

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
