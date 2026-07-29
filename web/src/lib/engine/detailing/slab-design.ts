/**
 * Slab design — CIRSOC 201-2025 Chapters 7 (one-way) and 8 (two-way).
 *
 * ── Where the demand comes from ────────────────────────────────
 *
 * From the shell results the solver already produces. `QuadStress` carries the bending
 * moments per unit width — `mx`, `my`, `mxy` — which is exactly what a slab is designed
 * for. The twisting moment `mxy` is not discarded: the Wood-Armer transformation folds
 * it into the design moments, because ignoring it under-reinforces every panel whose
 * principal moment axes are not aligned with the reinforcement.
 *
 * Shear is the one thing the shell output does not carry (no `vx`/`vy`), and that is
 * handled the same way punching was: one-way shear demand is derived by integrating the
 * applied load over the strip, which is a free body rather than an interpolation.
 *
 * ── Normative content ──────────────────────────────────────────
 *
 * §7.6.1   one-way minimum flexural reinforcement A_s,min = 0,0018 A_g
 * §8.6.1.1 two-way minimum, the same 0,0018 A_g near the tension face in the direction
 *          under consideration
 * §7.7.2.3 one-way maximum spacing: the lesser of 3h and 300 mm
 * §7.7.2.4 shrinkage and temperature steel spacing: the lesser of 5h and 450 mm
 * §8.7.2.2 two-way maximum spacing: the lesser of 2h and 300 mm at critical sections,
 *          the lesser of 3h and 300 mm elsewhere
 * §24.4.3.2 shrinkage and temperature reinforcement ratio 0,0018 for f_y = 420 MPa
 * §22.5    one-way shear strength
 *
 * ── Wood-Armer ─────────────────────────────────────────────────
 *
 * The standard transformation for orthogonally reinforced plates:
 *
 *   bottom:  m*x = mx + |mxy|,  m*y = my + |mxy|
 *   top:     m*x = mx − |mxy|,  m*y = my − |mxy|
 *
 * with the well-known correction when one of the pair changes sign: the excess is
 * carried by the other direction rather than being dropped. Dropping it is the classic
 * error that leaves a corner panel short of steel.
 *
 * Pure: no store, no runes. Moments kN·m/m, lengths m, stresses MPa.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { deriveMaturity, type MaturityRecord } from '../../codes/maturity';
import { msg } from '../../codes/message';
import { minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import { PHI_SHEAR, sizeEffectFactor, sqrtFcCapped } from './punching-shear';

export type SlabBehaviour = 'oneWay' | 'twoWay';

/** §8.10.1 / practice: aspect ratio at or below 2 spans in two directions. */
export const TWO_WAY_ASPECT_LIMIT = 2;

/**
 * Classify a panel from its plan aspect ratio.
 *
 * A panel supported on all four sides with a long/short ratio above 2 carries
 * essentially all its load in the short direction and is designed as one-way.
 */
export function classifySlab(
  lx: number, ly: number, supportedSides: number, edition: RegulationEdition = '2025',
): { behaviour: SlabBehaviour; aspect: number; refs: ClauseRef[]; note: string } {
  const long = Math.max(lx, ly);
  const short = Math.min(lx, ly);
  const aspect = short > 0 ? long / short : Infinity;
  const refs = [clause('cirsoc-201', edition, edition === '2025' ? '8.1' : '13.5',
    'alcance de losas en dos direcciones')];

  if (supportedSides < 3) {
    return {
      behaviour: 'oneWay', aspect, refs,
      note: `Apoyada en ${supportedSides} lado(s): trabaja en una dirección.`,
    };
  }
  if (aspect > TWO_WAY_ASPECT_LIMIT) {
    return {
      behaviour: 'oneWay', aspect, refs,
      note: `Relación de lados ${aspect.toFixed(2)} > ${TWO_WAY_ASPECT_LIMIT}: prácticamente ` +
            'toda la carga se transmite en la dirección corta, se diseña en una dirección.',
    };
  }
  return {
    behaviour: 'twoWay', aspect, refs,
    note: `Relación de lados ${aspect.toFixed(2)} ≤ ${TWO_WAY_ASPECT_LIMIT} y apoyada en ` +
          `${supportedSides} lados: trabaja en dos direcciones.`,
  };
}

