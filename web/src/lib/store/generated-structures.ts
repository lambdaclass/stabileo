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
import { insertFragment, NodeIndex, type EditReport } from '../model/edit/transformed-copy';
import { weldTolerance } from '../model/weld-tolerance';
import { carriedOrientation, carriedSupport } from '../model/edit/transform-fields';

export const GENERATED_KIND = 'generated';

/** What the generated structure stands on: what the generator chose, nothing, or one type everywhere it chose one. */
export type SupportMode = 'generated' | 'none' | 'pinned' | 'fixed';

/** Where the generator's output goes, shared by the two halves of its panel. */
export interface OutputState {
  /** With the mouse, or at typed coordinates. A generated structure never replaces the model. */
  mode: 'atPoint' | 'atNode';
  supportMode: SupportMode;
  px: number; py: number; pz: number; rot: number;
  plane: 'XZ' | 'YZ';
  axisId: string;
  anchorIndex: number;
  result: string | null;
}

export const defaultOutputState = (): OutputState => ({
  mode: 'atNode', supportMode: 'generated', px: 0, py: 0, pz: 0, rot: 0, plane: 'XZ', axisId: '', anchorIndex: 0, result: null,
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
export function insertGenerated(
  g: GeneratedModel, T: Affine, meta: GeneratedMeta, roles: readonly string[] = [],
  opts: { withSupports?: boolean } = {},
): EditReport & { groupId: number } {
  // The placement bar's "with supports": unticked, the structure is placed without them, and
  // does not record them as its own either, so a regeneration does not bring them back.
  const withSupports = opts.withSupports ?? true;
  let report!: EditReport;
  let groupId = 0;
  modelStore.batch(() => {
    report = insertFragment(fragmentFromJSONModel(g.json), [T], { withSupports, withLoads: false });
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
      supportNodes: withSupports ? g.json.supports.map((s) => s.nodeId - 1) : [],
    };
    groupId = modelStore.addGroup(meta.name, GENERATED_KIND, {
      nodes: nodes.filter((n) => n.owned).map((n) => n.id),
      elements: elements.filter((e): e is { id: number; sectionId: number } => e !== null).map((e) => e.id),
    }, { origin: 'derived', data: data as unknown as Record<string, unknown> });
  });
  return { ...report, groupId };
}

export interface RegenerateReport {
  kept: number; added: number; removed: number; resized: number; keptSections: number;
  /** Nodes of the structure that landed on a model node and became it. */
  welded: number;
  /** Members that already existed end for end, and were not made twice. */
  duplicates: number;
  /** Supports the generator gives a node that welded onto a model node with its own: the model's was kept. */
  supportKept: number;
}

/**
 * A place for each point: its level (distinct heights, lowest first, within 1 mm) and its rank
 * within the level by plan position (x, then y). Two generations of one structure give the same
 * place to the same member of the frame, whatever order the generator emitted them in.
 */
function placeKeys(points: readonly Vec3[]): string[] {
  const mm = (v: number) => Math.round(v * 1000);
  const levels = [...new Set(points.map((p) => mm(p[2])))].sort((a, b) => a - b);
  const levelOf = (p: Vec3) => levels.indexOf(mm(p[2]));
  const order = points.map((p, i) => ({ p, i })).sort((a, b) =>
    levelOf(a.p) - levelOf(b.p) || mm(a.p[0]) - mm(b.p[0]) || mm(a.p[1]) - mm(b.p[1]) || a.i - b.i);
  const keys: string[] = new Array(points.length);
  const seen = new Map<number, number>();
  for (const { p, i } of order) {
    const lv = levelOf(p);
    const n = seen.get(lv) ?? 0;
    seen.set(lv, n + 1);
    keys[i] = `${lv}:${n}`;
  }
  return keys;
}

/**
 * What named a node of the structure that welded onto a model node now names that node: shell
 * corners, constraints (connectors and footings keep a node from welding), the groups other than
 * the structure's own, which is rewritten whole, and the time-history forces. The old node is then
 * removed; `removeNode` drops a constraint on it and leaves a shell's corner pointing at nothing.
 * A constraint between the old node and the one it welds onto ties two nodes that are now one:
 * `remapNodeReferences` drops it rather than leave a node tied to itself, which the solve
 * rejects as a circular chain.
 */
function followWelds(to: Map<number, number>, ownGroup: number): void {
  const r = (n: number) => to.get(n) ?? n;
  for (const q of modelStore.quads.values()) {
    if (q.nodes.some((n) => to.has(n))) modelStore.updateQuadNodes(q.id, q.nodes.map(r) as typeof q.nodes);
  }
  for (const p of modelStore.plates.values()) {
    if (p.nodes.some((n) => to.has(n))) modelStore.updatePlateNodes(p.id, p.nodes.map(r) as typeof p.nodes);
  }
  modelStore.remapNodeReferences(to);
  for (const grp of modelStore.model.groups.values()) {
    const list = grp.members.nodes;
    if (grp.id === ownGroup || !list?.some((n) => to.has(n))) continue;
    modelStore.setGroupMembers(grp.id, { ...grp.members, nodes: [...new Set(list.map(r))] });
  }
  const th = modelStore.model.dynamics?.timeHistory;
  if (th?.forces.some((f) => to.has(f.nodeId))) {
    modelStore.setDynamics({ ...modelStore.model.dynamics, timeHistory: { ...th, forces: th.forces.map((f) => ({ ...f, nodeId: r(f.nodeId) })) } });
  }
}

/** Replace the group's structure by `g`, in place. One undo step. */
export function regenerate(groupId: number, g: GeneratedModel, meta: GeneratedMeta, roles: readonly string[] = []): RegenerateReport | null {
  const old = generatedData(groupId);
  if (!old) return null;
  const T = old.transform;
  const out: RegenerateReport = { kept: 0, added: 0, removed: 0, resized: 0, keptSections: 0, welded: 0, duplicates: 0, supportKept: 0 };
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
    const index = new NodeIndex(weldTolerance());
    for (const n of modelStore.nodes.values()) if (!owned.has(n.id)) index.add(n.id, [n.x, n.y, n.z ?? 0]);
    const pos = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : undefined; };

    /*
     * Which old node or member a new one takes the place of: the k-th of its level, not the k-th
     * emitted. The generators emit level by level, so with a bay added the flat order shifted
     * every level after the first — the second storey's first column took the place of the
     * first storey's new last column, carrying its id, its hand-picked section and its loads to
     * the ground floor. Levels are ranked by height and, within one, places by plan position;
     * a geometry that only changes size (taller storeys, wider bays) keeps every place.
     */
    const newPts = g.json.nodes.map((n) => applyPoint(T, [n.x, n.y, n.z ?? 0]) as Vec3);
    const newNodeKey = placeKeys(newPts);
    // Places are ranked over every node of the old generation, shared ones included (a copy that
    // welded onto its neighbour's column does not own it, but it is still that column's place);
    // only the nodes it owned are taken over.
    const oldAll = old.nodes.flatMap((n) => {
      const m = modelStore.nodes.get(n.id);
      return m ? [{ n, p: [m.x, m.y, m.z ?? 0] as Vec3 }] : [];
    });
    const oldByKey = new Map(placeKeys(oldAll.map((o) => o.p)).flatMap((key, i) =>
      oldAll[i]!.n.owned ? [[key, oldAll[i]!.n] as const] : []));

    /*
     * A node of the structure that now lands on a model node welds onto it, as it does on
     * insertion; moving it there instead left two coincident nodes and nothing joining them.
     * Only a node that carries nothing but the structure is welded: one with a load, a
     * connector, a footing or a member the user drew on it is moved, as before. The node welded
     * away is no longer the structure's, and goes with the other old nodes it does not use; what
     * else named it — a shell corner, a constraint, a group, a time-history force — names the
     * node it became (below), and its support goes there too.
     */
    const ownedElements = new Set(old.elements.flatMap((e) => e ? [e.id] : []));
    const onlyTheStructure = (id: number) =>
      ![...modelStore.elements.values()].some((e) => (e.nodeI === id || e.nodeJ === id) && !ownedElements.has(e.id))
      && !modelStore.loads.some((l) => (l.type === 'nodal' || l.type === 'nodal3d') && l.data.nodeId === id)
      && ![...modelStore.connectors.values()].some((c) => c.nodeI === id || c.nodeJ === id)
      && ![...modelStore.footings.values()].some((f) => f.nodeId === id);

    const nodes: GeneratedData['nodes'] = [];
    // Old node → the model node it welded onto.
    const weldedTo = new Map<number, number>();
    g.json.nodes.forEach((_n, k) => {
      const p = newPts[k]!;
      const prev = oldByKey.get(newNodeKey[k]!);
      if (prev) {
        oldByKey.delete(newNodeKey[k]!);
        const hit = index.find(p, pos);
        if (hit !== null && onlyTheStructure(prev.id)) {
          nodes.push({ id: hit, owned: false });
          weldedTo.set(prev.id, hit);
          out.welded++;
          return;
        }
        modelStore.updateNode(prev.id, p[0], p[1], p[2]);
        nodes.push(prev);
        return;
      }
      const hit = index.find(p, pos);
      if (hit !== null) { nodes.push({ id: hit, owned: false }); return; }
      nodes.push({ id: modelStore.addNode(p[0], p[1], p[2]), owned: true });
    });
    const nodeOf = (jsonId: number) => nodes[jsonId - 1]!.id;
    if (weldedTo.size > 0) followWelds(weldedTo, groupId);

    // Old members by role and place: a new column takes the place of the old column that was at
    // the same place of the same level (see placeKeys above).
    const usedOld = new Set<number>();
    const midpoint = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.min(a[2], b[2])];
    const oldMembers = old.elements.flatMap((e) => {
      const m = e ? modelStore.elements.get(e.id) : undefined;
      const a = m && modelStore.nodes.get(m.nodeI), b = m && modelStore.nodes.get(m.nodeJ);
      return e && a && b ? [{ e, role: e.role ?? '', at: midpoint([a.x, a.y, a.z ?? 0], [b.x, b.y, b.z ?? 0]) }] : [];
    });
    const oldMemberByKey = new Map<string, { id: number; sectionId: number; role?: string }>();
    for (const role of new Set(oldMembers.map((o) => o.role))) {
      const of = oldMembers.filter((o) => o.role === role);
      placeKeys(of.map((o) => o.at)).forEach((key, i) => oldMemberByKey.set(`${role}|${key}`, of[i]!.e));
    }
    const takeOld = (k: number) => {
      const key = newMemberKey.get(k);
      const prev = key !== undefined ? oldMemberByKey.get(key) : undefined;
      if (!prev) return undefined;
      oldMemberByKey.delete(key!);
      usedOld.add(prev.id);
      return prev;
    };

    const elements: GeneratedData['elements'] = [];
    const elementMap = new Map<number, number>();
    // Member ends the model already joins, outside this structure: a new member there is that one.
    const pairKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;
    const existingPairs = new Map([...modelStore.elements.values()]
      .filter((e) => !ownedElements.has(e.id)).map((e) => [pairKey(e.nodeI, e.nodeJ), e.id]));
    // Places of the new members this generation will own: one landing on a member it does not
    // own is shared and has no place, as the old generation's shared members have none.
    const newMemberKey = new Map<number, string>();
    const ownsMember = (k: number) => {
      const e = g.json.elements[k]!, i2 = nodeOf(e.nodeI), j2 = nodeOf(e.nodeJ);
      return i2 !== j2 && !existingPairs.has(pairKey(i2, j2));
    };
    for (const role of new Set(g.json.elements.map((_e, k) => roles[k] ?? ''))) {
      const ks = g.json.elements.map((_e, k) => k).filter((k) => (roles[k] ?? '') === role && ownsMember(k));
      const at = ks.map((k) => midpoint(newPts[g.json.elements[k]!.nodeI - 1]!, newPts[g.json.elements[k]!.nodeJ - 1]!));
      placeKeys(at).forEach((key, i) => newMemberKey.set(ks[i]!, `${role}|${key}`));
    }

    g.json.elements.forEach((e, k) => {
      const role = roles[k] ?? '';
      const src = frag.elements[k]!;
      const i2 = nodeOf(e.nodeI), j2 = nodeOf(e.nodeJ);
      // Insertion leaves shared members to their existing owner. Regeneration must do the
      // same, including when two copied frames share a column along their common edge.
      const existing = existingPairs.get(pairKey(i2, j2));
      if (i2 === j2 || existing !== undefined) {
        elements.push(null);
        out.duplicates++;
        if (existing !== undefined) elementMap.set(e.id, existing);
        return;
      }
      const a = g.json.nodes[e.nodeI - 1]!, b = g.json.nodes[e.nodeJ - 1]!;
      const o = carriedOrientation(T, src, a, b, modelStore.nodes.get(i2)!, modelStore.nodes.get(j2)!, modelStore.sections.get(secOf(e.sectionId)), false);
      const newSec = secOf(e.sectionId);
      const prev = takeOld(k);
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
        existingPairs.set(pairKey(i2, j2), prev.id);
        out.kept++;
        return;
      }
      const id = modelStore.addElement(i2, j2, e.type);
      modelStore.updateElement(id, { materialId: matOf(e.materialId), sectionId: newSec, ...o.fields });
      elements.push({ id, sectionId: newSec, ...(role ? { role } : {}) });
      elementMap.set(e.id, id);
      existingPairs.set(pairKey(i2, j2), id);
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
    // A node welded away gives its support to the node it became, unless that one has its own:
    // removed with the old node, the support was lost and the base stood on nothing.
    const weldTargets = new Set(weldedTo.values());
    for (const s of g.json.supports) {
      const n = nodes[s.nodeId - 1]!;
      if (!n.owned && !weldTargets.has(n.id)) continue;
      if (!n.owned && supportAt.has(n.id)) { out.supportKept++; continue; }
      const c = carriedSupport(T, { ...(s as unknown as Support), id: 0 }, n.id, elementMap);
      if (c) modelStore.addSupportEntry(c);
    }

    // Nodes the old generation owned and the new one does not use, and the ones welded away. A
    // shell on one keeps it: removing a node leaves the shells on it a corner that is not there.
    const used = new Set<number>();
    for (const el of modelStore.elements.values()) { used.add(el.nodeI); used.add(el.nodeJ); }
    for (const sh of [...modelStore.quads.values(), ...modelStore.plates.values()]) sh.nodes.forEach((n) => used.add(n));
    const kept = new Set(nodes.map((n) => n.id));
    for (const n of old.nodes) {
      if (n.owned && !kept.has(n.id) && modelStore.nodes.has(n.id) && !used.has(n.id)) modelStore.removeNode(n.id);
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
