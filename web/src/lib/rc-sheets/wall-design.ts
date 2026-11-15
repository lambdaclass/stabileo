/**
 * Wall checks — CIRSOC 201-2025 Chapter 11.
 *
 * ── Where the demand comes from ────────────────────────────────
 *
 * The same `QuadStress` the slab engine reads, used differently. For a wall the
 * membrane components carry the work: `sigmaYy` integrated over the thickness gives the
 * vertical axial force per unit length, `tauXy` gives the in-plane shear flow, and the
 * variation of `sigmaYy` across the wall length gives the in-plane bending. Out-of-plane
 * bending comes from `mx`/`my`.
 *
 * ── Normative content ──────────────────────────────────────────
 *
 * §11.3.1.1  minimum thickness: the greater of 100 mm and 1/25 of the lesser of the
 *            unsupported length and unsupported height, for bearing walls
 * §11.5.4.2  in-plane shear strength V_n ≤ 0,66 √f'c A_cv (0,83 in CIRSOC 201-2005)
 * §11.6.1    minimum distributed reinforcement, Tabla 11.6.1, by each direction's bar size
 *            and f_y; §11.6.2 where the in-plane shear passes 0,04·φ·λ·√f'c·Acv
 * §11.7.2    longitudinal bar spacing ≤ the lesser of 3h and 450 mm
 * §11.7.3    transverse bar spacing ≤ the lesser of 3h and 450 mm
 * §11.7.5    reinforcement around openings
 *
 * ── Seismic ────────────────────────────────────────────────────
 *
 * Boundary elements are a seismic-detailing subject governed by INPRES-CIRSOC 103
 * Parte II, which is not implemented here. A wall in a seismic project therefore gets an
 * explicit unsupported condition rather than a non-seismic boundary element that would
 * look like a complete design. That is the honest split between this branch and PR19.
 *
 * Pure: no store, no runes. Forces kN, lengths m, stresses MPa.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../codes/regulation';
import { sqrtFcCapped } from '../engine/detailing/punching-shear';

/** §21.2 — φ for shear and for compression-controlled sections. */
export const PHI_WALL_SHEAR = 0.75;
export const PHI_WALL_AXIAL = 0.65;

// ─── Minimum reinforcement ───────────────────────────────────────

export interface WallReinforcementRatios {
  /** Longitudinal (vertical) ratio ρ_l. */
  rhoL: number;
  /** Transverse (horizontal) ratio ρ_t. */
  rhoT: number;
  refs: ClauseRef[];
  note: string;
}

/** P, M and V at a wall's base from its bottom strips; `sigma` is negative in compression and `pu` comes out positive. */
export function wallBaseResultants(
  strips: ReadonlyArray<{ u: number; width: number; thickness: number; sigma: number; tau: number }>, centre: number,
): { pu: number; mu: number; vu: number } {
  let pu = 0, mu = 0, vu = 0;
  for (const s of strips) {
    const f = -s.sigma * s.thickness * s.width;
    pu += f;
    mu += f * (s.u - centre);
    vu += s.tau * s.thickness * s.width;
  }
  return { pu, mu, vu };
}

/**
 * The minimum distributed reinforcement of a cast-in-place wall, CIRSOC 201-2025 §11.6
 * (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-11-tabiques.md:517-575, 590-608).
 *
 * Vu ≤ 0,04·φ·λ·√f'c·Acv in the plane (§11.6.1), Tabla 11.6.1, deformed bars cast in place, by
 * the size of the bars in each direction (ρl for the verticals, ρt for the horizontals):
 *     ≤ 16 mm, fy ≥ 420 MPa:   ρl 0,0012   ρt 0,0020
 *     ≤ 16 mm, fy < 420 MPa:   ρl 0,0015   ρt 0,0025
 *     > 16 mm, any fy:         ρl 0,0015   ρt 0,0025
 * Vu above it (§11.6.2): ρt ≥ 0,0025 and ρl ≥ max(0,0025; 0,0025 + 0,5·(2,5 − hw/ℓw)·(ρt − 0,0025))
 * (11.6.2), ρt the horizontal ratio provided. "No necesita exceder el ρt requerido para
 * resistencia" is a relaxation and is not taken. √f'c is capped at 8,3 MPa in the threshold (the
 * lower threshold: the safe side).
 *
 * Without `shear` (the in-plane shear unknown) the table applies.
 */