// ─── Wood-Armer ──────────────────────────────────────────────────

export interface DesignMoments {
  /** Bottom-face design moment about the x reinforcement direction, kN·m/m. */
  bottomX: number;
  bottomY: number;
  /** Top-face design moment magnitudes, kN·m/m, positive when top steel is needed. */
  topX: number;
  topY: number;
  /** True when a sign correction was applied — recorded so the memo can say so. */
  corrected: boolean;
}

/**
 * Wood-Armer design moments for an orthogonally reinforced slab.
 *
 * Sign convention: `mx`/`my` positive means sagging (tension at the bottom face).
 *
 * The correction branches matter. When `mx + |mxy|` comes out negative, the bottom needs
 * no steel in x and the twisting moment it would have carried is transferred to y as
 * `my + mxy²/|mx|`. Skipping that transfer is what leaves corner panels short.
 */
export function woodArmer(mx: number, my: number, mxy: number): DesignMoments {
  const a = Math.abs(mxy);
  let corrected = false;

  /**
   * One face of the transformation.
   *
   * The transfer applies ONLY when one direction needs steel and the other's design
   * moment comes out the wrong way. When NEITHER needs steel — the ordinary case for
   * the top face of a sagging panel — there is nothing to transfer and no correction
   * has occurred. Conflating the two made every sagging panel report a correction it
   * had not made.
   */
  const face = (px: number, py: number): [number, number] => {
    let dx = px + a;
    let dy = py + a;
    if (dx >= 0 && dy >= 0) return [dx, dy];
    if (dx < 0 && dy < 0) return [0, 0];          // no steel this face; nothing to transfer
    if (dx < 0) {
      dx = 0;
      dy = py + (a > 0 ? (mxy * mxy) / Math.max(Math.abs(px), 1e-9) : 0);
      corrected = true;
    } else {
      dy = 0;
      dx = px + (a > 0 ? (mxy * mxy) / Math.max(Math.abs(py), 1e-9) : 0);
      corrected = true;
    }
    return [Math.max(0, dx), Math.max(0, dy)];
  };

  const [bottomX, bottomY] = face(mx, my);
  // The top face is the same problem with the moment field reversed.
  const [topX, topY] = face(-mx, -my);

  return { bottomX, bottomY, topX, topY, corrected };
}

// ─── Reinforcement ───────────────────────────────────────────────

/** §24.4.3.2 — shrinkage and temperature steel ratio for ADN 420. */
export const SHRINKAGE_RATIO = 0.0018;

export interface SlabBarLayer {
  face: 'top' | 'bottom';
  direction: 'x' | 'y';
  diameterMm: number;
  /** Centre-to-centre spacing, m. */
  spacing: number;
  /** Steel area provided per metre, m²/m. */
  asProvided: number;
  /** Steel area required per metre, m²/m. */
  asRequired: number;
  /** True when the minimum governed rather than the demand. */
  minimumGoverns: boolean;
  refs: ClauseRef[];
}

/** §7.6.1 / §8.6.1.1 — minimum flexural reinforcement, per metre width. */
export function minimumFlexuralSteel(thickness: number): number {
  return SHRINKAGE_RATIO * thickness;   // A_g per metre width = 1 m × h
}

