/**
 * A fragment: a self-contained piece of a model — nodes, members and shells with every field
 * they carry, their supports, loads and groups, and the materials, sections and load cases they
 * point at, by definition.
 *
 * It is what everything that puts structure into a model hands over: a copy of the selection,
 * the clipboard, a generator's output, a template, an imported file. `insertFragment`
 * (`transformed-copy.ts`) is the one way in, under any number of isometries, welding what lands
 * on existing nodes. Copy, repeat, mirror and rotate-with-copy are a fragment of the selection
 * inserted back into its own model.
 *
 * A fragment taken from the model it will be inserted into is `local`: its material, section and
 * load-case ids are the model's own. Any other is matched by definition on the way in, so pasting
 * into another project does not point a member at whatever section happens to carry its old id.
 */
import { modelStore } from '../../store/model.svelte';
import type {
  Element, Load, LoadCase, Material, ModelGroup, Plate, Quad, Section, Support,
} from '../../store/model.svelte';

export interface EntitySet {
  nodes: Iterable<number>;
  elements: Iterable<number>;
  quads?: Iterable<number>;
  plates?: Iterable<number>;
}

/** The nodes a set touches: its own, and every end and corner of its members and shells. */
export function closure(set: EntitySet): { nodes: Set<number>; elements: Set<number>; quads: Set<number>; plates: Set<number> } {
  const elements = new Set(set.elements), quads = new Set(set.quads ?? []), plates = new Set(set.plates ?? []);
  const nodes = new Set(set.nodes);
  for (const id of elements) { const e = modelStore.elements.get(id); if (e) { nodes.add(e.nodeI); nodes.add(e.nodeJ); } }
  for (const id of quads) modelStore.quads.get(id)?.nodes.forEach((n) => nodes.add(n));
  for (const id of plates) modelStore.plates.get(id)?.nodes.forEach((n) => nodes.add(n));
  return { nodes, elements, quads, plates };
}

export interface FragmentNode { id: number; x: number; y: number; z: number }

