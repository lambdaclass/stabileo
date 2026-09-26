/**
 * Generated structures placed into a model, and regenerated where they are.
 *
 * A generated structure inserted into a model (at a point, at a node, or as the whole model)
 * becomes a group of kind `generated` that keeps what made it: the generator, its parameters,
 * the profiles per role, the material, the transform it was placed with, and which model node
 * and member each generated one became. That record is what lets it be regenerated.
 *
 * ── Regenerating keeps what was done to it ────────────────────────
 *
 * Member k of the new generation takes the place of member k of the old: same model id, so its
 * loads, releases and anything else edited on it stay. Its section follows the new profile only
 * where it still has the one the generator gave it; a member the user resized keeps its size.
 * Nodes the structure owns move; nodes it welded onto the model are the model's and stay where
 * they are. Members and nodes the new generation no longer has are removed, and ones it adds are
 * created. All of it one undo step.
 */
import { modelStore } from './model.svelte';
import type { Element, Support } from './model.svelte';
import type { GeneratedModel } from '../engine/generators/emit';
import { applyPoint, type Affine, type Vec3 } from '../model/edit/affine';
import { mapDefinitions } from '../model/edit/fragment';
import { fragmentFromJSONModel } from '../model/edit/fragment-code';
import { insertFragment, NodeIndex, DEFAULT_WELD, type EditReport } from '../model/edit/transformed-copy';
import { carriedOrientation, carriedSupport } from '../model/edit/transform-fields';

export const GENERATED_KIND = 'generated';

/** What the generated structure stands on: what the generator chose, nothing, or one type everywhere it chose one. */
export type SupportMode = 'generated' | 'none' | 'pinned' | 'fixed';

/** Where the generator's output goes, shared by the two halves of its panel. */
export interface OutputState {
  mode: 'newModel' | 'atPoint' | 'atNode';
  supportMode: SupportMode;
  px: number; py: number; pz: number; rot: number;
  plane: 'XZ' | 'YZ';
  axisId: string;
  anchorIndex: number;
  result: string | null;
}

export const defaultOutputState = (): OutputState => ({
  mode: 'newModel', supportMode: 'generated', px: 0, py: 0, pz: 0, rot: 0, plane: 'XZ', axisId: '', anchorIndex: 0, result: null,
});

export function withSupportMode<T extends { supports: Array<{ node: number; type: string }> }>(t: T, mode: SupportMode): T {
  if (mode === 'generated') return t;
  if (mode === 'none') return { ...t, supports: [] };
  return { ...t, supports: t.supports.map((s) => ({ ...s, type: mode })) };
}

export interface GeneratedMeta {
  generator: string;
  params: Record<string, unknown>;
  profiles: Record<string, unknown>;
  gradeId: string | null;
  name: string;
}

export interface GeneratedData extends GeneratedMeta {
  transform: Affine;
  /** By generated index: the model node it became, and whether the structure owns it. */
  nodes: Array<{ id: number; owned: boolean }>;
  /** By generated index: the member it became, its role, and the section the generator gave it; null when it already existed. */
  elements: Array<{ id: number; sectionId: number; role?: string } | null>;
  /** Generated indices of the nodes the generator supported. */
  supportNodes: number[];
}

export function generatedData(groupId: number): GeneratedData | null {
  const g = modelStore.model.groups.get(groupId);
  return g && g.kind === GENERATED_KIND && g.data ? (g.data as unknown as GeneratedData) : null;
}

export function generatedGroups() {
  return [...modelStore.model.groups.values()].filter((g) => g.kind === GENERATED_KIND && g.data);
}

/** Insert `g` under T and record it as a regenerable group. One undo step. */
/**
 * `roles` are the generated members' roles in emitted order (the topology's), so that a
 * regeneration can match a column to a column and a beam to a beam.
 */
