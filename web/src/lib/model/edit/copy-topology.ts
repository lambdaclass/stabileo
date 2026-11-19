import type { Element, Node, Support } from '../../store/model.svelte';
import { isLocalPlaneRoller } from '../support-types';
import { applyPoint, type Affine, type Vec3 } from './affine';
import type { Fragment } from './fragment';
import { NodeIndex } from './node-index';
import { carriedPlaneRollerFrameChanged, planeRollerFrameChanged, planeRollerFrames, type MemberEnds } from './plane-roller-frames';
type Point = { x: number; y: number; z: number };

interface PlannedCopy {
  nodeMap: Map<number, number>;
  created: Map<number, Vec3>;
  members: number[];
  links: MemberEnds[];
}

interface CopyTopology {
  copies: PlannedCopy[];
  positions: Map<number, Point>;
  addedMembers: MemberEnds[];
  welded: number;
  duplicates: number;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function planCopyTopology(
  frag: Fragment, transforms: readonly Affine[], nodes: Iterable<Node>, elements: Iterable<Element>,
  tol: number, link: boolean,
): CopyTopology {
  const index = new NodeIndex(tol);
  const positions = new Map<number, Point>();
  for (const n of nodes) {
    index.add(n.id, [n.x, n.y, n.z ?? 0]);
    positions.set(n.id, { x: n.x, y: n.y, z: n.z ?? 0 });
  }
  const pos = (id: number): Vec3 | undefined => {
    const p = positions.get(id);
    return p ? [p.x, p.y, p.z] : undefined;
  };
  const pairs = new Set<string>();
  for (const e of elements) pairs.add(pairKey(e.nodeI, e.nodeJ));

  const addedMembers: MemberEnds[] = [];
  const addMember = (nodeI: number, nodeJ: number) => {
    const key = pairKey(nodeI, nodeJ);
    if (pairs.has(key)) return false;
    pairs.add(key);
    addedMembers.push({ nodeI, nodeJ });
    return true;
  };

  let nextPlannedId = -1;
  let welded = 0;
  let duplicates = 0;
  let previous = new Map(frag.nodes.filter(n => positions.has(n.id)).map(n => [n.id, n.id]));
  const copies = transforms.map(T => {
    const nodeMap = new Map<number, number>();
    const created = new Map<number, Vec3>();
    for (const n of frag.nodes) {
      const p = applyPoint(T, [n.x, n.y, n.z]);
      const hit = index.find(p, pos);
      if (hit !== null) {
        welded++;
        nodeMap.set(n.id, hit);
        continue;
      }
      while (positions.has(nextPlannedId)) nextPlannedId--;
      const id = nextPlannedId--;
      const [x, y, z] = p;
      positions.set(id, { x, y, z });
      index.add(id, p);
      nodeMap.set(n.id, id);
      created.set(id, p);
    }

    const members: number[] = [];
    for (const e of frag.elements) {
      const i = nodeMap.get(e.nodeI)!;
      const j = nodeMap.get(e.nodeJ)!;
      if (i === j) continue;
      if (addMember(i, j)) members.push(e.id);
      else duplicates++;
    }

    const links: MemberEnds[] = [];
    if (link) {
      for (const [source, to] of nodeMap) {
        const from = previous.get(source);
        if (from === undefined || from === to || !addMember(from, to)) continue;
        links.push({ nodeI: from, nodeJ: to });
      }
    }
    previous = nodeMap;
    return { nodeMap, created, members, links };
  });

  return { copies, positions, addedMembers, welded, duplicates };
}

export function changesPlaneRollerFrame(
  topology: CopyTopology, frag: Fragment, transforms: readonly Affine[], elements: ReadonlyMap<number, Element>,
  existingSupports: Iterable<Support>, carriedSupports: readonly Support[],
): boolean {
  const addedNodes = new Set(topology.addedMembers.flatMap(member => [member.nodeI, member.nodeJ]));
  const existingRollers = [...existingSupports].filter(s => addedNodes.has(s.nodeId) && isLocalPlaneRoller(s));
  const carriedRollers = carriedSupports.filter(isLocalPlaneRoller);
  if (existingRollers.length === 0 && carriedRollers.length === 0) return false;

  const finalFrame = planeRollerFrames(topology.positions, elements.values(), topology.addedMembers);
  if (existingRollers.length > 0) {
    const existingFrame = planeRollerFrames(topology.positions, elements.values());
    if (existingRollers.some(({ nodeId }) => planeRollerFrameChanged(existingFrame(nodeId), finalFrame(nodeId)))) return true;
  }

  if (carriedRollers.length === 0) return false;
  const sourceFrame = planeRollerFrames(new Map(frag.nodes.map(n => [n.id, n])), frag.elements);
  return topology.copies.some((copy, index) => {
    const T = transforms[index]!;
    const standalonePositions = new Map(frag.nodes.map(n => {
      const [x, y] = applyPoint(T, [n.x, n.y, n.z]);
      return [n.id, { x, y }];
    }));
    const standaloneFrame = planeRollerFrames(standalonePositions, frag.elements);
    return carriedRollers.some(({ nodeId }) => {
      const final = finalFrame(copy.nodeMap.get(nodeId)!);
      return planeRollerFrameChanged(standaloneFrame(nodeId), final)
        || carriedPlaneRollerFrameChanged(sourceFrame(nodeId), final, T);
    });
  });
}
