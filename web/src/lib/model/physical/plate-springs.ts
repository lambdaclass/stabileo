import { tributaryAreas } from '../../engine/foundation-springs';
import type { Support } from '../../store/model.svelte';
import { plateSurfaceOf, type PlateSurface } from './plate';
import type { PlateAnalysisModel } from './plate-analysis';

export type PlateSoil = NonNullable<PlateSurface['springs']>;
type NodalSoil = Pick<PlateSoil, 'uplift' | 'holdHorizontal'> & { kz: number };
type SpringModel = Pick<PlateAnalysisModel, 'nodes' | 'groups' | 'plates' | 'quads'>;
type ReviewModel = SpringModel & { supports?: ReadonlyMap<number, Support> };

export function plateSpringRequirements(model: SpringModel, overrides?: ReadonlyMap<number, PlateSoil | null>, affected?: ReadonlySet<number>) {
  const nodes = new Map<number, NodalSoil>();
  const incompatible = new Set<number>();
  let invalid = false;
  for (const group of model.groups?.values() ?? []) {
    const soil = overrides?.has(group.id) ? overrides.get(group.id) : plateSurfaceOf(group)?.springs;
    if (soil == null) continue;
    if (!Number.isFinite(soil.ks) || soil.ks <= 0 || typeof soil.uplift !== 'boolean' || typeof soil.holdHorizontal !== 'boolean') {
      invalid = true;
      continue;
    }
    const cells = [
      ...(group.members?.quads ?? []).map(id => model.quads?.get(id)),
      ...(group.members?.plates ?? []).map(id => model.plates?.get(id)),
    ].filter(cell => cell != null).filter(cell => !affected || cell.nodes.some(id => affected.has(id)));
    for (const [id, area] of tributaryAreas(model.nodes, cells)) {
      if (affected && !affected.has(id)) continue;
      const old = nodes.get(id);
      if (old && (old.uplift !== soil.uplift || old.holdHorizontal !== soil.holdHorizontal)) incompatible.add(id);
      const kz = (old?.kz ?? 0) + area * soil.ks;
      if (!Number.isFinite(kz) || kz <= 0) invalid = true;
      nodes.set(id, { kz, uplift: soil.uplift, holdHorizontal: soil.holdHorizontal });
    }
  }
  return { nodes, incompatible, invalid };
}

export function springSupport(nodeId: number, spring: NodalSoil): Omit<Support, 'id'> {
  return {
    nodeId, type: 'custom3d', plateSpring: true,
    dofRestraints: { tx: spring.holdHorizontal, ty: spring.holdHorizontal, tz: false, rx: false, ry: false, rz: false },
    dofFrame: 'global', kz: spring.kz, ...(spring.uplift ? { uplift: true } : {}),
  };
}

export function agreesWithPlateSpring(support: Support, spring: NodalSoil): boolean {
  const restraints = support.dofRestraints;
  return !!restraints && support.type === 'custom3d' && support.dofFrame === 'global' && support.kz === spring.kz
    && !!support.uplift === spring.uplift && restraints.tx === spring.holdHorizontal
    && restraints.ty === spring.holdHorizontal && !restraints.tz && !support.curves?.z;
}

export function inconsistentPlateSprings(model: ReviewModel): boolean {
  const { nodes, incompatible, invalid } = plateSpringRequirements(model);
  if (incompatible.size || invalid) return true;
  if (!model.supports) return nodes.size !== 0;
  const seen = new Set<number>();
  for (const support of model.supports.values()) {
    const spring = nodes.get(support.nodeId);
    if (!spring) {
      if (support.plateSpring) return true;
      continue;
    }
    if (seen.has(support.nodeId) || !agreesWithPlateSpring(support, spring)) return true;
    seen.add(support.nodeId);
  }
  return nodes.size !== seen.size;
}
