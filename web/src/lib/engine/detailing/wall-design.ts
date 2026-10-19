/**
 * Wall design — CIRSOC 201-2025 Chapter 11.
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

import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { deriveMaturity, type MaturityRecord } from '../../codes/maturity';
import { msg } from '../../codes/message';
import { sqrtFcCapped } from './punching-shear';
import type { WallReinforcement } from '../../design-contract/reinforcement';
import { proposeWallReinforcement, wallInPlane, wallOpenings, wallOutOfPlane } from './wall-member';
import { wallCurtains } from './floor-transverse';

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

// ─── The wall ────────────────────────────────────────────────────

export interface WallDesignInput {
  wallId: string;
  length: number;
  height: number;
  thickness: number;
  cover: number;
  fc: number;
  fy: number;
  /** Chosen bar diameter for the distributed reinforcement, mm. */
  barDiameterMm: number;
  edition: RegulationEdition;
  /** Factored demands from the shell envelope. */
  pu: number;
  muInPlane: number;
  vuInPlane: number;
  /** Out-of-plane moment per metre, kN·m/m: bending the verticals (the larger one). */
  muOutOfPlane?: number;
  /** Out-of-plane moment per metre bending the horizontals, kN·m/m. */
  muOutOfPlaneHorizontal?: number;
  /** Reinforcement a person set; absent, the design proposes it. */
  provided?: WallReinforcement;
  /** Openings in the wall on this level. */
  openingCount?: number;
  openings?: Array<{ x: number; y: number; w: number; h: number }>;
  /** True when the project requires seismic design. */
  seismicRequired: boolean;
  /** True when this wall is coupled to another by coupling beams. */
  coupled?: boolean;
}

export interface WallDesignResult {
  wallId: string;
  ratios: WallReinforcementRatios;
  /** Vertical bar spacing, m. */
  verticalSpacing: number;
  /** Horizontal bar spacing, m. */
  horizontalSpacing: number;
  shear: WallShearResult;
  axialFlexure: WallAxialFlexureResult;
  minThickness: number;
  thicknessOk: boolean;
  maturity: MaturityRecord;
  memo: string[];
  refs: ClauseRef[];
  unsupported: string[];
  /** The reinforcement checked: the person's, or the design's proposal. */
  reinforcement: WallReinforcement;
  /** Out of the plane and around the openings (`wall-member.ts`). */
  checks: Array<{ category: string; utilization: number; description: string; ok: boolean }>;
  /** What it was designed from, without the bars: the editor re-checks a draft on it. */
  input: Omit<WallDesignInput, 'provided'>;
}

const BAR_AREA = (d: number) => Math.PI * (d / 2000) ** 2;