/** §7.7.2.3 / §8.7.2.2 — maximum bar spacing. */
export function maxBarSpacing(
  thickness: number, behaviour: SlabBehaviour, critical: boolean,
  edition: RegulationEdition = '2025',
): { spacing: number; refs: ClauseRef[] } {
  if (behaviour === 'twoWay') {
    return {
      spacing: critical ? Math.min(2 * thickness, 0.30) : Math.min(3 * thickness, 0.30),
      refs: [clause('cirsoc-201', edition, edition === '2025' ? '8.7.2.2' : '13.3.2',
        'separación máxima de la armadura')],
    };
  }
  return {
    spacing: Math.min(3 * thickness, 0.30),
    refs: [clause('cirsoc-201', edition, edition === '2025' ? '7.7.2.3' : '7.6.5',
      'separación máxima de la armadura')],
  };
}

/** §7.7.2.4 — shrinkage and temperature steel spacing. */
export function maxShrinkageSpacing(
  thickness: number, edition: RegulationEdition = '2025',
): { spacing: number; refs: ClauseRef[] } {
  return {
    spacing: Math.min(5 * thickness, 0.45),
    refs: [clause('cirsoc-201', edition, edition === '2025' ? '7.7.2.4' : '7.12.2.2',
      'separación máxima de la armadura por contracción y temperatura')],
  };
}

const BAR_AREA = (d: number) => Math.PI * (d / 2000) ** 2;

/**
 * Choose bar diameter and spacing for a required steel area per metre.
 *
 * Walks the standard diameters from small to large and picks the first that satisfies
 * the demand at a spacing within both the code maximum and the §25.2 minimum clear
 * spacing. Small bars closely spaced are preferred over large bars far apart: they
 * distribute cracking better and are what a detailer would specify.
 */
export function selectSlabBars(opts: {
  asRequired: number;
  thickness: number;
  behaviour: SlabBehaviour;
  critical: boolean;
  face: 'top' | 'bottom';
  direction: 'x' | 'y';
  maxAggregateSizeMm: number;
  edition: RegulationEdition;
  /** Candidate diameters, smallest first. */
  diameters?: number[];
}): SlabBarLayer | null {
  const asMin = minimumFlexuralSteel(opts.thickness);
  const asReq = Math.max(opts.asRequired, asMin);
  const minimumGoverns = opts.asRequired <= asMin;
  const { spacing: sMax, refs: spacingRefs } = maxBarSpacing(
    opts.thickness, opts.behaviour, opts.critical, opts.edition);

  for (const d of opts.diameters ?? [6, 8, 10, 12, 16, 20, 25]) {
    const area = BAR_AREA(d);
    // Spacing that exactly meets the demand, rounded DOWN to a 25 mm module so the
    // result is a spacing a steel fixer can actually set out.
    const exact = area / asReq;
    const spacing = Math.floor(Math.min(exact, sMax) / 0.025) * 0.025;
    if (spacing <= 0) continue;

    const clear = minClearSpacingInLayer(opts.edition, {
      barDiameterMm: d, maxAggregateSizeMm: opts.maxAggregateSizeMm,
    });
    if (spacing - d / 1000 < clear.minClear) continue;

    return {
      face: opts.face, direction: opts.direction, diameterMm: d, spacing,
      asProvided: area / spacing, asRequired: asReq, minimumGoverns,
      refs: [
        ...spacingRefs, ...clear.refs,
        clause('cirsoc-201', opts.edition,
          opts.edition === '2025' ? (opts.behaviour === 'twoWay' ? '8.6.1.1' : '7.6.1') : '7.12.2.1',
          'armadura mínima a flexión'),
      ],
    };
  }
  return null;
}

// ─── One-way shear ───────────────────────────────────────────────

export interface OneWayShearResult {
  /** Factored shear per metre width at d from the support, kN/m. */
  vu: number;
  /** φV_c per metre width, kN/m. */
  phiVc: number;
  utilization: number;
  ok: boolean;
  memo: string;
  refs: ClauseRef[];
}

/**
 * One-way shear at d from the support face, from the applied load.
 *
 * The shell output has no transverse shear, so the demand is integrated from the load
 * over the strip beyond the critical section — the same free-body argument that
 * unblocked punching. A slab that cannot carry one-way shear is a real failure and
 * skipping the check because the shell does not report `vx` would be a false pass.
 */
