/**
 * Copy a set of entities under one or more isometries — the operation behind repeat, polar
 * repeat, mirror and rotate-with-copy — as ONE undo step.
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
 * member's ends is that member already, and is not added twice.
 *
 * ── Link bars ─────────────────────────────────────────────────────
 *
 * Optionally, each copied node is joined to its predecessor in the sequence by a member — the
 * beams between repeated frames, the purlins of a polar array.
 */

import { modelStore } from '../../store/model.svelte';
import type { Element, Load, Quad, Plate } from '../../store/model.svelte';
import { applyPoint, applyVector, isReflection, type Affine, type Vec3 } from './affine';
import {
  carriedJoint, carriedLoad, carriedOffset, carriedOrientation, carriedSupport, type EditWarning,
} from './transform-fields';

export interface EntitySet {
  nodes: Iterable<number>;
  elements: Iterable<number>;
  quads?: Iterable<number>;
  plates?: Iterable<number>;
}

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
  warnings: Partial<Record<EditWarning, number>>;
}

const DEFAULT_WELD = 1e-4;

/** A spatial hash for the weld: cells of the weld tolerance, neighbours checked. */
class NodeIndex {
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

/** The nodes a set touches: its own, and every end and corner of its members and shells. */
export function closure(set: EntitySet): { nodes: Set<number>; elements: Set<number>; quads: Set<number>; plates: Set<number> } {
  const elements = new Set(set.elements), quads = new Set(set.quads ?? []), plates = new Set(set.plates ?? []);
  const nodes = new Set(set.nodes);
  for (const id of elements) { const e = modelStore.elements.get(id); if (e) { nodes.add(e.nodeI); nodes.add(e.nodeJ); } }
  for (const id of quads) modelStore.quads.get(id)?.nodes.forEach((n) => nodes.add(n));
  for (const id of plates) modelStore.plates.get(id)?.nodes.forEach((n) => nodes.add(n));
  return { nodes, elements, quads, plates };
}

/**
 * Add `transforms.length` copies of `set`, copy k under `transforms[k]`.
 *
 * With `link`, copy k's nodes are joined to copy k−1's (copy 0 to the originals).
 */
export function copyTransformed(set: EntitySet, transforms: readonly Affine[], opts: CopyOptions = {}): EditReport {
  const tol = opts.weldTol ?? DEFAULT_WELD;
  const leftHand = opts.leftHand ?? false;
  const src = closure(set);
  const report: EditReport = { nodes: [], elements: [], quads: [], plates: [], links: [], groups: [], welded: 0, duplicates: 0, warnings: {} };
  const warn = (w: EditWarning) => { report.warnings[w] = (report.warnings[w] ?? 0) + 1; };
  if (src.nodes.size === 0 || transforms.length === 0) return report;

  modelStore.bulkMutate(() => {
    const pos = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : undefined; };
    const index = new NodeIndex(tol);
    for (const n of modelStore.nodes.values()) index.add(n.id, [n.x, n.y, n.z ?? 0]);
    const pairs = new Set<string>();
    for (const e of modelStore.elements.values()) pairs.add(pairKey(e.nodeI, e.nodeJ));
    let nextArc = Math.max(0, ...[...modelStore.elements.values()].map((e) => e.arc?.id ?? 0)) + 1;

    // Snapshot the originals before anything is added, so later copies read the source, not
    // earlier copies.
    const nodes0 = new Map([...src.nodes].map((id) => [id, { ...modelStore.nodes.get(id)! }]));
    const elements0 = new Map([...src.elements].map((id) => [id, JSON.parse(JSON.stringify(modelStore.elements.get(id)!)) as Element]));
    const quads0 = new Map([...src.quads].map((id) => [id, JSON.parse(JSON.stringify(modelStore.quads.get(id)!)) as Quad]));
    const plates0 = new Map([...src.plates].map((id) => [id, JSON.parse(JSON.stringify(modelStore.plates.get(id)!)) as Plate]));
    const loads0: Load[] = JSON.parse(JSON.stringify(modelStore.loads));
    const supports0 = [...modelStore.supports.values()].filter((s) => src.nodes.has(s.nodeId)).map((s) => JSON.parse(JSON.stringify(s)));
    const groups0 = [...modelStore.model.groups.values()].filter((g) => {
      const m = g.members;
      const all = [...(m.nodes ?? []).map((id) => src.nodes.has(id)), ...(m.elements ?? []).map((id) => src.elements.has(id)),
        ...(m.quads ?? []).map((id) => src.quads.has(id)), ...(m.plates ?? []).map((id) => src.plates.has(id))];
      return all.length > 0 && all.every(Boolean);
    }).map((g) => JSON.parse(JSON.stringify(g)));

    let prevNodeMap = new Map([...src.nodes].map((id) => [id, id]));
    const created = new Set<number>();
    transforms.forEach((T, k) => {
      const nodeMap = new Map<number, number>();
      for (const [id, n] of nodes0) {
        const p = applyPoint(T, [n.x, n.y, n.z ?? 0]);
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
        const section = modelStore.sections.get(e.sectionId);
        const o = carriedOrientation(T, e, ni, nj, ni2, nj2, section, leftHand);
        if (!o.exact) warn('asymmetricProfile');
        signs.set(id, { sy: o.sy, sz: o.sz });
        const { id: _id, nodeI: _i, nodeJ: _j, localYx: _x, localYy: _y, localYz: _z, rollAngle: _r, jointI, jointJ, offset, arc, reinforcement: _rf, ...rest } = e;
        const patch: Partial<Element> = { ...rest, ...o.fields };
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
      const quadMap = new Map<number, number>();
      for (const [id, q] of quads0) {
        const corners = q.nodes.map((n) => nodeMap.get(n)!) as Quad['nodes'];
        const { id: _id, nodes: _n, offset, ...rest } = q;
        const nodes = (flip ? [corners[0], corners[3], corners[2], corners[1]] : corners) as Quad['nodes'];
        const off = offset && offset.frame === 'global'
          ? (() => { const w = applyVector(T, [offset.x, offset.y, offset.z]); return { frame: 'global' as const, x: w[0], y: w[1], z: w[2] }; })()
          : offset;
        const qid = modelStore.addShellEntry('quad', { ...rest, nodes, ...(off ? { offset: off } : {}) });
        quadMap.set(id, qid);
        report.quads.push(qid);
      }
      const plateMap = new Map<number, number>();
      for (const [id, p] of plates0) {
        const corners = p.nodes.map((n) => nodeMap.get(n)!) as Plate['nodes'];
        const { id: _id, nodes: _n, offset, ...rest } = p;
        const nodes = (flip ? [corners[0], corners[2], corners[1]] : corners) as Plate['nodes'];
        const off = offset && offset.frame === 'global'
          ? (() => { const w = applyVector(T, [offset.x, offset.y, offset.z]); return { frame: 'global' as const, x: w[0], y: w[1], z: w[2] }; })()
          : offset;
        const pid = modelStore.addShellEntry('plate', { ...rest, nodes, ...(off ? { offset: off } : {}) });
        plateMap.set(id, pid);
        report.plates.push(pid);
      }

      if (opts.withSupports) {
        for (const s of supports0) {
          const to = nodeMap.get(s.nodeId)!;
          // A welded node keeps whatever support it already has.
          if (!created.has(to)) continue;
          const c = carriedSupport(T, s, to, elementMap);
          if (c) modelStore.addSupportEntry(c); else warn('supportDropped');
        }
      }

      if (opts.withLoads) {
        const sig = (id: number) => signs.get(id) ?? { sy: 1 as const, sz: 1 as const };
        for (const l of loads0) {
          const c = carriedLoad(T, l, nodeMap, elementMap, quadMap, sig);
          if (!c) continue;
          if (c.warning) warn(c.warning);
          // A load on a welded node that is not a copy would be applied twice.
          const onNode = (c.load?.data as { nodeId?: number } | undefined)?.nodeId;
          if (c.load && (onNode === undefined || created.has(onNode))) modelStore.addLoadEntry(c.load);
        }
      }

      if (opts.withGroups !== false) {
        for (const g of groups0) {
          const m = g.members;
          const members = {
            ...(m.nodes ? { nodes: m.nodes.map((id: number) => nodeMap.get(id)!) } : {}),
            ...(m.elements ? { elements: m.elements.map((id: number) => elementMap.get(id)).filter((x: number | undefined) => x !== undefined) } : {}),
            ...(m.quads ? { quads: m.quads.map((id: number) => quadMap.get(id)!) } : {}),
            ...(m.plates ? { plates: m.plates.map((id: number) => plateMap.get(id)!) } : {}),
          };
          if (g.data) warn('groupDataVerbatim');
          report.groups.push(modelStore.addGroup(`${g.name} (${k + 1})`, g.kind, members, { origin: g.origin, ...(g.data ? { data: g.data } : {}) }));
        }
      }

      if (opts.link) {
        for (const [id] of nodes0) {
          const a = prevNodeMap.get(id)!, b = nodeMap.get(id)!;
          if (a === b || pairs.has(pairKey(a, b))) continue;
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