/** Design one wall. */
export function designWall(input: WallDesignInput): WallDesignResult {
  const memo: string[] = [];
  const refs: ClauseRef[] = [];
  const unsupported: string[] = [];

  const wallShear = { vu: input.vuInPlane, fc: input.fc, acv: input.length * input.thickness, hw: input.height, lw: input.length };
  const ratios = minimumWallRatios(input.barDiameterMm, input.fy, input.edition, { shear: wallShear });
  memo.push(ratios.note);
  refs.push(...ratios.refs);

  const minT = minimumWallThickness(input.height, input.length, input.edition);
  refs.push(...minT.refs);
  const thicknessOk = input.thickness >= minT.thickness - 1e-9;
  memo.push(
    `Espesor ${(input.thickness * 1000).toFixed(0)} mm contra el mínimo de ` +
    `${(minT.thickness * 1000).toFixed(0)} mm (11.3.1.1).`);
  if (!thicknessOk) {
    unsupported.push(
      `El espesor de ${(input.thickness * 1000).toFixed(0)} mm no alcanza el mínimo ` +
      `reglamentario de ${(minT.thickness * 1000).toFixed(0)} mm.`);
  }

  // Two curtains, so the area per curtain is half the required total.
  const { spacing: sMax, refs: spacingRefs } = maxWallSpacing(input.thickness, input.edition);
  refs.push(...spacingRefs);
  const area = BAR_AREA(input.barDiameterMm);
  const asVertPerM = ratios.rhoL * input.thickness;
  const asHorPerM = ratios.rhoT * input.thickness;
  // §11.7.2.3: two curtains past 250 mm, one below; the spacing is for the curtains there are.
  const curtains = wallCurtains(input.thickness);
  const minVertical = Math.min(sMax, Math.floor((curtains * area / asVertPerM) / 0.025) * 0.025);
  const minHorizontal = Math.min(sMax, Math.floor((curtains * area / asHorPerM) / 0.025) * 0.025);
  const openingCount = input.openingCount ?? input.openings?.length ?? 0;
  // The person's bars, or the design's: the distributed minimum, boundary bars where the in-plane
  // moment needs them, and the opening bars.
  const r: WallReinforcement = input.provided ?? proposeWallReinforcement({
    length: input.length, thickness: input.thickness, cover: input.cover, fc: input.fc, fy: input.fy,
    pu: input.pu, mu: input.muInPlane, barDiameterMm: input.barDiameterMm,
    verticalSpacing: minVertical, horizontalSpacing: minHorizontal, curtains, openingCount,
  });
  const verticalSpacing = r.vertical.spacing;
  const horizontalSpacing = r.horizontal.spacing;
  memo.push(
    `${r.curtains === 2 ? 'Dos cortinas' : 'Una cortina'}: verticales Ø${r.vertical.diameter} c/${(verticalSpacing * 1000).toFixed(0)} mm, ` +
    `horizontales Ø${r.horizontal.diameter} c/${(horizontalSpacing * 1000).toFixed(0)} mm (máximo ` +
    `${(sMax * 1000).toFixed(0)} mm)` +
    (r.boundary ? `; ${r.boundary.count}Ø${r.boundary.diameter} en cada extremo` : '') + '.');
  const checks: WallDesignResult['checks'] = [];
  const rhoLProvided = (r.curtains * BAR_AREA(r.vertical.diameter) / verticalSpacing) / input.thickness;
  const rhoTProvided = (r.curtains * BAR_AREA(r.horizontal.diameter) / horizontalSpacing) / input.thickness;
  // The minimum of the bars there are: Tabla 11.6.1 reads each direction's own bar size, and
  // 11.6.2's ρl the horizontal ratio provided.
  const placed = minimumWallRatios(r.vertical.diameter, input.fy, input.edition, {
    horizontalDiameterMm: r.horizontal.diameter, shear: { ...wallShear, rhoTProvided: rhoTProvided },
  });
  const minClause = placed.refs[0]!.clause;
  checks.push({ category: 'Min vertical ratio', utilization: placed.rhoL / Math.max(rhoLProvided, 1e-12), ok: rhoLProvided >= placed.rhoL - 1e-12, description: `ρl = ${(rhoLProvided * 100).toFixed(3)}% ≥ ${(placed.rhoL * 100).toFixed(3)}%, Ø${r.vertical.diameter}, fy ${input.fy} MPa (${minClause})` });
  checks.push({ category: 'Min horizontal ratio', utilization: placed.rhoT / Math.max(rhoTProvided, 1e-12), ok: rhoTProvided >= placed.rhoT - 1e-12, description: `ρt = ${(rhoTProvided * 100).toFixed(3)}% ≥ ${(placed.rhoT * 100).toFixed(3)}%, Ø${r.horizontal.diameter}, fy ${input.fy} MPa (${minClause})` });
  checks.push({ category: 'Bar spacing', utilization: Math.max(verticalSpacing, horizontalSpacing) / sMax, ok: Math.max(verticalSpacing, horizontalSpacing) <= sMax + 1e-9, description: `s = ${(Math.max(verticalSpacing, horizontalSpacing) * 1000).toFixed(0)} mm ≤ ${(sMax * 1000).toFixed(0)} mm (11.7.2)` });

  const shear = checkWallInPlaneShear({
    length: input.length, thickness: input.thickness, fc: input.fc,
    vu: input.vuInPlane, rhoT: rhoTProvided, fy: input.fy, edition: input.edition,
  });
  memo.push(shear.memo);
  refs.push(...shear.refs);
  if (!shear.ok) {
    unsupported.push(
      shear.atLimit
        ? 'El corte en el plano excede el techo de 11.5.4.6: se requiere mayor espesor o ' +
          'longitud, no más armadura.'
        : `El corte en el plano no verifica (utilización ${shear.utilization.toFixed(2)}).`);
  }

  // In-plane axial force and moment on the wall's own bars, by strain compatibility.
  const inPlane = wallInPlane({ length: input.length, thickness: input.thickness, cover: input.cover, fc: input.fc, fy: input.fy, pu: input.pu, mu: input.muInPlane, r });
  const ag = input.length * input.thickness;
  const ast = rhoLProvided * ag;
  const axialFlexure: WallAxialFlexureResult = {
    pu: input.pu, mu: input.muInPlane,
    pn0: (0.85 * input.fc * (ag - ast) + input.fy * ast) * 1000,
    mn: inPlane.phiMn, phiMn: inPlane.phiMn,
    utilization: inPlane.utilization, ok: inPlane.ok,
    memo: `Flexocompresión en el plano por compatibilidad de deformaciones sobre las barras del tabique: ${inPlane.description}.`,
    refs: [
      clause('cirsoc-201', input.edition, '11.5.2', 'carga axial y flexión en el plano'),
      clause('cirsoc-201', input.edition, '22.4.2', 'resistencia axial máxima'),
    ],
  };
  memo.push(axialFlexure.memo);
  refs.push(...axialFlexure.refs);
  if (!axialFlexure.ok) {
    unsupported.push(
      `La interacción carga axial-flexión no verifica ` +
      `(utilización ${Number.isFinite(axialFlexure.utilization) ? axialFlexure.utilization.toFixed(2) : '∞'}).`);
  }

  // Out of the plane, on a metre strip (11.5.2.2), and around the openings (11.7.5).
  for (const c of wallOutOfPlane({ length: input.length, thickness: input.thickness, cover: input.cover, fc: input.fc, fy: input.fy, pu: input.pu, muV: input.muOutOfPlane ?? 0, muH: input.muOutOfPlaneHorizontal ?? 0, r })) {
    checks.push(c);
    if (!c.ok) unsupported.push(`${c.category}: no verifica (${c.description}).`);
  }
  const op = wallOpenings(openingCount, r);
  if (op) {
    checks.push(op);
    refs.push(clause('cirsoc-201', input.edition, '11.7.5', 'armadura alrededor de aberturas'));
    if (!op.ok) unsupported.push(`Aberturas: ${op.description}.`);
  }

  if (input.seismicRequired) {
    // The honest split between this branch and PR19.
    unsupported.push(
      'El proyecto requiere diseño sismorresistente. Los elementos de borde y el ' +
      'detallado de tabiques sismorresistentes se rigen por INPRES-CIRSOC 103 Parte II, ' +
      'que no está implementado en esta rama. Un elemento de borde no sísmico tendría ' +
      'apariencia de diseño completo sin serlo.');
  }

  if (input.coupled) {
    unsupported.push(
      'El tabique está acoplado. Las vigas de acople y su armadura diagonal no se diseñan.');
  }

  const maturity = deriveMaturity({
    implemented: true,
    refs,
    benchmarks: [
      { kind: 'handFixture', id: 'hand/wall-minimums', source: 'Cálculo manual desde 11.6.1 y 11.7.2' },
      { kind: 'property', id: 'shear-ceiling', source: 'Monotonía y techo de 11.5.4.6' },
    ],
    // Keys, for the same reason as the slab: an `EngineMessage` field holding a sentence
    // produces a record whose assumption has no key, and the report throws on it.
    promotionPath: msg('wall.maturity.promotionPath'),
    assumptions: [msg('wall.maturity.simplifiedInteraction')],
  });

  return {
    wallId: input.wallId, ratios, verticalSpacing, horizontalSpacing,
    shear, axialFlexure, minThickness: minT.thickness, thicknessOk,
    maturity, memo, refs, unsupported, reinforcement: r, checks,
    input: (({ provided: _p, ...rest }) => rest)(input),
  };
}
