/**
 * Governing-axis resolution for RC design and verification.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The design generator (`auto-verify.ts`) selected the flexural axis per element,
 * while `verifyProvidedReinforcement` was hardcoded to the Mz / Vy pair. For any
 * member whose gravity bending lands in My (every horizontal beam in the canonical
 * Z-up convention — `buildSolverInput3D` forces local z = global up), the verifier
 * therefore checked a nearly-unloaded axis and returned a comfortable *false pass*.
 * Columns were worse: `auto-verify` hardcoded `Mu = MzMax`, so a column with
 * My = 973 kN·m and Mz = 6 kN·m was designed for 6 kN·m and its real moment was
 * relegated to a biaxial *check* that never sized any steel.
 *
 * This module is the single source of truth for "which force components govern this
 * member". Generation and verification both consume it, so they can no longer
 * disagree. It is deliberately axis-AGNOSTIC: it never assumes which of My/Mz
 * carries gravity, it measures.
 *
 * Pure: no store access, no side effects.
 */

import type { ElementDesignDemands, GoverningDemand } from '../station-design-forces';

export type MomentAxis = 'My' | 'Mz';
export type ShearAxis = 'Vy' | 'Vz';

/** The demand categories that pair with each moment axis. */
export interface DesignAxes {
  /** Primary flexural axis (the one reinforcement is sized for). */
  flexure: MomentAxis;
  /** Shear component that pairs with the primary flexural axis. */
  shear: ShearAxis;
  /** Secondary moment axis (biaxial partner for columns). */
  secondaryFlexure: MomentAxis;
  /** Shear component pairing with the secondary axis. */
  secondaryShear: ShearAxis;
  /** Section width used for the primary flexural check (m). */
  bFlex: number;
  /** Section depth used for the primary flexural check (m). */
  hFlex: number;
  /** True when both moments are significant and a biaxial check is required. */
  biaxial: boolean;
  /** Positive-moment demand category for the primary axis ('My+' | 'Mz+'). */
  sagCategory: GoverningDemand['category'];
  /** Negative-moment demand category for the primary axis ('My-' | 'Mz-'). */
  hogCategory: GoverningDemand['category'];
  /** How the axis was chosen — surfaced in certificates for honesty. */
  basis: 'stress-proxy' | 'dominant-moment' | 'no-demand';
  /** Ratio secondary/primary governing moment (0 when no demand). */
  secondaryRatio: number;
  /**
   * The secondary axis's demand is carried by the slab cast with the beam, as its diaphragm: a
   * beam bending in its strong axis under a slab takes the in-plane moment through the slab, not
   * through its own width, and is not checked biaxially for it (`withSlabDiaphragm`).
   */
  secondaryCarriedBy?: 'slab';
}

/**
 * A beam with a slab cast on it (its flange) bends in the slab's plane only together with the slab,
 * which as a diaphragm is far stiffer and stronger in that plane than the beam's width: the
 * in-plane moment (Mz) and its shear go to the slab. So the beam bending about its strong axis
 * (My, vertical loads) is designed for it alone, and the secondary axis is stated as the slab's.
 * A beam with no slab, or turned about its axis, keeps its biaxial check (`resolveDesignAxes`
 * with `slab` designs an upright beam under its slab about My whatever its in-plane moment).
 */
/** A beam with its section upright, turned less than 5° about its axis: its My bends it vertically. */
export function uprightBeam(e: { rollAngle?: number } | undefined): boolean {
  const roll = (((e?.rollAngle ?? 0) % 180) + 180) % 180;
  return roll < 5 || roll > 175;
}

export function withSlabDiaphragm(axes: DesignAxes, hasFlange: boolean): DesignAxes {
  if (!hasFlange || axes.flexure !== 'My' || !axes.biaxial) return axes;
  return { ...axes, biaxial: false, secondaryCarriedBy: 'slab' };
}

/** Minimal geometric input — a rectangular section. */
export interface AxisSectionInput {
  /** Section width along local z (m). */
  b: number;
  /** Section depth along local y (m). */
  h: number;
}

/** Threshold above which the second moment forces a biaxial check. */
export const BIAXIAL_RATIO_THRESHOLD = 0.10;
/** Below this absolute moment (kN·m) a component is treated as non-participating. */
export const MOMENT_NOISE_FLOOR = 0.1;

function absOf(demands: GoverningDemand[] | undefined, category: GoverningDemand['category']): number {
  if (!demands) return 0;
  return demands.find(d => d.category === category)?.absValue ?? 0;
}

/** Peak |My| across positive and negative governing demands. */
export function peakMy(d: ElementDesignDemands | undefined): number {
  return Math.max(absOf(d?.demands, 'My+'), absOf(d?.demands, 'My-'));
}

/** Peak |Mz| across positive and negative governing demands. */
export function peakMz(d: ElementDesignDemands | undefined): number {
  return Math.max(absOf(d?.demands, 'Mz+'), absOf(d?.demands, 'Mz-'));
}

