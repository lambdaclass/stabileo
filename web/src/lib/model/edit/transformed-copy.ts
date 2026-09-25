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
 * group over the copies. Its `kind` and `data` go across verbatim. That is the seam the physical
 * model arrives through — a physical member, a panel, a precast piece is a group of analytical
 * entities with rules in `data` — so copying a structure copies its physical objects without
 * this layer knowing what any of them is. A group only partly inside the set is not copied: half
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

import { modelStore } from '../../store/model.svelte';
import type { Element, Quad, Plate } from '../../store/model.svelte';
import { applyPoint, applyVector, isReflection, type Affine, type Vec3 } from './affine';
import {
  carriedJoint, carriedLoad, carriedOffset, carriedOrientation, carriedSupport, type EditWarning,
} from './transform-fields';
import { fragmentOf, mapDefinitions, type EntitySet, type Fragment } from './fragment';

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
  /** Materials, sections and load cases the fragment brought that the model did not have. */
  added: { materials: number; sections: number; loadCases: number };
  warnings: Partial<Record<EditWarning, number>>;
}

export const DEFAULT_WELD = 1e-4;

/** A spatial hash for the weld: cells of the weld tolerance, neighbours checked. */
export class NodeIndex {
  private cells = new Map<string, number[]>();
  constructor(private tol: number) {}
  private key(x: number, y: number, z: number) {
    return `${Math.round(x / this.tol)},${Math.round(y / this.tol)},${Math.round(z / this.tol)}`;
  }
  add(id: number, p: Vec3) {
    const k = this.key(p[0], p[1], p[2]);
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(id);
  }
  find(p: Vec3, pos: (id: number) => Vec3 | undefined): number | null {
    const [cx, cy, cz] = [Math.round(p[0] / this.tol), Math.round(p[1] / this.tol), Math.round(p[2] / this.tol)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const id of this.cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        const q = pos(id);
        if (q && Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= this.tol) return id;
      }
    }
    return null;
  }
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
  const tol = opts.weldTol ?? DEFAULT_WELD;
  const leftHand = opts.leftHand ?? false;
  const report: EditReport = {
    nodes: [], elements: [], quads: [], plates: [], links: [], groups: [], welded: 0, duplicates: 0, supportKept: 0,
    added: { materials: 0, sections: 0, loadCases: 0 }, warnings: {},
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

    let prevNodeMap = new Map(frag.nodes.map((n) => [n.id, n.id]));
    const created = new Set<number>();
    transforms.forEach((T, k) => {
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
      for (const q of frag.quads) {
        const corners = q.nodes.map((n) => nodeMap.get(n)!) as Quad['nodes'];
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
        // A load on a welded node that is not a copy would be applied twice.
        const onNode = (c.load?.data as { nodeId?: number } | undefined)?.nodeId;
        if (c.load && (onNode === undefined || created.has(onNode))) modelStore.addLoadEntry(c.load);
      }

      for (const g of frag.groups) {
        const m = g.members;
        const members = {
          ...(m.nodes ? { nodes: m.nodes.map((id: number) => nodeMap.get(id)!) } : {}),
          ...(m.elements ? { elements: m.elements.map((id: number) => elementMap.get(id)).filter((x: number | undefined) => x !== undefined) } : {}),
          ...(m.quads ? { quads: m.quads.map((id: number) => quadMap.get(id)!) } : {}),
          ...(m.plates ? { plates: m.plates.map((id: number) => plateMap.get(id)!) } : {}),
        };
        if (g.data) warn('groupDataVerbatim');
        const name = frag.local || transforms.length > 1 ? `${g.name} (${k + 1})` : g.name;
        report.groups.push(modelStore.addGroup(name, g.kind, members, { origin: g.origin, ...(g.data ? { data: g.data } : {}) }));
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
      prevNodeMap = nodeMap;
    });
  });
  return report;
}
