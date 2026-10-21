/**
 * An IFC file as the building it describes: each object a physical element of the kind its
 * class maps to, slabs and walls meshed as shells on their mid-surfaces, and the storeys as the
 * levels. The class map is the person's to change: an IfcMember can be a beam, an IfcSlab can be
 * left out. Bars and shells share their nodes where they meet; the bars are cut at the shells'
 * nodes once the fragment is in the model (`connectShells`).
 */
import type { Fragment } from '../model/edit/fragment';
import { generateMesh } from '../model/edit/mesher';
import { splitAtNodes } from '../model/edit/cut-members';
import { modelStore, type Material, type ModelGroup } from '../store/model.svelte';
import { PHYSICAL_GROUP_KIND, type PhysicalData, type PhysicalKind } from '../model/physical/types';
import { levelAt } from '../model/physical/recognize';
import type { Level } from '../model/grid';
import { CONCRETE, mapIfcToModel, materialFor, type IfcMember, type IfcMapperOptions, type IfcSurface, type IfcStorey } from './ifc-mapper';
import { fragmentFromIfc } from './ifc-fragment';

export type ClassChoice = PhysicalKind | 'ignore';

/** What each IFC class is, unless the person says otherwise. */
export function defaultKindOf(ifcClass: string, read: IfcMember['type'] | IfcSurface['type']): ClassChoice {
  const c = ifcClass.toLowerCase();
  if (c.startsWith('ifccolumn')) return 'column';
  if (c.startsWith('ifcbeam')) return 'beam';
  if (c.startsWith('ifcmember')) return 'brace';
  if (c.startsWith('ifcslab')) return 'slab';
  if (c.startsWith('ifcwall')) return 'wall';
  return read;
}

export interface ClassRow { ifcClass: string; count: number; choice: ClassChoice; surface: boolean }

/** The classes in a file, with how many objects each and what they default to. */
export function classesIn(members: IfcMember[], surfaces: IfcSurface[]): ClassRow[] {
  const rows = new Map<string, ClassRow>();
  for (const m of members) {
    const k = m.ifcClass ?? m.type;
    const r = rows.get(k) ?? { ifcClass: k, count: 0, choice: defaultKindOf(k, m.type), surface: false };
    r.count++; rows.set(k, r);
  }
  for (const s of surfaces) {
    const k = s.ifcClass ?? s.type;
    const r = rows.get(k) ?? { ifcClass: k, count: 0, choice: defaultKindOf(k, s.type), surface: true };
    r.count++; rows.set(k, r);
  }
  return [...rows.values()];
}

/** The storeys as levels, with ids of their own. */
export const storeyLevels = (storeys: IfcStorey[]): Level[] =>
  storeys.map((s, i) => ({ id: `lv-ifc-${i}-${Math.round(s.elevation * 1000)}`, name: s.name, z: s.elevation }));

export interface IfcBuildingOptions extends IfcMapperOptions {
  choices: Record<string, ClassChoice>;
  /** Target size of the shell mesh, m. */
  meshSize: number;
  /** Declare the objects as physical elements. */
  declare: boolean;
  levels: Level[];
}

export interface IfcBuilding {
  fragment: Fragment;
  mapping: import('./ifc-mapper').IfcMappingResult;
  bars: number; shells: number; elements: number; skipped: number;
  warnings: string[];
}

const BAR_KINDS = new Set<ClassChoice>(['column', 'beam', 'brace']);

/** The bars and the slabs and walls the class choices keep, each surface as the kind it was chosen as. */
export function chosenParts(members: IfcMember[], surfaces: IfcSurface[], choices: Record<string, ClassChoice>): { members: IfcMember[]; surfaces: IfcSurface[] } {
  const choiceOf = (cls: string | undefined, read: string) => choices[cls ?? read] ?? defaultKindOf(cls ?? read, read as never);
  return {
    members: members.filter((m) => BAR_KINDS.has(choiceOf(m.ifcClass, m.type))),
    surfaces: surfaces.flatMap((s) => { const c = choiceOf(s.ifcClass, s.type); return c === 'slab' || c === 'wall' ? [{ ...s, type: c as IfcSurface['type'] }] : []; }),
  };
}

