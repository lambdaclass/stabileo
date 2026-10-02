/**
 * Design follows a member's behaviour, in one place.
 *
 * An inactive member is out of the analysis and is not designed. A tension-only member or a
 * cable never faces a compression check, and a compression-only member never faces a tension
 * one, whatever a superposed combination sums to (that sum is reported as a sign violation where
 * the result is). The rule used to live inside the CIRSOC steel check alone, so the optimiser
 * sized tension-only braces for buckling and the other codes failed them.
 *
 * Every design path reads demands through here: the steel check, the optimiser, the other codes
 * and the concrete design. Result tables and exports do not: they report what the analysis gave.
 *
 * Pure.
 */
import type { ElementDesignDemands } from '../station-design-forces';

type Behaviour = string | undefined;

export const isDesigned = (behaviour: Behaviour): boolean => behaviour !== 'inactive';

/**
 * Whether design checks this member: not inactive, and not of variable section. A member whose
 * section changes along it is analysed (`engine/variable-members.ts`), but its strength and
 * stability checks need the methods for non-prismatic members, which the design code here does
 * not have; it is reported as not checked rather than checked as if prismatic.
 */
export const isDesignedMember = (e: { behaviour?: string; variableSection?: unknown } | undefined): boolean =>
  !!e && isDesigned(e.behaviour) && !e.variableSection;

const noCompression = (b: Behaviour) => b === 'tensionOnly' || b === 'cable';
const noTension = (b: Behaviour) => b === 'compressionOnly';

/** A member's axial demand as its behaviour allows. In place, returned. */
export function maskAxialDemand<T extends { Nc: number; Nt: number }>(demand: T, behaviour: Behaviour): T {
  if (noCompression(behaviour)) demand.Nc = 0;
  if (noTension(behaviour)) demand.Nt = 0;
  return demand;
}

/** The governing demands of one member without the axial category its behaviour excludes. */
export function maskDemands(d: ElementDesignDemands, behaviour: Behaviour): ElementDesignDemands {
  if (!noCompression(behaviour) && !noTension(behaviour)) return d;
  const drop = noCompression(behaviour) ? 'N_compression' : 'N_tension';
  return { ...d, demands: d.demands.filter((x) => x.category !== drop) };
}

/** Every member's demands as design reads them: inactive members out, the rest masked. */
export function designDemands(
  demands: ReadonlyMap<number, ElementDesignDemands>,
  behaviourOf: (elementId: number) => Behaviour,
): Map<number, ElementDesignDemands> {
  const out = new Map<number, ElementDesignDemands>();
  for (const [id, d] of demands) {
    const b = behaviourOf(id);
    if (isDesigned(b)) out.set(id, maskDemands(d, b));
  }
  return out;
}