export function checkSlabOneWayShear(opts: {
  /** Factored area load, kPa. */
  qu: number;
  /** Clear span, m. */
  span: number;
  /** Effective depth, m. */
  d: number;
  fc: number;
  lambda?: number;
  edition?: RegulationEdition;
}): OneWayShearResult {
  const a = opts.span / 2 - opts.d;
  const vu = Math.max(0, opts.qu * a);
  const lambdaS = sizeEffectFactor(opts.d);
  // §22.5.5.1 for a member without shear reinforcement, per metre width (b_w = 1 m).
  const vc = 0.17 * lambdaS * (opts.lambda ?? 1) * sqrtFcCapped(opts.fc) * 1.0 * opts.d * 1000;
  const phiVc = PHI_SHEAR * vc;
  return {
    vu, phiVc,
    utilization: phiVc > 0 ? vu / phiVc : Infinity,
    ok: vu <= phiVc,
    memo:
      `Corte en una dirección a d del apoyo: a = ${a.toFixed(3)} m, ` +
      `vu = ${opts.qu.toFixed(2)} × ${a.toFixed(3)} = ${vu.toFixed(1)} kN/m contra ` +
      `φvc = ${phiVc.toFixed(1)} kN/m (λs = ${lambdaS.toFixed(3)}).`,
    refs: [clause('cirsoc-201', opts.edition ?? '2025',
      (opts.edition ?? '2025') === '2025' ? '22.5' : '11.3',
      'resistencia a corte en una dirección')],
  };
}

// ─── The panel ───────────────────────────────────────────────────

export interface SlabPanelInput {
  panelId: string;
  lx: number;
  ly: number;
  thickness: number;
  cover: number;
  supportedSides: number;
  fc: number;
  fy: number;
  maxAggregateSizeMm: number;
  edition: RegulationEdition;
  /** Envelope shell moments at the governing station, kN·m/m. */
  moments: { mx: number; my: number; mxy: number };
  /** Factored area load, kPa — for the one-way shear free body. */
  qu: number;
  /** Openings, as plan rectangles. Presence changes the outcome, see below. */
  openings?: Array<{ x: number; y: number; w: number; h: number }>;
}

export interface SlabDesignResult {
  panelId: string;
  behaviour: SlabBehaviour;
  aspect: number;
  design: DesignMoments;
  layers: SlabBarLayer[];
  shear: OneWayShearResult;
  maturity: MaturityRecord;
  memo: string[];
  refs: ClauseRef[];
  unsupported: string[];
}

/**
 * Design one slab panel.
 *
 * Openings are detected and declared unsupported rather than ignored: an opening
 * redistributes the moment field around itself, and designing the panel as if it were
 * solid produces a drawing that is wrong exactly where it matters most.
 */