export function minimumWallRatios(
  barDiameterMm: number, fy: number, edition: RegulationEdition,
  opts: {
    /** The horizontal bars' diameter, when it is not the verticals'. */
    horizontalDiameterMm?: number;
    shear?: { vu: number; fc: number; acv: number; hw: number; lw: number; rhoTProvided?: number };
  } = {},
): WallReinforcementRatios {
  const hd = opts.horizontalDiameterMm ?? barDiameterMm;
  const small = (d: number) => d <= 16 && fy >= 420;
  const sh = opts.shear;
  const threshold = sh ? 0.04 * PHI_WALL_SHEAR * sqrtFcCapped(sh.fc) * sh.acv * 1000 : Number.POSITIVE_INFINITY;
  if (sh && sh.vu > threshold) {
    const rhoT = 0.0025;
    const rt = Math.max(sh.rhoTProvided ?? rhoT, rhoT);
    const rhoL = Math.max(0.0025, 0.0025 + 0.5 * (2.5 - sh.hw / sh.lw) * (rt - 0.0025));
    return {
      rhoL, rhoT,
      refs: [clause('cirsoc-201', edition, '11.6.2', 'armadura mínima de tabiques con corte en el plano')],
      note: `Vu = ${sh.vu.toFixed(0)} kN > 0,04·φ·√f'c·Acv = ${threshold.toFixed(0)} kN: rigen ρt ≥ 0,0025 y ρl ≥ ${rhoL.toFixed(4)} (11.6.2).`,
    };
  }
  const rhoL = small(barDiameterMm) ? 0.0012 : 0.0015;
  const rhoT = small(hd) ? 0.0020 : 0.0025;
  return {
    rhoL, rhoT,
    refs: [clause('cirsoc-201', edition, '11.6.1', 'límites de la armadura en tabiques')],
    note: `Tabla 11.6.1: verticales Ø${barDiameterMm} ${small(barDiameterMm) ? '≤ 16 mm con fy ≥ 420 MPa' : '> 16 mm o fy < 420 MPa'} → ρl ≥ ${rhoL}; `
      + `horizontales Ø${hd} ${small(hd) ? '≤ 16 mm con fy ≥ 420 MPa' : '> 16 mm o fy < 420 MPa'} → ρt ≥ ${rhoT}.`
      + (small(barDiameterMm) && small(hd) ? ' Se aplican las cuantías reducidas.' : ' NO corresponden las cuantías reducidas en todas las direcciones.'),
  };
}

/** §11.7.2 / §11.7.3 — maximum bar spacing, the lesser of 3h and 450 mm. */
export function maxWallSpacing(
  thickness: number, edition: RegulationEdition,
): { spacing: number; refs: ClauseRef[] } {
  return {
    spacing: Math.min(3 * thickness, 0.45),
    refs: [clause('cirsoc-201', edition, '11.7.2', 'separación de la armadura longitudinal')],
  };
}

/** §11.3.1.1 — minimum thickness for a bearing wall. */
export function minimumWallThickness(
  unsupportedHeight: number, unsupportedLength: number, edition: RegulationEdition,
): { thickness: number; refs: ClauseRef[] } {
  return {
    thickness: Math.max(0.10, Math.min(unsupportedHeight, unsupportedLength) / 25),
    refs: [clause('cirsoc-201', edition, '11.3.1.1', 'espesor mínimo de tabiques')],
  };
}

// ─── In-plane shear ──────────────────────────────────────────────

export interface WallShearResult {
  /** Gross shear area A_cv, m². */
  acv: number;
  /** Applied factored shear, kN. */
  vu: number;
  /** φV_n, kN. */
  phiVn: number;
  /** The §11.5.4.6 upper limit on V_n, kN. */
  vnLimit: number;
  utilization: number;
  ok: boolean;
  /** True when the section is at the code's absolute ceiling and steel cannot help. */
  atLimit: boolean;
  memo: string;
  refs: ClauseRef[];
}

/**
 * In-plane shear per §11.5.4.
 *
 * The §11.5.4.2 ceiling matters and is checked explicitly: above `0,66 √f'c A_cv` the
 * wall fails by web crushing and adding horizontal steel does not help. Reporting a
 * shortfall that more reinforcement would fix, when it would not, sends the engineer
 * down the wrong path.
 */