export function peakVy(d: ElementDesignDemands | undefined): number { return absOf(d?.demands, 'Vy'); }
export function peakVz(d: ElementDesignDemands | undefined): number { return absOf(d?.demands, 'Vz'); }

export function peakAxial(d: ElementDesignDemands | undefined): number {
  return Math.max(absOf(d?.demands, 'N_compression'), absOf(d?.demands, 'N_tension'));
}

export function peakTorsion(d: ElementDesignDemands | undefined): number {
  return absOf(d?.demands, 'Torsion');
}

/**
 * Resolve the governing design axes for one member.
 *
 * Beams: the primary axis is chosen by an elastic-stress proxy Mu/(width·depth²),
 * which embeds the correct b/h for each candidate axis. My bends over the depth h
 * (uses Iy) and pairs with Vz; Mz bends over the width b (uses Iz) and pairs with Vy.
 * When Mz governs, the section is used rotated (bFlex = h, hFlex = b) because the
 * analysis model genuinely bends the member that way.
 *
 * Columns: the primary axis is the LARGER governing moment (previously hardcoded to
 * Mz, which is the defect this fixes). The smaller becomes the biaxial partner.
 *
 * With no demand data the result is flagged `no-demand` so callers can emit
 * DEMAND_UNAVAILABLE rather than silently designing for zero.
 */
export function resolveDesignAxes(
  elementType: 'beam' | 'column' | 'wall',
  section: AxisSectionInput,
  demands: ElementDesignDemands | undefined,
  /** A beam with a slab cast on it, upright: its in-plane axis is the slab's (`withSlabDiaphragm`). */
  o: { slab?: boolean } = {},
): DesignAxes {
  const my = peakMy(demands);
  const mz = peakMz(demands);
  const b = section.b;
  const h = section.h;

  const forAxis = (primary: MomentAxis, basis: DesignAxes['basis']): DesignAxes => {
    const isMy = primary === 'My';
    const primaryMag = isMy ? my : mz;
    const secondaryMag = isMy ? mz : my;
    return {
      flexure: primary,
      shear: isMy ? 'Vz' : 'Vy',
      secondaryFlexure: isMy ? 'Mz' : 'My',
      secondaryShear: isMy ? 'Vy' : 'Vz',
      // My bends over the depth h → standard orientation.
      // Mz bends over the width b → the section acts rotated.
      bFlex: isMy ? b : h,
      hFlex: isMy ? h : b,
      biaxial: primaryMag > MOMENT_NOISE_FLOOR && secondaryMag / primaryMag > BIAXIAL_RATIO_THRESHOLD,
      sagCategory: isMy ? 'My+' : 'Mz+',
      hogCategory: isMy ? 'My-' : 'Mz-',
      basis,
      secondaryRatio: primaryMag > MOMENT_NOISE_FLOOR ? +(secondaryMag / primaryMag).toFixed(4) : 0,
    };
  };

  if (my <= MOMENT_NOISE_FLOOR && mz <= MOMENT_NOISE_FLOOR) {
    // No meaningful bending in either component. Default to the standard
    // orientation and report the absence so the caller can refuse honestly.
    const axes = forAxis('My', 'no-demand');
    axes.biaxial = false;
    return axes;
  }

  const isVertical = elementType === 'column' || elementType === 'wall';
  if (isVertical) {
    // Columns are (near-)square in most models, so a stress proxy adds nothing and
    // can flip on numerical noise. Take the larger moment as primary — the biaxial
    // check then covers the pair. Deterministic tie-break: My wins ties.
    return forAxis(my >= mz ? 'My' : 'Mz', 'dominant-moment');
  }

  // A beam under its slab bends vertically; whatever the in-plane moment, the slab takes it. The
  // stress proxy would put a 15 cm edge band's design on its width for the slab's in-plane action.
  if (o.slab) return withSlabDiaphragm(forAxis('My', 'stress-proxy'), true);

  // Beams: elastic-stress proxy with the axis-correct section orientation.
  // stressMy = My / (b · h²)   — bending over depth h
  // stressMz = Mz / (h · b²)   — bending over width b
  const stressMy = b > 0 && h > 0 ? my / (b * h * h) : 0;
  const stressMz = b > 0 && h > 0 ? mz / (h * b * b) : 0;
  return forAxis(stressMy >= stressMz ? 'My' : 'Mz', 'stress-proxy');
}

/** Read the signed station moment for the primary flexural axis from a force tuple. */
export function tupleMoment(t: { my: number; mz: number }, axis: MomentAxis): number {
  return axis === 'My' ? t.my : t.mz;
}

/** Read the station shear for a shear axis from a force tuple. */
export function tupleShear(t: { vy: number; vz: number }, axis: ShearAxis): number {
  return axis === 'Vy' ? t.vy : t.vz;
}

/** Human-facing axis label for check categories, e.g. "Bottom Span (My+)". */
export function axisLabel(axis: MomentAxis, sign: '+' | '-'): string {
  return `${axis}${sign}`;
}