export function designSlabPanel(input: SlabPanelInput): SlabDesignResult {
  const memo: string[] = [];
  const refs: ClauseRef[] = [];
  const unsupported: string[] = [];

  const cls = classifySlab(input.lx, input.ly, input.supportedSides, input.edition);
  memo.push(cls.note);
  refs.push(...cls.refs);

  const design = woodArmer(input.moments.mx, input.moments.my, input.moments.mxy);
  memo.push(
    `Wood-Armer sobre mx = ${input.moments.mx.toFixed(1)}, my = ${input.moments.my.toFixed(1)}, ` +
    `mxy = ${input.moments.mxy.toFixed(1)} kN·m/m → ` +
    `inferior x ${design.bottomX.toFixed(1)}, inferior y ${design.bottomY.toFixed(1)}, ` +
    `superior x ${design.topX.toFixed(1)}, superior y ${design.topY.toFixed(1)}.` +
    (design.corrected
      ? ' Se aplicó la corrección de signo: el momento torsor que una dirección no puede ' +
        'tomar se transfiere a la otra en lugar de descartarse.'
      : ''));

  const d = input.thickness - input.cover - 0.006;
  const layers: SlabBarLayer[] = [];

  const want: Array<[('top' | 'bottom'), ('x' | 'y'), number]> = [
    ['bottom', 'x', design.bottomX], ['bottom', 'y', design.bottomY],
    ['top', 'x', design.topX], ['top', 'y', design.topY],
  ];

  for (const [face, direction, m] of want) {
    // A_s ≈ M / (0,9 d f_y) — the standard lever-arm approximation for a lightly
    // reinforced slab, which is what a slab of ordinary thickness always is.
    const asReq = m > 0 ? (m * 1000) / (0.9 * d * input.fy * 1e6) : 0;
    const layer = selectSlabBars({
      asRequired: asReq, thickness: input.thickness, behaviour: cls.behaviour,
      critical: face === 'top', face, direction,
      maxAggregateSizeMm: input.maxAggregateSizeMm, edition: input.edition,
    });
    if (!layer) {
      unsupported.push(
        `No se encontró una combinación de diámetro y separación admisible para la ` +
        `armadura ${face === 'top' ? 'superior' : 'inferior'} en dirección ${direction}. ` +
        'Revisar el espesor de la losa.');
      continue;
    }
    layers.push(layer);
    refs.push(...layer.refs);
    memo.push(
      `Armadura ${face === 'top' ? 'superior' : 'inferior'} ${direction}: ` +
      `Ø${layer.diameterMm} c/${(layer.spacing * 1000).toFixed(0)} mm ` +
      `(As = ${(layer.asProvided * 1e4).toFixed(2)} cm²/m contra ` +
      `${(layer.asRequired * 1e4).toFixed(2)} requeridos` +
      `${layer.minimumGoverns ? ', gobierna la armadura mínima' : ''}).`);
  }

  const shear = checkSlabOneWayShear({
    qu: input.qu, span: Math.min(input.lx, input.ly), d, fc: input.fc,
    edition: input.edition,
  });
  memo.push(shear.memo);
  refs.push(...shear.refs);
  if (!shear.ok) {
    unsupported.push(
      `El corte en una dirección no verifica (utilización ${shear.utilization.toFixed(2)}). ` +
      'Una losa sin armadura de corte que no verifica requiere mayor espesor.');
  }

  if (input.openings && input.openings.length > 0) {
    unsupported.push(
      `El panel tiene ${input.openings.length} abertura(s). Una abertura redistribuye el ` +
      'campo de momentos a su alrededor, y diseñar el panel como si fuera macizo produce ' +
      'un plano equivocado justo donde más importa. El refuerzo de bordes de abertura no ' +
      'se genera automáticamente.');
  }

  const maturity = deriveMaturity({
    implemented: true,
    refs,
    benchmarks: [
      { kind: 'handFixture', id: 'hand/slab-oneway-min', source: 'Cálculo manual desde 7.6.1 y 7.7.2.3' },
      { kind: 'property', id: 'woodArmer-symmetry', source: 'Simetría, escalado y reversión de signo' },
      { kind: 'crossCheck', id: 'shear-freebody', source: 'Integración de carga contra 22.5' },
    ],
    /**
     * KEYS, not sentences.
     *
     * These two were plain Spanish strings in a field typed `EngineMessage`, and the type
     * error sat inside the typecheck baseline where nothing read it. The consequence was not
     * cosmetic: the report renders an assumption as `translate(m.key, m.params)`, so `m.key`
     * was `undefined` and `esc()` threw — every report for a project containing a designed
     * slab crashed. Found when the punching collector made that path reachable.
     */
    promotionPath: msg('slab.maturity.promotionPath'),
    assumptions: [msg('slab.maturity.leverArm')],
  });

  return {
    panelId: input.panelId, behaviour: cls.behaviour, aspect: cls.aspect,
    design, layers, shear, maturity, memo, refs, unsupported,
  };
}