export interface Fragment {
  nodes: FragmentNode[];
  elements: Element[];
  quads: Quad[];
  plates: Plate[];
  supports: Support[];
  loads: Load[];
  groups: ModelGroup[];
  materials: Material[];
  sections: Section[];
  loadCases: LoadCase[];
  /** Ids of materials, sections and load cases are the model's own. */
  local?: boolean;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The entities a load points at, whichever of them it has. */
export function loadTargets(l: Load): { nodeId?: number; elementId?: number; quadId?: number; plateId?: number } {
  const d = l.data as { nodeId?: number; elementId?: number; quadId?: number; plateId?: number };
  return { nodeId: d.nodeId, elementId: d.elementId, quadId: d.quadId, plateId: d.plateId };
}

export interface FragmentOptions {
  withSupports?: boolean;
  withLoads?: boolean;
  /** Copy groups whose every entity is in the set (default true). */
  withGroups?: boolean;
}

/** The fragment of `set` in the current model: its closure, as it stands now. */
export function fragmentOf(set: EntitySet, opts: FragmentOptions = {}): Fragment {
  const { nodes, elements, quads, plates } = closure(set);
  const frag: Fragment = {
    nodes: [...nodes].map((id) => modelStore.nodes.get(id)).filter(Boolean).map((n) => ({ id: n!.id, x: n!.x, y: n!.y, z: n!.z ?? 0 })),
    elements: [...elements].map((id) => modelStore.elements.get(id)).filter(Boolean).map((e) => clone(e!)),
    quads: [...quads].map((id) => modelStore.quads.get(id)).filter(Boolean).map((q) => clone(q!)),
    plates: [...plates].map((id) => modelStore.plates.get(id)).filter(Boolean).map((p) => clone(p!)),
    supports: opts.withSupports ? [...modelStore.supports.values()].filter((s) => nodes.has(s.nodeId)).map(clone) : [],
    loads: opts.withLoads ? modelStore.loads.filter((l) => {
      const t = loadTargets(l);
      return (t.nodeId !== undefined && nodes.has(t.nodeId)) || (t.elementId !== undefined && elements.has(t.elementId))
        || (t.quadId !== undefined && quads.has(t.quadId)) || (t.plateId !== undefined && plates.has(t.plateId));
    }).map(clone) : [],
    groups: opts.withGroups === false ? [] : [...modelStore.model.groups.values()].filter((g) => {
      const m = g.members;
      const all = [...(m.nodes ?? []).map((id) => nodes.has(id)), ...(m.elements ?? []).map((id) => elements.has(id)),
        ...(m.quads ?? []).map((id) => quads.has(id)), ...(m.plates ?? []).map((id) => plates.has(id))];
      return all.length > 0 && all.every(Boolean);
    }).map(clone),
    materials: [], sections: [], loadCases: [],
    local: true,
  };
  const matIds = new Set([...frag.elements.map((e) => e.materialId), ...frag.quads.map((q) => q.materialId), ...frag.plates.map((p) => p.materialId)]);
  const secIds = new Set(frag.elements.map((e) => e.sectionId));
  frag.materials = [...matIds].map((id) => modelStore.materials.get(id)).filter(Boolean).map((m) => clone(m!));
  frag.sections = [...secIds].map((id) => modelStore.sections.get(id)).filter(Boolean).map((s) => clone(s!));
  const caseIds = new Set(frag.loads.map((l) => (l.data as { caseId?: number }).caseId).filter((c): c is number => c !== undefined));
  frag.loadCases = modelStore.model.loadCases.filter((c) => caseIds.has(c.id)).map(clone);
  return frag;
}

/** The same fragment, no longer tied to the ids of the model it came from. */
export function detach(frag: Fragment): Fragment {
  return { ...clone(frag), local: false };
}

/** A definition without its id and without what is derived from it (the canonical digest). */
const definitionKey = (v: { id: number }) => {
  const { id: _id, canonical: _c, ...rest } = v as Record<string, unknown> & { id: number };
  return JSON.stringify(rest, Object.keys(rest).sort());
};

/**
 * Map a detached fragment's materials, sections and load cases onto the model: an identical
 * definition already there is reused, anything else is added. Must run inside a batch.
 */
export function mapDefinitions(frag: Fragment): { material: Map<number, number>; section: Map<number, number>; loadCase: Map<number, number>; added: { materials: number; sections: number; loadCases: number } } {
  const material = new Map<number, number>(), section = new Map<number, number>(), loadCase = new Map<number, number>();
  const added = { materials: 0, sections: 0, loadCases: 0 };
  if (frag.local) {
    for (const m of frag.materials) material.set(m.id, m.id);
    for (const s of frag.sections) section.set(s.id, s.id);
    for (const c of frag.loadCases) loadCase.set(c.id, c.id);
    return { material, section, loadCase, added };
  }
  const mats = new Map([...modelStore.materials.values()].map((m) => [definitionKey(m), m.id]));
  for (const m of frag.materials) {
    const hit = mats.get(definitionKey(m));
    if (hit !== undefined) { material.set(m.id, hit); continue; }
    const { id: _id, ...data } = m;
    material.set(m.id, modelStore.addMaterial(data));
    added.materials++;
  }
  const secs = new Map([...modelStore.sections.values()].map((s) => [definitionKey(s), s.id]));
  for (const s of frag.sections) {
    const hit = secs.get(definitionKey(s));
    if (hit !== undefined) { section.set(s.id, hit); continue; }
    const { id: _id, ...data } = s;
    section.set(s.id, modelStore.addSection(data));
    added.sections++;
  }
  for (const c of frag.loadCases) {
    const hit = modelStore.model.loadCases.find((x) => x.type === c.type && x.name === c.name);
    if (hit) { loadCase.set(c.id, hit.id); continue; }
    loadCase.set(c.id, modelStore.addLoadCase(c.name, c.type));
    added.loadCases++;
  }
  return { material, section, loadCase, added };
}

/** The fragment's bounding box, m. */
export function fragmentBounds(frag: Fragment): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const n of frag.nodes) {
    const p = [n.x, n.y, n.z];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, p[k]!); max[k] = Math.max(max[k]!, p[k]!); }
  }
  return { min, max };
}

/**
 * A fragment of bare members over its own nodes, on materials and sections the model already
 * has: what a layout (columns and beams between axes, a generated frame) hands to insertion.
 */
export function fragmentFromMembers(
  nodes: Array<{ id: number; x: number; y: number; z: number }>,
  members: Array<{ nodeI: number; nodeJ: number; type?: 'frame' | 'truss'; materialId: number; sectionId: number }>,
): Fragment {
  const elements = members.map((m, i) => ({
    id: i + 1, type: m.type ?? 'frame', nodeI: m.nodeI, nodeJ: m.nodeJ, materialId: m.materialId, sectionId: m.sectionId,
  }) as Element);
  const matIds = new Set(members.map((m) => m.materialId)), secIds = new Set(members.map((m) => m.sectionId));
  return {
    nodes: nodes.map((n) => ({ ...n })), elements, quads: [], plates: [], supports: [], loads: [], groups: [],
    materials: [...matIds].map((id) => modelStore.materials.get(id)).filter(Boolean).map((m) => clone(m!)),
    sections: [...secIds].map((id) => modelStore.sections.get(id)).filter(Boolean).map((s) => clone(s!)),
    loadCases: [], local: true,
  };
}
