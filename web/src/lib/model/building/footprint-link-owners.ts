import type { Constraint3D, RigidLinkConstraint } from '../../engine/types-3d';

const owners = Symbol('footprint owners');
type OwnedLink = RigidLinkConstraint & { [owners]?: readonly number[] };

export interface SavedFootprintLink {
  index: number;
  masterNode: number;
  slaveNode: number;
  dofs: number[];
  owners: number[];
}

export function footprintOwners(link: RigidLinkConstraint): readonly number[] {
  return (link as OwnedLink)[owners] ?? [];
}

export function withFootprintOwners(link: RigidLinkConstraint, ids: readonly number[]): RigidLinkConstraint {
  const owned: OwnedLink = { ...link, [owners]: [...ids] };
  return owned;
}

export function savedFootprintLinks(constraints: readonly Constraint3D[]): { footprintLinks?: SavedFootprintLink[] } {
  const footprintLinks: SavedFootprintLink[] = [];
  constraints.forEach((link, index) => {
    if (link.type !== 'rigidLink' || !link.dofs) return;
    const ids = footprintOwners(link);
    if (ids.length) footprintLinks.push({ index, masterNode: link.masterNode, slaveNode: link.slaveNode, dofs: [...link.dofs], owners: [...ids] });
  });
  return footprintLinks.length ? { footprintLinks } : {};
}

export function restoreFootprintLinks(constraints: Constraint3D[], saved: SavedFootprintLink[] | undefined): Constraint3D[] {
  if (!Array.isArray(saved)) return constraints;
  for (const entry of saved) {
    const link = constraints[entry?.index];
    if (link?.type !== 'rigidLink' || link.masterNode !== entry.masterNode || link.slaveNode !== entry.slaveNode) continue;
    if (!link.dofs || !Array.isArray(entry.dofs) || link.dofs.length !== entry.dofs.length || link.dofs.some((d, i) => d !== entry.dofs[i])) continue;
    if (!Array.isArray(entry.owners) || !entry.owners.length || !entry.owners.every(id => Number.isSafeInteger(id) && id > 0)) continue;
    constraints[entry.index] = withFootprintOwners(link, entry.owners);
  }
  return constraints;
}
