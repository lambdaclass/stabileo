import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { deriveMaturity, type MaturityRecord } from '../../codes/maturity';
import { msg } from '../../codes/message';
import type { WallReinforcement } from '../../design-contract/reinforcement';
import { proposeWallReinforcement, wallInPlane, wallOpenings, wallOutOfPlane } from '../../rc-sheets/wall-member';
import {
  checkWallInPlaneShear, maxWallSpacing, minimumWallRatios, minimumWallThickness,
  type WallAxialFlexureResult, type WallReinforcementRatios, type WallShearResult,
} from '../../rc-sheets/wall-design';
import { wallCurtains } from './floor-transverse';
export * from '../../rc-sheets/wall-design';

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
