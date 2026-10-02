/**
 * Insert a fragment under one or more isometries as ONE undo step: the operation behind repeat,
 * polar repeat, mirror, rotate-with-copy, paste, placing a generated structure and importing a
 * file into the model.
 *
 * ── What is copied ────────────────────────────────────────────────
 *
 * The nodes the set touches, its members and shells with every field they carry (see
 * `transform-fields.ts` for how each is carried), and optionally their loads and supports.
 *
 * GROUPS are copied too, when every entity a group holds is in the set: the copy of a group is a
 * group over the copies. Generated metadata follows the copied IDs and placement; other kinds'
 * data goes across verbatim. That is the seam the physical model arrives through — a physical
 * member, a panel, a precast piece is a group of analytical
 * entities with rules in `data` — so copying a structure copies its physical objects without
 * this layer knowing every kind. A group only partly inside the set is not copied: half
 * of a physical object is not one.
 *
 * ── Welding ───────────────────────────────────────────────────────
 *
 * A copied node that lands on an existing node — the shared column line of a repeated bay, a
 * node on the mirror plane — IS that node. That is what makes a repeat produce a connected
 * structure instead of a stack of coincident ones. A member whose ends both weld onto an existing
 * member's ends is that member already, and is not added twice. The model wins on a welded
 * node: its support stays as it is, and a support the fragment carried there is reported, not
 * added.
 *
 * ── Definitions ───────────────────────────────────────────────────
 *
 * A fragment from elsewhere brings its materials, sections and load cases by definition; an
 * identical one already in the model is reused (`mapDefinitions`).
 *
 * ── Link bars ─────────────────────────────────────────────────────
 *
 * Optionally, each copied node is joined to its predecessor in the sequence by a member — the
 * beams between repeated frames, the purlins of a polar array.
 */

import { weldTolerance } from '../weld-tolerance';
import { modelStore } from '../../store/model.svelte';
import type { Element, Quad, Plate } from '../../store/model.svelte';
import { applyPoint, applyVector, isReflection, type Affine, type Vec3 } from './affine';
import {
  carriedJoint, carriedLoad, carriedOffset, carriedOrientation, carriedSupport, type EditWarning,
} from './transform-fields';
import { fragmentOf, mapDefinitions, type EntitySet, type Fragment } from './fragment';
import { copyGeneratedMetadata, generatedMetadata } from './generated-metadata';
import { NodeIndex } from './node-index';
export { NodeIndex } from './node-index';

export { closure, type EntitySet } from './fragment';

export interface CopyOptions {
  withLoads?: boolean;
  withSupports?: boolean;
  withGroups?: boolean;
  /** Join each copied node to its predecessor. */
  link?: { type: 'frame' | 'truss'; materialId: number; sectionId: number } | null;
  /** Nodes closer than this weld, m. */
  weldTol?: number;
  leftHand?: boolean;
}