export function checkWallInPlaneShear(opts: {
  length: number;
  thickness: number;
  fc: number;
  vu: number;
  /** Horizontal reinforcement ratio actually provided. */
  rhoT: number;
  fy: number;
  lambda?: number;
  edition: RegulationEdition;
}): WallShearResult {
  const acv = opts.length * opts.thickness;
  const root = sqrtFcCapped(opts.fc);
  const lambda = opts.lambda ?? 1;

  // Vc for a wall, the simple lower-bound form: 0,17 λ √f'c A_cv.
  const vc = 0.17 * lambda * root * acv * 1000;
  const vs = opts.rhoT * opts.fy * acv * 1000;
  // §11.5.4.2: Vn is capped at 0,66·√f'c·Acv. (0,83 was the CIRSOC 201-2005
  // value, reduced in the 2025 edition because Acv grew from h·d to h·ℓw.)
  const vnLimit = 0.66 * root * acv * 1000;
  const vn = Math.min(vc + vs, vnLimit);
  const phiVn = PHI_WALL_SHEAR * vn;
  const atLimit = vc + vs >= vnLimit - 1e-9;

  return {
    acv, vu: opts.vu, phiVn, vnLimit,
    utilization: phiVn > 0 ? opts.vu / phiVn : Infinity,
    ok: opts.vu <= phiVn,
    atLimit,
    memo:
      `Acv = ${opts.length.toFixed(2)} × ${opts.thickness.toFixed(3)} = ${acv.toFixed(3)} m². ` +
      `Vn = mín(Vc + Vs, 0,66√f´c·Acv) = mín(${((vc + vs) / 1).toFixed(0)}; ` +
      `${vnLimit.toFixed(0)}) = ${vn.toFixed(0)} kN; φVn = ${phiVn.toFixed(0)} kN contra ` +
      `Vu = ${opts.vu.toFixed(0)} kN.` +
      (atLimit
        ? ' La sección está en el techo de 11.5.4.2: por encima de ese valor el tabique ' +
          'falla por aplastamiento del alma y agregar armadura horizontal no ayuda.'
        : ''),
    refs: [
      clause('cirsoc-201', opts.edition, '11.5.4', 'esfuerzo de corte en el plano del tabique'),
      clause('cirsoc-201', opts.edition, '11.5.4.2', 'límite superior de Vn'),
    ],
  };
}

// ─── Axial-flexural interaction ──────────────────────────────────

export interface WallAxialFlexureResult {
  /** Design moment capacity at the applied axial load, kN·m, when read by strain compatibility. */
  phiMn?: number;
  /** Factored axial force, kN, compression positive. */
  pu: number;
  /** Factored in-plane moment, kN·m. */
  mu: number;
  /** Nominal axial capacity at zero eccentricity, kN. */
  pn0: number;
  /** Approximate moment capacity at the applied axial load, kN·m. */
  mn: number;
  utilization: number;
  ok: boolean;
  memo: string;
  refs: ClauseRef[];
}

/**
 * Axial-flexural interaction, by the simplified sectional approach.
 *
 * The moment capacity uses the standard distributed-steel expression for a rectangular
 * wall: the vertical steel is smeared over the length, and the axial load raises the
 * moment capacity up to the balance point. This is an approximation of the true
 * interaction surface and is stated as one — the maturity record calls it provisional
 * and the promotion path is a benchmark against a full interaction diagram.
 */
export function checkWallAxialFlexure(opts: {
  length: number;
  thickness: number;
  fc: number;
  fy: number;
  /** Vertical reinforcement ratio provided. */
  rhoL: number;
  pu: number;
  mu: number;
  edition: RegulationEdition;
}): WallAxialFlexureResult {
  const ag = opts.length * opts.thickness;
  const ast = opts.rhoL * ag;
  // §22.4.2.2 — nominal axial strength at zero eccentricity.
  const pn0 = (0.85 * opts.fc * (ag - ast) + opts.fy * ast) * 1000;

  // Distributed vertical steel in a rectangular wall:
  //   Mn ≈ 0,5 Ast fy lw (1 + Pu/(Ast fy)) (1 − c/lw)
  // with c/lw from the standard approximation. Conservative for low axial load.
  const astFy = ast * opts.fy * 1000;
  const omega = astFy > 0 ? opts.pu / astFy : 0;
  const cOverLw = Math.min(0.6, (omega + opts.rhoL * opts.fy / (0.85 * opts.fc))
    / (2 * omega + 0.85));
  const mn = 0.5 * astFy * opts.length * (1 + omega) * (1 - cOverLw);

  const phiMn = PHI_WALL_AXIAL * mn;
  const phiPn0 = PHI_WALL_AXIAL * pn0;

  // Combined check: axial and moment, on the conservative linear envelope.
  const util = (phiPn0 > 0 ? opts.pu / phiPn0 : Infinity)
    + (phiMn > 0 ? opts.mu / phiMn : Infinity);

  return {
    pu: opts.pu, mu: opts.mu, pn0, mn,
    utilization: util,
    ok: util <= 1.0,
    memo:
      `Ast = ${(ast * 1e4).toFixed(1)} cm²; Pn0 = ${pn0.toFixed(0)} kN, ` +
      `Mn ≈ ${mn.toFixed(0)} kN·m. Interacción lineal conservadora: ` +
      `Pu/φPn0 + Mu/φMn = ${util.toFixed(3)}.`,
    refs: [
      clause('cirsoc-201', opts.edition, '11.5.2', 'carga axial y flexión en el plano'),
      clause('cirsoc-201', opts.edition, '22.4.2', 'resistencia axial máxima'),
    ],
  };
}