export function insertGenerated(g: GeneratedModel, T: Affine, meta: GeneratedMeta, roles: readonly string[] = []): EditReport & { groupId: number } {
  let report!: EditReport;
  let groupId = 0;
  modelStore.batch(() => {
    report = insertFragment(fragmentFromJSONModel(g.json), [T], { withSupports: true, withLoads: false });
    modelStore.refreshCanonicalSections();
    const created = new Set(report.nodes);
    const nm = report.maps[0]!.nodes, em = report.maps[0]!.elements;
    const nodes = g.json.nodes.map((n) => { const id = nm.get(n.id)!; return { id, owned: created.has(id) }; });
    const elements = g.json.elements.map((e, k) => {
      const id = em.get(e.id);
      return id === undefined ? null : { id, sectionId: modelStore.elements.get(id)!.sectionId, ...(roles[k] ? { role: roles[k] } : {}) };
    });
    const data: GeneratedData = {
      ...meta, transform: T, nodes, elements,
      supportNodes: g.json.supports.map((s) => s.nodeId - 1),
    };
    groupId = modelStore.addGroup(meta.name, GENERATED_KIND, {
      nodes: nodes.filter((n) => n.owned).map((n) => n.id),
      elements: elements.filter((e): e is { id: number; sectionId: number } => e !== null).map((e) => e.id),
    }, { origin: 'derived', data: data as unknown as Record<string, unknown> });
  });
  return { ...report, groupId };
}

export interface RegenerateReport { kept: number; added: number; removed: number; resized: number; keptSections: number }

