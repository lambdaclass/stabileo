/**
 * A fragment as a model snapshot, and so as model code.
 *
 * The clipboard carries a fragment between projects and between applications as the model code
 * of the piece copied: text that can be read, pasted into a file, or pasted back into another
 * project. A snapshot (an imported file, a template, a generated model) becomes a fragment the
 * same way, which is how any of them is placed into the current model instead of replacing it.
 */
import type { ModelSnapshot } from '../../store/history.svelte';
import type { Element, Load, LoadCase, Material, ModelGroup, Plate, Quad, Section, Support } from '../../store/model.svelte';
import { codeToModel, modelToCode } from '../code/format';
import type { Fragment } from './fragment';
import type { JSONModel } from '../../templates/load-fixture';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function fragmentToSnapshot(frag: Fragment): Partial<ModelSnapshot> {
  return {
    nodes: frag.nodes.map((n) => [n.id, { id: n.id, x: n.x, y: n.y, z: n.z }]),
    materials: frag.materials.map((m) => [m.id, clone(m)]) as ModelSnapshot['materials'],
    sections: frag.sections.map((s) => [s.id, clone(s)]) as ModelSnapshot['sections'],
    elements: frag.elements.map((e) => [e.id, clone(e)]) as ModelSnapshot['elements'],
    quads: frag.quads.map((q) => [q.id, clone(q)]) as ModelSnapshot['quads'],
    plates: frag.plates.map((p) => [p.id, clone(p)]) as ModelSnapshot['plates'],
    supports: frag.supports.map((s) => [s.id, clone(s)]) as ModelSnapshot['supports'],
    loadCases: frag.loadCases.map((c) => clone(c)) as ModelSnapshot['loadCases'],
    loads: frag.loads.map((l) => clone(l)) as unknown as ModelSnapshot['loads'],
    groups: frag.groups.map((g) => [g.id, clone(g)]) as ModelSnapshot['groups'],
  };
}

/** Everything a snapshot holds that a fragment can carry, detached from its ids. */
export function fragmentFromSnapshot(s: Partial<ModelSnapshot>): Fragment {
  const vals = <T>(list: Array<[number, unknown]> | undefined) => (list ?? []).map(([, v]) => clone(v) as T);
  return {
    nodes: (s.nodes ?? []).map(([, n]) => ({ id: n.id, x: n.x, y: n.y, z: n.z ?? 0 })),
    elements: vals<Element>(s.elements as Array<[number, unknown]>),
    quads: vals<Quad>(s.quads as Array<[number, unknown]>),
    plates: vals<Plate>(s.plates as Array<[number, unknown]>),
    supports: vals<Support>(s.supports as Array<[number, unknown]>),
    loads: clone((s.loads ?? []) as unknown as Load[]),
    groups: vals<ModelGroup>(s.groups as Array<[number, unknown]>),
    materials: vals<Material>(s.materials as Array<[number, unknown]>),
    sections: vals<Section>(s.sections as Array<[number, unknown]>),
    loadCases: clone((s.loadCases ?? []) as LoadCase[]),
    local: false,
  };
}

export const fragmentToCode = (frag: Fragment): string => modelToCode(fragmentToSnapshot(frag) as ModelSnapshot);

/** The fragment written in `text`, or null when it is not model code or has errors. */
export function fragmentFromCode(text: string): Fragment | null {
  if (!/^\s*stabileo-model\b/.test(text)) return null;
  const r = codeToModel(text);
  if (!r.snapshot || r.errors.length) return null;
  const f = fragmentFromSnapshot(r.snapshot);
  return f.nodes.length ? f : null;
}

const NO_RELEASE = { my: false, mz: false, t: false };

/**
 * A generated or template model (`JSONModel`) as a fragment, with the same reading
 * `loadFixture` gives it: a hinge flag releases the in-plane moment, offsets and rolls are
 * carried, supports keep every field they state.
 */
export function fragmentFromJSONModel(json: JSONModel): Fragment {
  return {
    nodes: json.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z ?? 0 })),
    elements: json.elements.map((e) => ({
      id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ, materialId: e.materialId, sectionId: e.sectionId,
      releaseI: { ...NO_RELEASE, mz: !!e.hingeStart }, releaseJ: { ...NO_RELEASE, mz: !!e.hingeEnd },
      ...(e.offset ? { offset: clone(e.offset) } : {}),
      ...(e.rollAngle !== undefined ? { rollAngle: e.rollAngle } : {}),
    }) as unknown as Element),
    quads: json.quads.map((q) => clone(q) as unknown as Quad),
    plates: json.plates.map((p) => clone(p) as unknown as Plate),
    supports: json.supports.map((s) => clone(s) as unknown as Support),
    loads: clone(json.loads) as unknown as Load[],
    groups: [],
    materials: json.materials.map((m) => clone(m) as unknown as Material),
    sections: json.sections.map((s) => clone(s) as unknown as Section),
    loadCases: clone(json.loadCases) as unknown as LoadCase[],
    local: false,
  };
}
