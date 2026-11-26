import { computePlanarDiagramExtrema } from './diagrams';
import { computeSpatialDiagramExtrema, visitMemberCriticalOrdinates3D, type Diagram3DKind } from './diagrams-3d';
import { boundMemberEnvelopeDiagram, envelopeForceExtrema, includeDiagramOrdinate, unavailableDiagramExtrema, type DiagramOrdinate, type DiagramOrdinateExtrema } from './member-diagram';
import type { ElementForces } from './types';
import type { ElementForces3D } from './types-3d';

type Member = ElementForces | ElementForces3D;
type SpatialComponent = Diagram3DKind | readonly [Diagram3DKind, Diagram3DKind];
type Component = 'moment' | 'shear' | SpatialComponent;
type LocatedOrdinate = DiagramOrdinate & { x: number };

export type MemberForceExtrema =
  | { kind: 'exact' | 'envelope'; min: LocatedOrdinate; max: LocatedOrdinate; absolute: LocatedOrdinate }
  | { kind: 'bounded'; bound: number };

export function memberForceExtrema(member: Member, component: Component, faces?: 'diagram'): MemberForceExtrema {
  if (typeof component !== 'string') {
    if (faces || !('vyStart' in member)) throw unavailableDiagramExtrema();
    return criticalMemberForceExtrema3D(member, [component])[0]!;
  }
  const envelope = boundMemberEnvelopeDiagram(member, component);
  if (envelope) return envelopeForceExtrema(envelope, member.length, faces);
  const planar = component === 'moment' || component === 'shear' || component === 'axial';
  const spatial = 'vyStart' in member;
  if ((spatial && (component === 'moment' || component === 'shear')) || (!spatial && !planar)) {
    throw unavailableDiagramExtrema();
  }
  const range = spatial
    ? computeSpatialDiagramExtrema(member, component as Diagram3DKind, faces)
    : computePlanarDiagramExtrema(component as 'moment' | 'shear' | 'axial', member, faces);
  if ('extrema' in range && range.extrema === 'bounded') {
    return { kind: 'bounded', bound: range.maxAbsValue };
  }
  const { min, max, absolute } = range;
  if (!min || !max || !absolute) throw unavailableDiagramExtrema();
  return { kind: 'exact', min, max, absolute };
}

export function criticalMemberForceExtrema3D(member: ElementForces3D, components: readonly SpatialComponent[]) {
  const first = components[0];
  const firstKind = typeof first === 'string' ? first : first?.[0];
  if (firstKind && boundMemberEnvelopeDiagram(member, firstKind)) {
    return components.map(kind => {
      if (typeof kind !== 'string') throw unavailableDiagramExtrema();
      return envelopeForceExtrema(boundMemberEnvelopeDiagram(member, kind)!, member.length);
    });
  }

  const ranges = components.map<DiagramOrdinateExtrema<LocatedOrdinate> | undefined>(() => undefined);
  visitMemberCriticalOrdinates3D(member, components, (column, t, value, x, right, side) => {
    ranges[column] = includeDiagramOrdinate(ranges[column], { t, value, x, ...(right && { right }), ...(side && { side }) });
  });
  return ranges.map(range => {
    if (!range) throw unavailableDiagramExtrema();
    return { kind: 'exact' as const, min: range.min, max: range.max, absolute: range.abs };
  });
}

export function exactForcePeak(member: Member, component: Component): number {
  const extrema = memberForceExtrema(member, component);
  if (extrema.kind === 'bounded') throw unavailableDiagramExtrema();
  return Math.abs(extrema.absolute.value);
}

export function forcePeakScale(members: readonly Member[], component: Component) {
  const values = new Map<number, number>();
  let max = 0;
  for (const member of members) {
    const peak = exactForcePeak(member, component);
    max = Math.max(max, peak);
    values.set(member.elementId, peak);
  }
  return { max, values };
}

export function maxMemberForce(members: readonly Member[], component: Component): number {
  let max = 0;
  for (const member of members) max = Math.max(max, exactForcePeak(member, component));
  return max;
}