/** Replace the group's structure by `g`, in place. One undo step. */
export function regenerate(groupId: number, g: GeneratedModel, meta: GeneratedMeta, roles: readonly string[] = []): RegenerateReport | null {
  const old = generatedData(groupId);
  if (!old) return null;
  const T = old.transform;
  const out: RegenerateReport = { kept: 0, added: 0, removed: 0, resized: 0, keptSections: 0 };
  modelStore.batch(() => {
    const frag = fragmentFromJSONModel(g.json);
    // A profile the old generation already used is that section, by name: the model's copy has
    // been settled against its geometry since, so it no longer equals the generator's definition.
    const oldByName = new Map<string, number>();
    for (const e of old.elements) {
      const sec = e ? modelStore.sections.get(e.sectionId) : undefined;
      if (sec) oldByName.set(sec.name, sec.id);
    }
    const byName = new Map<number, number>();
    frag.sections = frag.sections.filter((s) => {
      const hit = oldByName.get(s.name);
      if (hit !== undefined) byName.set(s.id, hit);
      return hit === undefined;
    });
    const defs = mapDefinitions(frag);
    const secOf = (id: number) => byName.get(id) ?? defs.section.get(id) ?? id;
    const matOf = (id: number) => defs.material.get(id) ?? id;

    // Weld candidates: the model's nodes that this structure does not own.
    const owned = new Set(old.nodes.filter((n) => n.owned).map((n) => n.id));
    const index = new NodeIndex(DEFAULT_WELD);
    for (const n of modelStore.nodes.values()) if (!owned.has(n.id)) index.add(n.id, [n.x, n.y, n.z ?? 0]);
    const pos = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : undefined; };

    const nodes: GeneratedData['nodes'] = [];
    g.json.nodes.forEach((n, k) => {
      const p = applyPoint(T, [n.x, n.y, n.z ?? 0]);
      const prev = old.nodes[k];
      if (prev?.owned && modelStore.nodes.has(prev.id)) {
        modelStore.updateNode(prev.id, p[0], p[1], p[2]);
        nodes.push(prev);
        return;
      }
      const hit = index.find(p, pos);
      if (hit !== null) { nodes.push({ id: hit, owned: false }); return; }
      nodes.push({ id: modelStore.addNode(p[0], p[1], p[2]), owned: true });
    });
    const nodeOf = (jsonId: number) => nodes[jsonId - 1]!.id;

    // Old members by role, in order: the new k-th column takes the place of the old k-th column.
    const pool = new Map<string, Array<{ id: number; sectionId: number; role?: string }>>();
    const usedOld = new Set<number>();
    for (const e of old.elements) if (e) (pool.get(e.role ?? '') ?? pool.set(e.role ?? '', []).get(e.role ?? '')!).push(e);
    const takeOld = (role: string) => {
      const list = pool.get(role) ?? pool.get('');
      const next = list?.shift();
      if (next) usedOld.add(next.id);
      return next;
    };

    const elements: GeneratedData['elements'] = [];
    const elementMap = new Map<number, number>();
    g.json.elements.forEach((e, k) => {
      const role = roles[k] ?? '';
      const src = frag.elements[k]!;
      const i2 = nodeOf(e.nodeI), j2 = nodeOf(e.nodeJ);
      const a = g.json.nodes[e.nodeI - 1]!, b = g.json.nodes[e.nodeJ - 1]!;
      const o = carriedOrientation(T, src, a, b, modelStore.nodes.get(i2)!, modelStore.nodes.get(j2)!, modelStore.sections.get(secOf(e.sectionId)), false);
      const newSec = secOf(e.sectionId);
      const prev = takeOld(role);
      const cur = prev ? modelStore.elements.get(prev.id) : undefined;
      if (prev && cur) {
        const unedited = cur.sectionId === prev.sectionId;
        const patch: Partial<Element> = {
          nodeI: i2, nodeJ: j2, type: e.type, materialId: matOf(e.materialId),
          localYx: undefined, localYy: undefined, localYz: undefined, rollAngle: undefined, ...o.fields,
        };
        if (unedited) { patch.sectionId = newSec; if (newSec !== cur.sectionId) out.resized++; } else out.keptSections++;
        modelStore.updateElement(prev.id, patch);
        elements.push({ id: prev.id, sectionId: unedited ? newSec : prev.sectionId, ...(role ? { role } : {}) });
        elementMap.set(e.id, prev.id);
        out.kept++;
        return;
      }
      const id = modelStore.addElement(i2, j2, e.type);
      modelStore.updateElement(id, { materialId: matOf(e.materialId), sectionId: newSec, ...o.fields });
      elements.push({ id, sectionId: newSec, ...(role ? { role } : {}) });
      elementMap.set(e.id, id);
      out.added++;
    });
    for (const prev of old.elements) {
      if (prev && !usedOld.has(prev.id) && modelStore.elements.has(prev.id)) { modelStore.removeElement(prev.id); out.removed++; }
    }

    // Supports on the nodes the structure owns: the generator's, carried by T.
    const supportNodes = g.json.supports.map((s) => s.nodeId - 1);
    const supportAt = new Map([...modelStore.supports.values()].map((s) => [s.nodeId, s.id]));
    for (const k of old.supportNodes) {
      const n = nodes[k] ?? old.nodes[k];
      if (n?.owned && !supportNodes.includes(k)) { const sid = supportAt.get(n.id); if (sid !== undefined) modelStore.removeSupport(sid); }
    }
    for (const s of g.json.supports) {
      const n = nodes[s.nodeId - 1]!;
      if (!n.owned) continue;
      const c = carriedSupport(T, { ...(s as unknown as Support), id: 0 }, n.id, elementMap);
      if (c) modelStore.addSupportEntry(c);
    }

    // Nodes the old generation owned and the new one does not use.
    const used = new Set<number>();
    for (const el of modelStore.elements.values()) { used.add(el.nodeI); used.add(el.nodeJ); }
    for (let k = g.json.nodes.length; k < old.nodes.length; k++) {
      const n = old.nodes[k]!;
      if (n.owned && modelStore.nodes.has(n.id) && !used.has(n.id)) modelStore.removeNode(n.id);
    }

    modelStore.refreshCanonicalSections();
    modelStore.setGroupMembers(groupId, {
      nodes: nodes.filter((n) => n.owned).map((n) => n.id),
      elements: elements.filter((e): e is { id: number; sectionId: number } => e !== null).map((e) => e.id),
    });
    const data: GeneratedData = { ...meta, transform: T, nodes, elements, supportNodes };
    modelStore.setGroupData(groupId, data as unknown as Record<string, unknown>);
    modelStore.renameGroup(groupId, meta.name);
  });
  return out;
}