export function buildIfcFragment(members: IfcMember[], surfaces: IfcSurface[], o: IfcBuildingOptions): IfcBuilding {
  const choiceOf = (cls: string | undefined, read: string) => o.choices[cls ?? read] ?? defaultKindOf(cls ?? read, read as never);
  const bars = members.filter((m) => BAR_KINDS.has(choiceOf(m.ifcClass, m.type)));
  const shells = surfaces.filter((s) => { const c = choiceOf(s.ifcClass, s.type); return c === 'slab' || c === 'wall'; });
  const mapping = mapIfcToModel(bars, o);
  const frag = fragmentFromIfc(mapping);
  const warnings = [...mapping.warnings];
  const tol = o.snapTolerance ?? 0.01;

  // Shells: meshed on their mid-surface, through the bars' nodes where these lie on the outline.
  const fixed = frag.nodes.map((n) => [n.x, n.y, n.z] as [number, number, number]);
  let nextNode = Math.max(0, ...frag.nodes.map((n) => n.id)) + 1;
  const nodeAt = (p: [number, number, number]) => {
    const hit = frag.nodes.find((n) => Math.hypot(n.x - p[0], n.y - p[1], n.z - p[2]) < tol);
    if (hit) return hit.id;
    const id = nextNode++;
    frag.nodes.push({ id, x: p[0], y: p[1], z: p[2] });
    return id;
  };
  const materialOfSurface = (name: string | undefined): number => {
    const found = frag.materials.find((m) => m.name === (name ?? ''));
    if (found) return found.id;
    const props = (name ? materialFor(name) : null) ?? CONCRETE;
    const id = Math.max(0, ...frag.materials.map((m) => m.id)) + 1;
    frag.materials.push({ id, name: name ?? 'Concrete', ...props } as Material);
    return id;
  };
  const shellsOf = new Map<IfcSurface, { quads: number[]; plates: number[] }>();
  let quadId = 1, plateId = 1, shellCount = 0, skipped = 0;
  for (const s of shells) {
    const mesh = generateMesh({ outer: { kind: 'polygon', points: s.outline.map((p) => [p.x, p.y, p.z]) }, holes: [], size: o.meshSize, element: 'quad', fixedPoints: fixed });
    if (!mesh) { warnings.push(s.name); skipped++; continue; }
    const ids = mesh.points.map(nodeAt);
    const mat = materialOfSurface(s.materialName);
    const out = { quads: [] as number[], plates: [] as number[] };
    for (const c of mesh.cells) {
      const n = c.map((i) => ids[i]!);
      if (n.length === 4) { frag.quads.push({ id: quadId, nodes: n as [number, number, number, number], materialId: mat, thickness: s.thickness }); out.quads.push(quadId++); }
      else { frag.plates.push({ id: plateId, nodes: n as [number, number, number], materialId: mat, thickness: s.thickness }); out.plates.push(plateId++); }
    }
    shellCount += out.quads.length + out.plates.length;
    shellsOf.set(s, out);
  }

  // Physical elements: one per object, of the kind its class maps to.
  let elements = 0;
  if (o.declare) {
    const zOf = (id: number) => frag.nodes.find((n) => n.id === id)?.z ?? 0;
    const group = (gid: number, name: string, kind: PhysicalKind, members: ModelGroup['members'], zs: number[], typology?: string): ModelGroup => {
      const data: PhysicalData = { kind, provenance: 'declared', levelFrom: levelAt(Math.min(...zs), o.levels), levelTo: levelAt(Math.max(...zs), o.levels), ...(typology ? { typology } : {}) };
      return { id: gid, name, kind: PHYSICAL_GROUP_KIND, origin: 'user', members, data: data as unknown as Record<string, unknown> };
    };
    let gid = 1;
    mapping.elements.forEach((e, k) => {
      const m = bars.find((b) => b.id === e.member);
      if (!m) return;
      frag.groups.push(group(gid++, m.name, choiceOf(m.ifcClass, m.type) as PhysicalKind, { elements: [k + 1] }, [zOf(e.nodeI), zOf(e.nodeJ)], m.typology));
      elements++;
    });
    for (const [s, sh] of shellsOf) {
      const zs = s.outline.map((p) => p.z);
      // A slab sits at its storey's level even though its mid-surface is under it.
      const slab = choiceOf(s.ifcClass, s.type) === 'slab';
      const lv = slab && s.storey ? o.levels.find((l) => l.name === s.storey)?.z : undefined;
      frag.groups.push(group(gid++, s.name, slab ? 'slab' : 'wall', sh, lv !== undefined ? [lv] : zs));
      elements++;
    }
  }
  return { fragment: frag, mapping, bars: frag.elements.length, shells: shellCount, elements, skipped, warnings };
}

/** Cut the bars at the nodes of the shells just inserted, so the two meet along their edges. */
export function connectShells(quads: number[], plates: number[]): number {
  const nodes = new Set<number>();
  for (const id of quads) for (const n of modelStore.quads.get(id)?.nodes ?? []) nodes.add(n);
  for (const id of plates) for (const n of modelStore.plates.get(id)?.nodes ?? []) nodes.add(n);
  if (nodes.size === 0) return 0;
  const r = splitAtNodes([...modelStore.elements.keys()], nodes);
  return r.cut.reduce((s, x) => s + x.segments.length - 1, 0);
}

/**
 * Fix the feet of the lowest columns and walls. An exchange file carries the building, not its
 * supports, so an imported model had none and could not be solved until each base was found by
 * hand. The nodes at the lowest elevation any column or wall reaches, that belong to one, are
 * fixed (nodes already supported are left as they are). Returns how many supports were added.
 */
export function fixBases(tol = 1e-3): number {
  const m = modelStore.model;
  const vertical = [...m.elements.values()].filter((e) => {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y) < 1e-6 && Math.abs((b.z ?? 0) - (a.z ?? 0)) > 1e-6;
  });
  const wallNodes = new Set<number>();
  for (const q of m.quads.values()) {
    const ps = q.nodes.map((n) => m.nodes.get(n)).filter((p): p is NonNullable<typeof p> => !!p);
    const zs = ps.map((p) => p.z ?? 0);
    if (Math.max(...zs) - Math.min(...zs) > 1e-6) for (const n of q.nodes) wallNodes.add(n); // not horizontal: a wall
  }
  const candidates = new Set<number>([...vertical.flatMap((e) => [e.nodeI, e.nodeJ]), ...wallNodes]);
  if (candidates.size === 0) return 0;
  const zMin = Math.min(...[...candidates].map((n) => m.nodes.get(n)?.z ?? 0));
  const held = new Set([...m.supports.values()].map((x) => x.nodeId));
  let added = 0;
  for (const n of candidates) {
    if (held.has(n) || Math.abs((m.nodes.get(n)?.z ?? 0) - zMin) > tol) continue;
    modelStore.addSupport(n, 'fixed3d' as never);
    added++;
  }
  return added;
}