export interface EditReport {
  nodes: number[];
  elements: number[];
  quads: number[];
  plates: number[];
  links: number[];
  groups: number[];
  /** Copied nodes that landed on an existing node and became it. */
  welded: number;
  /** Copied members that already existed, end for end. */
  duplicates: number;
  /** Supports the fragment carried onto a welded node, where the model's own was kept. */
  supportKept: number;
  /** Nodal loads the fragment carried onto a welded node, where the model's own were kept. */
  loadKept: number;
  /** Materials, sections and load cases the fragment brought that the model did not have. */
  added: { materials: number; sections: number; loadCases: number };
  /** Per copy: fragment id → model id, for nodes (welded ones included) and members placed. */
  maps: Array<{ nodes: Map<number, number>; elements: Map<number, number> }>;
  warnings: Partial<Record<EditWarning, number>>;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Add `transforms.length` copies of `set`, copy k under `transforms[k]`.
 *
 * With `link`, copy k's nodes are joined to copy k−1's (copy 0 to the originals).
 */
export function copyTransformed(set: EntitySet, transforms: readonly Affine[], opts: CopyOptions = {}): EditReport {
  return insertFragment(fragmentOf(set, opts), transforms, opts);
}

/**
 * Insert `transforms.length` copies of `frag`, copy k under `transforms[k]`, in one batch.
 *
 * With `link`, copy k's nodes are joined to copy k−1's (copy 0 to the fragment's own ids, which
 * only exist when the fragment is `local`).
 */
export function insertFragment(frag: Fragment, transforms: readonly Affine[], opts: Omit<CopyOptions, 'withGroups'> = {}): EditReport {
  const tol = opts.weldTol ?? weldTolerance();
  const leftHand = opts.leftHand ?? false;
  const report: EditReport = {
    nodes: [], elements: [], quads: [], plates: [], links: [], groups: [], welded: 0, duplicates: 0, supportKept: 0, loadKept: 0,
    added: { materials: 0, sections: 0, loadCases: 0 }, maps: [], warnings: {},
  };
  const warn = (w: EditWarning) => { report.warnings[w] = (report.warnings[w] ?? 0) + 1; };
  if (frag.nodes.length === 0 || transforms.length === 0) return report;

  modelStore.bulkMutate(() => {
    const defs = mapDefinitions(frag);
    report.added = defs.added;
    const mat = (id: number) => defs.material.get(id) ?? id;
    const sec = (id: number) => defs.section.get(id) ?? id;
    const sourceSection = new Map(frag.sections.map((s) => [s.id, s]));

    const pos = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : undefined; };
    const index = new NodeIndex(tol);
    for (const n of modelStore.nodes.values()) index.add(n.id, [n.x, n.y, n.z ?? 0]);
    const pairs = new Set<string>();
    for (const e of modelStore.elements.values()) pairs.add(pairKey(e.nodeI, e.nodeJ));
    let nextArc = Math.max(0, ...[...modelStore.elements.values()].map((e) => e.arc?.id ?? 0)) + 1;

    const nodes0 = new Map(frag.nodes.map((n) => [n.id, n]));
    const elements0 = new Map(frag.elements.map((e) => [e.id, e]));
    const supports0 = opts.withSupports ? frag.supports : [];
    const loads0 = opts.withLoads ? frag.loads.map((l) => {
      const c = (l.data as { caseId?: number }).caseId;
      return c === undefined || frag.local ? l : { ...l, data: { ...l.data, caseId: defs.loadCase.get(c) ?? c } } as typeof l;
    }) : [];

    /*
     * Shells already on a set of corners, like `pairs` for members: a copy that lands on them —
     * pasting in place — is a duplicate, not a second slab on the same nodes.
     */
    const shellKey = (nodes: readonly number[]) => [...nodes].sort((x, y) => x - y).join(',');
    const shells = new Set([...modelStore.quads.values(), ...modelStore.plates.values()].map((s) => shellKey(s.nodes)));

    let prevNodeMap = new Map(frag.nodes.map((n) => [n.id, n.id]));
    /** The fragment's node lands where it was: the same position in the model. */
    const fragNode = new Map(frag.nodes.map((n) => [n.id, n]));
    const sameSpot = (fragId: number, modelId: number) => {
      const a = fragNode.get(fragId), b = modelStore.nodes.get(modelId);
      return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) <= tol;
    };
    /** The node already carries this load: the same kind, case and values. */
    const loadKey = (l: { type: string; data: object }) => {
      const { id: _id, ...rest } = l.data as Record<string, unknown>;
      return `${l.type}|${JSON.stringify(Object.fromEntries(Object.entries(rest).sort(([x], [y]) => (x < y ? -1 : 1))))}`;
    };
    const carries = (nodeId: number, load: { type: string; data: object }) => {
      const key = loadKey(load);
      return modelStore.loads.some((m) => (m.data as { nodeId?: number }).nodeId === nodeId && loadKey(m) === key);
    };
    transforms.forEach((T, k) => {
      const created = new Set<number>();
      const nodeMap = new Map<number, number>();
      for (const [id, n] of nodes0) {
        const p = applyPoint(T, [n.x, n.y, n.z]);
        const hit = index.find(p, pos);
        if (hit !== null) { nodeMap.set(id, hit); report.welded++; continue; }
        const nid = modelStore.addNode(p[0], p[1], p[2]);
        index.add(nid, p);
        nodeMap.set(id, nid);
        report.nodes.push(nid);
        created.add(nid);
      }

      const elementMap = new Map<number, number>();
      const signs = new Map<number, { sy: 1 | -1; sz: 1 | -1 }>();
      const arcMap = new Map<number, number>();
      for (const [id, e] of elements0) {
        const i2 = nodeMap.get(e.nodeI)!, j2 = nodeMap.get(e.nodeJ)!;
        if (i2 === j2) continue;
        if (pairs.has(pairKey(i2, j2))) { report.duplicates++; continue; }
        const ni = nodes0.get(e.nodeI)!, nj = nodes0.get(e.nodeJ)!;
        const ni2 = modelStore.nodes.get(i2)!, nj2 = modelStore.nodes.get(j2)!;
        const o = carriedOrientation(T, e, ni, nj, ni2, nj2, sourceSection.get(e.sectionId), leftHand);
        if (!o.exact) warn('asymmetricProfile');
        signs.set(id, { sy: o.sy, sz: o.sz });
        const { id: _id, nodeI: _i, nodeJ: _j, localYx: _x, localYy: _y, localYz: _z, rollAngle: _r, jointI, jointJ, offset, arc, reinforcement: _rf, ...rest } = e;
        const patch: Partial<Element> = { ...rest, ...o.fields, materialId: mat(e.materialId), sectionId: sec(e.sectionId) };
        // A member of variable section names its end J's section too.
        if (rest.variableSection) patch.variableSection = { ...rest.variableSection, sectionJ: sec(rest.variableSection.sectionJ) };
        const jI = carriedJoint(T, jointI), jJ = carriedJoint(T, jointJ);
        if (jI === null || jJ === null) warn('jointDropped');
        if (jI) patch.jointI = jI;
        if (jJ) patch.jointJ = jJ;
        const off = carriedOffset(T, offset, o.sy, o.sz);
        if (off) patch.offset = off;
        if (arc) {
          if (!arcMap.has(arc.id)) arcMap.set(arc.id, nextArc++);
          const mp = (v: { x: number; y: number; z: number }) => { const q = applyPoint(T, [v.x, v.y, v.z]); return { x: q[0], y: q[1], z: q[2] }; };
          patch.arc = { id: arcMap.get(arc.id)!, spec: { ...arc.spec, start: mp(arc.spec.start), through: mp(arc.spec.through), end: mp(arc.spec.end) } };
        }
        const eid = modelStore.addElement(i2, j2, e.type);
        modelStore.updateElement(eid, patch);
        pairs.add(pairKey(i2, j2));
        elementMap.set(id, eid);
        report.elements.push(eid);
      }

      // Shells: a reflection reverses the corner order, so the normal is carried as A·n and not
      // turned inside out.
      const flip = isReflection(T);
      const carryOffset = <O extends { frame: string; x: number; y: number; z: number }>(offset: O | undefined) =>
        offset && offset.frame === 'global'
          ? (() => { const w = applyVector(T, [offset.x, offset.y, offset.z]); return { ...offset, x: w[0], y: w[1], z: w[2] }; })()
          : offset;
      const quadMap = new Map<number, number>();
      // Corners that welded onto each other leave no shell, as a member's two ends do.
      const collapsed = (corners: readonly number[]) => new Set(corners).size !== corners.length;
      for (const q of frag.quads) {
        const corners = q.nodes.map((n) => nodeMap.get(n)!) as Quad['nodes'];
        if (collapsed(corners)) { warn('shellCollapsed'); continue; }
        if (shells.has(shellKey(corners))) { report.duplicates++; continue; }
        shells.add(shellKey(corners));
        const { id: _id, nodes: _n, offset, ...rest } = q;
        const nodes = (flip ? [corners[0], corners[3], corners[2], corners[1]] : corners) as Quad['nodes'];
        const off = carryOffset(offset);
        const qid = modelStore.addShellEntry('quad', { ...rest, materialId: mat(q.materialId), nodes, ...(off ? { offset: off } : {}) });
        quadMap.set(q.id, qid);
        report.quads.push(qid);
      }
      const plateMap = new Map<number, number>();
      for (const p of frag.plates) {
        const corners = p.nodes.map((n) => nodeMap.get(n)!) as Plate['nodes'];
        if (collapsed(corners)) { warn('shellCollapsed'); continue; }
        if (shells.has(shellKey(corners))) { report.duplicates++; continue; }
        shells.add(shellKey(corners));
        const { id: _id, nodes: _n, offset, ...rest } = p;
        const nodes = (flip ? [corners[0], corners[2], corners[1]] : corners) as Plate['nodes'];
        const off = carryOffset(offset);
        const pid = modelStore.addShellEntry('plate', { ...rest, materialId: mat(p.materialId), nodes, ...(off ? { offset: off } : {}) });
        plateMap.set(p.id, pid);
        report.plates.push(pid);
      }

      for (const s of supports0) {
        const to = nodeMap.get(s.nodeId)!;
        // A welded node keeps whatever support it already has.
        if (!created.has(to)) { if (!frag.local || to !== s.nodeId) report.supportKept++; continue; }
        const c = carriedSupport(T, s, to, elementMap);
        if (c) modelStore.addSupportEntry(c); else warn('supportDropped');
      }

      const sig = (id: number) => signs.get(id) ?? { sy: 1 as const, sz: 1 as const };
      for (const l of loads0) {
        const c = carriedLoad(T, l, nodeMap, elementMap, quadMap, sig);
        if (!c) continue;
        if (c.warning) warn(c.warning);
        /*
         * A load that lands back on its own source node is already there. A local fragment
         * knows its source; the clipboard is detached, and pasting in place added every nodal
         * load a second time — the node carried 2×F. For it, the source is the node with the
         * same id, where the copy put it (the transform left it in place), already carrying the
         * same load. A load welded onto any other node is kept: two bays sharing a node add
         * their tributary loads.
         */
        const onNode = (c.load?.data as { nodeId?: number } | undefined)?.nodeId;
        const sourceNode = (l.data as { nodeId?: number }).nodeId;
        if (c.load && onNode !== undefined && onNode === sourceNode && !created.has(onNode)
          && (frag.local || (sameSpot(sourceNode, onNode) && carries(onNode, c.load)))) {
          report.loadKept++;
          continue;
        }
        if (c.load) modelStore.addLoadEntry(c.load);
      }

      for (const g of frag.groups) {
        const m = g.members;
        const members = {
          ...(m.nodes ? { nodes: m.nodes.map((id: number) => nodeMap.get(id)!) } : {}),
          ...(m.elements ? { elements: m.elements.map((id: number) => elementMap.get(id)).filter((x: number | undefined) => x !== undefined) } : {}),
          ...(m.quads ? { quads: m.quads.map((id: number) => quadMap.get(id)!) } : {}),
          ...(m.plates ? { plates: m.plates.map((id: number) => plateMap.get(id)!) } : {}),
        };
        const generated = generatedMetadata(g);
        const mapped = generated ? copyGeneratedMetadata(generated, T, nodeMap, elementMap, defs.section, created) : null;
        const data = generated ? mapped as unknown as Record<string, unknown> | null : g.data;
        if (generated && mapped) members.nodes = mapped.nodes.filter((n) => n.owned).map((n) => n.id);
        if (g.data && !generated) warn('groupDataVerbatim');
        const name = frag.local || transforms.length > 1 ? `${g.name} (${k + 1})` : g.name;
        report.groups.push(modelStore.addGroup(name, generated && !mapped ? 'selection' : g.kind, members, { origin: g.origin, ...(data ? { data } : {}) }));
      }

      if (opts.link) {
        for (const [id] of nodes0) {
          const a = prevNodeMap.get(id)!, b = nodeMap.get(id)!;
          if (a === b || pairs.has(pairKey(a, b)) || !modelStore.nodes.has(a)) continue;
          const lid = modelStore.addElement(a, b, opts.link.type);
          modelStore.updateElement(lid, { materialId: opts.link.materialId, sectionId: opts.link.sectionId });
          pairs.add(pairKey(a, b));
          report.links.push(lid);
        }
      }
      report.maps.push({ nodes: nodeMap, elements: elementMap });
      prevNodeMap = nodeMap;
    });
  });
  return report;
}
